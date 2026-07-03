import { describe, expect, test } from "bun:test";

import { costUsd } from "./client";

describe("price table", () => {
  test("prices known models per 1M tokens", () => {
    const { usd, priced } = costUsd("gpt-5-mini", 1_000_000, 1_000_000);
    expect(priced).toBe(true);
    expect(usd).toBeCloseTo(2.25, 6);
  });

  test("prices gateway-prefixed model ids by base name", () => {
    expect(costUsd("openai/gpt-5-mini", 1_000_000, 0).priced).toBe(true);
  });

  test("flags unknown models instead of guessing", () => {
    const { usd, priced } = costUsd("some-unknown-model", 1000, 1000);
    expect(priced).toBe(false);
    expect(usd).toBe(0);
  });
});
