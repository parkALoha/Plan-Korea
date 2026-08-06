import { NextRequest, NextResponse } from "next/server";

// คำนวณเวลาเดินทาง (โหมดขนส่งสาธารณะ) ระหว่าง 2 จุด ผ่าน Distance Matrix API
// ใช้ key ฝั่งเซิร์ฟเวอร์เท่านั้น
export async function GET(req: NextRequest) {
  const originLat = req.nextUrl.searchParams.get("originLat");
  const originLng = req.nextUrl.searchParams.get("originLng");
  const destLat = req.nextUrl.searchParams.get("destLat");
  const destLng = req.nextUrl.searchParams.get("destLng");
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json({ error: "missing coordinates" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ durationText: null, error: "GOOGLE_MAPS_API_KEY not set" });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${originLat},${originLng}`);
  url.searchParams.set("destinations", `${destLat},${destLng}`);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("key", apiKey);

  // แคชผลลัพธ์ไว้ 30 วัน — พิกัดจุดต่างๆ ในทริปคงที่ ไม่ต้องคำนวณใหม่ทุกครั้ง
  const res = await fetch(url.toString(), { next: { revalidate: 2592000 } });
  if (!res.ok) {
    return NextResponse.json({ durationText: null, error: `distance matrix failed: ${res.status}` });
  }

  const data = await res.json();
  const element = data.rows?.[0]?.elements?.[0];

  if (element?.status !== "OK") {
    return NextResponse.json({ durationText: null });
  }

  return NextResponse.json({
    durationText: element.duration?.text ?? null,
    distanceText: element.distance?.text ?? null,
  });
}
