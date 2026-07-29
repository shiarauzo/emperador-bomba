"use client";

import { useChannel } from "@portalsdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveGameState } from "@/lib/engine/derive";
import { isExpired } from "@/lib/engine/fuse";
import type { GameEventBody } from "@/lib/engine/types";
import { CATALOG, DEFAULT_MOVIE_ID } from "@/lib/movies";
import { CHANNEL_ID, toGameEvents } from "@/lib/portal/channel";
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

  const { messages, send, presence, me, status } = useChannel<GameEventBody>({
    channelId: CHANNEL_ID,
    history: 50,
    onError: (channelError) => setError(channelError.message),
  });

  const events = useMemo(() => toGameEvents(messages), [messages]);
  const state = useMemo(
    () => deriveGameState(events, now, CATALOG),
    [events, now],
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

  // El modo de presencia lo decide el servidor. En canales grandes devuelve sólo
  // un conteo, sin identidades — y sin identidades no se puede elegir rival.
  const roster = presence?.kind === "detailed" ? presence : undefined;
  const presenceCount = presence?.count;
  const movie = state.movieId ? CATALOG[state.movieId] : null;

  const banner = error ? (
    <p className="mx-auto max-w-xl rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
      {error}
    </p>
  ) : null;

  if (state.phase === "waiting" || (state.phase === "over" && backToLobby)) {
    return (
      <div className="flex flex-1 flex-col">
        {banner}
        <Lobby
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
      <Round
        state={state}
        movie={movie}
        meId={me?.id}
        now={now}
        pending={pending}
        onSay={(text) => void publish({ kind: "say", text })}
      />
    </div>
  );
}
