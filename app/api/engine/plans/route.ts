import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import {
  deletePlan, duplicatePlan, insertPlan, plansOfTrip, renamePlan, setActivePlan,
} from "@/lib/engine/db";
import { soleTrip } from "@/lib/engine/trip";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * แผนของทริป — `E3` · `D52`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **route นี้ *ไม่* อยู่ใต้ `trips/[tripId]`** — P3 (`§14` ①) จัดให้เป็น account-scoped
 * เพราะ `usePlans` เป็นตัวที่ *เลือก* ว่าจะทำงานกับทริปไหน · **มันยังไม่รู้ `tripId` ตอนเรียก**
 * · `soleTrip()` จึงถูกใช้ที่นี่ **ที่เดียวในระบบ** — และจะหายไปวันที่ `E5-AC1` มี `/trip/[tripId]`
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ctx(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-plans", RATE_LIMIT_PER_MINUTE);
  if (limited) return { stop: limited };
  const user = await getUser();
  if (!user) return { stop: unauthenticatedResponse() };
  const db = await createServerSupabase();
  const trip = await soleTrip(db);
  if (!trip.ok) {
    const status = trip.reason === "error" ? 502 : trip.reason === "none" ? 404 : 409;
    return { stop: NextResponse.json({ error: trip.reason }, { status }) };
  }
  return { db, tripId: trip.tripId };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if (c.stop) return c.stop;
  const { data, error } = await plansOfTrip(c.db, c.tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "private, no-store" } });
}

/** สร้างแผน — `{ name, duplicateFrom? }` · ก๊อปทั้งใบในทรานแซกชันเดียวถ้าระบุต้นทาง */
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if (c.stop) return c.stop;

  let b: { name?: string; duplicateFrom?: string };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.name?.trim()) return NextResponse.json({ error: "ต้องมีชื่อแผน" }, { status: 400 });

  if (b.duplicateFrom) {
    if (!UUID.test(b.duplicateFrom)) {
      return NextResponse.json({ error: "duplicateFrom ไม่ถูกต้อง" }, { status: 400 });
    }
    const { data, error } = await duplicatePlan(c.db, c.tripId, b.duplicateFrom, b.name.trim());
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
    }
    return NextResponse.json({ id: data }, { status: 201 });
  }

  const { data, error } = await insertPlan(c.db, c.tripId, b.name.trim());
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

/** เปลี่ยนชื่อ หรือ สลับแผนที่ใช้อยู่ — `{ id, name? , makeActive? }` */
export async function PATCH(req: NextRequest) {
  const c = await ctx(req);
  if (c.stop) return c.stop;

  let b: { id?: string; name?: string; makeActive?: boolean };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.id || !UUID.test(b.id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  if (b.makeActive) {
    const { error } = await setActivePlan(c.db, c.tripId, b.id);
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof b.name === "string" && b.name.trim()) {
    const { data, error } = await renamePlan(c.db, b.id, b.name.trim());
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์แก้แผนนี้", code: "42501" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
}

/** ลบแผน — `?id=` · 🔴 trigger `assert_trip_has_plan` กันไม่ให้ลบแผนสุดท้าย */
export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if (c.stop) return c.stop;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const { data, error } = await deletePlan(c.db, id);
  if (error) {
    // ⚠️ trigger ที่กันแผนสุดท้ายจะโยนมาที่นี่ — ส่งข้อความของมันต่อไป **มันอ่านออกอยู่แล้ว**
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 409 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ลบแผนนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
