import type { z } from "zod";

import type { ExtractPricingOutput } from "@ayeastra/ai/tasks/extract-pricing";

/**
 * Stage 3, pricing kind (diff doc): the model extracts BOTH snapshots into
 * PricingSnapshot; THIS code computes the exact deltas ("Pro.price: 499→399").
 * Numbers in downstream copy come from these deltas, never model prose.
 */

type PricingSnapshot = z.output<typeof ExtractPricingOutput>;
type Plan = PricingSnapshot["plans"][number];

export interface PricingDelta {
  plan: string;
  field: "price" | "period" | "features" | "limits" | "plan_added" | "plan_removed";
  before: string | null;
  after: string | null;
}

export function comparePricing(
  before: PricingSnapshot,
  after: PricingSnapshot,
): PricingDelta[] {
  const deltas: PricingDelta[] = [];
  const byName = (plans: Plan[]) =>
    new Map(plans.map((p) => [p.name.toLowerCase(), p]));
  const beforeMap = byName(before.plans);
  const afterMap = byName(after.plans);

  for (const [key, b] of beforeMap) {
    const a = afterMap.get(key);
    if (!a) {
      deltas.push({ plan: b.name, field: "plan_removed", before: b.name, after: null });
      continue;
    }
    if (b.price !== a.price) {
      deltas.push({
        plan: b.name,
        field: "price",
        before: b.priceText ?? String(b.price),
        after: a.priceText ?? String(a.price),
      });
    }
    if (b.period !== a.period) {
      deltas.push({ plan: b.name, field: "period", before: b.period, after: a.period });
    }
    pushListDelta(deltas, b.name, "features", b.features, a.features);
    pushListDelta(deltas, b.name, "limits", b.limits, a.limits);
  }
  for (const [key, a] of afterMap) {
    if (!beforeMap.has(key)) {
      deltas.push({ plan: a.name, field: "plan_added", before: null, after: a.name });
    }
  }
  return deltas;
}

function pushListDelta(
  deltas: PricingDelta[],
  plan: string,
  field: "features" | "limits",
  before: string[],
  after: string[],
): void {
  const b = new Set(before.map((s) => s.toLowerCase()));
  const a = new Set(after.map((s) => s.toLowerCase()));
  const removed = before.filter((s) => !a.has(s.toLowerCase()));
  const added = after.filter((s) => !b.has(s.toLowerCase()));
  if (removed.length || added.length) {
    deltas.push({
      plan,
      field,
      before: removed.join("; ") || null,
      after: added.join("; ") || null,
    });
  }
}
