import { Card, Chip } from "@heroui/react";
import Link from "next/link";

import { currentContext } from "@ayeastra/core";
import { scopedDb } from "@ayeastra/db";
import { activeModuleKeys, MODULE_REGISTRY } from "@ayeastra/modules";

import { requireActiveSubscription } from "@/lib/auth";
import { listOrgModules } from "@/lib/modules";

import { saveMarketWatchSlice } from "./actions";

/**
 * Module settings (2.1): one platform, N lenses. Activation state comes from
 * billing (add-on subscription items) or ops ("manual" beta rows); this page
 * shows state and collects each active module's onboarding slice — the ONLY
 * setup a second module needs.
 */

const inputCls =
  "w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-600";

export default async function ModulesPage() {
  const session = await requireActiveSubscription();
  const rows = await listOrgModules(session.organizationId);
  const active = activeModuleKeys(rows);
  const context = await currentContext(scopedDb(session.organizationId));

  const pmwActive = active.includes("product_market_watch");
  const needsSlice = pmwActive && context && !context.payload.marketWatch;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold">Modules</h1>
      <p className="mb-6 text-sm text-muted">
        Modules are lenses over the same entities and context — activating one
        adds sections to your existing weekly briefing, never a second product.
      </p>

      {Object.values(MODULE_REGISTRY).map((manifest) => {
        const isActive = active.includes(manifest.key);
        return (
          <Card key={manifest.key} className="mb-4">
            <Card.Header className="flex-row items-center justify-between">
              <Card.Title className="text-base">{manifest.title}</Card.Title>
              <Chip size="sm" color={isActive ? "success" : "default"}>
                {manifest.includedInBase
                  ? "Included"
                  : isActive
                    ? "Active"
                    : "Not active"}
              </Chip>
            </Card.Header>
            <Card.Content className="space-y-3 text-sm">
              <p className="text-muted">
                Briefing sections:{" "}
                {manifest.briefingSections.map((s) => s.title).join(" · ")}
              </p>

              {!manifest.includedInBase && !isActive && (
                <p className="text-muted">
                  Available as an add-on —{" "}
                  <Link href="/settings/billing" className="link underline underline-offset-4">
                    manage billing
                  </Link>{" "}
                  or ask us about the design-partner beta.
                </p>
              )}

              {manifest.key === "product_market_watch" && needsSlice && (
                <form action={saveMarketWatchSlice} className="space-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
                  <p className="font-medium">
                    Finish activation — three questions, nothing else:
                  </p>
                  {manifest.onboardingSlice!.questions.map((q) => (
                    <label key={q.id} className="block space-y-1">
                      <span className="text-sm">{q.prompt}</span>
                      <textarea
                        name={q.id}
                        rows={2}
                        required={q.id === "markets"}
                        placeholder={q.placeholder}
                        className={inputCls}
                      />
                    </label>
                  ))}
                  <button
                    type="submit"
                    className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                  >
                    Activate market watches
                  </button>
                </form>
              )}

              {manifest.key === "product_market_watch" &&
                pmwActive &&
                context?.payload.marketWatch && (
                  <p className="text-muted">
                    Watching:{" "}
                    {context.payload.marketWatch.markets
                      .map((m) => m.name)
                      .join(" · ")}
                    {context.payload.marketWatch.platforms.length > 0 &&
                      ` · platforms: ${context.payload.marketWatch.platforms.join(", ")}`}
                  </p>
                )}
            </Card.Content>
          </Card>
        );
      })}
    </div>
  );
}
