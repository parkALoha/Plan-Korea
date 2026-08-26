import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
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
});
