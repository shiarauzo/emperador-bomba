import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const CLIENT_DIRS = ["app", "lib", "components"];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    // Los tests no se empaquetan, y este mismo archivo nombra la variable.
    if (/\.test\.(ts|tsx)$/.test(entry)) return [];
    return /\.(ts|tsx|js|jsx)$/.test(entry) ? [full] : [];
  });
}

/**
 * La `sk_` da permiso para publicar como cualquiera en cualquier canal. Todo lo
 * que está bajo `app/` y `lib/` puede terminar en el bundle del navegador, así
 * que nombrarla ahí ya es un error aunque hoy nadie la lea.
 *
 * Este test corre sin build: falla en el momento en que alguien la escribe, no
 * cuando alguien se acuerda de revisar el bundle.
 */
describe("la clave secreta no llega al cliente", () => {
  const files = CLIENT_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("encuentra código de cliente para revisar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("ningún fuente de cliente menciona PORTAL_SECRET", () => {
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("PORTAL_SECRET"),
    );

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("ningún fuente de cliente contiene una clave secreta literal", () => {
    const offenders = files.filter((file) =>
      /\bsk_[A-Za-z0-9_-]{16,}/.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
});
