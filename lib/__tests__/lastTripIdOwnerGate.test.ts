import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านของ **`E6-AC14`** ฝั่งผู้เรียก — *`lastTripId` ต้องอ่านผ่าน `readOwnedCache` เท่านั้น*
 * เจ้าของ: P7-Mobile · 3 ก.ย. 2026
 *
 * ## ทำไมต้องเป็นด่าน ไม่ใช่คอมเมนต์
 * การเทียบใน `useActiveTripId` **อ่านแล้วดูเหมือนเทียบค่ากับตัวเอง** (สองฝั่งมาจากตราเดียวกัน)
 * → เป็นของที่คนหวังดี **ลบทิ้งเพราะดูไร้ประโยชน์** ได้ง่ายที่สุด
 * 🎯 **แต่กิ่งที่มันกันคือกิ่ง `null`**: ตราเป็น `null` = *ไม่รู้ว่าข้อมูลนี้ของใคร* → ไม่เสิร์ฟ (fail closed)
 * · เกิดจริงตอน: รอบแรกหลัง deploy · ผู้ใช้ล้าง `localStorage` มา · ยังไม่เคยผ่าน auth event
 * · 🔴 คอมเมนต์เตือนได้ **แต่ไม่แดง** — และของที่ไม่แดงจะหายไปสักวัน
 *
 * ## 🔴 ทำไมกฎเป็น *"ไม่มีข้อยกเว้น"* ทั้งที่กิ่งออนไลน์ปลอดภัยอยู่แล้ว
 * `resolveTripId` กรอง id ของเจ้าของคนก่อนออกให้อยู่แล้วเมื่อมี `trips` จากเซิร์ฟเวอร์
 * ⇒ ถ้าเรายอมให้เหลือ `readCache` ดิบไว้ *เฉพาะกิ่งนั้น* **ด่านจะต้องรู้ว่าจุดไหนได้รับอนุญาต = ต้องมีทะเบียน**
 * 🎯 ***กฎที่ไม่มีข้อยกเว้น ตรวจด้วยตาได้ · กฎที่มีข้อยกเว้นต้องมีคนดูแล*** — เลือกอย่างแรก
 *
 * ## ขอบ — เขียนไว้เพราะด่านนี้อ่านแข็งกว่าที่เป็นจริง
 * · ตรวจ **ข้อความในไฟล์** ไม่ได้รันโค้ด · เปลี่ยนชื่อคีย์เป็นตัวแปรอื่นแล้วเลี่ยงได้
 * · **กันคนที่เผลอ ไม่ได้กันคนที่ตั้งใจ** — เจตนาของด่านนี้คืออย่างแรก
 * · 🔴 **และมันไม่ได้พิสูจน์ว่าออฟไลน์ใช้งานได้จริง** — นั่นเป็นพฤติกรรม ต้องยิงในเบราว์เซอร์ (`E6-AC4`)
 */
const ROOT = resolve(__dirname, "..", "..");
const HOOK = "hooks/useActiveTripId.ts";
const KEY = "LAST_TRIP_ID_KEY";

function hookCode(): string {
  return stripTsComments(readFileSync(join(ROOT, HOOK), "utf8"));
}

/** จุดที่ *อ่าน* คีย์นี้ — แยกจากการ `writeCache`/`clearCache` ซึ่งไม่ใช่การเสิร์ฟข้อมูลให้ผู้ใช้ */
export function bareReads(code: string): string[] {
  return code.match(new RegExp(`\\breadCache\\s*(<[^>]*>)?\\s*\\(\\s*${KEY}`, "g")) ?? [];
}
export function ownedReads(code: string): string[] {
  return code.match(new RegExp(`\\breadOwnedCache\\s*(<[^>]*>)?\\s*\\(\\s*${KEY}`, "g")) ?? [];
}

describe("🔴 E6-AC14 — `lastTripId` อ่านผ่าน `readOwnedCache` เท่านั้น", () => {
  it("① ตัวสแกนต้องอ่านไฟล์ได้จริง — ไฟล์ว่าง/พาธผิด ทำให้ทุกเคสข้างล่างเขียวเปล่า", () => {
    const code = hookCode();
    expect(code.length).toBeGreaterThan(500);
    expect(code, `${HOOK} ต้องยังนิยาม ${KEY} — ถ้าเปลี่ยนชื่อ ด่านนี้ตรวจผิดของ`).toContain(KEY);
  });

  it("② เคสควบคุมฝั่งบวก — ตัวจับทั้งสองตัวต้องแยกของออกจากกันได้จริง", () => {
    expect(bareReads(`const a = readCache<string>(${KEY});`)).toHaveLength(1);
    expect(ownedReads(`const a = readOwnedCache<string>(${KEY}, owner);`)).toHaveLength(1);
    // 🔴 `readOwnedCache` มี `readCache` เป็นสตริงย่อยอยู่ข้างใน — ถ้าตัวจับแยกไม่ออก เคส ④ จะแดงตลอดกาล
    expect(bareReads(`const a = readOwnedCache<string>(${KEY}, owner);`)).toHaveLength(0);
  });

  it("③ เคสควบคุมฝั่งลบ — การ *เขียน*/*ล้าง* ต้องไม่ถูกนับว่าเป็นการอ่าน", () => {
    expect(bareReads(`writeCache(${KEY}, id); clearCache(${KEY});`)).toHaveLength(0);
    expect(ownedReads(`writeCache(${KEY}, id);`)).toHaveLength(0);
  });

  it("④ ไม่มีจุดไหนอ่าน `lastTripId` ด้วย `readCache` ดิบ", () => {
    expect(
      bareReads(hookCode()),
      "อ่าน `lastTripId` โดยไม่ผ่านด่านเจ้าของ = **เสิร์ฟ tripId ของเจ้าของคนก่อนให้คนที่เพิ่งล็อกอิน**\n" +
        "  🔴 กิ่งที่กันคือกิ่ง `null` (ไม่รู้ว่าข้อมูลของใคร → ไม่เสิร์ฟ) — ไม่ใช่ 'เทียบค่ากับตัวเอง'\n" +
        "  → ใช้ `readOwnedCache(LAST_TRIP_ID_KEY, readDeviceOwner())`\n" +
        "  · ห้ามเอา `viewerId` จาก `supabase.auth.getSession()` — วัดแล้ว: token หมด+ออฟไลน์ คืน `null`\n" +
        "    และใช้เวลา ~25 วินาที (ดูสัญญาของ `readOwnedCache`)"
    ).toEqual([]);
  });

  it("⑤ และต้องยังมีการอ่านเหลืออยู่จริง — ไม่ใช่ผ่านเพราะไม่มีใครอ่านคีย์นี้แล้ว", () => {
    expect(
      ownedReads(hookCode()).length,
      "ไม่เจอ `readOwnedCache(LAST_TRIP_ID_KEY …)` เลยสักจุด — เคส ④ กำลังตรวจความว่างเปล่า"
    ).toBeGreaterThan(0);
  });
});
