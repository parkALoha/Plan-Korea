import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { getTripTemplate } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * รายละเอียดทริปแนะนำใบหนึ่ง — `GET /api/engine/trip-templates/[templateId]`
 * เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้ตัดสิน flow เอง
 *
 * > *"เมื่อกดจะบอกรายละเอียดของทริปทั้งหมด **แต่ละวันไปไหนบ้าง** และมีปุ่มให้กดสร้างทริป"*
 *
 * ## 🔴 เปิดให้คนยังไม่ล็อกอิน — และมันคือ **สองเส้นในโฟลเดอร์เดียวกันที่มีด่านคนละแบบ**
 * ```
 * GET  /trip-templates/<id>        ← ไฟล์นี้ · **เปิด** (ดูแผนก่อนตัดสินใจสมัคร)
 * POST /trip-templates/<id>/copy   ← **ปิด** ต้องล็อกอิน (เขียนลงบัญชีจริง)
 * ```
 * 🎯 ***"ดูว่ามีอะไร" กับ "เอาไปใช้" เป็นคนละคำถาม*** — รูปเดียวกับ `invites/peek` vs `invites/redeem`
 * ⚠️ ⇒ เส้นนี้ต้องอยู่ใน `PUBLIC_EXACT_PATHS` **ไม่ได้** เพราะมันมี id แปรผันใน path
 *    · `PUBLIC_SUBTREE_PATHS` ก็ใส่ไม่ได้ เพราะจะลาก `/copy` เปิดตามไปด้วย (ช่องที่เพิ่งปิดไป)
 *    · 🔴 **ทางที่ใช้: ตรวจเทียบรูปแบบตรง ๆ ใน `proxy()`** เหมือนที่ `/` และ `/explore` ทำ
 *      — เหตุผลเดียวกันเป๊ะ: *ไม่เพิ่มสมาชิกในลิสต์ถ้าไม่จำเป็น* และ **greppable กว่า**
 *
 * ## รูปที่คืน — ซ้อนที่นี่ ไม่ได้ซ้อนในฐาน
 * RPC คืนแบน (หนึ่งแถวต่อหนึ่งจุดแวะ) เพื่อให้ `schemaPins` มองเห็นทุกคอลัมน์ที่ไหลออกไปหา `anon`
 * ⇒ **การซ้อนเป็นงานของชั้นนี้** · ⚠️ วันที่ไม่มีจุดแวะจะมาเป็นแถวที่ `place_*` เป็น null
 *    **ต้องคงวันนั้นไว้** ไม่งั้นจำนวนวันบนหน้าพรีวิวไม่ตรงกับ `dayCount` ที่การ์ดบอก
 */
const RATE_LIMIT_PER_MINUTE = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TemplateStop = {
  nameTh: string | null;
  nameEn: string | null;
  slug: string | null;
  category: string | null;
  dwellMinutes: number | null;
};

type TemplateDay = {
  dayNumber: number;
  citySlug: string | null;
  cityNameTh: string | null;
  countryId: string | null;
  overnightCityNameTh: string | null;
  stops: TemplateStop[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;

  const limited = rateLimitGuard(req, "engine-trip-template-detail", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  if (!UUID.test(templateId)) {
    return NextResponse.json({ error: "templateId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await getTripTemplate(db, templateId);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
  }

  const rows = data ?? [];
  /**
   * 🔴 **0 แถว = ไม่พบ ไม่ใช่ "ทริปว่าง"** — RPC กรอง `published_template_at is not null`
   *    ⇒ id ที่ไม่ใช่ template (รวมทริปส่วนตัวของคนอื่น) ตกมาที่นี่เป็นเซตว่างเหมือนกันหมด
   * 🎯 ***ตอบ `404` เหมือนกันทุกกรณี — ไม่บอกว่า "มีอยู่แต่ไม่ได้เผยแพร่"*** (รูปเดียวกับ `P0002` ของ RPC อื่น)
   */
  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบทริปแนะนำนี้", code: "NOT_FOUND" }, { status: 404 });
  }

  const head = rows[0];
  const days: TemplateDay[] = [];
  for (const r of rows) {
    let day = days[days.length - 1];
    if (!day || day.dayNumber !== r.day_number) {
      day = {
        dayNumber: r.day_number,
        citySlug: r.day_city_slug ?? null,
        cityNameTh: r.day_city_name_th ?? null,
        countryId: r.day_country_id ?? null,
        overnightCityNameTh: r.overnight_city_name_th ?? null,
        stops: [],
      };
      days.push(day);
    }
    // ⚠️ วันว่างมาเป็นแถวที่ `place_slug` เป็น null — สร้างวันแล้ว **ไม่ push จุดแวะ**
    if (r.place_slug) {
      day.stops.push({
        nameTh: r.place_name_th ?? null,
        nameEn: r.place_name_en ?? null,
        slug: r.place_slug,
        category: r.place_category ?? null,
        dwellMinutes: r.dwell_minutes ?? null,
      });
    }
  }

  return NextResponse.json(
    {
      template: {
        id: templateId,
        title: head.title,
        dayCount: head.day_count,
        nightCount: head.night_count,
        days,
      },
    },
    // ผลเหมือนกันทุกคน **และเปิดให้คนยังไม่ล็อกอิน** ⇒ `public` ได้ · อายุสั้นเพราะทีมยังแก้แผนอยู่
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
