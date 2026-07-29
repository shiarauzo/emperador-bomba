import { expect, test, type Page } from "@playwright/test";
import { seedLongMatch } from "./seed";

/** Un canal por corrida: sembrar sobre el canal real lo ensuciaría para siempre. */
function freshChannel(name: string): string {
  return `e2e-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function openGame(page: Page, channelId: string) {
  await page.goto(`/?canal=${channelId}`);
  // El tablero no aparece hasta que el historial está drenado.
  await expect(page.getByText("Trayendo la partida…")).toHaveCount(0, {
    timeout: 30_000,
  });
}

/**
 * Lo que las dos pantallas tienen que ver igual.
 *
 * Se lee el número de ronda, no la línea entera: la línea incluye los segundos
 * que lleva ardiendo la mecha, y dos lecturas hechas con un segundo de
 * diferencia muestran números distintos aunque estén ancladas a la misma hora
 * del servidor. Eso no es una desincronización, es un reloj corriendo.
 */
async function readBoard(page: Page) {
  const cards = page.locator("ul > li").filter({ hasText: "♥" });
  const header = await page.getByText(/ronda \d+/).innerText();
  return {
    round: header.match(/ronda (\d+)/)?.[1],
    players: await cards.allInnerTexts(),
    said: await page.getByText(/^Dichas \(\d+\)$/i).innerText(),
  };
}

test.describe("historial completo del canal", () => {
  test("una partida de más de 50 mensajes se ve igual en dos pestañas", async ({
    browser,
  }) => {
    const channelId = freshChannel("largo");
    const { totalMessages } = await seedLongMatch(channelId);
    expect(totalMessages).toBeGreaterThan(50);

    // Dos contextos separados: almacenamiento aparte, identidades anónimas
    // distintas, igual que dos personas en dos máquinas.
    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const paginaUno = await uno.newPage();
    const paginaDos = await dos.newPage();

    await openGame(paginaUno, channelId);
    await openGame(paginaDos, channelId);

    // Si el historial no se drenara, el mensaje de arranque quedaría fuera de la
    // ventana y las dos verían la sala de espera en vez de la partida.
    await expect(paginaUno.getByText(/ronda 1/)).toBeVisible();
    await expect(paginaDos.getByText(/ronda 1/)).toBeVisible();

    const tableroUno = await readBoard(paginaUno);
    const tableroDos = await readBoard(paginaDos);

    expect(tableroUno.said).toBe("DICHAS (2)");
    expect(tableroDos.said).toBe(tableroUno.said);
    expect(tableroDos.round).toBe(tableroUno.round);

    // Las tarjetas dicen "vos" en la propia pantalla, así que se comparan las
    // vidas y el marcador, que son los mismos hechos para las dos.
    const marcador = (textos: string[]) =>
      textos.map((t) => t.replace(/^.*\n/, "")).sort();
    expect(marcador(tableroDos.players)).toEqual(marcador(tableroUno.players));

    await uno.close();
    await dos.close();
  });

  test("recargar a mitad de partida recupera el estado exacto", async ({
    page,
  }) => {
    const channelId = freshChannel("recarga");
    await seedLongMatch(channelId);

    await openGame(page, channelId);
    await expect(page.getByText(/ronda 1/)).toBeVisible();
    const antes = await readBoard(page);

    await page.reload();
    await openGame(page, channelId);
    await expect(page.getByText(/ronda 1/)).toBeVisible();
    const despues = await readBoard(page);

    expect(despues.said).toBe(antes.said);
    expect(despues.players).toEqual(antes.players);
  });
});
