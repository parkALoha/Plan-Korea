import type { DayBridge } from "./dayBridge";

/**
 * แปลงวันของทริป → `Record<"d0", citySlug>` ที่ UI ใช้ — `E3` · `D80`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · **ไม่มี import ที่มี runtime**
 *
 * ## 🔴 เส้นแบ่งที่ตั้งใจ: **เซิร์ฟเวอร์พูด `uuid`/`date` · ไคลเอนต์เป็นคนสะพานไป `"d0"`**
 * route ไม่รู้จัก `"d0"` เลยสักบรรทัด — มันเป็นเรื่องของ `data/itinerary.ts` ซึ่งเป็นไฟล์ของเว็บเดิม
 * 🎯 **วันที่ `E5-AC1` มี `/trip/[tripId]` และ UI เลิกใช้ `"d0"` — สะพานหายไปเฉย ๆ ไม่ต้องรื้อ route**
 *
 * ## 🔴 เก็บเฉพาะ `overnight_kind = 'city'` และข้อนี้ไม่ใช่การกรองเฉย ๆ
 * `D80` แยกสามสถานะที่ **UI เดิมยุบเป็นอันเดียว**:
 * ```
 * null    ยังไม่ตัดสิน
 * 'none'  ตั้งใจไม่นอนโรงแรม (นอนบนเครื่อง)
 * 'city'  ตั้งใจนอนเมืองหนึ่ง          ← มีแค่อันนี้ที่มีค่าให้ใส่ Record
 * ```
 * ⚠️ **`Record` ที่ไม่มีคีย์ = "ไม่มีข้อมูล" ซึ่งครอบทั้ง `null` และ `'none'`**
 * → **UI เดิมแยกสองอันนั้นไม่ออก และนั่นคือข้อจำกัดที่ `D80` มีไว้แก้** · `E5` ค่อยเปิดให้มันเห็นครบ
 */

export type DayOvernightRow = {
  id: string;
  date: string;
  /** เมืองที่วันนั้น *อยู่* — คนละคำถามกับ `overnight_city_id` (นอนที่ไหน) · `null` = ผู้ใช้ยังไม่เลือก */
  city_id: string | null;
  overnight_kind: "city" | "none" | null;
  overnight_city_id: string | null;
  /** ⚠️ คีย์นี้คือเมืองที่ **นอน** — ชื่อไม่มี prefix เพราะ UI ที่ใช้อยู่อ่านชื่อนี้ เปลี่ยนแล้วพัง */
  catalog_cities: { legacy_slug: string | null } | null;
  /** เมืองที่วันนั้นอยู่ (ฝังจาก `city_id`) — `null` = ยังไม่เลือก หรือ RLS ของคลังปฏิเสธ */
  city: { id: string; legacy_slug: string | null; name_th: string; name_en: string | null } | null;
};

export type OvernightOverrides = Record<string, string>;

export function toOvernightOverrides(
  rows: readonly DayOvernightRow[],
  bridge: DayBridge
): OvernightOverrides {
  const out: OvernightOverrides = {};
  for (const r of rows) {
    if (r.overnight_kind !== "city") continue;
    const legacyId = bridge.toLegacyId(r.id);
    // ⚠️ วันที่ไม่มีในไฟล์เดิม (เกิดบนแพลตฟอร์ม) — ข้ามไป **ไม่ใช่ใส่ด้วย uuid**
    //    ใส่ด้วย uuid = UI จะได้คีย์ที่มันหาไม่เจอ แล้วเงียบ · `bridge.unmatchedDb` รายงานไว้แล้ว
    if (!legacyId) continue;
    // 🔴 เมืองที่ไม่มี `legacy_slug` แปลว่า UI เดิมไม่รู้จักมัน — ข้ามดีกว่าใส่ uuid ให้ UI งง
    const slug = r.catalog_cities?.legacy_slug;
    if (!slug) continue;
    out[legacyId] = slug;
  }
  return out;
}
