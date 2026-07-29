"use client";

import type { ChannelStatus, DetailedPresence } from "@portalsdk/core";
import { useChannel } from "@portalsdk/react";
import { useEffect, useMemo, useRef, useState } from "react";

/** The shape of `content` on every message in this channel. */
type ChatMessage = { text: string };

const CHANNEL_ID = "hello-world";

const STATUS_COPY: Record<ChannelStatus, { label: string; tone: string }> = {
  idle: { label: "Idle", tone: "bg-neutral-500" },
  connecting: { label: "Connecting", tone: "bg-amber-500 animate-pulse" },
  ready: { label: "Live", tone: "bg-emerald-500" },
  reconnecting: { label: "Reconnecting", tone: "bg-amber-500 animate-pulse" },
  degraded: { label: "Degraded", tone: "bg-amber-500" },
  "degraded-http": { label: "Degraded (HTTP only)", tone: "bg-amber-500" },
  blocked: { label: "Blocked", tone: "bg-red-500" },
};

/** Anonymous ids are long and opaque; named senders (e.g. the CLI) are not. */
function label(id: string) {
  return id.length > 12 ? `guest-${id.slice(-4)}` : id;
}

export function ChatRoom() {
  const [name, setName] = useState("");
  // Presence metadata travels on the connect frame, so the name is chosen before
  // joining. Until then `channelId` is undefined and the hook opens no connection.
  const [joinedAs, setJoinedAs] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    send,
    loadPrevious,
    hasPrevious,
    isLoadingPrevious,
    presence,
    typing,
    sendTyping,
    me,
    status,
  } = useChannel<ChatMessage>({
    channelId: joinedAs ? CHANNEL_ID : undefined,
    history: 50,
    metadata: joinedAs ? { name: joinedAs } : undefined,
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const others = useMemo(
    () => typing.filter((id) => id !== me?.id),
    [typing, me?.id],
  );

  const roster =
    presence?.kind === "detailed" ? (presence as DetailedPresence) : undefined;

  async function onSend(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    try {
      await send({ content: { text } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    }
  }

  if (!joinedAs) {
    return (
      <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">
            #{CHANNEL_ID}
          </h1>
          <p className="text-sm text-neutral-500">
            Anonymous mode — no sign-in, no token endpoint.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setJoinedAs(name.trim() || "guest");
          }}
          className="flex flex-col gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            autoFocus
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Join channel
          </button>
        </form>
      </div>
    );
  }

  const badge = STATUS_COPY[status] ?? STATUS_COPY.idle;

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight">
            #{CHANNEL_ID}
          </h1>
          <p className="text-sm text-neutral-500">
            {presence ? `${presence.count} online` : "connecting…"} · you are{" "}
            {joinedAs}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/15">
          <span className={`size-2 rounded-full ${badge.tone}`} />
          {badge.label}
        </span>
      </header>

      {roster && roster.participants.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {roster.participants.map((p) => (
            <li
              key={p.id}
              className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            >
              {(p.metadata?.name as string | undefined) ?? label(p.id)}
              {p.id === me?.id && " (you)"}
            </li>
          ))}
        </ul>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-black/10 dark:border-white/15">
        {hasPrevious && (
          <button
            type="button"
            onClick={() => loadPrevious()}
            disabled={isLoadingPrevious}
            className="border-b border-black/10 py-2 text-xs text-neutral-500 hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
          >
            {isLoadingPrevious ? "Loading…" : "Load earlier messages"}
          </button>
        )}

        <ol className="flex flex-1 flex-col gap-3 p-4">
          {messages.length === 0 && (
            <li className="m-auto text-sm text-neutral-500">
              No messages yet. Say something.
            </li>
          )}
          {messages.map((m) => {
            const mine = m.sender.id === me?.id;
            return (
              <li
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <span className="px-1 text-[11px] text-neutral-500">
                  {mine ? "you" : (m.sender.username ?? label(m.sender.id))}
                  {" · "}
                  {new Date(m.timestamp).toLocaleTimeString()}
                  {m.status === "pending" && " · sending"}
                  {m.status === "failed" && " · failed"}
                </span>
                <p
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-foreground text-background"
                      : "bg-black/5 dark:bg-white/10"
                  } ${m.status === "pending" ? "opacity-60" : ""}`}
                >
                  {m.content.text}
                </p>
              </li>
            );
          })}
          <div ref={bottomRef} />
        </ol>
      </div>

      <p className="h-4 text-xs text-neutral-500">
        {others.length > 0 &&
          `${others.length} ${others.length === 1 ? "person is" : "people are"} typing…`}
      </p>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={onSend} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            sendTyping();
          }}
          placeholder="Message #hello-world"
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === "blocked"}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
