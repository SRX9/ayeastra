import { splitBlocks } from "./blocks";
import { contentHash, normalizeMarkdown } from "./normalize";
import { diffBlocks, type BlockDiff } from "./patience";

/**
 * Stages 0–1 of change detection, pure and deterministic (the model only
 * enters at stage 2, via @ayeastra/ai classify-change). The change.detect
 * job composes: capture → diffSnapshots → classify → extract → persist.
 */

export type DiffOutcome =
  | { changed: false; afterHash: string }
  | {
      changed: true;
      afterHash: string;
      diff: BlockDiff;
      /** Pricing numeric/table delta: materiality floor is `material` —
       * code decides, the model never rounds a price change down. */
      forcePromoteMaterial: boolean;
    };

export function diffSnapshots(args: {
  kind: string;
  beforeMarkdown: string;
  afterMarkdown: string;
  /** content_hash of the previous snapshot (already normalized+hashed). */
  beforeHash: string;
}): DiffOutcome {
  const afterNorm = normalizeMarkdown(args.afterMarkdown, args.kind);
  const afterHash = contentHash(afterNorm);
  if (afterHash === args.beforeHash) return { changed: false, afterHash };

  const beforeNorm = normalizeMarkdown(args.beforeMarkdown, args.kind);
  const diff = diffBlocks(splitBlocks(beforeNorm), splitBlocks(afterNorm));
  if (
    diff.added.length + diff.removed.length + diff.modified.length ===
    0
  ) {
    // Hash differed but no block-level change (e.g. reordered whitespace).
    return { changed: false, afterHash };
  }

  return {
    changed: true,
    afterHash,
    diff,
    forcePromoteMaterial: args.kind === "pricing" && hasNumericChange(diff),
  };
}

const NUM = /(?:[$€£]\s?\d|\d+(?:[.,]\d+)?\s?(?:%|\/(?:mo|month|yr|year|user|seat)))/i;

/** Any changed block containing money/percent/rate tokens. Modified pairs
 * must differ in their numeric tokens, not just prose around them. */
export function hasNumericChange(diff: BlockDiff): boolean {
  if (diff.added.some((b) => NUM.test(b)) || diff.removed.some((b) => NUM.test(b))) {
    return true;
  }
  return diff.modified.some((m) => {
    const nums = (s: string) => s.match(/\d+(?:[.,]\d+)?/g)?.join(",") ?? "";
    return (
      (NUM.test(m.before) || NUM.test(m.after)) && nums(m.before) !== nums(m.after)
    );
  });
}
