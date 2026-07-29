/** Marcas diacríticas combinantes, lo que queda de las tildes tras descomponer. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Forma canónica sobre la que se comparan dataset y transcripción.
 *
 * El reconocedor de voz no pone signos, se come acentos y devuelve todo en una
 * corrida. Comparar contra la frase tal como se escribió no acertaría nunca, así
 * que los dos lados se reducen a lo mismo antes de compararse.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cantidad de palabras de una frase ya normalizada. */
export function wordCount(text: string): number {
  const normalized = normalize(text);
  return normalized === "" ? 0 : normalized.split(" ").length;
}
