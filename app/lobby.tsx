"use client";

import type { ChannelStatus, DetailedPresence } from "@portalsdk/core";
import { useState } from "react";
import { CATALOG, DEFAULT_MOVIE_ID } from "@/lib/movies";

const STATUS_LABEL: Record<ChannelStatus, string> = {
  idle: "sin conectar",
  connecting: "conectando…",
  ready: "conectado",
  reconnecting: "reconectando…",
  degraded: "conexión degradada",
  "degraded-http": "sólo por HTTP",
  blocked: "conexión rechazada",
};

/**
 * Sala de espera.
 *
 * El roster no define quién juega: quien arranca elige rival. Medido contra el
 * canal real, la presencia acumuló participantes desconectados durante más de
 * noventa segundos sin soltarlos, y una partida arrancada contra un ausente es
 * una partida perdida de antemano — el turno le pasa, no habla nunca, y la
 * bomba explota siempre del mismo lado.
 *
 * Elegir a mano convierte un roster sucio en un inconveniente en vez de en un
 * juego roto, y el orden de turno sigue viajando en el mensaje de apertura.
 */
export function Lobby({
  status,
  roster,
  meId,
  onStart,
}: {
  status: ChannelStatus;
  roster: DetailedPresence | undefined;
  meId: string | undefined;
  onStart: (players: string[]) => void;
}) {
  const [opponent, setOpponent] = useState<string | null>(null);

  const others = (roster?.participants ?? [])
    .map((participant) => participant.id)
    .filter((id) => id !== meId);

  const ready = status === "ready" && meId !== undefined && opponent !== null;

  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <div>
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          {CATALOG[DEFAULT_MOVIE_ID].title} — bomba
        </h1>
        <p className="text-sm text-neutral-500">
          Por turnos, decí una frase de la película. Acertar pasa la bomba.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          {STATUS_LABEL[status]}
          {meId && ` · sos ${meId.slice(-6)}`}
        </span>

        {others.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nadie más en la sala. Abrí el juego en otro navegador.
          </p>
        ) : (
          <>
            <span className="text-xs text-neutral-500">Elegí contra quién:</span>
            <ul className="flex flex-wrap gap-2">
              {others.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setOpponent(id)}
                    className={`rounded-lg border px-3 py-1 font-mono text-xs ${
                      opponent === id
                        ? "border-foreground"
                        : "border-black/10 text-neutral-500 dark:border-white/15"
                    }`}
                  >
                    {id.slice(-6)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          if (!meId || !opponent) return;
          // El orden se fija acá y viaja en el mensaje: las dos pantallas
          // coinciden en quién empieza sin negociar nada.
          onStart([meId, opponent]);
        }}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
      >
        {opponent ? "Empezar partida" : "Elegí rival"}
      </button>
    </div>
  );
}
