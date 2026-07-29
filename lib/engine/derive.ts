import { fuseDuration, isExpired } from "./fuse";
import { matchQuote } from "./match";
import {
  STARTING_LIVES,
  type GameEvent,
  type GameState,
  type MovieCatalog,
} from "./types";

function emptyState(): GameState {
  return {
    phase: "waiting",
    movieId: null,
    players: [],
    turnOf: null,
    lives: {},
    score: {},
    usedQuoteIds: [],
    fuse: null,
    said: [],
    round: 0,
    winner: null,
  };
}

function nextPlayer(players: readonly string[], current: string): string {
  const index = players.indexOf(current);
  return players[(index + 1) % players.length];
}

/** Abre una mecha anclada al mensaje que inaugura la ronda. */
function openFuse(event: GameEvent) {
  return {
    openedAt: event.timestamp,
    duration: fuseDuration(event.id),
    expired: false,
  };
}

/**
 * Aplica un evento al estado. Todo evento que no cumpla sus condiciones se
 * ignora entero: no hay penalizaciones, sólo el tiempo que costó decirlo.
 */
function applyEvent(
  state: GameState,
  event: GameEvent,
  catalog: MovieCatalog,
): GameState {
  const { body } = event;

  if (body.kind === "start") {
    // Un segundo arranque no reinicia una partida en curso.
    if (state.phase !== "waiting") return state;
    if (body.players.length < 2) return state;
    if (!catalog[body.movieId]) return state;

    return {
      ...state,
      phase: "playing",
      movieId: body.movieId,
      players: [...body.players],
      turnOf: body.players[0],
      lives: Object.fromEntries(body.players.map((p) => [p, STARTING_LIVES])),
      score: Object.fromEntries(body.players.map((p) => [p, 0])),
      round: 1,
      fuse: openFuse(event),
    };
  }

  if (state.phase !== "playing" || !state.fuse || !state.movieId) return state;

  // Un evento anterior a la apertura de esta ronda no le pertenece. `seq` ordena
  // el fold, pero nada garantiza que el reloj del servidor y el orden de llegada
  // coincidan: sin esta guarda, un mensaje rezagado daría tiempo negativo y
  // puntuaría en una ronda que empezó después de que se dijo.
  if (event.timestamp < state.fuse.openedAt) return state;

  // La mecha se evalúa contra la hora del propio evento, no contra "ahora": lo
  // que ya estaba vencido cuando se dijo, sigue vencido al recalcular mañana.
  const fuseWasExpired = isExpired(
    state.fuse.openedAt,
    state.fuse.duration,
    event.timestamp,
  );

  if (body.kind === "say") {
    if (fuseWasExpired) return state;
    if (event.playerId !== state.turnOf) return state;

    const movie = catalog[state.movieId];
    const quote = matchQuote(body.text, movie.quotes, state.usedQuoteIds);
    if (!quote) return state;

    return {
      ...state,
      score: { ...state.score, [event.playerId]: state.score[event.playerId] + 1 },
      usedQuoteIds: [...state.usedQuoteIds, quote.id],
      said: [
        ...state.said,
        { quoteId: quote.id, playerId: event.playerId, text: body.text },
      ],
      turnOf: nextPlayer(state.players, event.playerId),
    };
  }

  if (body.kind === "boom") {
    // Una explosión sólo vale si la mecha ya había vencido. Cuando dos clientes
    // publican a la vez, el primero por `seq` abre una mecha nueva y el segundo
    // se evalúa contra ella — todavía fresca — así que se descarta solo.
    if (!fuseWasExpired) return state;

    const loser = state.turnOf as string;
    const remaining = state.lives[loser] - 1;
    const lives = { ...state.lives, [loser]: remaining };

    if (remaining <= 0) {
      return {
        ...state,
        phase: "over",
        lives,
        fuse: null,
        winner: nextPlayer(state.players, loser),
      };
    }

    return {
      ...state,
      lives,
      round: state.round + 1,
      // Quien explotó abre la ronda siguiente.
      fuse: openFuse(event),
    };
  }

  return state;
}

/**
 * El único lugar donde vive el estado del juego.
 *
 * Recibe el historial del canal y el instante actual, y devuelve todo: turno,
 * vidas, marcador, frases usadas, mecha y final. No guarda nada entre llamadas,
 * así que dos pantallas con el mismo historial no pueden discrepar.
 */
export function deriveGameState(
  events: readonly GameEvent[],
  now: number,
  catalog: MovieCatalog,
): GameState {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  let state = emptyState();
  for (const event of ordered) {
    state = applyEvent(state, event, catalog);
  }

  if (state.phase !== "playing" || !state.fuse) return state;

  return {
    ...state,
    fuse: {
      ...state.fuse,
      expired: isExpired(state.fuse.openedAt, state.fuse.duration, now),
    },
  };
}
