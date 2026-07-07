"use client";

import type { UIMessage } from "ai";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";

import { CITATION_RE, extractCitations } from "@/lib/astra";

import { submitAstraFeedback } from "./actions";

/**
 * Renders one UIMessage. Assistant text streams through Streamdown
 * (streaming-safe markdown); inline [signal:…]/[change:…] tokens are lifted
 * out of the prose into a compact sources row. Tool activity renders as a
 * one-line status — shimmering while running, settled when done.
 */

const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  intel_search: ["Searching your intelligence archive…", "Searched intelligence"],
  kb_search: ["Consulting the platform guide…", "Consulted the platform guide"],
  kb_article: ["Reading the platform guide…", "Read the platform guide"],
  business_context: ["Reading your business context…", "Read business context"],
};

function toolLabel(type: string, done: boolean): string {
  const name = type.replace(/^tool-/, "");
  const labels = TOOL_LABELS[name];
  if (labels) return done ? labels[1] : labels[0];
  return done ? "Checked your workspace" : "Checking your workspace…";
}

function AssistantText({ text }: { text: string }) {
  const clean = text.replace(CITATION_RE, "").replace(/ {2,}/g, " ");
  const citations = extractCitations(text);
  return (
    <div>
      <div className="text-sm [&_a]:text-accent [&_code]:font-mono [&_code]:text-[13px] [&_p]:my-1.5 [&_ul]:my-1.5">
        <Streamdown>{clean}</Streamdown>
      </div>
      {citations.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Sources
          </span>
          {citations.map((c) => (
            <span
              key={`${c.kind}:${c.id}`}
              title={`${c.kind}:${c.id}`}
              className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent"
            >
              {c.kind}·{c.id.slice(0, 4)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Thumbs on completed answers. Message ids are DB row ids (the transport
 * pre-mints them), so a vote references a real ask_messages row. */
function FeedbackThumbs({ messageId }: { messageId: string }) {
  const [voted, setVoted] = useState<"useful" | "not_useful" | null>(null);
  const vote = (verdict: "useful" | "not_useful") => {
    setVoted(verdict);
    void submitAstraFeedback(messageId, verdict);
  };
  return (
    <div className="flex items-center gap-0.5">
      {(
        [
          ["useful", ThumbsUp, "Helpful"],
          ["not_useful", ThumbsDown, "Not helpful"],
        ] as const
      ).map(([verdict, Icon, label]) => (
        <button
          key={verdict}
          type="button"
          aria-label={label}
          disabled={voted !== null}
          onClick={() => vote(verdict)}
          className={`cursor-pointer rounded-md p-1 transition-colors disabled:cursor-default ${
            voted === verdict
              ? "text-accent"
              : voted
                ? "text-muted/40"
                : "text-muted hover:text-foreground"
          }`}
        >
          <Icon size={12} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}

export function AstraMessage({
  message,
  streaming = false,
}: {
  message: UIMessage;
  streaming?: boolean;
}) {
  if (message.role === "user") {
    const text = message.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
    return (
      <div className="ml-10 rounded-lg bg-default px-3 py-2 text-sm whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  return (
    <div className="mr-4 space-y-1.5">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return <AssistantText key={i} text={part.text} />;
        }
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
          const state = "state" in part ? (part.state as string) : "";
          const done = state === "output-available" || state === "output-error";
          const type =
            part.type === "dynamic-tool" && "toolName" in part
              ? `tool-${part.toolName as string}`
              : part.type;
          return (
            <p
              key={i}
              className={`font-mono text-[11px] ${
                done ? "text-muted" : "text-shimmer"
              }`}
            >
              {toolLabel(type, done)}
            </p>
          );
        }
        return null;
      })}
      {!streaming && message.parts.some((p) => p.type === "text") && (
        <FeedbackThumbs messageId={message.id} />
      )}
    </div>
  );
}
