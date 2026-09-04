import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { tripsForUser } from "@/lib/engine/trip";
import { createTrip, insertTripDestinations } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";
import { MAX_TRIP_DAYS, MAX_TRIP_DESTINATIONS } from "@/lib/engine/tripLimits";

/**
 * ทริปที่ผู้ใช้เห็นได้ — **route แบบ account-scoped** (P3 · `§14` ข้อ ①)
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **ไม่ซ้อนใต้ `trips/[tripId]`** เพราะมันคือคำถาม *"มีทริปอะไรบ้าง"* — ยังไม่รู้ id ตอนถาม
 * · ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * · **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — `trips_select` เป็นคนกรอง (`D38`/`P-15`)
 *
 * 📌 **คืน *รายการ* ไม่ใช่ *ทริปที่เลือกแล้ว*** — การเลือกเป็นกฎที่ `chooseSoleTrip()` ถือไว้
 * และฝั่ง client ใช้กฎตัวเดียวกันนั้น · **ถ้า route เลือกให้ ฝั่ง client จะไม่มีทางรู้ว่ามีหลายทริป**
 */
const RATE_LIMIT_PER_MINUTE = 120;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-trips", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  try {
    const db = await createServerSupabase();
    return NextResponse.json(await tripsForUser(db), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายการทริปไม่ได้" },
      { status: 502 }
    );
  }
}

/** ISO `YYYY-MM-DD` เท่านั้น — ไม่รับรูปอื่น เพราะคอลัมน์เป็น `date` และเราไม่อยากให้ Postgres เดาแทน */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** รูป uuid ของ Postgres — ใช้ปฏิเสธค่าที่เป็นไปไม่ได้ก่อนถึงฐาน */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * สร้างทริปใหม่ — `POST /api/engine/trips`
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ## 🔴 ทำไมเพิ่งมี
 * `create_trip` อยู่ในฐานมาตั้งแต่ 25 ส.ค. **แต่ไม่มีอะไรในแอปเรียกมันเลย**
 * → **บัญชีใหม่ค้างที่ "ยังไม่มีทริป" ตลอดกาล · ไม่มีใคร live-verify อะไรได้ทั้งวัน**
 * · P2 รายงานว่าเปิดหน้าจริงไม่ได้ **4 รอบติด** ด้วยเหตุผลเดียวกัน — และไม่มีใครถามว่าทำไม
 *
 * ## ตรวจ **ก่อน** เรียก RPC เสมอ
 * 🎯 บทเรียนตรงจาก `place-nearby` วันนี้: **ด่านที่ผ่านได้ ทำให้เกิดคำขอที่ไม่ควรมี**
 * · ที่นี่ราคาไม่ใช่โควตา Google แต่เป็น **ข้อความ error ของ Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง**
 *   (`trips_dates_ordered` · `length(trim(title)) between 1 and 120`) → ตอบเป็นภาษาคนตั้งแต่ที่นี่
 *
 * ## ⚠️ ไม่ตรวจ "โหมดอ่านอย่างเดียว" ในนี้ **โดยตั้งใจ**
 * trigger `zz_read_only_guard` บน `public.trips` เป็นคนกัน · **เขียนซ้ำที่นี่ = แหล่งความจริงที่สอง**
 * ที่ต้องคอยให้ตรงกับฐานตลอดไป · ผู้ใช้จะได้ `PT503` ซึ่ง PostgREST แปลงเป็น `503` ให้เอง
 */
