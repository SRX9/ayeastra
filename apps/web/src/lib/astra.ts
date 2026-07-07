import type { UIMessage } from "ai";

/**
 * Message-shape helpers shared by the Astra route, the /ask page, and the
 * chat renderer. Pre-Astra ask_messages rows have no `parts`; the fallback
 * rule (parts ?? one text part from content) keeps old threads rendering.
 */

export interface StoredAskMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: unknown;
}

export function toUIMessages(rows: StoredAskMessage[]): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: Array.isArray(row.parts)
      ? (row.parts as UIMessage["parts"])
      : [{ type: "text" as const, text: row.content }],
  }));
}

/** Plain text of a UIMessage — thread previews and prior-turn context. */
export function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

/** Inline citation tokens the prompt mandates: [signal:<uuid>] / [change:<uuid>].
 * Tolerates a doubled prefix ([signal:signal:<uuid>]) — tool results carry the
 * prefix in their id, and models sometimes echo it verbatim inside the token. */
export const CITATION_RE = /\[(signal|change):(?:\1:)?([0-9a-fA-F-]{36})\]/g;

export interface CitationRef {
  kind: "signal" | "change";
  id: string;
}

export function extractCitations(text: string): CitationRef[] {
  const seen = new Set<string>();
  const refs: CitationRef[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind: match[1] as CitationRef["kind"], id: match[2]! });
  }
  return refs;
}
