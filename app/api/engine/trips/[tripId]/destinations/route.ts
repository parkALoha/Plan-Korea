import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import {
  catalogCitiesThatExist,
  deleteTripDestinationsExcept,
  insertTripDestinations2,
  setTripDestinationRank,
  tripDestinationsOf,
} from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";
import { MAX_TRIP_DESTINATIONS } from "@/lib/engine/tripLimits";

/**
 * แก้ **จุดหมายของทริป** หลังสร้างไปแล้ว — `PUT /api/engine/trips/[tripId]/destinations`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมเพิ่งมี — และทำไมการไม่มีมันแพงกว่าที่หน้าตามันบอก
 * `trip_destinations` เขียนได้ **ครั้งเดียวในชีวิตทริป** คือตอน `POST /api/engine/trips`
 * (`../../route.ts:169-172`) · ไม่มี `PATCH`/`DELETE` ที่ไหนเลยทั้งรีโป
 *
 * และหน้าแผนตัดสินว่าเป็น "ทริปแพลตฟอร์ม" จาก `cities.length > 0`
 * (`components/TripPlanScreen.tsx:150-151` → `hooks/useTripCatalogCities.ts:105`)
 * ⇒ ทริปที่สร้างโดยไม่เลือกเมือง ได้ `dayPlanSource = "unsupported"` = **การ์ดวันไม่ขึ้นเลย**
 * และ **ไม่มีเส้นทางไหนแก้ได้ · ลบทริปทิ้งก็ยังไม่ได้** (ไม่มี route ระดับ `trips/[tripId]`)
 *
 * 🎯 ***ฟีเจอร์ที่เขียนได้ครั้งเดียว ไม่ได้แปลว่า "แก้ไม่บ่อย" — มันแปลว่าพลาดแล้วจบ***
 * · ใบนี้ปลดล็อกทริปที่ตายไปแล้วด้วย ไม่ใช่แค่กันของใหม่
 *
 * ## 📌 ไม่ต้องแตะฐานเลยสักบรรทัด
 * policy ครบทั้ง 4 verb และ `grant select/insert/update/delete` ให้ `authenticated` มีอยู่แล้ว
 * ตั้งแต่ `20260827180000_e5_trip_destinations.sql:117-151`
 * ⇒ **ความสามารถนี้มีอยู่ในฐานมาตลอด ขาดแค่ทางเข้า** — รูปเดียวกับ `create_trip` ที่ไม่มี UI เรียก
 * (`../../route.ts:44-47`) และ `trip_members` ที่มี policy แต่ไม่มี route เชิญคน
 *
 * ## ⚠️ ไม่ตรวจโหมดอ่านอย่างเดียวที่นี่ โดยตั้งใจ
 * trigger `zz_read_only_guard` เป็นคนกัน — เขียนซ้ำที่นี่ = แหล่งความจริงที่สอง (เหตุผลเดียวกับ `POST /trips`)
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-destinations", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

/**
 * เขียนทับรายการจุดหมายทั้งชุด · body: `{ cityIds: string[] }` (uuid, เรียงตามลำดับที่ผู้ใช้ต้องการ)
 *
 * 🔴 **`PUT` ไม่ใช่ `PATCH`** — จุดหมายถูกแก้เป็น *รายการ* เสมอ (ผู้ใช้จัดลำดับใน picker แล้วกดบันทึก)
 * ไม่ใช่ทีละใบ · `rank` จึงมาจากตำแหน่งใน array ไม่ต้องส่งมา (รูปเดียวกับ `POST /trips`)
 *
 * 🔴 **รายการว่าง = 400 ไม่ใช่ "ลบทั้งหมด"**
 * รายการว่างคือสภาพที่ทำให้ทริปใช้ไม่ได้พอดี — route ที่เกิดมาเพื่อแก้สภาพนั้น
 * ไม่ควรมีปุ่มสร้างมันขึ้นใหม่ · อยากเลิกใช้ทริปให้ลบทริป (ยังไม่มี route — แผนข้อ 2.1)
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let body: { cityIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  // `JSON.parse("null")` สำเร็จ แล้วอ่านพร็อพเพอร์ตี้ต่อจะโยน TypeError → 500 ทั้งที่ควรเป็น 400
  // (P4 เจอกับ `days` เมื่อ 28 ส.ค. 2026 — รูปเดียวกันเป๊ะ)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body ต้องเป็นอ็อบเจกต์" }, { status: 400 });
  }

  const raw = body.cityIds;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "cityIds ต้องเป็น array" }, { status: 400 });
  }
  if (raw.length === 0) {
    return NextResponse.json(
      { error: "ต้องมีเมืองปลายทางอย่างน้อย 1 เมือง — ทริปที่ไม่มีเมืองใช้งานไม่ได้" },
      { status: 400 },
    );
  }
  if (raw.length > MAX_TRIP_DESTINATIONS) {
    return NextResponse.json(
      { error: `เมืองปลายทางเกิน ${MAX_TRIP_DESTINATIONS} เมือง` },
      { status: 400 },
    );
  }
  if (!raw.every((v): v is string => typeof v === "string" && UUID.test(v))) {
    return NextResponse.json({ error: "cityIds ต้องเป็น uuid ทุกตัว" }, { status: 400 });
  }
  // 🔴 ซ้ำ = 400 ไม่ใช่เงียบ ๆ ตัดให้ — `primary key (trip_id, city_id)` จะทำให้ upsert ทับตัวเอง
  //    แล้ว `rank` ที่ได้จะเป็นของใบสุดท้าย **ซึ่งไม่ใช่ลำดับที่ผู้ใช้เห็นบนจอ** และไม่มีอะไรบอกเขา
  const cityIds = raw as string[];
  if (new Set(cityIds).size !== cityIds.length) {
    return NextResponse.json({ error: "cityIds มีเมืองซ้ำ" }, { status: 400 });
  }

  const db = await createServerSupabase();

  // ── ตรวจว่าเมืองมีจริงก่อนแตะอะไร — ปล่อยไปชน FK จะได้ข้อความ Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง
  //    และที่แย่กว่า: ถ้าล้มตอน upsert ผู้ใช้จะไม่รู้ว่าเขียนไปบางส่วนแล้วหรือยัง
  const { data: existing, error: cityErr } = await catalogCitiesThatExist(db, cityIds);
  if (cityErr) return NextResponse.json({ error: cityErr.message }, { status: 502 });
  const known = new Set((existing ?? []).map((c) => (c as { id: string }).id));
  const unknown = cityIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `ไม่รู้จักเมืองในคลัง: ${unknown.join(", ")}`, unknownCityIds: unknown },
      { status: 400 },
    );
  }

  // ── อ่านของเดิมก่อน — สามก้าวข้างล่างต้องรู้ว่าใบไหนใหม่ ใบไหนเดิม
  //    🔴 **จำเป็นเพราะเราเลิกใช้ `upsert`** — เหตุผลเต็มอยู่ที่ `insertTripDestinations2` ใน `db.ts`
  //    ย่อ: `upsert` ของ PostgREST พยายาม `set trip_id` ซึ่ง grant ไม่ให้ (และไม่ควรให้)
  const { data: rawCur, error: curErr } = await tripDestinationsOf(db, tripId);
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 502 });
  const current = (rawCur ?? []) as unknown as { city_id: string; rank: number }[];
  const currentRank = new Map(current.map((r) => [r.city_id, r.rank]));

  const toInsert = cityIds
    .map((cityId, rank) => ({ cityId, rank }))
    .filter((r) => !currentRank.has(r.cityId));
  // เปลี่ยนเฉพาะใบที่ลำดับขยับจริง — ใบที่ลำดับเท่าเดิมไม่ต้องยิง
  const toRerank = cityIds
    .map((cityId, rank) => ({ cityId, rank }))
    .filter((r) => currentRank.has(r.cityId) && currentRank.get(r.cityId) !== r.rank);
  /**
   * เมืองที่ *ควร* ถูกถอน — คำนวณจากของเดิมที่เพิ่งอ่าน **ไม่ใช่จากผลของ `delete`**
   *
   * 🔴 **ตัวนี้คือสิ่งที่ทำให้แยก "ไม่มีอะไรให้ลบ" ออกจาก "RLS กรองทิ้ง" ได้** (P4 จับ · 4 ก.ย. 2026)
   * ทั้งสองกรณี `delete` คืน **0 แถว ไม่มี error เหมือนกันเป๊ะ**
   * ⇒ ถ้าเชื่อผลของ `delete` อย่างเดียว **viewer ที่ส่งคำขอลบจะได้ `200 { ok: true }`**
   *   ฐานไม่ขยับ (ปลอดภัย) **แต่เขาเชื่อว่าบันทึกแล้ว** — คืออาการ *"บันทึกแล้วไม่เปลี่ยน"*
   *   ที่ไล่หายากที่สุด เพราะไม่มีอะไรผิดพลาดให้เห็นสักชั้น
   * 🎯 ***ผมตรวจ `0 แถว = RLS กรอง` ไว้ที่ `insert` และ `update` แล้ว — แต่ไม่ได้ตรวจที่ `delete`
   *    เพราะตอนเขียนผมคิดถึง "ก้าวนี้ล้มไหม" ไม่ได้คิดถึง "ก้าวนี้ถูกกรองจนไม่เหลืออะไรไหม"***
   */
  const toRemove = current.filter((r) => !cityIds.includes(r.city_id));

  // ── ① เติมเมืองใหม่ (ล้มแล้วรายการเดิมอยู่ครบ ไม่มีอะไรหาย)
  if (toInsert.length > 0) {
    const { data: written, error } = await insertTripDestinations2(db, tripId, toInsert);
    if (error) {
      const status = error.code === "42501" ? 403 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    // 🔴 0 แถว = RLS กรองออก **ไม่ใช่สำเร็จ** — ต้องตอบ 403 ไม่ใช่ `ok:true`
    //    (เคสเดียวกับที่ P2 รายงานตอน `writeGuard` ได้ `data` กลับมาว่าง)
    if (!written || written.length === 0) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ทริปนี้", code: "42501" }, { status: 403 });
    }
  }

  // ── ② จัดลำดับใบที่คงอยู่ (ล้มแล้วเมืองครบ ลำดับเพี้ยน · กดใหม่ก็ตรง)
  for (const r of toRerank) {
    const { error } = await setTripDestinationRank(db, tripId, r.cityId, r.rank);
    if (error) {
      const status = error.code === "42501" ? 403 : 502;
      return NextResponse.json(
        { error: error.message, code: error.code, partial: toInsert.length > 0 },
        { status },
      );
    }
  }

  // ── ③ ถอนส่วนเกิน (ย้อนไม่ได้ → ท้ายสุดเสมอ · ล้มแล้วเหลือเมืองเกิน ผู้ใช้เห็นและกดใหม่ก็หาย)
  if (toRemove.length > 0) {
    const { data: removed, error: delErr } = await deleteTripDestinationsExcept(db, tripId, cityIds);
    if (delErr) {
      // 🔴 **ไม่ใช่ 502 เปล่า ๆ** — ก้าว ①② ลงไปแล้ว ผู้ใช้ต้องรู้ว่าสถานะตอนนี้คืออะไร
      //    ถ้าตอบเหมือนล้มทั้งใบ เขาจะเชื่อว่าไม่มีอะไรเปลี่ยน ซึ่งเป็นเท็จ
      return NextResponse.json(
        {
          error: "เพิ่มเมืองใหม่แล้ว แต่ถอนเมืองเก่าไม่สำเร็จ — กดบันทึกอีกครั้งเพื่อให้ครบ",
          code: delErr.code,
          partial: toInsert.length > 0 || toRerank.length > 0,
        },
        { status: 502 },
      );
    }
    // 🔴 **0 แถวทั้งที่รู้ว่ามีของต้องลบ = RLS กรองทิ้ง ไม่ใช่สำเร็จ** — เคสที่ P4 ยิงเจอ
    //    `viewer` ส่งรายการที่ *มีแต่การลบ* → ก้าว ①② ไม่ทำงาน → เหลือแต่ก้าวนี้ → 0 แถว ไม่มี error
    //    ⇒ ฉบับก่อนตอบ `200 { ok: true }` · **ฐานไม่ขยับ แต่ผู้เรียกเชื่อว่าบันทึกแล้ว**
    // ⚠️ เทียบกับ `toRemove` ที่คำนวณไว้ ไม่ใช่กับ `> 0` ลอย ๆ — ไม่งั้น *"ไม่มีอะไรให้ลบ"*
    //    จะถูกอ่านเป็นความล้มเหลว ซึ่งเป็นการแดงใส่คนที่ทำถูก
    if (!removed || removed.length === 0) {
      return NextResponse.json(
        {
          error: "ไม่มีสิทธิ์ถอนเมืองออกจากทริปนี้",
          code: "42501",
          partial: toInsert.length > 0 || toRerank.length > 0,
        },
        { status: 403 },
      );
    }
  }

  return NextResponse.json(
    { ok: true, cityIds },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
