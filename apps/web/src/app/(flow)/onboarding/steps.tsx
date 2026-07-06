"use client";

import { Alert, Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { Segment } from "@heroui-pro/react";
import { Check, Globe, Pencil, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useActionState, useEffect, useState } from "react";

import { createWorkspaceAction, type CreateWorkspaceState } from "./actions";
import {
  BRIEFING_DAYS,
  DOMAIN_RE,
  isValidTimezone,
  normalizeDomain,
  type OnboardingDraft,
  type StepId,
} from "./draft";
import {
  AiBadge,
  FieldNote,
  fieldRise,
  fieldStagger,
  ListEditor,
  OptionCards,
  SuggestionChips,
  TextRow,
} from "./wizard-ui";

/** One props bag threaded through every context step. */
export interface StepProps {
  draft: OnboardingDraft;
  errors: Partial<Record<string, string>>;
  setField: <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;
  ai: ReadonlySet<string>;
}

const STAGE_SUGGESTIONS = ["Pre-seed", "Seed", "Series A", "Series B", "Growth", "Public"];

/* ------------------------------------------------------------------ */
/* Workspace (pre-org)                                                  */
/* ------------------------------------------------------------------ */

const initialWorkspaceState: CreateWorkspaceState = {};

export function WorkspaceStep({
  email,
  suggestedName,
}: {
  email: string;
  suggestedName: string;
}) {
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    initialWorkspaceState,
  );

  return (
    <motion.form
      action={formAction}
      variants={fieldStagger}
      initial="hidden"
      animate="show"
      className="grid gap-6"
    >
      <motion.div variants={fieldRise} className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label>Workspace name</Label>
        </div>
        <TextField
          name="name"
          aria-label="Workspace name"
          fullWidth
          isRequired
          minLength={2}
          maxLength={64}
          defaultValue={suggestedName}
        >
          <Input autoFocus placeholder="Acme Inc." />
        </TextField>
        <FieldNote hint="Usually your company — you can invite your team right after." />
      </motion.div>

      {state.error && (
        <motion.div variants={fieldRise}>
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{state.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        </motion.div>
      )}

      <motion.div variants={fieldRise} className="grid gap-3">
        <Button type="submit" isPending={pending} fullWidth>
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
        <p className="text-center text-xs text-muted">Signed in as {email}</p>
      </motion.div>
    </motion.form>
  );
}

/* ------------------------------------------------------------------ */
/* AI prefill panel                                                     */
/* ------------------------------------------------------------------ */

export type PrefillState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; count: number; elsewhere: boolean }
  | { status: "error"; reason: "bad-domain" | "failed" | "unavailable" };

