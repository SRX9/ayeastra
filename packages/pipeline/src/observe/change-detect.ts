import { eq } from "drizzle-orm";
import { z } from "zod";

import { classifyChange, extractPricing } from "@ayeastra/ai";
import {
  changes,
  evidence,
  getDb,
  snapshots,
  sources,
} from "@ayeastra/db";
import { comparePricing, diffSnapshots, renderDiffHtml } from "@ayeastra/diff";
import { defineJob } from "@ayeastra/jobs";

import { triggerTask } from "../seam";
import { observePorts } from "./ports";

/**
 * change.detect (diff doc) — `detect` queue consumer, stages 0–3:
 * normalize/hash gate → block split → patience diff → classify (numeric
 * force-promotion in code) → kind-aware extraction → write the `changes` +
 * `evidence` rows → embed → fan out change.analyze across the seam.
 */

/** Classify-prompt guards: the model sees enough to judge, never the page. */
const MAX_BLOCKS = 30;
const MAX_BLOCK_CHARS = 500;

const clip = (s: string) => (s.length > MAX_BLOCK_CHARS ? `${s.slice(0, MAX_BLOCK_CHARS)}…` : s);

export const changeDetect = defineJob({
  name: "change.detect",
  payload: z.object({
    sourceId: z.uuid(),
    beforeSnapshotId: z.uuid(),
    afterSnapshotId: z.uuid(),
  }),
  idempotencyKey: (p) => `detect:${p.afterSnapshotId}`,
  run: async (payload, ctx) => {
    const db = getDb();
    const ports = observePorts();

    // Replay guard: the change already exists — re-fire the seam (idempotent
    // on the Trigger side) and stop. A crash between insert and trigger must
    // not strand a material change unanalyzed.
    const [existing] = await db
      .select({ id: changes.id, materiality: changes.materiality })
      .from(changes)
      .where(eq(changes.afterSnapshotId, payload.afterSnapshotId))
      .limit(1);
    if (existing) {
      if (existing.materiality === "material") await fanOutAnalyze(existing.id);
      return;
    }

    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, payload.sourceId));
    if (!source) throw new Error(`source ${payload.sourceId} not found`);
    const [before] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, payload.beforeSnapshotId));
    const [after] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, payload.afterSnapshotId));
    if (!before || !after) {
      throw new Error(`snapshots missing for detect on source ${payload.sourceId}`);
    }

    const beforeMd = await readText(ports.blobs, before.r2MdKey);
    const afterMd = await readText(ports.blobs, after.r2MdKey);

    const outcome = diffSnapshots({
      kind: source.kind,
      beforeMarkdown: beforeMd,
      afterMarkdown: afterMd,
      beforeHash: before.contentHash,
    });
    if (!outcome.changed) return; // hash flapped on volatile tokens — no change

    // Stage 2 — the model classifies; code force-promotes pricing numerics.
    const classified = await classifyChange.run(
      {
        sourceKind: source.kind,
        addedBlocks: outcome.diff.added.slice(0, MAX_BLOCKS).map(clip),
        removedBlocks: outcome.diff.removed.slice(0, MAX_BLOCKS).map(clip),
        modifiedBlocks: outcome.diff.modified.slice(0, MAX_BLOCKS).map((m) => ({
          before: clip(m.before),
          after: clip(m.after),
        })),
      },
      { sourceId: source.id, jobRunId: ctx.jobRunId },
    );
    const materiality = outcome.forcePromoteMaterial ? "material" : classified.materiality;

    if (materiality === "cosmetic") {
      // Archive completeness: recorded, never analyzed further.
      await db.insert(changes).values({
        sourceId: source.id,
        beforeSnapshotId: before.id,
        afterSnapshotId: after.id,
        materiality,
        category: classified.category,
        summary: classified.summary,
      });
      return;
    }

    // Stage 3 — kind-aware extraction; the model extracts, code diffs.
    // Extraction failure degrades to diff-only (facts null), never guesses.
    const extractedFacts = await extractFacts(source.kind, beforeMd, afterMd, {
      sourceId: source.id,
      jobRunId: ctx.jobRunId,
    });

    const diffKey = `diffs/${source.id}/${after.id}.html`;
    await ports.blobs.put(
      diffKey,
      renderDiffHtml(outcome.diff, {
        sourceUrl: source.url,
        beforeAt: before.fetchedAt,
        afterAt: after.fetchedAt,
      }),
      "text/html",
    );

    const [change] = await db
      .insert(changes)
      .values({
        sourceId: source.id,
        beforeSnapshotId: before.id,
        afterSnapshotId: after.id,
        materiality,
        category: classified.category,
        summary: classified.summary,
        extractedFacts,
        diffR2Key: diffKey,
      })
      .returning({ id: changes.id });

    // The immutable evidence record every downstream claim cites (law #1).
    const screenshots = [before.r2ScreenshotKey, after.r2ScreenshotKey].filter(
      (k): k is string => k !== null,
    );
    await db.insert(evidence).values({
      changeId: change!.id,
      sourceUrl: source.url,
      fetchedAt: after.fetchedAt,
      contentHash: outcome.afterHash,
      r2Keys: {
        before_html: before.r2HtmlKey,
        after_html: after.r2HtmlKey,
        before_md: before.r2MdKey,
        after_md: after.r2MdKey,
        diff_html: diffKey,
        screenshots,
      },
      extracted: extractedFacts,
    });

    await ports.enqueueEmbed({ target: "change", id: change!.id });
    if (materiality === "material") await fanOutAnalyze(change!.id);
  },
});

async function fanOutAnalyze(changeId: string): Promise<void> {
  await triggerTask("change.analyze", { changeId }, { idempotencyKey: `analyze:${changeId}` });
}

async function readText(
  blobs: { get(key: string): Promise<Uint8Array | null> },
  key: string,
): Promise<string> {
  const bytes = await blobs.get(key);
  if (!bytes) throw new Error(`snapshot blob missing: ${key}`);
  return new TextDecoder().decode(bytes);
}

/** Pricing gets structured both-sides extraction + code-side comparison;
 * other kinds ship diff-only for now (extractors land with their evals). */
async function extractFacts(
  kind: string,
  beforeMd: string,
  afterMd: string,
  ctx: { sourceId: string; jobRunId: string },
): Promise<unknown | null> {
  if (kind !== "pricing") return null;
  try {
    const [beforeSnap, afterSnap] = await Promise.all([
      extractPricing.run({ markdown: beforeMd }, ctx),
      extractPricing.run({ markdown: afterMd }, ctx),
    ]);
    if (beforeSnap.confidence === "low" || afterSnap.confidence === "low") {
      return null; // below-threshold extraction stores null, never wrong numbers
    }
    return {
      kind: "pricing",
      before: beforeSnap,
      after: afterSnap,
      deltas: comparePricing(beforeSnap, afterSnap),
    };
  } catch (err) {
    console.error("pricing extraction degraded to diff-only", err);
    return null;
  }
}
