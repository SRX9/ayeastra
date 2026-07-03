import { describe, expect, test } from "bun:test";

import { answerAsk } from "./answer-ask";
import { parseAskQuery } from "./parse-ask-query";
import { rerankResults } from "./rerank-results";

/** The validate hooks are the mechanical guarantees — test them directly. */

describe("parse-ask-query validate", () => {
  const input = {
    query: "q",
    today: "2026-07-03",
    watchedEntities: [{ id: "e-1", name: "Stripe", aliases: [] }],
    thread: [],
  };
  const output = {
    scope: "external_intel" as const,
    entityIds: ["e-1"],
    unmatchedMentions: [],
    from: null,
    to: null,
    categories: [],
    intent: "summary" as const,
    rewrittenQuery: "q",
  };

  test("accepts watched entity ids", () => {
    expect(parseAskQuery.validate!(output, input)).toEqual([]);
  });

  test("rejects hallucinated entity ids", () => {
    const issues = parseAskQuery.validate!(
      { ...output, entityIds: ["e-999"] },
      input,
    );
    expect(issues[0]).toContain("e-999");
  });

  test("rejects inverted date ranges", () => {
    const issues = parseAskQuery.validate!(
      { ...output, from: "2026-07-01", to: "2026-06-01" },
      input,
    );
    expect(issues).toHaveLength(1);
  });
});

describe("rerank-results validate", () => {
  const input = {
    query: "q",
    candidates: [
      { id: "C1", text: "a" },
      { id: "C2", text: "b" },
    ],
  };

  test("accepts a subset in any order", () => {
    expect(rerankResults.validate!({ ranked: ["C2"] }, input)).toEqual([]);
  });

  test("rejects unknown and duplicate ids", () => {
    const issues = rerankResults.validate!(
      { ranked: ["C1", "C1", "C9"] },
      input,
    );
    expect(issues.join(" ")).toContain("duplicate");
    expect(issues.join(" ")).toContain("C9");
  });
});

describe("answer-ask citation enforcement", () => {
  const input = {
    question: "q",
    intent: "summary" as const,
    facts: [{ ref: "F1", text: "fact", date: null, entity: null }],
  };

  test("accepts blocks citing real facts", () => {
    const issues = answerAsk.validate!(
      {
        blocks: [{ heading: null, text: "t", refs: ["F1"] }],
        confidence: "high",
        gaps: null,
      },
      input,
    );
    expect(issues).toEqual([]);
  });

  test("rejects fabricated refs — a claim without evidence cannot render", () => {
    const issues = answerAsk.validate!(
      {
        blocks: [{ heading: null, text: "t", refs: ["F7"] }],
        confidence: "high",
        gaps: null,
      },
      input,
    );
    expect(issues[0]).toContain("F7");
  });
});
