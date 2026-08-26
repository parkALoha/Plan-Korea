import { NextRequest, NextResponse } from "next/server";
import { searchNearby } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";

// เปิดจาก modal ทีละครั้ง ไม่ได้ยิงเป็นชุด
const RATE_LIMIT_PER_MINUTE = 60;

// ประเภทสถานที่ที่เปิดให้ค้นหาได้ — จำกัดไว้เป็น allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง type อะไรก็ได้เข้า Google
const ATTRACTION_TYPES = [
  "tourist_attraction",
  "historical_landmark",
  "museum",
  "art_gallery",
  "park",
  "national_park",
  "beach",
  "hiking_area",
  "market",
  "shopping_mall",
  "observation_deck",
  "amusement_park",
  "aquarium",
  "cultural_landmark",
];

/**
 * 🔴 **allowlist ที่บังคับได้จริง — แก้ 27 ส.ค. 2026 (P1)**
 *
 * เดิม `KIND_TYPES: Record<string, string[]>` แล้วเช็คด้วย `if (!includedTypes) return 400`
 * → **`?kind=constructor` ได้ฟังก์ชัน `Object` กลับมา ซึ่งเป็นค่า truthy → เดินผ่านด่านไปเลย**
 * แล้ว `KIND_OPTIONS["constructor"].radius` เป็น `undefined` → **ยิง Google จริงด้วยค่าขยะ**
 * (`"toString"` `"valueOf"` `"__proto__"` ก็เหมือนกัน)
 *
 * 🎯 **คอมเมนต์ข้างบนเขียนเจตนาไว้ถูกทุกตัวอักษร — กลไกไม่ได้ทำตามนั้น** (ตระกูล `D82`)
 * *"จำกัดไว้เป็น allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง type อะไรก็ได้เข้า Google"*
 *
 * ทางแก้ใช้ **รายการที่เขียนชื่อออกมาตรง ๆ** ไม่ใช่ `Object.hasOwn` เพราะ:
 * ① `KINDS` เป็นแหล่งความจริงเดียวที่อ่านแล้วรู้ทันทีว่ารับอะไรได้บ้าง
 * ② `Record<Kind, …>` ทำให้ **ลืมเพิ่มใน `KIND_OPTIONS` = `tsc` แดง** ไม่ใช่ `undefined` ตอนรัน
 */
const KINDS = ["restaurant", "attraction", "place", "hospital"] as const;
type Kind = (typeof KINDS)[number];
function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

const KIND_TYPES: Record<Kind, string[]> = {
  restaurant: ["restaurant"],
  // ที่เที่ยวของเมืองนั้นๆ — รวมพิพิธภัณฑ์/วัด/สวน/ตลาด/จุดชมวิว ไม่ใช่แค่ tourist_attraction ล้วน
  // เพราะที่เที่ยวเกาหลีหลายที่ Google ไม่ได้ติดป้าย tourist_attraction ไว้
  attraction: ATTRACTION_TYPES,
  // คละทุกประเภทรอบจุดแวะล่าสุด — ใช้กับปุ่ม "เพิ่มสถานที่เอง" ที่ไม่ได้เจาะจงว่าจะหาอะไร
  place: [...ATTRACTION_TYPES, "restaurant", "cafe", "bar", "bakery", "zoo", "garden", "monument", "department_store"],
  // การ์ดฉุกเฉิน (เฟส 17) — โรงพยาบาลใกล้ที่พักคืนนั้น · ไม่รวมคลินิก/ร้านยาเพราะกลางดึกปิด
  hospital: ["hospital"],
};

// รัศมี/การเรียงลำดับต่อ kind — ที่เที่ยวมองทั้งเมืองเลยกว้างสุด ร้านอาหารต้องเดินต่อจากจุดก่อนหน้าได้เลยแคบสุด
const KIND_OPTIONS: Record<Kind, { radius: number; rank: "POPULARITY" | "DISTANCE" }> = {
  restaurant: { radius: 1200, rank: "DISTANCE" },
  attraction: { radius: 15000, rank: "POPULARITY" },
  place: { radius: 3000, rank: "POPULARITY" },
  // เรียงตามความนิยม ไม่ใช่ระยะใกล้ — Google ติดป้าย "hospital" ให้คลินิกศัลยกรรม/ผิวหนังในเกาหลีเยอะมาก
  // เรียงตามระยะแล้วได้คลินิกเสริมความงามขึ้นก่อนโรงพยาบาลจริง (ยืนยันจากผลจริงรอบซอมยอน ปูซาน)
  // โรงพยาบาลใหญ่มีรีวิวมากกว่าคลินิกเล็กหลายเท่า POPULARITY จึงดันตัวที่ไปแล้วรักษาได้จริงขึ้นมาแทน
  hospital: { radius: 8000, rank: "POPULARITY" },
};

