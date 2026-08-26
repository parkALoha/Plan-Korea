import { parsePlaceIdKey } from "@/lib/placeQuery";

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
  /** เบอร์โทรรูปแบบสากล เช่น "+82 2-1234-5678" — ใช้กรอกช่อง "ที่พักในเกาหลี" ของ ตม./K-ETA */
  internationalPhoneNumber?: string;
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
 * ยิง Places API แล้ว **ไม่โยนไม่ว่าเกิดอะไรขึ้น** — `E4` (P1 · 27 ส.ค. 2026)
 *
 * ## 🔴 ทั้ง 4 ฟังก์ชันในไฟล์นี้ *สัญญา* ว่าไม่โยน แล้ว *โยน*
 * ทุกตัวคืน `{ …, error: string | null }` และจัดการ 2 ทางพลาดไว้เรียบร้อย
 * (ไม่มีคีย์ · `!res.ok`) — **แต่ `await fetch()` โยนเองเมื่อคำขอไปไม่ถึงปลายทาง**
 * (DNS ล่ม · เน็ตขาด · timeout) และ `await res.json()` โยนเมื่อ body ไม่ใช่ JSON
 *
 * 🎯 **ทางพลาดที่ *น่าจะเกิดที่สุด* คือทางเดียวที่หลุดจากสัญญา** — และ **route ทั้ง 7 เส้น
 * ที่เรียกไฟล์นี้ไม่มี `try` เลยสักตัว** (นับแล้ว) เพราะเชื่อสัญญานั้น
 * → ผู้ใช้ได้หน้า error 500 ของ Next แทนข้อความที่เราเขียนไว้ **ในนาทีที่เน็ตแย่ที่สุด**
 * ซึ่งคือนาทีที่คนกำลังเที่ยวอยู่ต่างประเทศต้องการให้แอปบอกความจริงมากที่สุด
 *
 * · รูปเดียวกับที่แก้ไปแล้วใน `lib/travelProvider.ts` เช้านี้ (`fetchRealTravelTimeOutcome`)
 *   **บทเรียนเดียวกัน คนละไฟล์ และไฟล์นี้ยังไม่ได้รับมัน**
 *
 * ## แยก "ตอบว่าไม่มี" ออกจาก "ติดต่อไม่ได้"
 * `reason` บอกได้ 3 อย่างต่างกัน ไม่ยุบเป็นอันเดียว:
 * `<label> failed: <status>` (ไปถึงแล้วแต่ถูกปฏิเสธ) · `<label> ติดต่อไม่ได้` (ไปไม่ถึง)
 * · `<label> ตอบกลับไม่ใช่ JSON` (ไปถึง ตอบ 200 แต่ body พัง — เกิดกับ captive portal ของ WiFi โรงแรม)
 * 🔴 **สามอย่างนี้ต้องแก้คนละแบบ** — อันแรกดูโควตา/พารามิเตอร์ · อันที่สองรอเน็ต · อันที่สามออกจาก portal ก่อน
 */
async function callPlacesApi(
  url: string,
  init: RequestInit,
  label: string
): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, reason: `${label} ติดต่อไม่ได้` };
  }
  if (!res.ok) return { ok: false, reason: `${label} failed: ${res.status}` };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, reason: `${label} ตอบกลับไม่ใช่ JSON` };
  }
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
  noCache = false,
  /** ภาษาที่อยากให้ Google คืนชื่อ/ที่อยู่มา — ค่าเริ่มต้น "th" เหมือนเดิมทุกจุดที่เรียกอยู่แล้ว
   *  เฟส 14 ส่ง "ko"/"vi" เข้ามาเพื่อดึงชื่อภาษาท้องถิ่นไปใส่ Naver/Kakao และการ์ดให้คนขับแท็กซี่ดู */
  languageCode = "th"
): Promise<{ places: GooglePlaceResult[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { places: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const body: Record<string, unknown> = { textQuery: query, languageCode };
  if (restrictTo) {
    body.locationRestriction = { rectangle: circleToRectangle(restrictTo, radiusMeters) };
  }

  const out = await callPlacesApi(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      // แคชผลลัพธ์ไว้ 30 วัน เหมือน route อื่นๆ ในโปรเจกต์นี้ (ยกเว้น noCache)
      ...(noCache ? { cache: "no-store" as const } : { next: { revalidate: 2592000 } }),
    } as RequestInit,
    "places search"
  );
  if (!out.ok) return { places: [], error: out.reason };
  return { places: (out.data as { places?: GooglePlaceResult[] }).places ?? [], error: null };
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

  const out = await callPlacesApi(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    },
    "autocomplete"
  );
  if (!out.ok) return { suggestions: [], error: out.reason };
  const data = out.data as { suggestions?: unknown[] };
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

  const out = await callPlacesApi(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
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
    } as RequestInit,
    "nearby search"
  );
  if (!out.ok) return { places: [], error: out.reason };
  return { places: (out.data as { places?: GooglePlaceResult[] }).places ?? [], error: null };
}

