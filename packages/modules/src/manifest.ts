import type { moduleKey, signalCategory, sourceKind } from "@ayeastra/db";

/**
 * The module contract (Phase 2.1): "module" is a real technical object —
 * a second module is configuration + new agents over the SAME entities and
 * context, never a second product. One platform, one entity graph, one
 * context, N lenses.
 */

export type ModuleKey = (typeof moduleKey.enumValues)[number];
export type SignalCategory = (typeof signalCategory.enumValues)[number];
export type SourceKind = (typeof sourceKind.enumValues)[number];

/**
 * A section this module merges into THE weekly briefing (never a second
 * briefing per module — the Monday artifact stays singular).
 */
export interface BriefingSectionDef {
  key: string;
  title: string;
  /** Categories the section selects from (selection filter, not ownership). */
  categories: SignalCategory[];
  /** Base slot budget before cross-module rebalance. */
  budget: number;
}

export interface OnboardingQuestionDef {
  id: string;
  prompt: string;
  placeholder?: string;
}

/** Extra interview questions asked once when the module is activated. */
export interface ContextSliceDef {
  /** BusinessContext key the answers land under. */
  key: string;
  questions: OnboardingQuestionDef[];
}

export interface ModuleManifest {
  /** Entitlement key — billing add-on subscription item maps to this. */
  key: ModuleKey;
  title: string;
  /** Included with any entitled plan; never needs an org_modules row. */
  includedInBase: boolean;
  /** Owned categories — disjoint across modules; stamps signals.module_key. */
  signalCategories: SignalCategory[];
  /** Additional source kinds discovery should map when this module is active. */
  sourceKinds: SourceKind[];
  /** defineTask names of the module's analyze agents. */
  analysisTasks: string[];
  briefingSections: BriefingSectionDef[];
  onboardingSlice?: ContextSliceDef;
  /** Battlecard-analog artifact keys, if any. */
  artifacts?: string[];
}
