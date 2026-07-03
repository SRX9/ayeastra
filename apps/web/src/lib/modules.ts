import { orgModules, scopedDb } from "@ayeastra/db";
import type { OrgModuleRow } from "@ayeastra/modules";

/** org_modules rows for entitlement resolution (@ayeastra/modules). */
export async function listOrgModules(orgId: string): Promise<OrgModuleRow[]> {
  const rows = await scopedDb(orgId).select(orgModules);
  return rows.map((r) => ({
    moduleKey: r.moduleKey,
    deactivatedAt: r.deactivatedAt,
  }));
}
