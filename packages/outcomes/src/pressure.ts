/**
 * Budget pressure (2.2): signal categories whose recommendations are
 * repeatedly dropped/ignored lose briefing slots BEFORE any severity
 * dampening — fix the artifact before muting the intelligence. Pure over
 * windowed action rows; the briefing job feeds the result to selection.
 */

export const PRESSURE_MIN_DROPPED = 3;

export interface CategorizedAction {
  /** Category of the originating signal (join done by the caller). */
  category: string;
  status: "open" | "done" | "dropped";
}

/** Pressured = ≥3 dropped in the window AND more dropped than done. */
export function pressuredCategories(
  rows: CategorizedAction[],
): Set<string> {
  const tally = new Map<string, { done: number; dropped: number }>();
  for (const row of rows) {
    if (row.status === "open") continue;
    const t = tally.get(row.category) ?? { done: 0, dropped: 0 };
    t[row.status] += 1;
    tally.set(row.category, t);
  }
  const pressured = new Set<string>();
  for (const [category, t] of tally) {
    if (t.dropped >= PRESSURE_MIN_DROPPED && t.dropped > t.done) {
      pressured.add(category);
    }
  }
  return pressured;
}
