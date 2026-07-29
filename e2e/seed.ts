import type { GameEventBody } from "../lib/engine/types";

const API = "https://api.useportal.co/v1";

/**
 * Publica en el canal con la clave secreta, igual que lo haría un servidor.
 *
 * Los envíos van uno por uno a propósito: el orden de `seq` lo decide el momento
 * de llegada, y todo el motor se apoya en ese orden. Mandarlos en paralelo
 * sembraría una partida distinta en cada corrida.
 */
export async function publish(
  channelId: string,
  senderId: string,
  content: GameEventBody,
): Promise<void> {
  const secret = process.env.PORTAL_SECRET;
  if (!secret) {
    throw new Error(
      "Falta PORTAL_SECRET. Las pruebas de punta a punta siembran el canal con la clave secreta; sale de .env.local.",
    );
  }

  const response = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ senderId, content }),
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo sembrar el canal (${response.status}): ${await response.text()}`,
    );
  }
}

export const ANA = "e2e-ana";
export const BETO = "e2e-beto";

/**
 * Siembra una partida cuyo mensaje de arranque queda **fuera** del backfill por
 * defecto de cincuenta mensajes.
 *
 * Ese es el punto de la prueba: sin drenar el historial, el cliente no vería una
 * partida a medias — vería la sala de espera, porque el arranque se le cayó del
 * final de la ventana.
 */
export async function seedLongMatch(channelId: string) {
  await publish(channelId, ANA, {
    kind: "start",
    movieId: "emperador",
    players: [ANA, BETO],
  });

  // Relleno: nada de esto matchea, así que no mueve el estado. Sólo empuja el
  // arranque fuera de la ventana.
  for (let i = 0; i < 55; i++) {
    await publish(channelId, i % 2 === 0 ? ANA : BETO, {
      kind: "say",
      text: `relleno numero ${i} que no es ninguna frase`,
    });
  }

  // Marcador asimétrico a propósito: si los dos terminaran con la misma cifra,
  // comparar las tarjetas de una pantalla contra las de la otra pasaría aunque
  // discreparan sobre quién anotó.
  await publish(channelId, ANA, { kind: "say", text: "eh, no existe tal cosa" });
  await publish(channelId, BETO, {
    kind: "say",
    text: "jala la palanca kronk!",
  });
  await publish(channelId, ANA, {
    kind: "say",
    text: "¿por qué tenemos esa palanca?",
  });

  return {
    totalMessages: 59,
    /** Las frases canónicas, en el orden en que quedaron dichas. */
    expectedSaid: [
      "no existe tal cosa",
      "jala la palanca Kronk",
      "por qué tenemos esa palanca",
    ],
    expectedScores: { [ANA]: 2, [BETO]: 1 },
  };
}
