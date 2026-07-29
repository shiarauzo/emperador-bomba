import { describe, expect, it } from "vitest";
import { deriveGameState } from "./derive";
import { fuseDuration } from "./fuse";
import type { GameEvent, GameEventBody, MovieCatalog } from "./types";

const CATALOG: MovieCatalog = {
  emperador: {
    id: "emperador",
    title: "Las locuras del emperador",
    quotes: [
      { id: "q1", text: "No existe tal cosa" },
      { id: "q2", text: "Jala la palanca Kronk" },
      { id: "q3", text: "Por qué tenemos esa palanca" },
    ],
  },
};

const A = "ana";
const B = "beto";

let seq = 0;
function event(
  playerId: string,
  body: GameEventBody,
  timestamp: number,
  id?: string,
): GameEvent {
  seq += 1;
  return { id: id ?? `e${seq}`, seq, timestamp, playerId, body };
}

/** Historial mínimo: una partida abierta en t=0 con Ana arrancando. */
function opened(id = "start") {
  seq = 0;
  return event(A, { kind: "start", movieId: "emperador", players: [A, B] }, 0, id);
}

const START_FUSE = fuseDuration("start");

describe("arranque", () => {
  it("reparte vidas, marcador en cero y el turno al primer jugador", () => {
    const state = deriveGameState([opened()], 0, CATALOG);

    expect(state.phase).toBe("playing");
    expect(state.turnOf).toBe(A);
    expect(state.lives).toEqual({ [A]: 3, [B]: 3 });
    expect(state.score).toEqual({ [A]: 0, [B]: 0 });
    expect(state.round).toBe(1);
  });

  it("un arranque después del final abre una partida nueva y limpia", () => {
    let at = 0;
    const events: GameEvent[] = [opened()];
    for (let round = 0; round < 3; round++) {
      at += fuseDuration(events[events.length - 1].id);
      events.push(event(A, { kind: "boom" }, at));
    }
    expect(deriveGameState(events, at, CATALOG).phase).toBe("over");

    events.push(
      event(B, { kind: "start", movieId: "emperador", players: [B, A] }, at + 100),
    );
    const state = deriveGameState(events, at + 100, CATALOG);

    expect(state.phase).toBe("playing");
    expect(state.turnOf).toBe(B);
    expect(state.lives).toEqual({ [A]: 3, [B]: 3 });
    expect(state.score).toEqual({ [A]: 0, [B]: 0 });
    expect(state.round).toBe(1);
    expect(state.winner).toBeNull();
    // Las frases vuelven a estar disponibles: es otra partida, no otra ronda.
    expect(state.usedQuoteIds).toEqual([]);
    expect(state.said).toEqual([]);
  });

  it("ignora un segundo arranque en una partida en curso", () => {
    const start = opened();
    const otro = event(
      B,
      { kind: "start", movieId: "emperador", players: [B, A] },
      1000,
    );

    const state = deriveGameState([start, otro], 1000, CATALOG);

    expect(state.turnOf).toBe(A);
    expect(state.round).toBe(1);
  });
});

describe("decir una frase", () => {
  it("una frase correcta suma un punto y pasa el turno", () => {
    const events = [opened(), event(A, { kind: "say", text: "No existe tal cosa" }, 1000)];

    const state = deriveGameState(events, 1000, CATALOG);

    expect(state.score[A]).toBe(1);
    expect(state.turnOf).toBe(B);
    expect(state.usedQuoteIds).toEqual(["q1"]);
    expect(state.said).toHaveLength(1);
  });

  it("acierta aunque la transcripción traiga titubeos alrededor", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "eh, no existe tal cosa, ¿no?" }, 1000),
    ];

    expect(deriveGameState(events, 1000, CATALOG).score[A]).toBe(1);
  });

  it("acierta sin acentos ni signos, como los devuelve el micrófono", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "POR QUE TENEMOS ESA PALANCA" }, 1000),
    ];

    expect(deriveGameState(events, 1000, CATALOG).score[A]).toBe(1);
  });

  it("una frase que no está en el catálogo no cambia nada", () => {
    const events = [opened(), event(A, { kind: "say", text: "buenas tardes" }, 1000)];

    const state = deriveGameState(events, 1000, CATALOG);

    expect(state.score[A]).toBe(0);
    expect(state.turnOf).toBe(A);
    expect(state.said).toHaveLength(0);
  });

  it("una frase ya usada no vuelve a contar", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 1000),
      event(B, { kind: "say", text: "No existe tal cosa" }, 2000),
    ];

    const state = deriveGameState(events, 2000, CATALOG);

    expect(state.score).toEqual({ [A]: 1, [B]: 0 });
    expect(state.turnOf).toBe(B);
  });

  it("una frase dicha fuera de turno no cuenta", () => {
    const events = [
      opened(),
      event(B, { kind: "say", text: "No existe tal cosa" }, 1000),
    ];

    const state = deriveGameState(events, 1000, CATALOG);

    expect(state.score[B]).toBe(0);
    expect(state.turnOf).toBe(A);
    expect(state.usedQuoteIds).toEqual([]);
  });

  it("una frase dicha después de que venció la mecha no cuenta", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, START_FUSE + 1),
    ];

    const state = deriveGameState(events, START_FUSE + 1, CATALOG);

    expect(state.score[A]).toBe(0);
  });
});

