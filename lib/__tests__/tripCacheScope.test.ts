import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * คีย์แคชที่ผูกกับทริป ต้องผ่าน `readTripCache`/`writeTripCache` เท่านั้น — `D4` / `E6-AC6`
 * เจ้าของ: P3-FE/Perf · 27 ส.ค. 2026 (API ของคีย์เป็นของ P1 · `a24ce80`)
 *
 * ## 🔴 บั๊กที่ด่านนี้กันไม่ให้กลับมา
 * 5 คีย์ (`hotels` `bookings` `customPlaces` `overnightOverrides` `plans`) เคยเขียนด้วย
 * `writeCache("hotels", …)` เฉย ๆ **ไม่มี `tripId`** → สลับทริป A→B **ผู้ใช้เห็นของทริป A เป็นของ B**
 * · ออฟไลน์ = ไม่มี fetch มาทับ = **ค้างถาวร**
 *
 * 🎯 **มันรอดสายตามาถึงวันนี้เพราะคีย์ที่ *ลืม* ใส่ scope หน้าตาเหมือนคีย์ที่ *ตั้งใจ* ให้ global เป๊ะ**
 * (`lastTripId` ตั้งใจข้ามทริป · `hotels` ไม่ได้ตั้งใจ — แต่โค้ดสองบรรทัดนั้นแยกกันไม่ออกด้วยตาเปล่า)
 * → ด่านนี้ทำให้ความต่างนั้น **มีคนเห็นตอนเพิ่มโค้ด ไม่ใช่ตอนผู้ใช้เจอ**
 *
 * ## กติกาสามชนิด (P1 เขียนไว้ที่หัว `lib/localCache.ts`)
 * ```
 * ผูกทริป   readTripCache/writeTripCache   ← ด่านนี้บังคับเฉพาะกลุ่มนี้
 * ผูกแผน    `xxx:{planId}`                  planId เป็น uuid ไม่ซ้ำข้ามทริป จึงปลอดภัยอยู่แล้ว
 * global    ตั้งใจให้ข้ามทริป               lastTripId · catalog:* (คลังสาธารณะ เนื้อเหมือนกันทุกทริป)
 * ```
 */

/** ชื่อที่เป็น "ข้อมูลของทริปหนึ่ง" — ห้ามโผล่ใน `readCache`/`writeCache` แบบไม่มี scope */
const TRIP_SCOPED_NAMES = ["hotels", "bookings", "customPlaces", "overnightOverrides", "plans", "days"];

/**
 * ดึงคีย์ที่เป็น *สตริงตรง ๆ* ที่ถูกส่งให้ที่เก็บ — ข้าม template literal (backtick)
 *
 * 🔴 **ขยายให้ครอบ IndexedDB ตอน `E6-AC7` ย้ายที่เก็บ** (P7 · 4 ก.ย. 2026 · **ไฟล์นี้เป็นของ P3**)
 * เดิมจับเฉพาะ `readCache`/`writeCache` — **ซึ่งคือ API ทั้งหมดที่มีอยู่ตอนเขียนด่านนี้**
 * · พอ hook ย้ายไป `storeSet`/`writeHandoff` **ด่านนี้มองไม่เห็นมันเลย** → `storeSet("hotels", rows)`
 *   ที่ไม่มี `tripId` ผ่านฉลุย **ซึ่งคือบั๊กเดิมเป๊ะ ๆ ที่ไฟล์นี้มีอยู่เพื่อกัน**
 * 🎯 **การย้ายที่เก็บไม่ได้ทำให้ด่าน *ผิด* — มันทำให้ด่าน *มองไม่เห็น* ซึ่งอ่านเหมือนกันจากผลรัน**
 *    (`TEAM.md §3.4`: *"ถามว่าสภาพแวดล้อมเดิมรับประกันอะไรให้ฟรี"* — อันนี้คือของที่เคยได้ฟรี)
 * · ⚠️ **สแกนสตริง ไม่ใช่สัญลักษณ์** — เปลี่ยนชื่อ alias ตอน import (`set as putThing`) แล้วหลุด
 *   **กันคนที่เผลอ ไม่ได้กันคนที่ตั้งใจ** · ชื่อในรายการคือชื่อที่รีโปนี้ใช้จริงวันนี้
 */
const STORAGE_CALLS = [
  "readCache", "writeCache", // localStorage — `lib/localCache.ts`
  "storeGet", "storeSet", // IndexedDB — alias ที่ทุก hook ใช้ (`get as storeGet`)
  "readHandoff", "writeHandoff", "writeHandoffNoisily", // สะพานสองที่เก็บ — `lib/engine/cacheHandoff.ts`
];

function bareCacheKeys(source: string): string[] {
  const found: string[] = [];
  const re = new RegExp(`\\b(?:${STORAGE_CALLS.join("|")})\\s*(?:<[^>]*>)?\\s*\\(\\s*(["'])([^"']*)\\1`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) found.push(m[2]);
  return found;
}

