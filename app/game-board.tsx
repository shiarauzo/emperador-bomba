"use client";

import { useChannel } from "@portalsdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveGameState } from "@/lib/engine/derive";
import { isExpired } from "@/lib/engine/fuse";
import type { GameEventBody } from "@/lib/engine/types";
import type { SignalBody } from "@/lib/rtc/signal";
import { useAudioCall } from "@/lib/rtc/use-audio-call";
import { CATALOG, DEFAULT_MOVIE_ID } from "@/lib/movies";
import {
  channelIdFromLocation,
  toGameEvents,
  toSignals,
} from "@/lib/portal/channel";
import { useDrainedHistory } from "@/lib/portal/use-drained-history";
import { CallBar } from "./call-bar";
import { Lobby } from "./lobby";
import { Round } from "./round";

const TICK_MS = 200;

/**
 * Orquesta la partida: trae los mensajes del canal, los traduce a eventos,
 * deriva el estado y publica lo que el jugador hace.
 *
 * Nada de la lógica del juego vive acá. Este archivo cambia por razones de
 * transporte; las tres pantallas cambian por razones de interfaz.
 */
export function GameBoard() {
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Volver a la sala es una decisión de esta pantalla, no un hecho del canal:
  // la otra persona sigue mirando el resultado hasta que arranque la partida.
  const [backToLobby, setBackToLobby] = useState(false);
  // Se resuelve una vez, al montar. El servidor no ve la URL del navegador, así
  // que ahí queda `undefined` y `useChannel` no abre conexión.
  const [channelId] = useState(channelIdFromLocation);

  const {
    messages,
    send,
    presence,
    me,
    status,
    loadPrevious,
    hasPrevious,
    isLoadingPrevious,
  } = useChannel<GameEventBody | SignalBody>({
    channelId,
    history: 50,
    onError: (channelError) => setError(channelError.message),
  });

  const {
    drained,
    incomplete: historyIncomplete,
    error: historyError,
  } = useDrainedHistory({
    hasPrevious,
    isLoadingPrevious,
    loadPrevious,
    messages,
    // El servidor y la primera pasada del cliente comparten el mismo snapshot
    // inerte, en el que `status` es "idle". Atar esto al id del canal en cambio
    // rompía la hidratación: el id es `undefined` en el servidor y una cadena en
    // el cliente, así que cada lado renderizaba una pantalla distinta.
    enabled: status !== "idle",
  });

  const events = useMemo(() => toGameEvents(messages), [messages]);

  const signals = useMemo(() => toSignals(messages), [messages]);

  const state = useMemo(
    () => deriveGameState(events, now, CATALOG),
    [events, now],
  );

  /**
   * Publicar señalización no es una jugada.
   *
   * Compartía camino con las del juego, así que cada candidato ICE ponía el
   * botón en "…" y limpiaba el cartel de error que la persona estuviera leyendo.
   * Los fallos de señalización los reporta la barra de llamada, no la partida.
   */
  const publishSignal = useCallback(
    async (body: SignalBody) => {
      await send({ content: body });
    },
    [send],
  );

  const publish = useCallback(
    async (body: GameEventBody) => {
      setPending(true);
      setError(null);
      try {
        await send({ content: body });
      } catch (sendError) {
        setError(
          sendError instanceof Error ? sendError.message : "No se pudo enviar",
        );
      } finally {
        setPending(false);
      }
    },
    [send],
  );

  // El ticker lee el último estado por referencia en vez de recalcularlo: así se
  // hace un solo fold del historial por render, y no dos por tick.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  // La mecha avanza sin que llegue nada: el estado sólo cambia porque cambió
  // `now`. La explosión se publica desde acá porque el vencimiento es un hecho
  // del reloj, y este es el lugar donde el reloj avanza.
  //
  // Las dos pantallas la detectan casi a la vez y las dos publican. Eso está
  // previsto: la primera por `seq` abre la mecha nueva y la segunda se evalúa
  // contra ella, todavía fresca, así que el motor la descarta sola.
  //
  // Lo que sí hay que evitar es republicarla en cada tick. La explosión propia
  // viaja sin confirmar, el adaptador la deja afuera hasta el ack, y mientras
  // tanto la mecha sigue leyéndose vencida: sin esta marca se publicaría una
  // explosión cada 200 ms durante todo el viaje de ida y vuelta.
  const boomedFuse = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);

      const current = latest.current;
      if (current.phase !== "playing" || !current.fuse) return;
      if (!isExpired(current.fuse.openedAt, current.fuse.duration, at)) return;
      if (boomedFuse.current === current.fuse.openedAt) return;

      boomedFuse.current = current.fuse.openedAt;
      void publish({ kind: "boom" });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [publish]);

  // En partida el rival es el otro jugador. En la sala todavía no hay partida,
  // así que es a quien elegiste — y ahí es cuando más falta hace hablar, para
  // ponerse de acuerdo en empezar.
  const [chosenPeer, setChosenPeer] = useState<string | null>(null);
  const peerId =
    state.players.find((player) => player !== me?.id) ?? chosenPeer ?? undefined;
  const call = useAudioCall({
    meId: me?.id,
    peerId,
    signals,
    publish: publishSignal,
  });

  // El modo de presencia lo decide el servidor. En canales grandes devuelve sólo
  // un conteo, sin identidades — y sin identidades no se puede elegir rival.
  const roster = presence?.kind === "detailed" ? presence : undefined;
  const presenceCount = presence?.count;
  const movie = state.movieId ? CATALOG[state.movieId] : null;

  const shown = error ?? historyError;
  const banner = (
    <>
      {shown && (
        <p className="mx-auto max-w-xl rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {shown}
        </p>
      )}
      {historyIncomplete && (
        // Con historial faltante lo que se ve puede no ser la partida real. Se
        // muestra igual — colgarse cargando sería peor — pero se dice.
        <p className="mx-auto max-w-xl rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          No se pudo traer el historial completo. Lo que ves puede no coincidir
          con la otra pantalla.
        </p>
      )}
    </>
  );

  // Nada de juego hasta tener el historial completo. Derivar sobre un backfill
  // parcial no da una partida incompleta: da otra partida. Quien entrara tarde
  // vería la sala de espera mientras el otro juega, o un marcador que no existe.
  if (!drained) {
    return (
      <div className="m-auto flex flex-col items-center gap-2 p-6 text-center">
        {banner}
        <p className="font-mono text-sm text-neutral-500">
          {status === "blocked"
            ? "El canal rechazó la conexión."
            : "Trayendo la partida…"}
        </p>
      </div>
    );
  }

  if (state.phase === "waiting" || (state.phase === "over" && backToLobby)) {
    return (
      <div className="flex flex-1 flex-col">
        {banner}
        {peerId && (
          <div className="mx-auto w-full max-w-sm px-6 pt-6">
            <CallBar call={call} />
          </div>
        )}
        <Lobby
          onChooseOpponent={setChosenPeer}
          status={status}
          roster={roster}
          presenceCount={presenceCount}
          meId={me?.id}
          onStart={(players) =>
            void publish({
              kind: "start",
              movieId: DEFAULT_MOVIE_ID,
              players,
            })
          }
        />
      </div>
    );
  }

  if (state.phase === "over") {
    // Sólo se puede decir "ganaste" o "perdiste" a quien jugó. Sin identidad
    // todavía, o mirando una partida ajena, se nombra al ganador y listo:
    // afirmar mal el resultado es peor que no afirmarlo.
    const played = me !== undefined && state.players.includes(me.id);
    const outcome = !played
      ? `Ganó ${state.winner?.slice(-6) ?? "nadie"}`
      : state.winner === me.id
        ? "Ganaste"
        : "Perdiste";

    return (
      <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center">
        {banner}
        {/* La explosión que termina la partida no la ve la pantalla de juego:
            esa ya se desmontó. Se anima acá, que es donde aterriza. */}
        <span aria-hidden className="bomb-blast text-5xl">
          💥
        </span>
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          {outcome}
        </h1>
        <p className="text-sm text-neutral-500">
          {state.said.length} frases en {state.round} rondas.
        </p>
        {/* El tablero completo es del ticket del final de partida. Volver a la
            sala está acá porque sin salida el canal queda terminal para todos.
            Y se vuelve a la sala en vez de repetir los mismos jugadores: la
            identidad anónima puede haber rotado, y rearmar la partida con los
            ids viejos la dejaría entre dos ausentes. */}
        <button
          type="button"
          onClick={() => setBackToLobby(true)}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Otra partida
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {banner}
      <div className="mx-auto w-full max-w-xl px-6 pt-6">
        <CallBar call={call} />
      </div>
      <Round
        state={state}
        movie={movie}
        meId={me?.id}
        pending={pending}
        onSay={(text) => void publish({ kind: "say", text })}
      />
    </div>
  );
}
