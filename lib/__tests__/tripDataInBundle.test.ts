import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `E6-AC10` — **หน้าที่ไม่ใช่ทริปเกาหลี ต้องไม่โหลดข้อมูลของทริปเกาหลี**
 * เจ้าของ: P3-FE/Perf · 28 ส.ค. 2026 (เกณฑ์ P8 รับแล้ว `5d17c15` · P1 วัดฐานไว้ให้)
 *
 * ## 🔴 ทำไมข้อนี้เป็น *ความถูกต้อง* ไม่ใช่ *ขนาดบันเดิล*
 * ทริปแพลตฟอร์มที่โหลด `data/places.ts` + `data/itinerary.ts` เข้ามา **คือทริปที่แสดงแผนเกาหลีทับตัวเองได้**
 * — P1 เปิด `/trip/647ed2c2/summary` (ทริปญี่ปุ่น) แล้วได้แผนเกาหลีทั้งฉบับจริงเมื่อ 28 ส.ค. (`f255be3`
 * ปิดทางแสดงผลไปแล้ว แต่ **ข้อมูลยังเดินทางไปถึงเบราว์เซอร์อยู่**)
 * · 📌 **แยกจากงาน First Load JS ของ P6 ชัดเจน** — เขาถาม *"โตขึ้นไหม"* · ไฟล์นี้ถาม *"ถูกต้องไหม"*
 *
 * ## ⚠️ ด่านนี้ต้องมี production build ก่อนถึงจะวัดได้
 * CI รัน `npm test` **ก่อน** `npm run build` (`ci.yml` — verify job) → รอบปกติจะไม่มี `.next/` ให้อ่าน
 * · ใช้รูปเดียวกับ `RLS_MATRIX_REQUIRED` (`lib/__tests__/_helpers.ts`): ไม่มี build = **เตือนดัง ๆ แล้วข้าม**
 *   · ตั้ง `BUNDLE_GUARD_REQUIRED=1` = **ข้ามกลายเป็นล้ม** สำหรับ job ที่รันหลัง build
 * · 🔴 **"ข้าม" ไม่ใช่ "ผ่าน"** — ทั้งไฟล์เขียนตามบทเรียนนั้นของ `_helpers.ts`
 */

const ROOT = process.cwd();
const NEXT_DIR = join(ROOT, ".next");
const CHUNK_DIR = join(NEXT_DIR, "static", "chunks");
const APP_DIR = join(NEXT_DIR, "server", "app");

/** route → ไฟล์ที่ Next เขียนรายชื่อ client chunk ของ route นั้นไว้ */
const MANIFEST = "page_client-reference-manifest.js";

/** 🔴 route ที่ **ต้องไม่มี** ข้อมูลทริปเกาหลี — ทริปแพลตฟอร์มเปิดผ่าน `/trip/[tripId]` ทั้งหมด */
const PLATFORM_ROUTES = ["trip/[tripId]", "trip/[tripId]/today", "trip/[tripId]/summary"];
/** route ของเว็บทริปเกาหลีเดิม — **ต้องมี** ข้อมูลนั้น · ใช้เป็นเคสควบคุมฝั่งบวก */
const LEGACY_ROUTES = ["today", "summary"];

/**
 * 🔴 **อ่านสตริงเครื่องหมายจากไฟล์ต้นทางตอนรัน ห้ามฝังไว้** (P1 กำชับ)
 * ถ้าฝัง `'Hanoi Old Quarter'` ไว้แล้ววันหนึ่งข้อมูลเปลี่ยน **ด่านจะเงียบทันทีโดยไม่มีใครรู้**
 * · ใช้หลายตัวเพราะ **ตัวเดียวนับได้ไม่ครบ** — วัดจริงแล้วได้ไม่เท่ากัน (`hanoi-hoan-kiem` เจอ 5 chunk ·
 *   `Hoan Kiem Lake` เจอ 1) minifier เก็บบางสตริงไว้ไม่เหมือนกัน → **ใช้ union ไม่ใช่ตัวแทนตัวเดียว**
 */
