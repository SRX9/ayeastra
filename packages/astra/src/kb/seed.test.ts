import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import { getDb, kbArticles, kbChunks } from "@ayeastra/db";

import { searchKb } from "./retrieval";
import { chunkArticle, parseArticle, syncKb } from "./seed";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("kb parsing/chunking", () => {
  const md = `---
slug: test-article
title: Test Article
category: features
---
Intro paragraph before any heading.

## First Section
Body of first section.

## Second Section
Body of second section.`;

  test("parses frontmatter and body", () => {
    const a = parseArticle(md);
    expect(a.slug).toBe("test-article");
    expect(a.title).toBe("Test Article");
    expect(a.category).toBe("features");
    expect(a.body.startsWith("Intro paragraph")).toBe(true);
  });

  test("throws on missing/incomplete frontmatter", () => {
    expect(() => parseArticle("no frontmatter here")).toThrow("frontmatter");
    expect(() => parseArticle("---\nslug: x\n---\nbody")).toThrow("incomplete");
  });

  test("chunks at ## headings with intro as chunk 0", () => {
    const chunks = chunkArticle(parseArticle(md).body);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ position: 0, heading: null });
    expect(chunks[1]).toMatchObject({ position: 1, heading: "First Section" });
    expect(chunks[2]!.content).toBe("Body of second section.");
  });
});

/** Deterministic fake embeddings: axis = a running counter, so distinct
 * texts get orthogonal unit vectors and searchKb similarity is exact. */
function fakeEmbedder(startAxis: number) {
  let calls = 0;
  let axis = startAxis;
  const byText = new Map<string, number[]>();
  const fn = async (texts: string[]) => {
    calls += texts.length;
    return texts.map((t) => {
      let v = byText.get(t);
      if (!v) {
        v = new Array(1536).fill(0);
        v[axis++ % 1536] = 1;
        byText.set(t, v);
      }
      return v;
    });
  };
  return { fn, count: () => calls, vectorFor: (t: string) => byText.get(t) };
}

describe.skipIf(!hasDb)("kb sync (real db)", () => {
  const suffix = Date.now();
  const slug = `test-sync-${suffix}`;
  const file = (body: string) => ({
    markdown: `---\nslug: ${slug}\ntitle: Sync Test ${suffix}\ncategory: concepts\n---\n${body}`,
  });

  test("idempotent: second run embeds zero; edits re-embed only changed chunks", async () => {
    const db = getDb();
    const embedder = fakeEmbedder(11);
    const body = `Intro text ${suffix}.\n\n## Alpha\nAlpha body.\n\n## Beta\nBeta body.`;

    try {
      const first = await syncKb([file(body)], embedder.fn, db);
      // Other kb articles may exist in the dev DB; scope assertions to ours.
      expect(first.embedded).toBe(3);
      expect(embedder.count()).toBe(3);

      const second = await syncKb([file(body)], embedder.fn, db);
      expect(second.embedded).toBe(0);
      expect(embedder.count()).toBe(3);

      // Edit one section: exactly one chunk re-embeds; shrink drops leftovers.
      const edited = `Intro text ${suffix}.\n\n## Alpha\nAlpha body v2.\n\n## Beta\nBeta body.`;
      const third = await syncKb([file(edited)], embedder.fn, db);
      expect(third.embedded).toBe(1);

      const rows = await db
        .select()
        .from(kbChunks)
        .where(eq(kbChunks.articleSlug, slug));
      expect(rows).toHaveLength(3);

      // Retrieval roundtrip: the exact vector for the Alpha v2 chunk text
      // must rank it first.
      const alphaVector = embedder.vectorFor(
        `Sync Test ${suffix} — Alpha\nAlpha body v2.`,
      );
      expect(alphaVector).toBeDefined();
      const hits = await searchKb(alphaVector!, undefined, 3, db);
      expect(hits[0]!.articleSlug).toBe(slug);
      expect(hits[0]!.heading).toBe("Alpha");
      expect(hits[0]!.score).toBeCloseTo(1, 5);
    } finally {
      await db.delete(kbArticles).where(eq(kbArticles.slug, slug));
    }
  }, 60_000);
});