/**
 * เรียก Places API (New) Place Details ด้วย placeId ที่ได้จาก autocompletePlaces
 * เพื่อเอาพิกัด/ที่อยู่เต็มมาบันทึกเป็นที่พัก
 */
export async function getPlaceDetails(
  placeId: string,
  fieldMask: string,
  /** ภาษาที่อยากให้ Google คืนชื่อ/ที่อยู่มา — เฟส 16 เรียกซ้ำด้วย "ko"/"vi"/"en" เพื่อเก็บชื่อที่พัก
   *  หลายภาษาไว้ในคราวเดียว (ชื่อท้องถิ่นไว้ให้แท็กซี่ · ชื่ออังกฤษไว้กรอกเอกสาร ตม.) */
  languageCode?: string,
  /** true = ข้าม cache 30 วันของ Next.js — ใช้ตอนขอ currentOpeningHours สดๆ เหมือน searchPlacesText */
  noCache = false
): Promise<{ place: GooglePlaceResult | null; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { place: null, error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const query = languageCode ? `?languageCode=${encodeURIComponent(languageCode)}` : "";
  const out = await callPlacesApi(
    `https://places.googleapis.com/v1/places/${placeId}${query}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      ...(noCache ? { cache: "no-store" as const } : { next: { revalidate: 2592000 } }),
    } as RequestInit,
    "place details"
  );
  if (!out.ok) return { place: null, error: out.reason };
  return { place: out.data as GooglePlaceResult, error: null };
}

/**
 * หาสถานที่ 1 แห่งจาก "คีย์ระบุตัวสถานที่" (ดู lib/placeQuery.ts) — เส้นทางเดียวที่ route ควรเรียก
 *
 * - คีย์เป็น `place_id:ChIJ...` → ยิง Place Details ตรงๆ ได้ร้านที่ต้องการเป๊ะ 100%
 * - คีย์เป็นข้อความ → ตกไป searchText เหมือนเดิม (ที่คัดไว้เองใน data/places.ts มีชื่อเมืองต่อท้ายอยู่แล้ว)
 *
 * fieldMask เขียนแบบ searchText ("places.rating") ที่เดียวพอ — ฝั่ง Place Details ไม่มีคำนำหน้า
 * `places.` จึงตัดออกให้ตรงนี้ ผู้เรียกไม่ต้องรู้ว่ากำลังคุยกับ endpoint ไหน
 */
export async function lookupPlace(
  queryKey: string,
  fieldMask: string,
  opts: { noCache?: boolean; languageCode?: string } = {}
): Promise<{ place: GooglePlaceResult | null; error: string | null }> {
  const placeId = parsePlaceIdKey(queryKey);
  if (placeId) {
    return getPlaceDetails(placeId, fieldMask.replaceAll("places.", ""), opts.languageCode, opts.noCache);
  }

  const { places, error } = await searchPlacesText(
    queryKey,
    fieldMask,
    null,
    undefined,
    opts.noCache ?? false,
    opts.languageCode ?? "th"
  );
  return { place: places[0] ?? null, error };
}
