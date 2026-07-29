import { describe, expect, it } from "vitest";
import { normalize, wordCount } from "@/lib/engine/normalize";
import { MOVIES } from "./index";

describe.each(MOVIES)("dataset de $title", (movie) => {
  it("no tiene ids repetidos", () => {
    const ids = movie.quotes.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ninguna frase baja de cuatro palabras", () => {
    const cortas = movie.quotes.filter((q) => wordCount(q.text) < 4);
    expect(cortas.map((q) => q.text)).toEqual([]);
  });

  it("ninguna frase es subcadena de otra", () => {
    const ofensoras: string[] = [];

    for (const a of movie.quotes) {
      for (const b of movie.quotes) {
        if (a.id === b.id) continue;
        if (normalize(b.text).includes(normalize(a.text))) {
          ofensoras.push(`"${a.text}" está dentro de "${b.text}"`);
        }
      }
    }

    expect(ofensoras).toEqual([]);
  });

  it("ninguna frase queda vacía al normalizar", () => {
    const vacias = movie.quotes.filter((q) => normalize(q.text) === "");
    expect(vacias).toEqual([]);
  });
});
