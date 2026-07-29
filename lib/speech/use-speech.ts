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

/** Tope de relanzados seguidos sin llegar a escuchar. */
const MAX_RESTARTS = 5;

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
  /**
   * Lo último que el micrófono dio por confirmado.
   *
   * Se conserva porque es justo lo que hay que ver cuando escuchó mal: si sólo
   * se mostrara lo provisional, el texto desaparecería en el instante en que se
   * confirma, y una frase mal entendida no dejaría rastro en ninguna parte.
   */
  heard: string;
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
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognizer | null>(null);
  /** Si se debe seguir escuchando; gobierna el relanzado automático. */
  const wanted = useRef(false);
  /** Relanzados seguidos sin haber llegado a escuchar. Corta los bucles. */
  const failedRestarts = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /**
   * Reporta un fallo sin encadenar renders.
   *
   * `start()` se llama desde un efecto, así que cambiar estado ahí mismo dispara
   * una cascada. Un error no necesita estar en pantalla en ese instante — sí en
   * el siguiente tick.
   */
  const reportFailure = useCallback((message: string) => {
    queueMicrotask(() => {
      setState("error");
      setError(message);
    });
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
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
      failedRestarts.current = 0;
      setError(null);
      setState("listening");
    };

    engine.onresult = (event: SpeechRecognitionEvent) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          setHeard(text.trim());
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
      if (!kind || kind === "no-speech" || kind === "aborted") return;

      // Todo lo demás —sin red, micrófono desenchufado— vuelve a fallar apenas
      // se reintenta. Sin cortar acá, `onend` relanzaría al instante y quedaría
      // un bucle de reinicios a cero milisegundos.
      wanted.current = false;
      setError(`El reconocimiento falló (${kind}).`);
      setState("error");
    };

    engine.onend = () => {
      // `onend` llega tarde. Si mientras tanto se creó otra instancia, ésta ya
      // no manda: sin esta guarda, el `onend` de la vieja anulaba la referencia
      // a la nueva y arrancaba una tercera — dos reconocedores vivos publicando
      // cada frase dos veces, y uno de ellos con el micrófono abierto y sin
      // forma de apagarlo desde la interfaz.
      if (recognition.current !== engine) return;

      recognition.current = null;
      setInterim("");
      if (!wanted.current) {
        setState((current) => (current === "listening" ? "off" : current));
        return;
      }

      // Chrome corta la escucha continua a los ~60 s de silencio, sin avisar.
      // Se relanza, con espera creciente y con tope: si nunca llega a escuchar,
      // insistir sin pausa no lo va a arreglar.
      failedRestarts.current += 1;
      if (failedRestarts.current > MAX_RESTARTS) {
        wanted.current = false;
        setState("error");
        setError("El reconocimiento no se pudo sostener. Probá apagarlo y encenderlo.");
        return;
      }
      const wait = Math.min(2000, 100 * 2 ** (failedRestarts.current - 1));
      restartTimer.current = setTimeout(() => startRef.current(), wait);
    };

    try {
      engine.start();
      recognition.current = engine;
    } catch (reason) {
      // Guardar acá un motor que nunca arrancó dejaba al hook creyendo que
      // escuchaba: sin `onstart` ni `onend`, la pantalla decía "Escuchando…"
      // para siempre con el micrófono muerto y sin forma de recuperarse.
      recognition.current = null;
      wanted.current = false;
      reportFailure(
        reason instanceof Error ? reason.message : "No se pudo abrir el micrófono",
      );
    }
  }, [reportFailure]);

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

  return { state, interim, heard, error, start, stop };
}
