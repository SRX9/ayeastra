import { describe, expect, test } from "bun:test";

import { rrfMerge, topSimilarity } from "./merge";
import {
  decideRefusal,
  MIN_TOP_SIMILARITY,
  refusalMessage,
} from "./refusal";
import type { RetrievedItem } from "./retrieval";

function item(id: string, score: number): RetrievedItem {
  return {
    id,
    kind: "signal",
    text: id,
    entityId: "e1",
    date: new Date(),
    score,
    evidenceIds: [],
  };
}

describe("rrf merge", () => {
  test("items in both lists outrank single-list items", () => {
    const vector = [item("signal:a", 0.9), item("signal:b", 0.8)];
    const keyword = [item("signal:c", 0.4), item("signal:a", 0.2)];
    const merged = rrfMerge([vector, keyword]);
    expect(merged[0]!.id).toBe("signal:a");
    expect(merged).toHaveLength(3);
  });

  test("dedups by id and keeps the max score", () => {
    const merged = rrfMerge([[item("signal:a", 0.9)], [item("signal:a", 0.1)]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.score).toBe(0.9);
  });

  test("respects limit", () => {
    const list = Array.from({ length: 40 }, (_, i) => item(`signal:${i}`, 1 - i / 100));
    expect(rrfMerge([list], 10)).toHaveLength(10);
  });

  test("topSimilarity spans lists, null when empty", () => {
    expect(topSimilarity([[item("a", 0.3)], [item("b", 0.7)]])).toBe(0.7);
    expect(topSimilarity([[], []])).toBeNull();
  });
});

describe("refusal gate", () => {
  const goodRetrieval = { topSimilarity: 0.8, resultCount: 5 };

  test("internal-data questions refuse regardless of retrieval", () => {
    const r = decideRefusal(
      { scope: "internal_data", entityIds: [], unmatchedMentions: [] },
      goodRetrieval,
    );
    expect(r).toEqual({ kind: "internal_data" });
  });

  test("only-unwatched entities → coverage offer", () => {
    const r = decideRefusal(
      { scope: "external_intel", entityIds: [], unmatchedMentions: ["Adyen"] },
      goodRetrieval,
    );
    expect(r).toEqual({ kind: "unwatched", mentions: ["Adyen"] });
    expect(refusalMessage(r!, ["Stripe"])).toContain("Adyen");
    expect(refusalMessage(r!, ["Stripe"])).toContain("Stripe");
  });

  test("mixed watched+unwatched answers (gap goes in the answer)", () => {
    const r = decideRefusal(
      { scope: "external_intel", entityIds: ["e1"], unmatchedMentions: ["Adyen"] },
      goodRetrieval,
    );
    expect(r).toBeNull();
  });

  test("weak retrieval refuses instead of guessing", () => {
    const parsed = {
      scope: "external_intel" as const,
      entityIds: ["e1"],
      unmatchedMentions: [],
    };
    expect(
      decideRefusal(parsed, { topSimilarity: MIN_TOP_SIMILARITY - 0.01, resultCount: 5 }),
    ).toEqual({ kind: "insufficient_evidence" });
    expect(
      decideRefusal(parsed, { topSimilarity: null, resultCount: 0 }),
    ).toEqual({ kind: "insufficient_evidence" });
    expect(
      decideRefusal(parsed, { topSimilarity: 0.9, resultCount: 1 }),
    ).toEqual({ kind: "insufficient_evidence" });
  });

  test("good retrieval answers", () => {
    expect(
      decideRefusal(
        { scope: "external_intel", entityIds: ["e1"], unmatchedMentions: [] },
        goodRetrieval,
      ),
    ).toBeNull();
  });
});
