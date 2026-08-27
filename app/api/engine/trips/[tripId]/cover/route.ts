import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { removeTripCovers, setTripCoverPath, signTripCovers, tripCoverPath, uploadTripCover } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * รูปปกทริป — `E5-AC8` · เจ้าของ: P1-Lead · 27 ส.ค. 2026 · route ยิงข้ามตัวที่ 11
 *
 * `PUT` อัปโหลด/เปลี่ยน · `DELETE` เอาออก · **ไม่มี `GET`** — การอ่านเดินทางกับ
 * `GET /api/engine/trips` (เซ็นทีเดียวทั้งชุด) ไม่แยกยิงต่อทริป
 *
 * ## ลำดับใน `PUT` เขียนตามความเสียหายเมื่อพังกลางทาง ไม่ใช่ตามความสวย
 *   ① อัปโหลดไฟล์ใหม่ (ชื่อใหม่เสมอ ไม่ทับ) → ② ชี้ `cover_image_path` ไปที่ใหม่ → ③ ลบไฟล์เก่า
 * · พังหลัง ①: ไฟล์กำพร้า 1 ใบ **ผู้ใช้ไม่เห็นอะไรผิด** (path เดิมยังใช้ได้)
 * · พังหลัง ②: ไฟล์เก่ากำพร้า **รูปใหม่ขึ้นแล้ว** — ผู้ใช้ได้สิ่งที่ขอ
 * · 🔴 กลับลำดับ (ลบก่อน) เมื่อไหร่: พังกลางทาง = **ทริปชี้ไปไฟล์ที่ไม่มีอยู่** — รูปหายทั้งที่ผู้ใช้ไม่ได้ทำอะไร
 * · ⚠️ ไฟล์กำพร้าเป็นราคาที่ *เลือกจ่าย* — เก็บกวาดได้ทีหลังเสมอ · รูปที่หายต่อหน้าผู้ใช้เก็บกวาดไม่ได้
 *
 * ## สิทธิ์ — ไม่มีบรรทัดไหนตรวจเอง (`D38`)
 * upload → `trip_covers_insert` (`can_write_trip` จาก segment แรกของ path)
 * ชี้คอลัมน์ → `trips_update` (`trip_role = 'owner'`) + column grant
 * 🔴 **สองด่านนี้คนละเข้ม** — editor อัปโหลดไฟล์ *ได้* แต่ชี้คอลัมน์ *ไม่ได้* → ได้ 403 ที่ขั้น ②
 *    และไฟล์ที่เพิ่งอัปโหลดจะถูกเก็บกวาดในขั้นเดียวกัน (ดูโค้ด) — **เป็นผลของ policy ที่มีอยู่ ไม่ใช่ดีไซน์ใหม่**
 */
