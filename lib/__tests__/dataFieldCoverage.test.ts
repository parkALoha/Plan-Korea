import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `E2-AC15` — **ทุกฟิลด์ใน `data/*.ts` ต้องมีปลายทางใน [`column-map.md`](../../docs/engine/column-map.md)**
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · เกณฑ์แยกออกจาก `E2-AC6` โดย P8
 *
 * ## 🔴 ทำไมใช้ตัวคอมไพเลอร์ ไม่ใช่ `regex` — และมันไม่ใช่เรื่องความสวยงาม
 *
 * `columnMapCoverage.test.ts` อ่าน SQL ด้วย regex ได้ เพราะ `create table` เป็น**ไวยากรณ์ปิด**
 * **TS type เป็นไวยากรณ์เปิด:** `Place & { … }` · `Record<K, V[]>` · `?` · nested · union · `extends`
 * → 🔴 **regex จะพลาดในทิศ *"มองไม่เห็น = ผ่าน"*** ซึ่งเป็นทิศที่ P4 เตือนไว้เรื่องด่าน `.from(`
 *
 * 🎯 **และตัวคอมไพเลอร์พิสูจน์ตัวเองตั้งแต่รันครั้งแรก:** มันชี้ว่า `Day` มี 13 ฟิลด์
 * และ **6 ตัวไม่เคยมีคำตอบที่ไหนเลย** (`weekdayTh` `weekdayEn` `cityTh` `cityEn` `overnightOptions` `slots`)
 * ทั้งที่ `D80`/`D81` ตอบเรื่องของ `Day` ไปแล้วสองเรื่อง — **มันไม่ได้เจอเพราะผมอ่านละเอียดขึ้น
 * มันเจอเพราะผมเลิกเป็นคนนับ**
 *
 * ## ⚠️ ขอบเขตที่ด่านนี้ครอบ และที่มันไม่ครอบ
 * · ครอบ: **ชื่อฟิลด์** ของ exported object type ทุกตัวใน `data/*.ts`
 * · 🔴 **ไม่ครอบ: ปลายทางนั้น*ถูก*ไหม** — มันตรวจว่า *มีคำตอบ* ไม่ใช่ว่า *คำตอบใช้ได้*
 *   (ฝั่ง SQL มีเคส *"คำตอบชี้ไปคอลัมน์ที่มีจริงไหม"* · ฝั่งนี้ยังไม่มี เพราะปลายทางเขียนเป็นร้อยแก้ว)
 * · 🔴 **ไม่ครอบ: ค่าคงที่** (`ITINERARY` · `PLACES` · `EMERGENCY_BY_COUNTRY`) — ครอบแต่ *รูปร่าง* ไม่ใช่ *เนื้อ*
 */

const DATA_FILES = [
  "data/places.ts",
  "data/itinerary.ts",
  "data/transferPoints.ts",
  "data/emergency.ts",
  "data/airportAccess.ts",
] as const;

const ROOT = join(__dirname, "../..");
const MAP_PATH = join(ROOT, "docs/engine/column-map.md");

/**
 * exported object type ทุกตัว → รายชื่อ property จริงจากตัวคอมไพเลอร์
 *
 * 🔴 **กรอง union ของสตริงออก** — `type City = "hanoi" | "busan"` ทำให้ `getPropertiesOfType`
 * คืน **method ของ `String` ทั้ง 47 ตัว** (`charAt` · `padStart` · …) ซึ่งไม่ใช่ฟิลด์ของใครเลย
 * ⚠️ **และถ้าไม่กรอง ด่านนี้จะแดงด้วยชื่อที่ไม่มีความหมาย แล้วคนถัดไปจะปิดมันทิ้งทั้งด่าน**
 */
function objectTypesOf(): Map<string, string[]> {
  const program = ts.createProgram(
    DATA_FILES.map((f) => join(ROOT, f)),
    { target: ts.ScriptTarget.ES2020, moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: ROOT, paths: { "@/*": ["./*"] } }
  );
  const checker = program.getTypeChecker();
  const out = new Map<string, string[]>();

  for (const file of DATA_FILES) {
    const sf = program.getSourceFile(join(ROOT, file));
    if (!sf) throw new Error(`E2-AC15: อ่าน ${file} ไม่ได้ — ด่านที่อ่านไฟล์ไม่ได้ ต้องล้ม ไม่ใช่ผ่าน`);

    ts.forEachChild(sf, (node) => {
      const isExported = ts.canHaveModifiers(node)
        && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExported) return;
      if (!ts.isTypeAliasDeclaration(node) && !ts.isInterfaceDeclaration(node)) return;

      // เก็บเฉพาะชนิดที่ "มีฟิลด์" จริง — TypeLiteral · Interface · Intersection ของสองอย่างนั้น
      const kindOk =
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeLiteralNode(node.type) ||
        ts.isIntersectionTypeNode(node.type);
      if (!kindOk) return;

      const props = checker.getPropertiesOfType(checker.getTypeAtLocation(node.name)).map((p) => p.getName());
      out.set(node.name.text, props);
    });
  }
  return out;
}

