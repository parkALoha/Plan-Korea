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
function markersFromSource(): string[] {
  const places = readFileSync(join(ROOT, "data/places.ts"), "utf8");
  const itinerary = readFileSync(join(ROOT, "data/itinerary.ts"), "utf8");
  const take = (src: string, re: RegExp, n: number) =>
    [...src.matchAll(re)].map((m) => m[1]).filter((v) => v.length >= 8).slice(0, n);
  return [
    ...take(places, /\bid:\s*"([^"]+)"/g, 5),
    ...take(itinerary, /\bdate:\s*"([^"]+)"/g, 5),
  ];
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
  const markers = markersFromSource();
  const tainted = taintedChunks(markers);

  /**
   * 🔴 เคสควบคุมฝั่งบวกชุดที่ 1 — **วิธีวัดยังทำงานอยู่ไหม**
   * ถ้า marker ถูกดึงผิด/regex พัง `tainted` จะว่าง แล้ว **ทุกเคสข้างล่างจะเขียวโดยไม่ได้พิสูจน์อะไร**
   */
  it("ดึง marker จากไฟล์ต้นทางได้จริง และเจอในบันเดิลจริง", () => {
    expect(markers.length, "ดึง marker จาก data/*.ts ไม่ได้เลย — regex พังหรือรูปไฟล์เปลี่ยน").toBeGreaterThan(3);
    expect(tainted.length, `marker ${markers.slice(0, 3).join(" · ")} ไม่เจอในบันเดิลเลย`).toBeGreaterThan(0);
  });

  /**
   * 🔴 เคสควบคุมฝั่งบวกชุดที่ 2 — **การจับคู่ route → chunk ยังทำงานอยู่ไหม**
   * `/today` · `/summary` เป็นเว็บทริปเกาหลีเดิม **ต้องมีข้อมูลนั้นจริง** · ถ้าเคสนี้แดงแปลว่าวิธีจับคู่พัง
   * ไม่ใช่ว่าบันเดิลสะอาด — และ xfail ข้างล่างจะเขียวด้วยเหตุผลที่ผิด
   */
  for (const route of LEGACY_ROUTES) {
    it(`positive control: /${route} (เว็บทริปเกาหลีเดิม) ต้องมีข้อมูลนั้นอยู่จริง`, () => {
      const found = taintedChunksOfRoute(route, tainted);
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
    const dirty = PLATFORM_ROUTES.filter((r) => taintedChunksOfRoute(r, tainted).length > 0);
    expect(dirty.sort()).toEqual([...PLATFORM_ROUTES].sort());
  });
});
