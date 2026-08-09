import { neon } from "@neondatabase/serverless";

import { DATABASE_URL } from "@/lib/config";

if (!DATABASE_URL) {
  // Surface a clear error at first query rather than a cryptic driver failure.
  console.warn("[db] DATABASE_URL is not set — conversation persistence will fail.");
}

// Neon's HTTP driver: one tagged-template `sql` shared across serverless invocations.
// `sql.transaction([...])` batches statements into a single round-trip when we need
// atomic multi-statement writes (e.g. replacing a conversation's messages).
export const sql = neon(DATABASE_URL);
