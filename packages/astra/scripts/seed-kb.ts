import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: "../../apps/server/.env" });

import { embed, flushTracing, isLlmConfigured } from "@ayeastra/ai";

import { syncKb } from "../src/kb/seed";

/**
 * Seed the platform KB: embed kb/*.md into kb_articles/kb_chunks.
 * Idempotent — unchanged chunks are skipped by content hash, so re-running
 * after a deploy only embeds what changed. Run: bun kb:seed (package) or
 * turbo -F @ayeastra/astra kb:seed (root).
 */

if (!process.env.DATABASE_URL) {
  console.error("kb:seed: DATABASE_URL is not set");
  process.exit(1);
}
if (!isLlmConfigured()) {
  console.error(
    "kb:seed: LLM env not configured (LLM_EMBEDDING_MODEL etc.) — cannot embed. Articles unchanged in DB.",
  );
  process.exit(1);
}

const kbDir = join(import.meta.dir, "..", "kb");
const names = (await readdir(kbDir)).filter((n) => n.endsWith(".md")).sort();
const files = await Promise.all(
  names.map(async (n) => ({ markdown: await readFile(join(kbDir, n), "utf8") })),
);
console.log(`kb:seed: syncing ${files.length} articles from ${kbDir}`);

const result = await syncKb(files, (texts) => embed(texts), undefined, {
  prune: true,
});
console.log(
  `kb:seed: ${result.articles} articles — embedded ${result.embedded} chunks, ` +
    `${result.unchanged} unchanged, pruned ${result.deletedArticles} removed articles`,
);

await flushTracing();
process.exit(0);
