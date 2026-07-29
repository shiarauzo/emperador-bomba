import { MIN_QUOTE_WORDS, wordCount } from "@/lib/engine/normalize";
import type { SpeechRecognizerCtor } from "./types";

/**
 * Español latino. El reconocedor necesita un idioma fijo, y mezclarlo con inglés
 * degrada la transcripción: el cambio de idioma a media frase es el enemigo del
 * reconocimiento. El dataset está en el doblaje latino por la misma razón.
 */
export const RECOGNITION_LANG = "es-419";

export type SpeechSupport = "supported" | "unsupported";

/**
 * El constructor del reconocedor, si el navegador lo tiene.
 *
 * Chrome, Edge y Opera lo traen; Safari con prefijo; Firefox lo tiene detrás de
 * un flag, o sea que no. Devolver `null` en vez de asumir permite decirlo en
 * pantalla en lugar de fallar en silencio.
 */
export function recognitionConstructor(): SpeechRecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognizerCtor;
    webkitSpeechRecognition?: SpeechRecognizerCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Si vale la pena publicar lo que se oyó.
 *
 * Se filtra lo demasiado corto, y no por capricho: el dataset garantiza que
 * ninguna frase baja de `MIN_QUOTE_WORDS` palabras, y el matching es por
 * contención — una transcripción más corta que la frase más corta no puede
 * contener ninguna. Así que este filtro no puede perderse un acierto.
 *
 * Importa porque el micrófono está abierto durante toda la llamada: sin esto,
 * cada "ajá" y cada "esperá" terminaría publicado y guardado para siempre en el
 * historial del canal.
 */
export function isWorthSubmitting(transcript: string): boolean {
  return wordCount(transcript) >= MIN_QUOTE_WORDS;
}
