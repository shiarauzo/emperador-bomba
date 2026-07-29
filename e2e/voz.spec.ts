import { expect, test, type Page } from "@playwright/test";
import { publish, ANA, BETO } from "./seed";

function freshChannel(): string {
  return `e2e-voz-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function openMatch(page: Page, channelId: string) {
  await page.goto(`/?canal=${channelId}`);
  await expect(page.getByText(/ronda \d+/)).toBeVisible({ timeout: 30_000 });
}

test.describe("jugar por voz", () => {
  test("el micrófono sigue el turno, y dice qué está haciendo", async ({
    page,
  }) => {
    const channelId = freshChannel();
    // Partida sembrada entre dos ids que no son este navegador: así la pantalla
    // es espectadora y nunca le toca el turno.
    await publish(channelId, ANA, {
      kind: "start",
      movieId: "emperador",
      players: [ANA, BETO],
    });

    await openMatch(page, channelId);

    // El estado del micrófono siempre se dice; nunca falla en silencio.
    const estado = page.getByText(
      /Escuchando…|Micrófono apagado|Te toca esperar|Sin reconocimiento de voz|Micrófono denegado/,
    );
    await expect(estado).toBeVisible();

    // Como esta pantalla no juega, no puede estar escuchando: publicar lo que
    // dice quien no tiene el turno sólo ensuciaría el canal.
    await expect(page.getByText("Escuchando…")).toHaveCount(0);

    // Y el control existe siempre, aunque el navegador no soporte voz.
    await expect(
      page.getByRole("button", { name: /Apagar micrófono|Encender micrófono/ }),
    ).toBeVisible();
  });

  test("la puerta por la que entra la voz funciona: escribir una frase puntúa", async ({
    browser,
  }) => {
    const channelId = freshChannel();

    // Hacen falta dos pantallas reales porque el turno tiene que ser de una de
    // ellas: con una partida sembrada entre otros ids, nadie puede jugar.
    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const a = await uno.newPage();
    const b = await dos.newPage();

    for (const page of [a, b]) {
      await page.goto(`/?canal=${channelId}`);
      await expect(page.getByText(/CONECTADO · SOS/i)).toBeVisible({
        timeout: 30_000,
      });
    }

    const idB = (await b.getByText(/CONECTADO · SOS/i).innerText())
      .split("SOS")
      .pop()!
      .trim();

    await a.getByRole("button", { name: idB, exact: false }).first().click();
    await a.getByRole("button", { name: "Empezar partida" }).click();
    await expect(a.getByText(/ronda \d+/)).toBeVisible({ timeout: 30_000 });
    await expect(a.getByText("Dichas (0)")).toBeVisible();

    // Escribir llega al motor por `submitPhrase`, exactamente la misma función
    // que llama el reconocedor. La voz no se puede automatizar; esta puerta sí,
    // y es la que garantiza que no haya un segundo camino.
    await a.getByPlaceholder("Decí una frase de la película").fill("eh, no existe tal cosa");
    await a.getByRole("button", { name: "Decir" }).click();

    await expect(a.getByText("Dichas (1)")).toBeVisible({ timeout: 20_000 });
    // La frase aparece en dos lados —el banner de la última acertada y la lista
    // de dichas— así que se acota a la lista para no depender de cuál.
    await expect(
      a.locator("section li").filter({ hasText: "no existe tal cosa" }),
    ).toHaveCount(1);
    // Y llega a la otra pantalla, que es lo que prueba que pasó por el canal.
    await expect(b.getByText("Dichas (1)")).toBeVisible({ timeout: 20_000 });

    await uno.close();
    await dos.close();
  });
});
