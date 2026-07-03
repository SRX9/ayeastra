import { describe, expect, test } from "bun:test";
import dotenv from "dotenv";
import { like } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

import { getDb } from "./client";
import { costPerOrgDay, costPerTaskDay, orgCostAnomalies } from "./cost-rollups";
import { costEvents } from "./schema";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("cost rollups", () => {
  const org = `org_cost_test_${Date.now()}`;
  const task = `test-task-${Date.now()}`;

  test("rollups aggregate per day and anomaly rule fires at >3× trailing mean", async () => {
    const db = getDb();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date(new Date().toISOString().slice(0, 10)); // UTC midnight

    // Trailing week: $0.10/day; "today": $1 → 10× the mean → anomaly.
    const rows = [];
    for (let back = 7; back >= 1; back--) {
      rows.push({
        at: new Date(today.getTime() - back * dayMs + 60_000),
        vendor: "openai" as const,
        taskName: task,
        units: 1000,
        costUsd: "0.100000",
        workosOrgId: org,
      });
    }
    rows.push({
      at: new Date(today.getTime() + 60_000),
      vendor: "openai" as const,
      taskName: task,
      units: 10_000,
      costUsd: "1.000000",
      workosOrgId: org,
    });
    await db.insert(costEvents).values(rows);

    try {
      const from = new Date(today.getTime() - 8 * dayMs);
      const to = new Date(today.getTime() + dayMs);

      const perOrg = (await costPerOrgDay(from, to, db)).filter(
        (r) => r.key === org,
      );
      expect(perOrg).toHaveLength(8);
      expect(perOrg.reduce((a, r) => a + r.costUsd, 0)).toBeCloseTo(1.7, 6);

      const perTask = (await costPerTaskDay(from, to, db)).filter(
        (r) => r.key === task,
      );
      expect(perTask.at(-1)!.costUsd).toBeCloseTo(1.0, 6);

      const anomalies = (await orgCostAnomalies(today, db)).filter(
        (a) => a.workosOrgId === org,
      );
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.dayUsd).toBeCloseTo(1.0, 6);
      expect(anomalies[0]!.trailingMeanUsd).toBeCloseTo(0.1, 6);
    } finally {
      await db.delete(costEvents).where(like(costEvents.taskName, task));
    }
  }, 30_000);
});
