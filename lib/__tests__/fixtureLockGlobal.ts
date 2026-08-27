import { acquireFixtureLock, testClient, type FixtureLock } from "./_testClient";

/**
 * vitest `globalSetup` — จับ fixture lock **ครั้งเดียวต่อรอบ (per-run)** ไม่ใช่ต่อไฟล์ · (a) ของ `①b` (P1 อนุมัติ 27 ส.ค.)
 *
 * 🔴 `R11`/`P-68` คือ **cross-*session*** (สองเซสชัน seed รหัส `TEST_COUNTRY_CODES` เดียวกัน*พร้อมกัน*)
 *    · ไฟล์ในรอบเดียวกันมี stamp ต่างกัน **ไม่ชนกันเอง** (ก่อนมีล็อก ไฟล์สดรันขนานมาตลอดไม่เคยชน — P1 ยืนยัน)
 *    · ล็อกต่อไฟล์จึง **ล็อกเกินขอบเขต** → ไฟล์ที่รอล็อก > 30s (`hookTimeout`) = hook ตาย = **skip เงียบ** (`①b`)
 *    · ต่อรอบถือครั้งเดียว → ไม่มี within-run contention · แต่ยังกัน cross-session ครบตามที่ล็อกมีไว้กัน
 *
 * ⚠️ TTL 300s (default ของ `acquireFixtureLock`) · รอบนี้ถือ ~120s < 300s · margin หดจาก "หลายเท่า" เหลือ ~2.5x (P1 ②)
 *    🔴 **ถ้าชุดโต > ~250s ต้องขึ้น TTL พร้อมกัน หรือใช้ heartbeat** (`acquire-or-extend` · `or held_by = p_holder` · P1 · migration ใหม่)
 *    ไม่งั้นล็อกหมดอายุกลางรอบ → เซสชันอื่นแทรกได้ · `release` จะคืน `false` (จับล็อกหลุด) ดังให้เห็น
 * ⚠️ per-*run* ไม่ใช่ per-process — vitest แยก worker ต่อไฟล์ · ล็อกถือใน main · worker รันโดยไม่แตะล็อก · ปลดผ่าน `teardown` ที่คืนออกไป
 * 🔴 ฆ่า process กลางถือ = ล็อกค้างจน TTL (`teardown` ไม่รันถ้าถูกฆ่า) — **หน้าเดียวกับ fixture 890 ค้าง** · TTL คือ safety net เดียว
 *
 * 🎯 หลัง (a): **ห้ามมีไฟล์ไหนเรียก `acquireFixtureLock` ใน `beforeAll` อีก** — ด่าน source ใน `schemaPins.test.ts` บังคับ
 *    (ถ้าเหลือ ไฟล์นั้นจะรอล็อกที่ globalSetup ถือ → 30s hook timeout → skip เงียบ = "ย้ายไม่ครบ" ที่ P1 เตือน)
 */
let lock: FixtureLock | undefined;

export async function setup(): Promise<void> {
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!SERVICE || !URL_) return; // ไม่มี creds → live suite skip อยู่แล้ว → ไม่มีอะไรต้องล็อก
  const admin = testClient(SERVICE);
  // holder ระบุ *รอบ* ไม่ใช่ไฟล์ — `fixture_lock_holder()` จะบอกว่า *รอบไหน* ถือ (P1: ชื่อควรบอก "ใคร" ไม่ใช่แค่ "อะไร")
  lock = await acquireFixtureLock(admin, `run-${process.pid}-${Date.now()}`);
}

export async function teardown(): Promise<void> {
  await lock?.release();
}
