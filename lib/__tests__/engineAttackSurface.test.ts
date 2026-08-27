import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `E3-AC9` ② — แผนที่พื้นผิวโจมตีของ engine API · เจ้าของ: P4-QA/Sec (26 ส.ค. 2026)
 *
 * ## ไฟล์นี้ทำอะไร (และไม่ทำอะไร)
 * เกณฑ์ ② พูดว่า *"Server Action ทำงานแทน A ต้องแตะทริป B ไม่ได้ วัดด้วยเมทริกซ์ชุดเดียวกับ E2-AC1"*
 * แต่ก่อนจะยิงข้ามผู้ใช้ได้ ต้องรู้ก่อนว่า **route ไหนรับ `tripId` จาก URL** (ยิงข้ามได้)
 * กับ **route ไหนหา target จากตัวผู้เรียกเอง** (ยิงข้ามไม่ได้ตามนิยาม)
 *
 * 🔴 **นี่คือไฟล์ *สแตติก* — มันจำแนกพื้นผิว ไม่ได้ยิงจริง**
 * การยิงข้ามผู้ใช้จริง (in-process ด้วยคุกกี้ของ B) อยู่ใน `engineCrossUser.test.ts`
 * · หน้าที่ของไฟล์นี้คือ **บังคับให้ทุก route บนดิสก์ถูกจำแนก** → route ตัวที่ 12 เพิ่มเข้ามา
 *   โดยไม่มีใครตัดสินว่ามันเป็นเป้ายิงข้ามหรือไม่ = **เคสนี้แดงทันที** (P1 · "ไฟล์บนดิสก์ครอบเอง")
 *
 * ## สิ่งที่ค้นเจอ (26 ส.ค. 2026) — พื้นผิวคือ 9 ไม่ใช่ 11
 * · `plans` ใช้ `soleTrip(db)` → หา tripId จากทริปใบเดียวของผู้เรียกเอง **ไม่มี tripId เป็น input**
 * · `system-mode` = ธงโหมดอ่านอย่างเดียว · 401-exempt โดยตั้งใจ · ไม่มีข้อมูลรายทริป
 * · `trips` (list) = คืนทริปของผู้เรียกเอง · RLS คุม · ไม่มี tripId เป็น input
 * → ทั้งสามยิงข้ามด้วย tripId ของคนอื่นไม่ได้ · **เป้าจริงคือ 9 route ใต้ `trips/[tripId]/`**
 *
 * 🔴 อัปเดต 27 ส.ค. 2026 — **เป็น 10 แล้ว**: เพิ่ม `members` (GET · แถว avatar ใน TripHeader ของ P2)
 *    · P1 เขียน route · P4 เขียน probe ข้ามผู้ใช้ (viewer เห็น/คนนอกได้ []) ก่อนขยับเลข 9→10 ที่นี่
 *    · **คนเขียน route ≠ คนเขียน probe** โดยตั้งใจ — probe วัดสิ่งที่ผู้โจมตีลอง ไม่ใช่สิ่งที่ route ตั้งใจ
 */

const ENGINE_DIR = "app/api/engine";
const METHOD = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/** route.ts ทุกไฟล์ใต้ engine — relative ต่อ repo root */
function routeFiles(): string[] {
  const root = resolve(process.cwd());
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name === "route.ts") {
        out.push(full.slice(root.length + 1));
      }
    }
  };
  walk(resolve(root, ENGINE_DIR));
  return out.sort();
}

function methodsOf(rel: string): string[] {
  const src = readFileSync(resolve(process.cwd(), rel), "utf8");
  return [...src.matchAll(METHOD)].map((m) => m[1]).sort();
}

/** เป้ายิงข้ามผู้ใช้ก็ต่อเมื่อ path รับ `[tripId]` จาก URL */
const isTripScoped = (rel: string) => rel.includes("trips/[tripId]/");

/**
 * ทะเบียนพื้นผิว — **ทุก route.ts บนดิสก์ต้องอยู่ในนี้**
 * · `trip`  = รับ tripId จาก URL → เป้ายิงข้าม → ต้องมี probe ใน `engineCrossUser.test.ts`
 * · `account` = หา target จากตัวผู้เรียก/ไม่มี tripId → ไม่ใช่เป้ายิงข้าม · **ต้องมีเหตุผล `why`**
 */
