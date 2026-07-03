import dotenv from "dotenv";

dotenv.config({ path: "../../apps/server/.env" });

import { eq } from "drizzle-orm";

import { getDb } from "./client";
import { scopedDb } from "./scoped";
import {
  entities,
  entityAliases,
  monitorState,
  orgEntities,
  sources,
  type sourceKind,
} from "./schema";

/**
 * Demo world every engine doc's tests build on (data-model checklist #6):
 * one demo org watching 3 real billing competitors with Tier-1 sources.
 * Idempotent — safe to re-run.
 */

const DEMO_ORG_ID = process.env.SEED_ORG_ID ?? "org_demo_ayeastra";

type Kind = (typeof sourceKind.enumValues)[number];

const COMPETITORS: {
  name: string;
  domain: string;
  aliases: string[];
  description: string;
  sources: { url: string; kind: Kind }[];
}[] = [
  {
    name: "Stripe",
    domain: "stripe.com",
    aliases: ["Stripe, Inc."],
    description: "Payments infrastructure platform.",
    sources: [
      { url: "https://stripe.com/pricing", kind: "pricing" },
      { url: "https://stripe.com/blog/changelog", kind: "changelog" },
      { url: "https://stripe.com/blog", kind: "blog" },
      { url: "https://stripe.com/jobs/search", kind: "careers" },
    ],
  },
  {
    name: "Paddle",
    domain: "paddle.com",
    aliases: ["Paddle.com"],
    description: "Merchant-of-record payments and billing for SaaS.",
    sources: [
      { url: "https://www.paddle.com/pricing", kind: "pricing" },
      { url: "https://developer.paddle.com/changelog/overview", kind: "changelog" },
      { url: "https://www.paddle.com/blog", kind: "blog" },
      { url: "https://www.paddle.com/careers", kind: "careers" },
    ],
  },
  {
    name: "Chargebee",
    domain: "chargebee.com",
    aliases: ["ChargeBee"],
    description: "Subscription billing and revenue management platform.",
    sources: [
      { url: "https://www.chargebee.com/pricing/", kind: "pricing" },
      { url: "https://www.chargebee.com/blog/", kind: "blog" },
      { url: "https://www.chargebee.com/careers/", kind: "careers" },
    ],
  },
];

async function main() {
  const db = getDb();
  const scoped = scopedDb(DEMO_ORG_ID, db);

  for (const c of COMPETITORS) {
    // Entities have no natural unique key in the schema; domain is the seed's.
    let [entity] = await db
      .select()
      .from(entities)
      .where(eq(entities.domain, c.domain));
    if (!entity) {
      [entity] = await db
        .insert(entities)
        .values({
          type: "company",
          canonicalName: c.name,
          domain: c.domain,
          description: c.description,
        })
        .returning();
    }
    const entityId = entity!.id;

    await db
      .insert(entityAliases)
      .values(
        [c.name, ...c.aliases].map((alias) => ({
          entityId,
          alias,
          source: "user" as const,
        })),
      )
      .onConflictDoNothing();

    for (const s of c.sources) {
      const [source] = await db
        .insert(sources)
        .values({ entityId, url: s.url, kind: s.kind, discovery: "user" })
        .onConflictDoNothing({ target: sources.url })
        .returning();
      if (source) {
        // Pricing pages are the hot path; everything else starts daily.
        await db
          .insert(monitorState)
          .values({
            sourceId: source.id,
            checkIntervalMinutes: s.kind === "pricing" ? 360 : 1440,
            nextCheckAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }

    await scoped
      .insert(orgEntities, {
        entityId,
        role: "competitor",
        tier: "primary",
        importance: 3,
      })
      .onConflictDoNothing();
  }

  const world = await db.select().from(sources);
  console.log(
    `Seeded org ${DEMO_ORG_ID}: ${COMPETITORS.length} competitors, ${world.length} sources total.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
