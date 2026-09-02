import { describe, it, expect } from "vitest";
import { groupChecklistItems } from "@/components/ChecklistPanel";
import type { ChecklistItem } from "@/lib/supabase";

/**
 * 🔴 **บั๊กที่เคสนี้ตรึงไว้: `filter` ที่ *ทิ้งแถว* ไม่ใช่ `lookup` ที่คืน `undefined`**
 * ของเดิมวน `CATEGORY_ORDER` แล้ว `items.filter((i) => i.category === c)` → หมวดนอกรายการปิด
 * ไม่เข้ากองไหนเลย · และ `items.length !== 0` ทำให้ข้อความ "ยังไม่มีของ" ไม่ขึ้นด้วย
 * → **ผู้ใช้เห็นรายการที่ดูปกติ แต่ของเขาไม่อยู่ในนั้น**
 *
 * เกิดได้จริง: `checklist_items.category` เป็น `text not null default 'packing'` **ไม่มี CHECK**
 * (`supabase/migrations/0022_checklist_categories.sql:4`)
 *
 * ⚠️ ตัวสแกน `cityMetaDirectIndex` และตระกูล `TABLE[x]` **มองไม่เห็นรูปนี้ตามนิยาม** —
 * ไม่มีการ index ให้จับ · เคสนี้จึงเป็นสิ่งเดียวที่กันมันได้
 */
function item(id: string, category: string): ChecklistItem {
  return {
    id,
    text: `ของ ${id}`,
    category,
    is_checked: false,
    checked_by: null,
  } as unknown as ChecklistItem;
}

const ids = (groups: ReturnType<typeof groupChecklistItems>) =>
  groups.flatMap((g) => g.items.map((i) => i.id)).sort();

describe("groupChecklistItems", () => {
  it("🔴 หมวดที่ไม่รู้จักต้องยังปรากฏ — ทุกแถวที่เข้าไป ต้องออกมาเสมอ", () => {
    const items = [item("a", "packing"), item("b", "ของกิน"), item("c", "before_flight")];
    expect(ids(groupChecklistItems(items))).toEqual(["a", "b", "c"]);

    const other = groupChecklistItems(items).find((g) => g.key === "__ungrouped");
    expect(other?.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("🔴 ทิศแดง — พฤติกรรมเดิม (วนเฉพาะหมวดที่รู้จัก) ทำแถวหาย", () => {
    const items = [item("a", "packing"), item("b", "ของกิน")];
    const ORDER = ["packing", "before_hotel_checkout", "before_flight"];
    const oldWay = ORDER.flatMap((c) => items.filter((i) => i.category === c).map((i) => i.id));
    expect(oldWay).toEqual(["a"]); // "b" หายไปเงียบ ๆ — นี่คือบั๊ก
    expect(ids(groupChecklistItems(items))).toEqual(["a", "b"]);
  });

  it("กอง 'อื่น ๆ' ไม่ขึ้นเมื่อว่าง — ทริปปกติต้องไม่เห็นหัวข้อเปล่า", () => {
    const groups = groupChecklistItems([item("a", "packing")]);
    expect(groups.map((g) => g.key)).toEqual(["packing"]);
    expect(groups.some((g) => g.key === "__ungrouped")).toBe(false);
  });

  it("กองว่างของหมวดปกติก็ไม่ขึ้น และลำดับกองยังเป็นลำดับเดิม", () => {
    const items = [item("a", "before_flight"), item("b", "packing")];
    expect(groupChecklistItems(items).map((g) => g.key)).toEqual(["packing", "before_flight"]);
  });

  it("ไม่มีของเลย → ไม่มีกอง (ผู้เรียกเป็นคนแสดงข้อความ 'ยังไม่มีของ')", () => {
    expect(groupChecklistItems([])).toEqual([]);
  });

  it("คีย์อันตรายจาก prototype ตกลงกอง 'อื่น ๆ' ไม่ทำให้แถวหาย", () => {
    const items = [item("a", "constructor"), item("b", "__proto__")];
    expect(ids(groupChecklistItems(items))).toEqual(["a", "b"]);
  });
});