function markersFromSource(): { place: string[]; trip: string[] } {
  const places = readFileSync(join(ROOT, "data/places.ts"), "utf8");
  /**
   * 🔴 **อ่าน `data/koreaTrip.ts` ไม่ใช่ `data/itinerary.ts`** — payload ย้ายไปที่นั่นแล้ว (28 ส.ค. 2026)
   * ⚠️ **ถ้าไม่แก้บรรทัดนี้พร้อมกับการย้าย ด่านจะยังเขียวและ *ดูปกติทุกอย่าง*** — `date:` ไม่เหลือ
   * ใน `itinerary.ts` เลยสักตัว (วัดแล้ว = 0) → marker ฝั่งทริปกลายเป็นศูนย์เงียบ ๆ
   * เหลือแต่ฝั่ง `PLACES` 5 ตัว ซึ่ง **ยังผ่านควบคุม `> 3` อยู่** → ไม่มีเคสไหนแดง
   * 🎯 **ด่านจะเลิกตรวจ `ITINERARY` ทั้งก้อนโดยไม่มีสัญญาณอะไรเลย** — ความครอบคลุมหายครึ่ง
   *    ขณะที่ผลรันบอกว่าทุกอย่างปกติ · **นี่คือเหตุผลที่การย้ายไฟล์กับการแก้ด่านต้องอยู่ commit เดียวกัน**
   */
  const itinerary = readFileSync(join(ROOT, "data/koreaTrip.ts"), "utf8");
  const take = (src: string, re: RegExp, n: number) =>
    [...src.matchAll(re)].map((m) => m[1]).filter((v) => v.length >= 8).slice(0, n);
  return {
    place: take(places, /\bid:\s*"([^"]+)"/g, 5),
    trip: take(itinerary, /\bdate:\s*"([^"]+)"/g, 5),
  };
}

/**
 * 🔴 **ต้องนับ *แยกสองฝั่ง* ห้ามนับผลรวม** (P4 ชี้ · 28 ส.ค. 2026 · โซน P3 เขาไม่แก้เอง)
 * ของเดิมคืนอาเรย์เดียวแล้วควบคุมเช็ค `markers.length > 3` — **คลังใดคลังหนึ่งหายทั้งใบ ยังผ่านสบาย**
 * ```
 * place 5 + trip 0 = 5  →  5 > 3  →  ผ่าน   ← ด่านเลิกตรวจ ITINERARY ครึ่งหนึ่ง เงียบสนิท
 * ```
 * 🎯 **ผมเจอมันรอบนี้เพราะผมเป็นคนย้ายไฟล์เอง — ครั้งหน้าไม่มีใครยืนอยู่ตรงนั้น**
 * (เปลี่ยน `id:` → `slug:` · `date:` → `dayDate:` ให้ผลเดียวกันเป๊ะ และไม่มีใครกำลังคิดถึงด่านนี้อยู่)
 * · ⚠️ **นี่คือ *คุณสมบัติ* ของการรวมคลัง ไม่ใช่ *เหตุการณ์* ของการย้ายไฟล์** — ผมเขียนมันเป็นเหตุการณ์
 *   ในคอมเมนต์ข้างบน P4 อ่านแล้วชี้ว่ามันถาวร · **ควบคุมที่วัดผลรวม ตรวจ "คลังหนึ่งว่าง" ไม่ได้ตามนิยาม**
 */
function assertBothCorporaAlive(m: { place: string[]; trip: string[] }) {
  expect(m.place.length, "ดึง marker จาก data/places.ts ไม่ได้เลย — regex พังหรือรูปไฟล์เปลี่ยน").toBeGreaterThan(0);
  expect(m.trip.length, "ดึง marker จากไฟล์ payload ทริปไม่ได้เลย — payload ถูกย้าย/เปลี่ยนรูป").toBeGreaterThan(0);
}

/** chunk ที่มีข้อมูลทริปเกาหลีอยู่จริง — union ของทุก marker */
function taintedChunks(markers: string[]): string[] {
  const out = new Set<string>();
  for (const file of readdirSync(CHUNK_DIR).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(join(CHUNK_DIR, file), "utf8");
    if (markers.some((m) => src.includes(m))) out.add(file.replace(/\.js$/, ""));
  }
  return [...out].sort();
}

