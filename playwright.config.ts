import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env.local", quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  // Las pruebas siembran canales y esperan mechas: dejar margen.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // NEXT_PUBLIC_E2E habilita `?canal=`, que es lo que permite que cada corrida
    // siembre un canal propio en vez de ensuciar el real. Es de build a
    // propósito: el bundle de producción no lo lleva.
    command: `npm run build && npx next start --port ${PORT}`,
    env: { NEXT_PUBLIC_E2E: "1" },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
