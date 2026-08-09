// Apply src/lib/schema.sql to the Neon database in DATABASE_URL. Idempotent (uses
// CREATE TABLE IF NOT EXISTS). Run with: pnpm db:init
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (load it from .env first).");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../src/lib/schema.sql");
const schema = readFileSync(schemaPath, "utf8");

// Split into individual statements; the Neon HTTP driver runs one per call.
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")));

const sql = neon(url);
for (const stmt of statements) {
  await sql.query(stmt);
  console.log("ok:", stmt.split("\n")[0].slice(0, 70));
}
console.log(`Applied ${statements.length} statement(s).`);
