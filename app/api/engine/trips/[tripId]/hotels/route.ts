import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import {
  cityIdBySlug, insertTripHotel, softDeleteTripHotel, tripHotelByRange, tripHotelsOfTrip,
} from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ที่พัก — `E3` · `D51` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **สคีมาใหม่ไม่มี `leg_id`** — `leg` เป็นค่าคำนวณจากวัน (`D51`)
 * ที่พักเก็บ `check_in`/`check_out` ของตัวเอง · **ไคลเอนต์ส่งช่วงวันมา ไม่ส่ง `leg_id`**
 * · `HotelLeg` ฝั่ง UI มี `startDate`/`endDate` อยู่แล้ว → **แมปตรงตัว ไม่ต้องมีสะพาน**
 * 🎯 **`D51` ออกแบบให้เป็นแบบนี้ตั้งแต่แรก — ผมแค่เดินตามทางที่วางไว้**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type HotelDto = {
  city: string;
  hotel_name: string;
  formatted_address: string | null;
  name_local: string | null; address_local: string | null;
  name_en: string | null; address_en: string | null; phone: string | null;
  lat: number; lng: number;
  check_in: string; check_out: string;
  updated_at: string;
};

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-hotels", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const db = await createServerSupabase();
  const { data, error } = await tripHotelsOfTrip(db, tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  type Row = Omit<HotelDto, "city"> & { id: string; city_id: string; catalog_cities: { legacy_slug: string | null } | null };
  const out: HotelDto[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    // ⚠️ เมืองที่ไม่มี `legacy_slug` = UI เดิมไม่รู้จัก → ข้าม **ไม่ส่ง uuid ไปให้มันเทียบไม่ตรง**
    const city = r.catalog_cities?.legacy_slug;
    if (!city) continue;
    out.push({
      city, hotel_name: r.hotel_name, formatted_address: r.formatted_address,
      name_local: r.name_local, address_local: r.address_local,
      name_en: r.name_en, address_en: r.address_en, phone: r.phone,
      lat: r.lat, lng: r.lng, check_in: r.check_in, check_out: r.check_out,
      updated_at: r.updated_at,
    });
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}

/** บันทึกที่พักของช่วงวันหนึ่ง — body มี `checkIn`/`checkOut` แทน `legId` */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }

  const checkIn = String(b.checkIn ?? "");
  const checkOut = String(b.checkOut ?? "");
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) {
    return NextResponse.json({ error: "ช่วงวันไม่ถูกต้อง" }, { status: 400 });
  }
  if (!b.city || !b.hotelName || typeof b.lat !== "number" || typeof b.lng !== "number") {
    return NextResponse.json({ error: "ต้องมี city · hotelName · lat · lng" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: city, error: cityErr } = await cityIdBySlug(db, String(b.city));
  if (cityErr) return NextResponse.json({ error: cityErr.message }, { status: 502 });
  if (!city) return NextResponse.json({ error: `ไม่รู้จักเมือง ${b.city}` }, { status: 400 });

  // 🔴 **`upsert` ใช้ไม่ได้** — ของที่กันการซ้อนคือ *exclusion constraint* ไม่ใช่ `unique`
  //    และ `on conflict` รองรับแต่ `unique`/`exclusion` ที่ระบุชื่อได้ ซึ่ง PostgREST ไม่เปิดให้
  //    → **ลบช่วงเดิมก่อน (soft delete) แล้วค่อยเขียนใหม่**
  //    ⚠️ ไม่อะตอมิก · ถ้าล้มระหว่างกลาง ผู้ใช้จะเห็นช่วงนั้นว่าง **ซึ่งดีกว่าเห็นที่พักผิด**
  const { data: existing } = await tripHotelByRange(db, tripId, checkIn, checkOut);
  if (existing) {
    const { error } = await softDeleteTripHotel(db, existing.id as string);
    if (error) {
      const status = error.code === "42501" ? 403 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
  }

  const { data, error } = await insertTripHotel(db, {
    trip_id: tripId, city_id: city.id, hotel_name: b.hotelName,
    formatted_address: b.formattedAddress ?? null,
    name_local: b.nameLocal ?? null, address_local: b.addressLocal ?? null,
    name_en: b.nameEn ?? null, address_en: b.addressEn ?? null, phone: b.phone ?? null,
    lat: b.lat, lng: b.lng, check_in: checkIn, check_out: checkOut,
    legacy_added_by: b.addedBy ?? null,
  });
  if (error) {
    // `23P01` = ชนกับช่วงของที่พักอื่น — ข้อความของตัวเองดีกว่ารหัสดิบ
    if (error.code === "23P01") {
      return NextResponse.json({ error: "ช่วงวันนี้ทับกับที่พักอื่นที่บันทึกไว้แล้ว" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์บันทึกที่พักในทริปนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/** ลบที่พักของช่วงวันหนึ่ง — `?checkIn=&checkOut=` */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const checkIn = req.nextUrl.searchParams.get("checkIn") ?? "";
  const checkOut = req.nextUrl.searchParams.get("checkOut") ?? "";
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return NextResponse.json({ error: "ช่วงวันไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: found, error } = await tripHotelByRange(db, tripId, checkIn, checkOut);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  // ไม่มีอยู่แล้ว = ผลลัพธ์ตรงกับที่ผู้ใช้ต้องการ
  if (!found) return NextResponse.json({ ok: true });

  const { error: delErr } = await softDeleteTripHotel(db, found.id as string);
  if (delErr) {
    return NextResponse.json({ error: delErr.message, code: delErr.code }, { status: delErr.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
