export {
  scoreSignal,
  SEVERITY_THRESHOLDS,
  type Confidence,
  type Materiality,
  type ScoreDecomposition,
  type ScoringInput,
  type Severity,
  type Tier,
} from "./severity";
export {
  cosineSimilarity,
  dedupKey,
  FOLLOW_UP_SIMILARITY,
  noveltyFactor,
  stableStringify,
} from "./dedup";
export {
  applyVerdict,
  DEFAULT_WEIGHT,
  MULTIPLIER_CEILING,
  MULTIPLIER_FLOOR,
  MUTE_OFFER_STREAK,
  type Verdict,
  type WeightState,
  type WeightTransition,
} from "./feedback";
export {
  findInsightCandidates,
  HIGH_SEVERITY_CLUSTER_MIN,
  type InsightCandidate,
  type SignalLite,
} from "./insights";
