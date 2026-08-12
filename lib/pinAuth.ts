import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ด่าน PIN ของทั้งเว็บ (เฟส 13.5) — กันคนที่บังเอิญเจอ URL เข้ามาแก้แผน และกันบิล Google จากการยิง /api/*
 *
 * ⚠️ ขอบเขตที่กันได้จริง: หน้าเว็บ + API route ของเราเท่านั้น
 * **ไม่ได้กัน Supabase** เพราะ browser คุยกับ Supabase ตรงๆ ด้วย anon key ที่ติดอยู่ในบันเดิล
 * ใครที่ดึง key ออกจากไฟล์ JS ได้ยังยิง REST API ของ Supabase ตรงได้อยู่ (พิสูจน์แล้วด้วย curl 11 ส.ค. 2026)
 * การปิดรูนั้นต้องใช้ Supabase Auth + แก้ RLS ทั้ง 49 policy ซึ่งยังไม่ได้ทำ
 */

export const PIN_COOKIE = "trip_pin";

/** 90 วัน — ยาวพอให้กรอกครั้งเดียวแล้วใช้ยาวจนจบทริป ไม่ต้องมากรอกซ้ำตอนยืนอยู่กลางถนนที่โซล */
export const PIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * ค่าที่ควรอยู่ใน cookie = HMAC(secret, pin)
 *
 * ห้ามเก็บ cookie เป็นแค่ธง `authed=1` เพราะใครก็ตั้งเองในเบราว์เซอร์ได้ แล้วด่านนี้ไร้ความหมายทันที
 * ห้ามเก็บเป็น sha256(pin) เฉยๆ เพราะ PIN 4 หลักมีแค่ 10,000 ค่า ไล่ทำตารางแฮชได้ในไม่กี่วินาที
 * ต้องมี secret ฝั่งเซิร์ฟเวอร์มาผสมเสมอ ค่าที่ได้ถึงจะเดาไม่ได้
 *
 * คืน null เมื่อยังไม่ได้ตั้ง env — ผู้เรียกต้องตัดสินใจเองว่าจะปล่อยผ่านหรือบล็อก (ดู proxy.ts)
 */
export function expectedPinToken(): string | null {
  const pin = process.env.TRIP_PIN;
  const secret = process.env.TRIP_PIN_SECRET;
  if (!pin || !secret) return null;
  return createHmac("sha256", secret).update(pin).digest("hex");
}

/** เทียบแบบ timing-safe — เทียบด้วย === ตรงๆ รั่วข้อมูลผ่านเวลาที่ใช้เทียบทีละไบต์ */
export function pinTokenMatches(cookieValue: string | undefined): boolean {
  const expected = expectedPinToken();
  if (!expected || !cookieValue) return false;

  const a = Buffer.from(cookieValue, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual โยน error ถ้าความยาวไม่เท่ากัน จึงต้องกันก่อน (ความยาวไม่ใช่ความลับอยู่แล้ว)
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** ตรวจ PIN ที่ผู้ใช้กรอกมา — เทียบแบบ timing-safe เหมือนกัน */
export function pinIsCorrect(input: string): boolean {
  const pin = process.env.TRIP_PIN;
  if (!pin) return false;

  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(pin, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
