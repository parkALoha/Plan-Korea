import { NextRequest, NextResponse } from "next/server";

// Rate limit in-memory ง่ายๆ ต่อ IP — พอสำหรับ endpoint สาธารณะที่ไม่มี auth และคิดเงินต่อ request
// (ทริปนี้มีแค่ 2 คนใช้งานจริง ไม่ต้องพึ่ง Redis/Upstash) รีเซ็ตเองเมื่อ serverless instance ถูกรีไซเคิล ซึ่งรับได้
const buckets = new Map<string, { count: number; windowStart: number }>();

// กัน Map โตไม่จำกัดเมื่อโดนยิงด้วย IP หลายตัว (x-forwarded-for ปลอมได้) — เกินเพดานเมื่อไหร่ล้างทิ้งทั้งกระบิ
// ผลข้างเคียงคือคนที่กำลังโดน limit อยู่ได้เริ่มนับใหม่ ซึ่งรับได้เพราะนี่เป็นด่านคุมค่าใช้จ่าย ไม่ใช่ด่านความปลอดภัย
const MAX_BUCKETS = 5000;

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/**
 * ด่าน rate limit สำหรับ API route — คืน NextResponse 429 ถ้าเกินโควตา, คืน null ถ้าผ่าน
 * ใช้เป็นบรรทัดแรกของทุก route ที่ต่อตรงถึง Google (เฟส 13):
 *
 *   const limited = rateLimitGuard(req, "place-details", 300);
 *   if (limited) return limited;
 *
 * เพดานต่างกันตาม route เพราะบางเส้นถูกยิงเป็นชุดตอนเปิดหน้าเดียว (place-details/photos ยิงทีละสถานที่
 * รวม ~34 ครั้งต่อการเปิดหน้าแผน 1 ครั้ง) ตั้งต่ำไปจะ 429 ใส่การใช้งานปกติ
 */
export function rateLimitGuard(
  req: NextRequest,
  routeName: string,
  limitPerMinute: number
): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`${routeName}:${ip}`, limitPerMinute, 60_000)) {
    // 🔴 **ข้อความไทย — แก้ 27 ส.ค. 2026 (P2 พบตอนยิงจริง)**
    //    ฉบับเดิมคืน `"rate limited"` ซึ่งเป็น**อังกฤษที่เดียวในทั้ง route** ที่เหลือเป็นไทยหมด
    //    · ฟอร์มฝั่ง UI แสดง `error` ของ route ตรง ๆ → ผู้ใช้เห็นคำว่า `"rate limited"` บนหน้าจอ
    // 🎯 **ตัวนี้ไม่ได้ตั้งใจให้ผู้ใช้เห็น มันเลยไม่เคยถูกเขียนให้ผู้ใช้อ่าน** — จนมีคนต่อสายจริง
    // 📌 เพิ่ม `code` ด้วย ให้ฝั่งเรียกแยกกรณีได้โดยไม่ต้องอ่านข้อความ (รูปเดียวกับ error อื่นของ engine route)
    return NextResponse.json(
      { error: "ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่", code: "rate_limited" },
      { status: 429 },
    );
  }
  return null;
}
