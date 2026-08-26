import { NextRequest, NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/rateLimit";

// YouTube Data API มี quota ต่อวันจำกัด (ไม่ใช่แค่คิดเงินต่อ request) ตั้งเพดานต่ำสุดในบรรดา route ทั้งหมด
const RATE_LIMIT_PER_MINUTE = 30;

// หาคลิป YouTube ที่เกี่ยวข้องด้วย YouTube Data API v3 (ต้องเปิดใช้ "YouTube Data API v3"
// บน Google Cloud project เดียวกับ key อื่นๆ ได้) ใช้ key ฝั่งเซิร์ฟเวอร์เท่านั้น
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "youtube-video", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const query = req.nextUrl.searchParams.get("query");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ videoId: null, error: "GOOGLE_MAPS_API_KEY not set" });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);

  // แคชผลลัพธ์ไว้ 30 วัน — ลดจำนวนครั้งที่ยิง YouTube Data API (มี quota ต่อวันจำกัด)
  //
  // 🔴 `fetch` **โยน** เมื่อคำขอไปไม่ถึงปลายทาง (DNS · เน็ตขาด · timeout) ไม่ใช่คืน `res.ok = false`
  //    route นี้ตั้งใจคืน `200` พร้อม `{ videoId: null, error }` ทุกทางพลาด เพื่อให้ฝั่ง client
  //    แสดง "ไม่มีวิดีโอ" ได้เงียบ ๆ — **การโยนทำให้ได้ `500` ของ Next แทน ซึ่งพังสัญญานั้น**
  //    · รูปเดียวกับที่แก้ใน `lib/googlePlaces.ts` และ `lib/travelProvider.ts` (27 ส.ค. 2026)
  let res: Response;
  try {
    res = await fetch(url.toString(), { next: { revalidate: 2592000 } });
  } catch {
    return NextResponse.json({ videoId: null, error: "youtube ติดต่อไม่ได้" });
  }
  if (!res.ok) {
    return NextResponse.json({ videoId: null, error: `youtube search failed: ${res.status}` });
  }

  let data: { items?: { id?: { videoId?: string } }[] };
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ videoId: null, error: "youtube ตอบกลับไม่ใช่ JSON" });
  }
  const videoId: string | null = data.items?.[0]?.id?.videoId ?? null;

  return NextResponse.json({ videoId });
}
