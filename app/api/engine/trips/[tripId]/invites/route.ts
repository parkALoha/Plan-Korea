import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { createTripInvite, listTripInvites, revokeTripInvite } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ลิงก์ชวนเข้าทริป — `GET` (ดูรายการ) · `POST` (สร้าง) · `DELETE` (ยกเลิก)
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่ง (*"เชิญได้ หรือส่งลิงก์เชิญร่วมทริปนี้ได้"*)
 *
 * ## 🔴 ทั้งสามเมธอดเป็นของ **owner เท่านั้น** — ด่านอยู่ใน RPC ไม่ใช่ที่นี่
 * *อย่าเพิ่มการตรวจ role ซ้ำที่นี่* — สองที่ที่ต้องตรงกันคือรูปที่ทีมนี้โดนมาหลายรอบ
 *
 * ## 🔴 `POST` คืนโทเคนดิบ **ครั้งเดียว** — ห้าม log ห้ามเก็บ
 * ฐานเก็บแค่ `sha256` ⇒ หลังจากคำตอบนี้ **ไม่มีใครอ่านมันได้อีก รวมทั้งเจ้าของทริป**
 * ⇒ ฝั่ง UI ต้องแสดงให้ผู้ใช้คัดลอกทันที และบอกให้ชัดว่า *ปิดแล้วดูซ้ำไม่ได้*
 * · 🔴 **`Cache-Control: private, no-store` ไม่ใช่ของประดับ** — คำตอบนี้มีความลับอยู่ข้างใน
 *
 * ## ⚠️ `DELETE` รับ `?id=` เป็น query — **ต่างจาก `peek`/`redeem` ที่รับโทเคนทาง body โดยตั้งใจ**
 * `inviteId` ไม่ใช่ความลับ (ใช้อ้างอิงอย่างเดียว · ยกเลิกได้เฉพาะ owner)
 * ส่วน *โทเคน* เป็นความลับ ⇒ ห้ามอยู่ใน URL เพราะ URL ไปโผล่ใน log เซิร์ฟเวอร์ · ประวัติเบราว์เซอร์ · referrer
 * 🎯 ***ความต่างนี้ไม่ได้มาจากสไตล์ มันมาจากว่าค่านั้นเป็นความลับหรือเปล่า***
 */
const RATE_LIMIT_PER_MINUTE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** เพดานอายุลิงก์ — ต้องตรงกับ `create_trip_invite` ใน migration (`1..90`) */
const MAX_EXPIRES_DAYS = 90;

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-invites", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

function fromRpc(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  const msg = error.message ?? "";
  if (error.code === "P0002") {
    return NextResponse.json({ error: msg || "ไม่พบ", code: "NOT_FOUND" }, { status: 404 });
  }
  if (error.code === "22023") return NextResponse.json({ error: msg, code: "BAD_INPUT" }, { status: 400 });
  if (error.code === "42501") return NextResponse.json({ error: msg, code: "42501" }, { status: 403 });
  return NextResponse.json({ error: msg || "ทำรายการไม่สำเร็จ", code: error.code }, { status: 502 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const bad = await guard(req, tripId);
  if (bad) return bad;

  const db = await createServerSupabase();
  const { data, error } = await listTripInvites(db, tripId);
  const err = fromRpc(error);
  if (err) return err;
  // ⚠️ ไม่มีโทเคนหรือแฮชในนี้ — RPC ไม่คืนมาให้ตั้งแต่ต้น (ดู migration)
  return NextResponse.json(
    { invites: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const bad = await guard(req, tripId);
  if (bad) return bad;

  let body: { role?: unknown; expiresDays?: unknown; maxUses?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body ต้องเป็นอ็อบเจกต์" }, { status: 400 });
  }

  // 🔴 **ไม่มีค่าเริ่มต้นให้ `role`** — ตรงกับสคีมาโดยตั้งใจ
  //    *ค่าเริ่มต้นที่ไม่มีใครเลือก จะกลายเป็นสิ่งที่ทุกคนได้* · ผู้เรียกต้องตัดสินใจเอง
  if (body.role !== "editor" && body.role !== "viewer") {
    return NextResponse.json(
      { error: "ต้องระบุ role เป็น editor หรือ viewer", code: "BAD_INPUT" },
      { status: 400 },
    );
  }
  const days = body.expiresDays === undefined ? 7 : body.expiresDays;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_EXPIRES_DAYS) {
    return NextResponse.json(
      { error: `อายุลิงก์ต้องเป็นจำนวนเต็ม 1–${MAX_EXPIRES_DAYS} วัน`, code: "BAD_INPUT" },
      { status: 400 },
    );
  }
  // `null` = ใช้ได้ไม่จำกัดครั้ง (ยังจำกัดด้วยเวลาอยู่)
  const maxUses = body.maxUses === undefined || body.maxUses === null ? null : body.maxUses;
  if (maxUses !== null && (typeof maxUses !== "number" || !Number.isInteger(maxUses) || maxUses < 1)) {
    return NextResponse.json(
      { error: "maxUses ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป หรือไม่ส่งมาเลย", code: "BAD_INPUT" },
      { status: 400 },
    );
  }

  const db = await createServerSupabase();
  const { data, error } = await createTripInvite(db, tripId, body.role, days, maxUses);
  const err = fromRpc(error);
  if (err) return err;

  const row = (data ?? [])[0];
  if (!row) {
    return NextResponse.json({ error: "สร้างลิงก์ไม่สำเร็จ", code: "NO_ROW" }, { status: 502 });
  }
  // 🔴 `token` อยู่ในคำตอบนี้ **ครั้งเดียวเท่านั้น** — ห้าม log ที่ชั้นไหนก็ตาม
  return NextResponse.json(
    { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at, role: body.role },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const bad = await guard(req, tripId);
  if (bad) return bad;

  const inviteId = req.nextUrl.searchParams.get("id");
  if (!inviteId || !UUID.test(inviteId)) {
    return NextResponse.json({ error: "ต้องระบุ ?id= ของลิงก์", code: "BAD_INPUT" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { error } = await revokeTripInvite(db, inviteId);
  const err = fromRpc(error);
  if (err) return err;
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
