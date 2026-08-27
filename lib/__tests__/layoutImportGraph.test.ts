import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * กันเนื้อหาทริปหลุดเข้าบันเดิลของหน้าที่ไม่ต้องล็อก (`docs/engine/security-review.md §9.7`)
 *
 * ที่มา: P6 พบว่า `data/*` ถูก import แบบ static เข้า client component จึงลงไปนอนใน
 * `/_next/static/chunks/` ซึ่ง `proxy.ts` **ยกเว้น `_next` ทั้งก้อนออกจากด่าน PIN**
 * ตรวจ build จริงแล้วพบว่าหน้า public กับหน้า 404 **ไม่ได้ลากเนื้อหาทริปมาด้วย**
 * (ตอนตรวจครั้งแรกหน้า public คือ `/unlock` · `AC6` ลบมันไปแล้ว 25 ส.ค. 2026 · ตอนนี้คือ `/login`
 *  — ข้อสรุปไม่เปลี่ยน เพราะสิ่งที่วัดคือ **layout** ไม่ใช่หน้าใดหน้าหนึ่ง)
 * เพราะ chain ของ `app/layout.tsx` ไม่มีตัวไหนแตะ `data/*` เลย
 *
 * 🔴 **แต่นั่นเป็นคุณสมบัติที่ไม่มีใครตั้งใจรักษาไว้** — ใครเติม
 * `import { DAYS } from "@/data/itinerary"` ลง component ที่ root layout ครอบอยู่เพื่อความสะดวก
 * ข้อสรุปนั้นพลิกทันที **โดยไม่มีอะไรฟ้อง** ไฟล์นี้คือสิ่งที่ฟ้อง
 *
 * ⚠️ **แก้ 26 ส.ค. 2026 (`E5-AC1`):** `TripDataProvider` ย้ายออกจาก root layout แล้ว — ต้องมี `tripId`
 * จริงจาก `/trip/[tripId]` หรือจาก `useActiveTripId()` ที่หน้า bare ไม่ใช่ resolve เองแบบเดิม root layout
 * จึงครอบแค่ `OfflineBanner`/`SystemModeBanner`/`ServiceWorkerRegistrar`/`ToastHost` เท่านั้น — canary
 * ข้างล่างเปลี่ยนไปอ้างของกลุ่มนี้แทน `TripDataProvider`/`useBookings` (ที่ไม่อยู่ใน chain นี้อีกแล้ว)
 *
 * ขอบเขตที่ไฟล์นี้ครอบ — เขียนไว้ตรงนี้เพราะ "เหตุผลที่ครอบแคบกว่าที่คนอ่านเข้าใจ"
 * คือชนิดของบั๊กที่เรากำลังกันอยู่พอดี:
 *   ครอบ    = import แบบ static (`import … from`) และ re-export (`export … from`) ที่เป็น **ค่า**
 *   ไม่ครอบ = `import type` (ถูกลบตอน compile จึงไม่ขึ้นบันเดิล)
 *           · `import()` แบบ dynamic (แยก chunk ของตัวเอง ไม่ได้อยู่ในก้อนของ layout)
 *           · การที่ bundler รวม/แยก chunk จริงอย่างไร — **ต้องดูจาก build เท่านั้น**
 *   → ไฟล์นี้ตอบว่า "โค้ดเชื่อมถึงกันไหม" ไม่ได้ตอบว่า "ไบต์ไปอยู่ chunk ไหน"
 */

const ROOT = process.cwd();
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

