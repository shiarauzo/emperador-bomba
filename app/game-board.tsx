"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveGameState } from "@/lib/engine/derive";
import { isExpired } from "@/lib/engine/fuse";
import type {
  GameEvent,
  GameEventBody,
  Movie,
  SaidQuote,
} from "@/lib/engine/types";
import { CATALOG, DEFAULT_MOVIE_ID } from "@/lib/movies";

/**
 * Superficie de la slice V1: la partida completa, jugada escribiendo.
 *
 * Los eventos viven en memoria pero tienen exactamente la forma que tendrán
 * cuando vengan del canal — id, seq y timestamp incluidos — así que al cablear
 * Portal el motor no se entera del cambio.
 */

const PLAYERS = ["ana", "beto"] as const;
const TICK_MS = 200;

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

function quoteText(movie: Movie | null, quoteId: string): string {
  return movie?.quotes.find((quote) => quote.id === quoteId)?.text ?? quoteId;
}

function SaidList({ said, movie }: { said: SaidQuote[]; movie: Movie | null }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {said.map((entry, index) => (
        <li key={`${entry.quoteId}-${index}`} className="flex gap-2">
          <span className="shrink-0 text-neutral-500">{entry.playerId}</span>
          <span>{quoteText(movie, entry.quoteId)}</span>
        </li>
      ))}
    </ul>
  );
}

export function GameBoard() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState("");
  const [speaker, setSpeaker] = useState<string>(PLAYERS[0]);

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

  // El ticker lee el último estado por referencia en vez de recalcularlo: así se
  // hace un solo fold del historial por render, y no dos por tick.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  // La mecha avanza sin que llegue nada: el estado sólo cambia porque cambió
  // `now`. La explosión se publica desde acá y no desde un efecto sobre el estado
  // derivado, porque el vencimiento es un hecho del reloj y este es el lugar
  // donde el reloj avanza. Si por un tick se publicara dos veces, el motor
  // descarta la segunda: se evalúa contra la mecha nueva, que está fresca.
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);

      const current = latest.current;
      if (current.phase !== "playing" || !current.fuse) return;
      if (!isExpired(current.fuse.openedAt, current.fuse.duration, at)) return;
      publish(current.turnOf as string, { kind: "boom" });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [publish]);

  const movie = state.movieId ? CATALOG[state.movieId] : null;
  const lastSaid = state.said.at(-1) ?? null;

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
      <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center">
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          Ganó {state.winner}
        </h1>
        <p className="text-sm text-neutral-500">
          {state.said.length} frases en {state.round} rondas.
        </p>
        <button
          type="button"
          onClick={() => setEvents([])}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Otra partida
        </button>
      </div>
    );
  }

  const elapsed = state.fuse ? Math.max(0, now - state.fuse.openedAt) : 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-base font-semibold tracking-tight">
          {movie?.title}
        </h1>
        {/* Tiempo transcurrido, nunca el restante: la duración de la mecha es
            oculta por diseño y mostrar la cuenta atrás la revelaría. */}
        <span className="font-mono text-sm tabular-nums text-neutral-500">
          ronda {state.round} · {Math.floor(elapsed / 1000)}s ardiendo
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

      <p className="min-h-10 rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
        {lastSaid ? (
          <>
            <span className="text-neutral-500">{lastSaid.playerId} dijo </span>
            <span className="italic">“{lastSaid.text}”</span>
            <span className="text-neutral-500"> → </span>
            {quoteText(movie, lastSaid.quoteId)}
          </>
        ) : (
          <span className="text-neutral-500">Todavía nadie acertó.</span>
        )}
      </p>

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
        <SaidList said={state.said} movie={movie} />
      </section>
    </div>
  );
}
