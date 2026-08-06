import { NextRequest, NextResponse } from "next/server";
import { autocompletePlaces } from "@/lib/googlePlaces";

// แนะนำสถานที่/โรงแรมตามที่พิมพ์ ผ่าน Places API (New) Autocomplete
// เรียกทุกครั้งที่พิมพ์ (debounce ฝั่ง client แล้ว) ไม่แคช เพราะผลลัพธ์ขึ้นกับ input ที่เปลี่ยนทุกตัวอักษร
export async function GET(req: NextRequest) {
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
