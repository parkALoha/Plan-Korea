import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import {
  deleteTripDaysByIds,
  insertTripDays,
  stopCountInDays,
  tripDayDatesOf,
  updateTripDates,
} from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * แก้ทริประดับตัวมันเอง — `PATCH /api/engine/trips/[tripId]`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมเพิ่งมี
 * ช่วงวันถูกกำหนดครั้งเดียวตอนสร้างผ่าน `create_trip` แล้ว **ไม่มีเส้นทางไหนแก้ได้เลย**
 * (`revoke insert, update on public.trips from authenticated` ที่ `20260826…:75`
 * แล้ว grant กลับมาแค่ `cover_image_url`) ⇒ พิมพ์วันผิด = ต้องสร้างทริปใหม่ทั้งใบ
 * และทริปเก่าก็ลบไม่ได้ **จึงค้างอยู่ในรายการตลอดไป**
 * · สิทธิ์ที่ route นี้ต้องใช้มาจาก `20260904120000_e5_trip_dates_editable.sql`
 *
 * ## 📌 ยังไม่มี `DELETE` ที่นี่ และนั่นเป็นการตัดสินใจ ไม่ใช่การลืม
 * `20260824043822:273-274` เขียนไว้ว่าลบทริปต้องเป็น **soft delete** ไม่ใช่ `DELETE` ตรงจากไคลเอนต์
 * ⇒ ต้องมี `deleted_at` + RPC + แก้ `trips_select` ซึ่งแตะ policy ที่ตารางลูกทุกใบพึ่งอยู่
 * **เป็นใบแยกที่ต้องตัดสินใจของตัวเอง** · migration ข้างต้นมี assert ที่จะแดงถ้ามีคนเผลอเปิด `delete`
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** เพดานเดียวกับ `create_trip` (`20260827080000:65`) — ตัวเลขต่างกันจะสร้างทริปที่แก้ตัวเองไม่ได้ */
const MAX_DAYS = 366;

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-trip", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

/**
 * ทุกวันในช่วง (รวมปลายทั้งสอง) เป็น `YYYY-MM-DD`
 *
 * 🔴 **เดินด้วย `Date.UTC` ไม่ใช่ `new Date(iso)` แล้ว `setDate`**
 * `new Date("2026-10-11")` ตีความเป็นเที่ยงคืน **UTC** แต่ `setDate`/`getDate` ทำงานตามโซนของเครื่อง
 * ⇒ เครื่องที่อยู่ฝั่งลบของ UTC จะได้วันแรกเป็น `2026-10-10` **ทั้งชุดเลื่อนหนึ่งวันเงียบ ๆ**
 * · เซิร์ฟเวอร์ของเราตั้ง UTC จึงไม่เคยเห็นอาการ — **นั่นคือเหตุผลที่ต้องเขียนกันไว้ ไม่ใช่เหตุผลที่ไม่ต้อง**
 */
