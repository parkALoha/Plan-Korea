import { describe, expect, it } from "vitest";
import { firstRank, rankBetween, rankForInsert } from "../engine/rank";

/**
 * `D6`/`E2-AC8` — คีย์ลำดับที่แทรกระหว่างกันได้ · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * 🔴 **เคสที่สำคัญที่สุดคือ "แทรกหัวซ้ำ ๆ"** — ถ้าตัวสร้างคืนคีย์ที่ลงท้ายด้วยตัวต่ำสุด
 * วันหนึ่งจะไม่มีสตริงไหนน้อยกว่ามันได้เลย → **แทรกหัวไม่ได้ตลอดกาล**
 * และมันจะไม่พังทันที มันจะพังหลังผู้ใช้ลากของขึ้นบนสุดไปหลายสิบครั้ง
 */
describe("rankBetween", () => {
  it("อยู่ระหว่างจริงทั้งสองข้าง", () => {
    const r = rankBetween("a", "b");
    expect(r > "a").toBe(true);
    expect(r < "b").toBe(true);
  });

  it("ไม่มีขอบซ้าย → น้อยกว่า b", () => {
    expect(rankBetween(null, "5") < "5").toBe(true);
  });

  it("ไม่มีขอบขวา → มากกว่า a", () => {
    expect(rankBetween("5", null) > "5").toBe(true);
  });

  it("🔴 a ต้องน้อยกว่า b — สลับกันต้องโยน ไม่ใช่คืนของมั่ว", () => {
    expect(() => rankBetween("b", "a")).toThrow();
    expect(() => rankBetween("a", "a")).toThrow();
  });

  it("🔴 แทรกหัว 200 ครั้งติดกันยังได้คีย์ที่น้อยลงเสมอ", () => {
    let head = firstRank();
    for (let n = 0; n < 200; n++) {
      const next = rankBetween(null, head);
      expect(next < head, `รอบที่ ${n}: ${next} ต้องน้อยกว่า ${head}`).toBe(true);
      head = next;
    }
  });

  it("🔴 แทรกท้าย 200 ครั้งติดกันยังได้คีย์ที่มากขึ้นเสมอ", () => {
    let tail = firstRank();
    for (let n = 0; n < 200; n++) {
      const next = rankBetween(tail, null);
      expect(next > tail).toBe(true);
      tail = next;
    }
  });

  it("🔴 แทรกกลางระหว่างสองตัวเดิม 200 ครั้ง — ช่องไม่เคยตัน", () => {
    let lo = "A";
    const hi = "B";
    for (let n = 0; n < 200; n++) {
      const mid = rankBetween(lo, hi);
      expect(mid > lo && mid < hi, `รอบที่ ${n}: ${mid}`).toBe(true);
      lo = mid;
    }
  });

  it("ตัวอักษรที่ใช้เรียงตรงกับ ASCII (ตรงกับ `COLLATE \"C\"` ของฐาน)", () => {
    // 🔴 ถ้าชุดตัวอักษรเรียงไม่ตรงกับ ASCII ฐานกับ JS จะเรียงต่างกันเงียบ ๆ
    const rs = ["0", "9", "A", "Z", "a", "z"];
    expect([...rs].sort()).toEqual(rs);
  });
});

describe("rankForInsert", () => {
  const sorted = ["A", "M", "Z"];

  it("ลิสต์ว่าง → คีย์แรกอยู่กลางช่วง", () => {
    const r = rankForInsert([], 0);
    expect(r > "0").toBe(true);
    expect(r < "z").toBe(true);
  });

  it("แทรกหัว/กลาง/ท้าย ได้ตำแหน่งที่ถูกทุกอัน", () => {
    expect(rankForInsert(sorted, 0) < "A").toBe(true);
    const mid = rankForInsert(sorted, 1);
    expect(mid > "A" && mid < "M").toBe(true);
    expect(rankForInsert(sorted, 3) > "Z").toBe(true);
  });

  it("ตำแหน่งเกินขอบ → หนีบไว้ ไม่โยน", () => {
    expect(rankForInsert(sorted, 99) > "Z").toBe(true);
    expect(rankForInsert(sorted, -5) < "A").toBe(true);
  });
});
