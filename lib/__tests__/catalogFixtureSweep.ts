import { readFileSync } from "node:fs";
import { TEST_COUNTRY_CODES } from "./_helpers";
import { testClient } from "./_testClient";

/**
 * **vitest `globalSetup` — กวาด fixture ในคลังอ้างอิงตอนจบรอบ**
 * เจ้าของ: P1-Lead · 3 ก.ย. 2026 · เกณฑ์แยกเป็นของ P4 (เสนอไว้ 26 ส.ค.)
 *
 * ## 🔴 ทำไมต้องมี — และทำไม *บันทึก* อย่างเดียวไม่พอ
 * ```
 * 26 ส.ค.  P4 วินิจฉัยครบ · ออกแบบเกณฑ์แยกไว้แล้ว · วัดได้ 694 แถว
 *          **ไม่มีใครสร้างกลไก**
 * 3 ก.ย.   วัดใหม่ 926 แถว (places) · 942 (cities) · 5 (countries)  ← โตเองเพราะไม่มีอะไรกวาด
 * ```
 * 🎯 ***บันทึกที่ถูกต้องทุกตัวอักษร ไม่ได้หยุดอะไรเลย — และมันอ่านเหมือนงานที่ทำเสร็จแล้ว***
 * · ผู้ใช้อนุมัติให้ลบก้อนที่ค้าง 3 ก.ย. 2026 (**1,873 แถว**) — ไฟล์นี้กันไม่ให้มันกลับมา
 * · 🔴 **ถ้าไม่มีไฟล์นี้ การลบครั้งนั้นคือการล้างที่จะเสื่อมกลับภายในไม่กี่วัน**
 *
 * ## ทำไมกวาดตอนจบรอบ ไม่ใช่ไล่แก้ที่ `afterAll` ของแต่ละไฟล์
 * `rlsMatrix.test.ts` **มีการลบคลังอยู่แล้ว 54 จุด** และของยังค้าง 926 แถว
 * ⇒ ปัญหาไม่ใช่ "ลืมเขียน `afterAll`" แต่คือ **มีเส้นทางออกที่ `afterAll` ไปไม่ถึง**
 *   (โยนกลางคัน · process ถูกฆ่า · แถวที่สร้างโดยฟังก์ชันช่วยที่ไม่รู้ว่าใครจะลบ)
 * 🎯 **ไล่แก้ 199 จุด insert เป็นงานที่ต้องทำถูกทุกครั้งตลอดไป · กวาดตอนจบทำถูกครั้งเดียว**
 *
 * ## 🔴 เกณฑ์แยก: **รหัสประเทศสงวน** ไม่ใช่ `source`
 * `TEST_COUNTRY_CODES` ใช้ช่วง ISO user-assigned (`z*`/`x*`) ที่ **ไม่มีวันเป็นประเทศจริง**
 * · ⚠️ **under-delete ปลอดภัย · over-delete ไม่ปลอดภัย** → ถ้าเกณฑ์พลาด ให้พลาดทางเหลือของไว้
 *
 * ## ⚠️ สิ่งที่ไฟล์นี้จงใจ **ไม่** ทำ
 * · **ไม่ล้มรอบเทสต์** ไม่ว่าจะเกิดอะไร — มันคือการเก็บกวาด ไม่ใช่ด่าน
 *   🔴 ถ้ามันล้มรอบได้ วันที่ FK บล็อกมันจะ **แดงใส่คนที่ไม่ได้ทำอะไรผิด** แล้วจะถูกถอด wire ทิ้ง
 * · **ไม่แตะแถวที่มีอะไรอ้างถึงอยู่** — `on delete restrict` จะปฏิเสธเอง เรารายงานแล้วปล่อยไว้
 * · **ไม่ใช่ opt-in** ต่างจาก `fixtureReaper` โดยตั้งใจ — ธงที่ต้องมีคนจำไปตั้ง ไม่ใช่กลไก
 */
const CODES = Object.values(TEST_COUNTRY_CODES);

