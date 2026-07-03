import type { ModuleKey } from "./manifest";
import { MODULE_REGISTRY } from "./registry";

/**
 * Entitlement wiring (2.1 checklist #2): billing add-on item → org's active
 * modules → routing/section gates. Pure over org_modules rows so the same
 * logic serves web, delivery routing, and the briefing job.
 */

export interface OrgModuleRow {
  moduleKey: ModuleKey;
  deactivatedAt: Date | null;
}

/** Base modules are always on for an entitled org; add-ons need a live row. */
export function activeModuleKeys(rows: OrgModuleRow[]): ModuleKey[] {
  const keys = new Set<ModuleKey>();
  for (const manifest of Object.values(MODULE_REGISTRY)) {
    if (manifest.includedInBase) keys.add(manifest.key);
  }
  for (const row of rows) {
    if (row.deactivatedAt === null) keys.add(row.moduleKey);
  }
  return [...keys];
}

/**
 * The routing/section gate: a signal from an inactive module never alerts,
 * never digests, never takes a briefing slot. Deactivation gates cleanly
 * without touching other modules (2.1 acceptance).
 */
export function isModuleActive(
  moduleKey: ModuleKey,
  active: ModuleKey[],
): boolean {
  return active.includes(moduleKey);
}

/**
 * Stripe price lookup keys for module add-ons follow
 * `module_<module_key>_<interval>` (billing.md §7 anticipated add-on
 * subscription items). The billing sync maps subscription items back to
 * modules with this.
 */
export function moduleFromLookupKey(lookupKey: string | null): ModuleKey | null {
  if (!lookupKey?.startsWith("module_")) return null;
  const slug = lookupKey.slice("module_".length).replace(/_(monthly|annual)$/, "");
  return slug in MODULE_REGISTRY && !MODULE_REGISTRY[slug as ModuleKey].includedInBase
    ? (slug as ModuleKey)
    : null;
}

export function moduleLookupKeys(key: ModuleKey): string[] {
  return [`module_${key}_monthly`, `module_${key}_annual`];
}
