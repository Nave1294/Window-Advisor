import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export type InsulationLevel = "BELOW_CODE" | "AT_CODE" | "ABOVE_CODE";
export type Direction       = "N" | "S" | "E" | "W";
export type WindowSize      = "SMALL" | "MEDIUM" | "LARGE";
export type GlazingType     = "SINGLE" | "DOUBLE" | "TRIPLE";
export type Orientation     = "NS" | "EW"; // which axis the room's LENGTH runs along
export type OccupancyLevel  = "EMPTY" | "ONE_TWO" | "THREE_FOUR";
export type HeatSourceLevel = "MINIMAL" | "LIGHT_ELECTRONICS" | "HOME_OFFICE" | "KITCHEN_LAUNDRY";

// ── users ────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  email:     text("email").notNull().unique(),
  zipCode:   text("zip_code").notNull(),
});

// ── rooms ────────────────────────────────────────────────────────────────────
export const rooms = sqliteTable("rooms", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),

  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:   text("name").notNull(),

  // Location within building
  floorNumber: integer("floor_number").notNull().default(1),
  isTopFloor:  integer("is_top_floor", { mode: "boolean" }).notNull().default(false),

  // Dimensions
  lengthFt:        real("length_ft").notNull(),
  widthFt:         real("width_ft").notNull(),
  ceilingHeightFt: real("ceiling_height_ft").notNull(),

  // Orientation — which axis the LENGTH dimension runs along
  // NS = long walls face E/W; EW = long walls face N/S
  orientation: text("orientation").$type<Orientation>().notNull().default("NS"),

  // Thermal envelope
  insulationLevel: text("insulation_level").$type<InsulationLevel>().notNull(),
  glazingType:     text("glazing_type").$type<GlazingType>().notNull().default("DOUBLE"),
  hasCrossBreeze:  integer("has_cross_breeze", { mode: "boolean" }).notNull(),

  // Internal heat gains
  occupancyLevel:  text("occupancy_level").$type<OccupancyLevel>().notNull().default("ONE_TWO"),
  heatSourceLevel: text("heat_source_level").$type<HeatSourceLevel>().notNull().default("LIGHT_ELECTRONICS"),

  // Comfort targets
  minTempF:    real("min_temp_f").notNull(),
  maxTempF:    real("max_temp_f").notNull(),
  minHumidity: integer("min_humidity").notNull(),
  maxHumidity: integer("max_humidity").notNull(),

  // Derived
  balancePoint: real("balance_point"),
});

// ── windows ──────────────────────────────────────────────────────────────────
export const windows = sqliteTable("windows", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  roomId:    text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  size:      text("size").$type<WindowSize>().notNull(),
  direction: text("direction").$type<Direction>().notNull(),
  // Glazing can be overridden per-window; if null, falls back to room default
  glazingOverride: text("glazing_override").$type<GlazingType>(),
});

// ── exterior_walls ───────────────────────────────────────────────────────────
export const exteriorWalls = sqliteTable("exterior_walls", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  roomId:    text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  direction: text("direction").$type<Direction>().notNull(),
});

// ── recommendations ───────────────────────────────────────────────────────────
export const recommendations = sqliteTable(
  "recommendations",
  {
    id:     text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    date:   text("date").notNull(), // YYYY-MM-DD

    shouldOpen:  integer("should_open", { mode: "boolean" }).notNull(),
    openPeriods: text("open_periods"), // JSON: Array<{from,to,reason}>
    reasoning:   text("reasoning").notNull(),

    emailSent:   integer("email_sent", { mode: "boolean" }).notNull().default(false),
    emailSentAt: text("email_sent_at"),
    createdAt:   text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [unique("room_date_uniq").on(t.roomId, t.date)]
);

// ── Inferred types ────────────────────────────────────────────────────────────
export type User             = typeof users.$inferSelect;
export type NewUser          = typeof users.$inferInsert;
export type Room             = typeof rooms.$inferSelect;
export type NewRoom          = typeof rooms.$inferInsert;
export type Window           = typeof windows.$inferSelect;
export type NewWindow        = typeof windows.$inferInsert;
export type ExteriorWall     = typeof exteriorWalls.$inferSelect;
export type NewExteriorWall  = typeof exteriorWalls.$inferInsert;
export type Recommendation   = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;

export type RoomFull = Room & { windows: Window[]; exteriorWalls: ExteriorWall[] };
