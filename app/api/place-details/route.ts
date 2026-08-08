import { NextRequest, NextResponse } from "next/server";
import { searchPlacesText, type GoogleOpeningHours, type GoogleReview } from "@/lib/googlePlaces";
import { supabase, supabaseConfigured } from "@/lib/supabase";

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
};

// ยิงขอ currentOpeningHours สดจาก Google เสมอ ไม่พึ่ง cache ไหนเลย (ทั้ง DB และ Next.js fetch cache)
// เพราะข้อมูลนี้มีความหมายแค่ 7 วันข้างหน้านับจากตอนเรียก แคชไว้นานจะกลายเป็นข้อมูลผิดเงียบๆ
async function fetchCurrentOpeningHoursLive(query: string): Promise<GoogleOpeningHours | null> {
  const { places } = await searchPlacesText(query, "places.currentOpeningHours", null, undefined, true);
  return places[0]?.currentOpeningHours ?? null;
}

// resolve สถานที่เป็น Google place ID + เวลาเปิด-ปิด + เรทติ้ง/รีวิว/ประเภทร้านครั้งเดียว (เฟส 2)
// เช็ค place_details_cache ใน Supabase ก่อนเสมอ (แคชถาวร) เจอแล้วไม่ยิง Google ซ้ำ
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  const live = req.nextUrl.searchParams.get("live") === "1";

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  if (supabaseConfigured) {
    const { data: cached } = await supabase
      .from("place_details_cache")
      .select("google_place_id, opening_hours, rating, user_rating_count, primary_type, reviews")
      .eq("maps_query", query)
      .maybeSingle();
    if (cached) {
      const result: PlaceDetailsResponse = {
        googlePlaceId: cached.google_place_id,
        openingHours: cached.opening_hours as GoogleOpeningHours | null,
        rating: cached.rating,
        userRatingCount: cached.user_rating_count,
        primaryType: cached.primary_type,
        reviews: cached.reviews as GoogleReview[] | null,
        currentOpeningHours: live ? await fetchCurrentOpeningHoursLive(query) : undefined,
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

  if (supabaseConfigured && googlePlaceId) {
    await supabase.from("place_details_cache").upsert({
      maps_query: query,
      google_place_id: googlePlaceId,
      opening_hours: openingHours,
      rating,
      user_rating_count: userRatingCount,
      primary_type: primaryType,
      reviews,
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
  };
  return NextResponse.json(result);
}
