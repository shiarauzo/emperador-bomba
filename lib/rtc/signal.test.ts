import { describe, expect, it } from "vitest";
import { toGameEvents, type GameMessage } from "@/lib/portal/channel";
import {
  contentBytes,
  fitsInChannel,
  isCaller,
  isSignalBody,
  MAX_CONTENT_BYTES,
  type SignalBody,
} from "./signal";

function signal(payload: SignalBody["payload"]): SignalBody {
  return { kind: "rtc", to: "beto", payload };
}

describe("isSignalBody", () => {
  it("acepta oferta, respuesta, candidato y despedida", () => {
    expect(isSignalBody(signal({ type: "offer", sdp: "v=0" }))).toBe(true);
    expect(isSignalBody(signal({ type: "answer", sdp: "v=0" }))).toBe(true);
    expect(isSignalBody(signal({ type: "ice", candidate: {} }))).toBe(true);
    expect(isSignalBody(signal({ type: "bye" }))).toBe(true);
  });

  it("rechaza eventos del juego", () => {
    expect(isSignalBody({ kind: "say", text: "hola" })).toBe(false);
    expect(isSignalBody({ kind: "boom" })).toBe(false);
  });

  it("rechaza basura sin romperse", () => {
    expect(isSignalBody(null)).toBe(false);
    expect(isSignalBody("rtc")).toBe(false);
    expect(isSignalBody({ kind: "rtc" })).toBe(false);
    expect(isSignalBody({ kind: "rtc", to: 7, payload: { type: "bye" } })).toBe(false);
    expect(isSignalBody({ kind: "rtc", to: "x", payload: { type: "otro" } })).toBe(false);
    expect(isSignalBody({ kind: "rtc", to: "x", payload: { type: "offer" } })).toBe(false);
  });
});

describe("la señalización no toca la partida", () => {
  it("el adaptador del juego descarta los mensajes de señalización", () => {
    const message = (content: unknown, id: string): GameMessage =>
      ({
        id,
        channelId: "c",
        sender: { id: "ana", anon: true },
        timestamp: 1000,
        type: "message",
        content,
        unread: false,
        status: "sent",
      }) as GameMessage;

    const events = toGameEvents([
      message({ kind: "say", text: "no existe tal cosa" }, "m1"),
      message(signal({ type: "offer", sdp: "v=0" }), "m2"),
      message({ kind: "boom" }, "m3"),
    ]);

    // La oferta desaparece: no es un evento de partida y no puede mover el juego.
    expect(events.map((e) => e.id)).toEqual(["m1", "m3"]);
  });

  it("aun descartada, no altera el orden relativo de lo que sí cuenta", () => {
    const message = (content: unknown, id: string): GameMessage =>
      ({
        id,
        channelId: "c",
        sender: { id: "ana", anon: true },
        timestamp: 1000,
        type: "message",
        content,
        unread: false,
        status: "sent",
      }) as GameMessage;

    const events = toGameEvents([
      message(signal({ type: "ice", candidate: {} }), "s1"),
      message({ kind: "say", text: "una" }, "m1"),
      message(signal({ type: "ice", candidate: {} }), "s2"),
      message({ kind: "say", text: "dos" }, "m2"),
    ]);

    expect(events[0].seq).toBeLessThan(events[1].seq);
  });
});

describe("el tamaño importa", () => {
  it("una oferta de audio real entra en el límite del canal", () => {
    // SDP de sólo audio medido en Chromium: ~1.2 KB.
    const sdp = "v=0\r\n" + "a=rtpmap:111 opus/48000/2\r\n".repeat(40);
    const body = signal({ type: "offer", sdp });

    expect(contentBytes(body)).toBeLessThan(MAX_CONTENT_BYTES);
    expect(fitsInChannel(body)).toBe(true);
  });

  it("una oferta con video no entra, y por eso la llamada es sólo audio", () => {
    // Con video el SDP medido fue de 5668 B contra un límite de 2048 B.
    const sdp = "v=0\r\n" + "a=rtpmap:96 VP8/90000\r\n".repeat(240);
    const body = signal({ type: "offer", sdp });

    expect(contentBytes(body)).toBeGreaterThan(MAX_CONTENT_BYTES);
    expect(fitsInChannel(body)).toBe(false);
  });
});

describe("quién ofrece", () => {
  it("ofrece el id menor, y los dos lados coinciden sin negociar", () => {
    expect(isCaller("ana", "beto")).toBe(true);
    expect(isCaller("beto", "ana")).toBe(false);
  });

  it("nunca los dos a la vez", () => {
    const ids = ["aaa", "zzz", "m1d", "0x0"];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(isCaller(a, b)).not.toBe(isCaller(b, a));
      }
    }
  });
});