function hookSources(): { file: string; source: string }[] {
  const dir = join(process.cwd(), "hooks");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => ({ file: f, source: readFileSync(join(dir, f), "utf8") }));
}

/**
 * 🔴 นับ hook *ทุกชั้น* เพื่อเทียบกับตัวที่สแกนจริง (ชั้นเดียว) — P5 เสนอ · P4 รับ · 29 ส.ค. 2026
 * เกณฑ์เดิม `> 5` เกิดจากเคส "ย้ายหมดทั้งโฟลเดอร์" จึงมีรูปร่างของเหตุการณ์นั้น
 * **ไม่ครอบเคสที่ใกล้กว่ามาก: มีคนสร้าง `hooks/trip/` แล้วใส่ hook ใหม่ไว้ในนั้น**
 */
function countAllHooks(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countAllHooks(join(dir, e.name));
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) n += 1;
  }
  return n;
}

describe("คีย์แคชที่ผูกกับทริป", () => {
  it("🔴 ไม่มี hook ซ่อนอยู่ในโฟลเดอร์ย่อย — ตัวสแกนอ่านชั้นเดียว", () => {
    // เทียบ *สิ่งที่สแกนจริง* กับ *สิ่งที่มีอยู่จริง* แทนการตั้งเลขขั้นต่ำ
    // → แดงอัตโนมัติวินาทีที่มีคนสร้าง `hooks/trip/` ซึ่งเป็นสิ่งที่ไฟล์นี้กลัวอยู่พอดี
    expect(
      hookSources().length,
      "มี hook อยู่ในโฟลเดอร์ย่อยที่ `readdirSync` ชั้นเดียวมองไม่เห็น — ตัวสแกนกำลังข้ามมันเงียบ ๆ",
    ).toBe(countAllHooks(join(process.cwd(), "hooks")));
  });

  it("🔴 ตัวเดินไฟล์ต้องเดินถึง hook จริง — ควบคุมข้างล่างพิสูจน์ *ตัวจับคู่* ไม่ใช่ *คลัง*", () => {
    /**
     * 🔴 **ควบคุมฝั่งบวกข้างล่างป้อน *สตริงตายตัว* เข้า `bareCacheKeys` — ไม่ผ่าน `hookSources()`**
     * → พิสูจน์ว่า regex จับของผิดได้ **แต่ไม่ได้พิสูจน์ว่ามีไฟล์ให้จับ**
     * · `readdirSync` **ไม่ recursive** → วันที่มีคนย้าย hook เข้าโฟลเดอร์ย่อย (`hooks/trip/…`)
     *   คลังจะว่าง `offenders` จะเป็น `[]` **แล้วเคสข้างล่างเขียวโดยไม่ได้ตรวจอะไรเลย**
     * · ยิงจริง (P4 · 28 ส.ค. 2026): ย้าย hook ทั้งหมดลง `hooks/trip/` → **เคสผู้ละเมิดเขียว**
     *   (ที่แดงคือเคส import ซึ่งเป็นคนละเรื่อง — **ไฟล์นี้รอดโดยบังเอิญ ไม่ใช่เพราะมีตัวกัน**)
     * 🎯 รูปเดียวกับ `bookingFileStorageGate` (`examined > 50`) — คนละไฟล์ รูปเดียวกัน
     */
    expect(
      hookSources().length,
      "ไม่เจอไฟล์ hook เลย — โฟลเดอร์ถูกย้าย/ซ้อนชั้น ไม่ใช่ 'ไม่มีผู้ละเมิด'\n" +
        "  · `readdirSync` ไม่ recursive · ถ้า hook ย้ายลงโฟลเดอร์ย่อย ต้องแก้ตัวเดิน ไม่ใช่แก้เลขนี้",
    ).toBeGreaterThan(5);
  });

  it("🔴 ไม่มี hook ไหนเรียก readCache/writeCache ด้วยชื่อที่เป็นข้อมูลของทริป", () => {
    const offenders: string[] = [];
    for (const { file, source } of hookSources()) {
      for (const key of bareCacheKeys(source)) {
        if (TRIP_SCOPED_NAMES.includes(key)) offenders.push(`${file} → "${key}"`);
      }
    }
    expect(
      offenders,
      `คีย์พวกนี้เป็นข้อมูลของทริป ต้องใช้ readTripCache/writeTripCache แทน:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  /**
   * 🔴 เคสบนบอกได้แค่ *"ไม่มีของผิด"* — เคสนี้บอกว่า *"มีของถูกอยู่จริง"*
   * ถ้าใครลบการอ่านแคชทิ้งทั้งก้อน เคสบนจะยังเขียว แต่เคสนี้จะแดง
   *
   * ## 🔴 ตัวบังคับคือ `tripKey(` แล้ว ไม่ใช่ `readTripCache` (P7 · 4 ก.ย. 2026 · `E6-AC7`)
   * ทั้ง 5 ไฟล์ย้ายไป IndexedDB ครบ ⇒ **ไม่มี hook ไหนเรียก `readTripCache`/`writeTripCache` อีกเลย**
   * · **ไม่ใช่การผ่อนเกณฑ์** — คำถามยังเป็นข้อเดิม (*"ไฟล์นี้มีตัวบังคับ `tripId` ลงคีย์อยู่จริงไหม"*)
   *   เปลี่ยนแค่ *ชื่อของตัวที่บังคับ* เพราะที่เก็บเปลี่ยน
   * · 📌 **ฉบับกลางทางรับทั้งสองชื่อ** ตอนที่ย้ายไปได้ 3 จาก 5 · ตัดขาเก่าทิ้งทันทีที่ครบ
   *   **เกณฑ์ที่กว้างค้างไว้หลังเหตุผลหมดไป คือเกณฑ์ที่ยอมรับของที่เราตั้งใจเลิกใช้**
   */
  it("hook ที่ถือข้อมูลของทริป ต้อง import ตัวที่บังคับ scope จริง ๆ", () => {
    const mustScopeByTrip = [
      "useHotels.tsx",
      "useBookings.tsx",
      "useCustomPlaces.tsx",
      "useOvernightOverrides.ts",
      "usePlans.ts",
    ];
    const missing = mustScopeByTrip.filter((f) => {
      const src = readFileSync(join(process.cwd(), "hooks", f), "utf8");
      return !src.includes("tripKey(");
    });
    expect(
      missing,
      `ไฟล์พวกนี้ต้องผูกคีย์แคชกับ \`tripId\` ผ่าน \`tripKey(tripId, …)\`: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("คีย์ที่ผูกกับแผน (`xxx:{planId}`) ต้องไม่ถูกจับผิด — planId ผูกทริปอยู่แล้ว", () => {
    // เคสควบคุม: ตัวสแกนต้อง **ไม่** เห็น template literal เป็นคีย์ตรง
    expect(bareCacheKeys("writeCache(`daySettings:${planId}`, x)")).toEqual([]);
    expect(bareCacheKeys('readCache<T>("lastTripId")')).toEqual(["lastTripId"]);
  });

  it("🔴 เคสควบคุมฝั่งบวก — ตัวสแกนจับของผิดได้จริง ไม่ใช่คืนอาเรย์ว่างเสมอ", () => {
    // ถ้าบรรทัดนี้ไม่แดงเวลามีของผิด เคสแรกทั้งเคสก็ไม่ได้พิสูจน์อะไรเลย
    const violating = 'const c = readCache<TripHotel[]>("hotels");\nwriteCache("bookings", rows);';
    const keys = bareCacheKeys(violating);
    expect(keys).toEqual(["hotels", "bookings"]);
    expect(keys.filter((k) => TRIP_SCOPED_NAMES.includes(k))).toHaveLength(2);
  });

  /**
   * 🔴 **ควบคุมฝั่งบวกของ *ที่เก็บใหม่* — เคสข้างบนพิสูจน์เฉพาะ `localStorage`** (P7 · `E6-AC7`)
   * ถ้าไม่มีเคสนี้ การขยาย `STORAGE_CALLS` จะ *ดูเหมือน* ปิดช่องแล้วโดยไม่มีอะไรยืนยัน —
   * และช่องที่ปิดไม่จริงอ่านเหมือนช่องที่ปิดแล้วเป๊ะ **เพราะทั้งคู่เขียว**
   */
  it("🔴 เคสควบคุมฝั่งบวก — ที่เก็บใหม่ (IndexedDB/สะพาน) ต้องถูกจับด้วย", () => {
    expect(bareCacheKeys('const c = await storeGet<TripHotel[]>("hotels");')).toEqual(["hotels"]);
    expect(bareCacheKeys('void storeSet("bookings", rows);')).toEqual(["bookings"]);
    expect(bareCacheKeys('await readHandoff<T>("plans");')).toEqual(["plans"]);
    expect(bareCacheKeys('writeHandoffNoisily("customPlaces", rows, "customPlaces");')).toEqual([
      "customPlaces",
    ]);
    // เคสควบคุมฝั่งลบ — คีย์ที่ผูกทริปแล้วต้อง **ไม่** ถูกจับ (ไม่งั้นด่านแดงใส่คนที่ทำถูก แล้วจะถูกลบทั้งใบ)
    expect(bareCacheKeys("void storeSet(tripKey(id, `hotels`), rows);")).toEqual([]);
    expect(bareCacheKeys('await readHandoff<T>(tripKey(activeTripId, "plans"));')).toEqual([]);
  });
});