/** chunk ที่ route นั้นอ้างถึง ∩ chunk ที่มีข้อมูลเกาหลี */
function taintedChunksOfRoute(route: string, tainted: string[]): string[] {
  const manifest = join(APP_DIR, route, MANIFEST);
  if (!existsSync(manifest)) return [];
  const src = readFileSync(manifest, "utf8");
  return tainted.filter((c) => src.includes(c)).sort();
}

/**
 * 🔴 **build ที่เก่ากว่าซอร์ส = หลักฐานที่วัดก่อนโค้ดที่ควรจะแก้มัน** (P7 ตั้งชื่อรูปนี้ · 28 ส.ค. 2026)
 * ไฟล์นี้อ่าน `.next/` ที่ *บังเอิญมีอยู่บนดิสก์* — ในทรีที่ 8 เซสชันใช้ร่วมกัน มันอาจเป็น build ของ
 * commit ก่อนหน้า **และผลจะดูสมเหตุสมผลทุกประการ** · CI ปลอดภัยเพราะรันต่อจาก `npm run build` ทันที
 * แต่รันในเครื่องไม่มีอะไรรับประกัน → เทียบเวลาแก้ล่าสุดของซอร์สที่ *เข้าบันเดิล* กับเวลาของ build
 * · ไม่นับ `lib/__tests__/` — ไฟล์เทสต์ไม่ได้เข้าบันเดิล การเพิ่มเคสจึงไม่ควรทำให้ build กลายเป็นเก่า
 */
function sourceNewerThanBuild(): boolean {
  const buildStamp = join(NEXT_DIR, "BUILD_ID");
  if (!existsSync(buildStamp)) return true;
  const builtAt = statSync(buildStamp).mtimeMs;
  let newest = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|css)$/.test(e.name)) newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  for (const d of ["data", "app", "components", "hooks", "lib"]) {
    const p = join(ROOT, d);
    if (existsSync(p)) walk(p);
  }
  return newest > builtAt;
}

const buildIsStale = sourceNewerThanBuild();
const hasBuild =
  existsSync(CHUNK_DIR) &&
  !buildIsStale &&
  [...PLATFORM_ROUTES, ...LEGACY_ROUTES].every((r) => existsSync(join(APP_DIR, r, MANIFEST)));

if (!hasBuild) {
  // 🔴 รูปเดียวกับ `requireLiveCreds` — เตือนดัง ๆ ว่า "ข้าม ไม่ใช่ผ่าน" และบังคับได้ด้วย env
  if (process.env.BUNDLE_GUARD_REQUIRED === "1") {
    throw new Error(
      "BUNDLE_GUARD_REQUIRED=1 แต่ไม่มี production build ที่ใช้ตรวจได้\n" +
        `  ต้องมี: ${CHUNK_DIR} และ ${MANIFEST} ของทุก route ที่ตรวจ\n` +
        (buildIsStale ? "  🔴 **ซอร์สใหม่กว่า build** — build ที่มีอยู่วัดโค้ดคนละรุ่นกับที่อยู่บนดิสก์ตอนนี้\n" : "") +
        "  🔴 ด่าน E6-AC10 **ข้าม ไม่ใช่ผ่าน** — รัน `npm run build` ก่อน"
    );
  }
  console.warn(
    `\n⚠️  ข้ามด่าน E6-AC10 — **นี่ไม่ใช่การผ่าน** (${buildIsStale ? "ซอร์สใหม่กว่า build ที่มีอยู่" : "ยังไม่มี production build"})\n` +
      "    รันแบบนี้: npm run build && BUNDLE_GUARD_REQUIRED=1 npx vitest run lib/__tests__/tripDataInBundle.test.ts\n"
  );
}

