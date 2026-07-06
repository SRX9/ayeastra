import type { BusinessContext } from "@ayeastra/core";

import { saveContext } from "@/app/(flow)/onboarding/context/actions";
import { osButtonPrimary, osInput } from "@/components/os/ui";

/**
 * Manual BusinessContext entry — shared by onboarding activation and
 * /settings/context (both produce exactly the same versioned payload the
 * AI interview produces once LLM credentials exist).
 */

const field = `${osInput} w-full px-3 py-2`;
const label = "mb-1 block text-sm font-medium";
const hint = "mb-2 text-xs text-muted";

function activePriorityLines(c: BusinessContext | null): string {
  if (!c) return "";
  const out: string[] = [];
  for (const p of c.priorities) {
    if (p.status === "active") out.push(p.text);
  }
  return out.join("\n");
}

export function ContextForm({
  current,
  redirectTo,
  submitLabel,
}: {
  current: BusinessContext | null;
  redirectTo: "/dashboard" | "/settings/context";
  submitLabel: string;
}) {
  const c = current;
  return (
    <form action={saveContext} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="companyName">Company name</label>
          <input id="companyName" name="companyName" required className={field} defaultValue={c?.company.name} />
        </div>
        <div>
          <label className={label} htmlFor="domain">Domain</label>
          <input id="domain" name="domain" required className={field} defaultValue={c?.company.domain} placeholder="acme.com" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="oneLiner">What you do, in one line</label>
        <input id="oneLiner" name="oneLiner" required className={field} defaultValue={c?.company.oneLiner} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="stage">Stage</label>
          <input id="stage" name="stage" required className={field} defaultValue={c?.company.stage} placeholder="seed / growth / public" />
        </div>
        <div>
          <label className={label} htmlFor="market">Market</label>
          <input id="market" name="market" required className={field} defaultValue={c?.company.market} placeholder="subscription billing" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="positioning">Positioning statement</label>
        <p className={hint}>How you want to win — signals get scored against this.</p>
        <textarea id="positioning" name="positioning" required rows={2} className={field} defaultValue={c?.positioning.statement} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="differentiators">Differentiators (one per line)</label>
          <textarea id="differentiators" name="differentiators" rows={3} className={field} defaultValue={c?.positioning.differentiators.join("\n")} />
        </div>
        <div>
          <label className={label} htmlFor="pricingPosture">Pricing posture</label>
          <select id="pricingPosture" name="pricingPosture" className={field} defaultValue={c?.positioning.pricingPosture ?? "premium"}>
            <option value="premium">premium</option>
            <option value="value">value</option>
            <option value="parity">parity</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="segments">Target segments (one per line, most important first)</label>
          <textarea id="segments" name="segments" required rows={3} className={field} defaultValue={c?.segments.map((s) => s.name).join("\n")} />
        </div>
        <div>
          <label className={label} htmlFor="priorities">Strategic priorities (one per line, ranked)</label>
          <textarea id="priorities" name="priorities" required rows={3} className={field} defaultValue={activePriorityLines(c)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="briefingDay">Briefing day</label>
          <select id="briefingDay" name="briefingDay" className={field} defaultValue={c?.delivery.briefingDay ?? "monday"}>
            {["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="timezone">Timezone (IANA)</label>
          <input id="timezone" name="timezone" required className={field} defaultValue={c?.delivery.timezone ?? "UTC"} placeholder="America/New_York" />
        </div>
      </div>

      <button type="submit" className={`${osButtonPrimary} px-4 py-2`}>
        {submitLabel}
      </button>
    </form>
  );
}
