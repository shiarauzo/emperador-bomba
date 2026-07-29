"use client";

import type { CallResult, CallStatus } from "@/lib/rtc/use-audio-call";

const LABEL: Record<CallStatus, string> = {
  idle: "Sin llamada",
  "asking-mic": "Pidiendo micrófono…",
  "mic-denied": "Micrófono denegado",
  connecting: "Conectando la voz…",
  connected: "En llamada",
  failed: "No se pudo conectar",
  ended: "Llamada terminada",
};

const DOT: Record<CallStatus, string> = {
  idle: "bg-neutral-500",
  "asking-mic": "bg-amber-500 animate-pulse",
  "mic-denied": "bg-red-500",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500",
  failed: "bg-red-500",
  ended: "bg-neutral-500",
};

export function CallBar({ call }: { call: CallResult }) {
  const { status, muted, error, join, leave, toggleMute } = call;
  const live = status === "connected" || status === "connecting";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/15">
      <span className="inline-flex items-center gap-2">
        <span className={`size-2 rounded-full ${DOT[status]}`} />
        {LABEL[status]}
      </span>

      {!live && (
        <button
          type="button"
          onClick={join}
          className="rounded-md bg-foreground px-3 py-1 font-medium text-background"
        >
          {status === "idle" ? "Entrar a la llamada" : "Reintentar"}
        </button>
      )}

      {live && (
        <>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-md border border-black/10 px-3 py-1 dark:border-white/15"
          >
            {muted ? "Activar micrófono" : "Silenciar"}
          </button>
          <button
            type="button"
            onClick={leave}
            className="rounded-md border border-black/10 px-3 py-1 dark:border-white/15"
          >
            Colgar
          </button>
        </>
      )}

      {error && (
        <span className="text-amber-700 dark:text-amber-400">{error}</span>
      )}
    </div>
  );
}
