"use client";

import { Button, ProgressBar } from "@heroui/react";
import { Check, RotateCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  activateAction,
  prefillAction,
  saveDraftAction,
  type PrefillData,
} from "./actions";
import {
  normalizeDomain,
  stepErrors,
  STEPS,
  type OnboardingDraft,
  type StepId,
} from "./draft";
import {
  CompanyStep,
  DeliveryStep,
  FocusStep,
  PositioningStep,
  ReviewStep,
  WorkspaceStep,
  type PrefillState,
} from "./steps";

/**
 * The onboarding experience: one full-screen surface from "no workspace" to
 * an activated Intelligence Plan. Every context-step keystroke autosaves to
 * onboarding_state, so leaving and coming back resumes exactly here.
 */

export interface WizardProps {
  email: string;
  firstName: string | null;
  /** null → workspace phase (no org yet). */
  orgName: string | null;
  suggestedOrgName: string;
  initialStep: StepId;
  initialDraft: OnboardingDraft;
  aiAvailable: boolean;
  resumed: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const AI_TARGETS = [
  "oneLiner",
  "stage",
  "market",
  "positioning",
  "differentiators",
  "pricingPosture",
  "segments",
  "priorities",
] as const;

const COMPANY_KEYS = new Set(["oneLiner", "stage", "market"]);

export function OnboardingWizard(props: WizardProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const hasOrg = props.orgName !== null;

  const [draft, setDraft] = useState(props.initialDraft);
  const [step, setStep] = useState<StepId>(props.initialStep);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [prefill, setPrefill] = useState<PrefillState>({ status: "idle" });
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [showResumed, setShowResumed] = useState(props.resumed);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const [maxReached, setMaxReached] = useState(stepIndex);
  const ai = new Set(draft.aiFilled);

  /* ---------------- autosave ---------------- */

  const skipSave = useRef(true);
  useEffect(() => {
    if (!hasOrg || succeeded) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveDraftAction(step, draft)
        .then((r) => setSaveState(r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, step, hasOrg, succeeded]);

  const retrySave = () => {
    setSaveState("saving");
    saveDraftAction(step, draft)
      .then((r) => setSaveState(r.ok ? "saved" : "error"))
      .catch(() => setSaveState("error"));
  };

  /* ---------------- resumed banner ---------------- */

  useEffect(() => {
    if (!showResumed) return;
    const timer = setTimeout(() => setShowResumed(false), 5000);
    return () => clearTimeout(timer);
  }, [showResumed]);

  useEffect(() => {
    if (step === "review") router.prefetch("/dashboard");
  }, [step, router]);

  /* ---------------- field + navigation ---------------- */

  const setField = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setShowResumed(false);
    setDraft((prev) => ({
      ...prev,
      [key]: value,
      aiFilled: prev.aiFilled.filter((k) => k !== key),
    }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: undefined } : prev));
  };

  const goTo = (target: StepId) => {
    const targetIndex = STEPS.findIndex((s) => s.id === target);
    if (targetIndex > maxReached) return;
    setDir(targetIndex > stepIndex ? 1 : -1);
    setErrors({});
    setStep(target);
  };

  const advance = () => {
    const stepErrs = stepErrors(step, draft);
    if (Object.keys(stepErrs).length > 0) {
      setErrors(stepErrs);
      return;
    }
    if (step === "review") {
      void activate();
      return;
    }
    const next = STEPS[stepIndex + 1];
    if (!next) return;
    setDir(1);
    setErrors({});
    setStep(next.id);
    setMaxReached((m) => Math.max(m, stepIndex + 1));
  };

  const back = () => {
    const prev = STEPS[stepIndex - 1];
    if (!prev) return;
    setDir(-1);
    setErrors({});
    setStep(prev.id);
  };

  /* ---------------- AI prefill ---------------- */

  const runPrefill = () => {
    setPrefill({ status: "running" });
    prefillAction({ companyName: draft.companyName, domain: draft.domain })
      .then((res) => {
        if (!res.ok) {
          setPrefill({ status: "error", reason: res.reason });
          return;
        }
        const { filled, elsewhere } = applyPrefill(res.data);
        setPrefill(
          filled > 0
            ? { status: "done", count: filled, elsewhere }
            : { status: "error", reason: "failed" },
        );
      })
      .catch(() => setPrefill({ status: "error", reason: "failed" }));
  };

  const applyPrefill = (data: PrefillData): { filled: number; elsewhere: boolean } => {
    const next = { ...draft };
    const filledKeys: string[] = [];

    for (const key of AI_TARGETS) {
      const value = data[key];
      if (value === null || value === undefined) continue;
      if (key === "pricingPosture") {
        // Enum has a default, so "empty" is unknowable — only fill it while
        // the positioning step is still untouched.
        if (!draft.positioning.trim() && !draft.aiFilled.includes("positioning")) {
          next.pricingPosture = value as OnboardingDraft["pricingPosture"];
          filledKeys.push(key);
        }
        continue;
      }
      const current = next[key];
      if (Array.isArray(current)) {
        if (current.length > 0) continue;
        const items = (value as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 8);
        if (items.length === 0) continue;
        (next[key] as string[]) = items;
        filledKeys.push(key);
      } else {
        if ((current as string).trim()) continue;
        (next[key] as string) = (value as string).trim();
        filledKeys.push(key);
      }
    }

    if (filledKeys.length > 0) {
      next.aiFilled = [...new Set([...draft.aiFilled, ...filledKeys])];
      setDraft(next);
      setErrors({});
    }
    return {
      filled: filledKeys.length,
      elsewhere: filledKeys.some((k) => !COMPANY_KEYS.has(k)),
    };
  };

  /* ---------------- activation ---------------- */

  const activate = async () => {
    setActivating(true);
    setActivateError(null);
    try {
      const result = await activateAction({ ...draft, domain: normalizeDomain(draft.domain) });
      if (result.ok) {
        setSucceeded(true);
      } else {
        setActivateError(result.error);
      }
    } catch {
      setActivateError("Activation failed on our side — nothing was lost, try again.");
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    if (!succeeded) return;
    const timer = setTimeout(() => router.push("/dashboard"), 2200);
    return () => clearTimeout(timer);
  }, [succeeded, router]);

  /* ---------------- render ---------------- */

  const meta = STEPS[stepIndex]!;
  const rise = reduce ? 0 : 14;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Rail
        hasOrg={hasOrg}
        orgName={props.orgName}
        email={props.email}
        step={step}
        maxReached={maxReached}
        onNavigate={goTo}
        saveState={saveState}
        onRetrySave={retrySave}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Ambient glow — the only decorative element on the canvas. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 [background:radial-gradient(640px_220px_at_50%_-60px,oklch(0.62_0.19_255/0.08),transparent)]"
        />

        <MobileHeader hasOrg={hasOrg} stepIndex={stepIndex} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl px-6 pb-24 pt-14 md:pt-24">
            {!hasOrg ? (
              <motion.div
                initial={{ opacity: 0, y: rise }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <StepHeading
                  eyebrow="Welcome"
                  title={
                    props.firstName
                      ? `Good to have you, ${props.firstName}`
                      : "Welcome to AyeAstra"
                  }
                  description="Competitor noise in, weekly intelligence out. First, a home for your team — then we build your Intelligence Plan."
                />
                <div className="mt-8">
                  <WorkspaceStep email={props.email} suggestedName={props.suggestedOrgName} />
                </div>
              </motion.div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  advance();
                }}
              >
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  <motion.div
                    key={step}
                    custom={dir}
                    initial={{ opacity: 0, y: rise * dir }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -rise * dir }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <StepHeading
                      eyebrow={`0${stepIndex + 1} / 0${STEPS.length}`}
                      title={meta.title}
                      description={meta.description}
                      badge={
                        showResumed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted">
                            <RotateCw aria-hidden className="size-3" />
                            Draft restored — picked up where you left off
                          </span>
                        ) : null
                      }
                    />

                    <div className="mt-8">
                      {step === "company" && (
                        <CompanyStep
                          draft={draft}
                          errors={errors}
                          setField={setField}
                          ai={ai}
                          aiAvailable={props.aiAvailable}
                          prefill={prefill}
                          onPrefill={runPrefill}
                        />
                      )}
                      {step === "positioning" && (
                        <PositioningStep draft={draft} errors={errors} setField={setField} ai={ai} />
                      )}
                      {step === "focus" && (
                        <FocusStep draft={draft} errors={errors} setField={setField} ai={ai} />
                      )}
                      {step === "delivery" && (
                        <DeliveryStep
                          draft={draft}
                          errors={errors}
                          setField={setField}
                          ai={ai}
                          email={props.email}
                        />
                      )}
                      {step === "review" && (
                        <ReviewStep draft={draft} onEdit={goTo} error={activateError} />
                      )}
                    </div>

                    <footer className="mt-10 flex items-center justify-between gap-4">
                      <span>
                        {stepIndex > 0 && (
                          <Button type="button" variant="ghost" onPress={back}>
                            Back
                          </Button>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        {step !== "review" && (
                          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
                            Enter ↵
                          </kbd>
                        )}
                        <Button
                          type="submit"
                          isPending={activating}
                          size={step === "review" ? "lg" : "md"}
                        >
                          {step === "review"
                            ? activating
                              ? "Activating…"
                              : "Activate Intelligence Plan"
                            : "Continue"}
                        </Button>
                      </span>
                    </footer>
                    {step === "review" && (
                      <p className="mt-3 text-right text-xs text-muted">
                        Creates version 1 · your Baseline Dossier starts building immediately
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </form>
            )}
          </div>
        </div>
      </div>

      <SuccessOverlay show={succeeded} onOpen={() => router.push("/dashboard")} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heading                                                              */
/* ------------------------------------------------------------------ */

function StepHeading({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <header className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted tabular-nums">{eyebrow}</p>
        {badge}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Rail (desktop) + mobile header                                       */
/* ------------------------------------------------------------------ */

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="size-2 rounded-sm bg-accent" />
      <span className="font-mono text-sm tracking-wide">AyeAstra</span>
    </div>
  );
}

function Rail({
  hasOrg,
  orgName,
  email,
  step,
  maxReached,
  onNavigate,
  saveState,
  onRetrySave,
}: {
  hasOrg: boolean;
  orgName: string | null;
  email: string;
  step: StepId;
  maxReached: number;
  onNavigate: (step: StepId) => void;
  saveState: SaveState;
  onRetrySave: () => void;
}) {
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border px-5 py-8 md:flex">
      <div className="grid gap-8">
        <div className="px-2">
          <Brand />
        </div>

        <nav aria-label="Onboarding steps" className="grid gap-0.5">
          <RailItem
            label={orgName ?? "Workspace"}
            index={0}
            state={hasOrg ? "done" : "active"}
          />
          {STEPS.map((s, i) => {
            const state = !hasOrg
              ? "upcoming"
              : s.id === step
                ? "active"
                : i < stepIndex
                  ? "done"
                  : "upcoming";
            const reachable = hasOrg && i <= maxReached && s.id !== step;
            return (
              <RailItem
                key={s.id}
                label={s.label}
                index={i + 1}
                state={state}
                onPress={reachable ? () => onNavigate(s.id) : undefined}
              />
            );
          })}
        </nav>
      </div>

      <div className="grid gap-2 px-2">
        {hasOrg && <SaveIndicator state={saveState} onRetry={onRetrySave} />}
        <p className="truncate text-xs text-muted" title={email}>
          {email}
        </p>
      </div>
    </aside>
  );
}

function RailItem({
  label,
  index,
  state,
  onPress,
}: {
  label: string;
  index: number;
  state: "done" | "active" | "upcoming";
  onPress?: () => void;
}) {
  const inner = (
    <>
      {state === "active" && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-md border border-border bg-surface"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <span
        className={`relative flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] tabular-nums ${
          state === "done"
            ? "bg-accent-soft text-accent-soft-foreground"
            : state === "active"
              ? "border border-border-secondary text-foreground"
              : "border border-border text-muted"
        }`}
      >
        {state === "done" ? <Check aria-hidden className="size-3" /> : index + 1}
      </span>
      <span
        className={`relative truncate text-[13px] ${
          state === "active" ? "text-foreground" : state === "done" ? "text-muted" : "text-muted/60"
        }`}
      >
        {label}
      </span>
    </>
  );

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        className="relative flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-default-soft"
      >
        {inner}
      </button>
    );
  }
  return (
    <div aria-current={state === "active" ? "step" : undefined} className="relative flex items-center gap-2.5 px-2 py-2">
      {inner}
    </div>
  );
}

function MobileHeader({ hasOrg, stepIndex }: { hasOrg: boolean; stepIndex: number }) {
  const value = hasOrg ? ((stepIndex + 1) / STEPS.length) * 100 : 8;
  return (
    <div className="border-b border-border px-6 py-3 md:hidden">
      <div className="flex items-center justify-between">
        <Brand />
        <span className="font-mono text-xs text-muted tabular-nums">
          {hasOrg ? `${stepIndex + 1} / ${STEPS.length}` : "Workspace"}
        </span>
      </div>
      <ProgressBar aria-label="Onboarding progress" value={value} className="mt-2.5">
        <ProgressBar.Track className="h-0.5">
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Save indicator                                                       */
/* ------------------------------------------------------------------ */

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return <span className="h-4" aria-hidden />;
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer text-left text-xs text-danger underline-offset-2 hover:underline"
      >
        Autosave failed — retry
      </button>
    );
  }
  return (
    <span aria-live="polite" className="flex h-4 items-center gap-1.5 text-xs text-muted">
      {state === "saving" ? (
        <>
          <span className="size-1.5 animate-pulse rounded-full bg-muted" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3 text-success" />
          Saved
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Success takeover                                                     */
/* ------------------------------------------------------------------ */

function SuccessOverlay({ show, onOpen }: { show: boolean; onOpen: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background"
          role="status"
        >
          <motion.svg viewBox="0 0 64 64" className="size-16" aria-hidden>
            <motion.circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              className="stroke-accent"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            />
            <motion.path
              d="M21 33.5 L29 41 L44 25"
              fill="none"
              className="stroke-accent"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.45, duration: 0.35, ease: "easeOut" }}
            />
          </motion.svg>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.3 }}
            className="text-center"
          >
            <h2 className="text-xl font-semibold tracking-tight">Intelligence Plan activated</h2>
            <p className="mt-1.5 text-sm text-muted">
              Your Baseline Dossier is being built — first briefing lands within 24 hours.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.3 }}
          >
            <Button variant="ghost" onPress={onOpen}>
              Open dashboard
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
