import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: "../../apps/server/.env" });

// Run once per database, BEFORE db:push — vector columns need the extension.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.end();
  console.log("pgvector extension ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