export function PrefillPanel({
  domain,
  state,
  onRun,
}: {
  domain: string;
  state: PrefillState;
  onRun: () => void;
}) {
  const normalized = normalizeDomain(domain);
  const ready = DOMAIN_RE.test(normalized);
  const running = state.status === "running";

  return (
    <motion.div
      variants={fieldRise}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft">
          <Sparkles aria-hidden className="size-4 text-accent-soft-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          {running ? (
            <>
              <p className="text-shimmer text-sm font-medium">Reading {normalized}…</p>
              <div className="mt-2.5 grid gap-1.5" aria-hidden>
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </>
          ) : state.status === "done" ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Check aria-hidden className="size-3.5 text-success" />
                Drafted {state.count} {state.count === 1 ? "field" : "fields"}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {state.elsewhere
                  ? "Including your positioning and focus steps — everything stays editable."
                  : "Review and edit anything before activating."}
              </p>
            </>
          ) : state.status === "error" ? (
            <>
              <p className="text-sm font-medium">Couldn't draft from {normalized || "your site"}</p>
              <p className="mt-0.5 text-xs text-muted">
                {state.reason === "bad-domain"
                  ? "Enter a bare domain like acme.com, then retry."
                  : "The site didn't cooperate — retry, or fill things in manually."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Draft this from your website</p>
              <p className="mt-0.5 text-xs text-muted">
                {ready
                  ? `We'll read ${normalized} and prefill the rest of the plan.`
                  : "Enter your domain above and we'll prefill the rest of the plan."}
              </p>
            </>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={state.status === "done" ? "ghost" : "secondary"}
          isPending={running}
          isDisabled={!ready}
          onPress={onRun}
        >
          {running ? "Drafting…" : state.status === "done" ? "Run again" : state.status === "error" ? "Retry" : "Prefill"}
        </Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Context steps                                                        */
/* ------------------------------------------------------------------ */

export function CompanyStep({
  draft,
  errors,
  setField,
  ai,
  aiAvailable,
  prefill,
  onPrefill,
}: StepProps & {
  aiAvailable: boolean;
  prefill: PrefillState;
  onPrefill: () => void;
}) {
  const busy = prefill.status === "running";
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="show" className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextRow
          name="companyName"
          label="Company name"
          value={draft.companyName}
          onChange={(v) => setField("companyName", v)}
          error={errors.companyName}
          placeholder="Acme"
          autoFocus={!draft.companyName}
        />
        <TextRow
          name="domain"
          label="Domain"
          value={draft.domain}
          onChange={(v) => setField("domain", v)}
          error={errors.domain}
          placeholder="acme.com"
        />
      </div>

      {aiAvailable && <PrefillPanel domain={draft.domain} state={prefill} onRun={onPrefill} />}

      {busy ? (
        <motion.div variants={fieldRise} className="grid gap-5" aria-hidden>
          {[2, 1, 1].map((w, i) => (
            <div key={i} className="grid gap-1.5">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className={`h-9 rounded-md ${w === 2 ? "w-full" : "w-2/3"}`} />
            </div>
          ))}
        </motion.div>
      ) : (
        <>
          <TextRow
            name="oneLiner"
            label="What you do, in one line"
            value={draft.oneLiner}
            onChange={(v) => setField("oneLiner", v)}
            error={errors.oneLiner}
            ai={ai.has("oneLiner")}
            placeholder="Subscription billing for usage-based SaaS"
          />
          <motion.div variants={fieldRise} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Label>Stage</Label>
              {ai.has("stage") && <AiBadge />}
            </div>
            <SuggestionChips
              options={STAGE_SUGGESTIONS}
              current={draft.stage}
              onPick={(v) => setField("stage", v)}
            />
            <TextField
              name="stage"
              aria-label="Stage"
              fullWidth
              value={draft.stage}
              onChange={(v) => setField("stage", v)}
              isInvalid={!!errors.stage}
            >
              <Input placeholder="Or type your own" />
            </TextField>
            <FieldNote error={errors.stage} />
          </motion.div>
          <TextRow
            name="market"
            label="Market"
            value={draft.market}
            onChange={(v) => setField("market", v)}
            error={errors.market}
            ai={ai.has("market")}
            placeholder="Subscription billing"
            hint="The category you compete in, in your own words."
          />
        </>
      )}
    </motion.div>
  );
}

export function PositioningStep({ draft, errors, setField, ai }: StepProps) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="show" className="grid gap-5">
      <motion.div variants={fieldRise} className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Label>Positioning statement</Label>
          {ai.has("positioning") && <AiBadge />}
        </div>
        <textarea
          name="positioning"
          aria-label="Positioning statement"
          rows={3}
          value={draft.positioning}
          onChange={(e) => setField("positioning", e.target.value)}
          autoFocus={!draft.positioning}
          placeholder="We win mid-market SaaS teams by metering any event stream in real time — billing that finance actually trusts."
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <FieldNote
          error={errors.positioning}
          hint="How you want to win — every signal gets scored against this."
        />
      </motion.div>

      <ListEditor
        label="Differentiators"
        hint="What competitors can't easily copy. Optional, but sharpens scoring."
        placeholder="Add a differentiator and press Enter"
        items={draft.differentiators}
        onChange={(items) => setField("differentiators", items)}
        ai={ai.has("differentiators")}
      />

      <OptionCards
        label="Pricing posture"
        name="pricingPosture"
        value={draft.pricingPosture}
        onChange={(v) => setField("pricingPosture", v)}
        ai={ai.has("pricingPosture")}
        options={[
          { value: "premium", title: "Premium", description: "You win on value, not price" },
          { value: "value", title: "Value", description: "You win on price" },
          { value: "parity", title: "Parity", description: "Priced with the market" },
        ]}
      />
    </motion.div>
  );
}

export function FocusStep({ draft, errors, setField, ai }: StepProps) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="show" className="grid gap-6">
      <ListEditor
        ordered
        label="Target segments"
        hint="Most important first — a competitor move in segment #1 outranks one in #3."
        placeholder="Add a segment and press Enter"
        items={draft.segments}
        onChange={(items) => setField("segments", items)}
        error={errors.segments}
        ai={ai.has("segments")}
      />
      <ListEditor
        ordered
        label="Strategic priorities"
        hint="What the business is pushing on this quarter, ranked."
        placeholder="Add a priority and press Enter"
        items={draft.priorities}
        onChange={(items) => setField("priorities", items)}
        error={errors.priorities}
        ai={ai.has("priorities")}
      />
    </motion.div>
  );
}

