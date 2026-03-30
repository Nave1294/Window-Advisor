import { createClient } from "@libsql/client";

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  email      TEXT NOT NULL UNIQUE,
  zip_code   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  floor_number      INTEGER NOT NULL DEFAULT 1,
  is_top_floor      INTEGER NOT NULL DEFAULT 0,
  length_ft         REAL NOT NULL,
  width_ft          REAL NOT NULL,
  ceiling_height_ft REAL NOT NULL,
  orientation       TEXT NOT NULL DEFAULT 'NS',
  insulation_level  TEXT NOT NULL,
  glazing_type      TEXT NOT NULL DEFAULT 'DOUBLE',
  has_cross_breeze  INTEGER NOT NULL,
  occupancy_level   TEXT NOT NULL DEFAULT 'ONE_TWO',
  heat_source_level TEXT NOT NULL DEFAULT 'LIGHT_ELECTRONICS',
  min_temp_f        REAL NOT NULL,
  max_temp_f        REAL NOT NULL,
  min_humidity      INTEGER NOT NULL,
  max_humidity      INTEGER NOT NULL,
  balance_point     REAL
);

CREATE TABLE IF NOT EXISTS windows (
  id               TEXT PRIMARY KEY,
  room_id          TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  size             TEXT NOT NULL,
  direction        TEXT NOT NULL,
  glazing_override TEXT
);

CREATE TABLE IF NOT EXISTS exterior_walls (
  id        TEXT PRIMARY KEY,
  room_id   TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  direction TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  should_open   INTEGER NOT NULL,
  open_periods  TEXT,
  reasoning     TEXT NOT NULL,
  email_sent    INTEGER NOT NULL DEFAULT 0,
  email_sent_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, date)
);
`;

export async function runMigrations(dbUrl?: string) {
  const client = createClient({ url: dbUrl ?? process.env.DATABASE_URL ?? "file:./dev.db" });
  await client.executeMultiple(DDL);
  console.log("✅ Database migrations complete.");
  client.close();
}

if (require.main === module) {
  runMigrations().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
}
