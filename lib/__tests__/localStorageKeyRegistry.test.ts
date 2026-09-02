import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ทะเบียนจุดที่เขียน `localStorage` ตรง ๆ — เจ้าของ: P4-QA/Sec · 28 ส.ค. 2026 (P3 เจอ · P1 ขอ)
 *
 * ## ช่องที่ปิด
 * `clearAllCaches()` กวาดตาม prefix `trip-cache:` → **คีย์ที่เขียนดิบ ๆ รอดอัตโนมัติ**
 * · เกิดจริงแล้วสองตัว: `trip-passport-names` (ชื่อพาสปอร์ต) และ `trip-who`
 *   → **ข้อมูลส่วนตัวค้างบนเครื่องข้ามบัญชี** · P2 ปิดด้วย `hooks/personalLocalValue.ts`
 * 🎯 **แต่ไม่มีอะไรกันตัวที่สาม** — ไฟล์นี้คือตัวนั้น
 *
 * ## 🔴 ทำไมเป็นทะเบียน *จุดเรียก* ไม่ใช่ regex หา *สตริงตรง ๆ*
 * ด่านที่หา `setItem("ตัวอักษรล้วน")` **หลบได้ด้วยการใส่ค่าในตัวแปร**:
 * ```ts
 * const K = "trip-อะไรก็ได้"; localStorage.setItem(K, v);   // ← regex สตริงมองไม่เห็น
 * ```
 * และวันนี้ **ทุกจุดในโปรเจกต์เขียนแบบนั้นอยู่แล้ว** (`STORAGE_KEY`) → ด่านแบบสตริงจะได้ `0 hit`
 * **แล้วอ่านเป็น "ไม่มีใครเขียนดิบ ๆ" ทั้งที่มี 3 จุด** · ทะเบียนจุดเรียกจับได้ทั้งสองรูป
 *
 * ## ทางที่ปฏิเสธ (P3 เสนอ · P1 ไม่รับ · ผมเห็นด้วย)
 * *กลับทิศ default: ล้างทุกอย่างยกเว้นรายการ* → จะลบ `sb-*` auth token **ก่อน `auth.signOut()` ได้ใช้**
 * → เพิกถอน session ฝั่งเซิร์ฟเวอร์ไม่ได้ · และทำให้เคส "ไม่แตะคีย์ของแอปอื่น" แดง **ซึ่งเคสนั้นถูก**
 */

/** จุดที่เขียน `localStorage` ตรง ๆ ได้ — **ทะเบียน ไม่ใช่ใบอนุญาต** เหตุผลต้องหักล้างได้ */
const ALLOWED_WRITERS: Record<string, string> = {
  "lib/localCache.ts": "ตัวระบบแคชเอง — เป็นคนนิยาม prefix `trip-cache:` และเป็นคนกวาด",
  "hooks/personalLocalValue.ts": "ตัวห่อของ P2 ที่ย้ายคีย์ดิบเข้ามาอยู่ใต้ prefix — `removeItem` ของคีย์รุ่นเก่า",
  "hooks/useDarkTheme.ts": "`trip-today-theme` — ค่าตั้งของ *เครื่อง* ไม่ใช่ของบัญชี · **ต้องไม่ถูกล้างตอนออกจากระบบ**",
  "lib/i18n.ts": "`trip-lang` — ค่าตั้งของเครื่องเหมือนกัน",
  "components/TripPrepPanel.tsx": "`trip-prep-open` — สถานะเปิด/ปิดแผง ไม่ใช่ข้อมูลผู้ใช้",
  "lib/auth/deviceOwner.ts":
    "`trip-device-owner` — **ข้อมูลเกี่ยวกับแคช ไม่ใช่เนื้อในแคช** จึงอยู่นอก `trip-cache:` โดยเจตนา (`E6-AC14`) · " +
    "ถ้าอยู่ใน prefix `clearAllCaches()` จะลบมันไปด้วย → หลังล้างเสร็จเราจะแยกไม่ออกว่า " +
    "*'ล้างแล้วว่างสำหรับ B'* กับ *'ไม่รู้ว่าของใคร อาจเป็นของ A'* ซึ่งเป็นสองสถานะที่กลไกนี้ต้องแยก · " +
    "🔴 หักล้างได้ถ้า: มีทางอื่นที่บอกได้ว่าเครื่องนี้เป็นของใครหลังล้างแคช — วันนี้ไม่มี " +
    "(`getUser()` ยิงเน็ต จึงตอบไม่ได้ตอนออฟไลน์ ซึ่งเป็นเคสที่ `AC14` มีไว้แก้) · " +
    "⚠️ ตราถูก *ลบ* ตอนออกจากระบบผ่าน `stampDeviceOwner(null)` ไม่ใช่ผ่าน `clearAllCaches()` — คนละเส้นทางโดยตั้งใจ",
};

