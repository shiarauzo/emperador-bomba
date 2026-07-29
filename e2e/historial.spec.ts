import { expect, test, type Page } from "@playwright/test";
import { seedLongMatch } from "./seed";

/** Un canal por corrida: sembrar sobre el canal real lo ensuciaría para siempre. */
function freshChannel(name: string): string {
  return `e2e-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function openGame(page: Page, channelId: string) {
  await page.goto(`/?canal=${channelId}`);
  // Esperar algo que sólo existe una vez drenado, en vez de esperar a que el
  // cartel de carga desaparezca: ese cartel también está ausente en el frame
  // anterior a la hidratación, así que esperarlo pasaría sin probar nada.
  await expect(
    page.getByRole("button", { name: /Elegí rival|Falta que entre|Empezar/ }).or(
      page.getByText(/ronda \d+/),
    ),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Lo que las dos pantallas tienen que ver igual.
 *
 * No se lee la línea de la ronda entera: incluye los segundos que lleva ardiendo
 * la mecha, y dos lecturas con un segundo de diferencia dan números distintos
 * aunque estén ancladas a la misma hora del servidor. Eso es un reloj corriendo,
 * no una desincronización.
 */
async function readBoard(page: Page) {
  const header = await page.getByText(/ronda \d+/).innerText();
  const cards = page.locator("ul > li").filter({ hasText: "♥" });
  const said = page.locator("section li");

  return {
    round: header.match(/ronda (\d+)/)?.[1],
    /** Sin ordenar y sin recortar: quién tiene el turno y quién anotó importan. */
    cards: await cards.allInnerTexts(),
    said: await said.allInnerTexts(),
  };
}

/** Marcador por jugador, sin depender de cuál pantalla dice "vos". */
function scores(cards: string[]): number[] {
  return cards.map((card) => Number(card.match(/· (\d+) frases/)?.[1] ?? -1));
}

test.describe("historial completo del canal", () => {
  test("una partida de más de 50 mensajes se ve igual en dos pestañas", async ({
    browser,
  }) => {
    const channelId = freshChannel("largo");
    const seeded = await seedLongMatch(channelId);
    expect(seeded.totalMessages).toBeGreaterThan(50);

    // Dos contextos separados: almacenamiento aparte e identidades anónimas
    // distintas, igual que dos personas en dos máquinas.
    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const paginaUno = await uno.newPage();
    const paginaDos = await dos.newPage();

    await openGame(paginaUno, channelId);
    await openGame(paginaDos, channelId);

    // Sin drenar, el mensaje de arranque queda fuera de la ventana de cincuenta
    // y las dos pantallas mostrarían la sala de espera en vez de la partida.
    await expect(paginaUno.getByText(/ronda 1/)).toBeVisible();
    await expect(paginaDos.getByText(/ronda 1/)).toBeVisible();

    const tableroUno = await readBoard(paginaUno);
    const tableroDos = await readBoard(paginaDos);

    // Las frases, con su texto: contar dos no prueba que sean las mismas dos.
    for (const frase of seeded.expectedSaid) {
      expect(tableroUno.said.join(" | ")).toContain(frase);
    }
    expect(tableroDos.said).toEqual(tableroUno.said);
    expect(tableroDos.round).toBe(tableroUno.round);

    // El marcador es asimétrico, así que esta comparación no puede pasar sola.
    expect(scores(tableroUno.cards)).toEqual([2, 1]);
    expect(scores(tableroDos.cards)).toEqual(scores(tableroUno.cards));

    // Y las dos coinciden en de quién es el turno.
    const turno = (cards: string[]) => cards.findIndex((c) => c.includes("su turno"));
    expect(turno(tableroDos.cards)).toBe(turno(tableroUno.cards));
    expect(turno(tableroUno.cards)).toBeGreaterThanOrEqual(0);

    await uno.close();
    await dos.close();
  });

  test("una pestaña que entra tarde llega al mismo estado que la que estuvo desde el principio", async ({
    browser,
  }) => {
    const channelId = freshChannel("tarde");

    // Esta pestaña abre el canal vacío y arma su historial recibiendo mensajes
    // en vivo por el socket.
    const temprano = await browser.newContext();
    const paginaTemprano = await temprano.newPage();
    await openGame(paginaTemprano, channelId);

    const seeded = await seedLongMatch(channelId);
    await expect(paginaTemprano.getByText(/ronda 1/)).toBeVisible();

    // Esta lo arma drenando el historial. Son dos caminos de código distintos y
    // tienen que terminar en el mismo estado.
    const tarde = await browser.newContext();
    const paginaTarde = await tarde.newPage();
    await openGame(paginaTarde, channelId);
    await expect(paginaTarde.getByText(/ronda 1/)).toBeVisible();

    const enVivo = await readBoard(paginaTemprano);
    const drenado = await readBoard(paginaTarde);

    expect(drenado.said).toEqual(enVivo.said);
    expect(drenado.said.length).toBe(seeded.expectedSaid.length);
    expect(scores(drenado.cards)).toEqual(scores(enVivo.cards));
    expect(drenado.round).toBe(enVivo.round);

    await temprano.close();
    await tarde.close();
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

    // Turno, vidas y marcador viven en las tarjetas; las frases usadas, en la
    // lista. Se comparan las dos cosas, no un conteo.
    expect(despues.cards).toEqual(antes.cards);
    expect(despues.said).toEqual(antes.said);
    expect(despues.round).toBe(antes.round);
  });
});
