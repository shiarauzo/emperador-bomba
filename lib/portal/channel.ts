import type { Message } from "@portalsdk/core";
import type { GameEvent, GameEventBody } from "@/lib/engine/types";

/** Por ahora una sola sala. Salas con link compartible están fuera de alcance. */
export const CHANNEL_ID = "emperador-bomba";

/** Lo que viaja en `content`. El texto va crudo: el matching es del motor. */
export type GameMessage = Message<GameEventBody>;

function isGameEventBody(content: unknown): content is GameEventBody {
  if (typeof content !== "object" || content === null) return false;
  const kind = (content as { kind?: unknown }).kind;
  return kind === "start" || kind === "say" || kind === "boom";
}

/**
 * Traduce los mensajes del canal a los eventos que come el motor.
 *
 * El SDK no expone `seq` — lo declara explícitamente una preocupación de
 * transporte — pero sí promete que `messages` es una ventana ordenada por `seq`.
 * Así que el índice del array *es* el orden de `seq`, y alcanza para todo lo que
 * el motor necesita: ordenar el fold y desempatar dos explosiones simultáneas.
 *
 * De ahí se sigue algo incómodo: derivar sobre un historial parcial no da un
 * juego incompleto, da **otro** juego. Drenar el canal entero (ticket #5) es un
 * requisito de corrección, no una comodidad para reconexiones.
 *
 * Los mensajes propios sin confirmar quedan afuera a propósito. Su lugar final
 * en el orden todavía no está decidido por el servidor — y además su `id` es
 * temporal, así que la duración de la mecha derivada de él cambiaría al llegar
 * el ack.
 *
 * Límite conocido: un mensaje retractado llega con `content: null` y su `status`
 * intacto, así que desaparece del historial sin dejar rastro. Nada de esta app
 * retracta, pero si alguna vez se retractara una explosión la mecha no volvería
 * a abrirse y la partida quedaría trabada. Desde acá no hay forma de recuperar
 * el contenido.
 */
export function toGameEvents(messages: readonly GameMessage[]): GameEvent[] {
  const events: GameEvent[] = [];

  messages.forEach((message, index) => {
    if (message.status !== "sent") return;
    if (!isGameEventBody(message.content)) return;

    events.push({
      id: message.id,
      seq: index,
      timestamp: message.timestamp,
      playerId: message.sender.id,
      body: message.content,
    });
  });

  return events;
}
