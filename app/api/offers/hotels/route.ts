import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { fetchOffers } from "@/lib/offers";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ราคาที่พักจากผู้ให้บริการภายนอก — `GET /api/offers/hotels`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมมันต้องมี และทำไมผมเกือบไม่ได้เขียน
 * `lib/offers/index.ts` มี `import "server-only"` ⇒ **คอมโพเนนต์ไคลเอนต์เรียกตรงไม่ได้ตามนิยาม**
 * แต่หัวไฟล์นั้นผมเขียนเองว่า *"วันที่จะต่อจริง … **ไม่ต้องแตะ UI ไม่ต้องแตะ route**"*
 * — ประโยคนั้น **สมมติว่ามี route อยู่แล้ว ซึ่งไม่มี** (P2 จับได้ตอนจะลงมือทำแท็บ "แนะนำ")
 * 🎯 ***คำสัญญาว่า "ต่อง่าย" ที่เขียนไว้ในไฟล์ที่ยังไม่มีทางเข้า — ไม่มีอะไรฟ้องจนกว่าจะมีคนลองต่อจริง***
 *
 * ## 🔴 คืน `OfferResult` **ดิบทั้งก้อน** ไม่แปลงเป็นข้อความ (P2 ขอ · ผมเห็นด้วยและเหตุผลเขาดีกว่าของผม)
 * ถ้า route แปลง `unconfigured` เป็นข้อความไทยให้ UI **ข้อความนั้นคือคำบรรยายสภาพของ `lib/offers/`
 * ที่อยู่ในไฟล์คนละใบ** ⇒ วันที่ต่อผู้ให้บริการจริง มันจะยังพูดว่ายังไม่มีราคา **และไม่มีอะไรฟ้อง**
 * · เป็นรูปเดียวกับ `HotelsFlatList.tsx:25-28` · `data/places.ts:15-16` ที่ทีมเจอมาแล้ววันนี้ **สามใบ**
 *
 * ## ⚠️ สี่สถานะห้ามยุบเป็น `[]` เดียว — ผู้เรียกต้องแยกเอง
 * `unconfigured` (ยังไม่ได้ต่อ) · `empty` (ต่อแล้วไม่มีห้อง) · `error` (ถามไม่สำเร็จ) · `ok`
 * ยุบเมื่อไหร่ผู้ใช้จะเห็น *"ไม่มีห้องว่าง"* ทั้งที่เรา **ไม่เคยถามใครเลย** — คำโกหกที่ดูเหมือนข้อมูล
 *
 * ## 📌 ต้องล็อกอิน แม้จะไม่แตะข้อมูลผู้ใช้เลย
 * เส้นนี้ยิง API ที่คิดเงินต่อคำขอในอนาคต · เปิดสาธารณะ = ใครก็เผาโควตาเราได้
 * · **ไม่ตรวจว่าเป็นสมาชิกทริปไหน** เพราะไม่ได้อ่าน/เขียนข้อมูลทริปเลยสักฟิลด์ — เมือง/วันที่มาจาก query
 *   ⚠️ ถ้าวันหนึ่งมันเริ่มอ่าน `trip_hotels` **ต้องย้ายไปใต้ `trips/[tripId]/` และเข้าทะเบียน `SURFACE`**
 */
const RATE_LIMIT_PER_MINUTE = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "offers-hotels", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const q = req.nextUrl.searchParams;
  const cityName = (q.get("city") ?? "").trim();
  const checkIn = q.get("checkIn") ?? "";
  const checkOut = q.get("checkOut") ?? "";
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));

  if (!cityName || cityName.length > 120) {
    return NextResponse.json({ error: "city ไม่ถูกต้อง" }, { status: 400 });
  }
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return NextResponse.json({ error: "checkIn/checkOut ต้องเป็น YYYY-MM-DD" }, { status: 400 });
  }
  // 🔴 `checkOut > checkIn` ไม่ใช่ `>=` — คืนศูนย์คืนไม่มีความหมายกับผู้ให้บริการที่ขายเป็น *คืน*
  //    (รูปเดียวกับ constraint `trip_hotels_dates_ordered` ที่ฐานบังคับอยู่แล้ว)
  if (checkOut <= checkIn) {
    return NextResponse.json({ error: "checkOut ต้องมาหลัง checkIn" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "lat/lng ไม่ถูกต้อง" }, { status: 400 });
  }

  const result = await fetchOffers({ kind: "hotel", cityName, lat, lng, checkIn, checkOut });

  // 🔴 **`200` ทุกสถานะรวม `error` โดยตั้งใจ** — `state` ในเนื้อคือคำตอบ ไม่ใช่รหัส HTTP
  //    ราคาเป็น *ของเสริม* ของหน้าวางแผน · ผู้ให้บริการล่มต้องไม่ทำให้ UI คิดว่าคำขอของตัวเองผิด
  //    แล้วไปเข้ากิ่ง "ลองใหม่" ทั้งที่สิ่งที่ต้องบอกผู้ใช้คือ *"ผู้ให้บริการมีปัญหา"*
  //    ⚠️ ต่างจาก `400` ข้างบนซึ่งเป็นความผิดของ *คำขอ* จริง ๆ
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
