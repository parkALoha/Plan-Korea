import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getBookings } from "@/lib/copilot/getBookings";
import { TOOL_RESPONSE_FIELDS, unknownFields, type ToolName } from "@/lib/copilot/toolSchemas";
import type { Db } from "@/lib/engine/db";

/**
 * ด่านของ **ฟิลด์ใน response ที่ tool ของ Copilot คืนให้โมเดล** — ไม่ใช่ด่านของเกณฑ์รับข้อไหน
 *
 * 🔴 **ขอบเขต — อ่านก่อนยกผลของไฟล์นี้ไปใช้:**
 * ไฟล์นี้ **ไม่แตะ prompt และไม่แตะคำตอบของโมเดลเลยสักบรรทัด** · มันตรวจอย่างเดียวว่า
 * *สิ่งที่ wrapper คืนออกมา มีแต่ฟิลด์ที่ประกาศไว้ใน `TOOL_RESPONSE_FIELDS`*
 * → **เขียวที่นี่ไม่ได้แปลว่าข้อห้ามเรื่องเนื้อหาข้อไหนถูกปิด** ถ้าใครยกไฟล์นี้ไปติ๊กเกณฑ์ที่กว้างกว่านี้
 * เราจะได้เกณฑ์ที่เขียวโดยไม่มีอะไรถูกพิสูจน์ **แล้วคราวนี้มี CI รับรองให้ด้วย** (เงื่อนไขที่ P1 ตั้งตอนอนุมัติ)
 *
 * ## ทำไมไฟล์นี้เกิดตอนนี้ ไม่ใช่ก่อนหน้านี้
 * `toolSchemas.ts:7` เขียนเงื่อนไขปลดล็อกของตัวเองไว้ว่า *"มันผูกจริงเมื่อ tool wrapper ตัวแรก
 * ส่ง response ของจริงเข้ามา"* · **wrapper ตัวแรก (`getBookings`) ลงวันที่ 28 ส.ค. 2026
 * และไม่มีใครเรียก `unknownFields()` เลยสักที่** (`grep` ทั้งทรีได้ 0 ผู้เรียก · P1 วัดซ้ำแล้ว)
 * 🎯 **เงื่อนไขปลดล็อกมาถึงแล้วโดยไม่มีอะไรส่งเสียง** — เพราะของที่ควรดังคือด่านที่ยังไม่มี
 *
 * ## กฎ 3 ข้อของด่าน (P1 ประกาศ 28 ส.ค. 2026) และไฟล์นี้ทำครบทั้งสาม
 *   ① แดงเมื่อละเมิด        → `it("ฟิลด์ที่ wrapper คืนจริง …")`
 *   ② เคสควบคุมฝั่งบวก      → `it("ยัดฟิลด์ที่ไม่ได้ประกาศ …")` — ยัดแล้ว **ต้อง `expect` ว่าการยัดเกิดขึ้นจริง**
 *   ③ ไม่มีของให้ตรวจ = แดง → `it("ต้องมี wrapper ให้ตรวจอย่างน้อย 1 ตัว")`
 */

const COPILOT_DIR = resolve(__dirname, "..", "copilot");

/**
 * ทะเบียน wrapper → ชื่อ tool · **ทิศที่บังคับได้วันนี้คือ "ไฟล์ที่ไม่มีในทะเบียน = แดง"**
 *
 * 🔴 ทิศกลับ (*"ชื่อ tool ที่ไม่มี wrapper = แดง"*) **ลงวันนี้ไม่ได้** — ประกาศไว้ 17 tool มี wrapper 1 ตัว
 * → ถ้าลงจะแดงตั้งแต่วันแรกด้วยเหตุผลที่ไม่ใช่บั๊ก · P1 ตัดสินให้เลื่อน **แต่ห้ามให้มันหายเงียบ**
 * → ดู `it("tripwire …")` ข้างล่าง ซึ่งจะแดงเองวันที่ wrapper ครบ
 */