export async function POST(req: NextRequest) {
  // 🔴 จำกัดแน่นกว่า `GET` มาก — อ่านรายการเป็นเรื่องปกติ · **สร้างทริปไม่ใช่**
  const limited = rateLimitGuard(req, "engine-trips-create", 10);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "body ไม่ใช่ JSON" }, { status: 400 });
  }

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 1 || title.length > 120) {
    return NextResponse.json({ error: "ชื่อทริปต้องมี 1–120 ตัวอักษร" }, { status: 400 });
  }

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  const endDate = typeof b.endDate === "string" ? b.endDate : "";
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    return NextResponse.json({ error: "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD" }, { status: 400 });
  }
  // ⚠️ เทียบเป็น **สตริง** ไม่ใช่ `new Date()` — `YYYY-MM-DD` เรียงตามพจนานุกรมตรงกับเรียงตามเวลาพอดี
  //    และ `new Date("2026-10-11")` ตีความเป็น **UTC เที่ยงคืน** ซึ่งพาเขตเวลาเข้ามาโดยไม่จำเป็น
  if (endDate < startDate) {
    return NextResponse.json({ error: "วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม" }, { status: 400 });
  }
  /**
   * 🔴 **เพดานช่วงวันที่ — `create_trip` สร้าง `trip_days` หนึ่งแถวต่อวัน**
   * พิมพ์ปีผิด (`2036` แทน `2026`) = **3,653 แถวในทรานแซกชันเดียว โดยผู้ใช้ไม่ได้ตั้งใจ**
   * · `trips_dates_ordered` บังคับแค่ `end >= start` **ไม่มีเพดาน**
   * 🔴 **แก้ 4 ก.ย. 2026 — เพดานที่นี่เป็น `MAX_TRIP_DAYS` (30) ไม่ใช่ 366 อีกแล้ว**
   *    ผู้ใช้ตัดสินเอง (*"สูงสุด 30 วันพอ"*) · **และมันเป็นเพดานคนละชนิดกับ 366 ในฐาน**
   *    ```
   *    30   ที่นี่   "ทริปยาวสุดที่เราออกแบบให้รองรับ"       ← เพดานของสินค้า
   *    366  ในฐาน   "กันคนพิมพ์ปีผิดแล้วสร้าง 3,653 แถวรวด"  ← เพดานกันอุบัติเหตุ
   *    ```
   * 🎯 ***สองเลขนี้ตอบคนละคำถาม ⇒ ตั้งใจให้ต่างกัน*** — ต่างจากเคส `MAX_TRIP_DESTINATIONS`
   *    ที่สองเลขตอบคำถามเดียวกันแล้วไม่ตรงกัน (ซึ่งเป็นบั๊ก) · เหตุผลเต็มอยู่ที่ `tripLimits.ts`
   *   (เขียนไว้เพราะถ้าไม่เขียน คนถัดไปจะอ่านว่าลบอันไหนก็ได้ หรือ "แก้ให้ตรงกัน" ซึ่งผิดทั้งคู่)
   */
  const DAY_MS = 86_400_000;
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
  if (days > MAX_TRIP_DAYS) {
    return NextResponse.json(
      { error: `ทริปยาวได้สูงสุด ${MAX_TRIP_DAYS} วัน (ส่งมา ${days} วัน)` },
      { status: 400 },
    );
  }

  const baseTimezone = typeof b.baseTimezone === "string" && b.baseTimezone.trim() !== ""
    ? b.baseTimezone.trim()
    : null;

  /**
   * เมืองปลายทาง — **ไม่บังคับ** · ทริปที่ยังไม่รู้ว่าจะไปไหนเป็นสภาพที่ถูกต้อง
   *
   * 🔴 ตรวจ **รูป** ที่นี่ ไม่ใช่ตรวจ **สิทธิ์** — `city_id` ที่ไม่มีจริงจะโดน FK ปฏิเสธที่ฐาน
   *    และสิทธิ์เขียนเป็นเรื่องของ `trip_destinations_insert` (`can_write_trip`)
   *    ที่นี่กันแค่ค่าที่ **เป็นไปไม่ได้ตั้งแต่ต้น** ไม่ให้เดินทางไปให้ Postgres ตอบด้วยข้อความที่แปลยาก
   * ⚠️ **ตัดตัวซ้ำออก แต่รักษาลำดับแรกที่พบ** — ลำดับใน array คือ `rank` ที่ผู้ใช้จัดเอง
   *    ถ้าเรียงใหม่หรือเรียงตามตัวอักษร เราจะเปลี่ยนสิ่งที่ผู้ใช้ตั้งใจโดยไม่บอก
   */
  const cityIds: string[] = [];
  if (b.cityIds !== undefined && b.cityIds !== null) {
    if (!Array.isArray(b.cityIds)) {
      return NextResponse.json({ error: "cityIds ต้องเป็น array" }, { status: 400 });
    }
    const seen = new Set<string>();
    for (const raw of b.cityIds) {
      if (typeof raw !== "string" || !UUID.test(raw)) {
        return NextResponse.json({ error: "cityIds ต้องเป็น uuid ของเมืองในคลัง" }, { status: 400 });
      }
      if (!seen.has(raw)) { seen.add(raw); cityIds.push(raw); }
    }
    // เพดานกันคำขอเดียวยัดทั้งคลัง · ทริปข้ามเมืองจริงยังไม่เคยเกิน 6 เมือง
    // 🔴 ค่ามาจาก `lib/engine/tripLimits.ts` ตัวเดียว — เดิมเป็น `20` ที่เขียนตรงนี้ แล้ว
    //    `PUT /destinations` ตั้ง `30` ของตัวเอง ⇒ ทริปที่สร้างไม่ได้ กลับแก้ให้เป็นได้ (P4 พบ)
    if (cityIds.length > MAX_TRIP_DESTINATIONS) {
      return NextResponse.json(
        { error: `เลือกเมืองปลายทางได้สูงสุด ${MAX_TRIP_DESTINATIONS} เมือง (ส่งมา ${cityIds.length})` },
        { status: 400 },
      );
    }
  }

  try {
    const db = await createServerSupabase();
    const { data, error } = await createTrip(db, { title, startDate, endDate, baseTimezone });
    if (error) {
      // 🔴 แยก "ด่านทำงาน" ออกจาก "บั๊กเรา" แบบเดียวกับที่ `verdictFor()` ของ P4 ทำ
      // `22023` = ฟังก์ชันในฐานปฏิเสธค่าที่ส่งไป (เพดานช่วงวันที่) → เป็นคำขอที่ผิด ไม่ใช่บั๊กเรา
      const status =
        error.code === "42501" ? 403 :
        error.code === "PT503" ? 503 :
        error.code === "22023" ? 400 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    /**
     * 🔴 **จุดหมายเขียน *หลัง* ทริปเกิด และไม่ได้อยู่ในธุรกรรมเดียวกัน — จงใจ และต้องรายงานให้ตรง**
     *
     * ถ้าเขียนจุดหมายล้ม **ทริปยังอยู่และใช้งานได้ปกติ** (จุดหมายเป็นข้อมูลเสริม ไม่ใช่แกน)
     * → คืน `201` เพราะสิ่งที่ผู้ใช้ขอ (ทริป) เกิดขึ้นจริงแล้ว
     * 🎯 **แต่ห้ามคืน `201` เปล่า ๆ เหมือนไม่มีอะไรเกิดขึ้น** — ผู้ใช้เลือกเมืองไว้แล้วมันหาย
     *    และเขาจะไม่มีทางรู้จนกว่าจะเปิดการ์ดมาดูแล้วสงสัยเอง
     *    → แนบ `destinationsError` ไปด้วย ให้ฝั่ง UI บอกได้ว่า *"ทริปสร้างแล้ว แต่บันทึกจุดหมายไม่สำเร็จ"*
     * ⚠️ **นี่คือเหตุผลที่ผมไม่ยอมให้มันเงียบ** — ความล้มเหลวที่เงียบในเส้นทางเขียน คืออาการเดียวกับ
     *    "บันทึกแล้วไม่เปลี่ยน" ที่ column grant ที่หายไปทำให้เกิด และมันหาสาเหตุยากมาก
     */
    const trip = data as { id?: string } | null;
    let destinationsError: string | null = null;
    if (cityIds.length > 0 && trip?.id) {
      const { error: destErr } = await insertTripDestinations(db, trip.id, cityIds);
      if (destErr) destinationsError = destErr.message;
    }
    return NextResponse.json(
      destinationsError ? { ...(data as object), destinationsError } : data,
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "สร้างทริปไม่ได้" },
      { status: 502 },
    );
  }
}
