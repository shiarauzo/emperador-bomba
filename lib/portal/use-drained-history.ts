"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tope de páginas. A 50 mensajes por página son 5000 mensajes: muy por encima de
 * cualquier partida, y suficientemente bajo como para que un canal que nunca
 * declare su principio no pida páginas para siempre.
 */
const MAX_PAGES = 100;

export interface DrainConditions {
  enabled: boolean;
  gaveUp: boolean;
  hasPrevious: boolean;
  isLoadingPrevious: boolean;
  pagesRequested: number;
}

export type DrainStep = "idle" | "load" | "give-up" | "done";

/**
 * Qué hacer a continuación. Aparte del hook a propósito: acá vivió un bug que
 * ningún test de interfaz habría visto — al llegar al tope se dejaba de pedir
 * páginas sin marcar nada, así que `hasPrevious` quedaba en `true` y la pantalla
 * se colgaba cargando para siempre. Justo lo contrario de lo que el tope existía
 * para evitar.
 */
export function nextDrainStep({
  enabled,
  gaveUp,
  hasPrevious,
  isLoadingPrevious,
  pagesRequested,
}: DrainConditions): DrainStep {
  if (!enabled) return "idle";
  if (gaveUp) return "done";
  if (!hasPrevious) return "done";
  // `loadPrevious` devuelve la promesa en vuelo si ya hay una: pedir otra vez
  // gastaría presupuesto sin traer nada.
  if (isLoadingPrevious) return "idle";
  if (pagesRequested >= MAX_PAGES) return "give-up";
  return "load";
}

interface DrainInput {
  hasPrevious: boolean;
  isLoadingPrevious: boolean;
  loadPrevious: () => Promise<boolean>;
  /** Sólo se usa como señal de que el store cambió. */
  messages: readonly unknown[];
  /** Falso mientras no haya canal — durante el render en servidor, por ejemplo. */
  enabled: boolean;
}

export interface DrainResult {
  /** Verdadero cuando ya se puede derivar: o se llegó al principio, o se cortó. */
  drained: boolean;
  /** Se llegó al tope o falló la paginación: hay historial sin traer. */
  incomplete: boolean;
  error: string | null;
}

/**
 * Pide páginas anteriores hasta agotar el historial del canal.
 *
 * Es un requisito de corrección, no una comodidad: el orden de los eventos sale
 * del índice del array de mensajes, así que derivar sobre un backfill parcial no
 * da una partida incompleta — da otra partida.
 *
 * Cuando no se puede terminar de drenar, esto **libera igual** y avisa por
 * `incomplete`. Quedarse cargando para siempre sería peor que mostrar una
 * partida con una advertencia encima.
 */
export function useDrainedHistory({
  hasPrevious,
  isLoadingPrevious,
  loadPrevious,
  messages,
  enabled,
}: DrainInput): DrainResult {
  const pages = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const step = nextDrainStep({
      enabled,
      gaveUp,
      hasPrevious,
      isLoadingPrevious,
      pagesRequested: pages.current,
    });

    if (step === "give-up") {
      setGaveUp(true);
      return;
    }
    if (step !== "load") return;

    pages.current += 1;
    loadPrevious().catch((reason: unknown) => {
      // Sin esto la promesa rechazada queda sin manejar, y como el store se
      // republica igual, el efecto se volvería a disparar de inmediato: cien
      // peticiones en ráfaga y después una pantalla de carga eterna.
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo traer el historial",
      );
      setGaveUp(true);
    });
  }, [enabled, gaveUp, hasPrevious, isLoadingPrevious, loadPrevious, messages]);

  // Si el canal se soltara y se readquiriera, `hasPrevious` vuelve a `true` y
  // esto vuelve a decir "no drenado". Es lo correcto aunque la partida esté
  // corriendo: en ese momento realmente no tenemos el historial, y seguir
  // mostrando un tablero derivado de lo que ya no está es exactamente el error
  // que este módulo existe para evitar. Mejor volver a traerlo y avisar.
  return {
    drained: enabled ? gaveUp || !hasPrevious : false,
    incomplete: gaveUp,
    error,
  };
}
