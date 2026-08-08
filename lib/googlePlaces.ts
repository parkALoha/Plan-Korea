export type GoogleOpeningHours = {
  openNow?: boolean;
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  weekdayDescriptions?: string[];
};

export type GoogleReview = {
  rating?: number;
  text?: { text: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName: string };
};

export type GooglePlaceResult = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  photos?: Array<{ name: string }>;
  regularOpeningHours?: GoogleOpeningHours;
  /** เวลาเปิด-ปิดจริงของ 7 วันข้างหน้านับจากตอนเรียก API รวมวันหยุดพิเศษที่ต่างจากตารางปกติ (เฟส 11.5)
   *  ต่างจาก regularOpeningHours ที่เป็นตารางประจำสัปดาห์เฉยๆ ไม่รู้เรื่องวันหยุด — ห้ามแคชถาวรเพราะข้อมูลหมดอายุไว */
  currentOpeningHours?: GoogleOpeningHours;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  reviews?: GoogleReview[];
};

export type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string | null;
};

/**
 * รัศมีที่ถือว่า "ยังอยู่ในเมืองเดียวกัน" สำหรับจำกัดผลค้นหา/คำแนะนำ
 * 30 กม. ครอบคลุมเขตเมืองใหญ่ของเกาหลีทั้งเมือง (ปูซานกว้างสุดราว 30 กม.) รวมชานเมืองที่ขับไปเที่ยวได้
 * แต่ไม่กว้างจนหลุดไปเมืองอื่น — และตัดผลลัพธ์ในไทยที่เคยโผล่มาตอนพิมพ์ภาษาไทยออกไปหมด
 */
export const CITY_SEARCH_RADIUS_METERS = 30000;

/**
 * แปลงวงกลม (จุดศูนย์กลาง + รัศมี) เป็นสี่เหลี่ยม low/high
 * เพราะ searchText รับ locationRestriction เป็น rectangle เท่านั้น (ต่างจาก autocomplete/nearby ที่รับ circle)
 */
function circleToRectangle(center: { lat: number; lng: number }, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return {
    low: { latitude: center.lat - latDelta, longitude: center.lng - lngDelta },
    high: { latitude: center.lat + latDelta, longitude: center.lng + lngDelta },
  };
}

/**
 * เรียก Places API (New) searchText แบบใช้ร่วมกันได้ระหว่างหลาย route (fieldMask ต่างกันไปตามที่ใช้)
 * ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้ามส่ง GOOGLE_MAPS_API_KEY ไปฝั่ง browser
 * ถ้าส่ง restrictTo มาด้วยจะจำกัดผลลัพธ์ให้อยู่ในกรอบรอบจุดนั้นเท่านั้น (ไม่ใช่แค่ bias)
 */
export async function searchPlacesText(
  query: string,
  fieldMask: string,
  restrictTo: { lat: number; lng: number } | null = null,
  radiusMeters = CITY_SEARCH_RADIUS_METERS,
  /** true = ข้าม cache 30 วันของ Next.js — ใช้ตอนต้องการ currentOpeningHours สดๆ (เฟส 11.5) ที่ห้ามค้างนาน */
  noCache = false
): Promise<{ places: GooglePlaceResult[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { places: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const body: Record<string, unknown> = { textQuery: query, languageCode: "th" };
  if (restrictTo) {
    body.locationRestriction = { rectangle: circleToRectangle(restrictTo, radiusMeters) };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    // แคชผลลัพธ์ไว้ 30 วัน เหมือน route อื่นๆ ในโปรเจกต์นี้ (ยกเว้น noCache)
    ...(noCache ? { cache: "no-store" as const } : { next: { revalidate: 2592000 } }),
  });

  if (!res.ok) {
    return { places: [], error: `places search failed: ${res.status}` };
  }

  const data = await res.json();
  return { places: data.places ?? [], error: null };
}

/**
 * เรียก Places API (New) Autocomplete — ใช้ตอนพิมพ์ค้นหาที่พัก/สถานที่/ร้านอาหาร คืนลิสต์ตัวเลือกให้เลือก
 * ใช้ locationRestriction (ไม่ใช่ locationBias) = ตัดผลลัพธ์นอกรัศมีทิ้งจริงๆ ไม่ใช่แค่จัดอันดับ
 * เพราะพิมพ์ภาษาไทยแล้วเคยได้ร้านในไทยขึ้นมาปนตลอด
 * จงใจไม่ล็อก includedRegionCodes เป็นเกาหลี — ทริปมีแวะฮานอยด้วย ใช้รัศมีรอบเมืองที่กำลังดูอยู่คุมพอ
 */
export async function autocompletePlaces(
  input: string,
  bias: { lat: number; lng: number } | null,
  radiusMeters = CITY_SEARCH_RADIUS_METERS
): Promise<{ suggestions: PlaceSuggestion[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { suggestions: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const body: {
    input: string;
    languageCode: string;
    locationRestriction?: {
      circle: { center: { latitude: number; longitude: number }; radius: number };
    };
  } = { input, languageCode: "th" };
  if (bias) {
    body.locationRestriction = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: radiusMeters },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { suggestions: [], error: `autocomplete failed: ${res.status}` };
  }

  const data = await res.json();
  type RawSuggestion = {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: {
        mainText?: { text: string };
        secondaryText?: { text: string };
      };
    };
  };
  const suggestions: PlaceSuggestion[] = ((data.suggestions ?? []) as RawSuggestion[])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
    }));

  return { suggestions, error: null };
}

/**
 * เรียก Places API (New) Nearby Search — ใช้หาร้านอาหารรอบจุดแวะล่าสุดของวันนั้น (เฟส 2)
 * ต่างจาก searchText ตรงที่ bias ด้วยพิกัดวงกลมล้วนๆ ไม่ใช้คำค้นข้อความ
 */
export async function searchNearby(
  center: { lat: number; lng: number },
  includedTypes: string[],
  fieldMask: string,
  radiusMeters = 1200,
  /** POPULARITY = ดังก่อน (ใช้กับที่เที่ยวทั้งเมือง), DISTANCE = ใกล้ก่อน (ใช้กับร้านอาหารรอบจุดแวะ) */
  rankPreference: "POPULARITY" | "DISTANCE" = "POPULARITY"
): Promise<{ places: GooglePlaceResult[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { places: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      rankPreference,
      languageCode: "th",
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
    next: { revalidate: 2592000 },
  });

  if (!res.ok) {
    return { places: [], error: `nearby search failed: ${res.status}` };
  }

  const data = await res.json();
  return { places: data.places ?? [], error: null };
}

/**
 * เรียก Places API (New) Place Details ด้วย placeId ที่ได้จาก autocompletePlaces
 * เพื่อเอาพิกัด/ที่อยู่เต็มมาบันทึกเป็นที่พัก
 */
export async function getPlaceDetails(
  placeId: string,
  fieldMask: string
): Promise<{ place: GooglePlaceResult | null; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { place: null, error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    next: { revalidate: 2592000 },
  });

  if (!res.ok) {
    return { place: null, error: `place details failed: ${res.status}` };
  }

  const place = (await res.json()) as GooglePlaceResult;
  return { place, error: null };
}
