import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Singleton DB client — safe for Next.js dev hot-reload
// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as {
  _libsqlClient: ReturnType<typeof createClient> | undefined;
};

const client =
  globalForDb._libsqlClient ??
  createClient({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._libsqlClient = client;
}

export const db = drizzle(client, { schema });
