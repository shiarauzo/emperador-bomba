"use client";

import { useState } from "react";
import type { GameState, Movie, SaidQuote } from "@/lib/engine/types";
import { Bomb } from "./bomb";

function quoteText(movie: Movie | null, quoteId: string): string {
  return movie?.quotes.find((quote) => quote.id === quoteId)?.text ?? quoteId;
}

function label(playerId: string, meId: string | undefined): string {
  return playerId === meId ? "vos" : playerId.slice(-6);
}

function SaidList({
  said,
  movie,
  meId,
}: {
  said: SaidQuote[];
  movie: Movie | null;
  meId: string | undefined;
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {said.map((entry, index) => (
        <li key={`${entry.quoteId}-${index}`} className="flex gap-2">
          <span className="shrink-0 font-mono text-xs text-neutral-500">
            {label(entry.playerId, meId)}
          </span>
          <span>{quoteText(movie, entry.quoteId)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Round({
  state,
  movie,
  meId,
  now,
  pending,
  onSay,
}: {
  state: GameState;
  movie: Movie | null;
  meId: string | undefined;
  now: number;
  pending: boolean;
  onSay: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const myTurn = state.turnOf === meId;
  const lastSaid = state.said.at(-1) ?? null;
  const elapsed = state.fuse ? Math.max(0, now - state.fuse.openedAt) : 0;
  // Cada ronda cerrada fue una explosión, más la que terminó la partida.
  const explosions = state.round - 1;

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

      {state.fuse && <Bomb fuse={state.fuse} explosions={explosions} />}

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
            <div className="font-mono text-xs font-medium">
              {label(player, meId)}
              {player === state.turnOf && " · su turno"}
            </div>
            <div className="text-xs">
              {"♥".repeat(state.lives[player] ?? 0)} · {state.score[player] ?? 0}{" "}
              frases
            </div>
          </li>
        ))}
      </ul>

      <p className="min-h-10 rounded-lg bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
        {lastSaid ? (
          <>
            <span className="font-mono text-xs text-neutral-500">
              {label(lastSaid.playerId, meId)} dijo{" "}
            </span>
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
          onSay(text);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(change) => setDraft(change.target.value)}
          placeholder={
            myTurn ? "Decí una frase de la película" : "Esperá tu turno"
          }
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        {/* Fuera de turno el motor descarta la frase en silencio. Bloquear el
            envío hace visible la regla en vez de tragarse lo que escribiste. */}
        <button
          type="submit"
          disabled={!draft.trim() || !myTurn}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          {pending ? "…" : "Decir"}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">
          Dichas ({state.said.length})
        </h2>
        <SaidList said={state.said} movie={movie} meId={meId} />
      </section>
    </div>
  );
}
