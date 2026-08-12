import { NextRequest, NextResponse } from "next/server";
import { lookupPlace } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";

// เปิดหน้า ตม. ครั้งหนึ่งยิงคำขอเดียว (รวมทุกสถานที่ในทริป) — เพดานเท่า /api/place-details
const RATE_LIMIT_PER_MINUTE = 300;

/** จำนวนสถานที่สูงสุดต่อ 1 คำขอ — เท่ากับ /api/place-details ทั้งทริปมี ~46 ที่ */
const MAX_BATCH = 80;

/** ภาษาที่ยอมรับ — allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง languageCode อะไรก็ได้เข้า Google */
const ALLOWED_LANGS = ["en", "ko", "vi"] as const;
type Lang = (typeof ALLOWED_LANGS)[number];

function parseLang(raw: string | null): Lang {
  return ALLOWED_LANGS.includes(raw as Lang) ? (raw as Lang) : "en";
}

/**
 * ชื่อสถานที่ในภาษาที่ขอ — เส้นเดียวที่คืน "แค่ชื่อ" ไม่พ่วงเรทติ้ง/เวลาเปิด-ปิด/รีวิว (เฟส 22)
 *
 * ใช้กับหน้า ตม./K-ETA ที่ต้องเป็นอังกฤษล้วน: สถานที่ที่เพิ่มเองระหว่างทางเก็บชื่อที่ Google คืนมา
 * ตอน `languageCode: "th"` ลง `custom_places.name_th` แล้ว `name_en` เป็น null (ดู NearbyPlacesModal)
 * — resolvePlace เลย fallback `name_en ?? name_th` = เอกสารที่ยื่นเจ้าหน้าที่มีชื่อไทยปนอยู่
 * ("ตลาดปลาจากัลชิ" ที่ผู้ใช้เจอจริง) ทั้งที่ Google มีชื่ออังกฤษของที่เดียวกันให้อยู่แล้ว
 *
 * **จงใจไม่เก็บลง place_details_cache** — คอลัมน์ `name_local`/`locale` ที่นั่นเก็บได้ภาษาเดียวต่อแถว
 * และถูกจองไว้ให้ ko/vi (เฟส 14 ใช้ส่งเข้า Naver/Kakao) เขียนทับด้วย en เมื่อไหร่ชื่อเกาหลีที่หน้า
 * /today ใช้จะหายไปทันที · แคชของเส้นนี้อาศัย fetch cache ของ Next 30 วันใน lookupPlace แทน
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-name", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const batchParam = req.nextUrl.searchParams.get("queries");
  if (!batchParam) {
    return NextResponse.json({ error: "missing queries" }, { status: 400 });
  }

  const queries = Array.from(
    new Set(batchParam.split("|").map((q) => q.trim()).filter(Boolean))
  ).slice(0, MAX_BATCH);
  if (queries.length === 0) {
    return NextResponse.json({ error: "missing queries" }, { status: 400 });
  }

  const entries = await Promise.all(
    queries.map(async (query): Promise<[string, string | null]> => {
      const { place } = await lookupPlace(query, "places.displayName", { languageCode: lang });
      return [query, place?.displayName?.text ?? null];
    })
  );

  return NextResponse.json({ results: Object.fromEntries(entries) });
}
