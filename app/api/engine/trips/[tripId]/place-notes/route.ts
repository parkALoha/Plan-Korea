import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { catalogPlaceIdBySlug, placeNoteId, placeNotesOfPlan, softDeletePlaceNote, upsertPlaceNote } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * โน้ต/รูปที่ฝากไว้กับสถานที่ — `E3` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **สถานที่ชี้ได้สองทาง** (`catalog_place_id` หรือ `custom_place_id`) โดยมี `check` บังคับให้มีทางเดียว
 * · `placeId` ที่ไคลเอนต์ส่งมาเป็น **slug ของคลังกลาง** หรือ **id ของสถานที่ที่ผู้ใช้เพิ่มเอง**
 * · **แยกโดยลองคลังกลางก่อน แล้วค่อยถือว่าเป็นของทริป** — ไม่ใช่ดูจากรูปแบบสตริง
 *   🎯 **รูปแบบสตริงเดาผิดได้** (`custom-xxx` เป็นแค่ธรรมเนียม ไม่มีอะไรบังคับ) · การถามฐานไม่เดา
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlaceNoteDto = {
  plan_id: string;
  place_id: string;
  note: string | null;
  photo_url: string | null;
  updated_at: string;
};

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-place-notes", RATE_LIMIT_PER_MINUTE);
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

  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId || !UUID.test(planId)) {
    return NextResponse.json({ error: "planId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await placeNotesOfPlan(db, tripId, planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  type Row = {
    note: string | null; photo_path: string | null; updated_at: string;
    catalog_places: { legacy_slug: string | null } | null;
    custom_places: { id: string } | null;
  };
  const out: PlaceNoteDto[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    // 🔴 คลังกลางใช้ slug · ของทริปใช้ id ตรง ๆ (UI เก็บ id ของ custom place เป็น `place_id` อยู่แล้ว)
    const placeId = r.catalog_places?.legacy_slug ?? r.custom_places?.id;
    if (!placeId) continue; // สถานที่ที่ UI เดิมไม่รู้จัก — ข้าม ไม่ส่ง uuid ไปให้มันงง
    out.push({
      plan_id: planId,
      place_id: placeId,
      note: r.note,
      // ⚠️ `photo_path` → `photo_url` — ยังไม่เซ็นที่นี่ · ฝั่ง UI เซ็นตอนแสดงผ่าน `signStoredFile`
      //    เซ็นที่นี่ = URL หมดอายุระหว่างที่หน้าเปิดค้าง (`E2-AC13` ② เหตุผลเดียวกัน)
      photo_url: r.photo_path,
      updated_at: r.updated_at,
    });
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}

/** เขียนโน้ต — body `{ planId, placeId, note, photoUrl }` */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let body: { planId?: string; placeId?: string; note?: string | null; photoUrl?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!body.planId || !UUID.test(body.planId) || !body.placeId) {
    return NextResponse.json({ error: "planId/placeId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: cat, error: lookup } = await catalogPlaceIdBySlug(db, body.placeId);
  if (lookup) return NextResponse.json({ error: lookup.message }, { status: 502 });

  const { data, error } = await upsertPlaceNote(db, {
    tripId,
    planId: body.planId,
    catalogPlaceId: cat ? (cat.id as string) : null,
    // ไม่ใช่คลังกลาง → ถือว่าเป็นสถานที่ของทริป · **FK จะเป็นคนบอกถ้ามันไม่มีจริง**
    customPlaceId: cat ? null : body.placeId,
    note: body.note ?? null,
    photoPath: body.photoUrl ?? null,
  });

  if (error) {
    // `23503` = ไม่มีสถานที่นั้นทั้งสองคลัง — ข้อความของตัวเองดีกว่าปล่อยรหัส FK ดิบ
    if (error.code === "23503") {
      return NextResponse.json({ error: `ไม่รู้จักสถานที่ ${body.placeId}` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เขียนโน้ตในแผนนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/** ล้างโน้ต — `?planId=&placeId=` · **ผ่าน RPC soft delete ไม่ใช่ `DELETE` ตรง ๆ** (`E2-AC12`) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const planId = req.nextUrl.searchParams.get("planId");
  const placeId = req.nextUrl.searchParams.get("placeId");
  if (!planId || !UUID.test(planId) || !placeId) {
    return NextResponse.json({ error: "planId/placeId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: cat } = await catalogPlaceIdBySlug(db, placeId);
  const { data: found, error } = await placeNoteId(db, tripId, planId, {
    catalogId: cat ? (cat.id as string) : null,
    customId: cat ? null : placeId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  // ⚠️ ไม่มีโน้ตอยู่แล้ว = ผลลัพธ์ตรงกับที่ผู้ใช้ต้องการ → **สำเร็จ ไม่ใช่ error**
  //    (อีกเครื่องอาจเพิ่งล้างไป · เหตุผลเดียวกับ `allowNoRows` ของ `writeGuard`)
  if (!found) return NextResponse.json({ ok: true });

  const { error: delErr } = await softDeletePlaceNote(db, found.id as string);
  if (delErr) {
    const status = delErr.code === "42501" ? 403 : 502;
    return NextResponse.json({ error: delErr.message, code: delErr.code }, { status });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
