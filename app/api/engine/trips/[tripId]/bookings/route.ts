import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { bookingsOfTrip, insertBooking, softDeleteBooking, updateBooking } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";
import type { TripBooking } from "@/lib/supabase";

/**
 * ตั๋ว/การจอง — `E3` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **`file_url` เดิม = `file_path` ใหม่** (`E2-AC13`) — route ส่ง **path** ไม่ใช่ URL
 * ฝั่ง UI เซ็นตอนแสดงด้วย `signStoredFile` · **เซ็นที่นี่ = URL หมดอายุระหว่างหน้าเปิดค้าง**
 *
 * 🔴 **`trip_day_id` เป็น uuid** — สะพาน `"d0"` อยู่ฝั่งไคลเอนต์เหมือน `day-settings`
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string; trip_day_id: string | null; category: string; title: string;
  date: string | null; time: string | null; confirmation_number: string | null;
  link: string | null; note: string | null; file_path: string | null; file_name: string | null;
  status: string; book_by_days_before: number | null; legacy_added_by: string | null;
  created_at: string; updated_at: string;
};

/** 🔴 `day_id` ที่คืนไปเป็น **uuid** — ไคลเอนต์แปลงเป็น `"d0"` เองด้วยสะพาน */
const toDto = (r: Row): TripBooking & { trip_day_id: string | null } => ({
  id: r.id, category: r.category as TripBooking["category"], title: r.title,
  day_id: r.trip_day_id, date: r.date, time: r.time,
  confirmation_number: r.confirmation_number, link: r.link, note: r.note,
  added_by: r.legacy_added_by, created_at: r.created_at, updated_at: r.updated_at,
  file_url: r.file_path, file_name: r.file_name,
  status: r.status as TripBooking["status"],
  book_by_days_before: r.book_by_days_before,
  trip_day_id: r.trip_day_id,
});

/** ช่องที่ grant เปิดให้เขียน — **ส่งช่องอื่นจะได้ `42501` ที่อ่านไม่ออกว่าช่องไหน** */
const WRITABLE: Record<string, string> = {
  tripDayId: "trip_day_id", category: "category", title: "title", date: "date", time: "time",
  confirmationNumber: "confirmation_number", link: "link", note: "note",
  fileUrl: "file_path", fileName: "file_name", status: "status",
  bookByDaysBefore: "book_by_days_before",
};

function toColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(WRITABLE)) if (k in body) out[col] = body[k];
  return out;
}

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-bookings", RATE_LIMIT_PER_MINUTE);
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
  const { data, error } = await bookingsOfTrip(db, tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(((data ?? []) as unknown as Row[]).map(toDto), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.title || !b.category) {
    return NextResponse.json({ error: "ต้องมี title · category" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await insertBooking(db, {
    ...toColumns(b), trip_id: tripId, legacy_added_by: b.addedBy ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json(toDto(data as unknown as Row), { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  const id = typeof b.id === "string" ? b.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const patch = toColumns(b);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await updateBooking(db, id, patch);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ใบจองนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const db = await createServerSupabase();
  const { error } = await softDeleteBooking(db, id);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
