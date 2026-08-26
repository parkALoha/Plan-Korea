import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import {
  checklistOfTrip, insertChecklistItem, softDeleteChecklistItem, updateChecklistItem,
} from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";
import type { ChecklistItem } from "@/lib/supabase";

/**
 * ของที่ต้องเตรียม — `E3` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **`checked_by` ไม่ได้มาจากไคลเอนต์** — `stamp_checked_by` trigger เป็นคนเขียน (`P-56`)
 * grant เปิดให้แก้แค่ `text` · `category` · `is_checked` · **ใครติ๊กเป็นข้อเท็จจริงของเซิร์ฟเวอร์**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string; text: string; category: string; is_checked: boolean;
  legacy_checked_by: string | null; legacy_added_by: string | null;
  created_at: string; updated_at: string;
};

const toDto = (r: Row): ChecklistItem => ({
  id: r.id, text: r.text, is_checked: r.is_checked,
  checked_by: r.legacy_checked_by, added_by: r.legacy_added_by,
  created_at: r.created_at, updated_at: r.updated_at,
  category: r.category as ChecklistItem["category"],
});

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-checklist", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const db = await createServerSupabase();
  const { data, error } = await checklistOfTrip(db, tripId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(((data ?? []) as unknown as Row[]).map(toDto), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** เพิ่มรายการ — คืน**แถวที่สร้างแล้ว** เพราะ `id` มาจากฐาน ไคลเอนต์เดาไม่ได้ */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: { text?: string; category?: string; addedBy?: string | null };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.text?.trim() || !b.category) {
    return NextResponse.json({ error: "ต้องมี text · category" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await insertChecklistItem(db, {
    tripId, text: b.text.trim(), category: b.category, legacyAddedBy: b.addedBy ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json(toDto(data as unknown as Row), { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

/** ติ๊ก/แก้ข้อความ — `{ id, isChecked?, text?, category? }` */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: { id?: string; isChecked?: boolean; text?: string; category?: string };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.id || !UUID.test(b.id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  // ⚠️ **ส่งเฉพาะช่องที่ grant เปิดให้** — ส่งช่องอื่นจะได้ `42501` ที่อ่านไม่ออกว่าช่องไหน
  const patch: Record<string, unknown> = {};
  if (typeof b.isChecked === "boolean") patch.is_checked = b.isChecked;
  if (typeof b.text === "string") patch.text = b.text;
  if (typeof b.category === "string") patch.category = b.category;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await updateChecklistItem(db, b.id, patch);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  // 🔴 0 แถว = RLS กรองออก ไม่ใช่สำเร็จ
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้รายการนี้", code: "42501" }, { status: 403 });
  }
  // 🔴 คืน `updated_at` ของจริงกลับไป — `D7` ไคลเอนต์ห้ามปั้นเวลาเอง
  //    trigger ฝั่งฐานเป็นคนเขียน เครื่องที่นาฬิกาผิดจึงชนะ LWW ไม่ได้อีก
  const updatedAt = (data[0] as { updated_at?: string }).updated_at ?? null;
  return NextResponse.json({ ok: true, updatedAt }, { headers: { "Cache-Control": "private, no-store" } });
}

/** ลบ — soft delete ผ่าน RPC (`E2-AC12`) · `?id=` */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const db = await createServerSupabase();
  const { error } = await softDeleteChecklistItem(db, id);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
