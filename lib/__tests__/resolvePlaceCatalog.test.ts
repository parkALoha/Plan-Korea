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
   * 🔴 **เคสนี้ตรึงสภาพ *ชั่วคราว* ไม่ใช่สภาพที่ต้องการ**
   * `PLACES` มาก่อนคลัง → 72 id ที่ทับกันยังได้ของจากไฟล์สถิตย์
   * · ตอนสลับ **เคสนี้ต้องกลับด้าน (คาดว่าได้ของจากคลัง) ไม่ใช่ถูกลบทิ้ง**
   * · เขียนไว้เพื่อให้การสลับเป็นการกระทำที่ *มองเห็น* — ไม่ใช่พฤติกรรมที่เปลี่ยนโดยไม่มีใครสังเกต
   *
   * ## 🔴 เงื่อนไขของการสลับ **อยู่นอกโค้ด** — และนี่คือจุดเดียวที่คนสลับจะสะดุด
   * P1 อนุมัติลำดับ `catalog → transfer → hotel → custom → PLACES` แล้ว (2 ก.ย. 2026)
   * **แต่สลับได้ต่อเมื่อ migration `20260902090000_e6_catalog_youtube_query` ลงฐานแล้วเท่านั้น**
   * ```
   * data/places.ts   youtubeQuery มี 72/72 · **71 ตัวต่างจาก `nameEn`** (วัดแล้ว — เหมือนแค่
   *                  "Starfield Library Suwon" ตัวเดียว) · เป็นคำค้นปรับมือ: ชื่อเมือง · บริบท · ปี
   * catalog          youtube_query = null ทุกแถว (คอลัมน์ถูก `add` ที่ 20260825231932 แล้วไม่มีใคร seed)
   * ```
   * → สลับก่อน migration ลง = `cardToPlace` ตกไป `?? nameEn` → **`PlaceDetailModal` ฝังวิดีโอด้วย
   *   ชื่อเปล่าสำหรับ 71 สถานที่ และไม่มีอะไรฟ้องเลยสักที่**
   * 🎯 **ตระกูล *"สภาพแวดล้อมเดิมรับประกันอะไรให้ฟรี"* (`TEAM.md §3.4`)** — ไฟล์สถิตย์ให้คำค้นที่
   *    ปรับมือมาฟรี **และไม่มีบรรทัดไหนในโค้ดพูดถึงมัน จึงไม่มีอะไรให้รีวิวเห็น**
   * · 📌 `googlePlaceId` ก็ยังขาด (static 3/72 · คลัง 0) แต่ `?? null` เป็นพฤติกรรมที่ `lib/placeQuery.ts`
   *   รองรับอยู่แล้ว (ตกไปค้นด้วยชื่อ) — **เสียน้อยกว่ามาก และไม่บล็อกการสลับ**
   */
  it("③ วันนี้ PLACES ยังมาก่อนคลัง — id ที่ทับกันได้ของจากไฟล์สถิตย์", () => {
    const known = PLACES[0];
    const shadow = { ...catalogPlace(known.id), nameTh: "ของจากคลัง" };
    expect(resolvePlace(known.id, { customPlaces: [], catalog: { [known.id]: shadow } })?.nameTh).toBe(
      known.nameTh
    );
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
