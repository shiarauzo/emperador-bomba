import { expect, test, type Page } from "@playwright/test";

function freshChannel(): string {
  return `e2e-call-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function enterLobby(page: Page, channelId: string) {
  await page.goto(`/?canal=${channelId}`);
  await expect(page.getByText(/CONECTADO · SOS/i)).toBeVisible({
    timeout: 30_000,
  });
}

/** El id corto que la propia pantalla dice que sos. */
async function ownId(page: Page): Promise<string> {
  const text = await page.getByText(/CONECTADO · SOS/i).innerText();
  return text.split("SOS").pop()!.trim();
}

/** Cuántos elementos de audio tienen una pista remota sonando. */
async function remoteTracks(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll("audio")].filter(
      (a) => a.srcObject instanceof MediaStream && a.srcObject.getAudioTracks().length > 0,
    ).length,
  );
}

test.describe("la llamada de audio", () => {
  test("dos pestañas se escuchan sin ninguna herramienta externa", async ({
    browser,
  }) => {
    const channelId = freshChannel();

    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const a = await uno.newPage();
    const b = await dos.newPage();

    await enterLobby(a, channelId);
    await enterLobby(b, channelId);

    const idA = await ownId(a);
    const idB = await ownId(b);
    expect(idA).not.toBe(idB);

    // Cada quien elige al otro: eso habilita la llamada antes de empezar,
    // que es cuando hace falta ponerse de acuerdo.
    await a.getByRole("button", { name: idB, exact: false }).first().click();
    await b.getByRole("button", { name: idA, exact: false }).first().click();

    await a.getByRole("button", { name: "Entrar a la llamada" }).click();
    await b.getByRole("button", { name: "Entrar a la llamada" }).click();

    await expect(a.getByText("En llamada")).toBeVisible({ timeout: 45_000 });
    await expect(b.getByText("En llamada")).toBeVisible({ timeout: 45_000 });

    // Conectado no es lo mismo que escucharse: hace falta la pista remota.
    expect(await remoteTracks(a)).toBe(1);
    expect(await remoteTracks(b)).toBe(1);

    // Silenciar no corta la llamada.
    await a.getByRole("button", { name: "Silenciar" }).click();
    await expect(a.getByRole("button", { name: "Activar micrófono" })).toBeVisible();
    await expect(a.getByText("En llamada")).toBeVisible();
    expect(await remoteTracks(b)).toBe(1);

    await uno.close();
    await dos.close();
  });

  test("la señalización no cuenta como frases de la partida", async ({
    browser,
  }) => {
    const channelId = freshChannel();
    const uno = await browser.newContext();
    const dos = await browser.newContext();
    const a = await uno.newPage();
    const b = await dos.newPage();

    await enterLobby(a, channelId);
    await enterLobby(b, channelId);
    const idA = await ownId(a);
    const idB = await ownId(b);

    await a.getByRole("button", { name: idB, exact: false }).first().click();
    await b.getByRole("button", { name: idA, exact: false }).first().click();
    await a.getByRole("button", { name: "Entrar a la llamada" }).click();
    await b.getByRole("button", { name: "Entrar a la llamada" }).click();
    await expect(a.getByText("En llamada")).toBeVisible({ timeout: 45_000 });

    // Con la llamada ya establecida —nueve mensajes de señalización en el
    // canal— arrancar la partida tiene que dar un tablero limpio.
    await a.getByRole("button", { name: "Empezar partida" }).click();
    await expect(a.getByText(/ronda 1/)).toBeVisible({ timeout: 30_000 });
    await expect(a.getByText("Dichas (0)")).toBeVisible();
    await expect(a.getByText("Todavía nadie acertó.")).toBeVisible();

    await uno.close();
    await dos.close();
  });
});