const RATE_LIMIT_PER_MINUTE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ตรงกับ `allowed_mime_types` ของบัคเก็ต — ที่นี่มีไว้ให้ข้อความอ่านรู้เรื่อง ด่านจริงอยู่ที่บัคเก็ต */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
/** ตรงกับ `file_size_limit` ของบัคเก็ต (5MB) — เหตุผลเดียวกับข้างบน */
const MAX_BYTES = 5 * 1024 * 1024;

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-trip-cover", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = MIME_EXT[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: `ชนิดไฟล์ต้องเป็น image/jpeg · image/png · image/webp (ส่งมา: ${contentType || "ไม่ระบุ"})` },
      { status: 415 },
    );
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return NextResponse.json({ error: "ไฟล์ว่างเปล่า" }, { status: 400 });
  if (body.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `ไฟล์ใหญ่เกิน 5MB (${(body.byteLength / 1024 / 1024).toFixed(1)}MB)` },
      { status: 413 },
    );
  }

  try {
    const db = await createServerSupabase();

    // path เดิมไว้เก็บกวาดขั้น ③ — อ่านก่อนเขียน · RLS กรองให้ (คนนอกทริปได้ null → FK ของจริงกันต่อ)
    const { data: current } = await tripCoverPath(db, tripId);

    // ชื่อไฟล์ใหม่เสมอ — upsert:false · เขียนทับ = ช่องให้พังกลางทางแล้วได้ไฟล์ครึ่งใบ
    const path = `${tripId}/cover-${Date.now()}.${ext}`;

    // ① อัปโหลด — `trip_covers_insert` ตัดสินตรงนี้
    const up = await uploadTripCover(db, path, body, contentType);
    if (up.error) {
      const msg = up.error.message ?? "อัปโหลดไม่สำเร็จ";
      // storage ตอบสิทธิ์ไม่พอเป็นข้อความ ไม่ใช่ code เสมอไป — จับทั้งสองทาง
      const denied = /denied|policy|row-level|violates/i.test(msg);
      return NextResponse.json({ error: msg }, { status: denied ? 403 : 502 });
    }

    // ② ชี้คอลัมน์ — `trips_update` (owner เท่านั้น) ตัดสินตรงนี้
    const { data: rows, error: setErr } = await setTripCoverPath(db, tripId, path);
    if (setErr || !rows || rows.length === 0) {
      // 🔴 อัปโหลดสำเร็จแต่ชี้ไม่สำเร็จ (เช่น editor · หรือทริปหายไประหว่างทาง)
      //    → เก็บกวาดไฟล์ที่เพิ่งวาง **แล้วรายงานความจริง** ไม่ปล่อยไฟล์กำพร้าพร้อม 403 เปล่า ๆ
      await removeTripCovers(db, [path]);
      if (setErr) return NextResponse.json({ error: setErr.message, code: setErr.code }, { status: setErr.code === "42501" ? 403 : 502 });
      return NextResponse.json(
        { error: "ตั้งรูปปกได้เฉพาะเจ้าของทริป (ไฟล์ที่อัปโหลดถูกเก็บกวาดแล้ว)" },
        { status: 403 },
      );
    }

    // ③ เก็บกวาดไฟล์เก่า — **หลังทุกอย่างสำเร็จเท่านั้น** · ล้มก็ไม่เป็นไร (กำพร้า ไม่ใช่หาย)
    if (current?.cover_image_path && current.cover_image_path !== path) {
      await removeTripCovers(db, [current.cover_image_path]);
    }

    // แนบ URL ที่เซ็นแล้วกลับไปด้วย (P4 เสนอ · P2 ได้ใช้) — UI แสดงรูปได้ทันทีโดยไม่ต้องโหลด
    // รายการทริปใหม่ทั้งชุด · และ probe fetch ได้เลย = พิสูจน์ว่าการเซ็นใช้ได้จริงในเคสเดียว
    // ⚠️ เซ็นล้ม **ไม่ทำให้ทั้งคำขอล้ม** — รูปตั้งสำเร็จแล้วจริง (path ชี้แล้ว) · คืน null แล้ว UI ใช้ fallback
    const signed = await signTripCovers(db, [path]).catch(() => new Map<string, string>());
    return NextResponse.json(
      { coverImagePath: path, coverImageUrl: signed.get(path) ?? null },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ตั้งรูปปกไม่ได้" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  try {
    const db = await createServerSupabase();
    const { data: current } = await tripCoverPath(db, tripId);

    // ล้างคอลัมน์ก่อน แล้วค่อยลบไฟล์ — ทิศเดียวกับ PUT: พังกลางทาง = ไฟล์กำพร้า ไม่ใช่ path ชี้ของที่หาย
    const { data: rows, error } = await setTripCoverPath(db, tripId, null);
    if (error || !rows || rows.length === 0) {
      if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
      return NextResponse.json({ error: "เอารูปปกออกได้เฉพาะเจ้าของทริป" }, { status: 403 });
    }
    if (current?.cover_image_path) await removeTripCovers(db, [current.cover_image_path]);

    return NextResponse.json({ coverImagePath: null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "เอารูปปกออกไม่ได้" },
      { status: 502 },
    );
  }
}
