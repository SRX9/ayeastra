import { createHash } from "node:crypto";

import type {
  DataProvider,
  ProviderRecord,
  ProviderSourceKind,
} from "./provider";

/**
 * Pipeline entry (2.3 checklist #1), pure like @ayeastra/diff: the job
 * composes fetch → diffProviderRecords → classify-change (existing task,
 * hiring_data/review_data rubrics) → persist as snapshots/changes/evidence.
 * Provider batches diff like page snapshots do — the FIRST fetch is a
 * baseline (no change row), later fetches emit added/removed records.
 */

/** sources.url for a provider stream — unique per (provider, kind, entity),
 * so the global-layer dedupe (one fetch serves every watching org) holds. */
export function providerSourceUrl(
  key: DataProvider["key"],
  kind: ProviderSourceKind,
  entityId: string,
): string {
  return `provider://${key}/${kind}/${entityId}`;
}

/** Deterministic hash of a record batch — the snapshot content_hash. */
export function recordsContentHash(records: ProviderRecord[]): string {
  const hash = createHash("sha256");
  for (const id of records.map((r) => r.id).sort()) hash.update(id).update("\n");
  return hash.digest("hex");
}

export interface ProviderDiff {
  changed: boolean;
  added: ProviderRecord[];
  removed: ProviderRecord[];
}

export function diffProviderRecords(
  before: ProviderRecord[],
  after: ProviderRecord[],
): ProviderDiff {
  const beforeIds = new Set(before.map((r) => r.id));
  const afterIds = new Set(after.map((r) => r.id));
  const added = after.filter((r) => !beforeIds.has(r.id));
  const removed = before.filter((r) => !afterIds.has(r.id));
  return { changed: added.length + removed.length > 0, added, removed };
}

/** classify-change input blocks — provider records described one per line,
 * so the EXISTING stage-2 task classifies materiality with the
 * hiring_data/review_data rubrics. Zero pipeline special-casing. */
export function recordBlocks(
  provider: DataProvider,
  diff: ProviderDiff,
): { addedBlocks: string[]; removedBlocks: string[] } {
  return {
    addedBlocks: diff.added.map((r) => provider.describe(r)),
    removedBlocks: diff.removed.map((r) => provider.describe(r)),
  };
}

/**
 * Evidence values for a provider change: no page snapshot to hash — the
 * provenance chain is the API response, archived to R2 (r2Keys.raw), plus
 * provider + record IDs + retrieval timestamp in `extracted`.
 */
export function providerEvidence(args: {
  provider: DataProvider;
  sourceUrl: string;
  fetchedAt: Date;
  diff: ProviderDiff;
  r2RawKey: string;
}): {
  sourceUrl: string;
  fetchedAt: Date;
  contentHash: string;
  r2Keys: { raw: string };
  extracted: { provider: string; recordIds: string[]; retrievedAt: string };
} {
  return {
    sourceUrl: args.sourceUrl,
    fetchedAt: args.fetchedAt,
    contentHash: recordsContentHash([...args.diff.added, ...args.diff.removed]),
    r2Keys: { raw: args.r2RawKey },
    extracted: {
      provider: args.provider.key,
      recordIds: [...args.diff.added, ...args.diff.removed].map((r) => r.id),
      retrievedAt: args.fetchedAt.toISOString(),
    },
  };
}

/** cost_events values for one provider fetch — org column stays null
 * (global-layer spend, apportioned across watching orgs at rollup, exactly
 * like Firecrawl fetches). */
export function providerCostEvent(args: {
  provider: DataProvider;
  units: number;
  usdPerUnit: number;
  sourceId: string;
  jobRunId?: string;
}): {
  vendor: DataProvider["key"];
  taskName: string;
  units: number;
  costUsd: string;
  sourceId: string;
  jobRunId: string | null;
} {
  return {
    vendor: args.provider.key,
    taskName: "provider.fetch",
    units: args.units,
    costUsd: (args.units * args.usdPerUnit).toFixed(6),
    sourceId: args.sourceId,
    jobRunId: args.jobRunId ?? null,
  };
}
