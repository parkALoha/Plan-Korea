import type { Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";

export type PlaceCardItem = { place: Place; isCustom: boolean };
export type PlaceCardGroup = { key: string; emoji: string; label: string; cards: PlaceCardItem[] };

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
