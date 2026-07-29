/**
 * Señalización de la llamada, sobre el mismo canal que el juego.
 *
 * Va en mensajes **persistentes** y no efímeros, aunque un efímero sería lo
 * natural para algo transitorio: Portal v1 los envía pero no los entrega. El
 * core los descarta en `ingest` antes de convertirlos en evento — "incoming
 * ephemeral messages (no seq) are not modeled (…) so they are dropped here" —
 * así que el otro lado nunca los vería.
 *
 * El precio de persistirlos es que quedan en el historial: al reconectar vuelven
 * ofertas viejas, y hay que descartarlas por antigüedad.
 *
 * Nada de esto llega al motor del juego: el adaptador de canal sólo acepta los
 * `kind` que conoce, así que un mensaje de señalización no es un evento de
 * partida y no puede alterar turnos, vidas ni marcador.
 */

/** Límite duro de `content` en Portal. */
export const MAX_CONTENT_BYTES = 2048;

export type SignalBody = {
  kind: "rtc";
  /** Id del destinatario. Se difunde y cada quien filtra: `to` a nivel de
   *  Portal exige ser miembro del canal, cosa que en modo anónimo no aplica. */
  to: string;
  payload: SignalPayload;
};

export type SignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  /** Colgar explícito: sin esto el otro lado se entera recién por timeout. */
  | { type: "bye" };

export function isSignalBody(content: unknown): content is SignalBody {
  if (typeof content !== "object" || content === null) return false;
  const body = content as Partial<SignalBody>;
  if (body.kind !== "rtc") return false;
  if (typeof body.to !== "string") return false;

  const payload = body.payload as Partial<SignalPayload> | undefined;
  if (!payload || typeof payload !== "object") return false;

  switch (payload.type) {
    case "offer":
    case "answer":
      return typeof (payload as { sdp?: unknown }).sdp === "string";
    case "ice":
      return typeof (payload as { candidate?: unknown }).candidate === "object";
    case "bye":
      return true;
    default:
      return false;
  }
}

/**
 * Cuánto pesa un cuerpo de señalización una vez serializado.
 *
 * Medido contra el canal real: una oferta de sólo audio ronda los 1.2 KB y entra
 * con margen; agregarle video la lleva a ~5.7 KB, que no entra. Por eso la
 * llamada es sólo audio y esto es una guarda, no una formalidad.
 */
export function contentBytes(body: SignalBody): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

export function fitsInChannel(body: SignalBody): boolean {
  return contentBytes(body) <= MAX_CONTENT_BYTES;
}

/**
 * Quién ofrece y quién contesta, decidido sin negociar.
 *
 * Los dos clientes conocen los dos ids, así que comparar alcanza: el menor
 * ofrece. Sin esto los dos ofrecerían a la vez y habría que resolver la colisión.
 */
export function isCaller(meId: string, peerId: string): boolean {
  return meId < peerId;
}
