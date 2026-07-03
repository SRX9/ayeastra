/**
 * Workflow-layer gating (3.2): Missions, Board Mode, and Reports are
 * Business/Enterprise features per pricing — the layer presupposes trust
 * and multi-team adoption ("earned first"). Plan strings mirror
 * org_billing.plan / WorkOS org metadata.
 */

const WORKFLOW_PLANS = new Set(["business", "enterprise"]);

export function workflowEntitled(plan: string | null | undefined): boolean {
  return plan != null && WORKFLOW_PLANS.has(plan);
}
