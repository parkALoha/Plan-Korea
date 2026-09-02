import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripTsComments } from "./_helpers";

/**
 * ด่านของ **`E6-AC4`** — *ทุก hook ที่ดึงข้อมูลทริปต้องอ่านผ่านแคช เว้นตัวที่ตัดสินแล้วว่าไม่ควร*
 * เจ้าของ: P7-Mobile · 29 ส.ค. 2026
 *
 * ## 🔴 ขอบที่ต้องอ่านก่อนใช้ผลของไฟล์นี้ — **เขียวที่นี่ ไม่ได้แปลว่า `AC4` ผ่าน**
 * ไฟล์นี้ตรวจว่า ***ตารางพื้นผิวใน `backlog.md` ตรงกับโค้ด*** · **ไม่ได้ตรวจว่า *ผู้ใช้เห็นข้อมูลตอนออฟไลน์***
 * · เกณฑ์จริงของ `AC4` คือพฤติกรรม: เปิดทริปแพลตฟอร์มตอนมีเน็ตให้แคชอุ่น → ปิดเน็ต → **ต้องเห็นข้อมูลจริง**
 *   พร้อม**เคสควบคุม** (ล้างแคชแล้วเปิดออฟไลน์ต้องเห็นว่าง) — **วัดด้วยการรันจริงเท่านั้น ไม่ใช่ด้วยตัวสแกนซอร์ส**
 * 🎯 **ห้ามอ่านด่านนี้ว่าปิด `AC4`** — ถ้าปล่อยให้อ่านแบบนั้น มันจะกลายเป็น *หลักฐานที่ครอบแคบกว่าเกณฑ์*
 * ซึ่งเป็นข้อที่ผมเป็นคนยกขึ้นมาเองตอนหักตาราง `§13.1` ของตัวเอง (P1 กำหนดเงื่อนไขนี้ตอนอนุมัติให้เขียน)
 *
 * ## สิ่งที่มันตรวจจริง — **ทะเบียนที่ *ผิดได้***
 * แบ่ง hook ที่ยิง `/api/engine/` เป็นสองฝั่ง แล้วบังคับ**ทั้งสองทิศ**:
 * · ไม่อยู่ในรายการ → **ต้องแคช**   · อยู่ในรายการ → **ต้องไม่แคช**
 * 🔴 **เคส ⑧ เพิ่ม 2 ก.ย. 2026 (P1 ขอ · P3 ทำ): ชื่อในทะเบียนต้องยัง *มีคนเรียก* จริง**
 * ⚠️ **ไม่ใช่ว่าไฟล์นี้ไม่เคยมีด่านกันความล้า — เคส ⑥ มีมาก่อนแล้ว และมันถามคนละคำถามแค่ *หนึ่ง* คำถาม:**
 * ```
 * ⑥  ชื่อในทะเบียนยังเป็นไฟล์ที่ยิง `/api/engine/` อยู่ไหม   ← ถามว่า **ยังมีอยู่ไหม**
 * ⑧  แล้วมี *ใครเรียกมัน* หรือเปล่า                          ← ถามว่า **ยังถูกใช้ไหม**
 * ```
 * · `useLegacyDayPlanGate.ts` จดไว้พร้อมเหตุผลที่เขียนเองว่า *"จะตายไปกับ `B6`"* · `B6` ลงแล้วมันตายจริง
 *   **แต่มันผ่าน ⑥ ได้สบาย ๆ เพราะไฟล์ยังอยู่และยังมี `fetch('/api/engine/…')` อยู่ในตัว**
 * 🎯 **ด่านกันความล้าที่ขาดไปหนึ่งคำถาม อ่านจากผลรันแล้วเหมือนด่านที่ครบทุกประการ** — เขียวเท่ากัน
 * · ⚠️ **ต้องตัดคอมเมนต์ก่อนนับผู้เรียก** — ชื่อ hook ที่ตายแล้วยังอยู่ในคอมเมนต์ของ `/today`+`/summary`
 *   `grep` ดิบตอบว่า *"ยังมีคนใช้"* (3 บรรทัด ทั้งสามเป็นคอมเมนต์) · **นี่คือกลไกที่ทำให้มันรอดมาได้**
 * 🔴 ทิศที่สองคือสิ่งที่ทำให้ทะเบียนนี้ไม่กลายเป็นแหล่งความจริงใบที่สอง — `useSystemMode` เริ่มแคชเมื่อไหร่
 * **ด่านต้องแดง** ไม่ใช่ผ่านเงียบ · และ hook ใหม่ที่ยังไม่มีใครตัดสิน **ตกทันที** ไม่ใช่รอดเพราะไม่มีใครสังเกต
 *
 * ## กฎ 3 ข้อของข้อห้าม (P1 · 28 ส.ค. 2026) — และข้อ ③ กัดข้อนี้ตรง ๆ
 * ① แดงเมื่อละเมิด · ② เคสควบคุมฝั่งบวก · ③ **ด่านที่ไม่มีของให้ตรวจ ต้องแดง ไม่ใช่เขียวเปล่า**
 * · ถ้าตัวเดินไฟล์เดินไม่ถึง `hooks/` หรือ regex เพี้ยนจนไม่แมตช์อะไรเลย **ทุกเคสข้างล่างจะเขียวหมด**
 *   `it ①`/`it ⑤` มีไว้กันข้อนั้นข้อเดียว
 */
