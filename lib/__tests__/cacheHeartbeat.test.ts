import { describe, expect, it } from "vitest";
import { testClient } from "./_testClient";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { catalogKeyRows, cachedDetailKeys, cachedPhotoKeys, type Db } from "@/lib/engine/db";
import { warmTargets } from "@/lib/engine/cacheWarmList";

/**
 * 🔴 `??` เฉย ๆ ไม่พอ — GitHub Actions ตั้ง env จาก `workflow_dispatch` input ที่เว้นว่างไว้เป็น
 * **สตริงว่าง ไม่ใช่ `undefined`** → `Number("" ?? "141")` ได้ `0` ไม่ใช่ `141` (พิสูจน์แล้วก่อน commit)
 * เพดาน `0` ที่ไม่มีใครตั้งใจ = ด่านแดงทันทีโดยดูเหมือนเป็นบั๊กของโค้ด ไม่ใช่ของ config
 */
function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  return raw === "" ? fallback : Number(raw);
}

/**
 * `Q3` ก้าวที่ 2 — cache-heartbeat: **จำนวนคีย์ที่ยังไม่ได้อุ่น ต้องไม่ค้าง** · เจ้าของ: P6-DevOps (3 ก.ย. 2026)
 *
 * ## ทำไมวัด "คีย์ที่ขาด" ไม่ใช่ "แถวสดแค่ไหน" (`fetched_at`)
 * ตั้งใจแรกคือเทียบ `fetched_at` กับ TTL — แต่ P1 ตรวจแล้วพบว่า **ไม่มี TTL อยู่จริง**
 * (route ไม่เคยอ่าน `fetched_at` เลย · ตัวอุ่นเขียนด้วย `ON CONFLICT DO NOTHING` ไม่เคยทับของเดิม)
 * → แถวที่เขียนแล้วถูกเสิร์ฟตลอดกาล **พออุ่นครบ ตัวอุ่นจะไม่เขียนอะไรอีกเลย** ถ้าวัดความสดจะ
 * **แดงถาวรทั้งที่ทุกอย่างทำงานถูก** — ตระกูล "ด่านที่แดงใส่คนที่ทำถูก จะถูกลบทั้งใบ" ที่ทีมนี้จดไว้แล้ว
 *
 * 🎯 **ทางที่ใช้ได้วันนี้โดยไม่ต้องรอผู้ใช้ตัดสิน TTL:** วัด `warmTargets().length` ตรงๆ —
 * ฟังก์ชันเดียวกับที่ตัวอุ่นใช้เลือกว่าคีย์ไหนต้องอุ่น (`lib/engine/cacheWarmList.ts`)
 * ```
 * ขาด = 0        →  สุขภาพดี (ไม่ว่าจะเพิ่งอุ่นเสร็จหรือไม่มีอะไรใหม่มานาน)
 * ขาด > 0 ค้าง   →  มีคลังใหม่เข้ามาแล้วตัวอุ่นไม่ทำงาน
 * ```
 * ⚠️ **ข้อจำกัดที่ยอมรับไว้ตรงๆ:** เช็คนี้จับ "cron ตายในวันที่ไม่มีคลังใหม่" ไม่ได้ — วันนั้น
 * ขาด=0 อยู่แล้วไม่ว่า cron จะรันหรือไม่ก็ตาม **แต่กรณีนั้น GitHub ส่งอีเมลแจ้งเองอยู่แล้วเมื่อ
 * `cache-warm.yml` (scheduled run) ล้ม — สองด่านนี้ครอบคนละกรณี ไม่ใช่ด่านเดียวที่ต้องครอบทุกทาง**
 *
 * 🔴 **สองตารางแคช วัดแยกกัน ไม่รวมเป็นตัวเลขเดียว** — รูปเดียวกับที่ P4 เคยชี้ไว้กับ `E3-AC9`②
 * (`place ตัวเดียว = 5 + trip ตัวเดียว = 0 รวมเป็น 5 ผ่านสบาย → ITINERARY หายทั้งใบเงียบ`)
 * ถ้ารวม `missingDetails + missingPhotos` เป็นก้อนเดียว ตารางใดตารางหนึ่งพังสนิทแต่อีกใบปกติ
 * ยังผ่านได้ถ้าผลรวมบังเอิญต่ำ — แยก assert สองบรรทัดจึงจำเป็น ไม่ใช่แค่สไตล์
 *
 * ## 🔴 แก้ 3 ก.ย. 2026 (P1 ทัก) — เดิมห่อด้วย `it.fails` แล้วพบว่ามันทำให้ heartbeat ไม่มีอำนาจ
 * `it.fails` รายงาน "ผ่าน" เสมอไม่ว่าจะขาดกี่คีย์ — heartbeat จึงตอบคำถาม *"ตัวอุ่นทำงานอยู่ไหม"*
 * ด้วย "ใช่" ตลอดกาล จนกว่าจะมีคนแปลงกลับเอง **ทั้งที่ตอนนี้คือตอนที่ heartbeat มีค่าที่สุด** —
 * ถ้าคลังโตขึ้นระหว่างที่ยังไม่มีตัวเขียน เราอยากรู้ แต่ `it.fails` จะเงียบ
 *
 * ✅ **ใช้เพดาน + ตัวเตือนว่าเพดานล้าแทน — ได้ทั้งด่านจริงตั้งแต่วันนี้ และการพลิกตัวเองเมื่อขาด→0:**
 * ```
 * ① ขาด > เพดาน        →  แดงทันที (ด่านทำงานจริง ไม่ต้องรอตัวเขียนเสร็จ)
 * ② เพดาน − ขาด ใกล้ 0  →  แดง "เพดานล้า ลดได้แล้ว" (พลิกเองเมื่อตัวอุ่นเริ่มทำงาน — หน้าที่เดียวกับ it.fails เดิม)
 * ```
 * ## 🔴 แก้ 3 ก.ย. 2026 (P1 จับ) — ค่าตั้งต้นในไฟล์นี้ล้าไปแล้วครั้งหนึ่งจริง ไม่ใช่แค่ในทางทฤษฎี
 * รอบแรก default `141` ทั้งคู่ (สภาพวันที่เขียนไฟล์ ตัวอุ่นยังไม่เคยรัน) — ผมตั้งเพดานที่ถูกไว้ใน
 * `cache-heartbeat.yml` (`CACHE_MAX_MISSING_DETAILS=0`) แต่ **ลืมย้ายค่าจริงเข้ามาเป็น default ที่นี่ด้วย**
 * → หัว branch แดงทันทีสำหรับ **ทุกคนที่รัน `npm test` ตรงๆ** (ชุดเต็มก่อน push · CI job `verify` ·
 * ทุกเครื่อง) เพราะพวกนั้นไม่ผ่าน `cache-heartbeat.yml` เลย จึงไม่เห็น override — เจอกับตัวจาก P1
 *
 * 🎯 **บทเรียน: default ในไฟล์ควรเป็น *เป้าหมายสภาพคงตัว* ไม่ใช่ *ค่าที่วัดได้วันที่เขียนไฟล์*** —
 * เพราะ cron มีหน้าที่รักษาให้ขาด≈0/1 ตลอดไป ค่าตั้งต้นที่ถูกจึงไม่ใช่ตัวเลขที่ต้องไล่ตามทุกครั้งที่
 * ตัวอุ่นทำงาน แต่คือเป้าที่ระบบควรอยู่ที่นั่นเสมอเมื่อทุกอย่างทำงานถูก
 * ```
 * CACHE_MAX_MISSING_DETAILS = 0   (place_details_cache — วัดจริง 3 ก.ย. 2026: 174/174 อุ่นครบ)
 * CACHE_MAX_MISSING_PHOTOS  = 1   (place_photo_cache — 173/174 · 1 สถานที่ไม่มีรูปใน Google เลย
 *                                   ตัวอุ่นข้ามมันโดยตั้งใจ fail-closed แทนเขียน [] ที่แยกไม่ออกตอนอ่าน)
 * ```
 * `CACHE_MAX_MISSING_DETAILS`/`CACHE_MAX_MISSING_PHOTOS` ยังปรับได้จาก env โดยไม่ต้องแก้ไฟล์นี้
 * (`cache-heartbeat.yml` ตั้งค่าเดียวกันซ้ำไว้อย่างชัดเจน ไม่ใช่พึ่ง default เงียบๆ — ตั้งใจให้เห็นในไฟล์ workflow)
 *
 * ⚠️ **เลขทั้งสองยังต้องมีคนดูแล ไม่ใช่ค่าคงที่ตลอดกาล** — ถ้าเพิ่มคลังโดยตั้งใจ (เช่นเมืองใหม่)
 * ต้องขยับเพดานขึ้นชั่วคราวพร้อมกัน (ทั้งที่นี่และ `cache-heartbeat.yml`) ไม่งั้นด่านนี้จะแดงใส่คนที่ทำถูก
 * · ถ้า `_PHOTOS` ขึ้นเป็น `2` ให้เช็คว่าเป็น "คีย์ใหม่ที่ยังไม่ได้อุ่น" หรือ "สถานที่ไร้รูปเพิ่มอีกแห่ง"
 *   ด้วยการดูว่าคีย์ไหนเปลี่ยนจากรอบก่อน ไม่ใช่ดูแค่ตัวเลข (P1 เสนอ)
 * · **ช่วงเตือน (② ด้านบน) ตั้งไว้ที่ 20** — ค่าที่ P1 เลือกเอง ไม่ได้วัดจากอะไร ปรับได้ตามที่เห็นควร
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && SERVICE);

describe("Q3 ก้าวที่ 2 — cache-heartbeat", () => {
  it("ต้องมี creds จริงถึงจะวัดได้", () => {
    requireLiveCreds(hasCreds, "cache-heartbeat", ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  });

  describe.runIf(hasCreds)("จำนวนคีย์ที่ยังไม่ได้อุ่น", () => {
    // ✅ เคสควบคุมฝั่งบวก — พิสูจน์ว่า harness เชื่อมฐานได้จริง ไม่ได้ผ่านเพราะอ่านอะไรไม่ได้เลย
    it("อ่านคลังและตารางแคชได้ (ไม่ใช่ทุกอย่างคืน null)", async () => {
      const admin = testClient(SERVICE) as Db;
      const catalog = await catalogKeyRows(admin);
      const detailKeys = await cachedDetailKeys(admin);
      const photoKeys = await cachedPhotoKeys(admin);

      // 🔴 `null` = อ่านฐานไม่ได้ (ฐานล่ม/สิทธิ์หาย) ต้องแยกจาก "อ่านได้แต่ว่าง" เสมอ
      //    ผู้เรียกทุกตัว (db.ts) คืน null เมื่อล้ม ไม่ใช่ [] — ถ้าปนกัน วันที่ฐานล่มจะรายงานว่า "ขาด 0"
      expect(catalog, "อ่าน catalog_places ไม่ได้ — ฐานอาจล่ม ไม่ใช่คลังว่าง").not.toBeNull();
      expect(detailKeys, "อ่าน place_details_cache ไม่ได้").not.toBeNull();
      expect(photoKeys, "อ่าน place_photo_cache ไม่ได้").not.toBeNull();
    });

    it("ขาดไม่เกินเพดาน — ทั้ง place_details_cache และ place_photo_cache แยกกัน", async () => {
      const admin = testClient(SERVICE) as Db;
      const catalog = await catalogKeyRows(admin);
      const detailKeys = await cachedDetailKeys(admin);
      const photoKeys = await cachedPhotoKeys(admin);
      if (!catalog || !detailKeys || !photoKeys) {
        throw new Error("อ่านฐานไม่ได้ — ดูเคสควบคุมฝั่งบวกด้านบนว่าทำไม");
      }

      // 🔴 `catalogKeyRows()` คืนคอลัมน์ตามชื่อจริงในฐาน (snake_case) · `warmTargets()` รับ
      //    `CatalogKeyRow` (camelCase) — แปลงตรงนี้เพื่อไม่ให้สองฝั่งต้องรู้จักรูปของกันและกัน
      const rows = catalog.map((r) => ({
        id: r.id,
        mapsQuery: r.maps_query,
        googlePlaceId: r.google_place_id,
      }));

      const missingDetails = warmTargets({ catalog: rows, cachedKeys: detailKeys });
      const missingPhotos = warmTargets({ catalog: rows, cachedKeys: photoKeys });
      const maxDetails = envInt("CACHE_MAX_MISSING_DETAILS", 0);
      const maxPhotos = envInt("CACHE_MAX_MISSING_PHOTOS", 1);

      expect(
        missingDetails.length,
        `${missingDetails.length} คีย์ยังไม่มีแถวใน place_details_cache (เพดาน ${maxDetails}) — ` +
          `ตัวอุ่นอาจไม่ได้ทำงาน หรือมีคลังใหม่เข้ามาเกินที่คาด (ถ้าเพิ่มคลังโดยตั้งใจ ขยับ ` +
          `CACHE_MAX_MISSING_DETAILS ขึ้นพร้อมกัน) ตัวอย่างคีย์: ${missingDetails.slice(0, 5).map((t) => t.key).join(", ")}`,
      ).toBeLessThanOrEqual(maxDetails);
      expect(
        missingPhotos.length,
        `${missingPhotos.length} คีย์ยังไม่มีแถวใน place_photo_cache (เพดาน ${maxPhotos}) — ` +
          `ตัวอุ่นอาจไม่ได้ทำงาน หรือมีคลังใหม่เข้ามาเกินที่คาด (ถ้าเพิ่มคลังโดยตั้งใจ ขยับ ` +
          `CACHE_MAX_MISSING_PHOTOS ขึ้นพร้อมกัน) ตัวอย่างคีย์: ${missingPhotos.slice(0, 5).map((t) => t.key).join(", ")}`,
      ).toBeLessThanOrEqual(maxPhotos);

      // 🔴 ตัวเตือนว่าเพดานล้า — พลิกเองเมื่อขาดลดลงมาก (ตัวอุ่นเริ่มทำงาน) หน้าที่เดียวกับ `it.fails` เดิม
      //    ช่วง 20 เป็นค่าที่เลือกเอง ไม่ได้วัด — ปรับได้ ดูหัวไฟล์
      expect(
        maxDetails - missingDetails.length,
        `เพดาน place_details_cache (${maxDetails}) ห่างจากของจริง (${missingDetails.length}) เกิน 20 — ` +
          `ตัวอุ่นน่าจะเริ่มทำงานแล้ว ลดเพดานลงได้ (แก้ CACHE_MAX_MISSING_DETAILS ใน cache-heartbeat.yml)`,
      ).toBeLessThan(20);
      expect(
        maxPhotos - missingPhotos.length,
        `เพดาน place_photo_cache (${maxPhotos}) ห่างจากของจริง (${missingPhotos.length}) เกิน 20 — ` +
          `ตัวอุ่นน่าจะเริ่มทำงานแล้ว ลดเพดานลงได้ (แก้ CACHE_MAX_MISSING_PHOTOS ใน cache-heartbeat.yml)`,
      ).toBeLessThan(20);
    });
  });
});