const SURFACE: Record<string, { scope: "trip" | "account"; why?: string; authExempt?: true }> = {
  "app/api/engine/cities/route.ts": {
    scope: "account",
    why: "ค้นคลังเมืองสาธารณะ · ไม่มี tripId เป็น input และไม่แตะข้อมูลของทริปใดเลย "
      + "· บังคับล็อกอินเพื่อไม่ให้คลังถูกดูดออกไปทั้งใบ ไม่ใช่เพราะข้อมูลเป็นความลับ",
  },
  "app/api/engine/plans/route.ts": {
    scope: "account",
    why: "soleTrip() — หา tripId จากทริปใบเดียวของผู้เรียกเอง ไม่มี tripId เป็น input",
  },
  "app/api/engine/system-mode/route.ts": {
    scope: "account",
    authExempt: true,
    why: "ธงโหมดอ่านอย่างเดียว · 401-exempt **โดยตั้งใจ** · ไม่มีข้อมูลรายทริป "
      + "· ใส่ getUser() ที่นี่ = คนที่เซสชันหมดอายุระหว่าง cutover มองไม่เห็น banner (route.ts:19)",
  },
  "app/api/engine/trips/route.ts": {
    scope: "account",
    why: "คืนทริปของผู้เรียกเอง · RLS คุม · ไม่มี tripId เป็น input",
  },
  "app/api/engine/trips/[tripId]/bookings/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/checklist/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/custom-places/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/day-settings/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/days/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/hidden-places/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/hotels/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/members/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/place-notes/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/stops/route.ts": { scope: "trip" },
};