const DAY_LABELS: Record<(typeof BRIEFING_DAYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

export function DeliveryStep({
  draft,
  errors,
  setField,
  email,
}: StepProps & { email: string }) {
  const [detected, setDetected] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>([]);

  // Client-only: browser timezone + the IANA list for the datalist.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        setDetected(tz);
        if (!draft.timezone) setField("timezone", tz);
      }
      if (typeof Intl.supportedValuesOf === "function") {
        setZones(Intl.supportedValuesOf("timeZone"));
      }
    } catch {
      // Leave the field manual — validation still guards the value.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="show" className="grid gap-6">
      <motion.div variants={fieldRise} className="grid gap-1.5">
        <Label>Briefing day</Label>
        <Segment
          aria-label="Briefing day"
          selectedKey={draft.briefingDay}
          onSelectionChange={(key) =>
            setField("briefingDay", key as OnboardingDraft["briefingDay"])
          }
        >
          {BRIEFING_DAYS.map((day) => (
            <Segment.Item key={day} id={day}>
              {DAY_LABELS[day]}
            </Segment.Item>
          ))}
        </Segment>
        <FieldNote hint="Your weekly intelligence briefing lands this morning." />
      </motion.div>

      <TextRow
        name="timezone"
        label="Timezone"
        value={draft.timezone}
        onChange={(v) => setField("timezone", v)}
        error={errors.timezone}
        placeholder="America/New_York"
        list={zones.length > 0 ? "onboarding-timezones" : undefined}
        trailing={
          detected && draft.timezone === detected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-default-soft px-2 py-0.5 text-[10px] text-muted">
              <Globe aria-hidden className="size-2.5" />
              Detected
            </span>
          ) : null
        }
        hint={
          draft.timezone && isValidTimezone(draft.timezone)
            ? undefined
            : "IANA name, e.g. Europe/London."
        }
      />
      {zones.length > 0 && (
        <datalist id="onboarding-timezones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      )}

      <motion.p variants={fieldRise} className="text-xs text-muted">
        Briefings and alerts go to {email}. Slack and teammates can be wired up in Settings
        after activation.
      </motion.p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                               */
/* ------------------------------------------------------------------ */

function ReviewSection({
  title,
  step,
  onEdit,
  rows,
}: {
  title: string;
  step: StepId;
  onEdit: (step: StepId) => void;
  rows: Array<[string, string]>;
}) {
  return (
    <motion.section variants={fieldRise} className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Edit ${title.toLowerCase()}`}
          onPress={() => onEdit(step)}
        >
          <Pencil aria-hidden className="size-3" />
          Edit
        </Button>
      </div>
      <dl className="grid gap-2">
        {rows.map(([term, value]) => (
          <div key={term} className="grid grid-cols-[7rem_1fr] gap-3">
            <dt className="text-xs text-muted">{term}</dt>
            <dd className="min-w-0 text-xs leading-relaxed">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </motion.section>
  );
}

export function ReviewStep({
  draft,
  onEdit,
  error,
}: {
  draft: OnboardingDraft;
  onEdit: (step: StepId) => void;
  error: string | null;
}) {
  const numbered = (items: string[]) => items.map((s, i) => `${i + 1}. ${s}`).join("  ·  ");
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="show" className="grid gap-3">
      <ReviewSection
        title="Company"
        step="company"
        onEdit={onEdit}
        rows={[
          ["Name", draft.companyName],
          ["Domain", draft.domain],
          ["One-liner", draft.oneLiner],
          ["Stage", draft.stage],
          ["Market", draft.market],
        ]}
      />
      <ReviewSection
        title="Positioning"
        step="positioning"
        onEdit={onEdit}
        rows={[
          ["Statement", draft.positioning],
          ["Differentiators", draft.differentiators.join("  ·  ")],
          ["Pricing", draft.pricingPosture],
        ]}
      />
      <ReviewSection
        title="Focus"
        step="focus"
        onEdit={onEdit}
        rows={[
          ["Segments", numbered(draft.segments)],
          ["Priorities", numbered(draft.priorities)],
        ]}
      />
      <ReviewSection
        title="Delivery"
        step="delivery"
        onEdit={onEdit}
        rows={[
          ["Briefing", `${draft.briefingDay} mornings`],
          ["Timezone", draft.timezone],
        ]}
      />

      {error && (
        <motion.div variants={fieldRise}>
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        </motion.div>
      )}
    </motion.div>
  );
}
