"use client";

import { useState } from "react";
import type { GameState, Movie, SaidQuote } from "@/lib/engine/types";
import { useSpeech } from "@/lib/speech/use-speech";
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
  pending,
  onSay,
}: {
  state: GameState;
  movie: Movie | null;
  meId: string | undefined;
  pending: boolean;
  onSay: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  // Apagado por omisión, igual que la llamada. Encenderlo solo abriría el
  // micrófono —con su pedido de permiso— apenas te toca el turno, sin que nadie
  // lo haya pedido en esta pantalla.
  const [voiceOn, setVoiceOn] = useState(false);

  const myTurn = state.turnOf === meId;

  // Se escucha sólo en tu turno. Fuera de turno el motor descarta igual, y con
  // la llamada abierta el micrófono está captando todo el tiempo: publicar cada
  // cosa que se dice llenaría el canal y dejaría la conversación entera guardada.
  const speech = useSpeech({
    enabled: voiceOn && myTurn,
    onPhrase: onSay,
  });
  const lastSaid = state.said.at(-1) ?? null;
  // Cada ronda cerrada fue una explosión. La que termina la partida no cuenta
  // acá: no incrementa la ronda y además desmonta esta pantalla, así que la
  // anima el final de partida.
  const explosions = state.round - 1;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-base font-semibold tracking-tight">
          {movie?.title}
        </h1>
        {/* Sólo el número de ronda. El contador de segundos que había acá, junto
            a la marca de la zona de peligro, dejaba calcular al segundo cuánto
            faltaba para que la explosión fuera posible. La barra da la misma
            sensación sin dar el número. */}
        <span className="font-mono text-sm tabular-nums text-neutral-500">
          ronda {state.round}
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

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setVoiceOn((on) => !on)}
          disabled={speech.state === "unsupported" || speech.state === "denied"}
          className="rounded-md border border-black/10 px-3 py-1 disabled:opacity-40 dark:border-white/15"
        >
          {voiceOn ? "Apagar micrófono" : "Encender micrófono"}
        </button>
        <span className="text-neutral-500">
          {speech.state === "unsupported"
            ? "Sin reconocimiento de voz en este navegador"
            : speech.state === "denied"
              ? "Micrófono denegado"
              : speech.state === "listening"
                ? "Escuchando…"
                : myTurn
                  ? "Micrófono apagado"
                  : "Te toca esperar"}
        </span>
        {speech.error && (
          <span className="text-amber-700 dark:text-amber-400">
            {speech.error}
          </span>
        )}
      </div>

      {/* Lo que el micrófono está entendiendo ahora. Verlo es lo que permite
          darse cuenta de que escuchó mal, en vez de creer que el juego falla. */}
      <p className="min-h-6 font-mono text-xs text-neutral-500">
        {speech.interim ||
          (speech.heard && `oí: “${speech.heard}”`) ||
          (speech.state === "listening" ? "…" : "")}
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
