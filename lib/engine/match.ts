import { normalize } from "./normalize";
import type { Quote } from "./types";

/**
 * Busca qué frase del catálogo contiene lo que se dijo.
 *
 * Se usa contención y no igualdad porque nadie dice la frase sola: la transcripción
 * llega con titubeos alrededor ("eh, no existe tal cosa, ¿no?"). Las ya usadas se
 * descartan antes de comparar, así que repetir simplemente no matchea.
 *
 * Si más de una frase entra, gana la más larga. El dataset promete que ninguna
 * frase es subcadena de otra — cuando esa promesa se rompe, esto evita que la
 * corta se lleve siempre el punto.
 */
export function matchQuote(
  text: string,
  quotes: readonly Quote[],
  usedQuoteIds: readonly string[],
): Quote | null {
  const spoken = normalize(text);
  if (spoken === "") return null;

  let best: Quote | null = null;
  let bestLength = 0;

  for (const quote of quotes) {
    if (usedQuoteIds.includes(quote.id)) continue;
    const candidate = normalize(quote.text);
    if (candidate === "" || !spoken.includes(candidate)) continue;
    if (candidate.length > bestLength) {
      best = quote;
      bestLength = candidate.length;
    }
  }

  return best;
}