const ROOT = resolve(__dirname, "..", "..");
const HOOKS = join(ROOT, "hooks");

/** hook ที่ต้องมีอยู่เสมอ — หลุดจากผลสแกนเมื่อไหร่ แปลว่าโซนสแกนหดโดยไม่มีใครรู้ */
const SENTINEL = "usePlatformItinerary.ts";

/**
 * **ตัดสินแล้วว่า *ไม่* แคช** — P7 ตัดสิน 29 ส.ค. 2026 · ตรงกับแถว 🟡/✅ ใน `backlog.md` `E6-AC4`
 * 🔴 เหตุผลอยู่ตรงนี้ ไม่ใช่ในหัวคน — เพิ่มชื่อเข้ารายการนี้โดยไม่เขียนเหตุผล = ปิดด่านด้วยการต่อท้ายสตริง
 */
const NOT_CACHED_BY_DECISION: Readonly<Record<string, string>> = {
  "useSystemMode.tsx":
    "ธง read-only — ค่าที่ค้างเก่า **แย่กว่าไม่มีธง** (mobile-arch §11.28 ①) · แคชคือบั๊ก ไม่ใช่ฟีเจอร์",
  "useTripDaysGate.ts":
    "fail-open เป็น `ready` อยู่แล้วเมื่อเช็คไม่สำเร็จ → ออฟไลน์ไม่ถูกบล็อก · แคชแล้ว *แย่ลง* เพราะคำตัดสิน `empty` ที่ค้างจะยืนยันผิดหลังมีวันจริง",
  "useTripMembers.ts":
    "ผู้บริโภคเดียวคือแถวอวาตาร์ใน `TripHeader` — chrome ไม่ใช่เนื้อทริป · ออฟไลน์แล้วหายไปเฉย ๆ ไม่ทำให้เข้าใจผิด · และมันถือ *ชื่อคนอื่น* เก็บลงเครื่องโดยไม่มีคนขอไม่คุ้ม",
};

/** ยิง route ของแพลตฟอร์ม = เป็นพื้นผิวที่ `AC4` พูดถึง */
export function fetchesEngineApi(strippedCode: string): boolean {
  return /\/api\/engine\//.test(strippedCode);
}

/**
 * อ่านผ่านแคชอะไรสักอย่าง — **ไม่ใช่ "ผ่าน `hydrateThenFetch` ไหม"**
 * 🔴 นั่นคือคำถามของ `AC7` (เรื่อง*ที่เก็บ*) · `AC4` ถามแค่ว่า *ออฟไลน์แล้วมีอะไรให้อ่านไหม*
 * → ทางเก่าบน `localStorage` (`readCache`/`readTripCache`) **นับว่าผ่าน** · ด่านนี้จึงตั้งได้ก่อน `AC7` จบ
 */
export function readsFromCache(strippedCode: string): boolean {
  return /\bstoreGet\b|\breadCache\b|\breadTripCache\b|\bhydrateThenFetch\b/.test(strippedCode);
}

/**
 * ผู้เรียกของ hook ชื่อ `name` — **ตัดคอมเมนต์ก่อน** ไม่งั้นชื่อที่ตายแล้วจะดูเหมือนยังถูกใช้
 * 🔴 ไม่นับไฟล์นิยามของตัวมันเอง และไม่นับ `lib/__tests__/` (ทะเบียนอ้างถึงชื่อพวกนี้เป็นสตริงอยู่แล้ว —
 *    ถ้านับเข้าไปด้วย **ทะเบียนจะยืนยันตัวเอง** ซึ่งคือสิ่งที่เคสนี้มีไว้กันพอดี)
 */
