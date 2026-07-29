import { expect, test, type Page } from "@playwright/test";
import { seedLongMatch } from "./seed";

function freshChannel(name: string): string {
  return `e2e-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Mide la mecha como la ve el usuario: píxeles pintados, no el `transform`
 * calculado.
 *
 * La distinción no es teórica. La primera versión animaba `transform` sobre un
 * elemento que además llevaba la utilidad `scale-x-0` de Tailwind v4, que emite
 * la propiedad `scale` — y `scale` se compone multiplicativamente con
 * `transform`. El `transform` calculado decía 45%, la barra medía cero píxeles,
 * y nadie la vio nunca. Un test que hubiera leído el `transform` habría pasado.
 */
async function fuseWidth(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(
      "[data-testid='fuse-bar']",
    );
    if (!bar || !bar.parentElement) return null;
    const own = bar.getBoundingClientRect().width;
    const track = bar.parentElement.getBoundingClientRect().width;
    return { pct: (own / track) * 100, at: Date.now() };
  });
}

async function openMatch(page: Page, channelId: string) {
  await page.goto(`/?canal=${channelId}`);
  await expect(page.getByText(/ronda \d+/)).toBeVisible({ timeout: 30_000 });
}

test.describe("la mecha", () => {
  test("se ve: ocupa píxeles reales y avanza sola", async ({ page }) => {
    const channelId = freshChannel("mecha");
    await seedLongMatch(channelId);
    await openMatch(page, channelId);

    const primera = await fuseWidth(page);
    expect(primera).not.toBeNull();
    // La prueba que faltaba: la barra tiene que estar pintada de verdad.
    expect(primera!.pct).toBeGreaterThan(0);

    await page.waitForTimeout(4000);
    const segunda = await fuseWidth(page);

    // Avanza sola, sin que llegue ningún mensaje: la anima el navegador.
    expect(segunda!.pct).toBeGreaterThan(primera!.pct);

    // Y avanza al ritmo de la escala fija, no a saltos del ticker.
    const esperado = ((segunda!.at - primera!.at) / 90_000) * 100;
    expect(segunda!.pct - primera!.pct).toBeCloseTo(esperado, 0);
  });

  test("las dos pantallas la muestran en la misma posición", async ({
    browser,
  }) => {
    const channelId = freshChannel("mecha-sync");
    await seedLongMatch(channelId);

    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const paginaUno = await uno.newPage();
    const paginaDos = await dos.newPage();

    await openMatch(paginaUno, channelId);
    await openMatch(paginaDos, channelId);

    const a = await fuseWidth(paginaUno);
    const b = await fuseWidth(paginaDos);

    // No pueden ser idénticas: entre una medición y la otra pasa tiempo real.
    // La diferencia tiene que explicarse por ese tiempo y nada más.
    const derivaEsperada = (Math.abs(b!.at - a!.at) / 90_000) * 100;
    expect(Math.abs(b!.pct - a!.pct)).toBeLessThan(derivaEsperada + 0.5);

    await uno.close();
    await dos.close();
  });

  test("no revela cuánto falta: no hay cuenta atrás en pantalla", async ({
    page,
  }) => {
    const channelId = freshChannel("mecha-oculta");
    await seedLongMatch(channelId);
    await openMatch(page, channelId);

    const texto = await page.locator("body").innerText();

    // Ni segundos restantes, ni segundos transcurridos: con la marca de la zona
    // de peligro visible, un contador dejaría calcular el resto al segundo.
    expect(texto).not.toMatch(/\d+\s*s\b/);
    expect(texto).not.toMatch(/restan|faltan|quedan/i);
  });
});
