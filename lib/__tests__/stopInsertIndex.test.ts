import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { firstRank, rankForInsert } from "@/lib/engine/rank";

/**
 * 🔴 **`atIndex` มาจากลิสต์ที่ผู้ใช้เห็น ซึ่งไม่มีแถว `kind='event'`**
 * → API ต้องอ่านตำแหน่งจาก `stopRanksInDay()` ไม่ใช่ `ranksInDay()` (`4f825fa`)
 *
 * ## เงื่อนไขที่ทำให้ท่าเก่าผิด — วัดแล้ว ไม่ได้เดา
 * ท่าเก่าเลื่อนตำแหน่งแทรก **เร็วไปเท่ากับจำนวน event ที่ rank มาก่อนตำแหน่งนั้น**
 * ```
 * จุดแวะ A M Z · event rank 0000F (อยู่ระหว่าง A กับ M)
 *   at=0,1  ท่าเก่า/ใหม่ ตกช่องเดียวกัน      ← ไม่แยกแยะ
 *   at=2    ใหม่ ช่อง 2 · เก่า **ช่อง 1**     ← 🔴 ผิดช่อง
 *   at=3    ใหม่ ช่อง 3 · เก่า **ช่อง 2**     ← 🔴 ผิดช่อง
 * ```
 * 🎯 **ท่าเก่าถูก *ก็ต่อเมื่อ* ไม่มี event ตัวไหน rank มาก่อนจุดแวะเลย** — ซึ่งวันนี้จริง
 * (`E7` ให้ event เป็น `E0000V…` · จุดแวะ `0000V…` · `'0' < 'E'`) **แต่ไม่มี constraint บังคับ**
 * → ตัวแก้จึง **ถอดการพึ่งพา invariant ที่ไม่มีใครบังคับ** ไม่ใช่ซ่อมของพัง และไม่ใช่แค่กันล่วงหน้า
 *
 * ⚠️ **บันทึกความพยายามที่ล้มเหลว ไม่ให้ใครเสียเวลาซ้ำ:**
 * · เคสที่สร้างลิสต์ `[E,E,S1,S2,S3]` ด้วยมือ — **รูปนั้นไม่มีในฐาน** (P1 วัด)
 * · เคส "เดินสองก้าวจากสภาพ seed" — **สลับเวอร์ชันกลางทาง** (ก้าวแรกท่าใหม่ · ก้าวสองท่าเก่า)
 *   เดินเวอร์ชันเดียวตลอด **ไม่มีเวอร์ชันไหนวางผิดลำดับ** (P1 รันพิสูจน์ · P4 รันยืนยันซ้ำ)
 * · เคส "event แทรกกลาง แล้วแทรก at=1" — **ไม่แยกแยะ** (ทั้งสองท่าตกช่องเดียวกัน · วัดแล้ว)
 */
const A = "0000A";
const M = "0000M";
const Z = "0000Z";
const STOPS = [A, M, Z];
const EVENT_BEFORE_M = "0000F";
const FULL = [A, EVENT_BEFORE_M, M, Z];
const slotOf = (rank: string) => [...STOPS, rank].sort().indexOf(rank);

describe("atIndex ต้องนับเฉพาะจุดแวะ", () => {
  it.each([2, 3])("🔴 at=%i — ท่าเก่าตกผิดช่อง เพราะมี event rank มาก่อน", (at) => {
    expect(slotOf(rankForInsert(STOPS, at))).toBe(at);
    expect(
      slotOf(rankForInsert(FULL, at)),
      "ท่าเก่าต้องตกคนละช่อง — ถ้าเท่ากันแปลว่าเคสไม่มีอำนาจแยกแยะ",
    ).not.toBe(at);
  });

  it.each([0, 1])("at=%i — ทั้งสองท่าตกช่องเดียวกัน (บันทึกไว้ว่าเคสพวกนี้แยกไม่ได้)", (at) => {
    expect(slotOf(rankForInsert(STOPS, at))).toBe(slotOf(rankForInsert(FULL, at)));
  });

  it("วันที่มีแต่ event → ลิสต์จุดแวะว่าง → firstRank() ไม่ใช่ค่าที่อิง event", () => {
    expect(rankForInsert([], 0)).toBe(firstRank());
    expect(rankForInsert([], 5)).toBe(firstRank());
  });

  it("atIndex เกินขอบ → หนีบเข้าช่วง ไม่โยน", () => {
    expect(rankForInsert(STOPS, 99) > Z).toBe(true);
    expect(rankForInsert(STOPS, -3) < A).toBe(true);
  });
});

/**
 * 🔴 ครึ่งที่เคสฟังก์ชันล้วนพิสูจน์ไม่ได้: **route เรียกตัวไหน**
 * ⚠️ **สแกน *ข้อความ* จึงผูกกับการสะกด** (ด่านชนิดนี้ถูกหักมาแล้ว 7 ทาง) — ตาข่าย ไม่ใช่ข้อพิสูจน์
 */
describe("route ต้องอ่านลิสต์เฉพาะจุดแวะในเส้นที่ใช้ atIndex", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../../app/api/engine/trips/[tripId]/stops/route.ts"),
    "utf8",
  );
  const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("ตัวสแกนเห็นไฟล์จริง (ไม่มีของให้ตรวจ = แดง)", () => {
    expect(SRC.length).toBeGreaterThan(5_000);
    expect(SRC).toContain("rankForInsert");
  });

  it("🔴 ทุกจุดที่เรียก rankForInsert ต้องได้ลิสต์จาก stopRanksInDay", () => {
    const code = strip(SRC);
    const calls = (code.match(/rankForInsert\(/g) ?? []).length;
    const stopLists = (code.match(/stopRanksInDay\(/g) ?? []).length;
    expect(calls, "ไม่เจอการเรียก rankForInsert เลย — ตัวสแกนน่าจะพัง").toBeGreaterThan(0);
    expect(stopLists, `rankForInsert ${calls} จุด แต่ stopRanksInDay ${stopLists} จุด`).toBe(calls);
  });
});
