import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let _db: Database | undefined;

// Lazy so importing this package never crashes processes (e.g. auth callback)
// that only touch the DB conditionally.
export function getDb(): Database {
  if (!_db) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Bounded so callers in request paths (e.g. the auth callback) fail fast
      // instead of hanging when the database is unreachable.
      connectionTimeoutMillis: 5_000,
      query_timeout: 10_000,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}