describe.skipIf(!hasBuild)("E6-AC10 — ข้อมูลทริปเกาหลีในบันเดิลของ route แพลตฟอร์ม", () => {
  /**
   * 🔴 **อ่านดิสก์ต้องเป็น lazy — `describe.skipIf` ข้ามการ *รัน* เคส แต่ callback ของ describe
   * ยังถูกเรียกเสมอเพื่อเก็บรายชื่อเคส** (P3 · 28 ส.ค. 2026 · ทำชุดเต็มของทีมล้มมาแล้วหนึ่งรอบ)
   * ของเดิมเรียก `taintedChunks()` ตรงนี้ → ไม่มี `.next/` เมื่อไหร่ `readdirSync` โยน `ENOENT`
   * → **suite ล้มทั้งชุด ไม่ใช่ถูกข้าม** · และ `verify` job รัน `npm test` **ก่อน** build จึงเจอเคสนี้เสมอ
   *
   * ⚠️ **บทเรียนที่แพงกว่าตัวบั๊ก:** ผมเคยรายงานว่า "ทดสอบทั้งสองทางแล้ว" — ของจริงทดสอบทางเดียว
   * (`touch` ซอร์สให้ build เก่า · **แต่ `.next/` ยังอยู่**) · *"build เก่า"* กับ *"ไม่มี build เลย"*
   * **อ่านเหมือนกันจากที่นั่ง แต่โค้ดเดินคนละทาง** — เคสล่างครอบทั้งสองสภาพจริง ไม่ใช่สภาพเดียว
   */
  let cache: { markers: { place: string[]; trip: string[] }; tainted: string[] } | null = null;
  const measured = () => (cache ??= (() => {
    const m = markersFromSource();
    return { markers: m, tainted: taintedChunks([...m.place, ...m.trip]) };
  })());

  /**
   * 🔴 เคสควบคุมฝั่งบวกชุดที่ 1 — **วิธีวัดยังทำงานอยู่ไหม**
   * ถ้า marker ถูกดึงผิด/regex พัง `tainted` จะว่าง แล้ว **ทุกเคสข้างล่างจะเขียวโดยไม่ได้พิสูจน์อะไร**
   */
  it("ดึง marker จากไฟล์ต้นทางได้จริง และเจอในบันเดิลจริง", () => {
    const { markers, tainted } = measured();
    assertBothCorporaAlive(markers);
    expect(tainted.length, `marker ${[...markers.place, ...markers.trip].slice(0, 3).join(" · ")} ไม่เจอในบันเดิลเลย`).toBeGreaterThan(0);
  });

  /**
   * 🔴 เคสควบคุมฝั่งบวกชุดที่ 2 — **การจับคู่ route → chunk ยังทำงานอยู่ไหม**
   * `/today` · `/summary` เป็นเว็บทริปเกาหลีเดิม **ต้องมีข้อมูลนั้นจริง** · ถ้าเคสนี้แดงแปลว่าวิธีจับคู่พัง
   * ไม่ใช่ว่าบันเดิลสะอาด — และ xfail ข้างล่างจะเขียวด้วยเหตุผลที่ผิด
   */
  for (const route of LEGACY_ROUTES) {
    it(`positive control: /${route} (เว็บทริปเกาหลีเดิม) ต้องมีข้อมูลนั้นอยู่จริง`, () => {
      const found = taintedChunksOfRoute(route, measured().tainted);
      expect(found.length, `/${route} ไม่อ้างถึง chunk ที่มีข้อมูลเกาหลีเลย — วิธีจับคู่ route→chunk น่าจะพัง`).toBeGreaterThan(0);
    });
  }

  /**
   * 🎯 **`it.fails` = xfail** — วันนี้ route แพลตฟอร์ม **ยังมี** ข้อมูลเกาหลีอยู่ (บั๊กเปิด · `E6-AC10`
   * ยังไม่ผ่าน) → เคสนี้ *เขียว* = บันทึกว่าบั๊กเปิดอยู่ โดยหัว branch ไม่แดง (`D72`)
   * 🔴 **วินาทีที่ P1 ตัด 4 ราก (`resolvePlace`/`hotelLegs`/`schedule`/`eventPlace`) สำเร็จ → เคสนี้ *แดง***
   * = *"แก้แล้ว — ถอด `.fails` ออกเป็นเทสต์จริง แล้วติ๊ก `E6-AC10`"*
   * ⚠️ ถ้าแดง **เช็คเคสควบคุมข้างบนก่อน**: มันเขียว = แดงเพราะแก้สำเร็จจริง · มันแดงด้วย = วิธีวัดพัง
   */
  for (const route of PLATFORM_ROUTES) {
    it.fails(`xfail · /${route} ต้องไม่มีข้อมูลทริปเกาหลี (บั๊กเปิดอยู่ · พลิกแดงเมื่อตัด 4 รากสำเร็จ)`, () => {
      /**
       * 🔴 **กันคลังว่างก่อนถึง assertion — ทั้งสามใบ** (P4 ชี้ครบ · P3 ยืนยันจากซอร์ส · 28 ส.ค. 2026)
       * `found = []` แปลได้ **สี่อย่าง** และบรรทัดผลลัพธ์แยกไม่ออกสักอย่าง:
       * ```
       * ตัดสำเร็จจริง        ← อันเดียวที่เราอยากรู้
       * ① ไม่มี marker       markersFromSource() ว่าง (data/*.ts เปลี่ยนรูป · regex พัง)
       * ② ไม่มี chunk        CHUNK_DIR ผิดที่ · build เก่า
       * ③ ไม่มี manifest     taintedChunksOfRoute():65 `if (!existsSync) return []` ← กลืนเงียบ
       * ```
       * ✅ **③ ถูก `hasBuild` กันไว้ก่อนแล้ว จึงไม่ต้องเช็คซ้ำที่นี่ — ยืนยันด้วยการรัน ไม่ใช่ด้วยการอ่าน**
       * ลองย้าย `page_client-reference-manifest.js` ของ `/trip/[tripId]/today` ออก → ได้
       * `BUNDLE_GUARD_REQUIRED=1 แต่ไม่มี production build ที่ใช้ตรวจได้` · **`Tests no tests`** — หยุดตั้งแต่
       * ตอน collect ไม่ถึงเคสสักเคส · route ที่ถูกย้าย/เปลี่ยนชื่อจึง **ข้ามดัง ๆ ไม่ใช่รายงานว่าสะอาด**
       * 🔴 **เคยใส่ `expect(existsSync(manifest)).toBe(true)` ตรงนี้แล้วถอดออก** (P4 เสนอ · P3 วัดแล้วถอด)
       * — มันถูกโดยเหตุผล **แต่ยิงไม่ออกตามนิยาม** · บรรทัดที่ *ดูเหมือน* ป้องกันแต่ไม่เคยทำงาน
       * **แย่กว่าไม่มี** เพราะคนถัดไปจะเชื่อว่าตรงนี้ถูกตรวจแล้ว (`P-50` · "ธงที่อ่านไม่ได้ ไม่ใช่ธง")
       * 🎯 **`it.fails` กลับด้านสี** → บรรทัดนี้ "ผ่าน" คือข่าวดีที่ทั้งทีมรอดู · คนอ่านจึงสแกนหามันก่อน
       * และมันพลิกได้ด้วยเหตุที่ *ไม่ใช่* ความสำเร็จถึงสามทาง · **เคสควบคุมข้างบนจับได้ก็จริง
       * แต่มันอยู่คนละบรรทัด — ใครอ่านเฉพาะบรรทัด xfail จะไม่เห็นมันเลย**
       * ✅ วางไว้ *ในตัว* xfail แล้วคลังว่างจะ throw → `it.fails` พอใจ → รายงานว่า **บั๊กยังเปิดอยู่**
       *    = ค่าตั้งต้นที่ปลอดภัย **และซื่อสัตย์** (เราไม่รู้จริง ๆ) · ส่วนควบคุมจะแดงบอกว่าวิธีวัดพัง
       * 📌 `:65` เป็นรูปเดียวกับ `try/catch` ที่กลืน `ENOENT` ใน `bookingFileStorageGate` ที่ P4 เพิ่งแก้
       *    ด้วย `examined > 50` — **คนละไฟล์ คนละคน รูปเดียวกัน**
       */
      const { markers, tainted } = measured();
      assertBothCorporaAlive(markers);
      expect(tainted.length, "ไม่มี chunk ไหนมีข้อมูลเกาหลีเลย — CHUNK_DIR ผิดที่ หรือ build เก่า").toBeGreaterThan(0);
      const found = taintedChunksOfRoute(route, tainted);
      expect(found, `/${route} ยังลาก chunk ที่มีข้อมูลเกาหลี: ${found.join(" · ")}`).toEqual([]);
    });
  }

  /**
   * 🔴 **ratchet** — จับ *การถอยหลัง* ที่ xfail ข้างบนจับไม่ได้
   * `it.fails` เขียวตราบใดที่ยัง "มีข้อมูลอยู่" **ไม่ว่าจะมีมากขึ้นแค่ไหน** → ถ้าใครลาก `data/*` เข้า
   * route ใหม่ (หรือ `/login`) มันจะไม่ฟ้องเลย · เคสนี้ปักจำนวน route ที่เปื้อนไว้
   */
  it("ratchet: มี route แพลตฟอร์มเปื้อนอยู่ 3 route เท่านั้น — เพิ่มขึ้น = ถอยหลัง", () => {
    const dirty = PLATFORM_ROUTES.filter((r) => taintedChunksOfRoute(r, measured().tainted).length > 0);
    expect(dirty.sort()).toEqual([...PLATFORM_ROUTES].sort());
  });
});

