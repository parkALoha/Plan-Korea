import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { browseCatalogPlaces } from "@/lib/engine/db";
import { catalogPlaceCards } from "@/lib/engine/trip";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * คลังสถานที่ของเมือง — ตัวป้อนของไซด์บาร์ "เพิ่มสถานที่ลงวัน" (`B6`)
 * เจ้าของ: P1-Lead · 28 ส.ค. 2026
 *
 * ## 🔴 ทำไม route นี้ถึงจำเป็น
 * วันนี้ `PlaceSidebar.tsx:6` อ่าน `placesByCity()` จาก **`data/places.ts` (ไฟล์สถิตย์)**
 * ซึ่งผูกชนิดกับ `Day["city"]` = 6 เมืองเดิมเท่านั้น (`data/itinerary.ts:16`)
 * → **เพิ่มเมืองในคลังกี่เมืองก็ไม่โผล่** · ญี่ปุ่น 57 แห่ง/ไทย 37 แห่งที่ seed ไปแล้ววันนี้
 *   ยังเอาลงวันไม่ได้เลยสักแห่ง · นั่นคือ `B6` และไฟล์นี้คือครึ่งที่เป็นของฝั่ง API
 *
 * ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — คลังเป็นข้อมูลสาธารณะที่ `authenticated` มี `select` อยู่แล้ว (`D38`)
 *
 * ## ⚠️ **ไม่กรอง `supported` ต่างจาก `/api/engine/cities` โดยตั้งใจ**
 * ที่นี่ต้องระบุ `cityId` เสมอ และ `cityId` มาจากทริปที่มีอยู่จริง
 * → ถ้ากรองด้วยขอบเขตผลิตภัณฑ์ **ทริปเก่าในประเทศที่ถูกถอดออกจากขอบเขตจะเปิดแล้วคลังว่าง**
 * `20260828001500` เขียนกฎนี้ไว้ตรง ๆ: **`supported` กรอง *การค้นหา* ไม่ใช่ *การ resolve ของเดิม***
 */
const RATE_LIMIT_PER_MINUTE = 60;

/** เพดาน — กันคำขอเดียวลากคลังทั้งใบ (174 แห่งวันนี้) · เมืองที่มีมากสุดคือโตเกียว 12 แห่ง */
const MAX_LIMIT = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-places", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const cityId = req.nextUrl.searchParams.get("cityId") ?? "";
  // 🔴 **บังคับ `cityId` เสมอ** — ไซด์บาร์แสดงทีละเมืองอยู่แล้ว
  //    เปิดให้ขอทั้งคลัง = คำขอเดียวลากทุกอย่างมาโดยไม่มีใครต้องการ
  //    · ตรวจรูป uuid ที่นี่เพื่อให้ผิดรูปได้ `400` ที่อ่านออก ไม่ใช่ `502` จากฐาน
  if (!UUID.test(cityId)) {
    return NextResponse.json({ error: "ต้องระบุ cityId เป็น uuid" }, { status: 400 });
  }

  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 100;

  try {
    const db = await createServerSupabase();
    const { data, error } = await browseCatalogPlaces(db, { cityId, limit });
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    return NextResponse.json(catalogPlaceCards(data ?? []), {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านคลังสถานที่ไม่ได้" },
      { status: 502 },
    );
  }
}