/** ดึง specifier ของ import/export ที่เป็น **ค่า** — ตัด `import type …` ทิ้ง */
function valueSpecifiers(src: string): string[] {
  const withoutTypeImports = src.replace(/^\s*import\s+type\s[^;]*;?$/gm, "");
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]{0,300}?from\s*["']([^"']+)["']/g;
  for (const m of withoutTypeImports.matchAll(re)) out.push(m[1]);
  // `import "./x"` แบบไม่มี binding
  for (const m of withoutTypeImports.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/** แปลง specifier เป็นพาธจริง · คืน null ถ้าเป็นแพ็กเกจหรือไฟล์ที่ไม่ใช่โค้ด */
function resolveSpecifier(spec: string, importerDir: string): string | null {
  if (spec.endsWith(".css")) return null;
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(importerDir, spec);
  else return null; // แพ็กเกจใน node_modules — ไม่ตาม
  for (const ext of ["", ...EXTS]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const ext of EXTS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** ไล่ import graph จากไฟล์ตั้งต้น · คืนแผนที่ ไฟล์ → ไฟล์ที่ import มันเข้ามา (ไว้พิมพ์ chain) */
function walk(entry: string): Map<string, string | null> {
  const seen = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const src = readFileSync(file, "utf8");
    for (const spec of valueSpecifiers(src)) {
      const target = resolveSpecifier(spec, dirname(file));
      if (!target || seen.has(target)) continue;
      seen.set(target, file);
      queue.push(target);
    }
  }
  return seen;
}

const rel = (p: string) => relative(ROOT, p);
const dataFiles = (graph: Map<string, string | null>) =>
  [...graph.keys()].filter((f) => rel(f).startsWith("data/")).map(rel).sort();

/** พิมพ์เส้นทางจาก entry ถึงไฟล์ที่ผิด — ให้คนแก้เห็นว่าต้องไปตัดตรงไหน */
function chainTo(graph: Map<string, string | null>, file: string): string {
  const chain: string[] = [];
  let cur: string | null = file;
  while (cur) {
    chain.unshift(rel(cur));
    cur = graph.get(cur) ?? null;
  }
  return chain.join("\n    → ");
}

describe("import graph ของ app/layout.tsx", () => {
  const layout = resolve(ROOT, "app/layout.tsx");
  const graph = walk(layout);

  // 🔴 เคสคู่ที่ขาดไม่ได้ (กฎข้อ 1 ของ README): ถ้า resolver พังเงียบ กราฟจะเหลือไฟล์เดียว
  //    แล้วเคส "ไม่มี data/" ข้างล่างจะเขียวโดยไม่ได้พิสูจน์อะไรเลย
  it("ตัวไล่กราฟทำงานจริง — ไปถึง component/hook ที่รู้ว่าอยู่ใน chain", () => {
    const reached = [...graph.keys()].map(rel);
    expect(reached).toContain("components/SystemModeBanner.tsx");
    expect(reached).toContain("hooks/useOnlineStatus.ts");
    expect(reached).toContain("lib/toast.ts");
    expect(graph.size).toBeGreaterThan(5);
  });

  it("🔴 chain ของ layout ต้องไม่ไปถึง data/* เลยสักไฟล์", () => {
    const found = dataFiles(graph);
    const detail = found.map((f) => chainTo(graph, resolve(ROOT, f))).join("\n\n");
    expect(
      found,
      found.length
        ? `layout ลาก data/* เข้ามาแล้ว → เนื้อหาทริปจะลงไปอยู่ในบันเดิลของ **ทุกหน้า** ` +
            `รวมหน้าที่ไม่ต้องล็อกอิน (/login · 404)\nเส้นทาง:\n    ${detail}`
        : "",
    ).toEqual([]);
  });

  // 🔴 กฎข้อ 2 ของ README: "ต้องเห็นมันแดงก่อน" — พิสูจน์ว่าตัวตรวจ *ตรวจเจอ* ได้จริง
  //    โดยเอาไปใช้กับหน้าที่ import data/ อยู่แล้ว · ถ้าเคสนี้ไม่เจออะไร แปลว่าตัวตรวจเสีย
  //    ไม่ใช่ว่าโค้ดสะอาด — และเคสข้างบนก็เชื่อไม่ได้ตามไปด้วย
  //
  // 🔴 เป้าเดิมคือ app/page.tsx — เปลี่ยนเป็น components/TripPlanScreen.tsx แทน (P2 27 ส.ค. 2026,
  // อนุมัติจาก P1) ตอนที่ "/" เปลี่ยนความหมายเป็นหน้า Home (ลิสต์ทริป) เนื้อหาทริปเดิมที่ import
  // data/itinerary.ts ย้ายออกจาก app/page.tsx ไปอยู่ที่ TripPlanScreen.tsx ทั้งก้อน — app/page.tsx
  // ตอนนี้เหลือแค่ import HomeScreen เดียว ไม่แตะ data/* เลย ถ้าไม่ย้ายเป้า positive control นี้จะแดง
  // ตลอดไปโดยไม่ได้บอกอะไรผิด (เจตนาของเคสไม่เปลี่ยน แค่ตามไฟล์ที่เนื้อหาย้ายไป)
  it("ตัวตรวจจับได้จริง — หน้าแผน (components/TripPlanScreen.tsx) ต้องไปถึง data/*", () => {
    const found = dataFiles(walk(resolve(ROOT, "components/TripPlanScreen.tsx")));
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain("data/itinerary.ts");
  });
});
