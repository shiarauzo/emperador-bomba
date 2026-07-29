"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
 * La marca del mínimo sí se muestra: hasta ahí no puede explotar nunca. Da
 * referencia sin dar precisión — se estima a ojo, no se lee un número.
 *
 * La animación la corre el navegador, no React: el ticker va a 200 ms y eso se
 * vería a saltos. Se arma una vez por ronda con un retraso negativo igual a lo
 * que ya lleva ardiendo.
 *
 * Las dos pantallas coinciden porque parten del mismo `openedAt` del servidor,
 * pero cada una mide el transcurrido con su propio reloj: si los relojes están
 * desfasados, las barras se corren en la misma medida. El motor no depende de
 * esto — la explosión la decide el `timestamp` del mensaje, no la barra.
 */
export function Bomb({
  fuse,
  explosions,
}: {
  fuse: Fuse;
  /** Cuántas veces reventó en esta partida. */
  explosions: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const bombRef = useRef<HTMLSpanElement>(null);

  // Cuántas explosiones había al montar. Sin esto, recargar a mitad de partida
  // reproduciría el estallido de una explosión que ya había ocurrido.
  const [atMount] = useState(explosions);
  const justExploded = explosions > atMount;

  // Layout effect y no effect común: el efecto normal corre después de pintar,
  // así que el primer frame mostraría la barra en la posición equivocada.
  useLayoutEffect(() => {
    const elapsed = Math.max(0, Date.now() - fuse.openedAt);

    const bar = barRef.current;
    if (bar) {
      bar.style.animation = `fuse-burn ${FUSE_MAX_MS}ms linear ${-elapsed}ms forwards`;
    }

    const bomb = bombRef.current;
    if (bomb) {
      // La sacudida empieza al entrar en la zona en la que ya puede reventar;
      // antes de eso no hay nada que temer y sería ruido.
      const untilDanger = Math.max(0, FUSE_MIN_MS - elapsed);
      bomb.style.animation = `bomb-tense 220ms steps(2, end) ${untilDanger}ms infinite`;
    }
  }, [fuse.openedAt]);

  return (
    <div className="relative flex items-center gap-3">
      {/* `bomb-tense` no aporta estilo: existe para que la regla de movimiento
          reducido tenga a qué aplicarle su `!important` y gane a la animación
          inline. Sin la clase, el override no apunta a nada. */}
      <span
        ref={bombRef}
        aria-hidden
        className="bomb-tense text-2xl leading-none"
      >
        💣
      </span>

      <div
        aria-hidden
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
      >
        {/*
          El estado inicial va inline y no con `scale-x-0`: en Tailwind v4 esa
          utilidad emite la propiedad `scale`, que se compone multiplicativamente
          con `transform`. La animación anima `transform`, así que multiplicada
          por scale 0 daba una barra de cero píxeles — visible en el DOM,
          invisible en pantalla.
        */}
        <div
          ref={barRef}
          data-testid="fuse-bar"
          className="h-full origin-left bg-amber-500"
          style={{ transform: "scaleX(0)" }}
        />
        <span
          className="absolute top-0 h-full w-px bg-black/40 dark:bg-white/50"
          style={{ left: `${DANGER_MARK}%` }}
        />
      </div>

      {justExploded && (
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
