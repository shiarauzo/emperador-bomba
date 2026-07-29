export const FUSE_MIN_MS = 60_000;
export const FUSE_MAX_MS = 90_000;

/**
 * Duración de la mecha, derivada por hash del id del mensaje que abrió la ronda.
 *
 * Es determinista a propósito: las dos pantallas llegan al mismo número sin
 * hablarse y sin que ningún servidor arbitre. Y es opaca a propósito: nadie
 * puede leer cuánto falta mirando la interfaz.
 */
export function fuseDuration(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  return Math.round(FUSE_MIN_MS + unit * (FUSE_MAX_MS - FUSE_MIN_MS));
}

/** La mecha se mide contra la hora del servidor, nunca contra la del navegador. */
export function isExpired(
  openedAt: number,
  duration: number,
  at: number,
): boolean {
  return at - openedAt >= duration;
}
