#!/usr/bin/env node
/**
 * สร้าง `lib/engine/database.types.ts` จาก **สคีมาสดของฐาน** ผ่าน OpenAPI ของ PostgREST
 * เจ้าของ: P1-Lead · 28 ส.ค. 2026
 *
 * ## 🔴 ทำไมไม่ใช้ `supabase gen types`
 * มันต้องใช้ access token ผ่าน keychain ของผู้ใช้ → **รันอัตโนมัติไม่ได้ และค้างรอ input**
 * · PostgREST เสิร์ฟ OpenAPI ที่ `/rest/v1/` ซึ่งอ่านได้ด้วย service role key ที่มีอยู่แล้วใน `.env.local`
 * · 🎯 **และมันคือสคีมา *สด* ไม่ใช่ไฟล์ migration** — จึงตรงกับของที่โค้ดจะเจอจริง
 *   (ต่างจากการอ่าน `supabase-platform/supabase/migrations/*.sql` ซึ่งอาจ drift จากฐาน
 *    และ drift แบบนั้นคือสิ่งที่ไฟล์นี้มีไว้จับ ไม่ใช่สิ่งที่ควรเอามาเป็นแหล่ง)
 *
 * ## ⚠️ ข้อจำกัดที่ต้องรู้ ไม่ใช่ของที่ซ่อนไว้
 * · **เห็นเฉพาะสิ่งที่ PostgREST expose** — schema `app` ไม่ถูก expose จึงไม่อยู่ในนี้ (ตั้งใจ)
 * · **ไม่มี enum จริง** — คอลัมน์ที่มี `check (x in (...))` มาเป็น `string` เพราะ OpenAPI ไม่บอก
 * · **ไม่มีความสัมพันธ์** — `Relationships` ว่างเปล่า · การฝัง (`table(col)`) จึงยังไม่ถูกตรวจ
 * · 🔴 **ต้องรันใหม่ทุกครั้งที่ migration เปลี่ยนคอลัมน์** ไม่งั้นชนิดจะบอกของเก่า
 *
 * รัน: `npm run gen:types`
 */
import { writeFileSync } from "node:fs";

// 🔴 **เลิกใช้ 28 ส.ค. 2026 — `npm run gen:types` ชี้ `supabase gen types` แล้ว**
//    เหตุผล: OpenAPI ของ PostgREST **ไม่ให้ความสัมพันธ์เลย** (`Relationships` ว่างทุกตาราง)
//    และ **ตัด FK หลายคอลัมน์ทิ้งทั้งหมด** → การฝัง (`table(col)`) ไม่ถูกตรวจชนิด
//    · ตัวนี้จึงเขียนทับไฟล์ชนิดแล้ว **ลบความสัมพันธ์ 55 เส้นทิ้งเงียบ ๆ** ถ้ามีใครเผลอรัน
//    🎯 เก็บไฟล์ไว้เพราะมันเป็นทางที่ **ไม่ต้องใช้ access token** — ถ้าวันหน้า CLI ใช้ไม่ได้
//      ให้รันด้วย `--force` แล้ว **จดไว้ว่าชนิดจะไม่มีความสัมพันธ์ในช่วงนั้น**
if (!process.argv.includes("--force")) {
  console.error("🔴 สคริปต์นี้เลิกใช้แล้ว — ใช้ `npm run gen:types` (supabase gen types) แทน");
  console.error("   ตัวนี้สร้างชนิดที่ **ไม่มีความสัมพันธ์** → เขียนทับแล้วจะทำให้ embed ไม่ถูกตรวจ");
  console.error("   ถ้าจำเป็นจริง (เช่น CLI ใช้ไม่ได้) รันด้วย: node scripts/gen-db-types.mjs --force");
  process.exit(1);
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY");
  console.error("รันแบบนี้: set -a && . ./.env.local && set +a && npm run gen:types");
  process.exit(1);
}

/** map ชนิดของ PostgREST → TypeScript · ครอบทุกคู่ที่มีจริงในฐานวันนี้ (สำรวจแล้ว 10 คู่) */
const TS = {
  "array|text[]": "string[]",
  "boolean|boolean": "boolean",
  "integer|int32": "number",
  "integer|int64": "number",
  "number|double precision": "number",
  "number|numeric": "number",
  "string|date": "string",
  "string|text": "string",
  "string|timestamp with time zone": "string",
  "string|timestamp without time zone": "string",
  "string|time without time zone": "string",
  "string|uuid": "string",
  "undefined|jsonb": "Json",
  "undefined|json": "Json",
};

const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!res.ok) {
  console.error("อ่าน OpenAPI ไม่ได้:", res.status, await res.text());
  process.exit(1);
}
const spec = await res.json();
const defs = spec.definitions ?? {};
const tables = Object.keys(defs).sort();
if (tables.length === 0) {
  console.error("🔴 OpenAPI คืน 0 ตาราง — อย่าเขียนไฟล์ทับด้วยของว่าง");
  process.exit(1);
}

/** ชนิดที่ไม่รู้จัก **ต้องล้ม ไม่ใช่เดาเป็น `unknown` เงียบ ๆ** — ชนิดที่ผิดแย่กว่าชนิดที่ไม่มี */
const unknownTypes = new Set();
const tsType = (p) => {
  const key = `${p.type}|${p.format}`;
  if (!TS[key]) unknownTypes.add(key);
  return TS[key] ?? "unknown";
};

