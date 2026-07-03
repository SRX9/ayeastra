import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../id";
import { costVendor } from "./enums";
import { sources } from "./observation";

/**
 * Ops layer. Tenancy mixed and documented per table:
 * - monitor_state: global (keyed by source, shared like sources).
 * - cost_events: global ledger; workos_org_id nullable for org-attributable spend.
 * - job_dead_letters: global.
 */

/** Adaptive-scheduler state, one row per source (collection-engine doc). */
export const monitorState = pgTable(
  "monitor_state",
  {
    sourceId: uuid("source_id")
      .primaryKey()
      .references(() => sources.id),
    checkIntervalMinutes: integer("check_interval_minutes").notNull(),
    nextCheckAt: timestamp("next_check_at").notNull(),
    lastChangeAt: timestamp("last_change_at"),
    changeRateEwma: real("change_rate_ewma").default(0).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    /** Ops override; null = adaptive. */
    pinnedIntervalMinutes: integer("pinned_interval_minutes"),
  },
  (t) => [index("monitor_state_next_check_idx").on(t.nextCheckAt)],
);

/** Every dollar attributed (law #6): fetches, tokens, sends → one ledger. */
export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    at: timestamp("at").defaultNow().notNull(),
    vendor: costVendor("vendor").notNull(),
    taskName: text("task_name").notNull(),
    units: real("units").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    workosOrgId: text("workos_org_id"),
    sourceId: uuid("source_id"),
    jobRunId: text("job_run_id"),
    meta: jsonb("meta"),
  },
  (t) => [
    index("cost_events_at_idx").on(t.at.desc()),
    index("cost_events_vendor_at_idx").on(t.vendor, t.at.desc()),
  ],
);

export const jobDeadLetters = pgTable("job_dead_letters", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  jobName: text("job_name").notNull(),
  payload: jsonb("payload").notNull(),
  error: text("error").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});
