import { describe, expect, test } from "bun:test";

import { keywordFeedUrl, marketFeedUrls } from "./discovery";

describe("category watches (2.1)", () => {
  test("multi-word queries are quoted phrase searches", () => {
    const url = keywordFeedUrl("customer data platform");
    expect(url).toContain("news.google.com/rss/search");
    expect(url).toContain(encodeURIComponent('"customer data platform"'));
  });

  test("market feeds dedupe case-insensitively and include the market name", () => {
    const urls = marketFeedUrls("CDP market", ["CDP Market", "first-party data", ""]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(encodeURIComponent('"cdp market"'));
  });
});
