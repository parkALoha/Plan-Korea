import { NextRequest, NextResponse } from "next/server";
import { searchNearby } from "@/lib/googlePlaces";

// ประเภทสถานที่ที่เปิดให้ค้นหาได้ — จำกัดไว้เป็น allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง type อะไรก็ได้เข้า Google
const KIND_TYPES: Record<string, string[]> = {
  restaurant: ["restaurant"],
  // ที่เที่ยวของเมืองนั้นๆ — รวมพิพิธภัณฑ์/วัด/สวน/ตลาด/จุดชมวิว ไม่ใช่แค่ tourist_attraction ล้วน
  // เพราะที่เที่ยวเกาหลีหลายที่ Google ไม่ได้ติดป้าย tourist_attraction ไว้
  attraction: [
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
  ],
};

// หาสถานที่รอบพิกัดที่ให้มา
// kind=restaurant → ร้านอาหารรอบจุดแวะล่าสุด เรียงตามระยะใกล้ (เฟส 2)
// kind=attraction → ที่เที่ยวของเมืองนั้น เรียงตามความนิยม รัศมีกว้างกว่าเพราะที่เที่ยวกระจายทั้งเมือง
export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const kind = req.nextUrl.searchParams.get("kind") ?? "restaurant";
  const radiusParam = req.nextUrl.searchParams.get("radius");
  if (!lat || !lng) {
    return NextResponse.json({ results: [], error: "missing lat/lng" }, { status: 400 });
  }

  const includedTypes = KIND_TYPES[kind];
  if (!includedTypes) {
    return NextResponse.json({ results: [], error: "unknown kind" }, { status: 400 });
  }

  const radius = radiusParam ? Math.min(parseInt(radiusParam, 10), 50000) : kind === "attraction" ? 15000 : 1200;

  const { places, error } = await searchNearby(
    { lat: parseFloat(lat), lng: parseFloat(lng) },
    includedTypes,
    "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName",
    radius,
    kind === "attraction" ? "POPULARITY" : "DISTANCE"
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