const WRAPPERS: ReadonlyArray<{
  file: string;
  tool: ToolName;
  /** เรียก wrapper ตัวจริงแล้วคืน response ที่มันคืนออกมาจริง ๆ — ไม่ใช่ object ที่เทสต์ปั้นเอง */
  run: () => Promise<unknown>;
}> = [
  {
    file: "getBookings.ts",
    tool: "get_bookings",
    run: () => getBookings(fakeDbWithOneBooking(), { tripId: "t1" }),
  },
];

/** ไฟล์ใน `lib/copilot/` ที่ไม่ใช่ wrapper — ต้องระบุชื่อ ไม่ใช่ปล่อยผ่านด้วยรูปแบบชื่อไฟล์ */
const NOT_WRAPPERS = new Set(["toolSchemas.ts"]);

/**
 * `Db` ปลอมที่คืน **ทุกคอลัมน์ที่ `BOOKING_COLS` เลือกจริง (16 ตัว)** ไม่ใช่แค่ 6 ตัวที่ Copilot ได้
 * 🔴 **นี่คือหัวใจของเคส ①** — ถ้าปลอมมาแค่ 6 ตัว เทสต์จะเขียวแม้ wrapper เผลอส่งต่อทั้งแถว
 * (`confirmation_number` · `file_path` · `link` เข้าไปอยู่ในบริบทโมเดลแล้วเอาออกไม่ได้)
 */
function fakeDbWithOneBooking(): Db {
  const row = {
    id: "b1",
    trip_day_id: "d1",
    category: "hotel",
    title: "โรงแรมซอรัคซาน",
    date: "2026-10-16",
    time: "15:00",
    confirmation_number: "ABC-123-SECRET",
    link: "https://example.invalid/booking",
    note: "ขอห้องชั้นสูง",
    file_path: "tickets/abc.pdf",
    file_name: "abc.pdf",
    status: "confirmed",
    book_by_days_before: 7,
    legacy_added_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => Promise.resolve({ data: [row], error: null }),
  };
  return { from: () => builder } as unknown as Db;
}

