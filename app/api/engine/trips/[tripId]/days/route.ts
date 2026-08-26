import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { cityIdBySlug, setOvernightIntent, tripDaysOfTrip } from "@/lib/engine/db";
import type { DayOvernightRow } from "@/lib/engine/overnightShape";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * วันของทริป + *ความตั้งใจ* เรื่องที่นอน — `E3` · `D80`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · แม่แบบเดียวกับ `custom-places`
 *
 * 🔴 **route นี้ไม่รู้จัก `"d0"` เลยสักบรรทัด** — มันพูด `uuid`/`date` เท่านั้น
 * สะพานไปสู่ id ของไฟล์เดิมอยู่ฝั่งไคลเอนต์ ([`dayBridge.ts`](../../../../../../lib/engine/dayBridge.ts))
 * 🎯 **วันที่ `E5-AC1` มาถึงและ UI เลิกใช้ `"d0"` — สะพานหายไปเฉย ๆ ไม่ต้องแตะไฟล์นี้**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-days", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const db = await createServerSupabase();
  const { data, error } = await tripDaysOfTrip(db, tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json((data ?? []) as unknown as DayOvernightRow[], {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * ตั้งความตั้งใจเรื่องที่นอนของวันหนึ่ง
 *
 * body: `{ dayId: uuid, city: slug }` · `{ dayId, kind: "none" }` · `{ dayId, kind: "undecided" }`
 * 🔴 **สามสถานะแยกกันจริง (`D80`)** — `undecided` ไม่ใช่ `none` · ห้ามยุบ
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let body: { dayId?: string; city?: string; kind?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!body.dayId || !UUID.test(body.dayId)) {
    return NextResponse.json({ error: "dayId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();

  let intent: Parameters<typeof setOvernightIntent>[2];
  if (body.city) {
    const { data: city, error } = await cityIdBySlug(db, body.city);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    // 🔴 slug ที่ไม่รู้จักต้องได้ข้อความของตัวเอง — ปล่อยให้ไปชน `not null` จะได้
    //    "null value violates not-null constraint" ซึ่งไม่มีใครเดาออกว่าแปลว่าอะไร
    if (!city) return NextResponse.json({ error: `ไม่รู้จักเมือง ${body.city}` }, { status: 400 });
    intent = { kind: "city", cityId: city.id as string };
  } else if (body.kind === "none") {
    intent = { kind: "none" };
  } else if (body.kind === "undecided") {
    intent = { kind: "undecided" };
  } else {
    return NextResponse.json({ error: "ต้องระบุ city หรือ kind" }, { status: 400 });
  }

  const { data, error } = await setOvernightIntent(db, body.dayId, intent);
  if (error) {
    const status = error.code === "42501" ? 403 : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  // 🔴 0 แถว = RLS กรองออก **ไม่ใช่สำเร็จ** — เคสที่ P2 รายงานไว้ตอน `writeGuard` ได้ `data`
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้วันนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
