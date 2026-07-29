/** Una frase citable de una película. */
export interface Quote {
  id: string;
  text: string;
}

export interface Movie {
  id: string;
  title: string;
  quotes: Quote[];
}

/** Catálogo de películas jugables, indexado por id. */
export type MovieCatalog = Record<string, Movie>;

/**
 * Lo que cada jugador publica al canal. Los tres campos de arriba son del sobre —
 * los asigna el servidor de Portal, no el cliente — y de ahí sale toda la
 * determinación del juego: `seq` da el orden y `timestamp` da el reloj.
 */
export interface GameEvent {
  id: string;
  seq: number;
  timestamp: number;
  playerId: string;
  body: GameEventBody;
}

export type GameEventBody =
  | { kind: "start"; movieId: string; players: string[] }
  | { kind: "say"; text: string }
  | { kind: "boom" };

export interface Fuse {
  /** Marca de tiempo del servidor en el mensaje que abrió la ronda. */
  openedAt: number;
  /** Derivada por hash del id de ese mensaje. Nunca se muestra. */
  duration: number;
  expired: boolean;
}

export interface SaidQuote {
  quoteId: string;
  playerId: string;
  /** Lo que se dijo textualmente, que rara vez es la frase exacta. */
  text: string;
}

export type Phase = "waiting" | "playing" | "over";

export interface GameState {
  phase: Phase;
  movieId: string | null;
  /** En orden de turno, fijado por el mensaje de arranque. */
  players: string[];
  turnOf: string | null;
  lives: Record<string, number>;
  score: Record<string, number>;
  /** Se acumulan durante toda la partida: una frase no se repite ni entre rondas. */
  usedQuoteIds: string[];
  fuse: Fuse | null;
  said: SaidQuote[];
  round: number;
  winner: string | null;
}

export const STARTING_LIVES = 3;
