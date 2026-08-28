import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { daySettingsOfPlan, upsertDaySettings } from "@/lib/engine/db";
import type { InsertRow } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ตั้งค่ารายวันของแผน — `E3` · `D69`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **route พูด `trip_day_id` (uuid) เท่านั้น** — สะพาน `"d0"` อยู่ฝั่งไคลเอนต์
 * เหตุผลเดียวกับ `days`: `"d0"` มีอยู่แต่ในไฟล์ TS · เซิร์ฟเวอร์ไม่มีทางรู้จัก
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DaySettingsDto = {
  trip_day_id: string;
  start_time: string;
  return_travel_mode: string | null;
  is_locked: boolean;
  note: string | null;
};

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-day-settings", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId || !UUID.test(planId)) {
    return NextResponse.json({ error: "planId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await daySettingsOfPlan(db, tripId, planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json((data ?? []) as unknown as DaySettingsDto[], {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * เขียนตั้งค่าหลายวันพร้อมกัน — `{ planId, rows: [{ tripDayId, startTime?, returnTravelMode?, isLocked? }] }`
 *
 * 🔴 **รับเป็น *ชุด* เพราะ "ล็อกทุกวัน" เขียนทีเดียวหลายแถว**
 * เขียนทีละคำขอ = ล็อกได้ครึ่งเดียวถ้าเน็ตหลุดกลางทาง **แล้วผู้ใช้จะไม่รู้ว่าครึ่งไหน**
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: { planId?: string; rows?: { tripDayId?: string; startTime?: string; returnTravelMode?: string | null; isLocked?: boolean }[] };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.planId || !UUID.test(b.planId) || !Array.isArray(b.rows) || b.rows.length === 0) {
    return NextResponse.json({ error: "planId/rows ไม่ถูกต้อง" }, { status: 400 });
  }
  if (b.rows.some((r) => !r.tripDayId || !UUID.test(r.tripDayId))) {
    // 🔴 วันที่ยังไม่มีในฐาน (สะพานคืน `null`) จะมาถึงตรงนี้เป็น `undefined`
    //    ปล่อยผ่าน = เขียนแถวที่ไม่มีวัน แล้ว FK จะฟ้องด้วยข้อความที่อ่านไม่ออก
    return NextResponse.json({ error: "มีวันที่ยังไม่มีในฐาน — E7 อาจยังไม่ได้ย้ายข้อมูล" }, { status: 400 });
  }

  const rows = b.rows.map((r) => {
    // ชนิดจากสคีมา ไม่ใช่ `Record<string, unknown>` — พิมพ์ชื่อคอลัมน์ผิดจะแดงตอนคอมไพล์
    const row: InsertRow<"trip_day_plan_settings"> = {
      trip_id: tripId,
      plan_id: String(b.planId),
      trip_day_id: String(r.tripDayId),
    };
    if (typeof r.startTime === "string") row.start_time = r.startTime;
    if (r.returnTravelMode !== undefined) row.return_travel_mode = r.returnTravelMode;
    if (typeof r.isLocked === "boolean") row.is_locked = r.isLocked;
    return row;
  });

  const db = await createServerSupabase();
  const { data, error } = await upsertDaySettings(db, rows);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้แผนนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