/**
 * โทเคนที่ `column-map.md` ตอบไว้ — เก็บจาก **ช่องแรกของแถวตาราง** ในหัวข้อ `data/*.ts` เท่านั้น
 *
 * 🔴 **ไม่เก็บจากร้อยแก้ว** โดยตั้งใจ — ถ้าเก็บ ชื่อฟิลด์ที่ถูก*พูดถึง*จะนับว่า*มีคำตอบ*
 * ซึ่งคือความต่างระหว่าง *"เขียนถึงแล้ว"* กับ *"ตัดสินแล้ว"* และ `P-57` เกิดจากช่องนั้นพอดี
 *
 * · `nameLocal?` → ตัด `?` ทิ้ง
 * · `flight.no` → นับทั้ง `flight.no` และ `no` (ฟิลด์ของชนิดซ้อน)
 */
function answeredTokens(): Set<string> {
  const tokens = new Set<string>();
  let inDataSection = false;

  for (const line of readFileSync(MAP_PATH, "utf8").split("\n")) {
    if (/^##\s/.test(line)) {
      inDataSection = /`data\/[\w.]+\.ts`/.test(line);
      continue;
    }
    if (!inDataSection) continue;
    if (!line.startsWith("|")) continue;

    const firstCell = line.slice(1).split("|")[0] ?? "";
    for (const m of firstCell.matchAll(/`([\w.?]+)`/g)) {
      const t = m[1].replace(/\?$/, "");
      tokens.add(t);
      const dot = t.lastIndexOf(".");
      if (dot !== -1) tokens.add(t.slice(dot + 1));
    }
  }
  return tokens;
}

describe("E2-AC15 — ทุกฟิลด์ใน data/*.ts มีปลายทาง", () => {
  const types = objectTypesOf();
  const answered = answeredTokens();

  it("ตัวคอมไพเลอร์เจอชนิดที่มีฟิลด์ครบ 8 ตัว", () => {
    // 🔴 สัญญาณเตือน ไม่ใช่เกณฑ์ — ถ้าขยับ แปลว่ามีชนิดใหม่/หายไป ควรมีคนมาอ่านว่าทำไม
    expect([...types.keys()].sort()).toEqual([
      "AirportAccessOption", "Day", "DayEvent", "EmergencyContact",
      "FlightInfo", "Layover", "Place", "Slot", "TransferPoint",
    ].sort());
  });

  it("🔴 ทุกชนิดถูกเอ่ยชื่อใน column-map.md — ชนิดใหม่ที่ไม่มีใครพูดถึงต้องแดง", () => {
    const md = readFileSync(MAP_PATH, "utf8");
    const silent = [...types.keys()].filter((n) => !md.includes("`" + n + "`")).sort();
    expect(silent, `ชนิดที่ไม่มีใครเอ่ยถึง: ${silent.join(", ")}`).toEqual([]);
  });

  it("🔴 ทุกฟิลด์มีคำตอบในช่องแรกของตาราง", () => {
    const gaps: string[] = [];
    for (const [name, props] of types) {
      for (const p of props) if (!answered.has(p)) gaps.push(`${name}.${p}`);
    }
    expect(gaps, `ฟิลด์ที่ไม่มีคำตอบ: ${gaps.join(" · ")}`).toEqual([]);
  });
});

/**
 * 🔴 **เคสด้านบวก — ห้ามลบ** · เหตุผลเดียวกับ `columnMapCoverage.test.ts`:
 * เคสข้างบนเขียวตั้งแต่รันครั้งแรก **ซึ่งควรสงสัยมากที่สุด ไม่ใช่สบายใจที่สุด** (`P-21`)
 */
describe("ด่านนี้จับของผิดได้จริงไหม — เคสด้านบวก", () => {
  const md = (...lines: string[]) => lines.join("\n");

  it("เก็บโทเคนเฉพาะช่องแรก ไม่เก็บจากช่องปลายทาง", () => {
    // ถ้าเก็บจากทุกช่อง ชื่อ *คอลัมน์ปลายทาง* จะกลายเป็น "คำตอบ" ของตัวเอง
    const src = md("## `data/x.ts` → `t`", "| `nameTh` | `catalog_name` |");
    const tokens = new Set<string>();
    for (const line of src.split("\n")) {
      if (!line.startsWith("|")) continue;
      const first = line.slice(1).split("|")[0] ?? "";
      for (const m of first.matchAll(/`([\w.?]+)`/g)) tokens.add(m[1].replace(/\?$/, ""));
    }
    expect([...tokens]).toEqual(["nameTh"]);
  });

  it("🔴 union ของสตริงต้องไม่ถูกนับเป็นชนิดที่มีฟิลด์ — ไม่งั้นได้ method ของ String มา 47 ตัว", () => {
    // เคสจริง: `type City = "hanoi" | "busan"` → getPropertiesOfType คืน charAt, padStart, …
    // ถ้าด่านแดงด้วยชื่อพวกนั้น คนถัดไปจะปิดทั้งด่าน ไม่ใช่แก้ข้อมูล
    const types = objectTypesOf();
    expect(types.has("City")).toBe(false);
    expect(types.has("Category")).toBe(false);
    expect(types.has("DayEventKind")).toBe(false);
  });

  it("🔴 ชนิดที่ประกอบจาก intersection ต้องได้ฟิลด์ของทั้งสองฝั่ง", () => {
    // `TransferPoint = Place & { transferKind, pickerHidden }`
    // ถ้าอ่านแค่ฝั่งขวา จะได้ 2 ฟิลด์แล้วเข้าใจว่าครบ — ทิศ "มองไม่เห็น = ผ่าน" เป๊ะ
    const props = objectTypesOf().get("TransferPoint") ?? [];
    expect(props).toContain("transferKind");
    expect(props).toContain("nameTh");
    expect(props.length).toBe(15);
  });
});
