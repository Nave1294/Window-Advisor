export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, rooms, windows, exteriorWalls } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type {
  InsulationLevel, Direction, WindowSize, GlazingType,
  Orientation, OccupancyLevel, HeatSourceLevel,
} from "@/lib/schema";

interface WindowPayload {
  size:            WindowSize;
  direction:       Direction;
  glazingOverride?: GlazingType;
}

interface SetupPayload {
  email:           string;
  zipCode:         string;
  roomName:        string;
  floorNumber:     number;
  isTopFloor:      boolean;
  lengthFt:        number;
  widthFt:         number;
  ceilingHeightFt: number;
  orientation:     Orientation;
  insulationLevel: InsulationLevel;
  glazingType:     GlazingType;
  hasCrossBreeze:  boolean;
  occupancyLevel:  OccupancyLevel;
  heatSourceLevel: HeatSourceLevel;
  windows:         WindowPayload[];
  exteriorWalls:   Direction[];
  minTempF:        number;
  maxTempF:        number;
  minHumidity:     number;
  maxHumidity:     number;
}

const VALID_INSULATION: InsulationLevel[] = ["BELOW_CODE", "AT_CODE", "ABOVE_CODE"];
const VALID_GLAZING:    GlazingType[]     = ["SINGLE", "DOUBLE", "TRIPLE"];
const VALID_ORIENT:     Orientation[]     = ["NS", "EW"];
const VALID_OCC:        OccupancyLevel[]  = ["EMPTY", "ONE_TWO", "THREE_FOUR"];
const VALID_HEAT:       HeatSourceLevel[] = ["MINIMAL", "LIGHT_ELECTRONICS", "HOME_OFFICE", "KITCHEN_LAUNDRY"];

export async function POST(req: NextRequest) {
  let body: SetupPayload;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const {
    email, zipCode, roomName, floorNumber, isTopFloor,
    lengthFt, widthFt, ceilingHeightFt,
    orientation, insulationLevel, glazingType, hasCrossBreeze,
    occupancyLevel, heatSourceLevel,
    windows: windowList, exteriorWalls: wallList,
    minTempF, maxTempF, minHumidity, maxHumidity,
  } = body;

  if (!email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
    return NextResponse.json({ error: "Invalid email." }, { status: 422 });
  if (!zipCode?.match(/^\d{5}$/))
    return NextResponse.json({ error: "Invalid ZIP code." }, { status: 422 });
  if (!roomName?.trim())
    return NextResponse.json({ error: "Room name required." }, { status: 422 });
  if (!VALID_INSULATION.includes(insulationLevel))
    return NextResponse.json({ error: "Invalid insulation level." }, { status: 422 });
  if (!VALID_GLAZING.includes(glazingType))
    return NextResponse.json({ error: "Invalid glazing type." }, { status: 422 });
  if (!VALID_ORIENT.includes(orientation))
    return NextResponse.json({ error: "Invalid orientation." }, { status: 422 });
  if (!VALID_OCC.includes(occupancyLevel))
    return NextResponse.json({ error: "Invalid occupancy level." }, { status: 422 });
  if (!VALID_HEAT.includes(heatSourceLevel))
    return NextResponse.json({ error: "Invalid heat source level." }, { status: 422 });
  if (!windowList?.length)
    return NextResponse.json({ error: "At least one window required." }, { status: 422 });
  if (!wallList?.length)
    return NextResponse.json({ error: "At least one exterior wall required." }, { status: 422 });
  if (minTempF >= maxTempF || minHumidity >= maxHumidity)
    return NextResponse.json({ error: "Invalid comfort range." }, { status: 422 });

  try {
    // Upsert user
    let user = (await db.select().from(users).where(eq(users.email, email)))[0];
    if (user) {
      await db.update(users).set({ zipCode }).where(eq(users.id, user.id));
    } else {
      const [created] = await db.insert(users).values({ email, zipCode }).returning();
      user = created;
    }

    // Create room
    const [room] = await db.insert(rooms).values({
      userId: user.id,
      name:   roomName.trim(),
      floorNumber:     floorNumber ?? 1,
      isTopFloor:      isTopFloor ?? false,
      lengthFt, widthFt, ceilingHeightFt,
      orientation:     orientation ?? "NS",
      insulationLevel,
      glazingType:     glazingType ?? "DOUBLE",
      hasCrossBreeze,
      occupancyLevel:  occupancyLevel ?? "ONE_TWO",
      heatSourceLevel: heatSourceLevel ?? "LIGHT_ELECTRONICS",
      minTempF, maxTempF, minHumidity, maxHumidity,
      balancePoint: null,
    }).returning();

    // Insert windows
    await db.insert(windows).values(
      windowList.map(w => ({
        roomId:          room.id,
        size:            w.size,
        direction:       w.direction,
        glazingOverride: w.glazingOverride ?? null,
      }))
    );

    // Insert exterior walls
    await db.insert(exteriorWalls).values(
      wallList.map(dir => ({ roomId: room.id, direction: dir }))
    );

    // Trigger balance point calculation (fire-and-forget — don't block the response)
    const origin = req.nextUrl.origin;
    fetch(`${origin}/api/rooms/${room.id}/balance-point`, { method: "POST" })
      .catch(err => console.error("Balance point calculation failed:", err));

    return NextResponse.json({ ok: true, userId: user.id, roomId: room.id });

  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json({ error: "Database error. Please try again." }, { status: 500 });
  }
}

