import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { catalogCityCountryMap, listTripTemplates } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ทริปแนะนำ — `GET /api/engine/trip-templates` (`E5`)
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง · สัญญาตกลงกับ P2 ก่อนเขียน
 *
 * > *"2 แบบเขาเที่ยว ตามแพลนที่เราแนะนำ และจัดมาให้เลย ซึ่งเราจัดไว้ให้ x วัน x คืน"*
 *
 * ## 🔴 เส้นนี้ **ไม่ได้อ่าน `trips` เลย** — และนั่นคือทั้งหมดของการออกแบบ
 * `trips_select` = `can_read_trip(id)` ⇒ ไม่มีใครอ่านทริปที่ตัวเองไม่ได้เป็นสมาชิก **รวมใบที่เป็น template**
 * เราจงใจไม่เพิ่ม policy ให้อ่าน ⇒ เนื้อออกได้ทางเดียวคือ definer `list_trip_templates()`
 * 🎯 ***ไม่มีเส้นทางไหนในเว็บที่ *อ่าน* จุดแวะของ template ออกมาเป็นข้อมูลได้เลย***
 *
 * ## ⚠️ ยังไม่ล็อกอิน = `401` — **ตั้งใจ และเป็นข้อจำกัดชั่วคราว**
 * หน้าแรกวันนี้ต้องล็อกอินก่อนถึงจะเห็น ⇒ `grant execute` ให้ `authenticated` เท่านั้น
 * 🔴 วันที่มีหน้า landing สำหรับคนยังไม่ล็อกอิน **ต้องแก้ทั้ง grant ในฐานและบรรทัดนี้พร้อมกัน** —
 *    แก้ที่เดียวจะได้ `401` ที่อ่านเหมือนบั๊ก
 */
const RATE_LIMIT_PER_MINUTE = 60;

/** รูปที่ `list_trip_templates()` ยัดมาใน `cities` (jsonb) — ฐานไม่ได้บอกรูปข้างใน เราจึงต้องตรวจเอง */
type RawCity = { id?: unknown; nameTh?: unknown; slug?: unknown };

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-trip-templates", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const db = await createServerSupabase();
  const { data, error } = await listTripTemplates(db);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
  }

  /**
   * เติม `countryId` ที่ RPC ไม่ได้คืน — เหตุผลเต็มอยู่ที่ `catalogCityCountryMap` ใน `db.ts`
   *
   * 🔴 **ล้มแล้วต้องไม่ทำให้ทั้งเส้นล้ม** — รายชื่อทริปแนะนำคือของจำเป็น · `countryId` เป็นชั้นสำรอง
   *    ของรูปปก ⇒ ไม่มีก็ยังใช้งานได้ · มีอย่างเดียวที่เสียคือรูปปกชั้นที่สอง
   * ⚠️ และ **ไม่ใส่ `countryId: null`** เมื่ออ่านคลังไม่ได้ — ปล่อยให้ฟิลด์หายไปเลย
   *    🎯 ***`null` แปลว่า "เมืองนี้ไม่มีประเทศ" ซึ่งเป็นไปไม่ได้ · ไม่มีฟิลด์ แปลว่า "ไม่รู้" ซึ่งเป็นความจริง***
   */
  const cityMeta = new Map<string, string>();
  const cities = await catalogCityCountryMap(db);
  if (!cities.error && cities.data) {
    for (const c of cities.data) cityMeta.set(c.id, c.country_id);
  }

  const templates = (data ?? []).map((t) => {
    // 🔴 `cities` มาเป็น `Json` — `as` เป็นคำกล่าวอ้าง ไม่ใช่การตรวจ ⇒ ตรวจรูปเองก่อนใช้
    const raw = Array.isArray(t.cities) ? (t.cities as RawCity[]) : [];
    return {
      id: t.id,
      title: t.title,
      dayCount: t.day_count,
      nightCount: t.night_count,
      cities: raw
        .filter((c): c is RawCity & { id: string } => typeof c?.id === "string")
        .map((c) => {
          const countryId = cityMeta.get(c.id);
          return {
            id: c.id,
            nameTh: typeof c.nameTh === "string" ? c.nameTh : "",
            // `slug` เป็น `legacy_slug` ซึ่ง **เป็น null ได้จริง** — ส่ง null ต่อไป ไม่แปลงเป็น ""
            slug: typeof c.slug === "string" ? c.slug : null,
            ...(countryId ? { countryId } : {}),
          };
        }),
    };
  });

  return NextResponse.json(
    { templates },
    // ผลเหมือนกันทุกคน **แต่ต้องล็อกอินถึงจะเรียกได้** ⇒ `private` · อายุสั้นเพราะทีมเพิ่ง/กำลังจะติดธงเพิ่ม
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