/**
 * 🔴 **อ่าน ref จาก `.github/allowed-project-ref` — ไม่พิมพ์ค่าซ้ำลงไฟล์นี้**
 *
 * วันนี้ ref ถูกฝังไว้ **สี่ที่**: `allowed-project-ref` · `guards.sh` · `guards-selftest.sh`
 * · `fixtureReaper.ts` · **ไฟล์นี้เกือบเป็นใบที่ห้า**
 * 🎯 ***สำเนาที่ต้องมีคนมาซิงก์ จะล้าเสมอ*** — และ ref ที่ล้าในตัวกวาด แปลว่า
 *    **ด่านกันลบผิดฐานหยุดทำงานเงียบ ๆ** ซึ่งเป็นด่านที่แพงที่สุดที่จะเสีย
 * · ⚠️ อ่านไม่ได้ = ไม่กวาด (fail-closed) ไม่ใช่กวาดโดยไม่ตรวจ
 */
function allowedRef(): string | null {
  try {
    const v = readFileSync(".github/allowed-project-ref", "utf-8").trim();
    return /^[a-z]{20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

async function sweep(): Promise<void> {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  // 🔴 ไม่มี creds = ไม่มีอะไรให้กวาด · **เงียบ** เพราะรอบที่ไม่แตะฐานเป็นรอบปกติ
  if (!URL_ || !SERVICE) return;

  // ⛔ ชั้นเดียวกับ `fixtureReaper` — ห้ามลบอะไรถ้า URL ไม่ใช่ engine-dev
  //    🔴 ที่นี่ `return` ไม่ `throw` เพราะไฟล์นี้ห้ามล้มรอบ (ดูหัวไฟล์)
  const ref = allowedRef();
  if (!ref) {
    console.error("\n🔴 [catalog-sweep] อ่าน .github/allowed-project-ref ไม่ได้ — ไม่กวาดอะไรทั้งสิ้น");
    return;
  }
  if (!URL_.includes(ref)) {
    console.error(`\n🔴 [catalog-sweep] URL ไม่ใช่ engine-dev — ไม่กวาดอะไรทั้งสิ้น`);
    return;
  }

  const admin = testClient(SERVICE);
  try {
    const { data: cities } = await admin
      .from("catalog_cities").select("id").in("country_id", CODES);
    const cityIds = (cities ?? []).map((c: { id: string }) => c.id);

    let places = 0;
    if (cityIds.length) {
      // ลบเป็นก้อนละ 100 — `in()` ยาวเกินจะชน URL length ของ PostgREST
      for (let i = 0; i < cityIds.length; i += 100) {
        const { data } = await admin
          .from("catalog_places").delete().in("city_id", cityIds.slice(i, i + 100)).select("id");
        places += (data ?? []).length;
      }
    }
    const { data: delCities } = await admin
      .from("catalog_cities").delete().in("country_id", CODES).select("id");
    const { data: delCountries } = await admin
      .from("catalog_countries").delete().in("id", CODES).select("id");

    const n = places + (delCities ?? []).length + (delCountries ?? []).length;
    if (n > 0) {
      console.error(
        `\n[catalog-sweep] กวาด fixture คลัง ${n} แถว ` +
        `(places ${places} · cities ${(delCities ?? []).length} · countries ${(delCountries ?? []).length})\n`,
      );
    }
  } catch (e) {
    // 🔴 กลืนโดยตั้งใจ — การเก็บกวาดที่ล้ม ต้องไม่ทำให้ผลของรอบเทสต์เปลี่ยน
    console.error(`\n[catalog-sweep] กวาดไม่สำเร็จ (ไม่กระทบผลเทสต์): ${String(e)}\n`);
  }
}

export default async function catalogFixtureSweepSetup(): Promise<() => Promise<void>> {
  // 🔴 คืน teardown — **ต้องรันก่อน `fixtureLockGlobal` ปล่อย lock**
  //    vitest รัน teardown ย้อนลำดับของ `globalSetup` ⇒ ไฟล์นี้ต้องอยู่ **หลัง** ใน array
  //    ⚠️ ถ้าย้ายลำดับ การกวาดจะเกิดตอนไม่มี lock = ชนกับเซสชันอื่นที่เพิ่งเริ่มรอบได้
  return sweep;
}
