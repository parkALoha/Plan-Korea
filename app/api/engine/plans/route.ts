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
 * 🔴 **route นี้เคยเป็น account-scoped ล้วน** — P3 (`§14` ①) จัดไว้แบบนั้นเพราะตอนนั้น `usePlans` ยังไม่รู้
 * `tripId` ของตัวเอง (เรียกก่อน `E5-AC1` มี `/trip/[tripId]`) `soleTrip()` จึงเดาแทน — **แล้วพอผู้ใช้มีทริปที่
 * สอง `soleTrip()` คืน `ambiguous` (409) ทุกครั้งที่เปิดหน้า** ทั้งที่หน้านั้นรู้อยู่แล้วว่ากำลังดูทริปไหน
 * (ผ่าน `useActiveTripId()`) — สองกลไกตัดสินใจ "ทริปไหน" อยู่ในหน้าเดียวกัน คนละที่ คนละคำตอบ
 *
 * 🔴 **แก้ 27 ส.ค. 2026 (P1 เจอบนเว็บจริง, P3 แก้)** — `E5-AC1` ทำให้ทุกหน้าที่เรียก `usePlans()` มี `tripId`
 * ที่ resolve แล้วอยู่ในมือจริง ๆ (prop ของ `HomeContent`/`TodayPageContent`/`SummaryContent`) ตอนนี้ route
 * รับ `?tripId=` เป็น query param — ถ้ามีและเป็น uuid ที่ถูกต้อง **ใช้ตรง ๆ ข้าม `soleTrip()` ทั้งหมด**
 * ปลอดภัยเท่ากับทุก route ใต้ `trips/[tripId]/` เพราะ `plansOfTrip`/`insertPlan`/ฯลฯ ทุกตัวผ่าน `db` ที่เป็น
 * client ผูก RLS ของผู้ใช้เอง (`createServerSupabase()`) — ทริปที่ผู้ใช้ไม่ได้เป็นสมาชิกจะได้แถวว่าง/ถูกปฏิเสธ
 * เหมือนเดิมไม่ว่า `tripId` จะมาจากไหน ไม่ใช่ช่องโหว่ใหม่
 *
 * `soleTrip()` ยังอยู่เป็น fallback สำหรับผู้เรียกที่ไม่ส่ง `tripId` มา (ไม่ควรมีแล้วหลัง `usePlans(tripId)`
 * แต่ทิ้งไว้กันพังแทนที่จะโยน 400 ใส่ผู้เรียกเก่าที่อาจหลงเหลือ)
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ctx(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-plans", RATE_LIMIT_PER_MINUTE);
  if (limited) return { stop: limited };
  const user = await getUser();
  if (!user) return { stop: unauthenticatedResponse() };
  const db = await createServerSupabase();

  const tripIdParam = req.nextUrl.searchParams.get("tripId");
  if (tripIdParam) {
    if (!UUID.test(tripIdParam)) {
      return { stop: NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 }) };
    }
    return { db, tripId: tripIdParam };
  }

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