/**
 * 🔴 **`PLATFORM_ROUTES` ครบหรือเปล่า — ตรวจ *นอก* `skipIf(!hasBuild)` โดยตั้งใจ**
 * (P4 ชี้ · 28 ส.ค. 2026 · เขาไม่ได้เขียนเองเพราะเป็นโซน P3)
 *
 * `hasBuild` ให้ขา *"route หายไป"* มาแล้วโดยบังเอิญ — manifest ขาดใบเดียวมันโยนดัง ๆ ก่อนถึงเคส
 * (นั่นคือเหตุผลที่ตัวเช็ค manifest ในตัว xfail ถูกถอดออก — ยิงไม่ออก)
 * 🎯 **แต่ขา *"route เพิ่มมาใหม่"* ไม่มีใครถือเลย** และ `ratchet` ก็ไม่ใช่ตัวนั้น:
 * ```
 * :203  expect(dirty.sort()).toEqual([...PLATFORM_ROUTES].sort())   ← เทียบลิสต์กับ *ตัวมันเอง*
 * ```
 * → วันที่ใครเพิ่ม `app/trip/[tripId]/map/page.tsx` **มันไม่อยู่ในลิสต์ → ไม่ถูกสแกน → ไม่มีอะไรฟ้อง**
 * และ route ใหม่คือ **สิ่งที่ด่านนี้มีไว้ตรวจพอดี** · ตระกูลเดียวกับทะเบียนของ P4 ที่มีสองขา
 * (*ผู้เรียกใหม่ต้องขึ้นทะเบียน* · *ชื่อที่เลิกเรียกต้องหลุด*) — อันนี้เคยมีศูนย์ขา
 *
 * ⚠️ **อยู่นอก `skipIf` เพราะมันอ่าน *ซอร์ส* ไม่ใช่ `.next/`** — ถ้าวางไว้ในนั้น มันจะเงียบทุกครั้งที่
 * ไม่มี build ซึ่งเป็นสภาพปกติของ `npm test` ใน CI · **ตัวตรวจที่ไม่ต้องพึ่ง build ไม่ควรถูกมัดชะตากับ build**
 */
