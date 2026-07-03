/**
 * Feedback loop v1 (scoring doc): heuristic, transparent, no ML. Pure state
 * transition; persistence maps it onto org_scoring_weights. Adjustments are
 * visible in Settings and resettable — silent learning erodes trust.
 */

export type Verdict = "useful" | "not_useful" | "wrong" | "already_knew";

export const MULTIPLIER_FLOOR = 0.5;
export const MULTIPLIER_CEILING = 1.5;
export const MUTE_OFFER_STREAK = 3;

export interface WeightState {
  multiplier: number;
  consecutiveNegative: number;
}

export interface WeightTransition extends WeightState {
  /** 3 negatives in a row on one (entity × category) cell → one-tap offer. */
  offerMute: boolean;
  /** "wrong" = pipeline defect, not preference: file for eval review. */
  fileReviewItem: boolean;
}

export function applyVerdict(
  state: WeightState,
  verdict: Verdict,
): WeightTransition {
  switch (verdict) {
    case "not_useful":
    case "already_knew": {
      const consecutiveNegative = state.consecutiveNegative + 1;
      return {
        multiplier: Math.max(MULTIPLIER_FLOOR, state.multiplier * 0.9),
        consecutiveNegative,
        offerMute: consecutiveNegative >= MUTE_OFFER_STREAK,
        fileReviewItem: false,
      };
    }
    case "useful":
      return {
        multiplier: Math.min(MULTIPLIER_CEILING, state.multiplier * 1.05),
        consecutiveNegative: 0,
        offerMute: false,
        fileReviewItem: false,
      };
    case "wrong":
      // Never silently down-weights — the score was defective, not unwanted.
      return { ...state, offerMute: false, fileReviewItem: true };
  }
}

export const DEFAULT_WEIGHT: WeightState = {
  multiplier: 1,
  consecutiveNegative: 0,
};

/**
 * Outcome loop (2.2): taking an action on a signal is the strongest possible
 * "useful" — weighted above the feedback verdicts, same multiplier machinery,
 * same ceiling and transparency guarantees.
 */
export const ACTION_TAKEN_MULTIPLIER = 1.15;

export function applyActionTaken(state: WeightState): WeightTransition {
  return {
    multiplier: Math.min(
      MULTIPLIER_CEILING,
      state.multiplier * ACTION_TAKEN_MULTIPLIER,
    ),
    consecutiveNegative: 0,
    offerMute: false,
    fileReviewItem: false,
  };
}
