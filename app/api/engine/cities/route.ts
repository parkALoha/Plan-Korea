import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { searchCatalogCities } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ค้นเมืองในคลัง — ตัวป้อนของ autocomplete "เมืองปลายทาง" ในฟอร์มสร้างทริป (`E5`)
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — คลังเป็นข้อมูลสาธารณะที่ `authenticated` มี `select` อยู่แล้ว (`D38`)
 *
 * 🔴 **ยังบังคับล็อกอิน ทั้งที่ข้อมูลเป็นสาธารณะ** — โดยตั้งใจ
 * คลังเปิดให้ *ผู้ใช้ของเรา* ค้น ไม่ใช่เปิดให้ทั้งอินเทอร์เน็ตดูดออกไปทีละหน้า
 * · `anon` ไม่มีสิทธิ์อ่านคลังอยู่แล้วในฐาน → ถ้าไม่เช็คตรงนี้ ผลที่ได้คือ `[]` เงียบ ๆ
 *   ซึ่ง**อ่านเหมือน "ไม่มีเมืองชื่อนี้" ไม่ใช่ "คุณยังไม่ได้ล็อกอิน"** · ตอบ 401 ให้ตรงกับสิ่งที่เกิดจริง
 *
 * ⚠️ **`q` ว่างได้ และไม่ใช่ error** — เปิดช่องค้นครั้งแรกยังไม่พิมพ์อะไร ควรได้รายการตั้งต้น
 * (ตัวล้างอักขระของ `searchCatalogCities` อาจทำให้เหลือว่างได้ด้วย เช่นพิมพ์ `%` ตัวเดียว)
 */
const RATE_LIMIT_PER_MINUTE = 60;

/** เพดานของ `limit` — กันคำขอเดียวลากคลังทั้งใบออกไป */
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-cities", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, 80);

  // `^[a-z]{2}$` ตรงกับ `catalog_countries.id` — ส่งค่าที่ผิดรูปไปให้ฐานไม่ได้อะไรนอกจาก error ที่แปลยาก
  const rawCountry = params.get("country");
  const countryId = rawCountry && /^[a-z]{2}$/.test(rawCountry) ? rawCountry : undefined;

  const rawLimit = Number(params.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 20;

  try {
    const db = await createServerSupabase();
    const { data, error } = await searchCatalogCities(db, { q, countryId, limit });
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    // คลังเปลี่ยนน้อยมาก แต่ผลผูกกับตัวตนผู้เรียก (ต้องล็อกอิน) → `private` ไม่ใช่ `public`
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
