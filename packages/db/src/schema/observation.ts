import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../id";
import {
  aliasSource,
  entityRelation,
  entityType,
  materiality,
  signalCategory,
  sourceDiscovery,
  sourceKind,
  sourceStatus,
} from "./enums";

/**
 * Global observation layer — facts about the world. NO org column anywhere
 * here (data-model law #3): one fetch serves every org watching the source.
 * snapshots / changes / evidence are append-only forever (law #4).
 */

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  type: entityType("type").notNull(),
  canonicalName: text("canonical_name").notNull(),
  domain: text("domain"),
  description: text("description"),
  profile: jsonb("profile"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const entityAliases = pgTable(
  "entity_aliases",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    alias: text("alias").notNull(),
    source: aliasSource("source").notNull(),
  },
  (t) => [unique().on(t.alias, t.entityId)],
);

export const entityRelations = pgTable(
  "entity_relations",
  {
    parentId: uuid("parent_id")
      .notNull()
      .references(() => entities.id),
    childId: uuid("child_id")
      .notNull()
      .references(() => entities.id),
    relation: entityRelation("relation").notNull(),
  },
  (t) => [unique().on(t.parentId, t.childId, t.relation)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    url: text("url").notNull().unique(),
    kind: sourceKind("kind").notNull(),
    discovery: sourceDiscovery("discovery").notNull(),
    status: sourceStatus("status").default("ok").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sources_entity_idx").on(t.entityId)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    contentHash: text("content_hash").notNull(),
    r2HtmlKey: text("r2_html_key").notNull(),
    r2MdKey: text("r2_md_key").notNull(),
    r2ScreenshotKey: text("r2_screenshot_key"),
    httpStatus: integer("http_status"),
    fetchMeta: jsonb("fetch_meta"),
  },
  (t) => [index("snapshots_source_fetched_idx").on(t.sourceId, t.fetchedAt)],
);

export const changes = pgTable(
  "changes",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    beforeSnapshotId: uuid("before_snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    afterSnapshotId: uuid("after_snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    materiality: materiality("materiality").notNull(),
    category: signalCategory("category"),
    /** Kind-aware extractor output; null when extraction degraded to diff-only. */
    extractedFacts: jsonb("extracted_facts"),
    diffR2Key: text("diff_r2_key"),
    embedding: vector("embedding", { dimensions: 1536 }),
    /** Org-agnostic one-liner, small-model generated. */
    summary: text("summary"),
  },
  (t) => [
    index("changes_source_detected_idx").on(t.sourceId, t.detectedAt),
    index("changes_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    changeId: uuid("change_id").references(() => changes.id),
    sourceUrl: text("source_url").notNull(),
    fetchedAt: timestamp("fetched_at").notNull(),
    contentHash: text("content_hash").notNull(),
    /** { before_html, after_html, before_md, after_md, diff_html, screenshots[] } */
    r2Keys: jsonb("r2_keys").notNull(),
    extracted: jsonb("extracted"),
    /** Unguessable public-share token; null = not shared. Revoke by nulling. */
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("evidence_change_idx").on(t.changeId)],
);
