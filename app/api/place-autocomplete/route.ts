import { NextRequest, NextResponse } from "next/server";
import { autocompletePlaces } from "@/lib/googlePlaces";
import { rateLimitGuard } from "@/lib/rateLimit";

const RATE_LIMIT_PER_MINUTE = 60;

// แนะนำสถานที่/โรงแรมตามที่พิมพ์ ผ่าน Places API (New) Autocomplete
// เรียกทุกครั้งที่พิมพ์ (debounce ฝั่ง client แล้ว) ไม่แคช เพราะผลลัพธ์ขึ้นกับ input ที่เปลี่ยนทุกตัวอักษร
// เส้นนี้เปิดสาธารณะและ Google คิดเงินต่อ request จึงต้องจำกัดต่อ IP กันโดนถล่ม
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "place-autocomplete", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const input = req.nextUrl.searchParams.get("input");
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!input || !input.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const bias = lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;
  const { suggestions, error } = await autocompletePlaces(input, bias);
  return NextResponse.json({ suggestions, error });
}