describe("ฟิลด์ใน response ของ tool ฝั่ง Copilot", () => {
  it("ทุกไฟล์ใน lib/copilot/ ต้องอยู่ในทะเบียน — ไฟล์ที่ไม่มีใครลงทะเบียน = แดง", () => {
    const onDisk = readdirSync(COPILOT_DIR).filter((f) => f.endsWith(".ts"));
    const known = new Set([...WRAPPERS.map((w) => w.file), ...NOT_WRAPPERS]);
    // 🎯 ทิศของการนับ: เริ่มจาก *ทุกไฟล์ที่มีอยู่จริง* แล้วตัดของที่ลงทะเบียนไว้
    //    ไม่ใช่ไล่ทะเบียนแล้วเช็คว่าไฟล์มีไหม — wrapper ที่ไม่มีใครนึกถึงจะได้ถูกตรวจ ไม่ใช่ถูกข้าม
    expect(onDisk.filter((f) => !known.has(f))).toEqual([]);
  });

  it("ต้องมี wrapper ให้ตรวจอย่างน้อย 1 ตัว — ด่านที่ไม่มีของให้ตรวจต้องแดง ไม่ใช่เงียบ", () => {
    /**
     * 🔴 กฎข้อ ③ · ถ้าวันหนึ่ง wrapper ถูกย้าย/ลบจนไม่เหลือ เคสอื่นทั้งไฟล์จะ "ผ่าน" โดยไม่ตรวจอะไรเลย
     * (ยิงจริงแล้ว: ทำ `WRAPPERS` ให้ว่าง → `it.each` **หายไปเงียบ ๆ** `5 passed` กลายเป็น `3 passed` ไม่มี error)
     *
     * 🔴 **นับจากดิสก์ ไม่ใช่จาก `WRAPPERS`** — เงื่อนไขของ P4 (29 ส.ค. 2026):
     * ***ตัวเลขที่คาด ต้องมาจากการนับคนละทางกับอินพุตของ runner***
     * `WRAPPERS` คือสิ่งที่ `it.each` กินเข้าไป · `expect(WRAPPERS.length > 0)` จึงถามคลังว่าตัวเองว่างไหม
     * ซึ่งจับ *"ทะเบียนว่าง"* ได้ แต่จับ *"ทะเบียนไม่ว่างแต่ไม่ตรงของจริง"* ไม่ได้เลย
     * → **จักรวาลมาจาก `readdirSync` · ทะเบียนต้องเท่ากับจักรวาล** = สองแหล่งที่ผิดพร้อมกันไม่ได้ง่าย ๆ
     */
    const onDisk = readdirSync(COPILOT_DIR).filter((f) => f.endsWith(".ts") && !NOT_WRAPPERS.has(f));
    expect(onDisk.length, "ไม่มีไฟล์ wrapper ในดิสก์เลย — โฟลเดอร์ถูกย้าย ไม่ใช่ 'ไม่มีอะไรให้ตรวจ'").toBeGreaterThan(0);
    expect(WRAPPERS.length, `ทะเบียนไม่เท่าของจริงในดิสก์: ${onDisk.join(", ")}`).toBe(onDisk.length);
  });

  it.each(WRAPPERS)("ฟิลด์ที่ $file คืนจริง ต้องอยู่ในสิ่งที่ประกาศไว้ทั้งหมด", async ({ tool, run }) => {
    expect(unknownFields(tool, await run())).toEqual([]);
  });

  it.each(WRAPPERS)("เคสควบคุมฝั่งบวก: ยัดฟิลด์ที่ไม่ได้ประกาศเข้า response ของ $file แล้วต้องจับได้", async ({ tool, run }) => {
    const real = (await run()) as Record<string, unknown>;
    // 🔴 ต้อง assert ว่าการยัดเกิดขึ้นจริง ก่อนสรุปผลของมัน (กฎ P4 · 28 ส.ค. 2026)
    //    ทิศแดงที่ no-op เงียบ ให้ผลเหมือนทิศแดงที่ล้มเหลวเป๊ะ แล้วอ่านว่า "ตัวตรวจไม่มีอำนาจแยกแยะ"
    expect(Object.hasOwn(real, "totalPrice")).toBe(false);
    const poisoned = { ...real, totalPrice: 12000 };
    expect(Object.hasOwn(poisoned, "totalPrice")).toBe(true);

    expect(unknownFields(tool, poisoned)).toEqual(["totalPrice"]);
  });

  it("tripwire: ทิศกลับของทะเบียนยังลงไม่ได้ — เคสนี้ต้องแดงเองวันที่ wrapper ครบ", () => {
    /**
     * 🔴 **เคสนี้ไม่ได้ป้องกันบั๊ก มันป้องกัน "ไว้ทำทีหลัง" ไม่ให้หายเงียบ** (P1 สั่งเพิ่ม 28 ส.ค. 2026)
     * ทิศกลับ — *"ชื่อ tool ที่ประกาศไว้แต่ไม่มี wrapper = แดง"* — คือสิ่งที่ทำให้ทะเบียนนี้ผิดได้
     * และทะเบียนที่ผิดไม่ได้จะกลายเป็นแหล่งความจริงใบที่สอง
     * วันนี้ลงไม่ได้เพราะประกาศ 17 ชื่อ มี wrapper 1 ตัว → **เคสนี้จะแดงวันที่ตัวเลขสองฝั่งเท่ากัน**
     * 🎯 **ตอนมันแดง อย่าลบทิ้ง — ให้เอาทิศกลับลงแทน แล้วเคสนี้ค่อยหมดหน้าที่**
     */
    const declared = Object.keys(TOOL_RESPONSE_FIELDS).length;
    expect(WRAPPERS.length).toBeLessThan(declared);
  });
});
