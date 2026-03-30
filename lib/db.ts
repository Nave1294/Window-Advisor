import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Lazy singleton — client is only created on first use, never at import time.
// This prevents Next.js build from trying to connect to the DB during static generation.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const client = createClient({
      url: process.env.DATABASE_URL ?? "file:./dev.db",
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Proxy so existing `import { db }` calls still work without changes
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
