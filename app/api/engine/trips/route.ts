import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser } from "@/lib/auth/server";
import { tripsForUser } from "@/lib/engine/trip";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ทริปที่ผู้ใช้เห็นได้ — **route แบบ account-scoped** (P3 · `§14` ข้อ ①)
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **ไม่ซ้อนใต้ `trips/[tripId]`** เพราะมันคือคำถาม *"มีทริปอะไรบ้าง"* — ยังไม่รู้ id ตอนถาม
 * · ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * · **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — `trips_select` เป็นคนกรอง (`D38`/`P-15`)
 *
 * 📌 **คืน *รายการ* ไม่ใช่ *ทริปที่เลือกแล้ว*** — การเลือกเป็นกฎที่ `chooseSoleTrip()` ถือไว้
 * และฝั่ง client ใช้กฎตัวเดียวกันนั้น · **ถ้า route เลือกให้ ฝั่ง client จะไม่มีทางรู้ว่ามีหลายทริป**
 */
const RATE_LIMIT_PER_MINUTE = 120;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-trips", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    const db = await createServerSupabase();
    return NextResponse.json(await tripsForUser(db), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายการทริปไม่ได้" },
      { status: 502 }
    );
  }
}
