"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isWorthSubmitting,
  recognitionConstructor,
  RECOGNITION_LANG,
} from "./recognition";
import type {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognizer,
} from "./types";

export type ListeningState =
  | "unsupported"
  | "off"
  | "listening"
  | "denied"
  | "error";

export interface SpeechResult {
  state: ListeningState;
  /** Lo que se está oyendo ahora mismo, todavía sin confirmar. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Reconocimiento de voz, como adaptador delgado.
 *
 * Todo lo que entra al juego pasa por `onPhrase`, que es la misma puerta que usa
 * la caja de texto. El reconocedor es su único llamador en producción; los tests
 * llaman la función directo, sin micrófono. Esa es la razón de que esta capa sea
 * deliberadamente fina: es la única que ninguna máquina puede verificar.
 */
export function useSpeech({
  enabled,
  onPhrase,
}: {
  /** Sólo se escucha cuando tiene sentido publicar — típicamente, en tu turno. */
  enabled: boolean;
  onPhrase: (text: string) => void;
}): SpeechResult {
  const [state, setState] = useState<ListeningState>("off");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognizer | null>(null);
  const wanted = useRef(false);
  // El callback cambia en cada render; la instancia del reconocedor no. Sin esto
  // el manejador se quedaría con una versión vieja y publicaría contra un estado
  // que ya no existe.
  const latestOnPhrase = useRef(onPhrase);
  useEffect(() => {
    latestOnPhrase.current = onPhrase;
  }, [onPhrase]);

  // El reconocedor se relanza a sí mismo desde `onend`, así que necesita
  // referenciarse antes de estar declarado.
  const startRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    recognition.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;
    if (recognition.current) return;

    wanted.current = true;

    const engine = new Ctor();
    engine.lang = RECOGNITION_LANG;
    engine.continuous = true;
    engine.interimResults = true;

    // El estado lo marcan los eventos del reconocedor y no el efecto: cambiarlo
    // sincrónicamente desde un efecto encadena renders, y además el motor puede
    // tardar en arrancar de verdad.
    engine.onstart = () => {
      setError(null);
      setState("listening");
    };

    engine.onresult = (event: SpeechRecognitionEvent) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          // Sólo lo confirmado se publica. Lo provisional cambia mientras hablás
          // y publicarlo mandaría media frase.
          if (isWorthSubmitting(text)) latestOnPhrase.current(text.trim());
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    engine.onerror = (event: SpeechRecognitionErrorEvent) => {
      const kind = event.error;
      if (kind === "not-allowed" || kind === "service-not-allowed") {
        wanted.current = false;
        setState("denied");
        setError("Sin permiso de micrófono no se puede jugar hablando.");
        return;
      }
      // `no-speech` y `aborted` son rutina: pasan cuando alguien se queda
      // callado. No son un fallo y no deberían aparecer en pantalla.
      if (kind && kind !== "no-speech" && kind !== "aborted") {
        setError(`El reconocimiento falló (${kind}).`);
        setState("error");
      }
    };

    engine.onend = () => {
      // Chrome corta la escucha continua a los ~60 s de silencio, sin avisar. Si
      // todavía la queremos, se relanza: sin esto la voz se muere sola a mitad
      // de partida y nadie entiende por qué.
      recognition.current = null;
      setInterim("");
      if (!wanted.current) {
        setState((current) => (current === "listening" ? "off" : current));
        return;
      }
      startRef.current();
    };

    try {
      engine.start();
      recognition.current = engine;
    } catch {
      // Arrancar dos veces la misma instancia tira; no es un fallo real.
      recognition.current = engine;
    }
  }, []);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // Detectar soporte es cosa del navegador, así que no puede pasar en el render.
  // Se aplaza un tick para no encadenar renders desde el efecto.
  useEffect(() => {
    if (recognitionConstructor()) return;
    const id = setTimeout(() => {
      setState("unsupported");
      setError(
        "Este navegador no reconoce voz. En Chrome funciona; en Firefox está desactivado.",
      );
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // La escucha sigue a `enabled`: fuera de turno no hay nada que publicar, y
  // tener el micrófono abierto de más sólo suma ruido al canal.
  useEffect(() => {
    if (enabled) start();
    else stop();
  }, [enabled, start, stop]);

  useEffect(() => stop, [stop]);

  return { state, interim, error, start, stop };
}
