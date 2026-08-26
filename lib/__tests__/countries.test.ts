import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
  shouldSkipTravelApi,
  countriesWithCapabilities,
  hasRealTravelTime,
  mapProvidersFor,
} from "../engine/countries";

/**
 * `E4-AC1`/`AC3` — ทะเบียนความสามารถรายประเทศ
 *
 * 🔴 **เคสที่สำคัญที่สุดคือเคสประเทศที่ *ไม่มี* ในทะเบียน** — ไม่ใช่เคสที่มี
 * `E4-AC1` วัดว่า *"สร้างทริปญี่ปุ่นได้โดยไม่แก้โค้ดสักบรรทัด"* · ถ้าประเทศที่ไม่รู้จักทำให้พัง
 * การเพิ่มญี่ปุ่นจะกลายเป็นการแก้โค้ดทันที และ `AC1` ตกทุกครั้งโดยไม่มีใครสังเกต
 */
describe("E4 — ทะเบียนความสามารถรายประเทศ", () => {
  it("🔴 ประเทศที่ไม่มีในทะเบียน ต้องใช้งานได้ ไม่ใช่พัง (`E4-AC1`)", () => {
    for (const unknown of ["jp", "JP", "th", "us", "xx"]) {
      const cap = capabilitiesOf(unknown);
      expect(cap, `${unknown} ต้องได้ค่ากลับ ไม่ใช่ undefined`).toBeTruthy();
      expect(cap.mapProviders.length, `${unknown} ต้องมีแผนที่ให้ใช้อย่างน้อยหนึ่งเจ้า`).toBeGreaterThan(0);
    }
  });

  it("🔴 ประเทศที่ไม่รู้จัก ต้องถือว่าเวลาเดินทาง **เป็นประมาณการทุกโหมด**", () => {
    // ทิศของการเดาผิดสำคัญกว่าความแม่น: เดาว่า "ตอบได้" แล้วผิด = ผู้ใช้เห็นเวลาผิดโดยไม่มีป้าย
    // เดาว่า "ตอบไม่ได้" แล้วผิด = เห็นป้าย "(ประมาณการ)" เกินจริง — **อย่างหลังกู้ได้ อย่างแรกไม่**
    for (const mode of ["TRANSIT", "DRIVE", "WALK"] as const) {
      expect(hasRealTravelTime("jp", mode), `jp/${mode} ไม่ควรถูกถือว่าเป็นเวลาจริง`).toBe(false);
    }
  });

  it("null / undefined / สตริงว่าง ต้องไม่โยน", () => {
    for (const v of [null, undefined, ""]) {
      expect(() => capabilitiesOf(v)).not.toThrow();
      expect(mapProvidersFor(v).length).toBeGreaterThan(0);
    }
  });

  it("🔴 ด้านบวก — เกาหลีต้องต่างจากค่าเริ่มต้นจริง ไม่งั้นทะเบียนไม่ได้ทำอะไรเลย", () => {
    // ถ้าข้อนี้ไม่มี เคสข้างบนจะเขียวได้แม้ทะเบียนว่างเปล่าทั้งใบ
    expect(hasRealTravelTime("kr", "TRANSIT"), "PLAN.md §2: เกาหลีมี TRANSIT จริง").toBe(true);
    expect(hasRealTravelTime("kr", "DRIVE"), "PLAN.md §2: เกาหลีไม่มี DRIVE (ข้อจำกัดกฎหมาย)").toBe(false);
    expect(hasRealTravelTime("kr", "WALK"), "PLAN.md §2: เกาหลีไม่มี WALK").toBe(false);
    expect(mapProvidersFor("kr")[0], "เกาหลีควรเห็นเจ้าถิ่นก่อน").not.toBe("google");
  });

  it("ตัวพิมพ์ใหญ่/เล็กของรหัสประเทศต้องไม่ทำให้ผลต่างกัน", () => {
    expect(capabilitiesOf("KR")).toEqual(capabilitiesOf("kr"));
  });

  it("🔴 ทุกประเทศในทะเบียนต้องมีแผนที่อย่างน้อยหนึ่งเจ้า — แถวที่ลืมใส่จะทำให้ปุ่มหายทั้งหน้า", () => {
    for (const c of countriesWithCapabilities()) {
      expect(mapProvidersFor(c).length, `${c} ไม่มี mapProviders`).toBeGreaterThan(0);
    }
  });

  describe("shouldSkipTravelApi — 'อย่ายิง' ไม่ใช่ 'อย่าเชื่อ'", () => {
    it("🔴 ประเทศที่ไม่รู้จัก ต้อง **ยิงตามปกติ** ไม่ใช่ข้าม", () => {
      // ถ้าข้ามด้วย จะไม่มีวันรู้ว่าญี่ปุ่นตอบ DRIVE ได้จริงไหม เพราะไม่เคยถาม
      // → ทะเบียนจะ "ถูก" ตลอดไปโดยไม่มีใครท้าทายได้ · คำทำนายที่ทำให้ตัวเองเป็นจริง
      for (const mode of ["TRANSIT", "DRIVE", "WALK"] as const) {
        expect(shouldSkipTravelApi("jp", mode), `jp/${mode} ต้องไม่ถูกข้าม`).toBe(false);
      }
      expect(shouldSkipTravelApi(null, "DRIVE")).toBe(false);
    });

    it("🔴 ข้ามเฉพาะที่ **รู้แน่ว่าไม่มี** — และต้องไม่ข้ามโหมดที่มี", () => {
      expect(shouldSkipTravelApi("kr", "DRIVE"), "รู้แน่ว่าเกาหลีไม่มี → ข้าม").toBe(true);
      expect(shouldSkipTravelApi("kr", "WALK")).toBe(true);
      expect(shouldSkipTravelApi("kr", "TRANSIT"), "เกาหลีมี TRANSIT → ห้ามข้าม").toBe(false);
      expect(shouldSkipTravelApi("vn", "DRIVE"), "เวียดนามมีครบ → ห้ามข้าม").toBe(false);
    });

    it("🎯 ความต่างจาก hasRealTravelTime อยู่ที่ประเทศที่ไม่รู้จัก — ถ้าเหมือนกันแปลว่าฟังก์ชันนี้ไม่จำเป็น", () => {
      expect(hasRealTravelTime("jp", "DRIVE")).toBe(false); // ไม่รู้ → ถือเป็นประมาณการ
      expect(shouldSkipTravelApi("jp", "DRIVE")).toBe(false); // แต่ยังต้องยิงเพื่อไปรู้
    });
  });
});