describe("E3-AC9 ② — แผนที่พื้นผิวโจมตี engine API", () => {
  it("control: ตัวอ่าน method ทำงาน และ enumerator เจอไฟล์จริง — ไม่งั้นเคสข้างล่างเทียบเซตว่าง", () => {
    const probe = "export async function GET(){}\nexport function POST(){}\nexport const PUT = 1";
    expect([...probe.matchAll(METHOD)].map((m) => m[1]).sort()).toEqual(["GET", "POST"]);
    // `export const PUT` ไม่ใช่ handler แบบ function → ไม่จับ (จงใจ · route ทั้งหมดใช้ function)
    expect(routeFiles().length, "ไม่เจอ route.ts เลย — path ENGINE_DIR ยังตรงกับดิสก์ไหม?").toBeGreaterThan(0);
  });

  it("ทุก route.ts บนดิสก์ต้องถูกจำแนกในทะเบียน — route ตัวที่ 12 เพิ่มมาโดยไม่จำแนก = แดงที่นี่", () => {
    const onDisk = routeFiles();
    const inRegistry = Object.keys(SURFACE).sort();
    const unclassified = onDisk.filter((r) => !SURFACE[r]);
    const stale = inRegistry.filter((r) => !onDisk.includes(r));
    expect(
      unclassified,
      "มี engine route บนดิสก์ที่ยังไม่ถูกจำแนกใน SURFACE\n" +
        "  → ตัดสินว่ามันรับ tripId จาก URL ไหม (scope 'trip' + probe ใน engineCrossUser) หรือ self-scoped (scope 'account' + why)\n" +
        `  ไฟล์: ${unclassified.join(" · ")}`,
    ).toEqual([]);
    expect(stale, `SURFACE ชี้ไปที่ route ที่ไม่มีบนดิสก์แล้ว: ${stale.join(" · ")}`).toEqual([]);
  });

  it("scope ที่ประกาศ ต้องตรงกับ path จริง · และ account ทุกตัวต้องมีเหตุผล", () => {
    for (const [rel, meta] of Object.entries(SURFACE)) {
      const declaredTrip = meta.scope === "trip";
      expect(
        declaredTrip,
        `${rel}: ประกาศ scope='${meta.scope}' แต่ path ${declaredTrip ? "ไม่" : ""}อยู่ใต้ trips/[tripId]/ — จำแนกไม่ตรง path`,
      ).toBe(isTripScoped(rel));
      if (meta.scope === "account") {
        expect(
          (meta.why ?? "").length,
          `${rel}: scope='account' ต้องเขียน why ว่าทำไมยิงข้ามด้วย tripId ไม่ได้ (ไม่งั้นถูกอ่านเป็น "ลืมจำแนก")`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("พื้นผิวยิงข้าม (trip-scoped) มีเท่าที่รู้ตอนนี้ = 10 · เพิ่ม/ย้าย route ใต้ [tripId] = แดง", () => {
    const trip = Object.entries(SURFACE)
      .filter(([, m]) => m.scope === "trip")
      .map(([r]) => r)
      .sort();
    // เทียบกับ path จริงบนดิสก์ ไม่ใช่แค่ทะเบียน — ถ้าย้าย route เข้า/ออก [tripId] ต้องมาแก้ทั้งคู่
    const tripOnDisk = routeFiles().filter(isTripScoped).sort();
    expect(trip, "ทะเบียน trip-scoped ไม่ตรงกับที่อยู่ใต้ trips/[tripId]/ บนดิสก์").toEqual(tripOnDisk);
    expect(
      trip.length,
      "จำนวน route ยิงข้ามเปลี่ยนจาก 10 — route ใหม่ต้องมี probe ข้ามผู้ใช้ใน engineCrossUser.test.ts ก่อนขยับเลขนี้",
    ).toBe(10);
  });

  it("ทุก trip-scoped route ต้อง export อย่างน้อยหนึ่ง HTTP method (ไม่งั้น probe จะไม่มีอะไรยิง)", () => {
    for (const [rel, meta] of Object.entries(SURFACE)) {
      if (meta.scope !== "trip") continue;
      expect(methodsOf(rel).length, `${rel}: ไม่ export HTTP method เลย`).toBeGreaterThan(0);
    }
  });

  /**
   * 🔴 ทะเบียนบอกว่า route ถูก **จำแนก** แล้ว · ไม่ได้บอกว่ามัน **บังคับ auth จริง** (P4/P1 · 27 ส.ค. 2026)
   * route ที่ประกาศ account/trip แล้วลืม `getUser()` **ผ่านทะเบียนเงียบ ๆ** — รูปเดียวกับ `why` ที่เป็น
   * *คำสัญญา* ไม่ใช่ *ข้อเท็จจริงที่ถูกวัด* · ก่อนหน้านี้ P4 ไปวัดด้วยมือว่า cities เรียก getUser() — ถูก
   * แต่นั่นคือ*คนทำ* ไม่ใช่*ด่านทำ* · route ตัวที่ 11 จะไม่มีใครวัด · ด่านนี้อ่าน source มายืนยันทุกตัว
   *
   * 🎯 จับ **การเรียกจริง** ไม่ใช่แค่ import: match `getUser(` / `unauthenticatedResponse(` (มีวงเล็บ)
   *    บรรทัด import เขียน `getUser,` ไม่มีวงเล็บ → ไม่ match · และตัด comment ออกก่อน (docstring ของ
   *    system-mode พูดถึง `getUser()` ทั้งที่ตั้งใจไม่มี — ถ้าไม่ตัด comment จะ false-green)
   */
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^:]|^)\/\/[^\n]*/g, "$1");

  it("🔴 ทุก route ที่ไม่ authExempt ต้อง gate ด้วย getUser()+unauthenticatedResponse — ทะเบียนไม่ได้บังคับ auth ให้", () => {
    // control: ตัวจับต้องแยก "gate จริง" ออกจาก "เปล่า" และ "import เฉย ๆ" — ไม่งั้นเซตว่างข้างล่าง
    // แปลว่า regex พัง ไม่ใช่ route ปลอดภัย · เคส importOnly คือหัวใจของดีไซน์ "จับการเรียก ไม่ใช่ import"
    const has = (s: string) => /\bgetUser\s*\(/.test(s) && /\bunauthenticatedResponse\s*\(/.test(s);
    const gated = codeOnly('import { getUser, unauthenticatedResponse } from "@/lib/auth/server";\n'
      + "export async function GET() { const u = await getUser(); if (!u) return unauthenticatedResponse(); }");
    const open = codeOnly("export async function GET() { return Response.json({}); }");
    const importOnly = codeOnly('import { getUser, unauthenticatedResponse } from "@/lib/auth/server";\n'
      + "export async function GET() { return Response.json({}); }");
    expect(has(gated), "control: route ที่ gate จริงต้องผ่าน").toBe(true);
    expect(has(open), "control: route เปล่าต้องถูกจับ").toBe(false);
    expect(has(importOnly), "control: import getUser แต่ไม่เรียก = ไม่นับว่า gate (บรรทัด import ไม่มีวงเล็บ)").toBe(false);

    const offenders: string[] = [];
    for (const [rel, meta] of Object.entries(SURFACE)) {
      if (meta.authExempt) continue;
      const src = codeOnly(readFileSync(resolve(process.cwd(), rel), "utf8"));
      const missing: string[] = [];
      // getUser() = อ่านตัวตน · unauthenticatedResponse() = ปิดประตูเมื่อไม่มี user — ขาดตัวใดตัวหนึ่ง = ไม่ได้ gate
      // (getUser() เฉย ๆ ไม่ตามด้วยการปฏิเสธ = อ่านแล้วปล่อยผ่าน · unauthenticatedResponse ไม่มี = ไม่มีประตูจะปิด)
      if (!/\bgetUser\s*\(/.test(src)) missing.push("getUser()");
      if (!/\bunauthenticatedResponse\s*\(/.test(src)) missing.push("unauthenticatedResponse()");
      if (missing.length) offenders.push(`${rel} (ขาด ${missing.join("+")})`);
    }
    expect(
      offenders,
      "engine route ที่ไม่ประกาศ authExempt แต่ไม่ gate auth — เปิด anon เงียบ ๆ\n" +
        "  → เพิ่ม getUser()+unauthenticatedResponse() ที่หัว handler · หรือถ้าตั้งใจเปิด ประกาศ authExempt:true พร้อม why\n" +
        `  ไฟล์: ${offenders.join(" · ")}`,
    ).toEqual([]);
  });

  it("authExempt ทุกตัวต้องมี why — 401-exempt เป็นการตัดสินใจที่ต้องอธิบาย ไม่ใช่ของหลุด", () => {
    for (const [rel, meta] of Object.entries(SURFACE)) {
      if (!meta.authExempt) continue;
      expect(
        (meta.why ?? "").length,
        `${rel}: authExempt:true แต่ไม่มี why — เขียนว่าทำไม route นี้ถึงไม่ต้องล็อกอิน (ไม่งั้นถูกอ่านเป็น "ลืมใส่ getUser")`,
      ).toBeGreaterThan(0);
    }
  });
});
