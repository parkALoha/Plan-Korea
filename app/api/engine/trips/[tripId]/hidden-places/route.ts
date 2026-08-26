import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { catalogPlaceIdBySlug, hiddenPlacesOfTrip, hidePlaceBySlug, unhidePlace } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * สถานที่ที่ซ่อนไว้ — `E3` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **ไคลเอนต์พูด *slug* เท่านั้น ไม่เคยเห็น `uuid` ของคลังเลย**
 * ต่างจาก `days` ที่สะพานอยู่ฝั่ง client (เพราะ `"d0"` มีอยู่แต่ในไฟล์ TS)
 * · **`legacy_slug` อยู่ในฐาน → เซิร์ฟเวอร์แปลงเองได้** และนั่นคือที่ที่มันควรอยู่
 * 🎯 **เลือกฝั่งตาม *ข้อมูลอยู่ที่ไหน* ไม่ใช่ตามความเคยชิน**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HiddenPlaceDto = { place_id: string; hidden_by: string | null; hidden_at: string };

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-hidden-places", RATE_LIMIT_PER_MINUTE);
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
  const { data, error } = await hiddenPlacesOfTrip(db, tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  type Row = { hidden_at: string; legacy_hidden_by: string | null; catalog_places: { legacy_slug: string | null } | null };
  const out: HiddenPlaceDto[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    // ⚠️ สถานที่ที่ไม่มี `legacy_slug` = เกิดบนแพลตฟอร์ม UI เดิมไม่รู้จัก → **ข้าม ไม่ใช่ส่ง uuid ไป**
    //    ส่ง uuid = UI จะเทียบกับ slug ของมันแล้วไม่ตรงตลอดกาล **โดยไม่มี error ที่ไหน**
    const slug = r.catalog_places?.legacy_slug;
    if (!slug) continue;
    out.push({ place_id: slug, hidden_by: r.legacy_hidden_by, hidden_at: r.hidden_at });
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}

/** ซ่อน — body `{ placeId: slug, hiddenBy?: string }` */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let body: { placeId?: string; hiddenBy?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!body.placeId) return NextResponse.json({ error: "ต้องมี placeId" }, { status: 400 });

  const db = await createServerSupabase();
  const { data: place, error: lookup } = await catalogPlaceIdBySlug(db, body.placeId);
  if (lookup) return NextResponse.json({ error: lookup.message }, { status: 502 });
  if (!place) {
    // 🔴 slug ที่คลังไม่รู้จักได้ข้อความของตัวเอง — ปล่อยให้ไปชน FK จะได้ `23503`
    //    ซึ่งอ่านไม่ออกว่าแปลว่า "ยังไม่มีสถานที่นี้ในคลัง"
    return NextResponse.json({ error: `คลังไม่รู้จักสถานที่ ${body.placeId}` }, { status: 400 });
  }

  const { data, error } = await hidePlaceBySlug(db, tripId, place.id as string, body.hiddenBy ?? null);
  if (error) {
    // `23505` = ซ่อนซ้ำ — ไม่ใช่ความล้มเหลวสำหรับผู้ใช้ ผลลัพธ์ตรงกับที่เขาต้องการอยู่แล้ว
    if (error.code === "23505") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ซ่อนสถานที่ในทริปนี้", code: "42501" }, { status: 403 });
  }
  // 🔴 เวลาจริงจาก `default now()` ฝั่งฐาน — `D7` ไคลเอนต์ห้ามปั้นเวลาเอง
  const hiddenAt = (data[0] as { hidden_at?: string }).hidden_at ?? null;
  return NextResponse.json({ ok: true, hiddenAt }, { headers: { "Cache-Control": "private, no-store" } });
}

/** เลิกซ่อน — `?placeId=<slug>` */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const slug = req.nextUrl.searchParams.get("placeId");
  if (!slug) return NextResponse.json({ error: "ต้องมี placeId" }, { status: 400 });

  const db = await createServerSupabase();
  const { data: place, error: lookup } = await catalogPlaceIdBySlug(db, slug);
  if (lookup) return NextResponse.json({ error: lookup.message }, { status: 502 });
  // ⚠️ คลังไม่รู้จัก slug นี้ = ไม่มีอะไรให้เลิกซ่อนอยู่แล้ว → **สำเร็จ ไม่ใช่ error**
  //    ผลลัพธ์ตรงกับที่ผู้ใช้ต้องการ · เหตุผลเดียวกับ `allowNoRows` ของ `writeGuard`
  if (!place) return NextResponse.json({ ok: true });

  const { error } = await unhidePlace(db, tripId, place.id as string);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  // 🔴 **0 แถวที่นี่ *ไม่ใช่* 42501** — เลิกซ่อนของที่ไม่ได้ซ่อนอยู่เป็นเรื่องปกติ (อีกเครื่องเพิ่งทำไป)
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
