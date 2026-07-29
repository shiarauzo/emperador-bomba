import { describe, expect, it } from "vitest";
import { nextDrainStep, type DrainConditions } from "./use-drained-history";

const base: DrainConditions = {
  enabled: true,
  gaveUp: false,
  hasPrevious: true,
  isLoadingPrevious: false,
  pagesRequested: 0,
};

describe("nextDrainStep", () => {
  it("pide una página cuando queda historial y no hay nada en vuelo", () => {
    expect(nextDrainStep(base)).toBe("load");
  });

  it("no hace nada sin canal", () => {
    expect(nextDrainStep({ ...base, enabled: false })).toBe("idle");
  });

  it("termina cuando ya no queda historial", () => {
    expect(nextDrainStep({ ...base, hasPrevious: false })).toBe("done");
  });

  it("espera mientras hay una petición en vuelo", () => {
    expect(nextDrainStep({ ...base, isLoadingPrevious: true })).toBe("idle");
  });

  it("no gasta presupuesto mientras espera", () => {
    // Ésta era la fuga: cada mensaje en vivo redisparaba el efecto y sumaba al
    // contador sin traer una sola página.
    const enVuelo = { ...base, isLoadingPrevious: true, pagesRequested: 99 };
    expect(nextDrainStep(enVuelo)).toBe("idle");
  });

  it("se rinde al llegar al tope en vez de seguir pidiendo", () => {
    expect(nextDrainStep({ ...base, pagesRequested: 100 })).toBe("give-up");
  });

  it("rendirse libera la pantalla: no vuelve a 'load' ni se queda esperando", () => {
    // El bug original: al tope se dejaba de pedir sin marcar nada, `hasPrevious`
    // seguía en `true`, y la pantalla quedaba cargando para siempre.
    const rendido = { ...base, gaveUp: true, pagesRequested: 100 };
    expect(nextDrainStep(rendido)).toBe("done");
  });

  it("una vez rendido no reintenta aunque llegue historial nuevo", () => {
    expect(nextDrainStep({ ...base, gaveUp: true, hasPrevious: true })).toBe(
      "done",
    );
  });
});
