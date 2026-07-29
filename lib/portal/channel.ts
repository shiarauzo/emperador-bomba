import type { Message } from "@portalsdk/core";
import type { GameEvent, GameEventBody } from "@/lib/engine/types";

/** Por ahora una sola sala. Salas con link compartible están fuera de alcance. */
export const DEFAULT_CHANNEL_ID = "emperador-bomba";

/**
 * Resuelve contra qué canal jugar.
 *
 * En producción siempre es el canal fijo. Sólo cuando el build se marcó como de
 * pruebas se acepta `?canal=`, porque sembrar más de cincuenta mensajes sobre el
 * canal real lo dejaría sucio para siempre y cada corrida lo empeoraría.
 *
 * La bandera es de build, no de runtime, justamente para que el mecanismo no
 * exista en el bundle que usa la gente: la barra de direcciones también es una
 * interfaz, y esto no es la funcionalidad de salas compartibles.
 *
 * Devuelve `undefined` durante el render en servidor, que es lo que `useChannel`
 * espera para no abrir conexión.
 */
export function channelIdFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (process.env.NEXT_PUBLIC_E2E !== "1") return DEFAULT_CHANNEL_ID;

  const requested = new URLSearchParams(window.location.search).get("canal");
  return requested?.trim() || DEFAULT_CHANNEL_ID;
}

/**
 * Un mensaje del canal, sin suponer nada de su contenido.
 *
 * El canal lleva dos cosas: eventos de partida y señalización de la llamada. El
 * tipo no distingue porque la distinción es de runtime — `isGameEventBody` es
 * quien decide qué es un evento del juego, y todo lo demás se descarta.
 */
export type GameMessage = Message<unknown>;

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
