import { describe, expect, test } from "bun:test";

import {
  ACTION_TAKEN_MULTIPLIER,
  applyActionTaken,
  applyVerdict,
  DEFAULT_WEIGHT,
  MULTIPLIER_CEILING,
} from "./feedback";

describe("action-taken feedback (2.2)", () => {
  test("weighs above a useful verdict, same machinery", () => {
    const viaAction = applyActionTaken(DEFAULT_WEIGHT);
    const viaUseful = applyVerdict(DEFAULT_WEIGHT, "useful");
    expect(ACTION_TAKEN_MULTIPLIER).toBeGreaterThan(1.05);
    expect(viaAction.multiplier).toBeGreaterThan(viaUseful.multiplier);
    expect(viaAction.offerMute).toBe(false);
    expect(viaAction.fileReviewItem).toBe(false);
  });

  test("respects the ceiling and resets the negative streak", () => {
    const state = { multiplier: 1.45, consecutiveNegative: 2 };
    const next = applyActionTaken(state);
    expect(next.multiplier).toBe(MULTIPLIER_CEILING);
    expect(next.consecutiveNegative).toBe(0);
  });
});