describe("la mecha", () => {
  it("dura lo que dice el hash del mensaje de arranque, no un valor fijo", () => {
    const state = deriveGameState([opened()], 0, CATALOG);

    expect(state.fuse?.duration).toBe(START_FUSE);
    expect(state.fuse?.openedAt).toBe(0);
  });

  it("no está vencida un milisegundo antes y sí justo al cumplirse", () => {
    const events = [opened()];

    expect(deriveGameState(events, START_FUSE - 1, CATALOG).fuse?.expired).toBe(false);
    expect(deriveGameState(events, START_FUSE, CATALOG).fuse?.expired).toBe(true);
  });

  it("no se reinicia cuando pasa el turno", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 30_000),
    ];

    expect(deriveGameState(events, 30_000, CATALOG).fuse?.openedAt).toBe(0);
  });
});

describe("la explosión", () => {
  it("le saca una vida a quien tenía el turno y abre una ronda nueva", () => {
    const events = [opened(), event(A, { kind: "boom" }, START_FUSE)];

    const state = deriveGameState(events, START_FUSE, CATALOG);

    expect(state.lives).toEqual({ [A]: 2, [B]: 3 });
    expect(state.round).toBe(2);
    expect(state.turnOf).toBe(A);
    expect(state.fuse?.openedAt).toBe(START_FUSE);
    expect(state.fuse?.expired).toBe(false);
  });

  it("se descarta si la mecha todavía no venció", () => {
    const events = [opened(), event(B, { kind: "boom" }, 1000)];

    const state = deriveGameState(events, 1000, CATALOG);

    expect(state.lives).toEqual({ [A]: 3, [B]: 3 });
    expect(state.round).toBe(1);
  });

  it("si las dos pantallas publican explosión, sólo cuenta la de menor seq", () => {
    const events = [
      opened(),
      event(A, { kind: "boom" }, START_FUSE),
      event(B, { kind: "boom" }, START_FUSE + 5),
    ];

    const state = deriveGameState(events, START_FUSE + 5, CATALOG);

    expect(state.lives).toEqual({ [A]: 2, [B]: 3 });
    expect(state.round).toBe(2);
  });

  it("la segunda explosión se descarta aunque llegue mucho después, no por milisegundos", () => {
    // A 5 ms de distancia el descarte podría ser casualidad de reloj. Acá la
    // segunda llega treinta segundos más tarde y se descarta igual, porque se
    // evalúa contra la mecha que abrió la primera — todavía fresca.
    const start = opened();
    const primera = event(A, { kind: "boom" }, START_FUSE);
    const segunda = event(B, { kind: "boom" }, START_FUSE + 30_000);

    const state = deriveGameState([start, primera, segunda], START_FUSE + 30_000, CATALOG);

    expect(state.lives).toEqual({ [A]: 2, [B]: 3 });
    expect(state.round).toBe(2);
    // Y la ronda nueva sigue anclada a la primera, no a la rezagada.
    expect(state.fuse?.openedAt).toBe(START_FUSE);
  });

  it("el desempate no depende del orden de llegada, sólo del seq", () => {
    const start = opened();
    const primera = event(A, { kind: "boom" }, START_FUSE);
    const segunda = event(B, { kind: "boom" }, START_FUSE + 5);

    const enOrden = deriveGameState([start, primera, segunda], START_FUSE + 5, CATALOG);
    const alReves = deriveGameState([segunda, primera, start], START_FUSE + 5, CATALOG);

    expect(alReves).toEqual(enOrden);
  });

  it("las frases usadas no se reinician entre rondas", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 1000),
      event(B, { kind: "boom" }, START_FUSE),
    ];

    expect(deriveGameState(events, START_FUSE, CATALOG).usedQuoteIds).toEqual(["q1"]);
  });
});

