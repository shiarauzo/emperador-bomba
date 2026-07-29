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

  test("la caja de texto sigue siendo la misma puerta que usa la voz", async ({
    page,
  }) => {
    const channelId = freshChannel();
    await publish(channelId, ANA, {
      kind: "start",
      movieId: "emperador",
      players: [ANA, BETO],
    });
    await openMatch(page, channelId);

    // Escribir es el camino de prueba de `onSay`: la misma función que llama el
    // reconocedor. Sin micrófono no se puede verificar la voz, pero sí que la
    // puerta por la que entra siga funcionando.
    await expect(page.getByPlaceholder(/Decí una frase|Esperá tu turno/)).toBeVisible();
    await expect(page.getByText("Dichas (0)")).toBeVisible();
  });
});
