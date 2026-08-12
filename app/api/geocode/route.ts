import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails, searchPlacesText } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";

// เรียกตอนบันทึกที่พักเท่านั้น นานๆ ครั้ง
const RATE_LIMIT_PER_MINUTE = 60;

// fieldMask ของ Place Details ไม่มี prefix "places." แต่ของ Text Search ต้องมี (คืนเป็น array)
const DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location";
const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location";
// รอบเสริม (ภาษาท้องถิ่น/อังกฤษ) ขอเฉพาะฟิลด์ที่เปลี่ยนตามภาษา + เบอร์โทร ให้บิลถูกที่สุด
const LOCALIZED_FIELD_MASK = "displayName,formattedAddress,internationalPhoneNumber";

type Localized = {
  nameLocal: string | null;
  addressLocal: string | null;
  nameEn: string | null;
  addressEn: string | null;
  phone: string | null;
};

const EMPTY_LOCALIZED: Localized = {
  nameLocal: null,
  addressLocal: null,
  nameEn: null,
  addressEn: null,
  phone: null,
};

/**
 * ขอชื่อ/ที่อยู่ของที่พักเดิมซ้ำอีก 2 ภาษา (เฟส 16) — ภาษาท้องถิ่นไว้ส่งเข้า Naver/Kakao และให้คนขับแท็กซี่ดู
 * ส่วนภาษาอังกฤษไว้กรอกช่อง "ที่พักในเกาหลี" ของ ตม./K-ETA · ยิงขนานกัน 2 คำขอ เกิดเฉพาะตอนกดบันทึกที่พัก
 * (นานๆ ครั้ง) จึงไม่ต้องแคชเพิ่ม — `getPlaceDetails` มี Next.js fetch cache 30 วันอยู่แล้ว
 */
async function fetchLocalized(placeId: string, locale: string): Promise<Localized> {
  const [local, en] = await Promise.all([
    getPlaceDetails(placeId, LOCALIZED_FIELD_MASK, locale),
    getPlaceDetails(placeId, LOCALIZED_FIELD_MASK, "en"),
  ]);
  return {
    nameLocal: local.place?.displayName?.text ?? null,
    addressLocal: local.place?.formattedAddress ?? null,
    nameEn: en.place?.displayName?.text ?? null,
    addressEn: en.place?.formattedAddress ?? null,
    // เบอร์เดียวกันทุกภาษา — เอาจากรอบไหนก็ได้ที่ตอบมา
    phone: en.place?.internationalPhoneNumber ?? local.place?.internationalPhoneNumber ?? null,
  };
}

// แปลงชื่อ/ที่อยู่โรงแรมเป็นพิกัด lat/lng
// รับ placeId (เลือกจาก dropdown ของ /api/place-autocomplete) เป็นทางหลัก — แม่นกว่าเพราะรู้ตัวสถานที่แน่นอน
// รับ query (พิมพ์เต็มแล้วกด "ค้นหา" โดยไม่เลือก suggestion) เป็น fallback ผ่าน Places API (New) Text Search
// `locale` (ko|vi) สั่งให้ขอชื่อ/ที่อยู่ภาษาท้องถิ่น + อังกฤษ + เบอร์โทรมาด้วย (เฟส 16 — ไม่ส่งมาก็คืน null หมด)
// หมายเหตุ: ห้ามใช้ Geocoding API (legacy) — key ของโปรเจกต์นี้เปิดใช้เฉพาะ Places API (New)
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "geocode", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const placeId = req.nextUrl.searchParams.get("placeId");
  const query = req.nextUrl.searchParams.get("query");
  const locale = req.nextUrl.searchParams.get("locale");

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
        ...EMPTY_LOCALIZED,
        error: error ?? "place not found",
      });
    }
    return NextResponse.json({
      lat: place.location.latitude,
      lng: place.location.longitude,
      formattedAddress: place.formattedAddress ?? null,
      ...(locale ? await fetchLocalized(placeId, locale) : EMPTY_LOCALIZED),
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
      ...EMPTY_LOCALIZED,
      error: error ?? "no results",
    });
  }

  return NextResponse.json({
    lat: result.location.latitude,
    lng: result.location.longitude,
    formattedAddress: result.formattedAddress ?? null,
    ...(locale && result.id ? await fetchLocalized(result.id, locale) : EMPTY_LOCALIZED),
    error: null,
  });
}
