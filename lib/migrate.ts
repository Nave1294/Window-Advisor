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
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  floor_number        INTEGER NOT NULL DEFAULT 1,
  is_top_floor        INTEGER NOT NULL DEFAULT 0,
  length_ft           REAL NOT NULL,
  width_ft            REAL NOT NULL,
  ceiling_height_ft   REAL NOT NULL,
  orientation         TEXT NOT NULL DEFAULT 'NS',
  insulation_level    TEXT NOT NULL,
  glazing_type        TEXT NOT NULL DEFAULT 'DOUBLE',
  has_cross_breeze    INTEGER NOT NULL,
  occupancy_schedule  TEXT NOT NULL DEFAULT '{}',
  heat_source_level   TEXT NOT NULL DEFAULT 'LIGHT_ELECTRONICS',
  min_temp_f          REAL NOT NULL,
  max_temp_f          REAL NOT NULL,
  min_humidity        INTEGER NOT NULL,
  max_humidity        INTEGER NOT NULL,
  balance_point       REAL,
  comfort_bias        REAL NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  date       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Migrations for existing databases (safe to run repeatedly)
ALTER TABLE rooms ADD COLUMN occupancy_schedule TEXT NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN comfort_bias REAL NOT NULL DEFAULT 0;
`;

// Wrap each ALTER in its own try/catch since SQLite doesn't support IF NOT EXISTS on ALTER
const ALTER_STATEMENTS = [
  "ALTER TABLE rooms ADD COLUMN occupancy_schedule TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE rooms ADD COLUMN comfort_bias REAL NOT NULL DEFAULT 0",
];

export async function runMigrations(dbUrl?: string) {
  const client = createClient({ url: dbUrl ?? process.env.DATABASE_URL ?? "file:./dev.db" });

  // Run CREATE TABLE statements
  const createDDL = DDL.split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("ALTER") && !s.startsWith("--"))
    .join(";\n") + ";";

  await client.executeMultiple(createDDL);

  // Run ALTER statements individually, ignoring "column already exists" errors
  for (const stmt of ALTER_STATEMENTS) {
    try {
      await client.execute(stmt);
    } catch {
      // Column already exists — fine
    }
  }

  console.log("✅ Database migrations complete.");
  client.close();
}

if (require.main === module) {
  runMigrations().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
}
