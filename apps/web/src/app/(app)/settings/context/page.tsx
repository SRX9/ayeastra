import Link from "next/link";

import { currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { ContextForm } from "@/components/context-form";
import { requireOrg } from "@/lib/auth";

/** /settings/context (web-app doc): edit the living context. Every save is
 * a new immutable version — old signals keep the version that scored them. */
export default async function ContextSettingsPage() {
  const session = await requireOrg();
  const existing = await currentContext(scopedDb(session.organizationId));

  return (
    <div>
      <h2 className="mb-1 text-base font-medium">Business context</h2>
      {existing ? (
        <p className="mb-6 text-sm text-muted">
          Version {existing.version}, saved{" "}
          {existing.createdAt.toISOString().slice(0, 10)}. Saving creates
          version {existing.version + 1} — history is never overwritten.
        </p>
      ) : (
        <p className="mb-6 text-sm text-muted">
          No context yet —{" "}
          <Link href="/onboarding/context" className="link underline underline-offset-4">
            activate your intelligence plan
          </Link>{" "}
          first.
        </p>
      )}
      {existing && (
        <ContextForm
          current={existing.payload}
          redirectTo="/settings/context"
          submitLabel={`Save as version ${existing.version + 1}`}
        />
      )}
    </div>
  );
}