const WRITE = /\blocalStorage\s*\.\s*(setItem|removeItem)\s*\(/;

/**
 * ⚠️ **ไล่จาก `git ls-files` = เห็นเฉพาะไฟล์ที่ *ติดตามแล้ว*** — ไฟล์ใหม่ที่ยังไม่ `git add`
 * จะไม่ถูกสแกน · **ยอมรับได้** เพราะมันจะถูกจับตอน commit (ก่อน merge เสมอ) แต่ต้องรู้ว่า
 * *รันในเครื่องก่อน add แล้วเขียว* ไม่ได้แปลว่าไฟล์ใหม่สะอาด
 * 🔴 **ผมเจอข้อนี้เพราะควบคุมฝั่งลบรอบแรกของผม *ไม่แดง*** — วาง 2 ไฟล์โพรบแล้วด่านเงียบ
 *    เพราะยังไม่ได้ `git add` · **ถ้าไม่ยิงควบคุม ผมจะเชื่อว่าด่านนี้ถูกยืนยันแล้ว ทั้งที่ยังไม่เคยแดงเลย**
 */
function sourceFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /^(app|components|hooks|lib)\/.*\.tsx?$/.test(f))
    .filter((f) => !/\.test\.tsx?$/.test(f)); // ด่านที่ค้นหาแพตเทิร์น ย่อมมีแพตเทิร์นนั้นในตัว
}

function writers(): string[] {
  return sourceFiles().filter((f) => WRITE.test(stripTsComments(readFileSync(f, "utf8"))));
}

describe("ทะเบียนจุดที่เขียน localStorage ตรง ๆ", () => {
  it("🔴 ควบคุมฝั่งบวก — ต้องหาจุดเขียนเจอจริง ไม่งั้น `0 offender` แปลว่า regex พัง", () => {
    // `P-21`: "สแกนแล้วไม่เจอ" กับ "สแกนไม่เป็น" ให้ผลเหมือนกันเป๊ะ
    expect(writers().length, "หาจุดที่เขียน localStorage ไม่เจอสักไฟล์ — ตัวสแกนพัง").toBeGreaterThan(3);
  });

  it("🔴 ต้องตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ *เล่าถึง* บั๊กเก่าต้องไม่ถูกนับเป็นผู้เขียน", () => {
    // P1 เกือบรายงานว่ายังมีคีย์หลุด 2 จุด — ทั้งคู่อยู่ในคอมเมนต์ที่บรรยายบั๊กที่แก้ไปแล้ว
    const src = readFileSync("components/ImmigrationSheet.tsx", "utf8");
    expect(WRITE.test(src), "ไฟล์นี้ต้องยังพูดถึง localStorage ในคอมเมนต์ ไม่งั้นเคสนี้เลิกพิสูจน์อะไร").toBe(true);
    expect(WRITE.test(stripTsComments(src)), "ตัดคอมเมนต์แล้วต้องไม่เหลือการเขียนจริง").toBe(false);
  });

  it("🔴 จุดเขียนใหม่ต้องมาขึ้นทะเบียนพร้อมเหตุผล — คีย์นอก `trip-cache:` ไม่ถูก `clearAllCaches` กวาด", () => {
    const offenders = writers().filter((f) => !(f in ALLOWED_WRITERS));
    expect(
      offenders.sort(),
      "ไฟล์พวกนี้เขียน localStorage ตรง ๆ โดยไม่ขึ้นทะเบียน\n" +
        "  🔴 ถ้าคีย์อยู่นอก `trip-cache:` มันจะ **รอด `clearAllCaches()` ตอนออกจากระบบ**\n" +
        "     → ข้อมูลค้างบนเครื่องให้บัญชีถัดไปเห็น (เกิดจริงกับ `trip-passport-names`)\n" +
        "  → ทางที่ถูก: เขียนผ่าน `writeCache`/`personalLocalValue` · หรือมาขึ้นทะเบียนพร้อมเหตุผล",
    ).toEqual([]);
  });

  it("🔴 ทะเบียนต้อง *ผิดได้* — ชื่อที่เลิกเขียน `localStorage` แล้ว ต้องหลุดออก", () => {
    // ถ้าไม่มีเคสนี้ ทะเบียนจะโตอย่างเดียวและเลิกสะท้อนความจริง (รูปเดียวกับ KNOWN_UNSCOPED)
    const stale = Object.keys(ALLOWED_WRITERS).filter((f) => !writers().includes(f));
    expect(stale.sort(), "ชื่อพวกนี้ไม่ได้เขียน localStorage แล้ว — ลบออกจากทะเบียน").toEqual([]);
  });
});
