import type { Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";

export type PlaceCardItem = { place: Place; isCustom: boolean };
export type PlaceCardGroup = { key: string; emoji: string; label: string; cards: PlaceCardItem[] };

/**
 * ลำดับหมวดในคลังสถานที่ของ `PlaceSidebar` — **หมวดที่ไม่อยู่ในลิสต์นี้ตกถังท้าย `"\U0001f4cd อื่น ๆ"`**
 *
 * \U0001f534 **ย้ายมาจาก `PlaceSidebar.tsx` เมื่อ 4 ก.ย. 2026 (P2) — เพื่อให้ *เทสต์เข้าถึงได้*
 * ไม่ใช่เพื่อความสะอาด** · `PlaceSidebar` เป็นคอมโพเนนต์ไคลเอนต์ที่ลาก dnd-kit/Supabase เข้ามา
 * ⇒ ไฟล์เทสต์ import มันไม่ได้บน Node 20 · ลิสต์จึงเคยเป็นค่าที่ **ไม่มีเกณฑ์ไหนแตะได้เลย**
 * และนั่นคือเหตุผลที่ `data/places.ts` เขียนว่า *"`hotel` อยู่ใน `CATEGORY_ORDER`"* ไว้ตั้งแต่
 * ยังไม่อยู่จริง แล้วไม่มีอะไรฟ้อง (P1/P2 4 ก.ย. 2026 — ตระกูล *คำบรรยายสภาพของไฟล์อื่น*)
 *
 * \U0001f534 **`hotel` เพิ่ม 4 ก.ย. 2026 — P5 ทำหมวดไว้ (`283e015`) แล้วส่งการตัดสินนี้มาให้ P2**
 * ก่อนหน้านี้ที่พักตกถังท้าย ซึ่ง *กว้างแต่ไม่โกหก* (ดีกว่าของเดิมที่ไปโผล่ "ย่านเที่ยวกลางคืน")
 * ✅ ให้กลุ่มของตัวเองเพราะ **สามข้อนี้พร้อมกัน ไม่ใช่เพราะดูเป็นระเบียบกว่า:**
 *   ① meta ครบแล้วจริง — `\U0001f3e8` · "ที่พัก/โรงแรม" · สีคู่สว่าง/มืด (`data/places.ts`)
 *      ⇒ หัวกลุ่มอ่านออก · หมวดที่ไม่มี meta จะได้หัวข้อ `"\U0001f4cd อื่น ๆ"` ซ้ำกับถังท้าย ซึ่งอ่านเป็นบั๊ก
 *   ② `lib/placeCategory.ts` แมป Google **17 ชนิด** (`lodging`/`hostel`/`ryokan`/…) มาที่หมวดนี้
 *      \u21d2 จำนวนแถวจะโตเรื่อย ๆ ไม่ใช่หมวดปลายแถว
 *   ③ ถังท้ายมีไว้สำหรับหมวดที่ **เราไม่รู้จัก** (ดูคำอธิบาย `groupPlaceCards`) — หมวดที่รู้จักและกำลังโต
 *      อยู่ในนั้น ทำให้ถังท้ายเลิกแปลว่า "ยังไม่จัดหมวด"
 * · **วางท้ายสุดโดยตั้งใจ** — ที่พักไม่ใช่ของที่ไล่ดูตอนเลือกที่เที่ยว แต่ต้องหาเจอเมื่อมองหา
 * · \u26a0\ufe0f **`transport` ยังไม่อยู่ในลิสต์ และตั้งใจ** — สนามบิน/สถานีเป็นจุดที่ระบบ resolve ให้
 *   ไม่ใช่ของที่ผู้ใช้เลือกจากคลัง (เหตุผลเต็มที่ `data/places.ts`)
 */
export const CATEGORY_ORDER: readonly string[] = [
  "restaurant",
  "culture",
  "nature",
  "beach",
  "market",
  "cafe",
  "nightlife",
  "viewpoint",
  "shopping",
  "hotel",
];

/**
 * กรองการ์ดในคลังด้วยคำค้น — **ฟังก์ชันล้วน อยู่ที่นี่เพื่อให้เกณฑ์เข้าถึงได้**
 * (`PlaceSidebar` เป็นคอมโพเนนต์ไคลเอนต์ที่ลาก dnd-kit เข้ามา ⇒ ไฟล์เทสต์ import ไม่ได้บน Node 20
 *  — เหตุผลเดียวกับที่ `CATEGORY_ORDER` ย้ายมาไฟล์นี้)
 *
 * ## 🔴 ทำไมคลังถึงต้องมีช่องค้นหา และทำไมมันเพิ่งจำเป็น
 * คลังโตจาก ~200 เป็น **2,396 แห่ง** · โตเกียวเมืองเดียว 42 การ์ดเรียงลงมาเป็นแถบยาว
 * 🎯 ***และมันเพิ่งแย่ลงวันนี้เอง*** — ก่อนหน้านี้การ์ดครึ่งหนึ่งเป็น `place-N` ที่อ่านไม่ออกอยู่แล้ว
 * **พอชื่อจริงกลับมา ผู้ใช้จึงเริ่มอยากหาของเจอ** ⇒ ความยาวเพิ่งกลายเป็นปัญหาที่รู้สึกได้ (P1 ชี้)
 *
 * ## ค้นจากอะไรบ้าง — และทำไมไม่ค้นจาก `id`
 * `nameTh` · `nameEn` · `nameLocal` · `descriptionTh` — **สิ่งที่ผู้ใช้เห็นบนการ์ด**
 * 🔴 **ไม่ค้นจาก `id`/slug** — `sakura-hotel-hatagaya` จะทำให้พิมพ์ `hotel` แล้วเจอของที่ชื่อไม่มีคำนั้น
 *    ⇒ ผลลัพธ์ที่อธิบายให้ตัวเองไม่ได้ **แย่กว่าไม่เจอ** เพราะผู้ใช้จะเลิกเชื่อช่องค้นหาทั้งช่อง
 */
export function matchesPlaceQuery(place: PlaceLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [place.nameTh, place.nameEn, place.nameLocal, place.descriptionTh].some(
    (v) => typeof v === "string" && v.toLowerCase().includes(q)
  );
}

/** เท่าที่ตัวกรองต้องรู้ — ไม่ผูกกับ `Place` เต็มใบ เพื่อให้เคสเขียนของปลอมได้โดยไม่ต้องครบ 14 ฟิลด์ */
export type PlaceLike = {
  nameTh: string;
  nameEn?: string | null;
  nameLocal?: string | null;
  descriptionTh?: string | null;
};

/** คีย์ของถังท้าย — ไม่ใช่หมวดจริง จึงตั้งชื่อให้ชนกับหมวดในฐานไม่ได้ */
export const UNGROUPED_KEY = "__ungrouped";

/**
 * จัดการ์ดคลังสถานที่เป็นกลุ่มตามหมวด **โดยที่ไม่มีการ์ดใบไหนหล่นหาย**
 *
 * ## บั๊กที่ฟังก์ชันนี้มีไว้กัน (`E6-AC12` · P3 เจอ 2 ก.ย. 2026)
 * `Place["category"]` เลิกเป็นยูเนียนปิดแล้ว — คลังส่งหมวดอะไรมาก็ได้ (วัดจริง: คลังโตเกียวมี
 * `"sight"` 2 แห่ง ซึ่งไม่อยู่ใน `CATEGORY_ORDER`) · ถ้าวน `CATEGORY_ORDER` อย่างเดียว
 * **การ์ดพวกนั้นจะไม่ถูกเรนเดอร์เลย และไม่มี error อะไรทั้งสิ้น**
 * 🎯 `tsc` มองไม่เห็น เพราะชนิดถูกทุกบรรทัด · accessor ก็ช่วยไม่ได้ **เพราะไม่มี lookup ตรงไหนผิด**
 * — มันหล่นหายจาก *ลำดับ* ไม่ใช่จาก *ชนิด*
 *
 * ## ถังท้าย **ใบเดียว** ไม่ใช่ใบต่อหมวด (P2 · 2 ก.ย. 2026)
 * `categoryMetaOf` คืนป้ายเดียวกันให้ทุกคีย์ที่ไม่รู้จัก → แยกเป็นกลุ่มต่อหมวดจะได้หัวข้อ
 * `"📍 อื่น ๆ"` ซ้ำกันหลายอันวางติดกัน ซึ่งอ่านเป็นบั๊ก · ตรงกับ `groupChecklistItems()`
 * ⚠️ **วันนี้ยังไม่เกิด** — คลังโตเกียวมีหมวดที่ไม่รู้จักตัวเดียว **ข้อนี้กันของอนาคต ไม่ได้แก้อาการที่เห็น**
 *
 * ## ทำไมเป็นฟังก์ชันล้วนแยกไฟล์
 * ของเดิมถูกคุมด้วยเกณฑ์ที่ `grep` หาสตริงในซอร์สของคอมโพเนนต์ · มันแดง **สองรอบติด**
 * ตอนพฤติกรรมดีขึ้นแต่ชื่อ/ที่อยู่ของโค้ดเปลี่ยน (P3 ถอนเกณฑ์นั้นออกเอง `13fed0a` พร้อมเหตุผลว่า
 * *ด่านที่ทำให้คนหยุดปรับปรุงโค้ด แพงกว่าช่องที่มันปิด*) · แยกออกมาเพื่อให้เกณฑ์ผูกกับ **พฤติกรรม**
 *
 * 🔴 **ข้อจำกัดที่ต้องรู้:** เกณฑ์พฤติกรรมยืนยันได้แค่ว่า *ฟังก์ชันนี้ถูก* — **ไม่ได้ยืนยันว่า
 * `PlaceSidebar` ยังเรียกมันอยู่** · ถ้าใครลบการเรียกทิ้ง เกณฑ์จะยังเขียว
 * (เกณฑ์ `grep` แบบเดิมจับข้อนั้นได้ · **นี่คือสิ่งที่แลกไป ไม่ใช่สิ่งที่ดีกว่าทุกทาง**)
 */
export function groupPlaceCards(
  cards: readonly PlaceCardItem[],
  order: readonly string[]
): PlaceCardGroup[] {
  const byCategory = new Map<string, PlaceCardItem[]>();
  for (const card of cards) {
    const list = byCategory.get(card.place.category) ?? [];
    list.push(card);
    byCategory.set(card.place.category, list);
  }
  const known = new Set<string>(order);
  const unset = categoryMetaOf(null);
  const groups: PlaceCardGroup[] = order.map((category) => ({
    key: category,
    emoji: categoryMetaOf(category).emoji,
    label: categoryMetaOf(category).label,
    cards: byCategory.get(category) ?? [],
  }));
  groups.push({
    key: UNGROUPED_KEY,
    emoji: unset.emoji,
    label: unset.label,
    // เรียงตามชื่อหมวดให้ผลคงที่ระหว่างรอบวาด — ลำดับของหมวดที่เราไม่รู้จักไม่มีความหมายอยู่แล้ว
    cards: [...byCategory.keys()]
      .filter((c) => !known.has(c))
      .sort()
      .flatMap((c) => byCategory.get(c) ?? []),
  });
  // กองว่างไม่ขึ้นหัวข้อ — ทริปปกติจะได้ไม่เห็น "อื่น ๆ" เปล่า ๆ
  return groups.filter((g) => g.cards.length > 0);
}