function datesInRange(startISO: string, endISO: string): string[] {
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endISO.split("-").map(Number);
  const out: string[] = [];
  for (
    let t = Date.UTC(sy, sm - 1, sd);
    t <= Date.UTC(ey, em - 1, ed);
    t += 24 * 60 * 60 * 1000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

type DayRow = { id: string; date: string };

/**
 * body: `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", force?: boolean }`
 *
 * ## ลำดับการเขียน — **สองเกณฑ์ ไม่ใช่หนึ่ง** (เกณฑ์ที่สองมาจาก P4 · 4 ก.ย. 2026)
 * ```
 * ① อัปเดตช่วงวันของทริป  ล้ม ⇒ **ยังไม่มีอะไรถูกแตะเลย**
 * ② เพิ่มวันที่ขาด        ล้ม ⇒ ช่วงใหม่ + วันเก่า · กดใหม่ก็ตรง
 * ③ ถอนวันส่วนเกิน        ล้ม ⇒ มีวันนอกช่วง · กดใหม่ก็หาย
 * ```
 * 🎯 ***เกณฑ์ ① ของที่ย้อนไม่ได้ (ลบวัน) ไปทีหลังเสมอ*** — ถ้อยคำของ P5 · 4 ก.ย. 2026
 * 🎯 ***เกณฑ์ ② ก้าวที่ตรวจสิทธิ์ที่เข้มที่สุดได้ ต้องไปก่อน***
 *
 * 🔴 **ฉบับแรกมีแค่เกณฑ์ ① แล้วพังในทิศที่มันมองไม่เห็น** — `trips_update` จำกัด `owner`
 * ส่วน `trip_days_insert` รับ `can_write_trip` ⇒ **editor เพิ่มวันสำเร็จ แล้วโดน 403 ที่ก้าวถัดไป
 * ⇒ ได้คำตอบว่า "ไม่มีสิทธิ์" ทั้งที่วันนอกช่วงถูกเขียนลงฐานไปแล้ว** (เหตุผลเต็มอยู่ที่ก้าว ① ในตัวโค้ด)
 * · ⚠️ **เกณฑ์ ① วิเคราะห์ "ก้าวนี้ล้ม" ทุกก้าว แต่ไม่ได้วิเคราะห์ "ก้าวนี้สำเร็จ แล้วก้าวถัดไป
 *   ปฏิเสธด้วยสิทธิ์คนละระดับ"** — และรูปนั้นเกิดได้เฉพาะกับคำขอที่คร่อมสองระดับสิทธิ์ ซึ่งใบนี้เป็นใบแรก
 * · ทุกทิศที่ล้มเหลือสภาพที่ **ผู้ใช้เห็นและกดซ้ำแล้วหาย** ไม่มีทิศไหนเหลือทริปที่ใช้ไม่ได้
 *
 * ## 🔴 `409` เมื่อวันที่จะหายมีจุดแวะอยู่ — และทำไมไม่ทำเงียบ ๆ
 * ย่อทริปจาก 7 วันเหลือ 5 = จุดแวะของสองวันนั้นหายไปด้วย (`trip_stops.day_id` cascade)
 * ฐาน **ไม่กันให้และไม่ควรกัน** เพราะบางครั้งผู้ใช้ตั้งใจจริง ⇒ ด่านอยู่ที่นี่
 * · ตอบ `409` พร้อม **จำนวนจุดแวะที่จะหาย** แล้วเดินต่อได้เมื่อส่ง `force: true` มา
 * · ⚠️ นับ **ทุกแผน** ไม่ใช่แค่แผนที่ active — ของในแผน B ก็หายเหมือนกัน และผู้ใช้มองไม่เห็นมันตอนกด
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let body: { startDate?: unknown; endDate?: unknown; force?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body ต้องเป็นอ็อบเจกต์" }, { status: 400 });
  }

  const { startDate, endDate } = body;
  if (typeof startDate !== "string" || !ISO_DATE.test(startDate)) {
    return NextResponse.json({ error: "startDate ต้องเป็น YYYY-MM-DD" }, { status: 400 });
  }
  if (typeof endDate !== "string" || !ISO_DATE.test(endDate)) {
    return NextResponse.json({ error: "endDate ต้องเป็น YYYY-MM-DD" }, { status: 400 });
  }
  // 🔴 ตรวจที่นี่ ไม่ปล่อยไปชน `trips_dates_ordered` — ข้อความของ Postgres ผู้ใช้อ่านไม่รู้เรื่อง
  if (endDate < startDate) {
    return NextResponse.json({ error: "วันสิ้นสุดมาก่อนวันเริ่มไม่ได้" }, { status: 400 });
  }
  const wanted = datesInRange(startDate, endDate);
  if (wanted.length > MAX_DAYS) {
    return NextResponse.json(
      { error: `ช่วงวันที่ยาวเกินไป (${wanted.length} วัน) — สูงสุด ${MAX_DAYS} วัน` },
      { status: 400 },
    );
  }

  const db = await createServerSupabase();

  const { data: rawDays, error: readErr } = await tripDayDatesOf(db, tripId);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 502 });
  const current = (rawDays ?? []) as unknown as DayRow[];

  const have = new Set(current.map((d) => d.date));
  const keep = new Set(wanted);
  const toAdd = wanted.filter((d) => !have.has(d));
  const toRemove = current.filter((d) => !keep.has(d.date));

  // ── ไม่มีอะไรเปลี่ยนเลย: ตอบสำเร็จโดยไม่แตะฐาน
  //    🔴 **ไม่ใช่ 400** — ผู้ใช้กดบันทึกโดยไม่แก้อะไรเป็นเรื่องปกติ ไม่ใช่ความผิด
  if (toAdd.length === 0 && toRemove.length === 0) {
    const { data: same, error: sameErr } = await updateTripDates(db, tripId, startDate, endDate);
    if (sameErr) {
      const status = sameErr.code === "42501" ? 403 : 502;
      return NextResponse.json({ error: sameErr.message, code: sameErr.code }, { status });
    }
    if (!same || same.length === 0) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ทริปนี้", code: "42501" }, { status: 403 });
    }
    return NextResponse.json(
      { ok: true, added: 0, removed: 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // ── ด่านข้อมูลหาย — ถามก่อน ไม่ใช่บอกทีหลัง
  if (toRemove.length > 0 && body.force !== true) {
    const { data: stops, error: stopErr } = await stopCountInDays(
      db,
      toRemove.map((d) => d.id),
    );
    if (stopErr) return NextResponse.json({ error: stopErr.message }, { status: 502 });
    const losing = (stops ?? []).length;
    if (losing > 0) {
      return NextResponse.json(
        {
          error: `ย่อช่วงวันแล้วจะเสียจุดแวะ ${losing} จุด ใน ${toRemove.length} วันที่ถูกถอน`,
          code: "STOPS_WOULD_BE_LOST",
          losingStops: losing,
          losingDates: toRemove.map((d) => d.date),
        },
        { status: 409 },
      );
    }
  }

  /**
   * ── ① ช่วงวันของตัวทริป — **ต้องมาก่อน และเหตุผลไม่ใช่ "ย้อนได้"** (P4 จับ · 4 ก.ย. 2026)
   *
   * ฉบับแรกวางลำดับเป็น `insertTripDays → updateTripDates → delete` โดยให้เหตุผลว่า
   * *"ของที่ย้อนไม่ได้ไปทีหลัง"* — **ถูก แต่ไม่พอ และมันพังในทิศที่ผมไม่ได้วิเคราะห์เลย:**
   * ```
   * trip_days_insert = can_write_trip   ← **editor ผ่าน**
   * trips_update     = owner            ← **editor ไม่ผ่าน**
   *
   * editor ยิง PATCH ขยายช่วงวัน
   *   ① insertTripDays   สำเร็จ  ← เขียนวันใหม่ลงฐานจริง
   *   ② updateTripDates  0 แถว → 403
   * ⇒ ผู้ใช้ได้ "คุณไม่มีสิทธิ์" · **แต่ทริปมีวันอยู่นอกช่วง `start_date`–`end_date` ค้างถาวร**
   * ```
   * 🎯 ***คำตอบบอกว่า "ไม่มีสิทธิ์" ขณะที่การกระทำเกิดไปแล้วบางส่วน — และวันนอกช่วงคือ
   *    สภาพที่ route ใบนี้เกิดมาเพื่อกำจัด***
   *
   * 🔴 **บล็อก *"ล้มกลางทางแล้วเหลืออะไร"* ของผมวิเคราะห์ครบทุกก้าวที่ *ล้ม* —
   *    แต่ไม่ได้วิเคราะห์ *"ก้าวนี้สำเร็จ แล้วก้าวถัดไปปฏิเสธด้วยสิทธิ์คนละระดับ"***
   *    รูปนี้เกิดได้เพราะ `PATCH` เป็นใบแรกที่ **คร่อมสองระดับสิทธิ์ในคำขอเดียว**
   *    (ตารางลูก `can_write_trip` + ตัวทริป `owner`) — ไม่มีใบไหนก่อนหน้าเป็นแบบนี้
   *
   * ✅ **ย้ายขึ้นก่อน แล้วหลักการเดิมยังจริงทั้งคู่:** มันเป็นก้าวเดียวที่ *ตรวจสิทธิ์ owner ได้*
   *    และมัน *ย้อนได้* (ต่างจาก `delete`) ⇒ ***สิ่งที่ตรวจสิทธิ์ได้ ไปก่อน · สิ่งที่ย้อนไม่ได้ ไปหลัง***
   * · ⚠️ ล้มตรงนี้ = **ยังไม่มีอะไรถูกแตะเลย** ซึ่งดีกว่าทุกลำดับที่เป็นไปได้
   */
  const { data: updated, error: upErr } = await updateTripDates(db, tripId, startDate, endDate);
  if (upErr) {
    const status = upErr.code === "42501" ? 403 : 502;
    return NextResponse.json({ error: upErr.message, code: upErr.code }, { status });
  }
  // 🔴 0 แถว = RLS กรองออก (ไม่ใช่ owner) **ไม่ใช่สำเร็จ**
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์แก้ช่วงวันของทริปนี้ (เจ้าของเท่านั้น)", code: "42501" },
      { status: 403 },
    );
  }

  // ── ② เพิ่มวันที่ขาด (เติมของ · ล้มแล้วเหลือช่วงวันใหม่กับวันเก่า ซึ่งกดซ้ำแล้วตรง)
  if (toAdd.length > 0) {
    const { error } = await insertTripDays(db, tripId, toAdd);
    if (error) {
      const status = error.code === "42501" ? 403 : 502;
      return NextResponse.json(
        { error: error.message, code: error.code, partial: true },
        { status },
      );
    }
  }

  // ── ③ ถอนวันส่วนเกิน (ย้อนไม่ได้ → ท้ายสุดเสมอ)
  if (toRemove.length > 0) {
    const { error } = await deleteTripDaysByIds(db, tripId, toRemove.map((d) => d.id));
    if (error) {
      return NextResponse.json(
        {
          error: "แก้ช่วงวันแล้ว แต่ถอนวันส่วนเกินไม่สำเร็จ — กดบันทึกอีกครั้งเพื่อให้ครบ",
          code: error.code,
          partial: true,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { ok: true, added: toAdd.length, removed: toRemove.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
