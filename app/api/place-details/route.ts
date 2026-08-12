import { NextRequest, NextResponse } from "next/server";
import { searchPlacesText, type GoogleOpeningHours, type GoogleReview } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// เพดานสูงเพราะหน้าแผนยิงเส้นนี้ทีละสถานที่ (~34 ครั้งต่อการเปิดหน้า 1 ครั้ง) — ดู rateLimitGuard
const RATE_LIMIT_PER_MINUTE = 300;

type PlaceDetailsResponse = {
  googlePlaceId: string | null;
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  reviews: GoogleReview[] | null;
  /** เวลาเปิด-ปิดจริง 7 วันข้างหน้ารวมวันหยุดพิเศษ — มีค่าเฉพาะตอนขอด้วย ?live=1 (เฟส 11.5)
   *  ไม่เก็บใน place_details_cache เพราะข้อมูลหมดอายุไว ต่างจาก openingHours (ตารางประจำ) ด้านบน */
  currentOpeningHours?: GoogleOpeningHours | null;
  /** ชื่อ/ที่อยู่ภาษาท้องถิ่น (เฟส 14) — มีค่าเมื่อขอด้วย ?locale=ko|vi
   *  ที่คัดไว้ใน data/places.ts ฝัง nameLocal มาแล้วไม่ต้องพึ่งเส้นนี้ · เส้นนี้ไว้ให้สถานที่ที่ผู้ใช้เพิ่มเอง */
  nameLocal?: string | null;
  addressLocal?: string | null;
};

/** ภาษาที่ยอมรับ — allowlist ฝั่งเซิร์ฟเวอร์ ไม่ปล่อยให้ client ส่ง languageCode อะไรก็ได้เข้า Google */
const ALLOWED_LOCALES = ["ko", "vi"] as const;
type Locale = (typeof ALLOWED_LOCALES)[number];

function parseLocale(raw: string | null): Locale | null {
  return ALLOWED_LOCALES.includes(raw as Locale) ? (raw as Locale) : null;
}

/** ดึงชื่อ+ที่อยู่ภาษาท้องถิ่นจาก Google (คนละ request กับตัวหลักเพราะขอคนละ languageCode) */
async function fetchLocalName(query: string, locale: Locale) {
  const { places } = await searchPlacesText(
    query,
    "places.displayName,places.formattedAddress",
    null,
    undefined,
    false,
    locale
  );
  return {
    nameLocal: places[0]?.displayName?.text ?? null,
    addressLocal: places[0]?.formattedAddress ?? null,
  };
}

// ยิงขอ currentOpeningHours สดจาก Google เสมอ ไม่พึ่ง cache ไหนเลย (ทั้ง DB และ Next.js fetch cache)
// เพราะข้อมูลนี้มีความหมายแค่ 7 วันข้างหน้านับจากตอนเรียก แคชไว้นานจะกลายเป็นข้อมูลผิดเงียบๆ
async function fetchCurrentOpeningHoursLive(query: string): Promise<GoogleOpeningHours | null> {
  const { places } = await searchPlacesText(query, "places.currentOpeningHours", null, undefined, true);
  return places[0]?.currentOpeningHours ?? null;
}

// resolve สถานที่เป็น Google place ID + เวลาเปิด-ปิด + เรทติ้ง/รีวิว/ประเภทร้านครั้งเดียว (เฟส 2)
// เช็ค place_details_cache ใน Supabase ก่อนเสมอ (แคชถาวร) เจอแล้วไม่ยิง Google ซ้ำ
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-details", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const query = req.nextUrl.searchParams.get("query");
  const live = req.nextUrl.searchParams.get("live") === "1";
  const locale = parseLocale(req.nextUrl.searchParams.get("locale"));

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  if (supabaseConfigured) {
    const { data: cached } = await supabase
      .from("place_details_cache")
      .select(
        "google_place_id, opening_hours, rating, user_rating_count, primary_type, reviews, name_local, address_local, locale"
      )
      .eq("maps_query", query)
      .maybeSingle();
    if (cached) {
      // แคชไว้แล้วแต่ยังไม่มีชื่อท้องถิ่น (หรือเป็นคนละภาษากับที่ขอ) → เติมให้ครั้งเดียวแล้วเก็บลงแถวเดิม
      // แถวเก่าทั้งหมดที่มีอยู่ก่อนเฟส 14 จะค่อยๆ ถูกเติมเองเมื่อถูกเรียกใช้ ไม่ต้อง backfill ทั้งตาราง
      let nameLocal = cached.name_local as string | null;
      let addressLocal = cached.address_local as string | null;
      if (locale && cached.locale !== locale) {
        const fresh = await fetchLocalName(query, locale);
        nameLocal = fresh.nameLocal;
        addressLocal = fresh.addressLocal;
        if (nameLocal) {
          await supabase
            .from("place_details_cache")
            .update({ name_local: nameLocal, address_local: addressLocal, locale })
            .eq("maps_query", query);
        }
      }

      const result: PlaceDetailsResponse = {
        googlePlaceId: cached.google_place_id,
        openingHours: cached.opening_hours as GoogleOpeningHours | null,
        rating: cached.rating,
        userRatingCount: cached.user_rating_count,
        primaryType: cached.primary_type,
        reviews: cached.reviews as GoogleReview[] | null,
        currentOpeningHours: live ? await fetchCurrentOpeningHoursLive(query) : undefined,
        nameLocal,
        addressLocal,
      };
      return NextResponse.json(result);
    }
  }

  const fieldMask = live
    ? "places.id,places.regularOpeningHours,places.currentOpeningHours,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.reviews"
    : "places.id,places.regularOpeningHours,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.reviews";
  const { places, error } = await searchPlacesText(query, fieldMask);
  if (error) {
    return NextResponse.json({
      googlePlaceId: null,
      openingHours: null,
      rating: null,
      userRatingCount: null,
      primaryType: null,
      reviews: null,
      error,
    });
  }

  const place = places[0];
  const googlePlaceId = place?.id ?? null;
  const openingHours = place?.regularOpeningHours ?? null;
  const rating = place?.rating ?? null;
  const userRatingCount = place?.userRatingCount ?? null;
  const primaryType = place?.primaryTypeDisplayName?.text ?? null;
  const reviews = place?.reviews?.slice(0, 3) ?? null;
  const local = locale ? await fetchLocalName(query, locale) : { nameLocal: null, addressLocal: null };

  if (supabaseConfigured && googlePlaceId) {
    await supabase.from("place_details_cache").upsert({
      maps_query: query,
      google_place_id: googlePlaceId,
      opening_hours: openingHours,
      rating,
      user_rating_count: userRatingCount,
      primary_type: primaryType,
      reviews,
      name_local: local.nameLocal,
      address_local: local.addressLocal,
      locale: local.nameLocal ? locale : null,
      fetched_at: new Date().toISOString(),
    });
  }

  const result: PlaceDetailsResponse = {
    googlePlaceId,
    openingHours,
    rating,
    userRatingCount,
    primaryType,
    reviews,
    currentOpeningHours: live ? place?.currentOpeningHours ?? null : undefined,
    nameLocal: local.nameLocal,
    addressLocal: local.addressLocal,
  };
  return NextResponse.json(result);
}
