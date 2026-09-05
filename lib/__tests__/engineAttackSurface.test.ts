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
 * 🔴 อัปเดต 27 ส.ค. 2026 — `cover` (route ที่ 11) **ถูกถอนทั้งชุด** ตามมติผู้ใช้ (รูปปกเป็นไฟล์สถิตย์
 *    ไม่ใช่ของอัปโหลด) → กลับมาเป็น **10** · **ถอนเพราะสโคปเปลี่ยน ไม่ใช่เพราะ probe ผิด**
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
const SURFACE: Record<
  string,
  { scope: "trip" | "account"; why?: string; authExempt?: true; proxyPublic?: true }
> = {
  "app/api/engine/places/route.ts": {
    scope: "account",
    why: "คลังสถานที่สาธารณะของเมืองหนึ่ง · รับ `cityId` ไม่ใช่ `tripId` และไม่แตะข้อมูลของทริปใดเลย "
      + "· `cityId` ไม่ใช่ความลับ (มาจาก /api/engine/cities ที่ใครล็อกอินก็เรียกได้) จึงไม่ใช่เป้ายิงข้าม",
  },
  "app/api/engine/countries/route.ts": {
    scope: "account",
    authExempt: true,
    proxyPublic: true,
    why: "🔴 เปิดสาธารณะ 4 ก.ย. 2026 (ผู้ใช้สั่ง: *คนที่ไม่ได้ล็อกอิน ควรจะเข้าหน้าแรกได้*) "
      + "· ไม่มี tripId เป็น input · ไม่แตะข้อมูลของทริปใดเลย "
      + "· 🔴 ข้อมูลออกทาง `list_public_destinations()` (definer) เท่านั้น — `anon` **ไม่มี grant บนตารางคลังสักใบ** "
      + "⇒ เปิด *ทางเดิน* ไม่ได้เปิด *ตาราง* · เพดาน 100 อยู่ในตัว RPC "
      + "· ด่านชั้นนอกอยู่ที่ PUBLIC_PATHS ใน proxy.ts — เคสอยู่ใน proxy.test.ts บล็อก 'เปิดดูก่อนสมัคร'",
  },
  "app/api/engine/cities/route.ts": {
    scope: "account",
    authExempt: true,
    proxyPublic: true,
    why: "🔴 **เปิดครึ่งเดียว** — `?country=xx` เปิด · `?q=` (ค้นด้วยคำ) **ยัง 401 ในตัว route เอง** "
      + "· 🎯 ทะเบียนนี้เป็นธงบูลีน จึงบอกได้แค่ *'มีกิ่งที่เปิด'* ไม่ได้บอกว่า *กิ่งไหน* "
      + "⇒ **ภาระพิสูจน์อยู่ที่ `publicBrowseRoutes.test.ts`** (เคส ④ ยืนยันว่า `q` ถูกปฏิเสธ "
      + "**และ RPC ไม่ถูกเรียกเลย** — ตอบ 401 หลังยิงฐานไปแล้วยังนับเป็นรั่ว) "
      + "· กิ่งที่เปิดออกทาง `list_public_cities()` (definer · เพดาน 100) — ไม่มี grant บนตารางให้ anon",
  },
  // 🔴 ใบที่ 14 (P1 · 4 ก.ย. 2026) — `GET`/`PATCH` โปรไฟล์ของผู้เรียก
  //    **ไม่มี id ใด ๆ เป็น input เลย** — แถวถูกเลือกด้วย `user.id` จาก session ฝั่งเซิร์ฟเวอร์
  //    🎯 ***ไม่มีอะไรให้ยิงข้าม เพราะไม่มีช่องให้ใส่ตัวระบุของคนอื่น*** — แข็งกว่า `soleTrip()`
  //       ตรงที่ `soleTrip` ยัง *หา* tripId ให้ · ใบนี้ไม่มีแนวคิดเรื่องเป้าหมายอื่นเลย
  //    ⚠️ วันที่มีใครเพิ่มพารามิเตอร์ระบุผู้ใช้ (เช่น `?userId=`) **ข้อความข้างบนเป็นเท็จทันที**
  //       และไม่มีอะไรในทะเบียนนี้จับได้ ⇒ ต้องย้ายเป็น scope ใหม่ + probe ข้ามผู้ใช้
  // 🔴 ใบที่ 15 (P1 · 4 ก.ย. 2026) — `GET` ทริปแนะนำ · **ไม่รับพารามิเตอร์ใด ๆ เลย**
  //    ไม่มี id · ไม่มี query · ผลเหมือนกันสำหรับผู้ใช้ทุกคนที่ล็อกอิน
  //    🎯 ***ไม่มีอะไรให้ยิงข้าม เพราะไม่มีช่องรับข้อมูลจากผู้เรียกเลยสักช่อง***
  //    ⚠️ เนื้อมาจาก `list_trip_templates()` (`security definer`) ซึ่งกรอง
  //       `published_template_at is not null` ในตัวมันเอง — **`where` นั้นคือด่านทั้งหมด**
  //       ⇒ วันที่มีใครเพิ่มพารามิเตอร์ (เช่น `?tripId=`) **ข้อความข้างบนเป็นเท็จทันที**
  //          และทะเบียนนี้จับไม่ได้ ⇒ ต้องย้าย scope + เขียน probe ข้ามผู้ใช้
  "app/api/engine/trip-templates/route.ts": {
    scope: "account",
    authExempt: true,
    proxyPublic: true,
    why: "🔴 เปิดสาธารณะ 4 ก.ย. 2026 (ผู้ใช้สั่ง: *ดูทริปแนะนำได้ แต่สร้างทริปไม่ได้*) "
      + "· ไม่รับ id หรือ query ใด ๆ — ผลเหมือนกันทุกคน · ด่านอยู่ใน `where` ของ definer RPC "
      + "(`published_template_at is not null and deleted_at is null`) "
      + "· 🎯 **เส้นนี้โชว์ 'มีอะไรให้ดู' · `copy_trip_template` ที่เอาไปใช้ ยัง grant ให้ `authenticated` เท่านั้น** "
      + "— สองคำถามคนละใบ และ assert ใน migration บังคับทั้งสองทิศ",
  },
  /**
   * 🔴 ใบที่ 16 (P1 · 5 ก.ย. 2026) — เอาทริปแนะนำมาเป็นทริปของตัวเอง
   *
   * ## ทำไม `account` ทั้งที่ **มี id อยู่ใน URL**
   * `isTripScoped()` ถามว่า path อยู่ใต้ `trips/[tripId]/` ไหม — ใบนี้อยู่ใต้ `trip-templates/`
   * ⇒ ทะเบียนบังคับให้เป็น `account` **และผมเห็นด้วยกับผลนั้น แต่ไม่ใช่เพราะ path**
   * 🎯 ***`templateId` เป็น "หมายเลขของสิ่งที่เผยแพร่แล้ว" ไม่ใช่ "หมายเลขทริปของใครสักคน"***
   *    definer กรอง `published_template_at is not null` ⇒ ***ยิง `templateId` เป็น id ทริปส่วนตัว
   *    ของคนอื่น จะได้ `P0002` เสมอ ไม่ว่าผู้เรียกเป็นใคร*** — ไม่มีคำตอบที่ต่างกันให้ไล่เดา
   *
   * ## ⚠️ ราคาที่ยังอยู่ และทะเบียนนี้จับไม่ได้
   * `where` นั้นคือด่านทั้งหมด · **ธงติดผิดใบเมื่อไหร่ ทริปส่วนตัวใบนั้นก๊อปได้ทันที**
   * — `20260904180000` เลือกทางนี้โดยรู้ตัว (*"ราคาแค่มีคนก๊อปแผนที่ไม่ได้ตั้งใจเผยแพร่
   * ไม่ใช่ข้อมูลรั่ว"* — ไม่มี policy ให้ *อ่าน* ทริปคนอื่นเพิ่มสักบรรทัด)
   * 🔴 **และคนติดธงคือ `service_role` เท่านั้น** (ทะเบียน `§3.5` ข้อ 8 · ไคลเอนต์ตั้งเองไม่ได้)
   *
   * ⚠️ วันที่มีใครเพิ่มพารามิเตอร์ที่ชี้ทริปอื่น (เช่น `?sourceTripId=`) **ข้อความข้างบนเป็นเท็จทันที**
   *    และทะเบียนนี้จับไม่ได้ เพราะมันจำแนกด้วย *path* ⇒ ต้องย้ายเป็น probe ข้ามผู้ใช้
   */
  /**
   * 🔴 ใบที่ 17 (P1 · 5 ก.ย. 2026) — **ดูรายละเอียดทริปแนะนำ ก่อนตัดสินใจสมัคร**
   * รับ `templateId` จาก URL แต่ไม่ใช่ `trip`-scoped ด้วยเหตุผลเดียวกับใบ `copy` ข้างล่าง:
   * definer กรอง `published_template_at is not null` ⇒ id ทริปส่วนตัวคืน **เซตว่าง** ทุกผู้เรียก
   * ⇒ route ตอบ `404` เหมือนกันหมด — ไม่บอกว่า *"มีอยู่แต่ไม่ได้เผยแพร่"*
   * ⚠️ อยู่ใน `PUBLIC_ID_CHILD_PATHS` (ลิสต์ใบที่สามของ `proxy.ts`) ⇒ ติดธง `proxyPublic`
   *    · 🔴 **ลิสต์นั้นเปิด `<uuid>` หนึ่งส่วนเป๊ะ ไม่เปิด `<uuid>/copy`** — เคสฝั่งลบใน `proxy.test.ts` บังคับ
   */
  "app/api/engine/trip-templates/[templateId]/route.ts": {
    scope: "account",
    authExempt: true,
    proxyPublic: true,
    why: "🔴 เปิดสาธารณะ 5 ก.ย. 2026 (ผู้ใช้ตัดสิน flow เอง: *กดแล้วบอกรายละเอียดทริปทั้งหมด*) "
      + "· รับ `templateId` จาก URL **แต่ยิงข้ามไม่ได้** — definer `get_trip_template()` กรอง "
      + "`published_template_at is not null and deleted_at is null` ⇒ id ทริปส่วนตัวได้เซตว่างทุกผู้เรียก "
      + "· 🔴 ข้อมูลออกทาง RPC เท่านั้น — `anon` **ไม่มี grant บน `trips`/`trip_days`/`trip_stops` สักใบ** "
      + "(assert ใน `20260905150000` บังคับทั้งสองทิศ) · ชุดคอลัมน์ที่ไหลออกปักหมุดไว้ที่ `schemaPins` "
      + "· ⚠️ **ราคาที่เปลี่ยน**: ก่อนหน้านี้ธงติดผิดใบ = มีคนก๊อปแผน · ตอนนี้ = **อ่านทั้งแผนได้ทันที** "
      + "— ยังกันด้วยข้อที่ว่าติดธงได้เฉพาะ `service_role`",
  },
  "app/api/engine/trip-templates/[templateId]/copy/route.ts": {
    scope: "account",
    why: "รับ `templateId` จาก URL **แต่ยิงข้ามไม่ได้** — definer `copy_trip_template()` กรอง "
      + "`published_template_at is not null` ⇒ id ของทริปส่วนตัวคนอื่นได้ `P0002` เสมอ ทุกผู้เรียก "
      + "· เขียนลงทริป **ของผู้เรียกเอง** (`created_by = auth.uid()`) ไม่ใช่ของ template "
      + "· 🔴 ต้องล็อกอิน — ต่างจาก `GET /trip-templates` ในโฟลเดอร์แม่ที่เปิดสาธารณะ "
      + "⇒ **ไม่อยู่ใน PUBLIC_PATHS** และนั่นคือเหตุผลที่ลิสต์นั้นถูกแยกเป็น exact/subtree ในใบเดียวกัน "
      + "(`proxy.ts` · เคสฝั่งลบใน `proxy.test.ts` บล็อก ③)",
  },
  "app/api/engine/profile/route.ts": {
    scope: "account",
    why: "แถวถูกเลือกด้วย user.id จาก session เท่านั้น — ไม่มี id จาก URL หรือ body ให้ยิงข้าม",
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
  // 🔴 สองใบนี้เพิ่ม 4 ก.ย. 2026 (P1) — **ทั้งคู่รับ `tripId` จาก URL** จึงเป็น `"trip"` ไม่ใช่ `"account"`
  //    · `destinations` — `PUT` เขียนทับรายการจุดหมายทั้งชุด
  //    · `[tripId]/route.ts` — `PATCH` แก้ช่วงวันของทริป แล้วซิงก์ `trip_days` ตามช่วงใหม่
  //    ⚠️ **ใบที่สองแตะ *ตัวทริปเอง* ไม่ใช่ตารางลูก** — เป็นใบแรกในทะเบียนนี้ที่ทำแบบนั้น
  //       `trips_update` จำกัด `owner` (ไม่ใช่ `can_write_trip` แบบตารางลูก) ⇒ **โพรบข้ามผู้ใช้
  //       ต้องยิงด้วย editor ไม่ใช่แค่ผู้ใช้นอกทริป** ไม่งั้นจะเขียวโดยไม่ได้แตะเส้นที่ต่างกันจริง
  "app/api/engine/trips/[tripId]/destinations/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/hidden-places/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/hotels/route.ts": { scope: "trip" },
  "app/api/engine/trips/[tripId]/members/route.ts": { scope: "trip" },
  // 🔴 ใบที่ 13 (P1 · 4 ก.ย. 2026) — `PUT` ปัก/ถอนหมุดทริป · **รับ `tripId` จาก URL ⇒ `"trip"`**
  //    ⚠️ **ระดับสิทธิ์กลับด้านกับทุกใบในทะเบียนนี้**: เก็บที่ `trip_members.pinned_at` *ของผู้เรียกเอง*
  //       ⇒ **สมาชิกคนไหนก็ปักได้ รวม `viewer`** — ไม่ต้อง `owner` ไม่ต้อง `editor`
  //    🎯 ***`scope: "trip"` ตอบว่า "ยิงข้ามด้วย tripId ได้ไหม" — ไม่ได้ตอบว่า "ใครควรผ่าน"***
  //       ทะเบียนนี้ไม่มีช่องสำหรับข้อหลัง และไม่ควรมี · **เจตนาของแต่ละใบอยู่ที่ probe**
  //       ⇒ probe ของใบนี้ต้อง assert ว่า **viewer สำเร็จ** ไม่ใช่ถูกปฏิเสธ (`engineCrossUser` บล็อก `E5-pin`)
  "app/api/engine/trips/[tripId]/pin/route.ts": { scope: "trip" },
  // 🔴 ใบที่ 14 (P1 · 4 ก.ย. 2026) — `POST` กู้ทริปที่ลบไว้ · **รับ `tripId` จาก URL ⇒ `"trip"`**
  //    ⚠️ **เป็นใบเดียวในทะเบียนที่ทำงานกับแถวที่ `trips_select` มองไม่เห็น**
  //       (ทริปที่ `deleted_at is not null` ถูกกรองออกจาก policy ไปแล้ว)
  //       ⇒ *probe แบบ "คนนอกยิงแล้วต้องได้ 404"* ยัง**ตรงตามที่ควร** แต่เหตุผลต่างจากใบอื่น:
  //       ใบอื่นได้ 404 เพราะ **RLS ไม่ให้เห็น** · ใบนี้ได้ 404 เพราะ **RPC ตรวจ `owner` เอง**
  //       (definer ⇒ RLS ถูกข้ามทั้งหมด — `where`/`if` ในตัวฟังก์ชันคือด่านเดียวที่เหลือ)
  //    🎯 ***ผลเหมือนกัน กลไกคนละตัว — และถ้าใครถอดบรรทัดตรวจ `owner` ออก จะไม่มี RLS มารับช่วงต่อ***
  "app/api/engine/trips/[tripId]/restore/route.ts": { scope: "trip" },
  // 🔴 ใบที่ 15 (P1 · 4 ก.ย. 2026) — ลิงก์ชวนเข้าทริป · **รับ `tripId` จาก URL ⇒ `"trip"`**
  //    ทั้ง 3 เมธอด (`GET`/`POST`/`DELETE`) เป็นของ **owner เท่านั้น** — ด่านอยู่ใน RPC ทุกใบ
  //    🔴 `POST` คืน **โทเคนดิบครั้งเดียว** ⇒ เป็น route เดียวใต้ `[tripId]` ที่คำตอบมีความลับอยู่ข้างใน
  //       ⇒ `private, no-store` ที่นั่นเป็นส่วนหนึ่งของด่าน ไม่ใช่การจูนประสิทธิภาพ
  "app/api/engine/trips/[tripId]/invites/route.ts": { scope: "trip" },
  // ── สองใบข้างล่างรับ *โทเคน* ไม่ใช่ `tripId` ⇒ `"account"` ไม่ใช่ `"trip"` ──
  // 🎯 ***ยิงข้ามด้วย `tripId` ไม่ได้ตามนิยาม เพราะไม่มี `tripId` ให้ใส่*** — พื้นผิวคือ *การเดาโทเคน*
  //    ซึ่งเป็นคนละคำถามกับที่ทะเบียนนี้ถาม · เคสของมันอยู่ที่ `inviteRoutes.test.ts`
  "app/api/engine/invites/peek/route.ts": {
    scope: "account",
    authExempt: true,
    proxyPublic: true,
    why: "🔴 คนกดลิงก์ยังไม่มีบัญชี ต้องรู้ว่ากำลังจะรับอะไรก่อนตัดสินใจสมัคร "
      + "· คืนแค่ trip_title · inviter_name · role · expired — **ไม่มี trip_id** "
      + "⇒ ถือลิงก์ = เห็นชื่อทริปกับชื่อคนชวน ไม่ใช่เห็นแผน "
      + "· 🔴 เป็นเส้นเดียวในระบบที่ *เดาค่าแล้วได้ข้อมูล* ⇒ rate limit แคบกว่าเส้นอื่น (20/นาที) "
      + "และโทเคน 256 บิตคือชั้นแรก · ทุกความล้มเหลวตอบ 404 เหมือนกันหมด ไม่บอกว่า 'มีแต่หมดอายุ'",
  },
  "app/api/engine/invites/redeem/route.ts": {
    scope: "account",
    why: "🔴 **ต้องล็อกอิน** — ต่างจาก peek ที่อยู่โฟลเดอร์เดียวกัน "
      + "· *ดูว่าถูกชวนไปไหน* ไม่ต้องมีตัวตน · *เข้าไปเป็นสมาชิก* ต้องมีตัวตนที่จะผูกสิทธิ์ "
      + "· ด่านสองชั้น: ไม่อยู่ใน PUBLIC_PATHS **และ** anon ไม่มี grant execute บน RPC",
  },
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

  it("พื้นผิวยิงข้าม (trip-scoped) มีเท่าที่รู้ตอนนี้ = 15 · เพิ่ม/ย้าย route ใต้ [tripId] = แดง", () => {
    const trip = Object.entries(SURFACE)
      .filter(([, m]) => m.scope === "trip")
      .map(([r]) => r)
      .sort();
    // เทียบกับ path จริงบนดิสก์ ไม่ใช่แค่ทะเบียน — ถ้าย้าย route เข้า/ออก [tripId] ต้องมาแก้ทั้งคู่
    const tripOnDisk = routeFiles().filter(isTripScoped).sort();
    expect(trip, "ทะเบียน trip-scoped ไม่ตรงกับที่อยู่ใต้ trips/[tripId]/ บนดิสก์").toEqual(tripOnDisk);
    // 🔴 **13 → 14 เมื่อ 4 ก.ย. 2026 (เย็น)** — `restore/route.ts` (กู้ทริปที่ลบไว้ · owner เท่านั้น)
    // 🔴 **12 → 13 เมื่อ 4 ก.ย. 2026 (บ่าย)** — `pin/route.ts` (ดูหมายเหตุในทะเบียน: viewer ต้อง *ผ่าน*)
    // 🔴 **10 → 12 เมื่อ 4 ก.ย. 2026** (P1 เขียน route · P4 เขียน probe แล้วจึงขยับเลขนี้ ตามลำดับที่ข้อความนี้สั่ง)
    //    · `destinations/route.ts`  `PUT`   — probe: owner/editor เขียนได้ · viewer/คนนอกไม่ได้ · กิ่ง delete-only
    //    · `[tripId]/route.ts`      `PATCH` — probe: **editor ถูกปฏิเสธ** (`trips_update` = owner) · คนนอกไม่ได้
    //      · ⚠️ ใบหลังต้องยิงด้วย **editor** ไม่ใช่แค่คนนอก — คนนอกถูกกันตั้งแต่ `can_read_trip`
    //        **ไม่เคยเดินไปถึงเส้น `owner` เลย** ⇒ probe คนนอกอย่างเดียวจะเขียวโดยไม่ได้แตะเส้นที่ต่างกันจริง
    // 🔴 **14 → 15 เมื่อ 4 ก.ย. 2026 (ดึก)** — `invites/route.ts` (`GET`/`POST`/`DELETE` · owner เท่านั้น)
    //    probe ข้ามผู้ใช้อยู่ที่ `engineCrossUser` บล็อก `E5-invite`
    // 🔴 **13 → 14 เมื่อ 4 ก.ย. 2026 (เย็น)** — `restore/route.ts` `POST`
    //    probe อยู่ที่ `engineCrossUser` บล็อก `E5-trash` · **เขียน probe ก่อนขยับเลขนี้ ตามที่ข้อความสั่ง**
    //    กิ่งที่ probe แตะ: editor ลบไม่ได้ · คนนอกกู้ไม่ได้ · **หลังลบแล้ว `stops` ของทริปนั้นยิงไม่ผ่าน**
    //    (ข้อสุดท้ายคือกิ่งที่ไม่มี probe ใบไหนแตะมาก่อน — มันวัด `app.can_read_trip` ซึ่งเป็น funnel ของทุก policy)
    expect(
      trip.length,
      "จำนวน route ยิงข้ามเปลี่ยนจาก 15 — route ใหม่ต้องมี probe ข้ามผู้ใช้ใน engineCrossUser.test.ts ก่อนขยับเลขนี้",
    ).toBe(15);
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
   *
   * 🔴 **ขอบเขตของด่านนี้ — อ่านตรง ๆ อย่าอ่านเกิน (P1 review `30f5214` · 27 ส.ค. 2026):**
   * ด่านถามว่าสองสัญลักษณ์ *ปรากฏที่ไหนสักแห่งในไฟล์* — **ไม่ใช่** *ถูกเรียกก่อนแตะฐาน* หรือ *ครบทุก handler ที่ export*
   *   ✅ จับ:   **"ลืม gate ทั้งไฟล์"** (ไม่มี getUser()/unauthenticatedResponse() เลยสักที่) — โหมดพังที่เกิดจริงตอนเพิ่ม route
   *   ❌ ไม่จับ: · **"gate ไม่ครบทุก handler"** — ไฟล์ที่ `GET` gate แต่ `POST` ไม่ gate → สัญลักษณ์ครบในไฟล์ → เขียว
   *            · **"gate ผิดลำดับ"** — เรียก getUser() ท้ายฟังก์ชัน หลังอ่าน/เขียนฐานไปแล้ว → เขียว
   * → เวอร์ชันถูกต้องต้องเดิน AST ต่อ handler · **จงใจไม่ทำวันนี้**: `bookings/route.ts` ใช้ helper `guard()` ร่วม
   *   (getUser โผล่ครั้งเดียวใน helper สำหรับ 4 handler) → AST per-handler จะ false-positive ทันที · ราคาไม่คุ้มช่องที่เหลือ
   * 🎯 **เขียวของด่านนี้ = "ไม่มี route ไหนลืม auth ทั้งไฟล์" ไม่ใช่ "auth ถูกพิสูจน์ครบทั้งพื้นผิว"**
   *   การยิงข้ามผู้ใช้จริงต่อ handler (ที่*บังคับ*ลำดับ+ความครบ) อยู่ที่ `engineCrossUser.test.ts` — คนละชั้น เสริมกัน
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

  /**
   * 🔴 **เชื่อมทะเบียนสองใบที่เคยชี้ใส่กันเฉย ๆ — เพิ่ม 5 ก.ย. 2026** (P4 เจอและวัด · P1 ขอให้ถามเป็น *คุณสมบัติ* ไม่ใช่ *รายการ*)
   *
   * ก่อนหน้านี้: ไฟล์นี้เขียนว่า *"ด่านชั้นนอกอยู่ที่ `PUBLIC_PATHS` ใน `proxy.ts` — เคสอยู่ใน `proxy.test.ts`"*
   * ส่วนเคส ⑤ ใน `proxy.test.ts` อ่านลิสต์แล้ว assert ว่า **ทุกเส้นในลิสต์ *ผ่านได้*** ทิศเดียว
   * 🎯 ***ไม่มีใบไหนถามว่า "แล้วมันควรอยู่ในลิสต์ไหม" — สองใบชี้ใส่กัน แล้วคำถามตกลงไปตรงกลาง***
   *
   * **ยิงจริงก่อนเขียนด่านนี้ (หมุด `8385ad9` · `worktree --detach`):**
   * ```
   * ใส่ "/api/engine/trips"        เข้า PUBLIC_SUBTREE_PATHS → แดง 3 เคส  ✅ (มีเคสเขียนมือรออยู่)
   * ใส่ "/api/engine/profile"      เข้า PUBLIC_SUBTREE_PATHS → 46 passed  🔴 เขียวสนิท
   * ใส่ "/api/engine/system-mode"  เข้า PUBLIC_SUBTREE_PATHS → 46 passed  🔴 เขียวสนิท
   * ```
   * 🔴 **`system-mode` คือใบที่ชี้ขาด** — `route.ts:10` เขียนไว้เองว่า *"ทุกเส้นอื่นเดิน `getUser()` (401) · ที่นี่ไม่มี"*
   *    ⇒ **`proxy` คือด่านชั้นเดียวของมัน** · ใส่เข้าลิสต์พลาด = **เปิดจริง ไม่ใช่แค่เสียชั้น**
   *
   * ## ทำไมเป็น `proxyPublic` ไม่ใช่รายการ "เส้นที่ห้ามอยู่ในลิสต์"
   * `§3.4` — *ด่านที่กันการหลบด้วย **รายการ** ออกลูกไม่จบ* · ธงนี้ถามเป็น **คุณสมบัติของ route**
   * ⇒ **ครอบ route ที่ยังไม่มีใครเขียน**: ของใหม่ทุกใบต้องเข้า `SURFACE` อยู่แล้ว (ด่านข้างบนบังคับ)
   *   และ **ค่าเริ่มต้นคือไม่มีธง** ⇒ เอาไปใส่ลิสต์สาธารณะเงียบ ๆ ไม่ได้
   * · 🔴 **ธงนี้ *ผิดได้*** — ติดธงให้ใบที่ไม่ได้อยู่ในลิสต์ ก็แดง (ทิศ ②) · `§3.4` บอกว่าทะเบียนที่ผิดไม่ได้ คือแหล่งความจริงใบที่สอง
   *
   * ## ⚠️ ขอบเขต — เขียนเพราะข้อจำกัดที่ไม่ได้เขียนจะถูกอ่านว่าไม่มี
   * ครอบเฉพาะเส้นใต้ **`/api/engine/`** · เส้นอื่นในลิสต์ (`/sw.js` · `/login` · `/invite` · `/api/keep-alive` ·
   * `/auth/callback` · `/manifest.webmanifest`) **ไม่ใช่ engine route ⇒ ไม่มีอะไรในไฟล์นี้ตรวจให้**
   * 🔴 จดเป็น **ความเสี่ยงที่รับไว้** (ทางที่สามของ `§3.4`) ไม่ใช่แกล้งว่ามีด่าน
   */
  const proxyLists = () => {
    const src = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
    // 🔴 จุลภาคปิดท้ายเป็นเรื่องของตัวจัดรูป ไม่ใช่ไวยากรณ์ — `,?` จึงจำเป็น (P1 ชี้ 5 ก.ย. 2026)
    const block = (name: string) =>
      [...(src.match(new RegExp(`const ${name}[\\s\\S]*?\\n\\];`))?.[0] ?? "")
        .matchAll(/^\s*"([^"]+)"\s*,?\s*$/gm)].map((m) => m[1]);
    /**
     * 🔴 **ค้นหาลิสต์เอง ไม่ระบุชื่อ — แก้ 5 ก.ย. 2026 หลังใบที่สามโผล่ภายในชั่วโมงเดียว**
     * ฉบับแรกของผมระบุชื่อสองใบ · P1 เพิ่ม `PUBLIC_ID_CHILD_PATHS` แล้ว **ต่อชื่อใบที่สามให้เอง
     * ในใบเดียวกับที่สร้างมัน** (`df53e18`) ⇒ รอบนั้นไม่มีอะไรหลุด
     * 🎯 ***แต่รูปนี้เงียบตามโครงสร้าง: ตอนลิสต์ถูก **เปลี่ยนชื่อ** regex หาไม่เจอ → ลิสต์ว่าง → ทิศบวกแดงเอง ·
     *    ตอนลิสต์ถูก **เพิ่มใบใหม่** ชื่อเดิมยัง match ครบทุกใบ ⇒ **ไม่มีอะไรแดงเลย** และด่านจะครอบไม่ครบเงียบ ๆ***
     * ⇒ ผมระบุชื่อลิสต์ไว้ในด่าน = ผมทำ *รายการ* ในด่านที่ตั้งใจเลิกใช้รายการ (`§3.4`)
     *   **ตัวถัดไปที่เพิ่มใบที่สี่ ไม่ต้องรู้จักไฟล์นี้เลย**
     */
    const names = [...src.matchAll(/^const (PUBLIC_[A-Z_]+_PATHS)\s*=/gm)].map((m) => m[1]);
    return { names, paths: names.flatMap(block) };
  };
  /** `app/api/engine/cities/route.ts` → `/api/engine/cities` */
  const urlOf = (rel: string) => "/" + rel.replace(/^app\//, "").replace(/\/route\.ts$/, "");

  it("control: อ่านลิสต์จาก proxy.ts ได้จริง และ *มีเส้น engine อยู่ในนั้น* — ไม่งั้นสองเคสล่างผ่านฟรี", () => {
    const { names, paths: listed } = proxyLists();
    // 🔴 ตัวค้นหาชื่อลิสต์ต้องยังทำงาน — มันพังแล้วทุกอย่างข้างล่างวนเซตว่างแล้วเขียวฟรี
    expect(
      names.length,
      `ค้นเจอลิสต์สาธารณะแค่ ${names.length} ใบ (${names.join(" · ")}) — proxy.ts มีอย่างน้อย 3 ใบ ` +
        "ถ้าตัวเลขนี้ลด แปลว่า regex ค้นชื่อพัง ไม่ใช่ว่าลิสต์หายไป",
    ).toBeGreaterThanOrEqual(3);
    expect(listed.length, "อ่าน `PUBLIC_*_PATHS` ไม่ได้ — regex กับ proxy.ts ยังตรงกันไหม").toBeGreaterThan(4);
    // 🔴 ทิศ ① วนเฉพาะเส้น engine — ถ้าไม่มีสักเส้น มันจะเขียวโดยไม่ตรวจอะไรเลย
    expect(
      listed.filter((p) => p.startsWith("/api/engine/")).length,
      "ไม่มีเส้น `/api/engine/` ในลิสต์เลย — ทิศ ① กำลังวนเซตว่าง",
    ).toBeGreaterThan(0);
    expect(
      Object.values(SURFACE).filter((m) => m.proxyPublic).length,
      "ไม่มี route ไหนติดธง proxyPublic — ทิศ ② กำลังวนเซตว่าง",
    ).toBeGreaterThan(0);
  });

  it("🔴 ① เส้น engine ที่อยู่ในลิสต์สาธารณะของ proxy ต้องติดธง `proxyPublic` — ใส่เข้าลิสต์เงียบ ๆ ไม่ได้", () => {
    const byUrl = new Map(Object.entries(SURFACE).map(([rel, meta]) => [urlOf(rel), { rel, meta }]));
    const unmarked: string[] = [];
    for (const path of proxyLists().paths) {
      if (!path.startsWith("/api/engine/")) continue;
      const hit = byUrl.get(path);
      if (!hit) continue; // ไม่ใช่ route.ts บนดิสก์ — ด่าน "ทุก route ต้องถูกจำแนก" ข้างบนดูแลอีกทิศ
      if (!hit.meta.proxyPublic) unmarked.push(hit.rel);
    }
    expect(
      unmarked,
      "route นี้อยู่ใน `PUBLIC_*_PATHS` ของ proxy.ts แต่ไม่ได้ติดธง `proxyPublic` ในทะเบียนนี้\n" +
        "  → ตั้งใจเปิดให้คนยังไม่ล็อกอิน: ใส่ `proxyPublic: true` **พร้อม `why`** แล้วเขียนเคสฝั่งลบใน proxy.test.ts\n" +
        "  → ไม่ได้ตั้งใจ: ถอดเส้นนั้นออกจากลิสต์ใน proxy.ts\n" +
        "  🔴 route ที่ไม่ `authExempt` จะ 401 อยู่ดี = *เสียชั้น* · route ที่ `authExempt` = **เปิดจริง**",
    ).toEqual([]);
  });

  it("🔴 ② route ที่ติดธง `proxyPublic` ต้องอยู่ในลิสต์จริง และต้อง `authExempt` — ธงต้องผิดได้", () => {
    const listed = new Set(proxyLists().paths);
    const orphan: string[] = [];
    const selfGuarded: string[] = [];
    for (const [rel, meta] of Object.entries(SURFACE)) {
      if (!meta.proxyPublic) continue;
      if (!listed.has(urlOf(rel))) orphan.push(rel);
      // 🔴 ติดธงสาธารณะให้ route ที่ gate ตัวเองอยู่ = ธงโกหก · มันจะ 401 ให้คนที่ยังไม่ล็อกอินอยู่ดี
      if (!meta.authExempt) selfGuarded.push(rel);
    }
    expect(orphan, "ติดธง `proxyPublic` แต่ไม่มีเส้นนี้ใน `PUBLIC_*_PATHS` — ธงกับ proxy ไม่ตรงกัน").toEqual([]);
    expect(selfGuarded, "ติดธง `proxyPublic` แต่ไม่ `authExempt` — route นี้ gate ตัวเอง ธงจึงบรรยายสิ่งที่ไม่จริง").toEqual([]);
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