describe("fin de partida", () => {
  it("termina a las tres vidas perdidas y corona al otro", () => {
    let at = 0;
    const events: GameEvent[] = [opened()];

    // Tres explosiones seguidas sobre Ana: siempre le toca abrir la ronda nueva.
    for (let round = 0; round < 3; round++) {
      const fuse = events[events.length - 1];
      at += fuseDuration(fuse.id);
      events.push(event(A, { kind: "boom" }, at));
    }

    const state = deriveGameState(events, at, CATALOG);

    expect(state.phase).toBe("over");
    expect(state.lives[A]).toBe(0);
    expect(state.winner).toBe(B);
    expect(state.fuse).toBeNull();
  });

  it("ignora lo que se diga después del final", () => {
    let at = 0;
    const events: GameEvent[] = [opened()];
    for (let round = 0; round < 3; round++) {
      at += fuseDuration(events[events.length - 1].id);
      events.push(event(A, { kind: "boom" }, at));
    }
    events.push(event(B, { kind: "say", text: "No existe tal cosa" }, at + 1000));

    const state = deriveGameState(events, at + 1000, CATALOG);

    expect(state.score[B]).toBe(0);
    expect(state.phase).toBe("over");
  });
});

describe("determinismo", () => {
  it("el mismo historial y el mismo instante dan exactamente el mismo estado", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 1000),
      event(B, { kind: "say", text: "jala la palanca kronk" }, 2000),
    ];

    expect(deriveGameState(events, 5000, CATALOG)).toEqual(
      deriveGameState(events, 5000, CATALOG),
    );
  });

  it("el orden en que llegan los mensajes no importa: manda el seq", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 1000),
      event(B, { kind: "say", text: "jala la palanca kronk" }, 2000),
    ];
    const desordenados = [events[2], events[0], events[1]];

    expect(deriveGameState(desordenados, 5000, CATALOG)).toEqual(
      deriveGameState(events, 5000, CATALOG),
    );
  });

  it("un historial truncado NO deriva lo mismo: por eso hay que drenarlo entero", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, 1000),
      event(B, { kind: "say", text: "jala la palanca kronk" }, 2000),
    ];

    const completo = deriveGameState(events, 9000, CATALOG);
    const truncado = deriveGameState(events.slice(-2), 9000, CATALOG);

    // Sin el mensaje de arranque no hay partida: quien reciba sólo el backfill
    // por defecto de Portal vería otro juego que quien tiene el historial entero.
    expect(truncado.phase).toBe("waiting");
    expect(truncado).not.toEqual(completo);
  });
});

describe("el reloj es el del mensaje, no el del navegador", () => {
  it("una frase dicha pasada la mecha no cuenta, aunque se derive con un `now` temprano", () => {
    const events = [
      opened(),
      event(A, { kind: "say", text: "No existe tal cosa" }, START_FUSE + 1),
    ];

    // Si la mecha se evaluara contra `now`, acá estaría fresca y la frase contaría.
    const state = deriveGameState(events, 0, CATALOG);

    expect(state.score[A]).toBe(0);
    expect(state.turnOf).toBe(A);
  });

  it("una explosión cuenta por la hora de su mensaje, no por cuándo se recalcula", () => {
    const events = [opened(), event(A, { kind: "boom" }, START_FUSE)];

    // `now` anterior al vencimiento: la explosión ya ocurrió igual.
    const state = deriveGameState(events, 1000, CATALOG);

    expect(state.lives[A]).toBe(2);
    expect(state.round).toBe(2);
  });

  it("un mensaje rezagado, anterior a la ronda en curso, se descarta", () => {
    const start = opened();
    const boom = event(A, { kind: "boom" }, START_FUSE);
    // seq posterior pero reloj anterior a la apertura de la ronda nueva.
    const rezagado = event(B, { kind: "say", text: "jala la palanca kronk" }, 1000);

    const state = deriveGameState([start, boom, rezagado], START_FUSE + 100, CATALOG);

    expect(state.score[B]).toBe(0);
    expect(state.usedQuoteIds).toEqual([]);
  });
});
