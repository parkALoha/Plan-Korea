import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { stripTsComments } from "./_helpers";

const ROOT = join(__dirname, "..", "..");
const OWNER = "lib/auth/deviceOwner.ts";
const SYMBOL = "readDeviceOwner";

/**
 * 🔴 **ตรึงข้อเท็จจริงที่ `deviceOwnerStamp.test.tsx` ③④ ใช้เป็นฐาน** (P4 · 2 ก.ย. 2026)
 *
 * `E6-AC14` กลับด้านเคส ③④ จาก *"sign-out แล้วตราต้องหาย"* เป็น *"ตราต้องอยู่ต่อ"*
 * เหตุผลที่รองรับการกลับด้าน คือ **ไม่มีใครอ่านตราเลยนอกจาก `stampDeviceOwner()` เอง**
 * ⇒ ตราที่ค้าง **ไม่ได้หลอกใคร** เพราะไม่มีผู้อ่านให้หลอก · ส่วนตราที่หาย **เปิดรู `X → null → Y`**
 *
 * 🔴 **แต่ข้อเท็จจริงนั้นถูกบันทึกไว้ในคอมเมนต์ ไม่ใช่ในด่าน** — และ `readDeviceOwner` **ถูก export**
 * วันที่มีผู้อ่านคนแรกเกิดขึ้น เหตุผลของ ③④ จะเป็นเท็จ **โดยที่ ③④ ยังเขียวทั้งคู่**
 * เพราะมันไม่ได้ทดสอบเงื่อนไขนั้น มันทดสอบผลที่ตามมาจากเงื่อนไขนั้น
 *
 * 🎯 **หลักฐานที่ไม่มีวิธีทำซ้ำ ไม่ใช่หลักฐาน มันคือความจำ** — ไฟล์นี้ทำให้มันรันซ้ำได้
 * · ⚠️ **ไม่ได้แปลว่าห้ามมีผู้อ่านตลอดกาล** — แปลว่าถ้าจะมี **ต้องกลับไปทบทวน ③④ พร้อมกัน**
 *   ซึ่งเป็นสิ่งที่การลบบรรทัดนี้ทิ้งเฉย ๆ ทำไม่ได้โดยไม่มีใครเห็น
 */
describe("E6-AC14 — ผู้อ่านตราเจ้าของเครื่อง ต้องมีแค่ไฟล์ที่นิยามมัน", () => {
  /**
   * ⚠️ **จักรวาลมาจาก `git ls-files` → ไฟล์ที่ยัง untracked มองไม่เห็น**
   * ใน CI ถูกต้อง (ทุกอย่าง commit แล้ว) · **ในเครื่องอ่านเป็นเขียวได้ ขณะที่ barrel ใหม่ยังไม่ถูก `git add`**
   * · เจอตอนยิงทิศแดง: ต้อง `git add -N` ก่อน เคสถึงเห็นไฟล์ที่เพิ่งสร้าง
   */
  const sources = () =>
    execFileSync("git", ["ls-files", "app", "lib", "hooks", "components"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__"));

  /**
   * ⚠️ **ควบคุมเครื่องวัด — ถ้าชื่อสัญลักษณ์พิมพ์ผิด ทุกไฟล์จะได้ 0 แล้วเคสหลักเขียวตลอดกาล**
   * 🔴 นี่คือ *ทิศบวก* ที่ต้องมาก่อน ผลลบข้างล่างถึงจะมีความหมาย
   */
  it("เครื่องวัดทำงาน: ไฟล์ที่นิยามต้องเอ่ยถึงสัญลักษณ์นี้จริง", () => {
    const src = stripTsComments(readFileSync(join(ROOT, OWNER), "utf8"));
    expect(
      src.includes(SYMBOL),
      `หา \`${SYMBOL}\` ใน ${OWNER} ไม่เจอ — ชื่อเปลี่ยนหรือไฟล์ย้าย · เคสข้างล่างไม่มีความหมายจนกว่าจะแก้ข้อนี้`,
    ).toBe(true);
  });

  /**
   * 🔴 **รูที่ตัวจับข้างล่างมองไม่เห็นตามนิยาม — `export *` ไม่มีชื่อสัญลักษณ์อยู่ในบรรทัดเลย**
   *
   * ยิงเทียบ 6 ท่าแล้ว: เรียกตรง · re-export ระบุชื่อ · ตั้งชื่อใหม่ · dynamic import ·
   * namespace import → **จับได้ทั้งหมด** (ชื่อโผล่ที่ใดที่หนึ่งเสมอ)
   * · `export * from ".../deviceOwner"` → **มองไม่เห็น** เพราะไม่มีคำว่า `readDeviceOwner` สักตัว
   *
   * ✅ วันนี้รีโปไม่ใช้ `export *` เลยสักไฟล์ — **แต่ "วันนี้ยังไม่มีใครทำ" ไม่ใช่ด่าน**
   * · ครอบการต่อผ่านตัวกลางด้วย (`lib/auth/index.ts` ที่ `export * from "./deviceOwner"` จะโดนข้อนี้)
   */
  it("🔴 ไม่มีไฟล์ไหน re-export ทั้งโมดูลด้วย `export *`", () => {
    const re = /export\s+\*\s+from\s+["'`][^"'`]*deviceOwner["'`]/;
    const barrels = sources().filter(
      (f) => f !== OWNER && re.test(stripTsComments(readFileSync(join(ROOT, f), "utf8"))),
    );
    expect(
      barrels,
      `มี barrel ที่พ่วง ${SYMBOL} ออกไปโดยไม่เอ่ยชื่อ: ${barrels.join(" · ")}\n` +
        "  ⇒ เคสข้างล่างจับไม่ได้ตามนิยาม — ต้องไล่ผู้อ่านผ่าน barrel นั้นด้วยมือ",
    ).toEqual([]);
  });

  it("🔴 ไม่มีโค้ดโปรดักชันไฟล์อื่นเรียก readDeviceOwner()", () => {
    const callers = sources().filter((f) => {
      if (f === OWNER) return false;
      return stripTsComments(readFileSync(join(ROOT, f), "utf8")).includes(SYMBOL);
    });
    expect(
      callers,
      `มีผู้อ่านตราเพิ่มขึ้น: ${callers.join(" · ")}\n` +
        "  ⇒ เหตุผลที่รองรับ `deviceOwnerStamp.test.tsx` ③④ (ตราค้างไม่หลอกใคร) ไม่จริงอีกต่อไป\n" +
        "  ⇒ ทบทวน ③④ พร้อมกัน — อย่าลบเคสนี้ทิ้งเพื่อให้ผ่าน",
    ).toEqual([]);
  });
});
