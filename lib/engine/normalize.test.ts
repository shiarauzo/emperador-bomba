import { describe, expect, it } from "vitest";
import { fuseDuration, FUSE_MAX_MS, FUSE_MIN_MS } from "./fuse";
import { matchQuote } from "./match";
import { normalize, wordCount } from "./normalize";
import type { Quote } from "./types";

describe("normalize", () => {
  it("baja a minúsculas y saca acentos", () => {
    expect(normalize("¿POR QUÉ TENEMOS ESA PALANCA?")).toBe(
      "por que tenemos esa palanca",
    );
  });

  it("colapsa espacios y recorta los bordes", () => {
    expect(normalize("  no    existe   tal cosa  ")).toBe("no existe tal cosa");
  });

  it("no pega palabras al sacar la puntuación", () => {
    expect(normalize("hola,mundo")).toBe("hola mundo");
  });

  it("deja vacío lo que no tiene letras ni números", () => {
    expect(normalize("¡¿...?!")).toBe("");
  });

  it("cuenta palabras sobre la forma normalizada", () => {
    expect(wordCount("  ¿No existe tal cosa?  ")).toBe(4);
    expect(wordCount("¡!")).toBe(0);
  });
});

describe("matchQuote", () => {
  const quotes: Quote[] = [
    { id: "corta", text: "no existe tal cosa" },
    { id: "larga", text: "no existe tal cosa como una llama parlante" },
    { id: "otra", text: "jala la palanca Kronk" },
  ];

  it("encuentra la frase dentro de una transcripción con ruido", () => {
    expect(matchQuote("eh, jala la palanca Kronk, dale", quotes, [])?.id).toBe("otra");
  });

  it("cuando dos frases entran, gana la más larga", () => {
    const dicho = "no existe tal cosa como una llama parlante";
    expect(matchQuote(dicho, quotes, [])?.id).toBe("larga");
  });

  it("no devuelve una frase ya usada", () => {
    expect(matchQuote("jala la palanca Kronk", quotes, ["otra"])).toBeNull();
  });

  it("descartada la larga por usada, la corta todavía puede acertar", () => {
    const dicho = "no existe tal cosa como una llama parlante";
    expect(matchQuote(dicho, quotes, ["larga"])?.id).toBe("corta");
  });

  it("devuelve null cuando no se dijo nada aprovechable", () => {
    expect(matchQuote("¡¿...?!", quotes, [])).toBeNull();
    expect(matchQuote("buenas tardes", quotes, [])).toBeNull();
  });
});

describe("fuseDuration", () => {
  it("es determinista para la misma semilla", () => {
    expect(fuseDuration("abc")).toBe(fuseDuration("abc"));
  });

  it("cae siempre dentro del rango", () => {
    for (let i = 0; i < 500; i++) {
      const duration = fuseDuration(`mensaje-${i}`);
      expect(duration).toBeGreaterThanOrEqual(FUSE_MIN_MS);
      expect(duration).toBeLessThanOrEqual(FUSE_MAX_MS);
    }
  });

  it("semillas distintas dan duraciones distintas", () => {
    const durations = new Set(
      Array.from({ length: 100 }, (_, i) => fuseDuration(`m${i}`)),
    );
    expect(durations.size).toBeGreaterThan(50);
  });
});
