import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildDayBridge, dayBridgeWarning } from "../engine/dayBridge";
import { stripTsComments } from "./_helpers";

/**
 * `E3` — สะพาน `"d0"` ⇄ `date` ⇄ `uuid` (`P-72`)
 *
 * 🔴 **เคสที่สำคัญที่สุดไม่ใช่เคสที่แปลงถูก — คือเคสที่ *ไม่มีอะไรให้แปลง***
 * ถ้า `E7` ยังไม่ได้ย้ายข้อมูล ฐานไม่มีแถวเลย → ทุกการแปลงคืน `null`
 * → hook ทุกตัวเงียบและไม่ทำอะไร **โดยไม่มี error ที่ไหน หน้าจอดูเหมือนแค่ "ยังไม่มีข้อมูล"**
 * นั่นคือกับดัก `P-21` เป๊ะ: *สแกนความว่างเปล่า* กับ *สแกนแล้วไม่เจอ* ให้ผลเหมือนกัน
 */
const L = (id: string, date: string) => ({ id, date });

describe("buildDayBridge", () => {
  const legacy = [L("d0", "2026-10-11"), L("d1", "2026-10-12"), L("d2", "2026-10-13")];
  const db = [L("u0", "2026-10-11"), L("u1", "2026-10-12"), L("u2", "2026-10-13")];

  it("จับคู่ด้วย `date` ได้ทั้งสองทาง", () => {
    const b = buildDayBridge(legacy, db);
    expect(b.toDbId("d1")).toBe("u1");
    expect(b.toLegacyId("u2")).toBe("d2");
    expect(b.matched).toBe(3);
  });

  it("วันที่ไม่รู้จัก → `null` ทั้งสองทาง", () => {
    const b = buildDayBridge(legacy, db);
    expect(b.toDbId("d99")).toBeNull();
    expect(b.toLegacyId("ไม่มี")).toBeNull();
  });

  it("🔴 ฐานว่างเปล่า → `matched` เป็น 0 **และบอกได้ว่าเพราะ `E7` ยังไม่รัน**", () => {
    const b = buildDayBridge(legacy, []);
    expect(b.matched).toBe(0);
    expect(b.unmatchedLegacy).toEqual(["d0", "d1", "d2"]);
    expect(dayBridgeWarning(b, legacy.length)).toContain("E7 ยังไม่ได้ย้ายข้อมูล");
  });

  it("🔴 ขาดบางวัน → ข้อความ **คนละอันกับ** ยังไม่ย้ายเลย", () => {
    // สองสาเหตุนี้คนละเรื่องและคนละทางแก้ · ยุบรวมเป็น "ไม่เจอ" = ไม่มีใครรู้ว่าต้องทำอะไร
    const b = buildDayBridge(legacy, [db[0], db[2]]);
    expect(b.matched).toBe(2);
    expect(b.unmatchedLegacy).toEqual(["d1"]);
    const w = dayBridgeWarning(b, legacy.length);
    expect(w).toContain("d1");
    expect(w).not.toContain("E7");
  });

  it("วันที่มีในฐานแต่ไม่มีในไฟล์ → `unmatchedDb` (ทริปที่สร้างบนแพลตฟอร์ม)", () => {
    const b = buildDayBridge(legacy, [...db, L("u9", "2026-10-20")]);
    expect(b.unmatchedDb).toEqual(["u9"]);
    // ⚠️ ไม่ใช่ปัญหา จึงไม่เตือน — ต่างจาก `unmatchedLegacy`
    expect(dayBridgeWarning(b, legacy.length)).toBeNull();
  });

  /**
   * 🔴 **ทริปที่สร้างบนแพลตฟอร์ม — `matched === 0` เป็นเรื่อง *ปกติ* ไม่ใช่อาการของ `E7`** (P4 · 28 ส.ค. 2026)
   *
   * เคสนี้กับเคส **"ฐานว่างเปล่า → E7"** ข้างบน **ต้องอยู่ด้วยกันเสมอ**:
   * ทั้งคู่มี `matched === 0` เหมือนกันเป๊ะ · สิ่งที่แยกคือ `unmatchedDb` มีของหรือไม่
   * 🎯 **ถ้าเหลือแค่เคสเดียว ใครทำให้ `dayBridgeWarning` คืน `null` เสมอ (หรือเตือนเสมอ) จะไม่มีอะไรฟ้อง**
   * · ก่อนแก้ `110`: ผู้ใช้ทริปแพลตฟอร์มเห็นข้อความโทษ `E7` **ทั้งที่วันอยู่ในฐานครบ** — ข้อความที่ชี้ผิดที่
   *   ส่งคนไปไล่ที่ที่ไม่มีอะไรผิด **แพงกว่าความเงียบ** (P2 เจอของจริง)
   */
  it("🔴 ทริปแพลตฟอร์ม (ไม่มีวันไหนตรงไฟล์เดิม) → แมปครบและ **ไม่เตือนเรื่อง `E7`**", () => {
    const platformDays = [L("p0", "2027-01-01"), L("p1", "2027-01-02")];
    const b = buildDayBridge(legacy, platformDays);

    expect(b.matched, "ไม่มีวันไหนตรงกับไฟล์เดิม").toBe(0);
    expect(b.unmatchedDb, "วันของแพลตฟอร์มต้องถูกนับว่า *มีอยู่* ไม่ใช่หายไป").toEqual(["p0", "p1"]);

    // 🔴 แมปต้องไม่ว่าง — hook ที่คีย์ด้วยวันปั้นแมปเองจาก ITINERARY แล้วได้ว่าง คือบั๊กที่ `B6` เจอ
    expect(b.dayKeyToDbId.get("p0"), "วันแพลตฟอร์มต้องแมปหาตัวเอง").toBe("p0");
    expect(b.dayKeyToDbId.get("p1")).toBe("p1");
    expect(b.toDbId("p1"), "`toDbId` ต้องรับ uuid ของวันแพลตฟอร์มได้").toBe("p1");

    // 🎯 ครึ่งที่คู่กับเคส `E7` ข้างบน — เงื่อนไขเดียวกัน (`matched === 0`) คนละคำตอบ
    expect(
      dayBridgeWarning(b, legacy.length),
      "ทริปแพลตฟอร์มต้องไม่ถูกกล่าวหาว่า E7 ยังไม่รัน — วันอยู่ในฐานครบแล้ว",
    ).toBeNull();
  });

  it("🔴 มีทั้งวันที่ตรงและวันของแพลตฟอร์ม → เตือนเฉพาะวันที่ขาดจริง ไม่ใช่เหมารวม", () => {
    const b = buildDayBridge(legacy, [L("u0", "2026-10-11"), L("p9", "2027-01-01")]);
    expect(b.matched).toBe(1);
    expect(b.unmatchedDb).toEqual(["p9"]);
    expect(b.unmatchedLegacy, "d1/d2 ขาดจริง — ต้องยังถูกรายงาน").toEqual(["d1", "d2"]);
    // `matched > 0` → ไม่เข้ากิ่งแพลตฟอร์ม และไม่เข้ากิ่ง E7 → ต้องได้ข้อความ "ขาดบางวัน"
    const w = dayBridgeWarning(b, legacy.length);
    expect(w, "ขาดบางวันต้องได้ข้อความของตัวเอง").toContain("d1, d2");
    expect(w, "และต้องไม่ใช่ข้อความของ E7").not.toContain("E7");
  });

  /**
   * 🔴 **ทางกลับ (`uuid → คีย์ที่ UI ใช้`) ต้องถามสะพาน ห้ามกลับด้าน `dayKeyToDbId` เอง** (P2 เจอของจริง · 28 ส.ค. 2026)
   *
   * `dayKeyToDbId` มี **สองคีย์ชี้ `uuid` เดียวกัน** (`"d0"→u0` และ `u0→u0`)
   * → `new Map([...].map(([k,v]) => [v,k]))` **ตัวท้ายชนะ** → `u0→u0` ทับ `u0→d0` **จนคีย์ `"d0"` หายไปทั้งตัว**
   *
   * อาการจริงที่วัดได้: หัวการ์ดขึ้น `🗺️ 12 จุดในแผนนี้` **แต่ทั้ง 11 วันขึ้น "ยังไม่มีจุดแวะ"**
   * 🎯 **"นับได้" กับ "ผูกกับวันถูก" เป็นคนละคำถาม** — ยอดรวมมาจากอีกทางจึงยังถูก
   * · และหน้าจอดูเหมือน *"ยังไม่ได้ใส่จุดแวะ"* ซึ่งเป็นสภาพปกติที่สุดของทริปที่ยังวางแผนอยู่
   *   **ไม่มี error · ไม่มี 4xx · ชุด 1026 เคสเขียวทั้งชุดบนโค้ดที่มีบั๊กนี้**
   *
   * ⚠️ **เคสนี้ต้องมี *ทั้ง* วันที่ตรงและวันแพลตฟอร์มในเคสเดียว** — ฝั่งใดฝั่งหนึ่งเดี่ยว ๆ เขียวทั้งคู่
   *   (ไม่มีคีย์ซ้อน = ไม่มีตัวทับ) · **นั่นคือเหตุผลที่บั๊กนี้รอดมาได้**
   */
  it("🔴 กลับด้าน `dayKeyToDbId` เองไม่ได้ — คีย์ซ้อนทำให้ `\"d0\"` หายทั้งตัว", () => {
    const b = buildDayBridge([L("d0", "2026-10-11")], [L("u0", "2026-10-11"), L("p9", "2027-01-01")]);
    expect([...b.dayKeyToDbId], "ต้องมีคีย์ซ้อนจริง ไม่งั้นเคสนี้ไม่ได้ยิงอะไร").toEqual([
      ["d0", "u0"], ["u0", "u0"], ["p9", "p9"],
    ]);

    // ท่าที่ผิด — เก็บไว้เป็นเอกสารว่ามันพังยังไง ไม่ใช่ว่ามันโอเค
    const naive = new Map([...b.dayKeyToDbId].map(([k, v]) => [v, k]));
    expect(naive.get("u0"), "กลับด้านเอง → u0 ชี้ตัวเอง แทนที่จะชี้ d0").toBe("u0");
    expect(naive.has("d0"), "และคีย์ d0 หายไปจากแมปทั้งตัว").toBe(false);

    // ท่าที่ถูก — ถามสะพานตรง ๆ (รูปเดียวกับ `useStops.ts:124`)
    const correct = new Map(
      [L("u0", "2026-10-11"), L("p9", "2027-01-01")].map((d) => [d.id, b.toLegacyId(d.id) ?? d.id]),
    );
    expect(correct.get("u0"), "วันที่ตรงกับไฟล์เดิม → คีย์ของไฟล์เดิม").toBe("d0");
    expect(correct.get("p9"), "วันแพลตฟอร์ม → uuid ของตัวเอง").toBe("p9");
  });

  /**
   * 🔴 **สะพานจับคู่ด้วย `date` อย่างเดียว — ไม่มีตัวตนของทริปในสมการเลย** (P4 วัด · P1 ตัดสิน · 28 ส.ค. 2026)
   *
   * เคสนี้เป็น **characterization** — ปัก *พฤติกรรมที่เป็นอยู่* ไม่ใช่พฤติกรรมที่เราอยากได้
   * `9d26d2ba` เป็นทริปของ **ผู้ใช้จริง** (เจ้าของ `@gmail.com` ไม่ใช่ `.test`) ที่ตั้งวัน 11–21 ต.ค. 2026
   * ตรงกับ `ITINERARY` พอดี → ได้สะพานเต็ม → หน้าจอ render แผนเกาหลี (VN610 · ปูซาน) ทับทริปเขา
   *
   * 🎯 **ทางแก้อยู่ที่ *ผู้เรียก* ไม่ใช่ที่นี่** — `dayBridge` ควรจับคู่ตามวันที่ต่อไป เพราะมันไม่รู้จัก
   * (และตั้งใจไม่รู้จัก) ว่าทริปไหนคือทริปที่แผนอยู่ในไฟล์ · **ผู้เรียกต้องเป็นคนตัดสินว่าจะส่ง
   * `ITINERARY` เข้ามาหรือส่ง `[]`** · ดูทะเบียนผู้เรียกข้างล่าง
   * · ⚠️ ถ้าวันหนึ่งเคสนี้แดง แปลว่ามีคนทำให้สะพานรู้จักทริป — **ต้องกลับมาอ่านย่อหน้านี้ก่อนแก้เคส**
   */
  it("🔴 characterization — ทริป *คนละใบ* ที่วันที่ตรงกัน **ถูกจับคู่เต็ม** (นี่คือเหตุผลที่ผู้เรียกต้องกัน)", () => {
    const other = legacy.map((d, i) => ({ id: `ทริปอื่น-${i}`, date: d.date }));
    const b = buildDayBridge(legacy, other);
    expect(b.matched, "วันที่ตรงกัน → จับคู่หมด แม้เป็นคนละทริป").toBe(legacy.length);
    expect(b.unmatchedDb, "ไม่มีวันไหนถูกมองว่า 'ของแพลตฟอร์ม'").toEqual([]);
    expect(b.toDbId("d0"), "`d0` ของไฟล์เดิม ชี้ไปที่วันของทริปอื่น").toBe("ทริปอื่น-0");
  });

  it("🔴 ด้านบวกคู่กัน — ทริปที่แผนอยู่ในไฟล์จริง ต้องยัง **จับคู่ได้ครบ**", () => {
    // 🎯 ถ้าไม่มีเคสนี้ เคสข้างบนผ่านได้ด้วยการทำให้สะพานพังทั้งระบบ (P1 ขอข้อนี้ และถูก)
    const b = buildDayBridge(legacy, db);
    expect(b.matched).toBe(legacy.length);
    expect(b.unmatchedLegacy).toEqual([]);
    expect(b.toDbId("d1")).toBe("u1");
  });

  it("🔴 pin — `buildDayBridge` ต้อง **ไม่รู้จัก `tripId`**", () => {
    /**
     * หัวไฟล์ `dayBridge.ts:50-51` เขียนเจตนาไว้เอง: ผู้เรียกส่งข้อมูลเข้ามา **เพื่อไม่ให้ชั้น engine
     * ผูกกับทริปใดทริปหนึ่ง และเพื่อให้ทดสอบได้โดยไม่ต้องมีไฟล์นั้น**
     * 🔴 วันที่มีคนเติม `trip_id` เข้าไปเพื่อ "แก้บั๊กข้างบน" คุณสมบัตินั้นหายทันที **โดยไม่มีอะไรฟ้อง**
     */
    expect(buildDayBridge.length, "รับ 2 อาร์กิวเมนต์ — เพิ่มตัวที่สามต้องเป็นการตัดสินใจ").toBe(2);
    const code = stripTsComments(readFileSync(new URL("../engine/dayBridge.ts", import.meta.url), "utf8"));
    expect(
      /trip_?[Ii]d/.test(code),
      "โค้ด (ตัดคอมเมนต์แล้ว) อ้างถึง tripId — ชั้น engine ผูกกับทริปแล้ว\n" +
        "  → ทางที่ตกลงกันคือ **ผู้เรียกส่ง `ITINERARY` เฉพาะทริปที่แผนอยู่ในไฟล์** ไม่ใช่ให้สะพานรู้จักทริป",
    ).toBe(false);
  });

  it("🔴 วันที่ซ้ำในไฟล์ → ตัวหลังไปอยู่ `unmatchedLegacy` **ไม่ใช่ทับตัวแรกเงียบ ๆ**", () => {
    const b = buildDayBridge([L("d0", "2026-10-11"), L("dX", "2026-10-11")], [db[0]]);
    expect(b.toDbId("d0")).toBe("u0");
    expect(b.unmatchedLegacy).toEqual(["dX"]);
  });

  it("ไม่มีวันในไฟล์เลย → ไม่เตือน (ไม่มีอะไรให้แปลง จึงไม่มีอะไรผิด)", () => {
    expect(dayBridgeWarning(buildDayBridge([], db), 0)).toBeNull();
  });
});

