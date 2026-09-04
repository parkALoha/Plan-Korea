import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { listPublicCities, searchCatalogCities } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ค้นเมืองในคลัง — ตัวป้อนของ autocomplete "เมืองปลายทาง" (`E5`)
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026 · **เปิดโหมดเปิดดูให้คนยังไม่ล็อกอิน 4 ก.ย. 2026 (ผู้ใช้สั่ง)**
 *
 * ## 🔴 เส้นนี้แยกสองทาง และ **รูปคำตอบไม่เหมือนกัน** — อ่านก่อนใช้
 * ```
 * ล็อกอินแล้ว        ค้นด้วย `q` ได้ · ทุกฟิลด์ (`lat`/`lng`/`name_local`/`catalog_countries`)
 * ยังไม่ล็อกอิน       **ต้องส่ง `country`** · ไม่มี `q` · ได้ `id · country_id · legacy_slug · name_th · name_en`
 * ```
 * 🔴 **ผมเคยบอกทีมว่า "รูปคำตอบเหมือนเดิมทุกประการ" — ไม่จริง และนี่คือที่ที่มันไม่จริง**
 * RPC สาธารณะคืนน้อยกว่า `searchCatalogCities` โดยตั้งใจ (ทะเบียนข้อ 9 · ไม่เปิดตารางให้ `anon`)
 *
 * ## 🔴 ทำไม *ไม่* เติม `lat`/`lng` เป็น `null` ให้รูปเท่ากัน
 * `cityCenterOf()` รับ `null` แล้วคืน `null` อย่างสุภาพ ⇒ **แผนที่ว่างโดยไม่มีอะไรฟ้อง**
 * และคนไล่จะไปโทษ `cityCenterOf` ไม่ใช่ตรงนี้ (คอมเมนต์ใน `searchCatalogCities` เตือนรูปนี้ไว้เอง)
 * 🎯 ***ฟิลด์ที่ "มีแต่เป็น null เสมอ" อันตรายกว่าฟิลด์ที่ไม่มี — อันแรกผ่านการตรวจชนิด อันหลังพังตอนคอมไพล์***
 * ⇒ **ขาดไปเลย** · ผู้เรียกที่ต้องใช้พิกัด ต้องอยู่หลังล็อกอินอยู่แล้ว
 *
 * ## 🔴 ทำไมคนยังไม่ล็อกอิน **ค้นด้วยข้อความไม่ได้**
 * ผู้ใช้สั่งว่าคนยังไม่ล็อกอิน *"มาดูหน้าตาเว็บก่อน ลองดู คลิกนู้นนี่"* — คือ **เปิดดู** ไม่ใช่ **ค้นคลัง**
 * · เปิดดูทีละประเทศมีเพดานตามธรรมชาติ (100/ประเทศ ในตัว RPC) · ค้นอิสระคือทางดูดคลังทั้งใบทีละหน้า
 * · `q` ที่ส่งมาตอนยังไม่ล็อกอินจะถูก **เพิกเฉยเงียบ ๆ ไม่ได้** → ตอบ `401` ให้ตรงกับสิ่งที่เกิดจริง
 *
 * ⚠️ **`q` ว่างได้สำหรับคนล็อกอินแล้ว และไม่ใช่ error** — เปิดช่องค้นครั้งแรกควรได้รายการตั้งต้น
 */
const RATE_LIMIT_PER_MINUTE = 60;

/** เพดานของ `limit` — กันคำขอเดียวลากคลังทั้งใบออกไป (ใช้กับทางที่ล็อกอินแล้วเท่านั้น) */
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  // 🔴 สำคัญกว่าเดิม — มีทางหนึ่งที่ไม่มีด่านล็อกอินคั่นแล้ว
  const limited = rateLimitGuard(req, "engine-cities", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, 80);

  // `^[a-z]{2}$` ตรงกับ `catalog_countries.id` — ค่าผิดรูปส่งไปให้ฐานได้แค่ error ที่แปลยาก
  const rawCountry = params.get("country");
  const countryId = rawCountry && /^[a-z]{2}$/.test(rawCountry) ? rawCountry : undefined;

  const user = await getUser();

  try {
    const db = await createServerSupabase();

    // ── ทางสาธารณะ: เปิดดูเมืองของประเทศหนึ่ง ────────────────────────────
    if (!user) {
      if (!countryId) {
        // 🔴 ไม่ตอบ `[]` — *"ไม่มีเมือง"* กับ *"คุณยังไม่ได้ล็อกอิน"* คนละเรื่อง และ `[]` อ่านเป็นอย่างแรก
        return NextResponse.json(
          { error: "ค้นเมืองต้องล็อกอินก่อน · เปิดดูรายเมืองให้ระบุ ?country=xx", code: "LOGIN_REQUIRED" },
          { status: 401 },
        );
      }
      if (q !== "") {
        return NextResponse.json(
          { error: "ค้นด้วยคำต้องล็อกอินก่อน", code: "LOGIN_REQUIRED" },
          { status: 401 },
        );
      }
      const { data, error } = await listPublicCities(db, countryId);
      if (error) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
      }
      const rows = (data ?? []).map((c) => ({
        id: c.id,
        // `country_id` มาจากพารามิเตอร์ที่ผู้เรียกส่งมาเอง ไม่ใช่จากฐาน — RPC ไม่คืนมา
        // และมันจริงตามนิยาม เพราะ RPC กรองด้วยค่านี้
        country_id: countryId,
        legacy_slug: c.slug,
        name_th: c.name_th,
        name_en: c.name_en,
      }));
      return NextResponse.json(rows, {
        // ไม่ผูกกับตัวตนผู้เรียก ⇒ `public`
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }

    // ── ทางเดิม: ล็อกอินแล้ว ค้นได้เต็มรูป ──────────────────────────────
    const rawLimit = Number(params.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 20;
    const { data, error } = await searchCatalogCities(db, { q, countryId, limit });
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    return NextResponse.json(data ?? [], {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ค้นเมืองไม่ได้" },
      { status: 502 },
    );
  }
}
