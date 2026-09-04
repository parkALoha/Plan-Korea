import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { redeemTripInvite } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * กดรับคำเชิญ — `POST /api/engine/invites/redeem`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 **ต้องล็อกอินแล้ว** — ต่างจาก `peek` ที่อยู่ข้าง ๆ กัน
 * *"ดูว่าถูกชวนไปไหน"* ไม่ต้องมีตัวตน · *"เข้าไปเป็นสมาชิก"* **ต้องมีตัวตนที่จะผูกสิทธิ์ไว้ด้วย**
 * 🎯 ***สองเส้นนี้อยู่โฟลเดอร์เดียวกันแต่คนละระดับสิทธิ์ — เหมือน `[tripId]/pin` กับ `[tripId]` ที่เคยจดไว้***
 * · ⇒ **`redeem` ต้องไม่อยู่ใน `PUBLIC_PATHS`** · assert ใน migration บังคับว่า `anon` เรียก RPC ไม่ได้ด้วย
 *   (สองชั้น — ถ้าเผลอใส่เข้า `PUBLIC_PATHS` ชั้นที่สองยังกันอยู่)
 *
 * ## ⚠️ กดซ้ำได้ และไม่ทำอะไรเพิ่ม — **โดยตั้งใจ**
 * เป็นสมาชิกอยู่แล้ว → คืน `tripId` เฉย ๆ · **ไม่ลดสิทธิ์ ไม่นับใช้โควตา**
 * 🔴 ไม่มีข้อนี้ = เจ้าของกดลิงก์ `viewer` ของตัวเองแล้ว **กลายเป็น viewer ในทริปตัวเอง**
 *    ซึ่งเป็นการยกระดับสิทธิ์ *ย้อนกลับ* ที่หาไม่เจอจนกว่าจะมีคนบ่นว่าแก้ทริปไม่ได้ (วัดแล้วในสนามซ้อม)
 */
const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-invite-redeem", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  let body: { token?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (typeof body?.token !== "string" || !/^[0-9a-f]{64}$/.test(body.token)) {
    return NextResponse.json({ error: "ลิงก์นี้ใช้ไม่ได้", code: "NOT_FOUND" }, { status: 404 });
  }

  const db = await createServerSupabase();
  const { data, error } = await redeemTripInvite(db, body.token);
  if (error) {
    const msg = error.message ?? "";
    // 🔴 `P0002` ครอบหลายเหตุ (ไม่มีลิงก์ · ถูกยกเลิก · หมดอายุ · ใช้ครบ · ทริปถูกลบ)
    //    **ส่งข้อความของ RPC ต่อไปตรง ๆ** เพราะถึงตรงนี้ผู้เรียกพิสูจน์แล้วว่าถือโทเคนที่ถูกต้อง
    //    ⇒ บอกได้ว่า "หมดอายุ" ต่างจาก "ถูกยกเลิก" โดยไม่ได้ให้ข้อมูลกับคนที่เดาสุ่ม
    if (error.code === "P0002") {
      return NextResponse.json({ error: msg || "ลิงก์นี้ใช้ไม่ได้", code: "NOT_FOUND" }, { status: 404 });
    }
    if (error.code === "42501") return NextResponse.json({ error: msg, code: "42501" }, { status: 403 });
    return NextResponse.json({ error: msg || "กดรับไม่สำเร็จ", code: error.code }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, tripId: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