/**
 * 🔴 **ทะเบียนผู้เรียก — ใครส่ง `ITINERARY` เข้าสะพานบ้าง** (P4 · P1 ตัดสิน · 28 ส.ค. 2026)
 *
 * สะพานจับคู่ด้วย `date` อย่างเดียว (ดู characterization ข้างบน) → **ทริปคนละใบที่วันที่ตรงกันจะถูก
 * จับคู่เต็ม** · ตัวที่ตัดสินว่าถูกหรือผิดคือ **ผู้เรียก**: ส่ง `ITINERARY` เข้ามา = อ้างว่า
 * *"แผนของทริปนี้อยู่ในไฟล์นั้น"* · ทริปที่ไม่ใช่ต้องส่ง `[]`
 *
 * 🎯 **ทะเบียนนี้ไม่ได้บอกว่าผู้เรียกทำถูก — มันบอกว่ามีใครบ้าง** · ด่านที่พยายามอ่านว่า
 * "ผู้เรียกกันเงื่อนไขไว้ถูกไหม" ต้องรู้หน้าตาของโค้ด = **ด่านที่ต้องเดา** (รูปที่เราปฏิเสธมาตลอด)
 * · สิ่งที่ทะเบียนทำได้จริง: **ผู้เรียกรายที่ 6 ต้องเป็นการตัดสินใจ ไม่ใช่การเพิ่มเงียบ ๆ**
 *
 * ⚠️ `git ls-files` เห็นเฉพาะไฟล์ที่ติดตามแล้ว — ไฟล์ใหม่ที่ยังไม่ `git add` จะไม่ถูกนับ
 *    (ถูกจับตอน commit ซึ่งยังก่อน merge · เจอข้อนี้มาแล้วตอนทำด่าน `localStorage`)
 */
