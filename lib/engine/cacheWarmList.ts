import { placeQueryKey } from "@/lib/placeQuery";

/**
 * **`Q3` ก้าวที่ 2 — แกนเลือกว่า *คีย์ไหนต้องอุ่น* (ตรรกะล้วน ไม่แตะฐาน ไม่แตะเครือข่าย)**
 * เจ้าของ: P1-Lead · 3 ก.ย. 2026
 *
 * ## คำถามที่ไฟล์นี้ตอบ — และคำตอบคือ *ไม่มีอะไรต้องทำนาย*
 * ก้าวที่ 1 ทำให้แคช **อ่านได้แต่ไม่มีใครเขียน** · คำถามที่ค้างคือ *"จะรู้ได้ยังไงว่าต้องอุ่นคีย์ไหนล่วงหน้า"*
 * 🎯 **เซตของคีย์ที่แคชได้ *เท่ากับ* บัญชีขาวที่ route ใช้ตอนอ่าน — มันปิดและเล็ก คำนวณจากคลังได้ตรง ๆ**
 * ```
 * วัดกับ engine-dev (3 ก.ย. 2026):  คลังจริง 202 · คีย์ที่แคชได้ 174 · แคชแล้ว 33 · ต้องอุ่น 141
 * ```
 * · ⇒ **ไม่ต้องมีคิวที่ผู้ใช้เขียน · ไม่ต้องเปิดทางเขียนใหม่สักทาง**
 * · 📌 **ทางที่ปฏิเสธ: ให้ route บันทึก cache-miss ลงคิว** — เป็นทางเขียนของผู้ใช้อีกใบทั้งที่ไม่จำเป็น
 *
 * ## 🔴 ข้อที่สำคัญที่สุดในไฟล์นี้: **ใช้ `placeQueryKey` ตัวเดิม ห้ามเขียนสูตรคีย์ซ้ำ**
 * 3 ก.ย. 2026 มีบั๊กที่เกิดจาก *สองฝั่งถามคำถามคนละอย่างเรื่องรูปของคีย์*:
 * ประตูอ่าน (`catalogPublicMapsQueries`) กับบล็อกล้างข้อมูลใน migration **ต่างก็เทียบคอลัมน์เดียว**
 * ทั้งที่ `placeQueryKey()` คืน **สองรูป** → คีย์รูป `place_id:` ถูกกันทิ้ง/ถูกลบทั้งหมด
 * · 🎯 **ตัวอุ่นคือฝั่งที่สาม** — ถ้ามันเขียนสูตรเอง มันจะเถียงกับอีกสองฝั่งเงียบ ๆ ในวันที่รูปคีย์เปลี่ยน
 */
export type CatalogKeyRow = {
  id: string;
  mapsQuery: string | null;
  googlePlaceId: string | null;
};

export type WarmTarget = {
  /** คีย์ที่ใช้เป็น `maps_query` ของตารางแคช — มาจาก `placeQueryKey` เท่านั้น */
  key: string;
  placeId: string;
  /** `trip` = มีคนใส่ไว้ในทริปจริงแล้ว → อุ่นก่อน */
  priority: "trip" | "catalog";
};

/**
 * คืนรายการคีย์ที่ยังไม่มีในแคช เรียงตามลำดับความสำคัญ
 *
 * ⚠️ **ไม่มีผลข้างเคียง** — ไม่ยิงเครือข่าย ไม่แตะฐาน · ผู้เรียกเป็นคนหาข้อมูลมาป้อนและเป็นคนเขียน
 */
export function warmTargets(opts: {
  catalog: readonly CatalogKeyRow[];
  /** คีย์ที่มีแถวอยู่แล้วในตารางแคช */
  cachedKeys: Iterable<string>;
  /** `catalog_places.id` ที่ถูกอ้างจาก `trip_stops` — สัญญาณลำดับความสำคัญที่ผู้ใช้ไม่ต้องเขียนอะไร */
  tripReferencedIds?: Iterable<string>;
  /** เพดานต่อรอบ (rate limit ฝั่ง Google) — ไม่ใส่ = ไม่จำกัด */
  limit?: number;
}): WarmTarget[] {
  const cached = new Set(opts.cachedKeys);
  const inTrip = new Set(opts.tripReferencedIds ?? []);
  const seen = new Set<string>();
  const trip: WarmTarget[] = [];
  const rest: WarmTarget[] = [];

  for (const row of opts.catalog) {
    // 🔴 แถวที่ไม่มีคีย์เลย **ข้ามโดยตั้งใจ** — แคชไม่ได้ *และ* ผ่านประตูอ่านไม่ได้ตามนิยาม
    //    (วัดแล้ว: 28 แถวในคลังจริงเป็นแบบนี้ · ทั้งหมดเป็น `source=transfer` ซึ่งไม่ต้องมีคีย์)
    if (!row.googlePlaceId && !row.mapsQuery) continue;

    // 🔴 ใช้ตัวเดียวกับที่ route ใช้ — **ห้ามประกอบคีย์เอง** (ดูหัวไฟล์)
    const key = placeQueryKey({
      googlePlaceId: row.googlePlaceId,
      mapsQuery: row.mapsQuery ?? "",
    });
    if (!key) continue;
    if (cached.has(key)) continue;
    if (seen.has(key)) continue;       // คลังสองแถวชี้คีย์เดียวกันได้ — อุ่นครั้งเดียวพอ
    seen.add(key);

    (inTrip.has(row.id) ? trip : rest).push({
      key,
      placeId: row.id,
      priority: inTrip.has(row.id) ? "trip" : "catalog",
    });
  }

  const out = [...trip, ...rest];
  return opts.limit === undefined ? out : out.slice(0, Math.max(0, opts.limit));
}
