/**
 * Patience diff over block arrays (diff doc stage 1): unique common blocks
 * anchor the alignment, hunks between anchors become added/removed sets,
 * and equal-position pairs inside a hunk are reported as modified.
 */

export interface ModifiedPair {
  before: string;
  after: string;
}

export interface BlockDiff {
  added: string[];
  removed: string[];
  modified: ModifiedPair[];
  unchangedCount: number;
}

export function diffBlocks(before: string[], after: string[]): BlockDiff {
  const out: BlockDiff = { added: [], removed: [], modified: [], unchangedCount: 0 };
  walk(before, 0, before.length, after, 0, after.length, out);
  return out;
}

function walk(
  a: string[],
  aLo: number,
  aHi: number,
  b: string[],
  bLo: number,
  bHi: number,
  out: BlockDiff,
): void {
  // Common prefix / suffix.
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    out.unchangedCount++;
    aLo++;
    bLo++;
  }
  while (aHi > aLo && bHi > bLo && a[aHi - 1] === b[bHi - 1]) {
    out.unchangedCount++;
    aHi--;
    bHi--;
  }
  if (aLo === aHi && bLo === bHi) return;
  if (aLo === aHi) {
    out.added.push(...b.slice(bLo, bHi));
    return;
  }
  if (bLo === bHi) {
    out.removed.push(...a.slice(aLo, aHi));
    return;
  }

  const anchors = uniqueCommonLis(a, aLo, aHi, b, bLo, bHi);
  if (anchors.length === 0) {
    // Leaf hunk: pair blocks positionally as modified, rest add/remove.
    const removed = a.slice(aLo, aHi);
    const added = b.slice(bLo, bHi);
    const pairs = Math.min(removed.length, added.length);
    for (let i = 0; i < pairs; i++) {
      out.modified.push({ before: removed[i]!, after: added[i]! });
    }
    out.removed.push(...removed.slice(pairs));
    out.added.push(...added.slice(pairs));
    return;
  }

  let prevA = aLo;
  let prevB = bLo;
  for (const [ai, bi] of anchors) {
    walk(a, prevA, ai, b, prevB, bi, out);
    out.unchangedCount++; // the anchor itself
    prevA = ai + 1;
    prevB = bi + 1;
  }
  walk(a, prevA, aHi, b, prevB, bHi, out);
}

/** Blocks occurring exactly once in both ranges, filtered to the longest
 * increasing subsequence of their b-positions. */
function uniqueCommonLis(
  a: string[],
  aLo: number,
  aHi: number,
  b: string[],
  bLo: number,
  bHi: number,
): Array<[number, number]> {
  const countA = new Map<string, { n: number; i: number }>();
  for (let i = aLo; i < aHi; i++) {
    const e = countA.get(a[i]!) ?? { n: 0, i };
    e.n++;
    e.i = i;
    countA.set(a[i]!, e);
  }
  const countB = new Map<string, { n: number; i: number }>();
  for (let i = bLo; i < bHi; i++) {
    const e = countB.get(b[i]!) ?? { n: 0, i };
    e.n++;
    e.i = i;
    countB.set(b[i]!, e);
  }

  const pairs: Array<[number, number]> = [];
  for (let i = aLo; i < aHi; i++) {
    const ea = countA.get(a[i]!)!;
    const eb = countB.get(a[i]!);
    if (ea.n === 1 && eb?.n === 1) pairs.push([i, eb.i]);
  }
  if (pairs.length === 0) return [];

  // LIS on b-positions (pairs already sorted by a-position).
  const tailIdx: number[] = [];
  const prev = new Array<number>(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i++) {
    const bi = pairs[i]![1];
    let lo = 0;
    let hi = tailIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tailIdx[mid]!]![1] < bi) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tailIdx[lo - 1]!;
    tailIdx[lo] = i;
  }
  const lis: Array<[number, number]> = [];
  for (let i = tailIdx[tailIdx.length - 1]!; i !== -1; i = prev[i]!) {
    lis.push(pairs[i]!);
  }
  return lis.reverse();
}
