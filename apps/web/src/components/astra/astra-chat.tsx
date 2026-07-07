"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { osButtonPrimary, osInput } from "@/components/os/ui";

import { AstraMessage } from "./astra-message";

/**
 * The shared Astra conversation — one brain, two surfaces: the floating
 * panel and the /ask page render this same component. The server owns
 * history; each request carries only the newest message plus the thread id
 * (captured from the first response's X-Astra-Thread-Id header).
 */

export function AstraChat({
  threadId: initialThreadId,
  initialMessages,
  suggestions = [],
  variant,
  onThreadChange,
}: {
  threadId?: string;
  initialMessages?: UIMessage[];
  suggestions?: string[];
  variant: "panel" | "page";
  /** Fires when the server mints a thread id for this conversation. */
  onThreadChange?: (threadId: string) => void;
}) {
  const threadRef = useRef<string | undefined>(initialThreadId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  // The transport is memoized once; read the latest callback through a ref.
  const onThreadChangeRef = useRef(onThreadChange);
  onThreadChangeRef.current = onThreadChange;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/astra/chat",
        fetch: (async (info: RequestInfo | URL, init?: RequestInit) => {
          const res = await fetch(info, init);
          const id = res.headers.get("X-Astra-Thread-Id");
          if (id && id !== threadRef.current) {
            threadRef.current = id;
            onThreadChangeRef.current?.(id);
          }
          return res;
        }) as typeof fetch,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages[messages.length - 1],
            threadId: threadRef.current,
            pathname: window.location.pathname,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
  });

  // Keep the newest message in view while streaming.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const isPanel = variant === "panel";

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${isPanel ? "" : "gap-3"}`}>
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${
          isPanel ? "px-3 py-3" : "py-1"
        }`}
      >
        {messages.length === 0 && (
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted">
              Ask anything — how the platform works, your business context, or
              what the companies you watch have been doing.
            </p>
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="block w-full cursor-pointer rounded-md border border-border px-3 py-1.5 text-left text-sm text-muted transition-colors hover:border-border-secondary hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <AstraMessage
            key={m.id}
            message={m}
            streaming={busy && i === messages.length - 1}
          />
        ))}
        {status === "submitted" && (
          <p className="text-shimmer font-mono text-[11px]">Thinking…</p>
        )}
        {error && (
          <p className="text-sm text-danger">
            Something went wrong — try again.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={`flex shrink-0 gap-2 ${isPanel ? "border-t border-border p-3" : ""}`}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask Astra"
          maxLength={2000}
          placeholder={
            messages.length > 0 ? "Follow up…" : "Ask Astra anything…"
          }
          className={`${osInput} min-w-0 flex-1 px-3 py-2`}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className={`${osButtonPrimary} px-3 py-2 disabled:cursor-default disabled:opacity-50`}
        >
          <ArrowUp size={14} strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
