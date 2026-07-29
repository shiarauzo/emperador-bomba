"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveGameState } from "@/lib/engine/derive";
import type { GameEvent, GameEventBody } from "@/lib/engine/types";
import { CATALOG, DEFAULT_MOVIE_ID } from "@/lib/movies";

/**
 * Superficie de la slice V1: la partida completa, jugada escribiendo.
 *
 * Los eventos viven en memoria pero tienen exactamente la forma que tendrán
 * cuando vengan del canal — id, seq y timestamp incluidos — así que al cablear
 * Portal el motor no se entera del cambio.
 */

const PLAYERS = ["ana", "beto"] as const;

/**
 * Fabrica un evento con la forma que tendrá cuando venga del canal. `seq` sale de
 * la longitud del historial, que es lo que hace de servidor mientras no lo haya.
 */
function localEvent(
  previous: readonly GameEvent[],
  playerId: string,
  body: GameEventBody,
  timestamp: number,
): GameEvent {
  return {
    id: `local-${previous.length + 1}`,
    seq: previous.length + 1,
    timestamp,
    playerId,
    body,
  };
}

export function GameBoard() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState("");
  const [speaker, setSpeaker] = useState<string>(PLAYERS[0]);

  // La mecha avanza sin que llegue nada: el estado sólo cambia porque cambió
  // `now`. Sin este ticker la bomba se vería congelada hasta el próximo mensaje.
  //
  // La explosión se publica desde acá y no desde un efecto sobre el estado
  // derivado: el vencimiento es un hecho del reloj, así que pertenece al lugar
  // donde el reloj avanza.
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setEvents((previous) => {
        const current = deriveGameState(previous, at, CATALOG);
        if (current.phase !== "playing" || !current.fuse?.expired) return previous;
        return [...previous, localEvent(previous, current.turnOf as string, { kind: "boom" }, at)];
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const state = useMemo(
    () => deriveGameState(events, now, CATALOG),
    [events, now],
  );

  const publish = useCallback((playerId: string, body: GameEventBody) => {
    setEvents((previous) => [
      ...previous,
      localEvent(previous, playerId, body, Date.now()),
    ]);
  }, []);

  const movie = state.movieId ? CATALOG[state.movieId] : null;
  const remaining = state.fuse
    ? Math.max(0, state.fuse.openedAt + state.fuse.duration - now)
    : 0;

  if (state.phase === "waiting") {
    return (
      <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">
            {CATALOG[DEFAULT_MOVIE_ID].title} — bomba
          </h1>
          <p className="text-sm text-neutral-500">
            Por turnos, decí una frase de la película. Acertar pasa la bomba.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            publish(PLAYERS[0], {
              kind: "start",
              movieId: DEFAULT_MOVIE_ID,
              players: [...PLAYERS],
            })
          }
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Empezar partida
        </button>
      </div>
    );
  }

  if (state.phase === "over") {
    return (
      <div className="m-auto flex w-full max-w-md flex-col gap-4 p-6">
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          Ganó {state.winner}
        </h1>
        <ul className="flex flex-col gap-1 text-sm">
          {state.said.map((entry, index) => (
            <li key={`${entry.quoteId}-${index}`} className="flex gap-2">
              <span className="text-neutral-500">{entry.playerId}</span>
              <span>{movie?.quotes.find((q) => q.id === entry.quoteId)?.text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setEvents([])}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Jugar otra vez
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-base font-semibold tracking-tight">
          {movie?.title}
        </h1>
        <span className="font-mono text-sm tabular-nums text-neutral-500">
          ronda {state.round} · {(remaining / 1000).toFixed(1)}s
        </span>
      </header>

      <ul className="flex gap-3">
        {state.players.map((player) => (
          <li
            key={player}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              player === state.turnOf
                ? "border-foreground"
                : "border-black/10 text-neutral-500 dark:border-white/15"
            }`}
          >
            <div className="font-medium">
              {player}
              {player === state.turnOf && " · su turno"}
            </div>
            <div className="text-xs">
              {"♥".repeat(state.lives[player])} · {state.score[player]} frases
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          publish(speaker, { kind: "say", text });
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2">
          {state.players.map((player) => (
            <button
              key={player}
              type="button"
              onClick={() => setSpeaker(player)}
              className={`rounded-lg border px-3 py-1 text-xs ${
                speaker === player
                  ? "border-foreground"
                  : "border-black/10 text-neutral-500 dark:border-white/15"
              }`}
            >
              hablar como {player}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(change) => setDraft(change.target.value)}
            placeholder="Decí una frase de la película"
            className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Decir
          </button>
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">
          Dichas ({state.said.length})
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {state.said.map((entry, index) => (
            <li key={`${entry.quoteId}-${index}`} className="flex gap-2">
              <span className="text-neutral-500">{entry.playerId}</span>
              <span>{movie?.quotes.find((q) => q.id === entry.quoteId)?.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
