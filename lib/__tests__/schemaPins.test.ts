import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_COUNTRY_CODES, migrationFiles, stripComments } from "./_helpers";

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
      "catalog_place_names.catalog_place_names_select",
      "catalog_places.catalog_places_select",
      // 🔴 คลัง**ของผู้เช่า** — ครบ 4 verb ต่างจากคลังกลางที่มีแต่ `select` (`D75`)
      "checklist_items.checklist_items_insert",
      "checklist_items.checklist_items_select",
      "checklist_items.checklist_items_update",
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
      "bookings", "checklist_items", "custom_place_names", "custom_places",
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
      "app.handle_new_user",
      "app.shares_trip_with",
      "app.trip_owner_count",
      "app.trip_role",
      "public.client_writable_timestamps",
      "public.create_trip",
      // 🔴 `P-53` — soft delete ต้องผ่าน RPC เพราะ PostgREST ห่อ `UPDATE` ด้วย `RETURNING` เสมอ
      //    → แถวที่เพิ่งทำให้ตัวเองหายไป ไม่ผ่าน policy `SELECT` ของตัวเอง · **`P-26` กลับด้าน**
      //    คำตอบของคำถามข้างบน: รับ `p_id uuid` ตัวเดียว · ตั้ง `deleted_at` เท่านั้น
      //    · ถาม `app.can_write_trip()` ของคนเรียกเองก่อนทำอะไรทั้งสิ้น
      "public.soft_delete_booking",
      "public.soft_delete_checklist_item",
      "public.soft_delete_custom_place",
      "public.soft_delete_place_note",
      "public.soft_delete_trip_hotel",
      "public.soft_delete_trip_stop",
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
      "871a35aaced9c739",
    );
  });
});
