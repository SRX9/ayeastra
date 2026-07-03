import { redirect } from "next/navigation";

import { currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";

import { ContextForm } from "@/components/context-form";
import { requireOrg } from "@/lib/auth";

/** Intelligence Plan activation (context doc). Manual entry now; the AI
 * interview produces the same payload once LLM credentials are set. */
export default async function OnboardingContextPage() {
  const session = await requireOrg();
  const existing = await currentContext(scopedDb(session.organizationId));
  if (existing) redirect("/dashboard");

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">Set up your intelligence</h1>
      <p className="mb-6 text-sm text-muted">
        Everything AyeAstra scores is grounded in this context — what you do,
        how you position, and what matters right now. The guided AI interview
        activates once model credentials are configured; this form produces
        the same plan.
      </p>
      <ContextForm current={null} redirectTo="/dashboard" submitLabel="Activate" />
    </div>
  );
}
