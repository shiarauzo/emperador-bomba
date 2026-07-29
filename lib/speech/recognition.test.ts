import { describe, expect, it } from "vitest";
import { MIN_QUOTE_WORDS } from "@/lib/engine/normalize";
import { matchQuote } from "@/lib/engine/match";
import { MOVIES } from "@/lib/movies";
import { isWorthSubmitting, RECOGNITION_LANG } from "./recognition";

describe("isWorthSubmitting", () => {
  it("descarta lo que se dice de paso", () => {
    expect(isWorthSubmitting("ajá")).toBe(false);
    expect(isWorthSubmitting("sí dale")).toBe(false);
    expect(isWorthSubmitting("esperá un toque")).toBe(false);
  });

  it("deja pasar algo del largo de una frase", () => {
    expect(isWorthSubmitting("no existe tal cosa")).toBe(true);
    expect(isWorthSubmitting("eh, jala la palanca Kronk, dale")).toBe(true);
  });

  it("no se rompe con silencio ni con puntuación suelta", () => {
    expect(isWorthSubmitting("")).toBe(false);
    expect(isWorthSubmitting("¡¿...?!")).toBe(false);
  });

  it("el filtro no puede perderse un acierto: nada más corto que el mínimo puede contener una frase", () => {
    // El matching es por contención, y el dataset garantiza que ninguna frase
    // baja de MIN_QUOTE_WORDS. Así que descartar lo más corto que eso no puede
    // tirar una frase válida — y esto lo verifica contra el dataset real.
    for (const movie of MOVIES) {
      for (const quote of movie.quotes) {
        expect(isWorthSubmitting(quote.text)).toBe(true);
      }
    }
  });

  it("todo lo que descarta, el motor tampoco lo habría matcheado", () => {
    const descartadas = ["ajá", "sí dale", "no", "esperá"];

    for (const movie of MOVIES) {
      for (const dicho of descartadas) {
        expect(isWorthSubmitting(dicho)).toBe(false);
        expect(matchQuote(dicho, movie.quotes, [])).toBeNull();
      }
    }
  });

  it("el umbral es el del dataset, no un número suelto", () => {
    const casiCorta = Array.from({ length: MIN_QUOTE_WORDS - 1 }, () => "hola").join(" ");
    const justo = Array.from({ length: MIN_QUOTE_WORDS }, () => "hola").join(" ");

    expect(isWorthSubmitting(casiCorta)).toBe(false);
    expect(isWorthSubmitting(justo)).toBe(true);
  });
});

describe("idioma", () => {
  it("es español latino, el mismo del doblaje que tiene el dataset", () => {
    expect(RECOGNITION_LANG).toBe("es-419");
  });
});
