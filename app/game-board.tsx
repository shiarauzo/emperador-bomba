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
  // Las dos pantallas la detectan casi a la vez y las dos publican. No hay que
  // evitarlo: la primera por `seq` abre la mecha nueva y la segunda se evalúa
  // contra ella, todavía fresca, así que el motor la descarta sola.
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);

      const current = latest.current;
      if (current.phase !== "playing" || !current.fuse) return;
      if (!isExpired(current.fuse.openedAt, current.fuse.duration, at)) return;
      void publish({ kind: "boom" });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [publish]);

  const roster = presence?.kind === "detailed" ? presence : undefined;
  const movie = state.movieId ? CATALOG[state.movieId] : null;

  const banner = error ? (
    <p className="mx-auto max-w-xl rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
      {error}
    </p>
  ) : null;

  if (state.phase === "waiting") {
    return (
      <div className="flex flex-1 flex-col">
        {banner}
        <Lobby
          status={status}
          roster={roster}
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
    const iWon = state.winner === me?.id;
    return (
      <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center">
        {banner}
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          {iWon ? "Ganaste" : "Perdiste"}
        </h1>
        <p className="text-sm text-neutral-500">
          {state.said.length} frases en {state.round} rondas.
        </p>
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
