import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/server/.env" });

import { candidateUrls, detectFeeds, edgarFilingsFeedUrl, urlsFromSitemap } from "./discovery";
import { nextEwma, nextInterval, statusForFailures } from "./scheduling";

describe("adaptive scheduling", () => {
  test("material change tightens toward the floor", () => {
    expect(nextInterval({ current: 2880, kind: "pricing", materialChange: true })).toBe(1440);
    // Already at floor: stays there.
    expect(nextInterval({ current: 360, kind: "pricing", materialChange: true })).toBe(360);
  });

  test("quiet checks decay toward the ceiling", () => {
    expect(nextInterval({ current: 360, kind: "pricing", materialChange: false })).toBe(468);
    expect(nextInterval({ current: 2800, kind: "pricing", materialChange: false })).toBe(2880);
  });

  test("pinned interval overrides everything", () => {
    expect(
      nextInterval({ current: 360, kind: "pricing", materialChange: true, pinned: 30 }),
    ).toBe(30);
  });

  test("bounds differ by kind (news tight, docs loose)", () => {
    expect(nextInterval({ current: 30, kind: "news", materialChange: false })).toBe(60);
    expect(nextInterval({ current: 20000, kind: "docs", materialChange: false })).toBe(10080);
  });

  test("EWMA with α=0.3", () => {
    expect(nextEwma(0, true)).toBeCloseTo(0.3);
    expect(nextEwma(0.3, false)).toBeCloseTo(0.21);
  });

  test("failure ladder: ok → degraded at 3 → broken at 5", () => {
    expect(statusForFailures(2)).toBe("ok");
    expect(statusForFailures(3)).toBe("degraded");
    expect(statusForFailures(5)).toBe("broken");
  });
});

describe("discovery helpers", () => {
  test("candidate urls cover the common paths", () => {
    const urls = candidateUrls("stripe.com");
    expect(urls[0]).toEqual({ url: "https://stripe.com", kindHint: "homepage" });
    expect(urls).toContainEqual({ url: "https://stripe.com/pricing", kindHint: "pricing" });
    expect(urls).toContainEqual({ url: "https://stripe.com/careers", kindHint: "careers" });
  });

  test("detects RSS/Atom feeds and resolves relative hrefs", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="https://x.com/atom">
      <link rel="stylesheet" href="/style.css">
    </head></html>`;
    expect(detectFeeds(html, "https://x.com/blog")).toEqual([
      "https://x.com/blog/feed.xml",
      "https://x.com/atom",
    ]);
  });

  test("sitemap loc extraction respects the limit", () => {
    const xml = `<urlset><url><loc>https://a.com/1</loc></url><url><loc> https://a.com/2 </loc></url></urlset>`;
    expect(urlsFromSitemap(xml)).toEqual(["https://a.com/1", "https://a.com/2"]);
    expect(urlsFromSitemap(xml, 1)).toEqual(["https://a.com/1"]);
  });

  test("EDGAR CIK is zero-padded", () => {
    expect(edgarFilingsFeedUrl("320193")).toContain("CIK=0000320193");
  });
});
