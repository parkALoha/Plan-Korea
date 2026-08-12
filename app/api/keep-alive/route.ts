import { NextRequest, NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/rateLimit";

// เรียกจริงแค่วันละครั้งจาก Vercel Cron — เพดานนี้กันคนอื่นยิงรัวใส่ ไม่ได้กันการใช้งานปกติ
const RATE_LIMIT_PER_MINUTE = 5;

/**
 * กันโปรเจกต์ Supabase หลับ (เฟส 25)
 *
 * Supabase free tier **พักโปรเจกต์เมื่อไม่มี request เลย 7 วันติด** แล้วเว็บจะเปิดไม่ขึ้นทั้งใบจนกว่า
 * จะเข้าไปกดปลุกใน Dashboard — จุดที่อันตรายที่สุดคือช่วงอยู่เกาหลีจริง ที่แก้ปัญหาลำบากที่สุด
 * route นี้แค่ยิง select เบาที่สุดเท่าที่ทำได้ (นับแถวใน trip_meta ซึ่งมีแถวเดียว) ให้ DB มี activity
 *
 * ⚠️ ต้องอยู่ใน PUBLIC_PATHS ของ proxy.ts ด้วย — cron ของ Vercel ไม่มีคุกกี้ PIN ถ้าไม่ยกเว้นไว้
 * จะโดนด่าน PIN ตอบ 401 **ก่อนแตะ Supabase** ผลคือ cron ขึ้นเขียวทุกวันแต่ DB หลับอยู่ดี
 */
export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "keep-alive", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  // Vercel แนบ `Authorization: Bearer $CRON_SECRET` มาให้เองเมื่อตั้ง env CRON_SECRET ไว้
  // ไม่ได้ตั้ง = ปล่อยผ่าน ด้วยเหตุผลเดียวกับด่าน PIN ใน proxy.ts: ถ้าบล็อกเมื่อไม่มี env
  // แล้วลืมตั้งบน Vercel จะกลายเป็น "cron เขียวทุกวันแต่ DB หลับ" ซึ่งพังเงียบและรู้ตัวตอนสาย
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  try {
    // ขอแค่จำนวนแถว ไม่เอาข้อมูลกลับมาเลย (Prefer: count) — เบาที่สุดและไม่หลุดข้อมูลทริปออกไป
    const res = await fetch(`${url}/rest/v1/trip_meta?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    }
    return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}
