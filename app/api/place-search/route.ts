import { NextRequest, NextResponse } from "next/server";
import { searchPlacesText } from "@/lib/googlePlaces";

// ค้นหาสถานที่แบบอิสระ (ใช้ตอนผู้ใช้กด "+ เพิ่มสถานที่เอง") — field mask กว้างกว่า
// /api/place-photos เพราะต้องได้ชื่อ/พิกัด/ที่อยู่มาด้วย ไม่ใช่แค่รูป
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ results: [], error: "missing query" }, { status: 400 });
  }

  const { places, error } = await searchPlacesText(
    query,
    "places.id,places.displayName,places.formattedAddress,places.location,places.photos"
  );

  const results = places.slice(0, 8).map((p) => ({
    id: p.id ?? null,
    name: p.displayName?.text ?? query,
    formattedAddress: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photoUrl: p.photos?.[0]?.name
      ? `/api/place-photo?name=${encodeURIComponent(p.photos[0].name)}`
      : null,
  }));

  return NextResponse.json({ results, error });
}
