import { describe, expect, it } from "vitest";
import type { GameMessage } from "./channel";
import { toGameEvents } from "./channel";

function message(
  id: string,
  content: unknown,
  overrides: Partial<GameMessage> = {},
): GameMessage {
  return {
    id,
    channelId: "emperador-bomba",
    sender: { id: "ana", anon: true },
    timestamp: 1000,
    type: "message",
    content,
    unread: false,
    status: "sent",
    ...overrides,
  } as GameMessage;
}

describe("toGameEvents", () => {
  it("numera el seq desde el orden del array, que el SDK ya garantiza", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }),
      message("m2", { kind: "say", text: "dos" }),
      message("m3", { kind: "boom" }),
    ]);

    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("conserva el orden relativo aunque se salteen mensajes", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }),
      message("m2", { kind: "say", text: "dos" }, { status: "pending" }),
      message("m3", { kind: "boom" }),
    ]);

    expect(events.map((e) => e.id)).toEqual(["m1", "m3"]);
    expect(events[0].seq).toBeLessThan(events[1].seq);
  });

  it("deja afuera lo propio sin confirmar: su lugar en el orden no está decidido", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }, { status: "pending" }),
    ]);

    expect(events).toEqual([]);
  });

  it("deja afuera lo que falló al enviarse", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }, { status: "failed" }),
    ]);

    expect(events).toEqual([]);
  });

  it("descarta contenido que no es un evento del juego sin romperse", () => {
    const events = toGameEvents([
      message("m1", { kind: "saludo" }),
      message("m2", "texto suelto"),
      message("m3", null),
      message("m4", { kind: "say", text: "buena" }),
    ]);

    expect(events.map((e) => e.id)).toEqual(["m4"]);
  });

  it("toma el jugador del remitente del sobre, no del contenido", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }, {
        sender: { id: "beto", anon: true },
      }),
    ]);

    expect(events[0].playerId).toBe("beto");
  });

  it("toma la hora del sobre, que la pone el servidor", () => {
    const events = toGameEvents([
      message("m1", { kind: "say", text: "una" }, { timestamp: 4242 }),
    ]);

    expect(events[0].timestamp).toBe(4242);
  });
});
