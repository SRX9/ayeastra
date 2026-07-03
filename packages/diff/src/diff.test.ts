import { describe, expect, test } from "bun:test";

import { splitBlocks } from "./blocks";
import { contentHash, normalizeMarkdown } from "./normalize";
import { diffBlocks } from "./patience";
import { diffSnapshots, hasNumericChange } from "./pipeline";
import { comparePricing } from "./pricing-compare";
import { renderDiffHtml } from "./render";
import { mintShareToken } from "./share-token";

describe("normalizer (stage 0)", () => {
  test("volatile tokens do not change the hash", () => {
    const a = "Pricing\n\nPosted 3 hours ago\n\nPro $499/mo © 2025 Acme";
    const b = "Pricing\n\nPosted 5 days ago\n\nPro   $499/mo © 2026 Acme";
    expect(contentHash(normalizeMarkdown(a, "pricing"))).toBe(
      contentHash(normalizeMarkdown(b, "pricing")),
    );
  });

  test("a real price change DOES change the hash", () => {
    const a = normalizeMarkdown("Pro $499/mo", "pricing");
    const b = normalizeMarkdown("Pro $399/mo", "pricing");
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  test("utm params and cookie banners are stripped", () => {
    const md = "See [plans](https://x.com/p?utm_source=tw&plan=pro)\n\nWe use cookies to improve your experience.\n\nReal content";
    const norm = normalizeMarkdown(md, "homepage");
    expect(norm).not.toContain("utm_source");
    expect(norm).not.toContain("cookies");
    expect(norm).toContain("plan=pro");
    expect(norm).toContain("Real content");
  });
});

describe("block splitter (stage 1)", () => {
  test("headings, paragraphs, table rows, list items", () => {
    const blocks = splitBlocks(
      "# Pricing\n\nSome intro text\nspanning two lines\n\n| Plan | Price |\n|---|---|\n| Pro | $499 |\n\n- 10 seats\n- SSO",
    );
    expect(blocks).toEqual([
      "# Pricing",
      "Some intro text\nspanning two lines",
      "| Plan | Price |",
      "| Pro | $499 |",
      "- 10 seats",
      "- SSO",
    ]);
  });

  test("keeps fenced code whole", () => {
    const blocks = splitBlocks("Intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nOutro");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toContain("const a = 1;\n\nconst b = 2;");
  });
});

describe("patience diff", () => {
  test("isolates a single modified row among unchanged blocks", () => {
    const before = ["# Pricing", "| Starter | $29 |", "| Pro | $499 |", "| Enterprise | Custom |"];
    const after = ["# Pricing", "| Starter | $29 |", "| Pro | $399 |", "| Enterprise | Custom |"];
    const d = diffBlocks(before, after);
    expect(d.modified).toEqual([{ before: "| Pro | $499 |", after: "| Pro | $399 |" }]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.unchangedCount).toBe(3);
  });

  test("detects pure additions and removals", () => {
    const d = diffBlocks(["a", "b", "c"], ["a", "c", "d"]);
    expect(d.removed).toEqual(["b"]);
    expect(d.added).toEqual(["d"]);
  });

  test("anchors on unique blocks despite repeats", () => {
    const before = ["x", "same", "x", "UNIQUE", "tail"];
    const after = ["x", "same", "x", "UNIQUE", "new", "tail"];
    const d = diffBlocks(before, after);
    expect(d.added).toEqual(["new"]);
    expect(d.removed).toEqual([]);
    expect(d.modified).toEqual([]);
  });

  test("identical inputs → no changes", () => {
    const d = diffBlocks(["a", "b"], ["a", "b"]);
    expect(d.added.length + d.removed.length + d.modified.length).toBe(0);
    expect(d.unchangedCount).toBe(2);
  });
});

describe("pipeline stages 0–1", () => {
  const before = "# Pricing\n\n| Pro | $499/mo |\n\n- SSO included";
  const beforeHash = contentHash(normalizeMarkdown(before, "pricing"));

  test("hash gate terminates unchanged checks", () => {
    const r = diffSnapshots({
      kind: "pricing",
      beforeMarkdown: before,
      afterMarkdown: "# Pricing\n\n| Pro | $499/mo |\n\n- SSO included",
      beforeHash,
    });
    expect(r.changed).toBe(false);
  });

  test("price change is force-promoted material", () => {
    const r = diffSnapshots({
      kind: "pricing",
      beforeMarkdown: before,
      afterMarkdown: "# Pricing\n\n| Pro | $399/mo |\n\n- SSO included",
      beforeHash,
    });
    expect(r.changed).toBe(true);
    if (r.changed) {
      expect(r.forcePromoteMaterial).toBe(true);
      expect(r.diff.modified).toHaveLength(1);
    }
  });

  test("copy tweak on pricing page is NOT force-promoted", () => {
    const r = diffSnapshots({
      kind: "pricing",
      beforeMarkdown: "# Simple pricing\n\n| Pro | $499/mo |",
      afterMarkdown: "# Fair pricing\n\n| Pro | $499/mo |",
      beforeHash: contentHash(normalizeMarkdown("# Simple pricing\n\n| Pro | $499/mo |", "pricing")),
    });
    expect(r.changed).toBe(true);
    if (r.changed) expect(r.forcePromoteMaterial).toBe(false);
  });

  test("numeric change detection ignores unchanged numbers in prose", () => {
    expect(
      hasNumericChange({
        added: [],
        removed: [],
        modified: [{ before: "Over 500 companies trust us", after: "Over 500 companies love us" }],
        unchangedCount: 0,
      }),
    ).toBe(false);
  });
});

describe("pricing structural compare (stage 3)", () => {
  test("computes exact deltas in code, not prose", () => {
    const deltas = comparePricing(
      {
        plans: [
          { name: "Pro", price: 499, priceText: "$499/mo", period: "month", features: ["SSO"], limits: ["10 seats"] },
          { name: "Legacy", price: 99, priceText: "$99/mo", period: "month", features: [], limits: [] },
        ],
        confidence: "high",
      },
      {
        plans: [
          { name: "Pro", price: 399, priceText: "$399/mo", period: "month", features: ["SSO", "Audit logs"], limits: ["10 seats"] },
          { name: "Scale", price: 1200, priceText: "$1,200/mo", period: "month", features: [], limits: [] },
        ],
        confidence: "high",
      },
    );
    expect(deltas).toContainEqual({ plan: "Pro", field: "price", before: "$499/mo", after: "$399/mo" });
    expect(deltas).toContainEqual({ plan: "Pro", field: "features", before: null, after: "Audit logs" });
    expect(deltas).toContainEqual({ plan: "Legacy", field: "plan_removed", before: "Legacy", after: null });
    expect(deltas).toContainEqual({ plan: "Scale", field: "plan_added", before: null, after: "Scale" });
  });
});

describe("renderer + share tokens", () => {
  test("escapes HTML and renders both columns", () => {
    const html = renderDiffHtml(
      {
        modified: [{ before: "<script>alert(1)</script>", after: "Pro $399" }],
        added: ["new row"],
        removed: [],
        unchangedCount: 5,
      },
      { sourceUrl: "https://x.com/pricing", beforeAt: new Date(0), afterAt: new Date(1) },
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("new row");
    expect(html).toContain("https://x.com/pricing");
  });

  test("share tokens are long and unique", () => {
    const t1 = mintShareToken();
    const t2 = mintShareToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(43);
  });
});
