import { NextRequest, NextResponse } from "next/server";
import { searchPlacesText } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// เพดานสูงเพราะหน้าแผนยิงเส้นนี้ทีละสถานที่ (~34 ครั้งต่อการเปิดหน้า 1 ครั้ง) — ดู rateLimitGuard
const RATE_LIMIT_PER_MINUTE = 300;

// ค้นหาสถานที่ด้วย Places API (New) แล้วคืน "ชื่อรูป" (ไม่ใช่ URL จริง)
// กันไม่ให้ Google API key หลุดไปฝั่ง browser
//
// เช็ค place_photo_cache ใน Supabase ก่อนเสมอ (แคชถาวร ข้าม reload/ข้ามคน) — เจอแล้วไม่ต้องยิง
// Google อีกเลย ต่อเมื่อไม่เจอถึงจะเรียก Google แล้วเก็บผลไว้ในตารางนี้ต่อ
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-photos", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const query = req.nextUrl.searchParams.get("query");

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  if (supabaseConfigured) {
    const { data: cached } = await supabase
      .from("place_photo_cache")
      .select("photo_names")
      .eq("maps_query", query)
      .maybeSingle();
    if (cached) {
      return NextResponse.json({
        photos: (cached.photo_names as string[]).map(
          (name) => `/api/place-photo?name=${encodeURIComponent(name)}`
        ),
      });
    }
  }

  const { places, error } = await searchPlacesText(query, "places.photos");
  if (error) {
    return NextResponse.json({ photos: [], error });
  }

  const photoNames: string[] = places[0]?.photos?.slice(0, 6).map((p) => p.name) ?? [];

  if (supabaseConfigured && photoNames.length > 0) {
    await supabase.from("place_photo_cache").upsert({
      maps_query: query,
      photo_names: photoNames,
      fetched_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    photos: photoNames.map(
      (name) => `/api/place-photo?name=${encodeURIComponent(name)}`
    ),
  });
}
