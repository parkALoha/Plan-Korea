import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails, searchPlacesText } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";

// เรียกตอนบันทึกที่พักเท่านั้น นานๆ ครั้ง
const RATE_LIMIT_PER_MINUTE = 60;

// fieldMask ของ Place Details ไม่มี prefix "places." แต่ของ Text Search ต้องมี (คืนเป็น array)
const DETAILS_FIELD_MASK = "displayName,formattedAddress,location";
const SEARCH_FIELD_MASK = "places.displayName,places.formattedAddress,places.location";

// แปลงชื่อ/ที่อยู่โรงแรมเป็นพิกัด lat/lng
// รับ placeId (เลือกจาก dropdown ของ /api/place-autocomplete) เป็นทางหลัก — แม่นกว่าเพราะรู้ตัวสถานที่แน่นอน
// รับ query (พิมพ์เต็มแล้วกด "ค้นหา" โดยไม่เลือก suggestion) เป็น fallback ผ่าน Places API (New) Text Search
// หมายเหตุ: ห้ามใช้ Geocoding API (legacy) — key ของโปรเจกต์นี้เปิดใช้เฉพาะ Places API (New)
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "geocode", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const placeId = req.nextUrl.searchParams.get("placeId");
  const query = req.nextUrl.searchParams.get("query");

  if (!placeId && !query) {
    return NextResponse.json({ error: "missing query or placeId" }, { status: 400 });
  }

  if (placeId) {
    const { place, error } = await getPlaceDetails(placeId, DETAILS_FIELD_MASK);
    if (error || !place?.location) {
      return NextResponse.json({
        lat: null,
        lng: null,
        formattedAddress: null,
        error: error ?? "place not found",
      });
    }
    return NextResponse.json({
      lat: place.location.latitude,
      lng: place.location.longitude,
      formattedAddress: place.formattedAddress ?? null,
      error: null,
    });
  }

  const { places, error } = await searchPlacesText(query!, SEARCH_FIELD_MASK);
  const result = places[0];
  if (error || !result?.location) {
    return NextResponse.json({
      lat: null,
      lng: null,
      formattedAddress: null,
      error: error ?? "no results",
    });
  }

  return NextResponse.json({
    lat: result.location.latitude,
    lng: result.location.longitude,
    formattedAddress: result.formattedAddress ?? null,
    error: null,
  });
}
