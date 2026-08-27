import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEST_COUNTRY_CODES,
  migrationFiles,
  stripComments,
  tablesFromMigrations,
  effectiveFunctions,
} from "./_helpers";
import { runIntegrityFailure } from "./_runIntegrity";

/**
 * ด่านเชิงโครงสร้างของสคีมา — **อ่านไฟล์ migration ที่รันจริง ไม่ต่อฐานข้อมูลเลย**
 * เจ้าของ: P4-QA/Sec
 *
 * ## ทำไมแยกออกมาจาก `rlsMatrix.test.ts` (25 ส.ค. 2026)
 * ไม่ได้แยกตาม**เจ้าของ** แต่แยกตาม **อัตราการเปลี่ยน**:
 *   · `rlsMatrix.test.ts` — เคสสดรายตาราง · **โตขึ้นเป็นก้อนใหญ่ทุกครั้งที่มี migration ใหม่**
 *   · ไฟล์นี้ — ด่านตรึง · **เปลี่ยนแค่ *ค่า* 1–2 บรรทัดตอน migration ลง**
 *
 * 🔴 **เหตุผลที่ต้องแยกจริง ๆ ไม่ใช่ความสวยงาม:** `git commit -- <path>` **stage ทั้งไฟล์**
 * สองเซสชันที่ต่อท้ายไฟล์เดียวกันพร้อมกัน จะกวาดงานกันเองเข้า commit โดยข้อความไม่พูดถึง
 * · เกิดจริง **3 ครั้งใน 2 ชั่วโมง** (25 ส.ค. 2026) · **ทุกครั้งคือไฟล์นี้ไฟล์เดียว**
 * · แยกแล้วการชนลดจาก "ต่อท้ายพร้อมกันเป็นก้อน" เหลือ "แก้ค่า pin บรรทัดเดียวเป็นครั้งคราว"
 *
 * ⚠️ **ค่า pin ทุกตัวในไฟล์นี้ ขึ้นได้หลังไล่กิ่งเสร็จเท่านั้น ไม่ใช่เพื่อให้ผ่าน**
 */

