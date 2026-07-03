import type {
  BriefingSectionDef,
  ModuleKey,
  ModuleManifest,
  SignalCategory,
} from "./manifest";

/**
 * The module registry (Phase 2.1). Competitive Watch is retrofitted into
 * manifest form FIRST — the framework is proven on the existing module —
 * then Product & Market Watch ships as configuration + new agents.
 */

const COMPETITIVE_WATCH: ModuleManifest = {
  key: "competitive_watch",
  title: "Competitive Watch",
  includedInBase: true,
  signalCategories: [
    "pricing",
    "packaging",
    "launch",
    "messaging",
    "hiring",
    "funding",
    "partnership",
    "regulatory",
    "reviews",
    "other",
  ],
  sourceKinds: [
    "pricing",
    "changelog",
    "blog",
    "docs",
    "careers",
    "news",
    "filings",
    "app_store",
    "homepage",
    "hiring_data",
    "review_data",
  ],
  analysisTasks: ["classify-change", "extract-pricing", "ground-signal"],
  briefingSections: [
    {
      key: "pricing_packaging",
      title: "Pricing & packaging changes",
      categories: ["pricing", "packaging"],
      budget: 4,
    },
    {
      key: "launches",
      title: "Launches & changelog highlights",
      categories: ["launch"],
      budget: 5,
    },
    {
      key: "messaging",
      title: "Messaging & positioning shifts",
      categories: ["messaging"],
      budget: 4,
    },
  ],
  artifacts: ["battlecard"],
};

const PRODUCT_MARKET_WATCH: ModuleManifest = {
  key: "product_market_watch",
  title: "Product & Market Watch",
  includedInBase: false,
  signalCategories: [
    "ma",
    "market_entry",
    "category_launch",
    "platform_shift",
    "narrative_shift",
  ],
  sourceKinds: ["keyword_feed", "news", "changelog"],
  analysisTasks: ["analyze-market-item", "ground-signal"],
  briefingSections: [
    {
      key: "market_moves",
      title: "Market moves",
      // funding is owned by competitive_watch (a competitor raising is a
      // competitor signal); the PMW section still SELECTS it so category
      // funding/M&A reads as one "market moves" story.
      categories: ["funding", "ma", "market_entry", "category_launch", "platform_shift"],
      budget: 4,
    },
    {
      key: "category_narrative",
      title: "Category narrative",
      categories: ["narrative_shift"],
      budget: 3,
    },
  ],
  onboardingSlice: {
    key: "marketWatch",
    questions: [
      {
        id: "markets",
        prompt:
          "Which category or market should we watch (e.g. \"CDP market\")? Name each on its own line.",
        placeholder: "CDP market",
      },
      {
        id: "keywords",
        prompt:
          "Keywords and phrases that describe the category — we build news watches from these.",
        placeholder: "customer data platform, CDP, first-party data",
      },
      {
        id: "platforms",
        prompt:
          "Which platform ecosystems matter to your business (changelogs & policy pages we should monitor)?",
        placeholder: "Salesforce, HubSpot",
      },
    ],
  },
};

export const MODULE_REGISTRY: Record<ModuleKey, ModuleManifest> = {
  competitive_watch: COMPETITIVE_WATCH,
  product_market_watch: PRODUCT_MARKET_WATCH,
};

const CATEGORY_OWNER = new Map<SignalCategory, ModuleKey>();
for (const manifest of Object.values(MODULE_REGISTRY)) {
  for (const category of manifest.signalCategories) {
    if (CATEGORY_OWNER.has(category)) {
      throw new Error(`module registry: category "${category}" owned twice`);
    }
    CATEGORY_OWNER.set(category, manifest.key);
  }
}

/**
 * Module stamped on a signal at creation. Market-role entities always belong
 * to Product & Market Watch (their funding/launch news is category news);
 * otherwise the category's owner decides.
 */
export function moduleForSignal(input: {
  category: SignalCategory;
  entityRole?: "competitor" | "self" | "market" | "vendor";
}): ModuleKey {
  if (input.entityRole === "market") return "product_market_watch";
  return CATEGORY_OWNER.get(input.category) ?? "competitive_watch";
}

/** Total themed-section slots in one briefing, regardless of module count —
 * more modules means a tighter bar per section, not a longer artifact. */
export const TOTAL_THEMED_BUDGET = 13;
const MIN_SECTION_BUDGET = 2;

/**
 * Briefing sections for an org's active modules, budgets rebalanced so the
 * merged briefing stays one readable artifact (2.1: "selection budgets
 * rebalance by org's active modules").
 */
export function sectionDefsForModules(active: ModuleKey[]): BriefingSectionDef[] {
  const defs = active
    .map((key) => MODULE_REGISTRY[key])
    .filter(Boolean)
    .flatMap((m) => m.briefingSections);
  const baseTotal = defs.reduce((sum, d) => sum + d.budget, 0);
  if (baseTotal <= TOTAL_THEMED_BUDGET) return defs.map((d) => ({ ...d }));
  return defs.map((d) => ({
    ...d,
    budget: Math.max(
      MIN_SECTION_BUDGET,
      Math.floor((d.budget * TOTAL_THEMED_BUDGET) / baseTotal),
    ),
  }));
}
