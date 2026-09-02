import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * 🔴 **สิ่งที่ชุดนี้กัน — ไม่ใช่ "hash ทำงานไหม" แต่คือ *กัน enumerate ได้จริงไหม***
 * บั๊กต้นเรื่อง (`E3-AC6`): `travel_time_cache.from_place_id` ถือ `hotel@<lat>,<lng>` เป็นข้อความล้วน
 * → `D87` เปิด `select` ให้ผู้ใช้ทุกคนเมื่อไหร่ ใครก็อ่านพิกัดที่พักของคนอื่นได้ทันที
 *
 * 🎯 **เคสที่สำคัญที่สุดคือ "salt มีส่วนร่วมจริง"** — ถ้า implementation ลืมใส่ salt
 *    เคสอื่นทุกตัวยังเขียวหมด (คีย์ยังคงที่ · ยังไม่มีพิกัดในคีย์) **แต่ตารางจะ enumerate ได้**
 *    เพราะใครก็ `sha256("hotel@37.5,126.9")` เองแล้วเทียบได้ · เคสนั้นคือใบเดียวที่แยกสองสภาพนี้ออก
 */

const SALT_A = "0123456789abcdef0123";
const SALT_B = "fedcba9876543210fedc";
const HOTEL_ID = "hotel@37.55123,126.98765";

/** โมดูลอ่าน env ตอนเรียกฟังก์ชัน ไม่ใช่ตอน import — แต่ import สดทุกครั้งเพื่อไม่ให้ค่าค้างข้ามเคส */
async function load() {
  return await import("@/lib/engine/cacheKey");
}

describe("cacheKey — คีย์แคชต้องย้อนกลับไม่ได้ และเดาไม่ได้", () => {
  const original = process.env.TRAVEL_CACHE_KEY_SALT;

  beforeEach(() => {
    process.env.TRAVEL_CACHE_KEY_SALT = SALT_A;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TRAVEL_CACHE_KEY_SALT;
    else process.env.TRAVEL_CACHE_KEY_SALT = original;
  });

  it("คีย์เดิมได้ค่าเดิมเสมอ — ไม่งั้นแคชไม่เคย hit และเราจ่าย Google ทุกครั้ง", async () => {
    const { hashPlaceKey } = await load();
    expect(hashPlaceKey(HOTEL_ID)).toBe(hashPlaceKey(HOTEL_ID));
  });

  it("คีย์ต่างกันได้ค่าต่างกัน — ไม่งั้นเวลาเดินทางของคนละที่ปนกัน", async () => {
    const { hashPlaceKey } = await load();
    expect(hashPlaceKey(HOTEL_ID)).not.toBe(hashPlaceKey("hotel@37.55124,126.98765"));
  });

  it("🔴 ผลลัพธ์ต้องไม่มีเศษของค่าดิบเหลืออยู่เลย (พิกัด · คำว่า hotel · UUID)", async () => {
    const { hashPlaceKey } = await load();
    const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    for (const raw of [HOTEL_ID, uuid, "gyeongbokgung"]) {
      const key = hashPlaceKey(raw);
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(key).not.toContain(raw);
      for (const piece of raw.split(/[@,\-]/).filter((x) => x.length >= 4)) {
        expect(key, `เศษ "${piece}" ยังอยู่ในคีย์`).not.toContain(piece);
      }
    }
  });

  it("🔴 salt มีส่วนร่วมจริง — salt คนละตัวต้องได้คีย์คนละตัว", async () => {
    /**
     * **ใบเดียวที่แยก "hash แบบมี salt" ออกจาก "hash เปล่า" ได้**
     * hash เปล่าคำนวณซ้ำเองได้ → ต่อให้คีย์ดูสุ่ม ก็ยัง brute-force พิกัดทั้งเมืองมาเทียบได้
     * (พิกัด 5 ตำแหน่งในเขตเมืองเดียว ≈ หลักสิบล้านค่า — ไม่ใช่จำนวนที่กันใครได้)
     */
    const { hashPlaceKey } = await load();
    const withA = hashPlaceKey(HOTEL_ID);
    process.env.TRAVEL_CACHE_KEY_SALT = SALT_B;
    expect(hashPlaceKey(HOTEL_ID)).not.toBe(withA);
  });

  it("🔴 ไม่มี salt = ต้องดัง ไม่ใช่ถอยไปเขียนคีย์ดิบเงียบ ๆ", async () => {
    const { cacheKeySaltConfigured, hashPlaceKey } = await load();
    delete process.env.TRAVEL_CACHE_KEY_SALT;
    expect(cacheKeySaltConfigured()).toBe(false);
    expect(() => hashPlaceKey(HOTEL_ID)).toThrow(/TRAVEL_CACHE_KEY_SALT/);
  });

  it("🔴 salt สั้นเกินไปนับว่ายังไม่ได้ตั้ง — ค่าที่อ่อนแยกไม่ออกจากค่าที่แข็งถ้าไม่ตรวจความยาว", async () => {
    const { cacheKeySaltConfigured, hashPlaceKey } = await load();
    process.env.TRAVEL_CACHE_KEY_SALT = "salt";
    expect(cacheKeySaltConfigured()).toBe(false);
    expect(() => hashPlaceKey(HOTEL_ID)).toThrow();
  });

  it("salt ยาวพอ = ตั้งแล้ว", async () => {
    const { cacheKeySaltConfigured } = await load();
    expect(cacheKeySaltConfigured()).toBe(true);
  });
});
