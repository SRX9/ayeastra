/**
 * Mission templates (workflow doc): a template seeds the watch spec so the
 * frontier expansion has a spine and the owner has something to edit even
 * before (or without) the model call.
 */

export interface MissionTemplate {
  key: "defend_competitor" | "enter_market" | "watch_launch";
  title: string;
  goal: (subject: string) => string;
  categories: string[];
  lookFor: string[];
  leadingIndicators: string[];
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    key: "defend_competitor",
    title: "Defend against a competitor",
    goal: (s) => `Defend against ${s}`,
    categories: ["pricing", "packaging", "launch", "messaging", "hiring", "funding"],
    lookFor: [
      "Pricing or packaging changes aimed at our segments",
      "Launches that close their gaps against us",
      "Messaging shifts that target our differentiators",
    ],
    leadingIndicators: [
      "Hiring in sales/marketing roles for our segments",
      "Funding announcements citing expansion",
    ],
  },
  {
    key: "enter_market",
    title: "Enter a market",
    goal: (s) => `Enter market: ${s}`,
    categories: ["market_entry", "category_launch", "funding", "ma", "regulatory", "pricing"],
    lookFor: [
      "Incumbent pricing and packaging norms",
      "New entrants and category launches",
      "Regulatory changes affecting entry",
    ],
    leadingIndicators: [
      "Funding rounds in the category",
      "Platform or ecosystem shifts opening a wedge",
    ],
  },
  {
    key: "watch_launch",
    title: "Watch a launch",
    goal: (s) => `Watch launch: ${s}`,
    categories: ["launch", "messaging", "pricing", "reviews"],
    lookFor: [
      "Launch scope, pricing, and positioning at release",
      "Early review sentiment and adoption signals",
    ],
    leadingIndicators: [
      "Pre-launch messaging changes and docs/changelog activity",
      "Hiring for the launching product area",
    ],
  },
];

export function templateByKey(key: string): MissionTemplate | null {
  return MISSION_TEMPLATES.find((t) => t.key === key) ?? null;
}
