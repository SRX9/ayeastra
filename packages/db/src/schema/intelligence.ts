import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../id";
import {
  actionSourceType,
  actionStatus,
  askRole,
  briefingKind,
  briefingStatus,
  confidence,
  deliveryChannel,
  deliveryStatus,
  deliveryTargetType,
  feedbackTargetType,
  feedbackVerdict,
  missionStatus,
  orgEntityRole,
  orgEntityTier,
  severity,
  signalCategory,
  signalStatus,
} from "./enums";
import { changes, entities } from "./observation";

/**
 * Per-org intelligence layer — what world-facts mean for THIS business.
 * Every table carries workos_org_id as the leading column of every index,
 * and is only reachable through scopedDb (data-model law #3).
 */

export const orgEntities = pgTable(
  "org_entities",
  {
    workosOrgId: text("workos_org_id").notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    role: orgEntityRole("role").notNull(),
    tier: orgEntityTier("tier").default("primary").notNull(),
    importance: smallint("importance"),
    notes: text("notes"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (t) => [primaryKey({ columns: [t.workosOrgId, t.entityId] })],
);

/** Append-only versioned BusinessContext; current = max(version) per org. */
export const businessContext = pgTable(
  "business_context",
  {
    workosOrgId: text("workos_org_id").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workosOrgId, t.version] })],
);

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    changeId: uuid("change_id")
      .notNull()
      .references(() => changes.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    category: signalCategory("category").notNull(),
    severity: severity("severity").notNull(),
    confidence: confidence("confidence").notNull(),
    finding: text("finding").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    recommendedAction: text("recommended_action"),
    /** "What would change this assessment" — honesty law #5. */
    confidenceNotes: text("confidence_notes"),
    /** [{priorityId, segment, positioningRisk}] */
    priorityAttachments: jsonb("priority_attachments"),
    contextVersion: integer("context_version").notNull(),
    /** Deterministic sub-scores from the scoring engine. */
    scores: jsonb("scores"),
    evidenceIds: uuid("evidence_ids").array().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    dedupKey: text("dedup_key").notNull(),
    status: signalStatus("status").default("new").notNull(),
    snoozedUntil: timestamp("snoozed_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("signals_org_created_idx").on(t.workosOrgId, t.createdAt.desc()),
    index("signals_org_entity_created_idx").on(
      t.workosOrgId,
      t.entityId,
      t.createdAt.desc(),
    ),
    index("signals_org_dedup_idx").on(t.workosOrgId, t.dedupKey),
    index("signals_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    signalIds: uuid("signal_ids").array().notNull(),
    pattern: text("pattern").notNull(),
    analysis: text("analysis").notNull(),
    forwardLook: text("forward_look"),
    recommendedActions: jsonb("recommended_actions"),
    confidence: confidence("confidence").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("insights_org_created_idx").on(t.workosOrgId, t.createdAt.desc())],
);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    sourceType: actionSourceType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    description: text("description").notNull(),
    ownerUserId: text("owner_user_id"),
    status: actionStatus("status").default("open").notNull(),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("actions_org_status_idx").on(t.workosOrgId, t.status)],
);

/** Delivered briefings are append-only (law #4); status flow generating→ready→delivered. */
export const briefings = pgTable(
  "briefings",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    kind: briefingKind("kind").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: briefingStatus("status").default("generating").notNull(),
    sections: jsonb("sections"),
    contextVersion: integer("context_version").notNull(),
    renderedR2Keys: jsonb("rendered_r2_keys"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("briefings_org_period_idx").on(t.workosOrgId, t.periodEnd.desc()),
  ],
);

export const battlecards = pgTable(
  "battlecards",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    /** Per-section: { content, provenance: "auto"|"edited", updatedAt }. */
    sections: jsonb("sections").notNull(),
    changelog: jsonb("changelog"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.workosOrgId, t.entityId)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    userId: text("user_id").notNull(),
    targetType: feedbackTargetType("target_type").notNull(),
    targetId: text("target_id").notNull(),
    verdict: feedbackVerdict("verdict").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("feedback_org_target_idx").on(t.workosOrgId, t.targetType, t.targetId),
  ],
);

export const askThreads = pgTable(
  "ask_threads",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ask_threads_org_idx").on(t.workosOrgId, t.createdAt.desc())],
);

export const askMessages = pgTable(
  "ask_messages",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => askThreads.id),
    role: askRole("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ask_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    channel: deliveryChannel("channel").notNull(),
    targetType: deliveryTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    status: deliveryStatus("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => [
    index("deliveries_org_target_idx").on(
      t.workosOrgId,
      t.targetType,
      t.targetId,
    ),
  ],
);

/**
 * Feedback loop v1 (scoring doc): per-org learned multiplier at
 * (entity × category) granularity — heuristic, transparent, resettable.
 * consecutiveNegative drives one-tap mute offers after 3 in a row.
 */
export const orgScoringWeights = pgTable(
  "org_scoring_weights",
  {
    workosOrgId: text("workos_org_id").notNull(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    category: signalCategory("category").notNull(),
    multiplier: real("multiplier").default(1).notNull(),
    consecutiveNegative: integer("consecutive_negative").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workosOrgId, t.entityId, t.category] })],
);

// ── Dormant primitives (day-1 schema per PRD; activated Phase 2/3) ──────

export const missions = pgTable(
  "missions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    goal: text("goal").notNull(),
    entityIds: uuid("entity_ids").array().notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    status: missionStatus("status").default("draft").notNull(),
    kpis: jsonb("kpis"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("missions_org_idx").on(t.workosOrgId, t.status)],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    workosOrgId: text("workos_org_id").notNull(),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id),
    kpi: text("kpi").notNull(),
    result: text("result").notNull(),
    evidenceIds: uuid("evidence_ids").array().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("outcomes_org_idx").on(t.workosOrgId, t.createdAt.desc())],
);
