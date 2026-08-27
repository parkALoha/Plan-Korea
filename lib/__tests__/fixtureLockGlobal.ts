import { acquireFixtureLock, testClient, type FixtureLock } from "./_testClient";

/**
 * vitest `globalSetup` — จับ fixture lock **ครั้งเดียวต่อรอบ (per-run)** ไม่ใช่ต่อไฟล์ · (a) ของ `①b` (P1 อนุมัติ 27 ส.ค.)
 *
 * 🔴 `R11`/`P-68` คือ **cross-*session*** (สองเซสชัน seed รหัส `TEST_COUNTRY_CODES` เดียวกัน*พร้อมกัน*)
 *    · ไฟล์ในรอบเดียวกันมี stamp ต่างกัน **ไม่ชนกันเอง** (ก่อนมีล็อก ไฟล์สดรันขนานมาตลอดไม่เคยชน — P1 ยืนยัน)
 *    · ล็อกต่อไฟล์จึง **ล็อกเกินขอบเขต** → ไฟล์ที่รอล็อก > 30s (`hookTimeout`) = hook ตาย = **skip เงียบ** (`①b`)
 *    · ต่อรอบถือครั้งเดียว → ไม่มี within-run contention · แต่ยังกัน cross-session ครบตามที่ล็อกมีไว้กัน
 *
 * 🔴 TTL **900s** (ไม่ใช่ default 300) — (a) ถือล็อก *ตลอดรัน* ไม่ใช่แค่ช่วงชุดสด · P6 วัดรันเต็ม **192–212s** → TTL 300 เหลือ margin ~90s
 *    ตั้ง 900 เผื่อชุดโต · `timeoutMs` 600s — เซสชันอื่นที่รอเราตอนนี้รอ "ตลอดรัน" (ไม่ใช่แค่ช่วงสด) จึงต้องรอได้นานกว่า 240s เดิม
 *    (TTL เป็นพารามิเตอร์ไคลเอนต์ เปลี่ยนที่นี่ได้เลย · ไม่ใช่ migration — heartbeat ต่างหากที่ต้องรอ migration · P1)
 *    🔴 **ผลข้างเคียงที่รู้ตัวว่าจ่าย:** ถูกฆ่า (Ctrl-C) → teardown ไม่รัน → ล็อกค้างจน TTL = **900s (นานกว่าเดิม 3x)**
 *       จนกว่า heartbeat (`or held_by = p_holder` · acquire-or-extend) จะลง แล้วลด TTL เหลือ ~60s (P1 · migration ใหม่)
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
  lock = await acquireFixtureLock(admin, `run-${process.pid}-${Date.now()}`, { ttlSeconds: 900, timeoutMs: 600_000 });
}

export async function teardown(): Promise<void> {
  await lock?.release();
}