describe("ทะเบียนผู้เรียก buildDayBridge", () => {
  const CALLERS: Record<string, string> = {
    "hooks/useStops.ts": "จุดแวะ — แปลง trip_day_id เป็นคีย์ที่ UI ใช้",
    "hooks/useDaySettings.ts": "ตั้งค่ารายวัน",
    "hooks/useOvernightOverrides.ts": "ความตั้งใจเรื่องที่นอน",
    "hooks/useBookings.tsx": "การจอง",
  };
  /** ไฟล์ที่ *นิยาม* ฟังก์ชัน — ไม่ใช่ผู้เรียก (ตัวสแกนเห็น `export function buildDayBridge(`) */
  const DEFINITION = "lib/engine/dayBridge.ts";

  function callers(): string[] {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => /^(app|components|hooks|lib)\/.*\.tsx?$/.test(f))
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => f !== DEFINITION)
      .filter((f) => /buildDayBridge\s*\(/.test(stripTsComments(readFileSync(f, "utf8"))));
  }

  it("🔴 ควบคุมฝั่งบวก — ต้องหาผู้เรียกเจอจริง ไม่งั้น `0 offender` แปลว่าตัวสแกนพัง", () => {
    expect(callers().length, "หาผู้เรียก buildDayBridge ไม่เจอสักไฟล์ — ตัวสแกนพัง").toBeGreaterThan(3);
  });

  it("🔴 ผู้เรียกรายใหม่ต้องมาขึ้นทะเบียน — ส่ง `ITINERARY` = อ้างว่าแผนของทริปนั้นอยู่ในไฟล์", () => {
    const unknown = callers().filter((f) => !(f in CALLERS));
    expect(
      unknown.sort(),
      "ไฟล์พวกนี้เรียก buildDayBridge โดยไม่ขึ้นทะเบียน\n" +
        "  🔴 ถ้าส่ง `ITINERARY` เข้าไปโดยไม่ดูว่าเป็นทริปไหน **ทริปของผู้ใช้ที่วันที่ตรงกันจะได้แผนเกาหลีทับ**\n" +
        "     (เกิดจริงกับทริปของผู้ใช้จริง 28 ส.ค. 2026 — ไม่ใช่ fixture)",
    ).toEqual([]);
  });

  it("🔴 ทะเบียนต้อง *ผิดได้* — ชื่อที่เลิกเรียกแล้วต้องหลุดออก", () => {
    const stale = Object.keys(CALLERS).filter((f) => !callers().includes(f));
    expect(stale.sort(), "ชื่อพวกนี้ไม่ได้เรียก buildDayBridge แล้ว — ลบออกจากทะเบียน").toEqual([]);
  });
});
