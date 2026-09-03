import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_COUNTRY_CODES } from "./_helpers";

/**
 * **ด่านที่คุ้ม `catalogFixtureSweep.ts` — ตัวกวาดเองทดสอบตรง ๆ ไม่ได้**
 * เจ้าของ: P1-Lead · 3 ก.ย. 2026
 *
 * ## 🔴 ทำไมไฟล์นี้ต้องมี
 * ตัวกวาดเป็น `globalSetup` teardown — **มันรันนอกชุดเทสต์ตามนิยาม**
 * · ยืนยันตัวมันเองแล้วด้วยทิศบวกจริง: ปลูก 3 แถวใต้รหัสสงวน → รันชุด → **หายครบ 3 และรายงานตัวเลข**
 * · 🔴 **แต่ทิศบวกนั้นทำซ้ำอัตโนมัติไม่ได้** — มันต้องมีคนปลูกแถวก่อน
 * ⇒ ไฟล์นี้จึงคุ้ม **เงื่อนไขที่ทำให้ตัวกวาดถูกต้อง** ซึ่งพังได้เงียบ ๆ ทั้งสามข้อ
 */
describe("catalogFixtureSweep — เงื่อนไขที่พังได้เงียบ", () => {
  const config = readFileSync("vitest.config.mts", "utf-8");
  const sweep = readFileSync("lib/__tests__/catalogFixtureSweep.ts", "utf-8");

  /**
   * 🔴 **vitest รัน teardown ย้อนลำดับของ `globalSetup`**
   * ตัวกวาดต้องอยู่ **หลัง** `fixtureLockGlobal` ⇒ teardown ของมันรัน *ก่อน* lock ถูกปล่อย
   * · ⚠️ **สลับลำดับแล้วไม่มีอะไรฟ้อง** — มันจะทำงานถูกเกือบทุกครั้ง
   *   แล้วผิดเฉพาะตอนสองรอบซ้อนกันพอดี ซึ่งเป็นตอนที่แพงที่สุดและหายากที่สุด
   */
  it("① ตัวกวาดต้องอยู่หลัง fixtureLockGlobal ใน globalSetup", () => {
    // 🔴 **ต้องตัดเอาเฉพาะเนื้ออาร์เรย์ก่อน — ฉบับแรกของเคสนี้อ่านทั้งไฟล์แล้ว *ผ่านผิดเหตุ***
    //    คอมเมนต์เหนืออาร์เรย์อธิบายลำดับไว้ และ **เอ่ยชื่อไฟล์ทั้งสองตามลำดับที่ถูก**
    //    ⇒ `indexOf` เจอชื่อในคอมเมนต์ก่อนเสมอ → สลับลำดับจริงแล้วเคสยังเขียว
    //    🎯 ***ด่านวัดคำอธิบายของสิ่งที่ควรเป็น แทนที่จะวัดสิ่งที่เป็น*** —
    //       และคำอธิบายนั้นผมเขียนเองเพื่ออธิบายกฎที่เคสนี้บังคับพอดี
    //    · ⚠️ จับได้เพราะยิงทิศแดง **ไม่ใช่เพราะอ่านซ้ำ** — เคสเขียวตั้งแต่รอบแรก
    const arr = /globalSetup:\s*\[([\s\S]*?)\]/.exec(config)?.[1];
    expect(arr, "หา globalSetup array ในไฟล์ config ไม่เจอ").toBeTruthy();
    const iLock = arr!.indexOf("fixtureLockGlobal.ts");
    const iSweep = arr!.indexOf("catalogFixtureSweep.ts");
    expect(iLock, "ไม่พบ fixtureLockGlobal ใน vitest.config.mts").toBeGreaterThan(-1);
    expect(iSweep, "ตัวกวาดไม่ได้ถูกต่อสายเข้า globalSetup เลย — มันจะไม่เคยรัน").toBeGreaterThan(-1);
    expect(iSweep,
      "ตัวกวาดอยู่ก่อน fixtureLockGlobal → teardown จะรันหลัง lock ถูกปล่อย = กวาดขณะไม่มี lock")
      .toBeGreaterThan(iLock);
  });

  /**
   * 🔴 **ห้ามพิมพ์รหัสสงวนซ้ำลงตัวกวาด** — ทะเบียนมีใบเดียวคือ `TEST_COUNTRY_CODES`
   * ถ้ามีสำเนา วันที่เพิ่มรหัสใหม่ ตัวกวาดจะไม่เก็บของใต้รหัสนั้น **โดยไม่มีอะไรฟ้อง**
   * · 🎯 รูปเดียวกับที่กัดทีมทั้งวัน: *ข้อเท็จจริงที่ถูกเก็บไว้คนละที่กับสิ่งที่ทำให้มันจริง*
   */
  it("② ตัวกวาดต้องอ่านรหัสสงวนจากทะเบียน ไม่ใช่พิมพ์ซ้ำ", () => {
    expect(sweep, "ไม่ได้อ้าง TEST_COUNTRY_CODES เลย").toContain("TEST_COUNTRY_CODES");
    const literals = [...sweep.matchAll(/"([a-z]{2})"/g)].map((m) => m[1]);
    const reserved = new Set<string>(Object.values(TEST_COUNTRY_CODES));
    const copied = literals.filter((v) => reserved.has(v));
    expect(copied,
      `พบรหัสสงวนพิมพ์ซ้ำในตัวกวาด: ${copied.join(" ")} — อ่านจาก TEST_COUNTRY_CODES แทน`)
      .toEqual([]);
  });

  /**
   * 🔴 **ห้ามพิมพ์ project ref ซ้ำ** — วันนี้ ref ถูกฝังไว้สี่ที่แล้ว
   * ref ที่ล้าในตัวกวาด = **ด่านกันลบผิดฐานหยุดทำงานเงียบ ๆ** ซึ่งเป็นด่านที่แพงที่สุดที่จะเสีย
   */
  it("③ ตัวกวาดต้องอ่าน project ref จาก .github/allowed-project-ref ไม่ใช่พิมพ์ซ้ำ", () => {
    const ref = readFileSync(".github/allowed-project-ref", "utf-8").trim();
    expect(ref, "allowed-project-ref ไม่ใช่รูปแบบ project ref").toMatch(/^[a-z]{20}$/);
    expect(sweep, "ตัวกวาดไม่ได้อ่านจากแหล่งความจริง").toContain("allowed-project-ref");
    expect(sweep.includes(ref), `ตัวกวาดพิมพ์ ref ซ้ำลงไฟล์ — จะล้าเงียบวันที่ ref เปลี่ยน`).toBe(false);
  });

  /**
   * ⚠️ **ตัวกวาดห้ามล้มรอบเทสต์** — มันคือการเก็บกวาด ไม่ใช่ด่าน
   * 🔴 ถ้ามันโยนได้ วันที่ FK บล็อกมันจะแดงใส่คนที่ไม่ได้ทำอะไรผิด **แล้วจะถูกถอด wire ทิ้ง**
   *    และตอนถูกถอด ของที่มันเคยกันไว้ก็หายไปด้วยทั้งหมด
   */
  it("④ ตัวกวาดต้องไม่มีทาง throw ออกไปนอกตัวเอง", () => {
    expect(sweep, "ไม่มี try/catch ครอบการลบ — ลบไม่สำเร็จแล้วจะล้มรอบเทสต์").toContain("catch");
    const throws = [...sweep.matchAll(/^\s*throw\s/gm)];
    expect(throws.length,
      "ตัวกวาดมี `throw` — มันจะล้มรอบเทสต์ แล้วจะมีคนถอด wire ทิ้ง พร้อมของที่มันกันไว้").toBe(0);
  });
});