describe("PLATFORM_ROUTES ต้องครบตามที่มีอยู่บนดิสก์", () => {
  it("route ใหม่ใต้ app/trip/[tripId] ต้องถูกเพิ่มเข้า PLATFORM_ROUTES ด้วย", () => {
    const base = join(ROOT, "app", "trip", "[tripId]");
    const found: string[] = [];
    const walk = (dir: string, route: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name), `${route}/${e.name}`);
        else if (e.name === "page.tsx") found.push(route);
      }
    };
    walk(base, "trip/[tripId]");
    // 🔴 ควบคุมฝั่งบวก: วัด *คลังที่ assertion กิน* ไม่ใช่ค่าคงที่ข้างนอก — โฟลเดอร์ถูกย้าย/เปลี่ยนชื่อ
    //    เมื่อไหร่ `found` จะว่างแล้วเคสล่างจะแดงด้วยเหตุผลที่อ่านไม่ออก ถ้าไม่มีบรรทัดนี้
    expect(found.length, "ไม่เจอ page.tsx ใต้ app/trip/[tripId] เลย — โฟลเดอร์ถูกย้าย ไม่ใช่ 'ไม่มี route'").toBeGreaterThan(0);
    expect(
      found.sort(),
      "route บนดิสก์ไม่ตรงกับ PLATFORM_ROUTES — เพิ่ม route แล้วต้องเพิ่มในลิสต์ ไม่งั้นมันจะไม่ถูกสแกนและไม่มีอะไรฟ้อง"
    ).toEqual([...PLATFORM_ROUTES].sort());
  });
});
