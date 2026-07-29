"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fitsInChannel,
  isCaller,
  isSignalBody,
  type SignalBody,
  type SignalPayload,
} from "./signal";

/** STUN público. Sin TURN: ver el riesgo asumido en docs/shaping.md, D7.4. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export type CallStatus =
  | "idle"
  | "asking-mic"
  | "mic-denied"
  | "connecting"
  | "connected"
  | "failed"
  | "ended";

interface IncomingSignal {
  id: string;
  timestamp: number;
  from: string;
  body: SignalBody;
}

interface CallInput {
  meId: string | undefined;
  peerId: string | undefined;
  /** Mensajes del canal, para leer la señalización dirigida a mí. */
  signals: readonly IncomingSignal[];
  publish: (body: SignalBody) => Promise<void>;
}

export interface CallResult {
  status: CallStatus;
  muted: boolean;
  error: string | null;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
}

/**
 * Llamada de audio punto a punto, con Portal como señalización.
 *
 * El audio nunca pasa por Portal: Portal no lleva media —los kinds de media
 * están rechazados en v1 y el contenido tope es 2 KB— así que sólo transporta el
 * "así te encuentro". La voz va directo entre los dos navegadores.
 *
 * Sólo audio, y no por preferencia: una oferta de audio pesa ~1.2 KB y entra en
 * el límite; con video sube a ~5.7 KB y habría que fragmentarla y rearmarla.
 */
export function useAudioCall({
  meId,
  peerId,
  signals,
  publish,
}: CallInput): CallResult {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const handled = useRef(new Set<string>());
  /** La oferta remota puede llegar antes que los candidatos; se encolan. */
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const send = useCallback(
    async (payload: SignalPayload) => {
      if (!peerId) return;
      const body: SignalBody = { kind: "rtc", to: peerId, payload };
      if (!fitsInChannel(body)) {
        setError("La señalización no entra en el límite del canal.");
        setStatus("failed");
        return;
      }
      await publish(body);
    },
    [peerId, publish],
  );

  /**
   * Adjunta el micrófono a la conexión, una sola vez.
   *
   * Se llama desde dos lados —al entrar y al contestar una oferta— y WebRTC
   * rechaza agregar dos veces la misma pista: "A sender already exists for the
   * track". Cuál de los dos llega primero depende de la carrera entre el permiso
   * de micrófono y la llegada de la oferta, así que ninguno puede asumir que es
   * el primero.
   */
  const attachLocalTracks = useCallback((connection: RTCPeerConnection) => {
    const stream = localStream.current;
    if (!stream) return;
    const attached = new Set(
      connection.getSenders().map((sender) => sender.track).filter(Boolean),
    );
    for (const track of stream.getTracks()) {
      if (!attached.has(track)) connection.addTrack(track, stream);
    }
  }, []);

  const teardown = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    if (remoteAudio.current) {
      remoteAudio.current.srcObject = null;
      remoteAudio.current.remove();
      remoteAudio.current = null;
    }
    pendingIce.current = [];
  }, []);

  useEffect(() => teardown, [teardown]);

  const ensurePeer = useCallback(() => {
    if (pc.current) return pc.current;

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    connection.onicecandidate = (event) => {
      if (event.candidate) void send({ type: "ice", candidate: event.candidate.toJSON() });
    };

    connection.ontrack = (event) => {
      // El audio remoto necesita un elemento que lo reproduzca. Se crea acá y no
      // en el árbol de React porque su ciclo de vida es el de la conexión.
      let audio = remoteAudio.current;
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        document.body.append(audio);
        remoteAudio.current = audio;
      }
      audio.srcObject = event.streams[0];
      void audio.play().catch(() => {
        setError("El navegador bloqueó la reproducción del audio.");
      });
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "connected") setStatus("connected");
      if (state === "failed") {
        // Sin TURN esto es lo esperable en redes con NAT simétrico.
        setError(
          "No se pudo establecer la conexión directa. Suele ser la red; el juego sigue jugable.",
        );
        setStatus("failed");
      }
      if (state === "disconnected" || state === "closed") setStatus("ended");
    };

    pc.current = connection;
    return connection;
  }, [send]);

  const join = useCallback(() => {
    if (!meId || !peerId) return;
    setError(null);
    setStatus("asking-mic");

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // La cancelación de eco importa de verdad acá: la voz del otro sale
          // por los parlantes y el reconocedor propio podría atribuírsela a
          // quien tiene el micrófono. Con auriculares desaparece del todo.
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        setStatus("mic-denied");
        setError("Sin micrófono no hay llamada. El juego sigue jugable por texto.");
        return;
      }

      localStream.current = stream;
      setStatus("connecting");

      const connection = ensurePeer();
      attachLocalTracks(connection);

      if (isCaller(meId, peerId)) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await send({ type: "offer", sdp: offer.sdp ?? "" });
      }
    })();
  }, [attachLocalTracks, ensurePeer, meId, peerId, send]);

  const leave = useCallback(() => {
    void send({ type: "bye" });
    teardown();
    setStatus("ended");
  }, [send, teardown]);

  const toggleMute = useCallback(() => {
    const tracks = localStream.current?.getAudioTracks() ?? [];
    // Silenciar deshabilita la pista, no cierra la conexión: colgar y volver a
    // llamar por bajar el volumen sería absurdo.
    const next = tracks.length > 0 ? tracks[0].enabled : false;
    tracks.forEach((track) => (track.enabled = !next));
    setMuted(next);
  }, []);

  // Consumir la señalización dirigida a mí, una sola vez por mensaje.
  useEffect(() => {
    if (!meId || !peerId) return;
    if (status === "idle" || status === "mic-denied") return;

    void (async () => {
      for (const signal of signals) {
        if (handled.current.has(signal.id)) continue;
        if (signal.body.to !== meId) continue;
        if (signal.from !== peerId) continue;
        handled.current.add(signal.id);

        const connection = ensurePeer();
        const { payload } = signal.body;

        try {
          if (payload.type === "offer") {
            await connection.setRemoteDescription({ type: "offer", sdp: payload.sdp });
            attachLocalTracks(connection);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await send({ type: "answer", sdp: answer.sdp ?? "" });
          } else if (payload.type === "answer") {
            await connection.setRemoteDescription({ type: "answer", sdp: payload.sdp });
          } else if (payload.type === "ice") {
            if (connection.remoteDescription) {
              await connection.addIceCandidate(payload.candidate);
            } else {
              // Todavía no hay descripción remota: guardarlo para después.
              pendingIce.current.push(payload.candidate);
            }
          } else if (payload.type === "bye") {
            teardown();
            setStatus("ended");
            return;
          }

          if (connection.remoteDescription && pendingIce.current.length > 0) {
            const queued = pendingIce.current.splice(0);
            for (const candidate of queued) await connection.addIceCandidate(candidate);
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Falló la señalización");
          setStatus("failed");
        }
      }
    })();
  }, [attachLocalTracks, ensurePeer, meId, peerId, send, signals, status, teardown]);

  return { status, muted, error, join, leave, toggleMute };
}

export { isSignalBody };