describe("ความครบของ matrix — ตรวจตัวรายการ ไม่ใช่ตัวระบบ", () => {
  /**
   * 🔴 **`D61` — บล็อกนี้เคยรับรองความครบ โดยตัวมันเองมีจุดบอดเดียวกับที่มันควรจับ**
   *
   * ฉบับเดิมมี persona 4 ตัว: `A_owner` · `B_other_trip` · `C_no_trip` · `D_anon`
   * **ทั้ง 4 ตัวคือ "เจ้าของ" หรือ "คนนอก" — ไม่มีตัวไหนเป็น *สมาชิกที่ไม่ใช่เจ้าของ* เลย**
   * ซึ่งเป็นสถานะที่ผู้ใช้จริงส่วนใหญ่ของแพลตฟอร์มจะอยู่ · **แขกไม่ใช่คนนอก**
   * → มันจึงประกาศว่า "ครอบ 48 ช่อง" ครบถ้วน **ในขณะที่กิ่งครึ่งหนึ่งของ policy ไม่มีใครเดินไปถึง**
   *
   * ⚠️ และเคสเดิม `expect(3 * 4 * 4).toBe(48)` **เป็นการคูณเลขให้ตัวเองดู** — จริงเสมอ
   * ไม่ว่าเมทริกซ์จะทดสอบอะไรหรือไม่ทดสอบอะไร · **เขียวที่แปลว่า "ไม่ได้ตรวจ" ในรูปที่บริสุทธิ์ที่สุด**
   */
  // 🔴 เพิ่ม `trip_days` 25 ส.ค. 2026 (`E2`) — **ตารางเนื้อหาตัวแรกของโปรเจกต์**
  //    ก่อนหน้านี้ทุกตารางเป็นตารางสิทธิ์/ตัวตน ซึ่งเขียนได้เฉพาะ `owner`
  //    → `editor` กับ `viewer` ไม่เคยมีที่ให้ต่างกัน (`P-46`) · ตารางนี้คือที่แรก
  // 🔴 เพิ่มตารางคลัง 25 ส.ค. — **ตารางชนิดที่สองของระบบ**: ข้อมูลสาธารณะที่ผู้ใช้เขียนไม่ได้
  //    ต่างจากตารางอื่นทั้งหมดใน `public` ซึ่งเป็นข้อมูลผู้เช่าที่ RLS ผูกกับ `trip_members`
  const TABLES = [
    "profiles", "trips", "trip_members", "trip_days", "trip_plans", "trip_day_plan_settings",
    "catalog_countries", "catalog_cities", "catalog_places", "catalog_place_names",
    "custom_places", "custom_place_names", "trip_stops", "bookings",
    "checklist_items", "place_notes", "hidden_places", "trip_hotels",
  ] as const;
  const VERBS = ["select", "insert", "update", "delete"] as const;
  const PERSONAS = [
    "A_owner",
    "B_other_trip",
    "C_no_trip",
    "D_anon",
    // 🔴 เพิ่ม 24 ส.ค. 2026 (D61) — สองตัวนี้คือช่องว่างที่ทำให้ 13 กิ่งไม่มีเคส
    "C_member_viewer",
    "C_member_editor",
  ] as const;

  it("🔴 ต้องมี persona ที่เป็นสมาชิกแต่ไม่ใช่เจ้าของ — ไม่งั้นเมทริกซ์รู้จักคิดแต่เรื่องคนนอก", () => {
    const insiders = PERSONAS.filter((p) => p.includes("member"));
    expect(
      insiders.length,
      "ไม่มี persona ที่อยู่ในทริปแต่ไม่ควรมีอำนาจ = กิ่ง 'สมาชิกที่ไม่ใช่ owner' ของทุก policy ว่าง",
    ).toBeGreaterThan(0);
  });

  it("แยก persona ที่ไม่ได้ล็อกอิน ออกจาก persona ที่ล็อกอินแต่ไม่มีทริป", () => {
    expect(PERSONAS).toContain("D_anon");
    expect(PERSONAS).toContain("C_no_trip");
  });

  /**
   * แผนที่ `ตาราง.ชื่อ` → เงื่อนไข **ตามสภาพหลัง migration ทุกไฟล์รันจบ**
   *
   * 🔴 **แก้ 25 ส.ค. 2026 — ฉบับเดิมมองไม่เห็น `drop policy`**
   * `D76` ถอด policy `DELETE` ของ `trip_stops`/`custom_places` ออกด้วย `drop policy` ในไฟล์ทีหลัง
   * **แต่ข้อความ `create policy … for delete` ยังอยู่ในไฟล์เก่า** → ด่านรายงานว่ายังมีอยู่
   * 🎯 **ด่านที่อ่าน *ไฟล์* แทน *สภาพจริง* — หมวดเดียวกับที่ P7 ชี้ตอนเสนอ `has_column_privilege`**
   * · ตอนนี้เดิน `create`/`drop` **ตามลำดับ** เหมือนที่ Postgres ทำ
   * · ⚠️ **ยังไม่ใช่สภาพของฐาน** — มันคือสภาพของ*ไฟล์เมื่อรันครบ* · ใครแก้ policy จากแดชบอร์ด ด่านนี้ไม่เห็น
   *   (ตัวที่ตอบเรื่องฐานคือ `client_writable_timestamps()` และเมทริกซ์สด)
   */
  function policyMapOrdered(): Map<string, string> {
    const src = migrationFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    const out = new Map<string, string>();
    const re = /(create|drop)\s+policy\s+(?:if\s+exists\s+)?(\S+)\s+on\s+public\.(\w+)([\s\S]*?);/g;
    for (const m of src.matchAll(re)) {
      const key = `${m[3]}.${m[2]}`;
      if (m[1] === "drop") out.delete(key);
      else out.set(key, stripComments(m[4]).replace(/\s+/g, " ").trim().toLowerCase());
    }
    return out;
  }

  /** verb ที่แต่ละตารางมี policy จริง — จากสภาพหลังไฟล์ทุกตัวรันจบ ไม่ใช่ทุกบรรทัดที่เคยเขียน */
  function policiedVerbs(table: string): string[] {
    const verbs: string[] = [];
    for (const [key, body] of policyMapOrdered()) {
      if (key.split(".")[0] !== table) continue;
      const v = body.match(/^\s*for (\w+)/)?.[1];
      if (v) verbs.push(v);
    }
    return verbs.sort();
  }

  it("🔴 ตารางที่ **จงใจไม่มี** policy DELETE ต้องไม่มีต่อไป — เพิ่มเมื่อไหร่ต้องเป็นการตัดสินใจ", () => {
    // `D18`: ไม่มี policy = เข้าไม่ถึงจาก client เลย ไม่ใช่แค่ซ่อนปุ่ม
    // `profiles` ลบผ่าน auth.users แล้ว cascade · `trips` รอ soft delete ที่ E2
    // 🔴 เคสนี้จะแดงถ้ามีคนเติม DELETE เข้ามา — ซึ่งคือสิ่งที่ควรเกิด ไม่ใช่สิ่งที่ต้องแก้ให้ผ่าน
    for (const t of TABLES) {
      const verbs = policiedVerbs(t);
      expect(verbs.length, `อ่าน policy ของ ${t} ไม่เจอเลย — regex หรือชื่อตารางเปลี่ยน`).toBeGreaterThan(0);
      expect(verbs.every((v) => (VERBS as readonly string[]).includes(v)), `${t} มี verb นอกลิสต์: ${verbs}`).toBe(true);
      // 🔴 ทะเบียนตารางที่ **ตั้งใจ** ให้ลบได้ · ที่เหลือมี DELETE เมื่อไหร่ต้องมาเถียงกันที่นี่ก่อน
      //    ฉบับเดิมเขียนเป็นข้อยกเว้นตัวเดียว (`trip_members`) ซึ่งอ่านไม่ออกว่าเป็นทะเบียน
      //    · `trip_members` — ถอดสมาชิก/ลาออกเอง · `trip_plans` — ผู้ใช้ลบแผนจริง (usePlans.ts:157)
      //    ⚠️ เติมชื่อลงที่นี่ = ประกาศว่า "ลบแล้วหายจริง ยอมรับได้" · ถ้าคำตอบคือ soft delete
      //       ทางที่ถูกคือ **ไม่เติม** แล้วไปทำ `deleted_at` (`E2-AC12`) แทน
      // `custom_places`/`custom_place_names` — ผู้ใช้ลบสถานที่ที่ตัวเองเพิ่มได้จริงวันนี้
      // 🔴 และลบสถานที่ที่ยังอยู่ในแผนไม่ได้ **เพราะ `trip_stops.custom_place_id` เป็น `restrict`**
      //    — กันด้วย FK ไม่ใช่ด้วยเคสที่แดงทีหลัง (บทเรียนจาก `D73`)
      // `trip_stops` — ผู้ใช้ลบจุดแวะจริงทุกวัน · `E2-AC12` (soft delete) ยังไม่ตัดสินทั้งตระกูล
      // 🔴 เมื่อ `E2-AC12` ตัดสินแล้วว่าเป็น soft delete ชื่อนี้ต้องออกจากลิสต์ **ไม่ใช่อยู่ต่อ**
      // 🔴 `trip_stops` และ `custom_places` **ออกจากลิสต์แล้ว 25 ส.ค. — `D76` ตัดสิน soft delete**
      //    ตรงกับที่เขียนไว้เองว่า *"เมื่อ `E2-AC12` ตัดสินแล้ว ชื่อต้องออกจากลิสต์ ไม่ใช่อยู่ต่อ"*
      //    `custom_place_names` ยังอยู่ — เป็นใบที่หายไปกับพ่อ ไม่ใช่ของที่ผู้ใช้ลบทีละแถว
      const MAY_DELETE = ["trip_members", "trip_plans", "custom_place_names", "hidden_places"];
      if (!MAY_DELETE.includes(t)) {
        expect(verbs, `${t} มี policy DELETE แล้ว — ตั้งใจหรือเปล่า`).not.toContain("delete");
      }
    }
  });

  /**
   * แผนที่ `ตาราง.ชื่อ` → เงื่อนไขที่ normalize แล้ว · **เอาการประกาศครั้งสุดท้าย**
   * เพราะนั่นคือสิ่งที่เหลืออยู่ในฐานหลัง migration ทุกตัวรันจบ
   */
  /** ชื่อเดิมที่เคสอื่นเรียกอยู่ — ตอนนี้ชี้ไปตัวที่รู้จัก `drop policy` แล้ว */
  const policyMap = policyMapOrdered;

  it("🔴 รายชื่อ policy ต้องไม่เปลี่ยน — เพิ่ม/ลบ/เปลี่ยนชื่อ ต้องมาไล่กิ่งก่อน", () => {
    // 🎯 `P-48` เดิมนับ **จำนวนคำสั่ง `create policy`** ซึ่งเป็นพร็อกซี ไม่ใช่ของจริง:
    //    P1 ประกาศ `trips_select` ซ้ำเพื่อให้ฐานตรงกับไฟล์ → **ไม่มี policy ใหม่สักตัว**
    //    แต่ด่านนับได้ 11 แล้วแดง · **ด่านที่แดงใส่การเปลี่ยนแปลงที่ไม่ได้เปลี่ยนสิ่งที่มันวัด
    //    จะถูกทำให้เงียบด้วยการขึ้นเลข และครั้งถัดไปมันจะไม่กัดอะไรเลย**
    expect([...policyMap().keys()].sort()).toEqual([
      // 🔴 คลัง: `select` ตัวเดียวต่อตาราง · **ไม่มีฝั่งเขียนเลยโดยตั้งใจ** (`D18`)
      //    เติม policy ฝั่งเขียนให้คลังเมื่อไหร่ = ผู้ใช้แก้คลังกลางได้ ต้องเป็นการตัดสินใจ
      // 🔴 `bookings` ไม่มี policy DELETE — `D76` soft delete · ลบผ่าน RPC
      "bookings.bookings_insert",
      "bookings.bookings_select",
      "bookings.bookings_update",
      "catalog_cities.catalog_cities_select",
      "catalog_countries.catalog_countries_select",
      // 🔴 เพิ่ม 25 ส.ค. (P1 · `P-60`) — คลังลูกจาก `data/emergency.ts` · `data/airportAccess.ts`
      //    ไล่กิ่งแล้ว: อ่านได้ทุกคนที่ล็อกอิน · **ไม่มี policy ฝั่งเขียนสักตัว** · anon ไม่มีทางเข้า
      //    เคสอยู่ที่ `rlsMatrix.test.ts` บล็อก "คลังลูก" — ด้านบวก + ด้านลบ 3 verb
      //    ⚠️ **ต้องถูกเติมเข้ารายชื่อของ `E2-AC2` ด้วย ไม่ใช่ผ่านเพราะขึ้นต้นด้วย `catalog_`** (`D48`)
      "catalog_country_contacts.catalog_country_contacts_select",
      "catalog_place_access.catalog_place_access_select",
      // 🔴 เพิ่ม 26 ส.ค. (P1 · `Q6`) — คำบรรยายแยกภาษา · ผู้ใช้ตัดสิน "แยกตั้งแต่แรก"
      //    คลัง**กลาง** = `select` อย่างเดียวเหมือนคลังกลางตัวอื่นทุกใบ · ไม่มี policy ฝั่งเขียนโดยตั้งใจ
      "catalog_place_descriptions.catalog_place_descriptions_select",
      "catalog_place_names.catalog_place_names_select",
      "catalog_places.catalog_places_select",
      // 🔴 คลัง**ของผู้เช่า** — ครบ 4 verb ต่างจากคลังกลางที่มีแต่ `select` (`D75`)
      "checklist_items.checklist_items_insert",
      "checklist_items.checklist_items_select",
      "checklist_items.checklist_items_update",
      // 🔴 เพิ่ม 26 ส.ค. (P1 · `Q6`) — คลัง**ของผู้เช่า** ครบ 4 verb ผูก `app.can_*_trip`
      //    รูปเดียวกับ `custom_place_names` เป๊ะ · เคสอยู่ที่ `rlsMatrix.test.ts` (P4 · `34abfbf`)
      "custom_place_descriptions.custom_place_descriptions_delete",
      "custom_place_descriptions.custom_place_descriptions_insert",
      "custom_place_descriptions.custom_place_descriptions_select",
      "custom_place_descriptions.custom_place_descriptions_update",
      "custom_place_names.custom_place_names_delete",
      "custom_place_names.custom_place_names_insert",
      "custom_place_names.custom_place_names_select",
      "custom_place_names.custom_place_names_update",
      "custom_places.custom_places_insert",
      "custom_places.custom_places_select",
      "custom_places.custom_places_update",
      // 🔴 `hidden_places` มี DELETE โดยตั้งใจ — *"เลิกซ่อน"* คือการลบแถวตามนิยาม (`D76`)
      "hidden_places.hidden_places_delete",
      "hidden_places.hidden_places_insert",
      "hidden_places.hidden_places_select",
      "place_notes.place_notes_insert",
      "place_notes.place_notes_select",
      "place_notes.place_notes_update",
      "profiles.profiles_insert",
      "profiles.profiles_select",
      "profiles.profiles_update",
      // 🔴 3 ตัวนี้เพิ่ม 25 ส.ค. 2026 พร้อม `trip_days` — ไล่กิ่งแล้วทั้งสามก่อนแก้ค่านี้
      //    (`_select` → viewer อ่านได้ · `_insert`/`_update` → viewer เขียนไม่ได้ · `with check` → ย้ายวันข้ามทริปไม่ได้)
      "trip_day_plan_settings.tdps_insert",
      "trip_day_plan_settings.tdps_select",
      "trip_day_plan_settings.tdps_update",
      "trip_days.trip_days_insert",
      "trip_days.trip_days_select",
      "trip_days.trip_days_update",
      "trip_hotels.trip_hotels_insert",
      "trip_hotels.trip_hotels_select",
      "trip_hotels.trip_hotels_update",
      "trip_members.trip_members_delete",
      "trip_members.trip_members_insert",
      "trip_members.trip_members_select",
      "trip_members.trip_members_update",
      // 🔴 `trip_plans_delete` เป็น policy DELETE ตัวแรกของ `E2` — เป็นการตัดสินใจ ไม่ใช่การคัดลอก
      //    (ผู้ใช้ลบแผนจริงวันนี้ · ลบแผนสุดท้ายถูกกันด้วย constraint trigger ไม่ใช่ด้วย policy)
      "trip_plans.trip_plans_delete",
      "trip_plans.trip_plans_insert",
      "trip_plans.trip_plans_select",
      "trip_plans.trip_plans_update",
      "trip_stops.trip_stops_insert",
      "trip_stops.trip_stops_select",
      "trip_stops.trip_stops_update",
      "trips.trips_insert",
      "trips.trips_select",
      "trips.trips_update",
    ]);
  });

  /** verb ของ policy · อ่านจากตัว body ที่ `policyMap()` normalize มาแล้ว */
  function verbOf(body: string): string | null {
    return body.match(/^\s*for (\w+)/)?.[1] ?? null;
  }

  /**
   * 🔴 `P-46` ในรูปที่**เครื่องตรวจได้** ไม่ใช่รูปที่ต้องมีคนจำได้
   *
   * `D61` วัดไว้ว่า `editor` กับ `viewer` มีสิทธิ์เท่ากันเป๊ะใน `E1` — **ซึ่งถูกต้องสำหรับ `E1`**
   * เพราะไม่มีตารางเนื้อหาสักตัว ทุก policy ฝั่งเขียนจึงเป็น `owner` ล้วน
   * มันกลายเป็นบั๊กในวินาทีที่ตารางเนื้อหาตัวแรกเกิด และวิธีที่มันจะเกิดคือ **การคัดลอกบรรทัดที่ถูก**:
   *
   * > คนเขียนตารางถัดไปคัดลอก `using (app.can_read_trip(trip_id))` จาก policy `_select` ที่อยู่เหนือมัน
   * > ไปวางใน `_insert`/`_update` **ซึ่งอ่านแล้วดูถูกต้องทุกตัวอักษร**
   * > → `viewer` แก้แผนได้ทั้งทริป · และ**ไม่มีเคสไหนแดง** เพราะเคสทั้งหมดถามว่า *คนนอก* ทำอะไรไม่ได้
   *
   * 🎯 ด่านนี้ไม่ต้องรู้จักตารางใหม่ล่วงหน้า — มันอ่านจากไฟล์ที่รันจริง จึงครอบของที่ยังไม่ถูกเขียน
   */
  it("🔴 policy ฝั่ง 'เขียน' ต้องไม่ตัดสินด้วย can_read_trip — ไม่งั้น viewer แก้ได้ทั้งทริป", () => {
    const offenders: string[] = [];
    for (const [key, body] of policyMap()) {
      const verb = verbOf(body);
      if (!verb || verb === "select") continue;
      if (body.includes("can_read_trip")) offenders.push(`${key} (for ${verb})`);
    }
    expect(
      offenders,
      "policy ฝั่งเขียนที่กรองด้วยสิทธิ์ **อ่าน** — สมาชิกอ่านอย่างเดียวจะเขียนได้ทันที\n" +
        "  ทางแก้คือเปลี่ยนเป็น app.can_write_trip() **ไม่ใช่เพิ่มชื่อลงข้อยกเว้นของด่านนี้**",
    ).toEqual([]);
  });

  /**
   * ทะเบียนตารางเนื้อหา — **ประตูที่บังคับให้ตารางใหม่ต้องมาไล่กิ่งก่อน**
   *
   * ตารางไหนมี policy ฝั่งเขียนที่อ้าง `can_write_trip` = ตารางที่ `editor`/`viewer` ต่างกันจริง
   * → ต้องมีเคสสด **2 ทิศ** ของมันในไฟล์นี้: `editor` เขียนได้ · `viewer` เขียนไม่ได้
   * ⚠️ **ด่านนี้พิสูจน์ไม่ได้ว่าเคสถูกเขียนจริง** มันบังคับแค่ให้ *มีคนตัดสินใจ* ตอนเพิ่มตาราง
   *    (ถ้าแดง: ไปเพิ่มเคส 2 ทิศก่อน **แล้วค่อย**เติมชื่อลงลิสต์นี้ — ไม่ใช่เติมชื่อให้เขียวแล้วจบ)
   */
  /**
   * 🔴 **ทะเบียนรหัสประเทศของชุดทดสอบ — ค่าซ้ำต้องแดง *ก่อน* ที่มันจะกลายเป็น "ข้าม"**
   *
   * P4 กับ P1 เลือก `"zz"` ตรงกันโดยไม่รู้ → `beforeAll` ของบล็อกหลังล้มด้วยคีย์ซ้ำ
   * → **12 เคสถูกข้าม และผลรวมพิมพ์ว่า `349 passed | 12 skipped` ซึ่งอ่านเหมือนรันสบาย ๆ**
   * 🎯 บทเรียนคือ **"ข้าม" อ่านเป็นเขียวเสมอ** ไม่ใช่ "ระวังชนกัน"
   */
  it("🔴 รหัสประเทศของแต่ละบล็อกต้องไม่ซ้ำกัน — namespace มีแค่ 676 ค่าและทุกบล็อกแชร์มัน", () => {
    const codes = Object.values(TEST_COUNTRY_CODES);
    expect(
      new Set(codes).size,
      `มีรหัสซ้ำใน TEST_COUNTRY_CODES: ${codes.join(", ")}\n` +
        "  🔴 ถ้าปล่อยไว้ บล็อกหลังจะล้มที่ beforeAll แล้วเคสของมันจะถูก **ข้าม** ไม่ใช่ **แดง**",
    ).toBe(codes.length);
    for (const c of codes) {
      expect(c, `รหัส ${c} ไม่ใช่ [a-z]{2} — catalog_countries.id จะปฏิเสธ`).toMatch(/^[a-z]{2}$/);
    }
  });

  it("🔴 ตารางเนื้อหาต้องขึ้นทะเบียน — ตารางใหม่ที่ยังไม่มีเคส 2 ทิศ ต้องไม่ผ่านเงียบ ๆ", () => {
    const content = new Set<string>();
    for (const [key, body] of policyMap()) {
      if (body.includes("can_write_trip")) content.add(key.split(".")[0]);
    }
    expect([...content].sort()).toEqual([
      "bookings", "checklist_items",
      // 🔴 `Q6` 26 ส.ค. — คำบรรยายของคลัง*ทริป* เป็นข้อมูลผู้เช่า จึงอยู่ในทะเบียนนี้
      //    ส่วน `catalog_place_descriptions` **ไม่อยู่** เพราะเป็นคลังสาธารณะ เหมือน `catalog_places`
      "custom_place_descriptions", "custom_place_names", "custom_places",
      "hidden_places", "place_notes",
      "trip_day_plan_settings", "trip_days", "trip_hotels", "trip_plans", "trip_stops",
    ]);
  });

  /**
   * ทะเบียน `security definer` — **รั้ว column grant ไม่ครอบข้างในฟังก์ชันพวกนี้โดยนิยาม**
   *
   * `…freeze_row_times` ปิดไม่ให้ไคลเอนต์ตั้ง `created_at`/`updated_at`/`updated_by_user` เอง
   * ด้วย **column grant** (P4 ยิงจริง 6 ทางเข้ารวม `upsert` ทั้งสองแบบ — ถูกปฏิเสธหมด)
   *
   * 🔴 **แต่ `security definer` รันด้วยสิทธิ์ของ *เจ้าของฟังก์ชัน* ซึ่งถือ grant ระดับตารางเต็ม**
   * → รั้วคอลัมน์ไม่มีผลข้างในนั้นเลยสักนิด · ฟังก์ชันที่รับ payload ตรง ๆ แล้วส่งต่อ
   *   จะเขียนคอลัมน์ที่รั้วห้ามไว้ได้ทันที **โดยไม่มีด่านไหนส่งเสียง**
   *
   * 🎯 วันนี้ยังไม่รั่ว **เพราะลายเซ็นของฟังก์ชันที่มีอยู่มันแคบ ไม่ใช่เพราะรั้วกัน** —
   *   รูปเดียวกับ `E1-AC8` (ปลอดภัยเพราะ provider ที่เปิดอยู่ ไม่ใช่เพราะกติกา)
   *
   * ⚠️ **`E3` คือการเพิ่ม RPC เป็นชุด** — ถ้าไม่มีด่านนี้ มันคือการรื้อรั้วทีละท่อนโดยไม่มีใครนับ
   */
  it("🔴 รายชื่อ security definer ต้องไม่เปลี่ยน — RPC ใหม่ต้องถูกตรวจก่อนขึ้นทะเบียน", () => {
    const src = migrationFiles.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
    const found = new Set<string>();
    const re =
      /create\s+(?:or\s+replace\s+)?function\s+((?:app|public)\.\w+)\s*\([\s\S]*?\)\s*returns([\s\S]*?)(?:\$\$|\bas\b)/gi;
    for (const m of src.matchAll(re)) {
      if (m[2].toLowerCase().includes("security definer")) found.add(m[1]);
    }
    expect(found.size, "อ่านฟังก์ชันไม่เจอเลย — regex หรือรูปแบบไฟล์เปลี่ยน").toBeGreaterThan(5);
    expect(
      [...found].sort(),
      "มี security definer ตัวใหม่ หรือหายไป\n" +
        "  🔴 ถามก่อนขึ้นทะเบียน: **ฟังก์ชันตัวใหม่รับคอลัมน์ที่ column grant ห้ามไว้หรือเปล่า**\n" +
        "     (`created_at` · `updated_at` · `updated_by_user` · หรือ `id` ของตารางไหนก็ตาม)\n" +
        "  ข้างในฟังก์ชัน definer **รั้วคอลัมน์ไม่มีผล** — ต้องกันที่ลายเซ็น ไม่ใช่หวังให้ grant กัน",
    ).toEqual([
      // 🔴 เพิ่ม 2 ตัว 25 ส.ค. (P1) — **trigger ที่ยืนยันค่าคงที่ของฐาน ไม่ใช่สิทธิ์ของผู้ใช้**
      //    คำตอบของคำถามข้างบน: **ทั้งคู่ไม่รับพารามิเตอร์เลย** (เป็น trigger function)
      //    และไม่คืนข้อมูลออกไปสักไบต์ — คืน `null`/`old` แล้ว `raise` เท่านั้น
      //    เหตุผลที่ต้องเป็น definer: invoker แปลว่า **ค่าคงที่ถูกบังคับกับบางคน และเงียบกับบางคน**
      //    · และคนที่มันเงียบด้วยคือคนที่มีสิทธิ์มากที่สุด ซึ่งกลับด้านกับสิ่งที่ควรเป็น
      "app.assert_day_has_no_stops",
      // 🔴 เพิ่ม 25 ส.ค. — FK `restrict` กันการลบ**จริง**ได้ แต่ **ไม่รู้จัก `deleted_at`**
      //    ถ้าไม่มีตัวนี้ soft delete จะพาสถานที่หายไปจากใต้จุดแวะที่ยังชี้อยู่
      "app.assert_place_not_in_use",
      "app.assert_trip_has_owner",
      "app.assert_trip_has_plan",
      "app.bootstrap_trip_owner",
      "app.can_read_trip",
      "app.can_write_trip",
      // 🔴 เพิ่ม 26 ส.ค. (P1) — `E3-AC7` โหมด read-only · **สองตัวนี้คือด่านเอง ไม่ใช่ของที่ผ่านด่าน**
      //    `deny_write_when_read_only` = trigger บนทุกตารางใน `public`
      //    `write_is_blocked`          = ตัวตัดสิน แยกออกมาเพื่อให้เทสต์เรียกตรงได้
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์เลยทั้งคู่ · ไม่มี DML · อ่าน `app.system_mode` + GUC**
      //    · `revoke execute … from public, anon, authenticated` ทั้งคู่ — ไม่มีใครเรียกได้นอกจาก trigger
      //    เหตุผลที่ต้องเป็น definer: อ่าน `app.system_mode` ซึ่ง `authenticated` แตะไม่ได้เลย
      //    🎯 **และเป็นเหตุผลที่ trigger ต้องอยู่ระดับนี้:** `revoke` หยุด `security definer` ไม่ได้
      //       → 7 RPC (`create_trip` + `soft_delete_*`) จะเขียนทะลุ read-only ถ้าใช้ `revoke` อย่างเดียว
      "app.deny_write_when_read_only",
      "app.handle_new_user",
      // 🔴 เพิ่ม 25 ส.ค. (P1) — `P-55`/`D78`/`Q4`: เขียน `display_name` ลง `legacy_<x>_by`
      //    ก่อน FK จะ `set null` ตอนลบ `profiles` · **`before delete` ไม่ใช่ `after`**
      //    คำตอบของคำถามข้างบน: **เป็น trigger function ไม่รับพารามิเตอร์เลย**
      //    · เขียนเฉพาะคอลัมน์ `legacy_*` และ **เฉพาะแถวที่ค่ายังเป็น `null`** — ไม่ทับของ `E7`
      //    · ไม่แตะ `created_at`/`updated_at`/`updated_by_user`/`id` ของตารางไหนทั้งสิ้น
      //    เหตุผลที่ต้องเป็น definer: **คนที่ลบบัญชีไม่มีสิทธิ์เขียนตารางของทริปที่เขาไม่ได้อยู่**
      //    invoker แปลว่าประวัติจะรอดเฉพาะทริปที่เขายังเป็นสมาชิก = รอดบางแถว เงียบ ๆ
      // 🔴 เพิ่ม 26 ส.ค. (P1) — **แหล่งความจริงเดียวว่า "ตอนนี้โหมดมีผลอยู่ไหม"**
      //    ทั้งตัวบังคับ (`write_is_blocked`) และตัวที่ผู้ใช้อ่าน (`system_mode`) ใช้ตัวนี้ตัวเดียว
      //    ไม่งั้นจะมีวินาทีที่ banner บอกว่าปิดรับ แต่เขียนได้จริง — สองแหล่งความจริงที่ต้องคอยให้ตรงกัน
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · ไม่มี DML · อ่าน `app.system_mode` อย่างเดียว**
      "app.mode_is_active",
      "app.preserve_authorship",
      // 🔴 เพิ่ม 26 ส.ค. (P1) — **ฟังก์ชันที่ถูกสร้างและถูก `drop` ในไฟล์เดียวกัน**
      //    (`20260826182000` · สร้าง → เรียก 4 เส้นทาง → `drop` ก่อน `commit`)
      //    ⚠️ **ไม่มีอยู่ในฐานตอนนี้** — ด่านนี้อ่าน *ไฟล์ migration* ไม่ใช่ฐาน จึงยังเห็นมัน
      //    🎯 และผมคิดว่านั่น**ถูก**: definer ที่ทำ DML ต้องถูกอ่านโดยคน แม้จะมีชีวิตแค่ในทรานแซกชันเดียว
      //    คำตอบของคำถามข้างบน: รับ `p_id uuid` ตัวเดียว · `update … set note = note` (no-op ที่ยิง trigger)
      //    · ไม่แตะคอลัมน์ที่ column grant ห้าม · ไม่เคยถูก `grant execute` ให้ใครเลย
      "app.probe_definer_write",
      // 🔴 เพิ่ม 27 ส.ค. — promote plan on delete (trigger fn · after delete) · ไม่รับ input · รันใน trigger เท่านั้น (P1 ประกาศ)
      "app.promote_plan_if_none_active",
      "app.shares_trip_with",
      "app.trip_owner_count",
      "app.trip_role",
      "app.write_is_blocked",
      // 🔴 เพิ่ม 25 ส.ค. (P1) — รายการคู่คอลัมน์ที่ `app.preserve_authorship` เดินตาม
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · อ่าน `pg_catalog` อย่างเดียว · ไม่แตะข้อมูลผู้ใช้**
      //    แยกจาก trigger โดยตั้งใจ เพื่อให้เทสต์เห็นขอบเขตจริงว่ามันครอบตารางไหนบ้าง
      // 🔴 เพิ่ม 25 ส.ค. (P1) — ให้ชุดสด **ปฏิเสธที่จะตอบ** เมื่อฐานกับโค้ดไม่ตรงกัน
      //    (P6 ไล่ CI แดงของ `9fceac6` แล้วพบว่าไม่มีบั๊กใน commit นั้นเลย — ฐานถูก migrate ล้ำหน้าไปแล้ว)
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · อ่าน `supabase_migrations.schema_migrations` อย่างเดียว**
      //    · ไม่แตะข้อมูลผู้ใช้ · ไม่มี DML · `grant execute` ให้ `service_role` เท่านั้น
      //    เหตุผลที่ต้องเป็น definer: สคีมา `supabase_migrations` ไม่เปิดให้ role ทดสอบ
      //    🎯 ทิศที่อันตรายคือ **เขียวหลอก**: commit ที่ migration ยังไม่ถูก apply จะเขียว
      //       ถ้าฐานบังเอิญมีสภาพที่มันคาดหวังอยู่แล้วจากงานคนอื่น
      // 🔴 เพิ่ม 27 ส.ค. — fixture-lock RPC + assert_engine_dev (E0) · definer · service_role เท่านั้น · P1 ประกาศครบ
      //    acquire/release เขียนเฉพาะ app.fixture_lock · holder/assert อ่านอย่างเดียว · ไม่รับ input จากผู้ใช้แอป
      "public.acquire_fixture_lock",
      "public.applied_migrations",
      "public.assert_engine_dev",
      "public.authorship_columns",
      "public.client_writable_timestamps",
      "public.create_trip",
      "public.fixture_lock_holder",
      // 🔴 เพิ่ม 26 ส.ค. (P1) — **ตัวอ่านผลการวัด ไม่ใช่ฟีเจอร์ · ของชั่วคราวโดยประกาศ**
      //    `app.role_probe` เก็บคำตอบของคำถามที่ P6 ตั้งและยืนยันเองไม่ได้ (เครื่องไม่มี `psql`):
      //    *trigger ที่ถูกยิงจากข้างใน `security definer` เห็น `current_user` เป็นใคร*
      //    **วัดแล้ว: `postgres` (เจ้าของฟังก์ชัน) ไม่ใช่ `authenticated` (ผู้เรียก)**
      //    → ดีไซน์ "ยกเว้นตาม role" ของ `E3-AC7` จะยกเว้น *ทั้ง 7 RPC ที่ trigger เกิดมาเพื่อปิด*
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · อ่าน `app.role_probe` อย่างเดียว**
      //    · ไม่แตะข้อมูลผู้ใช้ · ไม่มี DML · `grant execute` ให้ `service_role` เท่านั้น
      //    เหตุผลที่ต้องเป็น definer: สคีมา `app` ไม่ถูก expose ผ่าน PostgREST โดยตั้งใจ
      //    🔴 **ลบพร้อม `app.role_probe` ตอน `E3-AC7` ลง** — เก็บตอนนี้เพราะหลักฐานต้องอ่านซ้ำได้
      //       โดยคนอื่น ไม่ใช่เป็นคำบอกเล่าของคนที่ออกแบบสิ่งที่มันสนับสนุน
      // 🔴 เพิ่ม 26 ส.ค. (P1) — **เคสถาวรที่พิสูจน์ตรรกะของด่านโดยไม่ commit อะไรเลย**
      //    เคสสดที่เปิดโหมดจริงลงถาวรไม่ได้ (ฐานใช้ร่วม 8 เซสชัน · `R11` · P4+P6 ไล่จนสุด)
      //    ตัวนี้ตั้ง flag → ลองเขียน → เก็บผลไว้ใน**ตัวแปร** → `raise` เพื่อ unwind → จับเอง
      //    · ข้อมูลถูก rollback หมด · **ตัวแปรไม่ใช่ข้อมูล จึงรอด** · uncommitted = เซสชันอื่นไม่เห็นเลย
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · DML มีแต่ถูก rollback ทั้งหมดในตัวเอง**
      //    · แตะเฉพาะ `app.system_mode` **ไม่แตะตารางของผู้ใช้เลยสักใบ** · `service_role` เท่านั้น
      //    ⚠️ **พิสูจน์ *ตรรกะ* ไม่ได้พิสูจน์ *ทางจริง*** — ทาง PostgREST ยังเป็น one-shot
      // 🔴 เพิ่ม 27 ส.ค. (P1) — ตัวเลขที่ด่านฝั่งเทสต์ของ P4 ต้องอ่านได้ (P6 ชี้ปัญหา)
      //    `maintenance_expiry_minutes` เป็น **`null` โดยการออกแบบ** — maintenance hold ไม่หมดอายุ
      //    → เทสต์ควร **pin ว่ามันเป็น `null`** เพื่อให้วันที่มีคนเปลี่ยน มีคนต้องตอบว่า
      //      สัมพันธ์กับ `E7`-pin ยังไง · **รูปเดียวกับด่าน publication: pin สภาพที่คำถามยังไม่เปิด**
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · ไม่มี DML · `service_role` เท่านั้น**
      "public.mode_limits",
      "public.read_only_selftest",
      "public.release_fixture_lock",
      "public.role_probe_result",
      // 🔴 `P-53` — soft delete ต้องผ่าน RPC เพราะ PostgREST ห่อ `UPDATE` ด้วย `RETURNING` เสมอ
      //    → แถวที่เพิ่งทำให้ตัวเองหายไป ไม่ผ่าน policy `SELECT` ของตัวเอง · **`P-26` กลับด้าน**
      //    คำตอบของคำถามข้างบน: รับ `p_id uuid` ตัวเดียว · ตั้ง `deleted_at` เท่านั้น
      //    · ถาม `app.can_write_trip()` ของคนเรียกเองก่อนทำอะไรทั้งสิ้น
      "public.set_system_mode",
      "public.soft_delete_booking",
      "public.soft_delete_checklist_item",
      "public.soft_delete_custom_place",
      "public.soft_delete_place_note",
      "public.soft_delete_trip_hotel",
      "public.soft_delete_trip_stop",
      // 🔴 เพิ่ม 26 ส.ค. (P1) — **ทางเปิด/ปิดโหมด · `service_role` เท่านั้น**
      //    มีเพราะถ้าเปิดโหมดไม่ได้จากที่ไหนเลย **เราพิสูจน์ไม่ได้ว่ามันบล็อกอะไรจริง** (P4 ยิงแล้วติดตรงนี้)
      //    และ P6 รันจาก CI ที่ไม่มี `psql`
      //    คำตอบของคำถามข้างบน: รับ 3 พารามิเตอร์ · **ไม่แตะตารางของผู้ใช้เลยสักใบ** เขียนแค่ `app.system_mode`
      //    ⚠️ **มันคือพื้นผิวโจมตีใหม่และรู้ตัว** — สามชั้น: `grant` ให้ `service_role` เท่านั้น ·
      //       **ปฏิเสธถ้า `auth.uid()` ไม่ null แม้ผู้เรียกมีสิทธิ์** (กัน `grant` รั่ว) · ไม่คืนอะไรที่ไม่ควรรู้
      // ── (ตัวล่างคือทางอ่านธง) ──
      // 🔴 เพิ่ม 26 ส.ค. (P1) — ทางอ่านธงโหมด read-only (`P-50`: *ธงที่อ่านไม่ได้ ไม่ใช่ธง*)
      //    คำตอบของคำถามข้างบน: **ไม่รับพารามิเตอร์ · ไม่มี DML · คืนแค่ `read_only` + `reason`**
      //    · **ไม่คืน `allow_maintenance_write`** เพราะไม่ใช่เรื่องของผู้ใช้ และเป็นครึ่งหนึ่งของด่าน
      //    · `grant execute` ให้ `anon` ด้วย — คนที่ยังไม่ล็อกอินต้องเห็น banner ก่อนเริ่มพิมพ์ (P7 ③)
      "public.system_mode",
      // 🔴 เพิ่ม 25 ส.ค. (P1) — **ตัวตรวจสภาพปลายทาง จากประตูบานที่ 3/4 ที่ P7 ชี้**
      //    (view ที่ไม่ได้ตั้ง `security_invoker` · สมาชิกภาพใน publication ที่ dashboard เปิดได้โดยไม่ผ่านไฟล์)
      //    คำตอบของคำถามข้างบน: **ไม่รับคอลัมน์ของตารางไหนเลย** — พารามิเตอร์เดียวคือ `text[]` ของ*ชื่อตาราง*
      //    · อ่านเฉพาะ `pg_catalog` · **ไม่แตะข้อมูลผู้ใช้สักไบต์** และไม่มี `insert`/`update`/`delete` ในตัวมัน
      //    · `grant execute` ให้ **`service_role` เท่านั้น** — `authenticated` เรียกไม่ได้เลย
      //    เหตุผลที่ต้องเป็น definer: มันต้องอ่าน `pg_policy`/`pg_publication_tables` ซึ่ง role ทดสอบไม่มีสิทธิ์ครบ
      //    🎯 และตัวมันเองไม่ใช่ประตู: **คืนเมตาดาต้าว่าประตูบานไหนเปิด ไม่ได้เปิดบานไหนให้**
      "public.table_exposure",
      "public.unsafe_state_clear",
      "public.unsafe_state_reason",
      "public.unsafe_state_set",
    ]);
  });

  it("🔴 เงื่อนไขของ policy ต้องไม่เปลี่ยน — ชื่อเดิมแต่กว้างขึ้น คือเคสที่รายชื่ออย่างเดียวมองไม่เห็น", () => {
    // 🔴 `P-35` (P1 พบ): `using (app.can_read_trip(id) or created_by = auth.uid())`
    //    **ชื่อเดิม · จำนวนเดิม · รายชื่อเดิม · แต่ `created_by` กลายเป็นแหล่งสิทธิ์ที่สอง**
    //    → ด่านที่นับชื่อจับไม่ได้เลย · ต้องตรึง**เนื้อ**ไม่ใช่แค่**ป้าย**
    //    ⚠️ แดงข้อนี้ = ไปไล่กิ่งของ policy ที่เปลี่ยน **แล้วค่อยอัปเดตค่านี้** ไม่ใช่อัปเดตให้ผ่าน
    const fingerprint = createHash("sha256")
      .update([...policyMap().entries()].sort().map(([k, v]) => `${k}=${v}`).join("\n"))
      .digest("hex")
      .slice(0, 16);
    // 🔴 อัปเดตรอบ 11 (`329ba089…` → `871a35aa…`) — `trip_hotels` 3 policy (`D51` + `D76`)
    // 🔴 อัปเดตรอบ 10 (`35d64de3…` → `329ba089…`) — `checklist_items` · `place_notes` · `hidden_places`
    //    `hidden_places` มี DELETE โดยตั้งใจ · อีกสองตัวไม่มี (`D76`)
    // 🔴 อัปเดตรอบ 9 (`2a759c27…` → `35d64de3…`) — `bookings` 3 policy (ไม่มี DELETE · `D76`)
    // 🔴 อัปเดตรอบ 8 (`01adb82c…` → `2a759c27…`) — **ค่าไม่ได้เปลี่ยนเพราะ policy เปลี่ยน**
    //    แต่เพราะตัวสแกนเพิ่งรู้จัก `drop policy` → policy ที่ถูกถอดออกไม่ถูกนับอีกต่อไป
    //    🎯 ค่าเดิมคือ fingerprint ของ**ไฟล์ทุกบรรทัดที่เคยเขียน** · ค่าใหม่คือของ**สภาพหลังรันจบ**
    // 🔴 อัปเดตรอบ 7 (`d223b58a…` → `01adb82c…`) — `D76` soft delete
    //    `trip_stops_select`/`custom_places_select` เติม `and deleted_at is null`
    //    · policy `DELETE` ของทั้งสองตาราง **ถูกถอดออก** (ลบผ่าน RPC เท่านั้น · `P-53`)
    // 🔴 อัปเดตรอบ 6 (`be2d37ba…` → `d223b58a…`) — `trip_stops` 4 policy
    //    กิ่งที่ไล่แล้ว: editor เขียนได้ · viewer ถูกปฏิเสธ · `D70` ชี้สถานที่ข้ามทริปไม่ได้
    //    · `D53` check ผูกกับ `kind` (0 · 1 · ห้าม 2) · `trip_id` เขียนไม่ได้ · `D73` trigger ยิงจริง
    // 🔴 อัปเดตรอบ 5 (`9dfaba9e…` → `be2d37ba…`) — `custom_places` + `custom_place_names` 8 policy
    //    ครบ 4 verb ทั้งสองตาราง · ทุกกิ่งมีเคสสด (editor เขียนได้ · viewer อ่านได้เขียนไม่ได้ · คนนอกไม่เห็น)
    // 🔴 อัปเดตรอบ 4 (`f9c74ff5…` → `9dfaba9e…`) — คลังครบ 4 ตาราง (`places` · `place_names`)
    //    ทั้งสองเป็น `select` + `using (true)` เหมือนสองตัวแรก · **ไม่มีฝั่งเขียนเลยสักตัว**
    // 🔴 อัปเดตรอบ 3 (`b039fbcc…` → `f9c74ff5…`) — เพิ่มตารางคลัง 2 policy
    //    ทั้งคู่เป็น `using (true)` **โดยตั้งใจและระบุชื่อไว้** (`D74`) — คลังเป็นข้อมูลสาธารณะ
    //    ⚠️ ถ้าวันหนึ่ง fingerprint เปลี่ยนเพราะมีคนเติม policy **ฝั่งเขียน** ให้คลัง นั่นคือคนละเรื่องกันสิ้นเชิง
    // 🔴 อัปเดต 25 ส.ค. 2026 รอบ 2 (`badfb2d0…` → `b039fbcc…`) — เพิ่มชั้นแผน 7 policy
    //    (`trip_plans` 4 ตัว รวม **DELETE ตัวแรกของ `E2`** · `trip_day_plan_settings` 3 ตัว)
    //    ทุกตัวมีเคสสดของตัวเองแล้ว รวมเคส `D70` ที่พิสูจน์ว่า **FK ประกอบ** เป็นตัวปฏิเสธ ไม่ใช่ RLS
    // 🔴 อัปเดตรอบ 1 (`1463dca6…` → `badfb2d0…`) — เพิ่ม `trip_days` 3 policy
    //    **ไล่กิ่งก่อนแล้วค่อยเปลี่ยนค่า ไม่ใช่เปลี่ยนค่าให้เขียว:** ทั้งสามกิ่งมีเคสสดของตัวเองแล้ว
    //    (`_select` → viewer อ่านได้ · `_insert` → viewer ถูกปฏิเสธ / editor ผ่าน · `_update` → `with check` กันย้ายวันข้ามทริป)
    //    และเคสพวกนั้นถูกเห็น **แดงด้วย `PGRST205` ก่อน `db push`** จึงรู้ว่ามันแตะตารางจริง
    expect(fingerprint, "เงื่อนไขของ policy บางตัวเปลี่ยนไป — ไล่กิ่งใหม่ก่อนอัปเดตค่านี้").toBe(
      // 🔴 แก้ 25 ส.ค. (P1 · `P-60`) — ไล่กิ่งแล้วก่อนเปลี่ยนค่านี้ ตามที่ข้อความของด่านสั่ง
      //    ที่เปลี่ยนคือ **เพิ่ม 2 policy ใหม่** (`catalog_country_contacts_select` · `catalog_place_access_select`)
      //    ทั้งคู่เป็น `for select to authenticated using (true)` — รูปเดียวกับคลังกลางอีก 4 ใบเป๊ะ
      //    **ไม่มี policy เดิมตัวไหนถูกแก้เงื่อนไข** (ยืนยันจากรายชื่อข้างบนที่เพิ่มอย่างเดียว ไม่มีตัวหาย)
      "429926002f8accf5",
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // `E2-AC11` — ตัวเลขความครอบคลุม · **สองตัว ไม่ยุบเป็นตัวเดียว**
  // ───────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC11 — ความครอบคลุมของเมทริกซ์ วัดจากกิ่ง ไม่ใช่จากจำนวนตาราง", () => {
    /**
     * **ตัวหารเดิมคือ "22 ตารางที่ PostgREST มองเห็น" และเราทิ้งมันไปแล้ว** (P1 เสนอ · P4 ปฏิเสธ · P1 รับ)
     * เหตุผล: **ตัวหารที่ขยับตาม grant ไม่ได้วัดความครอบคลุม มันวัดว่าใครยิงถาม**
     * ถอน grant ของข้อยกเว้นที่ 5 เมื่อไหร่ ตัวนับจะบอก 18 ทั้งที่ตารางยังอยู่ครบ 22 ใบ
     * · และมันบิดเบือนอยู่แล้ว: ตารางที่มี 4 policy หลายเงื่อนไข ถูกนับเท่ากับแคชที่ไม่มี policy เลย
     *   **ทั้งที่คำถามของสองอย่างนี้คนละคำถาม**
     *
     * 🔴 **จึงเป็น 2 ตัวเลข และห้ามยุบเป็นตัวเดียว** (ข้อนี้ P1 เป็นคนทัก และเขาถูก):
     *    ① ตารางที่ **มี policy** → นับ *กิ่ง* · ② ตารางที่ **0 policy** → ไม่มีกิ่งให้นับเลย
     *    ยุบรวมเมื่อไหร่ ② จะหายไปในเศษทศนิยม **ทั้งที่มันคือกลุ่มที่ไม่มีชั้นที่สองรองรับ**
     *
     * ⚠️⚠️ **สิ่งที่ตัวเลขนี้พิสูจน์ และสิ่งที่มันไม่ได้พิสูจน์ — อ่านก่อนเอาไปรายงาน**
     *    ✅ พิสูจน์: มีเคสที่ **ยิงตาราง+verb นั้นจริง** ผ่าน client ในเมทริกซ์
     *    🔴 **ไม่ได้พิสูจน์ว่าเคสนั้นเดินผ่านทุกกิ่งของ predicate** — กิ่งจริงอยู่ใน `app.can_read_trip`
     *       ฯลฯ ซึ่งไม่มีเครื่องมือไหนในสแตกนี้ตอบได้
     *    🎯 **เลือกแบบนี้เพราะทางเลือกอื่นแย่กว่า:** ถ้าให้คนกรอกทะเบียนว่า "กิ่งนี้มีเคสแล้ว"
     *       เราจะได้ตัวเลขที่ **ขยับตามความขยันกรอก ไม่ใช่ตามความครอบคลุม** — ความผิดพลาด
     *       ชนิดเดียวกับตัวหาร 22 ที่เพิ่งทิ้งไป · **ตัวเลขนี้โกงไม่ได้โดยไม่เขียนโค้ดที่ยิงจริง**
     */
    const MATRIX_SRC = readFileSync(new URL("./rlsMatrix.test.ts", import.meta.url), "utf8");

    /** (ตาราง, verb) ที่เมทริกซ์ยิงจริง — ดึงจาก**ซอร์สของเทสต์** ไม่ใช่จากคำประกาศของใคร */
    function exercised(): Set<string> {
      const src = stripComments(MATRIX_SRC);
      const hits = new Set<string>();
      // `.from("X")` แล้วตามด้วย `.select(` / `.insert(` / `.update(` / `.delete(` ในนิพจน์เดียวกัน
      for (const m of src.matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)([\s\S]{0,400}?)(?=\.from\(|;|\n\n)/g)) {
        for (const v of ["select", "insert", "update", "delete"]) {
          if (new RegExp(`\\.${v}\\(`).test(m[2])) hits.add(`${m[1]}.${v}`);
        }
      }
      // `it.each(CACHES)` และเพื่อน ๆ ยิงผ่านตัวแปร — จับชื่อตารางในอาร์เรย์ constant ด้วย
      return hits;
    }

    it("ด้านบวกของตัวดึงเอง — ต้องดึงได้จริง ไม่ใช่คืนเซตว่างแล้วหาร 0", () => {
      const ex = exercised();
      // เซตว่างจะทำให้ทุกตัวเลขข้างล่างเป็น 0/N ซึ่ง **อ่านเป็น "ยังไม่ได้ทำ" ไม่ใช่ "ตัวนับพัง"**
      expect(ex.size, "ดึง (ตาราง, verb) จากซอร์สเมทริกซ์ไม่ได้เลย").toBeGreaterThan(20);
      expect(ex, "ตัวดึงไม่เห็นการยิงที่เห็น ๆ อยู่ในไฟล์").toContain("trips.select");
      expect(ex).toContain("checklist_items.insert");
    });

    it("🔴 ① ทุก (ตาราง, verb) ที่มี policy ต้องมีเคสยิงถึง", () => {
      const need = new Map<string, string[]>();
      for (const [key, body] of policyMapOrdered()) {
        const [table, name] = key.split(".");
        const verb = body.match(/^\s*for (\w+)/)?.[1];
        if (!verb) continue;
        const k = `${table}.${verb}`;
        need.set(k, [...(need.get(k) ?? []), name]);
      }
      const ex = exercised();
      const uncovered = [...need.keys()].filter((k) => !ex.has(k)).sort();

      // 📊 ตัวเลข ① — พิมพ์ทุกรอบ เพื่อให้มันเป็นของที่มีคนเห็น ไม่ใช่ของที่ต้องไปขุด
      const covered = need.size - uncovered.length;
      console.log(`\n📊 E2-AC11 ① กิ่งที่มีเคส: ${covered}/${need.size} · policy ${policyMapOrdered().size} ตัว`);

      expect(
        uncovered.map((k) => `${k} (policy: ${need.get(k)!.join(", ")})`),
        "มี policy ที่ไม่มีเคสไหนยิงตาราง+verb นั้นเลยสักเคส\n" +
          "  🔴 policy ที่ไม่เคยถูกยิง = **ข้อความในไฟล์ ไม่ใช่พฤติกรรมที่พิสูจน์แล้ว**\n" +
          "  · ถ้าเพิ่ง `create policy` ใหม่ นี่คือรายการงานที่เหลือ ไม่ใช่บั๊ก",
      ).toEqual([]);
    });

    it("🔴 ② ตารางที่ 0 policy ต้องมีเคสยืนยันว่าปฏิเสธครบทุก verb", () => {
      /**
       * กลุ่มนี้ **ไม่มีกิ่งให้นับ** — ปิดด้วย `revoke` ล้วน ๆ ไม่มี policy สักตัว
       * 🔴 และมันคือกลุ่มที่ **ไม่มีชั้นที่สองรองรับ**: ถ้าใคร `grant` กลับคืนวันหนึ่ง
       *    ไม่มี RLS มาช่วยกรองอะไรเลย · ยุบมันเข้าตัวเลข ① เมื่อไหร่ กลุ่มนี้จะหายไปในเศษทศนิยม
       */
      const withPolicy = new Set([...policyMapOrdered().keys()].map((k) => k.split(".")[0]));
      const src = migrationFiles.map((f) => readFileSync(f, "utf8")).join("\n");
      const rlsOn = new Set(
        [
          ...stripComments(src).matchAll(
            /alter\s+table\s+public\.([a-z_0-9]+)\s+enable\s+row\s+level\s+security/gi,
          ),
        ].map((m) => m[1].toLowerCase()),
      );
      // ตารางที่ถูก drop ไปแล้ว ไม่นับ — ใช้ตัวสแกนตัวเดียวกับเคส TRUNCATE ไม่เขียนซ้ำ (`E0` ข้อ 5)
      const alive = new Set(tablesFromMigrations());
      const zeroPolicy = [...rlsOn].filter((t) => alive.has(t) && !withPolicy.has(t)).sort();

      expect(zeroPolicy.length, "ไม่มีตาราง 0-policy เลย — ตัวเลข ② กำลังวัดความว่างเปล่า").toBeGreaterThan(0);

      // เคสของกลุ่มนี้ยิงผ่านตัวแปร (`it.each(CACHES)`) ตัวดึงของ ① จึงมองไม่เห็น
      // → เกณฑ์คือ **ชื่อตารางต้องปรากฏในซอร์สเมทริกซ์ และไฟล์ต้องมีเคสที่ยืนยัน 42501**
      const src2 = stripComments(MATRIX_SRC);
      const missing = zeroPolicy.filter((t) => !src2.includes(t));
      const uncovered = [...missing];
      console.log(`📊 E2-AC11 ② ตาราง 0-policy ที่มีเคส: ${zeroPolicy.length - uncovered.length}/${zeroPolicy.length}\n`);

      expect(src2, "เมทริกซ์ไม่มีเคสที่ยืนยันการปฏิเสธด้วย 42501 เลย").toContain('"42501"');
      expect(
        uncovered,
        "ตารางที่ไม่มี policy สักตัว และไม่มีเคสไหนพูดถึงเลย\n" +
          "  🔴 **ไม่มี policy = ไม่มีชั้นที่สอง** — ถ้ามีคน grant กลับ ไม่มีอะไรกรองให้เลย\n" +
          "  → ต้องมีเคสยืนยันว่า `anon`/`authenticated` ถูกปฏิเสธครบทั้ง 4 verb",
      ).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("🔴 E2-AC12 — invariant ที่ถามว่า 'ยังถูกใช้อยู่ไหม' ต้องไม่นับแถวที่ถูกลบแล้ว", () => {
    /**
     * `soft delete` ทำให้แถวที่ผู้ใช้ *ลบไปแล้ว* ยังอยู่ในตาราง → **invariant ที่นับแถวดิบ
     * จะนับของที่หน้าจอไม่แสดงแล้ว** แล้วผู้ใช้จะเจอ *"ลบไม่ได้เพราะยังมีของใช้อยู่"*
     * บนหน้าจอที่ว่างเปล่า **โดยไม่มีอะไรอธิบายได้เลยว่าทำไม**
     *
     * 🎯 **ตระกูลนี้กัดโปรเจกต์นี้มาแล้ว 2 ครั้ง:** `trip_hotels` ที่ถูกลบแล้วยังกันช่วงวัน (`D76`)
     * และ `assert_day_has_no_stops` ฉบับแรกที่ไม่กรอง — **ทั้งคู่ถูกแก้ทีหลัง ไม่ใช่ถูกกันไว้ก่อน**
     *
     * 🔴 **และเคสนี้ต้องอ่าน *นิยามล่าสุด* ของฟังก์ชัน ไม่ใช่ที่เจอครั้งแรก**
     * ผมเพิ่งพลาดข้อนี้เองตอนไล่ `AC12`: อ่าน `assert_day_has_no_stops` จากไฟล์ที่สร้างมัน
     * แล้วสรุปว่าไม่กรอง **ทั้งที่ไฟล์ที่รันทีหลัง `create or replace` ไปแล้วพร้อมตัวกรอง**
     * → **ไฟล์บอกว่า *เคยเขียนว่าอะไร* ไม่ได้บอกว่า *ตอนนี้เป็นอะไร*** — เหตุผลเดียวกับที่
     *   `policyMapOrdered()` มีอยู่สำหรับ policy · ตัวนี้คือคู่ของมันสำหรับฟังก์ชัน
     */
    /** ตารางที่มี `deleted_at` — จาก `create table` และ `alter table … add column` */
    function softDeletableTables(): Set<string> {
      const out = new Set<string>();
      for (const f of migrationFiles) {
        const sql = stripComments(readFileSync(f, "utf8"));
        for (const m of sql.matchAll(
          /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/gi,
        )) {
          if (/^\s*deleted_at\s/m.test(m[2])) out.add(m[1].toLowerCase());
        }
        for (const m of sql.matchAll(
          /alter\s+table\s+public\.([a-z_0-9]+)\s+add\s+column\s+deleted_at\b/gi,
        )) {
          out.add(m[1].toLowerCase());
        }
      }
      return out;
    }

    it("ด้านบวกของตัวดึงเอง — ต้องหา invariant กับตาราง soft-delete เจอจริง", () => {
      const fns = effectiveFunctions();
      const asserts = [...fns.keys()].filter((k) => k.startsWith("app.assert_"));
      expect(asserts.length, "หาฟังก์ชัน invariant ไม่เจอเลย — เคสข้างล่างจะวนศูนย์รอบแล้วเขียว").toBeGreaterThan(2);
      expect(softDeletableTables().size, "หาตารางที่มี `deleted_at` ไม่เจอเลย").toBeGreaterThan(3);
      // นิยามล่าสุดต้องชนะจริง — `assert_day_has_no_stops` ถูก `create or replace` ทีหลังพร้อมตัวกรอง
      expect(
        fns.get("app.assert_day_has_no_stops") ?? "",
        "ตัวอ่าน 'นิยามล่าสุดชนะ' ไม่ทำงาน — มันคืนฉบับแรกที่ยังไม่มีตัวกรอง",
      ).toContain("deleted_at is null");
    });

    /** ตัวตัดสินตัวจริง — **เคสทั้งสองข้างล่างเรียกตัวนี้ ไม่ใช่เขียนซ้ำ** (`E0` ข้อ 5) */
    function unfiltered(fns: Map<string, string>, soft: Set<string>): string[] {
      const bad: string[] = [];
      for (const [name, body] of fns) {
        if (!name.startsWith("app.assert_")) continue;
        const reads = [...body.matchAll(/from\s+public\.([a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase());
        const softReads = reads.filter((t) => soft.has(t));
        if (softReads.length > 0 && !/deleted_at\s+is\s+null/i.test(body)) {
          bad.push(`${name} → อ่าน ${[...new Set(softReads)].join(", ")} โดยไม่กรอง deleted_at`);
        }
      }
      return bad;
    }

    it("🔴 ตัวตัดสินทำงาน 2 ทิศ — ไม่งั้นเคสข้างล่างเขียวได้โดยไม่เคยจับอะไรเลย", () => {
      const soft = new Set(["trip_stops"]);
      // ด้านบวก: อ่านตาราง soft-delete โดยไม่กรอง ต้องถูกจับ
      expect(
        unfiltered(new Map([["app.assert_x", "select 1 from public.trip_stops where trip_day_id = old.id"]]), soft),
      ).toHaveLength(1);
      // ด้านลบ ①: กรองแล้ว ต้องไม่ถูกจับ
      expect(
        unfiltered(
          new Map([["app.assert_x", "select 1 from public.trip_stops where a = b and deleted_at is null"]]),
          soft,
        ),
      ).toEqual([]);
      // ด้านลบ ②: ตารางที่ไม่มี `deleted_at` เลย ไม่ต้องกรอง — ไม่ใช่ความผิด
      expect(
        unfiltered(new Map([["app.assert_x", "select 1 from public.trips where id = old.id"]]), soft),
      ).toEqual([]);
      // ด้านลบ ③: ฟังก์ชันที่ไม่ใช่ invariant ไม่อยู่ในขอบเขตข้อนี้
      expect(
        unfiltered(new Map([["app.can_read_trip", "select 1 from public.trip_stops"]]), soft),
      ).toEqual([]);
    });

    it("🔴 ทุก invariant ที่อ่านตาราง soft-delete ต้องกรอง `deleted_at is null`", () => {
      const bad = unfiltered(effectiveFunctions(), softDeletableTables());
      expect(
        bad,
        "invariant นับแถวที่ผู้ใช้ลบไปแล้วว่ายัง 'ถูกใช้อยู่'\n" +
          "  🔴 อาการที่ผู้ใช้เจอ: **ลบไม่ได้ โดยหน้าจอไม่มีอะไรค้างให้เห็นเลย** และไม่มีทางแก้จากใน UI\n" +
          "  · ถ้า invariant ตัวนั้น *ตั้งใจ* นับรวมของที่ลบแล้ว ให้เขียนเหตุผลกำกับแล้วมาคุยกัน\n" +
          "    **แต่ค่าเริ่มต้นต้องเป็นกรองออก** เพราะตระกูลนี้กัดมาแล้ว 2 ครั้งในโปรเจกต์นี้",
      ).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("🔴 ด่านที่ตัดสินว่ารอบนี้อ่านเป็นเขียวได้ไหม — ต้องยิงเอง", () => {
    /**
     * 🔴 **ตัวนี้ตรวจตัวเองไม่ได้โดยธรรมชาติ** — มันตัดสิน*ผลของทั้งรอบ* จากใน reporter
     * ถ้ามันพัง อาการคือ **ทุกอย่างเขียวเหมือนเดิมทุกประการ** ไม่มีสัญญาณอะไรเลย
     * → ตรรกะจึงอยู่ใน `_runIntegrity.ts` แยกจาก reporter **และเคสพวกนี้ยิงตัวเดียวกับที่ config เรียก**
     *
     * 📌 ยิงจริงทั้งสายแล้ววันที่เขียน: ไม่มี creds ไม่ตั้งธง — **เดิม exit 0 · ตอนนี้ exit 1**
     *    และรอบที่มี creds ครบ ยัง exit 0 เหมือนเดิม (ไม่ได้ทำให้ทุกอย่างแดง)
     */
    it("รอบที่สมบูรณ์ ต้องผ่าน", () => {
      expect(runIntegrityFailure({ skipped: 0, suiteErrors: 0, total: 487 })).toBeNull();
    });

    /**
     * 🔴 **ธง `EXPECT_SKIPPED_TESTS` — เพิ่ม 26 ส.ค. (P1 · P6 วินิจฉัย)**
     *
     * reporter ทำให้ job `Lint · Test · Types · Build` **แดงทุก push** เพราะ job นั้น
     * **ไม่มี creds โดยการออกแบบ** (ไม่ให้ `service_role` กระจายเกิน job `rls`)
     * → 233 เคสถูกข้าม **ซึ่งถูกต้อง** แต่ reporter อ่านว่าผิด
     * 🎯 **ด่านกลายเป็นสิ่งที่ตัวมันเกิดมาเพื่อกัน:** *แดงที่ไม่ใช่บั๊ก สอนให้คนเลิกอ่านสีของ CI*
     *
     * 🔴 **3 เคสนี้คือสัญญาของธง และเคสที่ 2 กับ 3 สำคัญกว่าเคสที่ 1:**
     * ธงผ่อน **เฉพาะการข้าม** — `suiteErrors` และ *"ไม่มีเคสให้รันเลย"* **ยังล้มเสมอ**
     * · ไม่มี creds **ไม่ใช่เหตุผลให้ `beforeAll` ล้ม** · และ "ไม่มีอะไรให้รัน" ไม่เคยเป็นสิ่งที่ตั้งใจ
     * · **ถ้าผ่อนทั้งก้อน ธงตัวเดียวจะปิดด่านทั้งด่าน ซึ่งคือรูปที่ทีมนี้ปฏิเสธมาทั้งวัน**
     */
    it("ธง `expectSkipped` ผ่อนเฉพาะการข้าม — รอบที่ข้ามอย่างเดียวต้องผ่าน", () => {
      expect(
        runIntegrityFailure({ skipped: 233, suiteErrors: 0, total: 494 }, { expectSkipped: true }),
      ).toBeNull();
    });

    it("🔴 ธง `expectSkipped` **ต้องไม่ปิด** ด่าน suite ที่รันไม่สำเร็จ", () => {
      const why = runIntegrityFailure(
        { skipped: 233, suiteErrors: 1, total: 494 },
        { expectSkipped: true },
      );
      expect(why, "ธงกลบ suite ที่ล้มไปด้วย — ไม่มี creds ไม่ใช่เหตุผลให้ `beforeAll` ล้ม").not.toBeNull();
      expect(why).toContain("suite");
    });

    it("🔴 ธง `expectSkipped` **ต้องไม่ปิด** ด่าน 'ไม่มีเคสให้รันเลย'", () => {
      const why = runIntegrityFailure({ skipped: 0, suiteErrors: 0, total: 0 }, { expectSkipped: true });
      expect(why, "ธงกลบรอบที่ไม่ได้ตรวจอะไรเลยไปด้วย").not.toBeNull();
    });

    it("🔴 เคสถูกข้าม = อ่านเป็นเขียวไม่ได้ — **นี่คือทางที่วัดแล้วว่าเปิดอยู่จริง**", () => {
      const why = runIntegrityFailure({ skipped: 230, suiteErrors: 0, total: 256 });
      expect(why, "รอบที่ข้าม 230 เคสยังอ่านเป็นเขียวได้").not.toBeNull();
      expect(why).toContain("230");
    });

    it("🔴 suite ที่รันไม่สำเร็จ = อ่านเป็นเขียวไม่ได้ (ทางที่ P1 เจอ)", () => {
      // `beforeAll` ล้ม → เคสขึ้นเป็น skipped และบรรทัด `Tests` อ่านเหมือนผ่าน
      expect(runIntegrityFailure({ skipped: 0, suiteErrors: 1, total: 487 })).toContain("suite");
    });

    it("🔴 ไม่มีเคสเลย = อ่านเป็นเขียวไม่ได้ (`P-21`)", () => {
      // "ไม่มีอะไรพัง" กับ "ไม่ได้ตรวจอะไร" ให้ exit code เดียวกันเป๊ะถ้าไม่ดักไว้
      expect(runIntegrityFailure({ skipped: 0, suiteErrors: 0, total: 0 })).not.toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🔴 E6-AC9 — ตัวเขียนที่ updated_at ไม่บันทึก ต้องไม่เพิ่มเงียบ ๆ", () => {
  /**
   * คลาสที่โตขึ้นโดยไม่มีใครนับ: **การเปลี่ยนแถวจริงที่ `updated_at` ไม่ขยับ**
   * (① FK `on delete set null` · ② `preserve_authorship` · ③ promote-on-delete) — ทั้งหมดเพราะ
   * `touch_updated_at` มี `if pg_trigger_depth() > 1 then return` (ถูกต้อง ไม่แก้) · `E6-AC9` (ห้าม
   * delta sync บน `updated_at`) พึ่งคลาสนี้ · **trigger/FK ตัวที่ 4 จะเพิ่มโดยไม่มีอะไรส่งเสียง** (P7 เสนอ · P1 อนุมัติ)
   *
   * ## แกน (ข้อค้าน P4 · 26 ส.ค.): ด่านไม่ตีความ SQL — จับว่า *มีของเปลี่ยน* แล้วโยนภาระอธิบายกลับไปคนเปลี่ยน
   * ## source ไม่ใช่ catalog: หมุดต้องพูด **ตอน diff อยู่บนจอ** · catalog เห็นหลัง apply = ผิดเวลา + ข้ามเงียบตอนไม่มี creds
   *
   * ⚠️ **ขอบ — ชุดนี้จับ migration-declared เท่านั้น ไม่ครอบ drift**
   * ใครรัน `create or replace` ในแดชบอร์ด/SQL Editor (วิธีปกติที่นี่ · PLAN.md §5) → ฐานต่างจากไฟล์ โดยรายชื่อ migration
   * ไม่ขยับ · หมุดพวกนี้มองไม่เห็น · drift ต้องเป็นเช็คมีชื่อตัวเองในชุดสด — **ช่องที่รู้จัก ยังไม่ปิด**
   *
   * 🔴 `zz_read_only_guard` ยกเว้นโดยตั้งใจ — สร้างด้วย `execute format(... %I)` ลูปต่อตาราง = พลวัต static regex เห็นไม่ได้
   * ความครบของมันเป็นงานของ `pin:read-only-coverage` คนละหมุด · ตั้งชื่อไม่ใช้เลข (เลขซ้ำอ่านผ่านรีวิวได้ · รอย "ข้อยกเว้นที่ 4")
   */
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  function staticTriggerDefs(): Map<string, string> {
    const defs = new Map<string, string>();
    for (const f of migrationFiles) {
      const sql = stripComments(readFileSync(f, "utf8"));
      for (const m of sql.matchAll(
        /create\s+(?:constraint\s+)?trigger\s+(\w+)\b[\s\S]*?;|drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)/gi,
      )) {
        if (m[1]) {
          const name = m[1];
          const stmt = norm(m[0]);
          if (name === "zz_read_only_guard" || stmt.includes("%I")) continue;
          defs.set(name, stmt);
        } else if (m[2] && m[2] !== "zz_read_only_guard") {
          defs.delete(m[2]);
        }
      }
    }
    return defs;
  }

  it("🔴 pin:trigger-registry — รายชื่อ trigger (static) ต้องไม่เปลี่ยน", () => {
    expect(
      [...staticTriggerDefs().keys()].sort(),
      "trigger static เพิ่ม/หาย/เปลี่ยนชื่อ — ตัวใหม่ที่เขียนแถวโดยไม่ stamp คือสิ่งที่ E6-AC9 กลัว\n" +
        "  → ประกาศว่า stamp หรือไม่ ก่อนขึ้นทะเบียน แล้วค่อยแก้ค่านี้ (ไม่ใช่แก้ให้เขียว)",
    ).toEqual([
      "bookings_stamp_added_by", "bookings_touch", "catalog_cities_touch", "catalog_countries_touch",
      "catalog_country_contacts_touch", "catalog_place_access_touch", "catalog_place_descriptions_touch",
      "catalog_place_names_touch", "catalog_places_touch", "checklist_items_stamp_added_by",
      "checklist_items_stamp_checked_by", "checklist_items_touch", "custom_place_descriptions_touch",
      "custom_place_names_touch", "custom_places_not_in_use", "custom_places_stamp_added_by",
      "custom_places_touch", "hidden_places_stamp_hidden_by", "on_auth_user_created",
      "place_notes_stamp_added_by", "place_notes_touch", "profiles_preserve_authorship", "profiles_touch",
      "tdps_touch", "trip_days_no_orphan_stops", "trip_days_touch", "trip_hotels_stamp_added_by",
      "trip_hotels_touch", "trip_members_keep_owner", "trip_plans_keep_one",
      "trip_plans_promote_active", "trip_plans_touch",
      "trip_stops_stamp_added_by", "trip_stops_touch", "trips_bootstrap_owner", "trips_freeze_created_by",
      "trips_touch",
    ]);
  });

  it("🔴 pin:trigger-when — เนื้อ definition (when/timing/ฟังก์ชันที่ผูก) ต้องไม่เปลี่ยนเงียบ", () => {
    const defs = [...staticTriggerDefs().entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect(
      sha(JSON.stringify(defs)),
      "definition ของ trigger สักตัวเปลี่ยน (when/timing/ฟังก์ชัน) โดยรายชื่อไม่ขยับ\n" +
        "  🔴 ถอด `when (...)` ตัวเดียว = updated_at เปลี่ยนความหมายทั้งตาราง · log `[...staticTriggerDefs().entries()]` (ตัวสกัดอยู่ใน describe นี้) ดูตัวที่เปลี่ยน",
    ).toBe("331a154de8de326179d700f949888f0ff61e2e64189c31f0aea607af107ba0b6");
  });

  it("🔴 pin:app-fn-body — body ของทุกฟังก์ชัน app.* ต้องไม่เปลี่ยนเงียบ", () => {
    // 🎯 สมาชิก = ทุกฟังก์ชันใน schema `app` — **schema เป็นคนตอบว่าใครเป็นสมาชิก ไม่ใช่คนคัด** (P1)
    //    ทุกรูของหมุดกลุ่มนี้เกิดจาก "รายการที่คนคัดสมาชิก": derive จาก trigger → พลาด deny_write (trigger พลวัต) +
    //    write_is_blocked (non-trigger helper) + can_write_trip (policy-called) · **ไม่มีรูไหนเกิดจากรายการที่กวาดทั้งหมด**
    //    ชื่อ `app-fn-body` บอกเกณฑ์ตรงตัว ไม่เชิญให้ derive จาก trigger อีก · public.* RPC ที่ churn ไม่เข้า (อยู่ public · คุมด้วย pin:rpc-reachable)
    //
    // 🔴 `app.can_write_trip` ถูกอ้างใน policy **88 จุด** (+ `can_read_trip` อีกชุด) — ใครแก้ body มัน **กำลังเปลี่ยนสิทธิ์เขียนทั้งสคีมา**
    //    ไม่ใช่ฟังก์ชันเดียว · `write_is_blocked`/`deny_write_when_read_only` = โหมดอ่านอย่างเดียวทั้งหมด
    // churn วัดแล้ว (P1): 12 ตัวที่เพิ่งกวาดเข้ามานิ่งสุด ~1×/ตัว · ตัวที่ churn สูงปักอยู่ก่อนแล้ว → เพิ่มเข้ามา *ลด* อัตราแดง/ฟังก์ชัน
    //    (`probe_definer_write` ×3 เป็นตัว churn จริงตัวเดียว · เป็น probe · ถ้าดังบ่อยค่อยตัดออก *โดยตั้งใจ* ไม่ใช่เดา)
    const eff = effectiveFunctions();
    const names = [...eff.keys()].filter((n) => n.startsWith("app.")).sort();
    // positive control — effectiveFunctions พัง "ไม่เจอฟังก์ชัน" ต้องไม่กลายเป็น "ผ่านหมด" (subscribers > 0)
    expect(names.length, "ไม่เจอฟังก์ชัน app.* เลย — ตัวช่วยพัง ไม่ใช่ 'ไม่มีฟังก์ชัน'").toBeGreaterThan(15);
    expect(names, "ฟังก์ชัน app.* เพิ่ม/หาย — ตัวใหม่ต้องถูกไล่กิ่งก่อนขึ้นทะเบียน").toEqual([
      "app.assert_day_has_no_stops", "app.assert_place_not_in_use", "app.assert_trip_has_owner",
      "app.assert_trip_has_plan", "app.booking_file_trip", "app.bootstrap_trip_owner", "app.can_read_trip",
      "app.can_write_trip", "app.default_expiry_minutes", "app.deny_write_when_read_only",
      "app.freeze_created_by", "app.handle_new_user", "app.like_literal", "app.mode_is_active",
      "app.preserve_authorship", "app.probe_definer_write", "app.probe_log", "app.promote_plan_if_none_active",
      "app.search_norm",
      "app.shares_trip_with", "app.stamp_added_by", "app.stamp_checked_by", "app.stamp_hidden_by",
      "app.touch_updated_at", "app.touch_updated_at_only", "app.trip_owner_count", "app.trip_role",
      "app.write_is_blocked",
    ]);
    const bodies = names.map((n) => [n, eff.get(n) ?? "MISSING"] as const);
    expect(bodies.every(([, b]) => b !== "MISSING"), "หา body ของ app.* บางตัวไม่เจอ").toBe(true);
    expect(
      sha(JSON.stringify(bodies)),
      "body ของฟังก์ชัน app.* สักตัวเปลี่ยน — `create or replace` เปลี่ยนได้เงียบ ๆ · " +
        "ถ้าเป็น can_write_trip = สิทธิ์เขียน 88 policy เปลี่ยนพร้อมกัน · ไล่กิ่งก่อนแก้ค่านี้",
    ).toBe("44e665b0c8488857d60e0153a152baba1b484e3f4da5a3a52e26f70e85245024");
  });

  it("🔴 pin:fk-set-null — FK `on delete set null` (คลาส ①) ต้องไม่เพิ่มเงียบ", () => {
    const fk = new Set<string>();
    for (const f of migrationFiles) {
      const sql = stripComments(readFileSync(f, "utf8"));
      for (const m of sql.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/gi,
      )) {
        const tbl = m[1].toLowerCase();
        for (const c of m[2].matchAll(/([a-z_]\w*)\s+uuid[^,]*?references[^,]*?on\s+delete\s+set\s+null/gi))
          fk.add(`${tbl}.${c[1].toLowerCase()}`);
      }
      for (const m of sql.matchAll(
        /alter\s+table\s+(?:only\s+)?public\.([a-z_0-9]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]\w*)[^;]*?on\s+delete\s+set\s+null/gi,
      ))
        fk.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
    }
    expect(
      [...fk].sort(),
      "FK `on delete set null` เพิ่ม/หาย — set null เขียนคอลัมน์ตอน trigger depth > 0 → updated_at ไม่ขยับ\n" +
        "  🔴 หมุด trigger/function จับข้อนี้ไม่ได้ (FK ไม่มี body) · ตัวใหม่ = ตัวเขียนเงียบที่ delta sync (E6-AC9) พลาด",
    ).toEqual([
      "bookings.added_by_user", "bookings.updated_by_user", "checklist_items.added_by_user",
      "checklist_items.checked_by_user", "checklist_items.updated_by_user", "custom_places.added_by_user",
      "custom_places.updated_by_user", "hidden_places.hidden_by_user", "place_notes.added_by_user",
      "place_notes.updated_by_user", "profiles.updated_by_user", "trip_day_plan_settings.updated_by_user",
      "trip_days.updated_by_user", "trip_hotels.added_by_user", "trip_hotels.updated_by_user",
      "trip_members.invited_by", "trip_plans.updated_by_user", "trip_stops.added_by_user",
      "trip_stops.updated_by_user", "trips.updated_by_user",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🔴 read-only mode — ทุกตาราง public ต้องติด zz_read_only_guard (pin:read-only-coverage)", () => {
  /**
   * P1 (จาก P5) · `E7` (หลายประเทศ) จะเพิ่มตาราง · ตารางใหม่ที่ไม่ติด guard = write ผ่านได้ตอน read-only mode
   * และจะถูกพบตอน cutover (กู้ไม่ได้) เหมือนช่อง storage ของ P2
   *
   * 🎯 หมุด trigger (`pin:trigger-registry`) มองข้อนี้ไม่เห็นตามนิยาม — **ตารางที่ไม่มี trigger เลย ไม่อยู่ใน pg_trigger**
   *    ต้องไล่จาก *ตาราง* ไม่ใช่จาก *trigger* (รูปเดียวกับ `noteRealtimeSubscribed`: การนับจากรายการที่มี ไม่เห็นสิ่งที่ไม่เคยเข้ารายการ)
   *
   * เกณฑ์ (ไม่มีเส้นแบ่งไฟล์ให้จำ): ทุก `create table public.X` ต้องมี guard-event ที่ลำดับ ≥ ตอนสร้าง
   *   ① `create trigger zz_read_only_guard … on public.X` ตรง ๆ · หรือ
   *   ② ลูป `execute format('create trigger zz_read_only_guard … %I')` — ครอบทุกตารางที่เกิดก่อน/พร้อมมัน (มี 2 จุด · ทั้งคู่ zz_read_only_guard)
   * → อัปเดตตัวเองเมื่อมีคนรันลูปซ้ำ · ไม่มีเลข/ชื่อไฟล์ให้ตามแก้
   *
   * 🔴 zz_read_only_guard เป็น dynamic (ลูปต่อตาราง) → source เห็นแค่ *ลูป* ไม่เห็น *ผลของลูป* — ปักเหตุการณ์ติดได้ ปักความครอบคลุมจริงไม่ได้
   * ⚠️ ไม่ครอบ drift (แดชบอร์ด) · มี `drop table` จริง 1 ตัว (`rls_force_probe` · `20260825224115`) — `tablesFromMigrations()` ตาม create/drop
   *    ตามลำดับอยู่แล้ว จึงหักตารางที่ถูก drop ออกจากรายการเอง (ตัว drop ในคอมเมนต์ rollback ถูก `stripComments` ตัดทิ้งก่อน scan)
   */
  /** ตารางถูกครอบไหม — สร้างก่อน/พร้อมลูป (ci ≤ lastLoop) หรือมี direct guard ทีหลัง (dg ≥ ci) */
  const guardCovered = (ci: number, lastLoopIdx: number, dgIdx: number | undefined): boolean =>
    ci <= lastLoopIdx || (dgIdx !== undefined && dgIdx >= ci);

  it("🔴 ทุกตาราง public ใน migration ต้องมี zz_read_only_guard ครอบ (E7 ตารางใหม่จะแดงที่นี่)", () => {
    const tables = tablesFromMigrations();
    // positive control — regex พัง "ไม่เจอตาราง" ต้องไม่กลายเป็น "ทุกตารางผ่าน" (subscribers > 0)
    expect(tables.length, "นับตารางไม่ได้เลย — ตัวช่วยพัง ไม่ใช่ 'ไม่มีตาราง'").toBeGreaterThan(20);

    const createIdx = new Map<string, number>();
    const directGuard = new Map<string, number>();
    let lastLoopIdx = -1;
    migrationFiles.forEach((f, i) => {
      const sql = stripComments(readFileSync(f, "utf8"));
      for (const m of sql.matchAll(
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:public\.[a-z_][a-z0-9_]*\s*,?\s*)+)/gi,
      ))
        for (const n of m[1].matchAll(/public\.([a-z_][a-z0-9_]*)/gi))
          if (!createIdx.has(n[1].toLowerCase())) createIdx.set(n[1].toLowerCase(), i);
      if (/execute\s+format\([^)]*create\s+trigger\s+zz_read_only_guard[\s\S]*?%I/i.test(sql)) lastLoopIdx = i;
      for (const m of sql.matchAll(/create\s+trigger\s+zz_read_only_guard[\s\S]*?on\s+public\.([a-z_][a-z0-9_]*)/gi))
        directGuard.set(m[1].toLowerCase(), i);
    });
    expect(lastLoopIdx, "ไม่เจอลูปติด zz_read_only_guard เลย — ตัวติด guard หาย").toBeGreaterThanOrEqual(0);

    const uncovered = tables.filter((t) => {
      const ci = createIdx.get(t);
      expect(ci, `ตาราง ${t} มาจาก tablesFromMigrations แต่หา create ไม่เจอ — ตัวช่วยสองตัวไม่ตรงกัน`).not.toBeUndefined();
      return !guardCovered(ci as number, lastLoopIdx, directGuard.get(t));
    });
    expect(
      uncovered,
      "ตาราง public ไม่มี zz_read_only_guard ครอบ — write จะผ่านตอน read-only mode\n" +
        "  → ติด guard บนตารางนี้ หรือรันลูปติดซ้ำ (E7 ตารางใหม่มาที่นี่)",
    ).toEqual([]);
  });

  it("🔴 ตัวตัดสิน coverage ต้องทำงาน 2 ทิศ — ไม่งั้น pin ข้างบนเขียวได้โดยไม่เคยจับอะไร", () => {
    expect(guardCovered(10, 5, undefined), "สร้างหลังลูป ไม่มี guard = ต้องไม่ครอบ (เคส E7 ที่ควรแดง)").toBe(false);
    expect(guardCovered(3, 5, undefined), "สร้างก่อน/พร้อมลูป = ครอบ").toBe(true);
    expect(guardCovered(10, 5, 12), "มี direct guard หลังสร้าง = ครอบ").toBe(true);
    expect(guardCovered(10, 5, 8), "direct guard ก่อนสร้าง ไม่นับ = ไม่ครอบ").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🔴 reachability — ทุก RPC ที่แอปเรียก ต้องยังเข้าถึงได้ (pin:rpc-reachable)", () => {
  /**
   * P1 (จาก P5) · ด่านเดิมถาม *"ใครเข้ามาได้เกินที่ควร"* — ไม่มีด่านถาม *"ของที่เราวางไว้ ยังมีคนเข้าถึงได้อยู่ไหม"*
   * P5 เจอเอง: `app.decide_proposal` grant ให้ `authenticated` ครบ **แต่ PostgREST เรียก `app.*` ไม่ได้** → migration เขียว · ปุ่มยืนยันไม่ทำงาน
   *
   * เกณฑ์: ทุก `.rpc("X")` ในโค้ดแอป (`app/` + `lib/` ไม่รวม `__tests__`) ต้องมี
   *   `grant execute on function public.X(...) to authenticated` (หรือ `anon`)
   * 🔴 ถ้า X อยู่ `app.*` แทน `public` → ไม่มี `public.X` → PostgREST เรียกไม่ได้ → แดง (จับเคส P5 ตรง ๆ)
   *
   * ⚠️ regex grant ต้องทน **arg list หลายบรรทัด** + **ช่องว่างหลายตัวก่อน `to`** — ทั้งสองรูปมีจริงในรีโป (P1 พลาดทั้งคู่)
   *    `[^;]` คร่อม newline · `\s+to` ทนช่องว่าง · ตัวจัดรูปให้คนอ่าน ไม่ได้จัดให้ regex อ่าน (`naive-strip`)
   * ⚠️ `.rpc(ตัวแปร)` ที่ชื่อไม่ใช่ literal → มองไม่เห็น (limitation · วันนี้ทุกตัวเป็น literal · positive control กัน regex พังเงียบ)
   */
  function appRpcNames(): string[] {
    const out = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === "__tests__" || e === "node_modules" || e === ".next") continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e))
          for (const m of readFileSync(p, "utf8").matchAll(/\.rpc\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi))
            out.add(m[1].toLowerCase());
      }
    };
    for (const d of ["app", "lib"]) walk(resolve(process.cwd(), d));
    return [...out].sort();
  }

  function reachablePublicFns(): Set<string> {
    const reachable = new Set<string>();
    for (const f of migrationFiles) {
      const sql = stripComments(readFileSync(f, "utf8"));
      // [^;] คร่อม newline (arg list หลายบรรทัด) · \s+to ทนช่องว่างหลายตัว
      for (const m of sql.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([^;]*?\)\s+to\s+([^;]+?);/gi,
      ))
        if (/\b(authenticated|anon)\b/i.test(m[2])) reachable.add(m[1].toLowerCase());
    }
    return reachable;
  }

  it("🔴 ทุก RPC ที่แอปเรียก ต้องมี grant execute บน public.<fn> ให้ authenticated/anon", () => {
    const rpcs = appRpcNames();
    const reachable = reachablePublicFns();
    // positive controls — walker/regex พัง ต้องไม่กลายเป็น "ผ่านหมด" (subscribers > 0)
    expect(rpcs.length, "ไม่เจอ .rpc() เลย — walker พัง ไม่ใช่ 'แอปไม่เรียก RPC'").toBeGreaterThan(0);
    expect(reachable.size, "ไม่เจอ grant execute สาธารณะเลย — regex พัง ไม่ใช่ 'ไม่มี grant'").toBeGreaterThan(0);

    const missing = rpcs.filter((r) => !reachable.has(r));
    expect(
      missing,
      "RPC ที่แอปเรียก แต่ไม่มี public.<fn> grant ให้ authenticated/anon\n" +
        "  🔴 ฟังก์ชันอยู่ app.* → PostgREST เรียกไม่ได้ · migration เขียวแต่ปุ่มพัง (เคส P5)",
    ).toEqual([]);
  });

  it("🔴 ตัวตรวจ reachable ต้องแยกได้ 2 ทิศ — ไม่งั้นเซตยอมรับทุกชื่อ แล้ว pin ข้างบนเขียวลวง", () => {
    const reachable = reachablePublicFns();
    expect(reachable.has("create_trip"), "RPC จริงต้องอยู่ในเซต").toBe(true);
    expect(reachable.has("this_fn_does_not_exist_zzz"), "ชื่อมั่วต้องไม่อยู่").toBe(false);
  });
});
