import { describe, expect, it } from "vitest";
import { resolvePlace } from "@/lib/resolvePlace";
import { PLACES } from "@/data/places";
import type { Place } from "@/data/places";

/**
 * `resolvePlace(id, { customPlaces, catalog })` — `E6-AC13` ก้าวที่ 2 · P3 · 2 ก.ย. 2026
 *
 * ## 🔴 สิ่งที่เคสชุดนี้ตรึง และสิ่งที่มัน **ยังไม่** ตรึง
 * ✅ สถานที่จากคลังที่ *ไม่* อยู่ใน `PLACES` resolve ได้ (ก่อนหน้านี้คืน `null` เสมอ)
 * ✅ คีย์จาก prototype ตกลง `null` ไม่ใช่คืนของจาก `Object.prototype`
 * ❌ **ยังไม่ตรึงว่าคลังชนะ `PLACES`** — วันนี้สถิตย์ยังมาก่อน · การสลับรอมติ P1
 *    (เหตุผลอยู่หัว `lib/resolvePlace.ts`) · **เคส ③ ข้างล่างจะต้องกลับด้านตอนสลับ ไม่ใช่ถูกลบ**
 */
const catalogPlace = (id: string): Place => ({
  id,
  nameTh: `คลัง-${id}`,
  nameEn: id,
  city: "tokyo",
  category: "onsen",
  descriptionTh: "",
  lat: 35.6,
  lng: 139.7,
  mapsQuery: id,
  youtubeQuery: id,
});

describe("resolvePlace — side-map จากคลัง", () => {
  it("① 🔴 สถานที่คลังที่ไม่อยู่ใน PLACES resolve ได้ — ก่อนหน้านี้คืน null เสมอ", () => {
    const id = "tokyo-senso-ji";
    // เคสควบคุม: ยืนยันก่อนว่ามันไม่ได้อยู่ใน PLACES จริง ไม่งั้นเคสนี้วัดอย่างอื่น
    expect(PLACES.some((p) => p.id === id), "id นี้ดันอยู่ใน PLACES — เคสกำลังวัดผิดเรื่อง").toBe(false);
    expect(resolvePlace(id, { customPlaces: [] }), "ไม่มี catalog ต้องยังคืน null เหมือนเดิม").toBeNull();
    expect(resolvePlace(id, { customPlaces: [], catalog: { [id]: catalogPlace(id) } })?.nameTh).toBe(
      "คลัง-tokyo-senso-ji"
    );
  });

  it("② catalog ที่ไม่มีคีย์นั้น → ยังตกไปทางเดิม ไม่ใช่โยน", () => {
    expect(resolvePlace("ไม่มีอยู่จริง", { customPlaces: [], catalog: {} })).toBeNull();
    expect(resolvePlace("ไม่มีอยู่จริง", { customPlaces: [] })).toBeNull();
  });

  /**
   * 🔴 **เคสนี้ *กลับด้าน* เมื่อ 2 ก.ย. 2026 — ไม่ได้ถูกลบ** และนั่นคือทั้งหมดที่มันมีไว้ทำ
   * ```
   * ก่อน  id ที่ทับกัน → ได้ของจาก PLACES(สถิตย์)
   * หลัง  id ที่ทับกัน → ได้ของจากคลัง
   * ```
   * ตอนเขียนครั้งแรก เคสนี้ตรึง **สภาพที่เรารู้ว่าจะเปลี่ยน** เพื่อบังคับให้คนสลับต้องมาแตะมัน —
   * เพราะเงื่อนไขของการสลับ **อยู่นอกโค้ดทั้งใบ** (migration `20260902090000` ต้องลงฐานก่อน
   * ไม่งั้น `youtube_query` ของ 71 แห่งตกไปที่ชื่อเปล่า) · **ไม่มีบรรทัดไหนในรีโปที่แดงแทนได้**
   * · ✅ มันทำงานตามที่ตั้งใจ: การสลับทำให้เคสนี้แดง → คนสลับต้องอ่านว่าทำไม → เจอเงื่อนไข
   *
   * ## หลักฐานสามชั้นที่ทำให้สลับได้ — **คนละคำถาม ไม่ใช่การยืนยันซ้ำ**
   * · P3 วัดจาก migration ว่า *ใส่อะไรลงไป* (7 ช่อง · 5 ครบอยู่แล้ว + 2 เติมใหม่)
   * · P1 อ่านค่ากลับ *จากฐานจริง* (72/72 มี `youtube_query` · 3/3 มี `google_place_id`)
   * · P2 เทียบชื่อ *จากหน้าจอจริง* ก่อนสลับ (53 slug · ต่างกัน 0 · อีก 3 มาจากขั้น `transfer` ที่ไม่ได้ย้าย)
   * 🎯 **ชั้นที่สามจับสิ่งที่สองชั้นแรกจับไม่ได้** — *ผู้ใช้เห็นอะไร* ต่างจาก *ฐานมีอะไร*
   */
  it("③ คลังชนะไฟล์สถิตย์เมื่อ id ทับกัน", () => {
    const known = PLACES[0];
    const shadow = { ...catalogPlace(known.id), nameTh: "ของจากคลัง" };
    expect(resolvePlace(known.id, { customPlaces: [], catalog: { [known.id]: shadow } })?.nameTh).toBe(
      "ของจากคลัง"
    );
  });

  /**
   * 🔴 **และไฟล์สถิตย์ต้องยัง *รับ* ได้เมื่อคลังเงียบ — นี่คือเหตุผลหลักของลำดับนี้**
   * `places: {}` เกิดจริงเมื่อคิวรีคลังฝั่งเซิร์ฟเวอร์ล้ม (route คืนจุดแวะครบ + `console.error`)
   * · ถ้าเคสนี้แดง แปลว่า **คลังล่มหนึ่งครั้ง = ทริปเกาหลีเสียชื่อสถานที่ทั้ง 72 แห่ง**
   */
  it("③b คลังเงียบ → ยังตกไปที่ไฟล์สถิตย์ ไม่ใช่ `null`", () => {
    const known = PLACES[0];
    expect(resolvePlace(known.id, { customPlaces: [], catalog: {} })?.nameTh).toBe(known.nameTh);
    expect(resolvePlace(known.id, { customPlaces: [] })?.nameTh).toBe(known.nameTh);
  });

  it("④ 🔴 คีย์จาก prototype ต้องไม่คืนของจาก Object.prototype", () => {
    // `catalog["constructor"]` เป็นฟังก์ชัน = truthy → ถ้า index ตรง ๆ จะได้ Place ปลอมที่ไม่ใช่ Place
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(resolvePlace(key, { customPlaces: [], catalog: {} }), key).toBeNull();
    }
  });

  it("⑤ เคสควบคุม — ตัวค้นคลังต้องทำงานจริง ไม่ใช่คืน null เสมอ", () => {
    const c = { "x-1": catalogPlace("x-1") };
    expect(resolvePlace("x-1", { customPlaces: [], catalog: c })).not.toBeNull();
  });
});
