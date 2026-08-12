import { NextRequest, NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/rateLimit";

// ยิงตอนเปิดหน้าแผน วันละ 1 คำขอต่อเมือง (ไม่ใช่ต่อวัน) — 6 เมือง = ~6 ครั้งต่อการเปิดหน้า
const RATE_LIMIT_PER_MINUTE = 60;

/**
 * พยากรณ์อากาศรายวัน จาก Open-Meteo (เฟส 17)
 *
 * ทำไม Open-Meteo ไม่ใช่ Google Weather API: กติกาข้อ 3 ของโปรเจกต์นี้คือคีย์ Google เปิดไว้เฉพาะ
 * `places.googleapis.com` / `routes.googleapis.com` การใช้ Weather API ต้องไปเปิด API ตระกูลใหม่
 * ใน Cloud Console เพิ่ม · Open-Meteo ใช้ฟรี ไม่ต้องสมัคร ไม่ต้องมีคีย์ จึงไม่เพิ่มภาระให้ผู้ใช้เลย
 *
 * ⚠️ พยากรณ์ล่วงหน้าได้ ~16 วันเท่านั้น — ตอนวางแผนล่วงหน้าเป็นเดือน API จะคืนช่วงวันที่ขอไม่ครบ
 * (หรือไม่คืนเลย) ซึ่งเป็นเรื่องปกติ ไม่ใช่ error · ฝั่ง UI ต้องรับกรณี "ยังไม่มีข้อมูล" ได้เสมอ
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "weather", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  if (!lat || !lng || !start || !end) {
    return NextResponse.json({ error: "missing lat/lng/start/end" }, { status: 400 });
  }
  // กันพารามิเตอร์แปลกปลอมก่อนต่อสตริงเข้า URL ปลายทาง
  if (!/^-?\d+(\.\d+)?$/.test(lat) || !/^-?\d+(\.\d+)?$/.test(lng)) {
    return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "bad dates" }, { status: 400 });
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${start}&end_date=${end}`;

  try {
    // แคช 3 ชม. — พยากรณ์รายวันไม่ได้เปลี่ยนถี่กว่านี้ และกันไม่ให้ยิงซ้ำทุกครั้งที่รีเฟรชหน้า
    const res = await fetch(url, { next: { revalidate: 10800 } });
    if (!res.ok) {
      return NextResponse.json({ days: [], error: `weather failed: ${res.status}` });
    }
    const data = await res.json();
    const daily = data.daily ?? {};
    const dates: string[] = daily.time ?? [];
    const days = dates.map((date, i) => ({
      date,
      code: daily.weather_code?.[i] ?? null,
      tempMax: daily.temperature_2m_max?.[i] ?? null,
      tempMin: daily.temperature_2m_min?.[i] ?? null,
      rainChance: daily.precipitation_probability_max?.[i] ?? null,
    }));
    return NextResponse.json({ days, error: null });
  } catch {
    return NextResponse.json({ days: [], error: "weather request failed" });
  }
}
