import { describe, expect, it } from "vitest";
import { groupPlaceCards, UNGROUPED_KEY, type PlaceCardItem } from "@/components/placeGrouping";
import type { Place } from "@/data/places";
import { UNSET_CATEGORY_META } from "@/components/categoryMeta";

/**
 * เกณฑ์ของ **ชั้นลำดับ/การจัดกลุ่ม** ของคลังสถานที่ — เจ้าของ: P2-UI/UX · 2 ก.ย. 2026
 * (P1 coordinate ให้สร้างไฟล์นี้ใน `lib/__tests__/` ซึ่งเป็นโซน P4 · ไฟล์ใหม่ ไม่แตะของใคร)
 *
 * ## ทำไมมีไฟล์นี้ — และทำไมมันไม่ `grep` ซอร์ส
 * บั๊กต้นเรื่อง: `Place["category"]` เลิกเป็นยูเนียนปิด (`E6-AC12`) → การ์ดที่หมวดไม่อยู่ใน
 * `CATEGORY_ORDER` **ไม่ถูกเรนเดอร์เลย และไม่มี error อะไรทั้งสิ้น** · `tsc` มองไม่เห็น
 * เพราะชนิดถูกทุกบรรทัด และ accessor ก็ช่วยไม่ได้ **เพราะไม่มี lookup ตรงไหนผิด**
 *
 * เกณฑ์เดิมของ P3 ตรวจด้วยการ `grep` สตริงใน `PlaceSidebar.tsx` · มัน **แดงสองรอบติดตอน
 * พฤติกรรมดีขึ้นแต่ชื่อ/ที่อยู่ของโค้ดเปลี่ยน** จน P3 ถอนออกเอง (`13fed0a`) พร้อมเหตุผลว่า
 * *ด่านที่ทำให้คนหยุดปรับปรุงโค้ด แพงกว่าช่องที่มันปิด*
 *
 * 🔴 **ช่องที่ไฟล์นี้ปิดไม่ได้ และรู้ตัวว่าปิดไม่ได้ — *"ฟังก์ชันถูก แต่ไม่มีใครเรียก"***
 * เกณฑ์ที่นี่ยืนยันว่า `groupPlaceCards()` ทำงานถูก · **ไม่ได้ยืนยันว่า `PlaceSidebar` ยังเรียกมันอยู่**
 * ถ้าใครลบการเรียกทิ้ง ไฟล์นี้จะยังเขียวทั้งใบ · **เกณฑ์ `grep` แบบเดิมจับข้อนั้นได้ · อันนี้จับไม่ได้**
 * → นี่คือของที่ *แลกไป* ตอนเลิกผูกกับซอร์ส ไม่ใช่ของที่หายไปเฉย ๆ (P1 ยืนยันกรอบนี้)
 * 🎯 ตระกูลเดียวกับ `P-50` (*"ธงที่อ่านไม่ได้ ไม่ใช่ธง"*) และ `useLegacyDayPlanGate` ที่มี 0 ผู้เรียก
 * ⚠️ **ห้ามปิดช่องนี้ด้วยการกลับไป `grep` ซอร์ส** — นั่นคือวงจรที่เพิ่งกัดไปสองรอบ
 *
 * 🔴 **กลไกที่แท้จริงของช่อง กว้างกว่า "ไม่มีใครเรียก"** (P4 ชี้ 2 ก.ย. 2026 — ผมออกแบบชนิดนี้เอง
 * และมองไม่เห็นข้อนี้): `PlaceCardGroup` เป็นชนิด**เชิงโครงสร้างล้วน** → ใครก็ปั้น
 * `{key, emoji, label, cards}[]` ด้วยมือแล้วเรนเดอร์ได้ **โดย `tsc` ไม่บ่นสักคำ**
 * → **เทสต์ตรวจของที่ฟังก์ชัน*คืน* · ไม่ได้ตรวจว่าของที่*เรนเดอร์*มาจากฟังก์ชัน** · ปิดด้วยเทสต์ไม่ได้ตามนิยาม
 *
 * ## 📌 ทางแก้ที่ตั้งใจไว้ — เขียนไว้ให้ใครก็หยิบไปทำได้ ไม่ใช่ "รอ P2" (P4 เสนอรูปนี้)
 * ดึงการเรนเดอร์กลุ่มออกจาก `.map()` อินไลน์ใน `PlaceSidebar` เป็นคอมโพเนนต์ที่รับชนิด **ที่มีแบรนด์**
 * ซึ่งมีที่เดียวในโลกที่ผลิตได้คือ `groupPlaceCards()` → **"ไม่เรียก" จะคอมไพล์ไม่ผ่าน**
 * · 🔴 **ห้าม `export` ตัว `unique symbol` ของแบรนด์** — ถ้า export ใครก็ประกอบ object ที่มีคีย์นั้นได้เอง
 *   **แบรนด์ตายทันทีโดยไม่มีอะไรฟ้อง**
 * · ⚠️ **`as GroupedCards` เอาชนะแบรนด์ได้เสมอ** → แบรนด์ยกระดับจาก *"พลาดได้"* เป็น ***"ต้องตั้งใจ"***
 *   **ไม่ใช่ *"เป็นไปไม่ได้"*** — เขียนกำกับด้วยคำนี้เท่านั้น ไม่งั้นอีกสามเดือนจะมีคนอ้างว่ามันกันได้มากกว่าที่มันกัน
 * · 📌 `.map()` บนชนิดที่มีแบรนด์จะคืนอาเรย์ธรรมดา (แบรนด์หลุด) — **ถูกต้องตามที่ต้องการ ไม่ใช่บั๊ก**
 * · ⏳ ตั้งใจทำเป็นคอมมิตถัดไปหลังชุดนี้ลง (2 ก.ย. 2026) · **ถ้าเลยไปแล้วยังไม่มี ให้ถือเป็นหนี้ที่ใครหยิบก็ได้**
 */

