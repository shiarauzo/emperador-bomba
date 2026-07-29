"use client";

import { useEffect, useRef } from "react";
import { FUSE_MAX_MS, FUSE_MIN_MS } from "@/lib/engine/fuse";
import type { Fuse } from "@/lib/engine/types";

/** Hasta este punto de la barra no puede explotar nunca. */
const DANGER_MARK = (FUSE_MIN_MS / FUSE_MAX_MS) * 100;

/**
 * La mecha.
 *
 * Avanza sobre una escala fija de `FUSE_MAX_MS`, no sobre la duración de esta
 * ronda. Esa distinción es el juego entero: se ve venir el peligro sin saber en
 * qué punto va a reventar. La duración real es un punto al azar entre el mínimo
 * y el máximo, y no aparece en ningún lado.
 *
 * La marca del mínimo sí se muestra: hasta ahí no puede explotar nunca, y saberlo
 * hace que la tensión suba justo cuando corresponde. No revela cuándo termina
 * esta mecha, sólo desde cuándo es posible.
 *
 * La animación la corre el navegador, no React. El ticker va a 200 ms y eso se
 * vería a saltos; acá se arma una vez por ronda con un retraso negativo igual a
 * lo que ya lleva ardiendo, así que las dos pantallas quedan en la misma
 * posición por calcularlo contra la misma marca de tiempo del servidor.
 */
export function Bomb({
  fuse,
  explosions,
}: {
  fuse: Fuse;
  /** Cuántas veces reventó en esta partida; repone la animación del estallido. */
  explosions: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const bombRef = useRef<HTMLSpanElement>(null);

  // El reloj se lee en un efecto, no durante el render: leerlo al renderizar
  // daría un valor distinto en cada re-render y la animación saltaría.
  useEffect(() => {
    const elapsed = Math.max(0, Date.now() - fuse.openedAt);

    const bar = barRef.current;
    if (bar) {
      bar.style.animation = `fuse-burn ${FUSE_MAX_MS}ms linear ${-elapsed}ms forwards`;
    }

    const bomb = bombRef.current;
    if (bomb) {
      // La sacudida empieza recién al entrar en la zona en la que ya puede
      // reventar; antes de eso no hay nada que temer y sería ruido.
      const untilDanger = Math.max(0, FUSE_MIN_MS - elapsed);
      bomb.style.animation = `bomb-tense 220ms steps(2, end) ${untilDanger}ms infinite`;
    }
  }, [fuse.openedAt]);

  return (
    <div className="relative flex items-center gap-3">
      <span
        ref={bombRef}
        aria-hidden
        className="bomb-tense text-2xl leading-none"
      >
        💣
      </span>

      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
        role="progressbar"
        aria-label="Mecha ardiendo"
        aria-valuetext="La duración es desconocida"
      >
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-amber-500" />
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-black/40 dark:bg-white/50"
          style={{ left: `${DANGER_MARK}%` }}
        />
      </div>

      {explosions > 0 && (
        <span
          // Al cambiar la clave React remonta el nodo y la animación se repite.
          key={explosions}
          aria-hidden
          className="bomb-blast pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-3xl"
        >
          💥
        </span>
      )}
    </div>
  );
}