function callSitesOf(name: string): string[] {
  const re = new RegExp(`\\b${name}\\s*\\(`);
  return SCAN_DIRS.flatMap((d) => tsFilesUnder(join(ROOT, d)))
    .filter((f) => f.slice(f.lastIndexOf("/") + 1).replace(/\.tsx?$/, "") !== name)
    .filter((f) => re.test(stripTsComments(readFileSync(f, "utf8"))))
    .map((f) => f.slice(ROOT.length + 1));
}

const SCAN_DIRS = ["app", "components", "hooks", "lib"];

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__" || e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFilesUnder(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

type Hook = { file: string; code: string };

function engineHooks(): Hook[] {
  return readdirSync(HOOKS)
    .filter((f) => /\.tsx?$/.test(f))
    .map((file) => ({ file, code: stripTsComments(readFileSync(join(HOOKS, file), "utf8")) }))
    .filter((h) => fetchesEngineApi(h.code));
}

describe("🔴 E6-AC4 — พื้นผิวที่ดึงข้อมูลทริป ต้องอ่านผ่านแคช (ตารางต้องตรงกับโค้ด)", () => {
  const hooks = engineHooks();

  it("① ตัวสแกนต้องเห็นไฟล์จริง — 'สแกนแคบลง' กับ 'สแกนความว่างเปล่า' ให้ผลเหมือนกันเป๊ะ (P-21)", () => {
    expect(hooks.length).toBeGreaterThan(10);
    expect(
      hooks.map((h) => h.file),
      `${SENTINEL} ต้องอยู่ในผลสแกน — ถ้าหลุด เคส ④ จะเขียวเพราะไม่ได้อ่านอะไร`
    ).toContain(SENTINEL);
  });

  it("② เคสควบคุมฝั่งบวก — ตัวจับทั้งสองตัวต้องทำงานจริง", () => {
    expect(fetchesEngineApi('fetch(`/api/engine/trips/${id}/days`)')).toBe(true);
    expect(readsFromCache("const c = await storeGet<Row[]>(key);")).toBe(true);
    expect(readsFromCache("await hydrateThenFetch<Row[]>({ ... })")).toBe(true);
    expect(readsFromCache("const c = readTripCache(tripId, 'hotels');")).toBe(true);
  });

  it("③ เคสควบคุมฝั่งลบ — ของที่ไม่ใช่ ต้องไม่ถูกจับ", () => {
    expect(fetchesEngineApi('fetch("/api/weather?lat=1")')).toBe(false);
    expect(readsFromCache("const cacheHint = 'no-store';")).toBe(false);
    // คอมเมนต์ที่ *พูดถึง* แคช ต้องไม่ทำให้ hook ที่ไม่แคชนับว่าแคช
    expect(readsFromCache(stripTsComments("// ตรงนี้ยังไม่ได้ใช้ storeGet เลย\nconst x = 1;"))).toBe(false);
    expect(readsFromCache(stripTsComments("const c = storeGet(k); // อธิบายเฉย ๆ"))).toBe(true);
  });

  it("④ hook ที่ไม่ได้อยู่ในรายการ 'ตัดสินแล้วว่าไม่แคช' — ต้องแคช", () => {
    const offenders = hooks
      .filter((h) => !(h.file in NOT_CACHED_BY_DECISION) && !readsFromCache(h.code))
      .map((h) => h.file);
    expect(
      offenders.sort(),
      "hook พวกนี้ยิง `/api/engine/` แล้วไม่อ่านแคชเลย → **ออฟไลน์ได้ค่าว่าง และว่างแบบเงียบ**\n" +
        "  (`fetchReadJson` คืน `null` ทุกทางพลาด → `if (rows)` ข้ามไป → ไม่มี error ไม่มีสถานะว่าถามไม่ได้)\n" +
        "  → แคชผ่าน `hydrateThenFetch` + `offlineStore` **หรือ** ตัดสินว่าไม่ควรแคชแล้วเพิ่มเข้า\n" +
        "  `NOT_CACHED_BY_DECISION` **พร้อมเหตุผล** และอัปเดตตารางพื้นผิวใน `backlog.md` `E6-AC4`"
    ).toEqual([]);
  });

  it("⑤ 🔴 ทะเบียนต้อง *ผิดได้* — ตัวที่ตัดสินว่าไม่แคช ต้องยังไม่แคชจริง", () => {
    const changed = hooks.filter((h) => h.file in NOT_CACHED_BY_DECISION && readsFromCache(h.code)).map((h) => h.file);
    expect(
      changed.sort(),
      "ไฟล์พวกนี้ *เริ่มแคชแล้ว* แต่ยังถูกจดว่า 'ตัดสินแล้วว่าไม่แคช'\n" +
        "  🔴 ไม่ใช่แค่เรื่องความสะอาด — ถ้าไม่แดงตรงนี้ ทะเบียนจะเพี้ยนจากโค้ดโดยไม่มีอะไรจับ\n" +
        "  แล้วมันจะกลายเป็น *แหล่งความจริงใบที่สอง* · โดยเฉพาะ `useSystemMode` ที่ **แคชคือบั๊ก**\n" +
        "  → เอาชื่อออกจากรายการ + อัปเดตตารางใน `backlog.md`  **หรือ** ถอนการแคชนั้นออก"
    ).toEqual([]);
  });

  it("⑥ ทะเบียนต้องไม่มีชื่อที่ตายแล้ว — ทุกชื่อต้องยังเป็น hook ที่ยิง `/api/engine/`", () => {
    const live = new Set(hooks.map((h) => h.file));
    const stale = Object.keys(NOT_CACHED_BY_DECISION).filter((f) => !live.has(f));
    expect(
      stale.sort(),
      "ชื่อพวกนี้ไม่ได้ยิง `/api/engine/` แล้ว (ลบไปแล้ว/เปลี่ยนชื่อ/เลิกดึงข้อมูล) — ลบออกจากรายการ\n" +
        "  ข้อยกเว้นที่ยกเว้นของที่ไม่มีอยู่ คือข้อยกเว้นที่ไม่มีใครรู้ว่าล้าสมัย"
    ).toEqual([]);
  });

  it("⑦ ทั้งสองฝั่งต้องไม่ว่าง — ฝั่งไหนว่าง แปลว่าเคส ④/⑤ ฝั่งนั้นไม่ได้ตรวจอะไร", () => {
    const cached = hooks.filter((h) => readsFromCache(h.code));
    const decided = hooks.filter((h) => h.file in NOT_CACHED_BY_DECISION);
    expect(cached.length, "ไม่มี hook ไหนแคชเลย — ตัวจับ `readsFromCache` น่าจะเพี้ยน").toBeGreaterThan(5);
    expect(decided.length, "รายการ 'ตัดสินแล้วว่าไม่แคช' ไม่แมตช์ไฟล์จริงสักตัว — เคส ⑤ กำลังตรวจเซตว่าง").toBeGreaterThan(0);
  });

  it("⑧ 🔴 ทะเบียนต้อง *หด* ด้วย — ไฟล์ที่ไม่มีใครเรียกแล้ว ต้องไม่ค้างอยู่ในรายการ", () => {
    // 🔴 เคสควบคุม **มาก่อน** ข้อสรุป — ถ้าตัวนับผู้เรียกพัง ทุกชื่อจะดู "ตาย" หรือ "เป็น" พร้อมกัน
    //    และทั้งสองทางให้ผลที่อ่านเหมือนกันจากบรรทัดล่าง
    expect(
      callSitesOf("usePlatformItinerary").length,
      "ตัวนับผู้เรียกหาอะไรไม่เจอเลย — ตัวเดินไฟล์/regex พัง ไม่ใช่ 'ไม่มีใครเรียก'"
    ).toBeGreaterThan(0);
    expect(callSitesOf("useHookThatDoesNotExistAnywhere")).toEqual([]);

    const dead = Object.keys(NOT_CACHED_BY_DECISION)
      .map((file) => ({ file, name: file.replace(/\.tsx?$/, "") }))
      .filter(({ name }) => callSitesOf(name).length === 0)
      .map(({ file }) => file);
    expect(
      dead.sort(),
      "ไฟล์พวกนี้ถูกจดไว้ว่า 'ตัดสินแล้วว่าไม่แคช' **แต่ไม่มีใครเรียกมันแล้ว**\n" +
        "  🔴 ทะเบียนที่ชี้ไปหาของที่ไม่มีคนใช้ = ทะเบียนที่ล้า และไม่มีอะไรอื่นจับข้อนี้ได้เลย\n" +
        "  → ลบไฟล์ที่ตายแล้ว + ถอนชื่อออกจากรายการ **ในคอมมิตเดียวกัน** (แยกเมื่อไหร่ ทะเบียนล้าช่วงนั้น)\n" +
        "  · ถ้ามันควรอยู่ต่อทั้งที่ยังไม่มีผู้เรียก (เช่นกำลังจะต่อสาย) — บอก P1 ก่อน อย่าเงียบ ๆ ปิดเคสนี้"
    ).toEqual([]);
  });
});
