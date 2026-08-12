import { NextRequest, NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/rateLimit";

// เพดานสูงสุดในบรรดา route ทั้งหมด — 1 request ต่อ 1 รูป และหน้าแผนมีรูปเกิน 200 ใบ
const RATE_LIMIT_PER_MINUTE = 400;

// สตรีมรูปจริงจาก Places API (New) โดยใส่ key ฝั่งเซิร์ฟเวอร์เท่านั้น
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-photo", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const name = req.nextUrl.searchParams.get("name");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!name || !apiKey) {
    return NextResponse.json({ error: "missing name or api key" }, { status: 400 });
  }

  const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${apiKey}`;
  // แคชฝั่งเซิร์ฟเวอร์ไว้ 30 วัน — รูปสถานที่ไม่เปลี่ยนบ่อย ลดจำนวนครั้งที่ดึงจาก Google
  const res = await fetch(url, { next: { revalidate: 2592000 } });

  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "photo fetch failed" }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      // s-maxage ให้ Vercel edge แคชรูปนี้ไว้ให้ทุกคนที่เข้าเว็บ ไม่ใช่แค่เบราว์เซอร์ตัวเอง
      "Cache-Control": "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400",
    },
  });
}
