import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * ตัวไล่ **import graph** ที่ใช้ร่วมกัน — แยกออกมา 30 ส.ค. 2026 ตอนเพิ่ม
 * [`serverDataReach.test.ts`](./serverDataReach.test.ts) ซึ่งต้องใช้ตัวเดียวกับ
 * [`layoutImportGraph.test.ts`](./layoutImportGraph.test.ts)
 *
 * 🔴 **เหตุผลที่ไม่ก๊อป:** ตัวไล่กราฟสองใบที่ต้องซิงก์กันเอง = แหล่งความจริงใบที่สอง
 * ใบหนึ่งแก้ resolver แล้วอีกใบไม่แก้ → ด่านสองใบตอบคนละอย่างโดยไม่มีอะไรฟ้อง
 *
 * ขอบเขต — ตรงกับที่ `layoutImportGraph` เขียนไว้เดิม และยังจริงทุกตัวอักษร:
 *   ครอบ    = `import … from` / `export … from` ที่เป็น **ค่า**
 *   ไม่ครอบ = `import type` · `import()` แบบ dynamic · การรวม/แยก chunk จริงของ bundler
 *   → ตอบว่า "โค้ดเชื่อมถึงกันไหม" ไม่ได้ตอบว่า "ไปอยู่ในบันเดิลเดียวกันไหม"
 */
export const ROOT = process.cwd();
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

export const rel = (p: string) => relative(ROOT, p);

/** ดึง specifier ของ import/export ที่เป็น **ค่า** — ตัด `import type …` ทิ้งก่อน */
export function valueSpecifiers(src: string): string[] {
  const withoutTypeImports = src.replace(/^\s*import\s+type\s[^;]*;?$/gm, "");
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]{0,300}?from\s*["']([^"']+)["']/g;
  for (const m of withoutTypeImports.matchAll(re)) out.push(m[1]);
  for (const m of withoutTypeImports.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/** แปลง specifier เป็นพาธจริง · คืน `null` ถ้าเป็นแพ็กเกจใน `node_modules` */
export function resolveSpecifier(spec: string, importerDir: string): string | null {
  if (spec.endsWith(".css")) return null;
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(importerDir, spec);
  else return null;
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

/** ไล่กราฟจากไฟล์ตั้งต้น · คืนแผนที่ ไฟล์ → ไฟล์ที่ import มัน (ไว้พิมพ์เส้นทาง) */
export function walk(entry: string): Map<string, string | null> {
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

/** เส้นทางจาก entry ถึงไฟล์ที่ผิด — ให้คนแก้เห็นว่ามันเชื่อมมาทางไหน */
export function chainTo(graph: Map<string, string | null>, file: string): string {
  const chain: string[] = [];
  let cur: string | null = file;
  while (cur) {
    chain.unshift(rel(cur));
    cur = graph.get(cur) ?? null;
  }
  return chain.join("\n    → ");
}

/** ไฟล์ `.ts`/`.tsx` ทุกใบใต้โฟลเดอร์ — **จักรวาลมาจากดิสก์ ไม่ใช่ทะเบียน** */
export function sourceFilesUnder(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFilesUnder(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
