import { describe, expect, it } from "vitest";
import { testClient } from "./_testClient";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { catalogKeyRows, cachedDetailKeys, cachedPhotoKeys, type Db } from "@/lib/engine/db";
import { warmTargets } from "@/lib/engine/cacheWarmList";

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
 * ## 🔴 `it.fails` ตรงนี้เพราะยังไม่มีตัวเขียน — ไม่ใช่การปิดตา (รูปเดียวกับ `cacheWritesAreServerOnly.test.ts`)
 * ยิงจริงบน `engine-dev` วันที่เขียนไฟล์นี้ (3 ก.ย. 2026): **141 คีย์ขาดใน `place_details_cache`**
 * (คลัง 202 · คีย์ที่แคชได้ 174 · อุ่นแล้ว 33 — ยังไม่มีตัวเขียนของ P1 เลย) → assertion นี้ **ต้องแดง
 * วันนี้** เพราะสภาพจริงเป็นแบบนี้จริง `it.fails` จึงรายงาน "ผ่าน" (แดงตามคาด ไม่ใช่แดงผิดที่)
 * 🎯 **วันที่ตัวเขียนของ P1 เสร็จและขาด=0 จริง `it.fails` จะกลายเป็น "ล้ม"** (assertion เริ่มผ่านโดยไม่คาด)
 * — นั่นคือสัญญาณให้เปลี่ยนกลับเป็น `it(...)` ธรรมดา **ไม่ใช่บั๊กของเทสต์นี้**
 * ⚠️ **ห้ามใส่ไฟล์นี้เข้า job ที่ต้องเขียวเสมอ** (เช่น `rls` ใน `ci.yml`) จนกว่าจะแปลงกลับเป็น `it`
 *    ปกติแล้วต้องมี creds (`RLS_MATRIX_REQUIRED=1`) ถึงจะรันจริง — ไม่มี creds = ข้าม (ดู `it` แรกด้านล่าง)
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

    // 🔴 it.fails ตั้งใจ — ดูคำอธิบายเต็มในหัวไฟล์ ("ยังไม่มีตัวเขียน") ก่อนแตะบรรทัดนี้
    it.fails("ต้องไม่มีคีย์ค้าง — ทั้ง place_details_cache และ place_photo_cache แยกกัน", async () => {
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

      expect(
        missingDetails.length,
        `${missingDetails.length} คีย์ยังไม่มีแถวใน place_details_cache — ตัวอุ่นอาจไม่ได้ทำงาน ` +
          `หรือมีคลังใหม่เข้ามาแล้วยังไม่ถูกอุ่น (ตัวอย่างคีย์: ${missingDetails.slice(0, 5).map((t) => t.key).join(", ")})`,
      ).toBe(0);
      expect(
        missingPhotos.length,
        `${missingPhotos.length} คีย์ยังไม่มีแถวใน place_photo_cache — ตัวอุ่นอาจไม่ได้ทำงาน ` +
          `หรือมีคลังใหม่เข้ามาแล้วยังไม่ถูกอุ่น (ตัวอย่างคีย์: ${missingPhotos.slice(0, 5).map((t) => t.key).join(", ")})`,
      ).toBe(0);
    });
  });
});