// หาสถานที่รอบพิกัดที่ให้มา
// kind=restaurant → ร้านอาหารรอบจุดแวะล่าสุด เรียงตามระยะใกล้ (เฟส 2)
// kind=attraction → ที่เที่ยวของเมืองนั้น เรียงตามความนิยม รัศมีกว้างกว่าเพราะที่เที่ยวกระจายทั้งเมือง
// kind=place → คละทุกประเภทแถวนั้น เรียงตามความนิยม ใช้เป็นลิสต์แนะนำของ "เพิ่มสถานที่เอง"
// kind=hospital → โรงพยาบาลใกล้ที่พัก เรียงตามระยะใกล้ ใช้ในการ์ดฉุกเฉิน (เฟส 17)
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-nearby", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const kind = req.nextUrl.searchParams.get("kind") ?? "restaurant";
  const radiusParam = req.nextUrl.searchParams.get("radius");
  if (!lat || !lng) {
    return NextResponse.json({ results: [], error: "missing lat/lng" }, { status: 400 });
  }
  /**
   * 🔴 **`if (!lat)` ตรวจแค่ว่า *มี* ไม่ได้ตรวจว่า *เป็นตัวเลข*** — แก้ 27 ส.ค. 2026 (P1)
   * `?lat=abc` ผ่านด่านข้างบน แล้ว `parseFloat("abc")` เป็น `NaN`
   * → **ยิง Google จริงด้วยพิกัด `NaN`** แล้วคืน error ของ Google ให้ผู้ใช้แทนที่จะเป็น `400` ของเรา
   * 🎯 รูปเดียวกับช่อง `kind` ในไฟล์นี้เป๊ะ: **ด่านที่ผ่านได้ทำให้เกิดคำขอที่ไม่ควรมี**
   * · เช็คช่วงด้วย ไม่ใช่แค่ `isFinite` — พิกัดนอกโลกไม่มีความหมายและเป็นสัญญาณว่าฝั่งเรียกพัง
   */
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
      latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return NextResponse.json({ results: [], error: "bad lat/lng" }, { status: 400 });
  }

  // 🔴 ตรวจ **ก่อน** แตะตารางใด ๆ — ไม่ใช่ตรวจผลลัพธ์ของการแตะตาราง
  //    การเช็ค `if (!ผลลัพธ์)` แปลว่าเรา index ไปแล้ว และสายโปรโตไทป์ก็ตอบไปแล้ว
  if (!isKind(kind)) {
    return NextResponse.json({ results: [], error: "unknown kind" }, { status: 400 });
  }
  const includedTypes = KIND_TYPES[kind];
  const options = KIND_OPTIONS[kind];
  // ⚠️ `parseInt("abc")` เป็น `NaN` → `Math.min(NaN, 50000)` ก็ `NaN` → รัศมี `NaN` ไปถึง Google
  //    ค่าที่พังต้อง **ตกไปใช้ค่าเริ่มต้นของ kind** ไม่ใช่ทำให้คำขอเสีย
  const radiusNum = radiusParam ? parseInt(radiusParam, 10) : NaN;
  const radius = Number.isFinite(radiusNum) && radiusNum > 0
    ? Math.min(radiusNum, 50000)
    : options.radius;

  const { places, error } = await searchNearby(
    { lat: latNum, lng: lngNum },
    includedTypes,
    "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName",
    radius,
    options.rank
  );

  const results = places.map((p) => ({
    id: p.id ?? null,
    name: p.displayName?.text ?? "",
    formattedAddress: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photoUrl: p.photos?.[0]?.name
      ? `/api/place-photo?name=${encodeURIComponent(p.photos[0].name)}`
      : null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    googleType: p.primaryType ?? null,
    primaryType: p.primaryTypeDisplayName?.text ?? null,
  }));

  return NextResponse.json({ results, error });
}
