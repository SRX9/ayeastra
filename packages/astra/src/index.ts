export {
  buildToolset,
  buildAmbient,
  type AstraContext,
  type AstraSource,
} from "./registry";
export { chatModel, CHAT_TIER } from "./provider";
export { buildSystemPrompt, type PromptInputs } from "./prompt";
export { pageHint } from "./pages";
export { listWatched, listActiveModules, resolveEntityNames } from "./org";
export { searchKb, getKbArticle, listKbArticles } from "./kb/retrieval";
export { syncKb, parseArticle, chunkArticle } from "./kb/seed";

import type { AstraSource } from "./registry";
import { businessContextSource } from "./sources/business-context";
import { intelSearchSource } from "./sources/intel-search";
import { orgArtifactsSource } from "./sources/org-artifacts";
import { platformKbSource } from "./sources/platform-kb";

export {
  businessContextSource,
  intelSearchSource,
  orgArtifactsSource,
  platformKbSource,
};

/** Every source Astra ships with. Adding one = one file + one entry here. */
export const defaultSources: AstraSource[] = [
  platformKbSource,
  businessContextSource,
  intelSearchSource,
  orgArtifactsSource,
];
