import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { ROOT, chainTo, rel, sourceFilesUnder, walk } from "./_importGraph";

/**
 * 🔴 **ไม่มีไฟล์นอก `app/api/**` ที่เชื่อมถึง DAL (`lib/engine/db.ts`)**
 *
 * ## ทำไมด่านนี้ถึงมีอยู่ — มันค้ำสมมติฐานของ *ประตูตรวจสิทธิ์*
 * `docs/engine/offline-auth-gate.md` เสนอให้ `proxy.ts` **ปล่อยผ่านตอนติดต่อ auth ไม่ได้**
 * ความปลอดภัยของการผ่อนนั้นตั้งอยู่บนข้อเดียว: **หน้าเว็บไม่เรนเดอร์ข้อมูลจากเซิร์ฟเวอร์**
 * (ได้แค่ shell · ข้อมูลจริงมาจาก IndexedDB ของเบราว์เซอร์ผู้ใช้เอง · `/api/*` ยัง `401`)
 *
 * 🎯 **ข้อนั้นจริงวันนี้ (วัดแล้ว 0/13) แต่ไม่มีอะไรเฝ้ามัน** — และมันคือรูปเดียวกับ
 * คอมเมนต์ที่ประตูนั้นกำลังแก้อยู่พอดี: `proxy.ts` เขียนว่า *"ไม่มี Supabase = ไม่มีข้อมูลให้แสดง"*
 * ซึ่ง **จริงตอนเขียน · เท็จหลัง `E6` ทำแคชออฟไลน์เสร็จ** และไม่มีใครกลับไปแตะ
 * → **ผ่อนประตูโดยไม่ลงด่าน = สร้างสมมติฐานที่ไม่มีใครเฝ้าอีกใบ ที่ค้ำด่านความปลอดภัย**
 *
 * ⚠️ ขอบเขต (สืบทอดจาก `_importGraph`): ตอบว่า *"โค้ดเชื่อมถึงกันไหม"*
 * ไม่ได้ตอบว่า *"เรนเดอร์ข้อมูลออกมาจริงไหม"* — ไฟล์ที่เชื่อมถึง DAL แต่ไม่เรียกก็แดง (ตั้งใจ:
 * เชื่อมถึงได้ = เรียกได้ในคอมมิตถัดไปโดยไม่มีอะไรฟ้อง)
 */
const DAL = resolve(ROOT, "lib/engine/db.ts");
const appFiles = sourceFilesUnder(resolve(ROOT, "app"));
const outsideApi = appFiles.filter((f) => !rel(f).startsWith("app/api/"));
const insideApi = appFiles.filter((f) => rel(f).startsWith("app/api/"));

describe("ไม่มีเส้นทางเรนเดอร์ข้อมูลฝั่งเซิร์ฟเวอร์นอก /api", () => {
  it("③ จักรวาลไม่ว่าง และมาจากดิสก์ — ทั้งสองฝั่งต้องมีของ", () => {
    expect(appFiles.length, "ไม่เจอไฟล์ใต้ app/ เลย — ตัวเดินไฟล์พัง").toBeGreaterThan(20);
    expect(outsideApi.length, "ไม่เจอไฟล์นอก app/api เลย — เคสข้างล่างจะเขียวฟรี").toBeGreaterThan(5);
    expect(insideApi.length).toBeGreaterThan(5);
  });

  it("④ เคสควบคุมฝั่งบวก — ตัวไล่กราฟหา DAL เจอจริง (ไม่งั้นเคสหลักเขียวเพราะตาบอด)", () => {
    const reachers = insideApi.filter((f) => walk(f).has(DAL));
    expect(
      reachers.length,
      "ไม่มีไฟล์ใน app/api/ ที่เชื่อมถึง lib/engine/db.ts เลย — ตัวไล่กราฟน่าจะพัง ไม่ใช่โค้ดสะอาด",
    ).toBeGreaterThan(5);
  });

  it("🔴 ไม่มีไฟล์นอก app/api/ ที่เชื่อมถึง lib/engine/db.ts", () => {
    const offenders = outsideApi
      .filter((f) => walk(f).has(DAL))
      .map((f) => `${rel(f)}\n    → ${chainTo(walk(f), DAL)}`);
    expect(
      offenders,
      "หน้าเว็บเชื่อมถึง DAL ได้ = เรนเดอร์ข้อมูลฝั่งเซิร์ฟเวอร์ได้ → สมมติฐานของ offline-auth-gate พังทันที",
    ).toEqual([]);
  });
});
