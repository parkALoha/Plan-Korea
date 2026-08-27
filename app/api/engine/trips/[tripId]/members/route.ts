import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { tripMembers } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * สมาชิกของทริป — `E5` · เจ้าของ: P1-Lead · 27 ส.ค. 2026
 *
 * ตัวป้อนแถว avatar ใน `TripHeader` (P2) · `profiles` ไม่มีคอลัมน์รูป → UI แสดง **ตัวย่อชื่อ**
 *
 * 🔴 **คนนอกทริปได้ `[]` ไม่ใช่ `403` — และเป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง**
 * RLS สองชั้นกรองให้อยู่แล้ว (`trip_members_select` → `app.can_read_trip` · `profiles_select`
 * → `app.shares_trip_with`) · เพิ่ม guard ที่นี่ = แหล่งความจริงที่สองเรื่อง "ใครอ่านได้"
 * ที่ต้องคอยให้ตรงกับ policy ตลอดไป (`P-15`) · **และ `403` จะกลายเป็นเครื่องมือถามว่าทริปนี้มีอยู่ไหม**
 * ⚠️ ทุกทริปมีเจ้าของ ≥1 เสมอ → **`[]` แปลว่า "คุณไม่ใช่สมาชิก" ไม่ใช่ "ทริปนี้ไม่มีคน"**
 *
 * ⚠️ **ไม่มี `POST`/`DELETE` ที่นี่โดยตั้งใจ** — เพิ่ม/ถอนสมาชิกคือ `M2-INV` ซึ่งถูกกั้นด้วย `D26`
 * (ต้องปิด `D12` ฝั่งโค้ด + ขยับพ้น Hobby ก่อน) · **route นี้อ่านอย่างเดียวจนกว่ามตินั้นจะเปลี่ยน**
 */
const RATE_LIMIT_PER_MINUTE = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  user_id: string;
  role: string;
  // PostgREST คืน embedded resource เป็น object เดี่ยวเมื่อความสัมพันธ์เป็น many-to-one
  profiles: { display_name: string | null } | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const limited = rateLimitGuard(req, "engine-trip-members", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  // ตรวจรูปก่อนถึงฐาน — `tripId` ผิดรูปจะได้ `22P02` ที่ผู้ใช้อ่านไม่รู้เรื่อง แทนที่จะเป็น 400
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });

  try {
    const db = await createServerSupabase();
    const { data, error } = await tripMembers(db, tripId);
    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "42501" ? 403 : 502 },
      );
    }
    const rows = (data ?? []) as unknown as Row[];
    return NextResponse.json(
      rows.map((r) => ({
        userId: r.user_id,
        role: r.role,
        // `null` ได้จริง — บัญชีที่สร้างจาก `createUser` ตรง ๆ ไม่มีแถวใน `profiles`
        displayName: r.profiles?.display_name ?? null,
      })),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายชื่อสมาชิกไม่ได้" },
      { status: 502 },
    );
  }
}
