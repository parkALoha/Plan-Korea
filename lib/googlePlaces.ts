export type GooglePlaceResult = {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  photos?: Array<{ name: string }>;
};

export type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string | null;
};

/**
 * เรียก Places API (New) searchText แบบใช้ร่วมกันได้ระหว่างหลาย route (fieldMask ต่างกันไปตามที่ใช้)
 * ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้ามส่ง GOOGLE_MAPS_API_KEY ไปฝั่ง browser
 */
export async function searchPlacesText(
  query: string,
  fieldMask: string
): Promise<{ places: GooglePlaceResult[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { places: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({ textQuery: query, languageCode: "th" }),
    // แคชผลลัพธ์ไว้ 30 วัน เหมือน route อื่นๆ ในโปรเจกต์นี้
    next: { revalidate: 2592000 },
  });

  if (!res.ok) {
    return { places: [], error: `places search failed: ${res.status}` };
  }

  const data = await res.json();
  return { places: data.places ?? [], error: null };
}

/**
 * เรียก Places API (New) Autocomplete — ใช้ตอนพิมพ์ค้นหาที่พัก คืนลิสต์ตัวเลือกให้เลือก
 * bias ผลลัพธ์ด้วย locationBias เป็นวงกลมรอบเมืองที่กำลังตั้งที่พักอยู่ จะได้ตรงกับทริปจริง
 * ไม่ใช่ผลลัพธ์ทั่วโลก
 */
export async function autocompletePlaces(
  input: string,
  bias: { lat: number; lng: number } | null
): Promise<{ suggestions: PlaceSuggestion[]; error: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { suggestions: [], error: "GOOGLE_MAPS_API_KEY not set" };
  }

  const body: {
    input: string;
    languageCode: string;
    locationBias?: {
      circle: { center: { latitude: number; longitude: number }; radius: number };
    };
  } = { input, languageCode: "th" };
  if (bias) {
    body.locationBias = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 20000 },
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
