/**
 * The outcome loop's state machine (2.2): statuses are open|done|dropped,
 * NOTHING more — deep work belongs in the customer's PM tool. Pure
 * descriptors; persistence maps them onto actions/outcomes rows.
 */

export type ActionStatus = "open" | "done" | "dropped";
export type Disposition = "done" | "dropped";

/** open is the only state that transitions; closes are terminal. */
export function canTransition(from: ActionStatus, to: Disposition): boolean {
  return from === "open" && (to === "done" || to === "dropped");
}

export interface CloseInput {
  disposition: Disposition;
  /** Optional one-line "what happened?" — becomes the outcomes row. */
  note?: string | null;
}

export interface CloseDescriptor {
  update: { status: Disposition; completedAt: Date };
  /** Null when no note: closing is one click, never a form. */
  outcome: { kpi: string; result: Disposition } | null;
}

export function closeAction(
  current: ActionStatus,
  input: CloseInput,
  now: Date = new Date(),
): CloseDescriptor | null {
  if (!canTransition(current, input.disposition)) return null;
  const note = input.note?.trim();
  return {
    update: { status: input.disposition, completedAt: now },
    outcome: note ? { kpi: note, result: input.disposition } : null,
  };
}