const ORDER = ["culture", "nature", "market"];

function card(id: string, category: string): PlaceCardItem {
  return { place: { id, nameTh: `ที่ ${id}`, category } as unknown as Place, isCustom: false };
}

const idsIn = (groups: ReturnType<typeof groupPlaceCards>) =>
  groups.flatMap((g) => g.cards.map((c) => c.place.id)).sort();

describe("groupPlaceCards", () => {
  /**
   * 🔴 **แยกเป็นสองเคสโดยตั้งใจ** (P2 จับได้ตอนยิงทิศแดง · P4 ยืนยันว่าควรแยกก่อนเพื่อน)
   * ฉบับแรกรวม *invariant* (การ์ดเข้า = ออก) กับ *รูปร่าง* (ตกถังไหน) ไว้ในเคสเดียว ชื่อบอกแค่อย่างแรก
   * → ตอนแดง **อ่านไม่ออกว่าอันไหนพัง** · ทิศแดง ② (แยกถังต่อหมวด) ทำให้มันแดงทั้งที่การ์ด*ไม่หาย*
   * 🎯 เคสที่วัดสองอย่างแต่ชื่อบอกอย่างเดียว = ตอนแดงมันชี้ผิดทาง
   */
  it("🔴 invariant — การ์ดทุกใบที่เข้าไป ต้องออกมาเสมอ (ไม่พูดถึงว่าตกถังไหน)", () => {
    const cards = [card("a", "culture"), card("b", "sight"), card("c", "market")];
    expect(idsIn(groupPlaceCards(cards, ORDER))).toEqual(["a", "b", "c"]);
  });

  it("รูปร่าง — การ์ดหมวดที่ไม่รู้จักตกถังท้าย", () => {
    const cards = [card("a", "culture"), card("b", "sight"), card("c", "market")];
    const other = groupPlaceCards(cards, ORDER).find((g) => g.key === UNGROUPED_KEY);
    expect(other?.cards.map((c) => c.place.id)).toEqual(["b"]);
  });

  it("🔴 ทิศแดง — พฤติกรรมเดิม (วนเฉพาะหมวดที่รู้จัก) ทำการ์ดหาย", () => {
    const cards = [card("a", "culture"), card("b", "sight")];
    const oldWay = ORDER.flatMap((c) => cards.filter((x) => x.place.category === c).map((x) => x.place.id));
    expect(oldWay).toEqual(["a"]); // "b" หายเงียบ ๆ — นี่คือบั๊ก
    expect(idsIn(groupPlaceCards(cards, ORDER))).toEqual(["a", "b"]);
  });

  it("🔴 หมวดที่ไม่รู้จักหลายตัว → **ถังเดียว** ไม่ใช่หลายกลุ่มที่หัวข้อซ้ำกัน", () => {
    const cards = [card("a", "sight"), card("b", "onsen"), card("c", "culture")];
    const groups = groupPlaceCards(cards, ORDER);
    const labels = groups.map((g) => g.label);
    expect(new Set(labels).size, "หัวข้อซ้ำ = ผู้ใช้อ่านเป็นบั๊ก").toBe(labels.length);
    expect(groups.filter((g) => g.key === UNGROUPED_KEY)).toHaveLength(1);
    expect(groups.find((g) => g.key === UNGROUPED_KEY)?.cards.map((c) => c.place.id)).toEqual(["b", "a"]);
    expect(groups.at(-1)?.label).toBe(UNSET_CATEGORY_META.label); // ท้ายลิสต์เสมอ
  });

  it("ถังท้ายไม่ขึ้นเมื่อว่าง · กลุ่มปกติที่ว่างก็ไม่ขึ้น · ลำดับที่เหลือคงเดิม", () => {
    const groups = groupPlaceCards([card("a", "market"), card("b", "culture")], ORDER);
    expect(groups.map((g) => g.key)).toEqual(["culture", "market"]);
  });

  it("ไม่มีการ์ดเลย → ไม่มีกลุ่ม (ผู้เรียกเป็นคนแสดงข้อความว่าง)", () => {
    expect(groupPlaceCards([], ORDER)).toEqual([]);
  });

  it("คีย์อันตรายจาก prototype ตกถังท้าย ไม่ทำการ์ดหาย", () => {
    const cards = [card("a", "constructor"), card("b", "__proto__")];
    expect(idsIn(groupPlaceCards(cards, ORDER))).toEqual(["a", "b"]);
  });
});
