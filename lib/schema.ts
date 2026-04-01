import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export type InsulationLevel  = "BELOW_CODE" | "AT_CODE" | "ABOVE_CODE";
export type Direction        = "N" | "S" | "E" | "W";
export type WindowSize       = "SMALL" | "MEDIUM" | "LARGE";
export type GlazingType      = "SINGLE" | "DOUBLE" | "TRIPLE";
export type Orientation      = "NS" | "EW";
export type OccupancyLevel   = "EMPTY" | "ONE_TWO" | "THREE_FOUR";
export type HeatSourceLevel  = "MINIMAL" | "LIGHT_ELECTRONICS" | "HOME_OFFICE" | "KITCHEN_LAUNDRY";
export type FeedbackType     = "TOO_HOT" | "TOO_COLD";
export type SurfaceColor     = "LIGHT" | "MEDIUM" | "DARK";
export type RoofType         = "ATTIC_BUFFERED" | "FLAT_VAULTED" | "DIRECT_EXPOSED";

/**
 * A block of time when the room is NOT occupied.
 * days: array of day-of-week indices (0=Sun, 1=Mon … 6=Sat)
 * startHour / endHour: 0–24 in local time
 */
export interface UnoccupiedBlock {
  id:        string;
  startHour: number;
  endHour:   number;
  days:      number[];   // e.g. [1,2,3,4,5] = weekdays
}

// ── users ─────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  email:     text("email").notNull().unique(),
  zipCode:   text("zip_code").notNull(),
});

// ── rooms ─────────────────────────────────────────────────────────────────────
export const rooms = sqliteTable("rooms", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),

  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:   text("name").notNull(),

  floorNumber: integer("floor_number").notNull().default(1),
  isTopFloor:  integer("is_top_floor", { mode: "boolean" }).notNull().default(false),

  lengthFt:        real("length_ft").notNull(),
  widthFt:         real("width_ft").notNull(),
  ceilingHeightFt: real("ceiling_height_ft").notNull(),
  orientation:     text("orientation").$type<Orientation>().notNull().default("NS"),

  insulationLevel: text("insulation_level").$type<InsulationLevel>().notNull(),
  glazingType:     text("glazing_type").$type<GlazingType>().notNull().default("DOUBLE"),
  hasCrossBreeze:  integer("has_cross_breeze", { mode: "boolean" }).notNull(),

  // Typical headcount when the room IS occupied
  occupancyLevel: text("occupancy_level").$type<OccupancyLevel>().notNull().default("ONE_TWO"),

  // JSON: UnoccupiedBlock[] — blocks when the room is NOT occupied
  unoccupiedBlocks: text("unoccupied_blocks").notNull().default("[]"),

  heatSourceLevel: text("heat_source_level").$type<HeatSourceLevel>().notNull().default("LIGHT_ELECTRONICS"),

  minTempF:    real("min_temp_f").notNull(),
  maxTempF:    real("max_temp_f").notNull(),
  minHumidity: integer("min_humidity").notNull(),
  maxHumidity: integer("max_humidity").notNull(),

  balancePoint:          real("balance_point"),
  comfortBias:           real("comfort_bias").notNull().default(0),
  notificationsEnabled:  integer("notifications_enabled", { mode: "boolean" }).notNull().default(false),
  lastNotifiedOpen:      text("last_notified_open"),
  lastNotifiedClose:     text("last_notified_close"),

  // Solar & envelope
  wallColor:   text("wall_color").$type<SurfaceColor>().notNull().default("MEDIUM"),
  roofColor:   text("roof_color").$type<SurfaceColor>().notNull().default("MEDIUM"),
  roofType:    text("roof_type").$type<RoofType>().notNull().default("ATTIC_BUFFERED"),
});

// ── windows ───────────────────────────────────────────────────────────────────
export const windows = sqliteTable("windows", {
  id:              text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  roomId:          text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  size:            text("size").$type<WindowSize>().notNull(),
  direction:       text("direction").$type<Direction>().notNull(),
  glazingOverride: text("glazing_override").$type<GlazingType>(),
});

// ── exterior_walls ────────────────────────────────────────────────────────────
export const exteriorWalls = sqliteTable("exterior_walls", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  roomId:    text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  direction: text("direction").$type<Direction>().notNull(),
});

// ── feedback ──────────────────────────────────────────────────────────────────
export const feedback = sqliteTable("feedback", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  roomId:    text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  type:      text("type").$type<FeedbackType>().notNull(),
  date:      text("date").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── recommendations ───────────────────────────────────────────────────────────
export const recommendations = sqliteTable(
  "recommendations",
  {
    id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId:        text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    date:          text("date").notNull(),
    shouldOpen:    integer("should_open",  { mode: "boolean" }).notNull(),
    openPeriods:   text("open_periods"),
    airingWindows: text("airing_windows"),  // JSON: AiringWindow[]
    bpRange:       text("bp_range"),        // JSON: { min, max, label }
    forecastMeta:  text("forecast_meta"),   // JSON: { cityName, highF, lowF }
    reasoning:     text("reasoning").notNull(),
    emailSent:     integer("email_sent",   { mode: "boolean" }).notNull().default(false),
    emailSentAt:   text("email_sent_at"),
    createdAt:     text("created_at").notNull().default(sql`(datetime('now'))`),
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