const lines = [];
lines.push("// ⚠️ ไฟล์นี้ถูกสร้างอัตโนมัติ — ห้ามแก้มือ");
lines.push("// สร้างจาก **สคีมาสดของฐาน** ผ่าน OpenAPI ของ PostgREST · `npm run gen:types`");
lines.push("// ดูข้อจำกัด (ไม่มี enum · ไม่มีความสัมพันธ์ · เห็นเฉพาะ schema ที่ expose) ที่ scripts/gen-db-types.mjs");
lines.push("");
lines.push("export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];");
lines.push("");
lines.push("export type Database = {");
lines.push("  public: {");
lines.push("    Tables: {");
for (const t of tables) {
  const d = defs[t];
  const props = d.properties ?? {};
  const required = new Set(d.required ?? []);
  const cols = Object.keys(props).sort();
  lines.push(`      ${t}: {`);
  lines.push("        Row: {");
  for (const c of cols) {
    const nullable = !required.has(c);
    lines.push(`          ${c}: ${tsType(props[c])}${nullable ? " | null" : ""};`);
  }
  lines.push("        };");
  lines.push("        Insert: {");
  for (const c of cols) {
    // จำเป็นตอน insert เฉพาะ NOT NULL ที่ไม่มี default
    const mustGive = required.has(c) && props[c].default === undefined;
    const nullable = !required.has(c);
    lines.push(`          ${c}${mustGive ? "" : "?"}: ${tsType(props[c])}${nullable ? " | null" : ""};`);
  }
  lines.push("        };");
  lines.push("        Update: {");
  for (const c of cols) {
    const nullable = !required.has(c);
    lines.push(`          ${c}?: ${tsType(props[c])}${nullable ? " | null" : ""};`);
  }
  lines.push("        };");
  lines.push("        Relationships: [];");
  lines.push("      };");
}
lines.push("    };");
lines.push("    Views: Record<string, never>;");

// ── RPC ──────────────────────────────────────────────────────────────────
// 🔴 **ต้องมี ไม่ใช่ของแถม** — ถ้าปล่อย `Functions: Record<string, never>` แล้วเปลี่ยน `Db`
//    ให้รู้จักสคีมา · `db.rpc("x", { … })` จะแดงทุกจุดด้วยข้อความ *"not assignable to undefined"*
//    ซึ่ง **อ่านเหมือนโค้ดผิด ทั้งที่เป็นช่องว่างของตัวสร้างนี้เอง** (P1 เจอกับตัว 8 จุด)
// ⚠️ `Returns` เป็น `Json` เพราะ OpenAPI ไม่บอกชนิดผลลัพธ์ของ RPC — **จงใจไม่เดา**
lines.push("    Functions: {");
const rpcPaths = Object.keys(spec.paths ?? {}).filter((k) => k.startsWith("/rpc/")).sort();
for (const path of rpcPaths) {
  const name = path.slice("/rpc/".length);
  const props = spec.paths[path]?.post?.parameters?.[0]?.schema?.properties ?? {};
  const required = new Set(spec.paths[path]?.post?.parameters?.[0]?.schema?.required ?? []);
  const args = Object.keys(props).sort();
  lines.push(`      ${name}: {`);
  if (args.length === 0) {
    lines.push("        Args: Record<string, never>;");
  } else {
    lines.push("        Args: {");
    for (const a of args) {
      // 🔴 **`| null` เพราะ OpenAPI ไม่บอกว่าพารามิเตอร์ตัวไหน nullable — ไม่ใช่เพราะหลวมไว้ก่อน**
      //    ฉบับแรกผมบังคับ non-null ด้วยเหตุผลว่า *"เข้มไว้ดีกว่าหลวม"* → **แดง 7 จุดที่ไม่ใช่บั๊ก**
      //    (`p_base_timezone` · `p_city_id` ฯลฯ รับ `null` ได้จริงและโค้ดส่ง `null` มาถูกแล้ว)
      //    🎯 **ชนิดที่แกล้งรู้สิ่งที่แหล่งไม่ได้บอก คือชนิดที่ผิด ไม่ใช่ชนิดที่เข้ม**
      //    · ส่วน *ชื่อ* พารามิเตอร์ยังถูกตรวจครบ (พิมพ์ผิด/ลืมส่ง = แดง) ซึ่งคือคุณค่าหลักอยู่แล้ว
      lines.push(`          ${a}${required.size > 0 && !required.has(a) ? "?" : ""}: ${tsType(props[a])} | null;`);
    }
    lines.push("        };");
  }
  lines.push("        Returns: Json;");
  lines.push("      };");
}
lines.push("    };");
lines.push("    Enums: Record<string, never>;");
lines.push("    CompositeTypes: Record<string, never>;");
lines.push("  };");
lines.push("};");
lines.push("");

if (unknownTypes.size > 0) {
  console.error("🔴 เจอชนิดที่ยังไม่ได้ map — เติมใน TS ก่อน:", [...unknownTypes].join(" · "));
  process.exit(1);
}

writeFileSync("lib/engine/database.types.ts", lines.join("\n"));
console.log(`สร้างแล้ว: ${tables.length} ตาราง · ${Object.values(defs).reduce((n, d) => n + Object.keys(d.properties ?? {}).length, 0)} คอลัมน์`);
