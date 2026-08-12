import { NextRequest, NextResponse } from "next/server";
import { PIN_COOKIE, PIN_COOKIE_MAX_AGE, expectedPinToken, pinIsCorrect } from "@/lib/pinAuth";
import { rateLimitGuard } from "@/lib/rateLimit";

// เพดานต่ำที่สุดในเว็บโดยตั้งใจ — PIN 4 หลักมีแค่ 10,000 ค่า ถ้าปล่อยให้ยิงได้ไม่จำกัด
// สคริปต์ไล่เดาจนครบใช้เวลาไม่ถึงนาที · 10 ครั้ง/นาที = ไล่ครบต้องใช้เวลาราว 16 ชั่วโมง
// (ด่านนี้คือสิ่งเดียวที่ทำให้ PIN สั้นๆ พอใช้ได้จริง ห้ามถอดออก)
const RATE_LIMIT_PER_MINUTE = 10;

export async function POST(req: NextRequest) {
  const limited = rateLimitGuard(req, "unlock", RATE_LIMIT_PER_MINUTE);
  if (limited) {
    return NextResponse.json({ ok: false, error: "too-many" }, { status: 429 });
  }

  const token = expectedPinToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "not-configured" }, { status: 503 });
  }

  let pin = "";
  try {
    const body = await req.json();
    pin = typeof body?.pin === "string" ? body.pin : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }

  if (!pinIsCorrect(pin)) {
    return NextResponse.json({ ok: false, error: "wrong-pin" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PIN_COOKIE, token, {
    httpOnly: true, // อ่านจาก JS ไม่ได้ — กัน XSS ขโมย cookie ไปใช้ต่อ
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // dev เป็น http://localhost ถ้าตั้ง secure จะเซ็ตไม่ติด
    path: "/",
    maxAge: PIN_COOKIE_MAX_AGE,
  });
  return res;
}
