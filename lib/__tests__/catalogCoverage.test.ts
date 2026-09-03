import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_COUNTRY_CODES, readEnvKey, requireLiveCreds } from "./_helpers";
import { testClient } from "./_testClient";
import { browseCatalogPlaces, searchCatalogCities } from "@/lib/engine/db";

/**
 * `E4` — ประเทศที่ **ประกาศรองรับ** ต้องมีสถานที่ให้เที่ยวจริง · เจ้าของ: P4 (27 ส.ค. 2026)
 *
 * ## สิ่งที่วัด และทำไมต้องวัดแบบนี้
 * 🔴 **"มีแถวในคลัง" ไม่เท่ากับ "ใช้งานได้"** — `jp` มีสถานที่ 7 แห่ง ดู*มีข้อมูล*
 *    แต่ **ทั้ง 7 เป็น `transport` (สนามบิน/สถานี)** → ผู้ใช้สร้างทริปญี่ปุ่นได้ เลือกวันได้
 *    แล้วกด "เพิ่มสถานที่" เจอ**หน้าว่าง** · ประเทศที่ประกาศรองรับแต่เที่ยวไม่ได้
 * 🎯 นี่คือรูปเดียวกับคลัง 766 แถวที่ 694 เป็น fixture — **ตัวเลขไม่ศูนย์ ปลอมตัวเป็นสุขภาพดี**
 *    → เคสนี้จึงนับ **เฉพาะสถานที่ที่ไปเที่ยวได้** (`category <> 'transport'`) ไม่ใช่นับแถวดิบ
 *
 * ## รายชื่อประเทศมาจาก **นิยาม ไม่ใช่ลิสต์ที่คนพิมพ์**
 * = ทุกแถวใน `catalog_countries` ที่ **`supported = true`** (คอลัมน์จาก `20260828001500`)
 * · เพิ่มประเทศใหม่ที่เปิดใช้ = **เข้าเกณฑ์นี้เองทันที** ไม่ต้องมาแก้เทสต์ (ถ้าใช้ลิสต์ที่พิมพ์ไว้
 *   ประเทศใหม่จะได้รับการยกเว้นฟรีจากการที่ไม่มีใครนึกถึง — `P-21`)
 * · 🔴 **เคยกรองด้วย "ไม่ใช่รหัสทดสอบสงวน" (`TEST_COUNTRY_CODES`) — เลิกใช้แล้ว 28 ส.ค.**
 *   denylist แบบนั้นแปลว่า **โค้ดต้องรู้จัก artifact ของชุดทดสอบ** · `supported` เป็น allowlist
 *   ที่ระบบประกาศเอง (`default false`) → **fail-safe โดยโครงสร้าง ไม่ใช่โดยความขยันจด**
 *   ⚠️ ทะเบียนรหัสสงวนยังมีอยู่และยังจำเป็น — **แต่สำหรับกันบล็อกเทสต์ชนกันเท่านั้น**
 *   ไม่ใช่สำหรับตัดสินว่าผู้ใช้เห็นอะไร · **อย่าดึงมันกลับมาที่นี่**
 *
 * ## ⚠️ สิ่งที่เคสนี้ **ไม่** พิสูจน์
 * · ไม่ได้บอกว่าสถานที่ที่มี **ดีพอ/ครบ/ถูกต้อง** — บอกแค่ว่า *ไม่ว่าง*
 * · ไม่ได้ตรวจว่า UI แสดงมันได้จริง (นั่นต้องเปิดดู) · **เขียวที่นี่ = "มีของให้แสดง" เท่านั้น**
 */

const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const hasCreds = Boolean(SERVICE && URL_);

/** สถานที่ประเภทนี้คือ *ทางผ่าน* ไม่ใช่ *ที่เที่ยว* — มีอย่างเดียวแปลว่าไปถึงได้แต่ไม่มีอะไรทำ */
const TRANSIT_ONLY = "transport";

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "catalog coverage", ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe.runIf(hasCreds)("E4 — คลังของประเทศที่ประกาศรองรับ ต้องไม่ว่าง", () => {
  async function survey() {
    const admin = testClient(SERVICE);
    // 🔴 **แหล่งความจริงเดียวคือคอลัมน์ `supported`** (`20260828001500` · P1) — ไม่ใช่ "ไม่ใช่รหัสสงวน" อีกแล้ว
    //    เดิมกรองด้วย denylist ของรหัสทดสอบ ซึ่งแปลว่า **โค้ดต้องรู้จัก artifact ของชุดทดสอบ**
    //    · `supported` เป็น allowlist ที่ระบบประกาศเอง (`default false`) → ของใหม่ไม่หลุดออกไปเอง
    //      = **fail-safe โดยโครงสร้าง ไม่ใช่โดยความขยันจด**
    //    ⚠️ ทะเบียนรหัสสงวนยังมีที่ของมัน — สำหรับกัน**บล็อกเทสต์ชนกัน** ไม่ใช่ตัดสินว่าผู้ใช้เห็นอะไร
    const co = await admin.from("catalog_countries").select("id,name_th").eq("supported", true);
    if (co.error) throw new Error(`อ่าน catalog_countries: ${co.error.message}`);
    const supported = ((co.data ?? []) as { id: string; name_th: string }[])
      .sort((a, b) => (a.id < b.id ? -1 : 1));

    const out: {
      id: string;
      nameTh: string;
      cities: number;
      visitable: number;
      transit: number;
      deadEnds: string[];
    }[] = [];
    for (const c of supported) {
      const ci = await admin.from("catalog_cities").select("id,legacy_slug").eq("country_id", c.id);
      if (ci.error) throw new Error(`อ่านเมืองของ ${c.id}: ${ci.error.message}`);
      const cities = (ci.data ?? []) as { id: string; legacy_slug: string | null }[];
      const cityIds = cities.map((x) => x.id);
      let visitable = 0;
      let transit = 0;
      const visitableByCity = new Map<string, number>();
      if (cityIds.length) {
        const pl = await admin.from("catalog_places").select("city_id,category").in("city_id", cityIds);
        if (pl.error) throw new Error(`อ่านสถานที่ของ ${c.id}: ${pl.error.message}`);
        for (const p of (pl.data ?? []) as { city_id: string; category: string }[]) {
          if (p.category === TRANSIT_ONLY) {
            transit += 1;
            continue;
          }
          visitable += 1;
          visitableByCity.set(p.city_id, (visitableByCity.get(p.city_id) ?? 0) + 1);
        }
      }
      // 🔴 เมือง "ทางตัน" = ผู้ใช้เลือกเมืองนี้ได้ แต่กดเข้าไปแล้วไม่มีอะไรให้เพิ่ม
      const deadEnds = cities
        .filter((x) => (visitableByCity.get(x.id) ?? 0) === 0)
        .map((x) => x.legacy_slug ?? x.id)
        .sort();
      out.push({ id: c.id, nameTh: c.name_th, cities: cityIds.length, visitable, transit, deadEnds });
    }
    return out;
  }

  it("positive control — ตัวสำรวจเห็นประเทศจริง และเห็นสถานที่จริงอย่างน้อยหนึ่งประเทศ", async () => {
    const rows = await survey();
    // 🔴 ถ้าตัวกรองพัง/creds ผิด รายการจะว่าง แล้วเคสข้างล่างจะเขียวเพราะไม่มีอะไรให้ตรวจ (P-21)
    expect(rows.length, "ไม่เห็นประเทศ supported เลย — ตัวกรองหรือ creds พัง").toBeGreaterThan(0);
    // 🔴 กันเขียวด้วย "ศูนย์ประเทศ" ตอนสลับแหล่งความจริง — เคยเขียวด้วย 4 ประเทศ
    //    ต้องไม่กลายเป็นเขียวด้วย 0 เงียบ ๆ · เป็น **พื้น ไม่ใช่เพดาน**: ประเทศที่ 5 เพิ่มได้ ผ่านเหมือนเดิม
    //    แต่ถอด 4 ตัวนี้ออกเมื่อไหร่ = ของที่ผู้ใช้ใช้อยู่หายไป ต้องแดง
    for (const must of ["jp", "kr", "th", "vn"]) {
      expect(
        rows.map((r) => r.id),
        `ประเทศ '${must}' ไม่ได้ supported=true — ผู้ใช้เลือกจุดหมายประเทศนี้ไม่ได้แล้ว`,
      ).toContain(must);
    }
    expect(
      rows.some((r) => r.visitable > 0),
      "ไม่มีประเทศไหนมีสถานที่เที่ยวเลยสักแห่ง — น่าจะเป็นตัวนับพัง ไม่ใช่คลังว่างทั้งใบ",
    ).toBe(true);
    console.warn(
      "\n📊 คลังต่อประเทศ (supported = true):\n" +
        rows
          .map(
            (r) =>
              `    ${r.id} ${r.nameTh}: เมือง ${r.cities} · เที่ยวได้ ${r.visitable} · ทางผ่าน ${r.transit}` +
              (r.deadEnds.length ? ` · 🔴 เมืองทางตัน ${r.deadEnds.length}: ${r.deadEnds.join(", ")}` : ""),
          )
          .join("\n") +
        "\n",
    );
  });

  it("🔴 ทุกประเทศที่อยู่ในคลัง ต้องมีสถานที่ *ที่ไปเที่ยวได้* อย่างน้อย 1 แห่ง (ไม่ใช่มีแต่สนามบิน/สถานี)", async () => {
    const rows = await survey();
    const empty = rows
      .filter((r) => r.visitable === 0)
      .map((r) => `${r.id} (${r.nameTh}): เมือง ${r.cities} · เที่ยวได้ 0 · ทางผ่าน ${r.transit}`);
    expect(
      empty,
      "ประเทศที่ประกาศรองรับ (มีแถวใน catalog_countries) แต่ **ไม่มีสถานที่ให้เที่ยวเลย**\n" +
        "  🔴 ผู้ใช้สร้างทริปได้ · เลือกวันได้ · แล้วกด 'เพิ่มสถานที่' เจอหน้าว่าง\n" +
        "  ⚠️ ตัวเลข 'ทางผ่าน' ที่ไม่ใช่ศูนย์ทำให้มันดูเหมือนมีข้อมูล — นั่นคือสิ่งที่เคสนี้มีไว้จับ\n" +
        "  → seed สถานที่ของประเทศนั้น หรือถ้ายังไม่พร้อมรองรับ ก็ยังไม่ควรมีแถวใน catalog_countries",
    ).toEqual([]);
  });

  /**
   * 🔴 **เกณฑ์รายประเทศเขียวได้ทั้งที่รูเปิด — P1 เจอ 27 ส.ค.**
   * เวียดนามมีสถานที่ 10 แห่ง จึง *"ดูมีของ"* · **แต่ทั้ง 10 อยู่ฮานอยหมด → โฮจิมินห์ว่างเปล่า**
   * · *"เวียดนามมีสถานที่ไหม"* → มี · *"เมืองไหนกดเข้าไปว่าง"* → hcmc
   * 🎯 **ผู้ใช้เลือก *เมือง* ไม่ได้เลือก *ประเทศ*** — ตัวเลขระดับประเทศจึงกลบทางตันรายเมืองได้ทั้งแถบ
   *    รูปเดียวกับ 766 แถวที่ 694 เป็น fixture: **การรวมยอดซ่อนช่องที่เปิดอยู่**
   * ⚠️ บล็อกยืนยันใน migration ตรวจแค่ *ตอนรัน* ครั้งเดียว — เมืองที่ใครเพิ่มทีหลังโดยไม่ใส่สถานที่
   *    ไม่มีอะไรฟ้อง · **เคสนี้คือด่านถาวรของข้อนั้น**
   */
  it("🔴 ทุกเมืองในประเทศที่รองรับ ต้องไม่เป็น 'ทางตัน' — เลือกเมืองได้แต่ไม่มีอะไรให้เพิ่ม", async () => {
    const rows = await survey();
    const dead = rows
      .filter((r) => r.deadEnds.length > 0)
      .map((r) => `${r.id}: ${r.deadEnds.length}/${r.cities} เมือง → ${r.deadEnds.join(", ")}`);
    expect(
      dead,
      "มีเมืองที่ผู้ใช้เลือกได้ แต่ไม่มีสถานที่ให้เพิ่มเลยสักแห่ง (นับเฉพาะที่ไม่ใช่ทางผ่าน)\n" +
        "  🔴 **ยอดรวมระดับประเทศกลบข้อนี้ได้** — ประเทศมีสถานที่ครบ แต่กระจุกอยู่เมืองเดียว\n" +
        "  → seed สถานที่ให้เมืองนั้น หรือถ้ายังไม่พร้อม ก็ยังไม่ควรมีแถวใน catalog_cities",
    ).toEqual([]);
  });

  /**
   * 🔴 **`browseCatalogPlaces()` ต้องไม่คืนสนามบิน/สถานี** — วัด *พฤติกรรมของฟังก์ชัน* ไม่ใช่ค่าธงในตาราง
   *
   * ## ประวัติของเคสนี้ — ฉบับแรกของผม **บังคับกฎที่ผิด** (P1 จับได้ · 27 ส.ค. 2026)
   * ผมเคยเขียนว่า *"แถว `source='transfer'` ต้อง `picker_hidden = true` ทุกแถว"* แล้วรายงานว่ามี 25 แถวผิด
   * · ผมอ่านความหมายของ `picker_hidden` จาก **docstring ของ `browseCatalogPlaces()`** แทนที่จะอ่าน
   *   **นิยามที่ต้นทาง** (`data/transferPoints.ts:25-28`) ซึ่งเขียนไว้ชัดว่า:
   *   > *"true = ไม่ต้องโผล่ในลิสต์ให้เลือกของ modal **'✈️ ไปสนามบิน/สถานี'** … เช่นสนามบิน
   *   >  ต้นทาง/ต่อเครื่องนอกเกาหลี ซึ่งไม่มีวันไหนในทริปนี้ต้องแทรกแถว 'ไปสนามบิน' ไปหา"*
   * 🎯 **`airport-pus` เป็น `false` เพราะผู้ใช้ *ต้องการ* เลือก "ไปสนามบินกิมแฮ" ในโมดัลนั้น**
   *   → กลับเป็น `true` ทั้ง 25 แถวตามที่ผมเสนอ = **โมดัล "ไปสนามบิน/สถานี" ว่างเปล่า**
   *   = ยัดความหมายที่สองลงคอลัมน์เดิม แล้วความหมายแรกตายเงียบ — **ตระกูลเดียวกับที่ผมเคยค้าน
   *     ตอนจะเติมแถวเข้า `read_only_selftest()` ให้ `blocked` แปลว่าคนละอย่างตามแถว** · คอลัมน์หนึ่งตอบคำถามเดียว
   *
   * ## บทเรียนที่ทำให้เคสนี้เปลี่ยนรูป
   * ของที่ผิดคือ **`browseCatalogPlaces()` กรองผิดคอลัมน์** (P1 แก้ที่ `06aa86b` — เพิ่ม `.neq("source","transfer")`)
   * 🔴 **ด่านจึงต้องวัดสิ่งที่ฟังก์ชัน *คืนออกมา* ไม่ใช่ค่าธงที่มันบังเอิญใช้** — ธงเป็นรายละเอียดการทำงาน
   *    เปลี่ยนได้ · สัญญาที่ผู้ใช้เห็นคือ *"ลิสต์คลังที่เที่ยวต้องไม่มีสนามบิน"*
   *
   * ## ⚠️ ขอบเขต — **เปลี่ยนแล้ว 28 ส.ค.: ตอนนี้มีผู้เรียกจริงแล้ว**
   * เดิมจดไว้ว่า *"`browseCatalogPlaces()` ไม่มีผู้เรียกจากโค้ดแอปเลย → ด่านนี้รอ `B6`"*
   * · 🔴 **`app/api/engine/places/route.ts` (P1) คือผู้เรียกตัวแรก** — `GET ?cityId=` → `browseCatalogPlaces()`
   *   → **ด่านนี้เลิกเป็นของที่รอไว้ก่อน มันคุ้ม route ที่ส่งของให้ผู้ใช้อยู่จริงแล้ว**
   * · ที่ยังไม่เกิดกับผู้ใช้เพราะ P1 ปิดรูไว้ก่อน (`06aa86b` เพิ่ม `.neq("source","transfer")`)
   *   **ไม่ใช่เพราะไม่มีใครเรียก** — สองเหตุผลนี้ต่างกัน และเหตุผลที่สองหมดอายุไปแล้ว
   * ⚠️ ไซด์บาร์เดิมยังอ่าน `data/places.ts` สถิตย์อยู่ (`B6` ยังไม่ทำ) — แต่ **นั่นไม่ใช่เส้นเดียวอีกต่อไป**
   */
  it("🔴 browseCatalogPlaces() ต้องไม่คืนแถว source='transfer' — คลังที่เที่ยวไม่ใช่ที่รวมสนามบิน", async () => {
    const admin = testClient(SERVICE);
    // ยิงผ่านฟังก์ชันจริงที่แอปจะใช้ (B6) — ไม่ใช่ประกอบ query เองในเทสต์ ซึ่งจะวัดคนละอย่างกับของจริง
    const { data, error } = await browseCatalogPlaces(admin as never, { limit: 1000 });
    if (error) throw new Error(`browseCatalogPlaces: ${error.message}`);
    const rows = (data ?? []) as { legacy_slug: string | null; source: string | null }[];
    // positive control ① — คืนศูนย์แถวแล้วเคสข้างล่างจะเขียวโดยไม่ได้ตรวจอะไร (P-21)
    expect(rows.length, "browse ไม่คืนอะไรเลย — ตัวกรองพังหรือคลังว่าง ไม่ใช่ 'ไม่มีสนามบินปน'").toBeGreaterThan(0);
    // positive control ② — **ต้องมีแถว transfer อยู่จริงในตาราง ไม่งั้นตัวกรองไม่ได้ทำงานอะไรเลย**
    //    ถ้าวันหนึ่งไม่มีสนามบินในคลังเลย เคสนี้จะ "ผ่าน" โดยไม่เคยพิสูจน์ว่ากรองได้ — เซตว่างอีกรูป
    const inTable = await admin.from("catalog_places").select("id", { count: "exact", head: true }).eq("source", "transfer");
    expect(
      inTable.count ?? 0,
      "ไม่มีแถว source='transfer' ในตารางเลย — เคสข้างล่างจะเขียวเพราะไม่มีอะไรให้กรอง ไม่ใช่เพราะกรองได้",
    ).toBeGreaterThan(0);
    const leaked = rows.filter((r) => r.source === "transfer").map((r) => r.legacy_slug ?? "(ไม่มี slug)").sort();
    expect(
      leaked,
      "คลัง 'ที่เที่ยว' คืนสนามบิน/สถานีออกมาด้วย\n" +
        "  🔴 ผู้ใช้จะเห็นสนามบินปนในลิสต์เพิ่มสถานที่ทันทีที่ `B6` ย้ายไซด์บาร์มาใช้ฟังก์ชันนี้\n" +
        "  ⚠️ **ทางแก้ไม่ใช่กลับค่า `picker_hidden`** — ธงนั้นคุมโมดัล 'ไปสนามบิน/สถานี' คนละเรื่องกัน\n" +
        "  → กรองที่ `browseCatalogPlaces()` ด้วย `source` (ดู `lib/engine/db.ts`)",
    ).toEqual([]);
  });
});

/**
 * `E4` — ช่องค้นเมืองปลายทางต้องไม่คืน fixture ของชุดทดสอบ · เจ้าของ: P4 (28 ส.ค. 2026)
 *
 * ก่อนแก้ (`968ced0`): เมืองในฐาน 1,736 · **ที่ผู้ใช้ค้นเจอได้ 1,694 เป็น fixture (98%)**
 * `q="อ"` คืน *"เมืองC"* จากประเทศ *"ทดสอบสาม"* · แก้ด้วย `catalog_countries!inner` + `supported`
 *
 * ## 🔴 ทำไมต้องมี 4 assert ไม่ใช่ 1
 * ท่าที่ตรงที่สุด (P2) คือค้น**คำที่เจาะจง fixture ล้วน** แล้วคาดหวัง **0 แถว** — เจาะจงดีมาก
 * **แต่ `0 แถว` คือสิ่งที่จะได้เหมือนกันเป๊ะถ้า `searchCatalogCities()` พังทั้งฟังก์ชัน**
 * 🎯 **กับดักเซตว่างในฝั่งที่ *ศูนย์คือคำตอบที่ถูกต้อง*** — ไม่มีอะไรสะดุดตาเลย เพราะผลที่ได้คือผลที่หวัง
 * · P2 รู้ว่าฟังก์ชันยังทำงานเพราะเขาค้นคำอื่นในรอบเดียวกัน — **แต่ความรู้นั้นอยู่ในหัว ไม่ได้อยู่ในหลักฐาน**
 *   พอกลายเป็นเคสอัตโนมัติ มันหายไปถ้าไม่เขียนลงไป → `control` ข้างล่างคือการเขียนมันลงไป
 */
describe.runIf(hasCreds)("E4 — ค้นเมืองปลายทาง: fixture ต้องไม่โผล่ให้ผู้ใช้เห็น", () => {
  type CityRow = {
    id: string;
    country_id: string;
    name_th: string;
    catalog_countries: { id: string; name_th: string } | null;
  };
  /**
   * 🔴 **ปลูก fixture ของเคสนี้เอง — ก่อน 3 ก.ย. 2026 เคสนี้ *ยืม* ของที่ไฟล์อื่นทิ้งค้าง**
   *
   * control ข้างล่างทำนายไว้เองว่า *"ถ้าวันหนึ่ง fixture ถูกกวาดหมด เคสนี้จะเตือน"*
   * · แล้วมันเกิดจริงทันทีที่ `catalogFixtureSweep` เริ่มกวาดตอนจบรอบ (3 ก.ย. 2026)
   *   **แดงสองเคส**: *"ไม่มีเมืองชื่อตรง เมืองC"* และ *"ไม่มีประเทศ supported=false เลย"*
   * 🎯 ***เคสควบคุมที่พึ่งของที่คนอื่นทิ้งไว้ ไม่ใช่เคสควบคุม — มันคือการยืมสภาพแวดล้อม***
   *    และมันพังในวันที่มีคนทำความสะอาด **ซึ่งเป็นวันที่ทุกอย่างกำลังถูกทำให้ถูกต้องขึ้น**
   *
   * ⚠️ ประเทศที่ปลูกต้อง `supported = false` — นั่นคือสิ่งที่ `searchCatalogCities` กรองออก
   *    ถ้าเผลอตั้ง `true` เคส ① จะแดงด้วยเหตุผลที่ถูกต้อง (fixture โผล่ในผลค้นจริง)
   */
  const CC = TEST_COUNTRY_CODES.catalogSearch;
  const CITY_NAMES = ["เมืองC", "เมืองS"];

  beforeAll(async () => {
    const admin = testClient(SERVICE);
    await admin.from("catalog_countries").upsert(
      { id: CC, name_th: "ทดสอบค้นเมือง", name_en: "Search Fixture", supported: false },
      { onConflict: "id" },
    );
    for (const name_th of CITY_NAMES) {
      await admin.from("catalog_cities").insert({
        country_id: CC, name_th, name_en: name_th, lat: 1, lng: 1, timezone: "UTC",
      });
    }
  });

  afterAll(async () => {
    // 🔴 เก็บของตัวเอง **ไม่ฝากไว้กับ `catalogFixtureSweep`** — ตัวกวาดคือตาข่ายรับ
    //    ไม่ใช่ทางเก็บหลัก · ฝากไว้เมื่อไหร่ ก็กลับไปเป็นการยืมสภาพแวดล้อมอีกใบ
    const admin = testClient(SERVICE);
    await admin.from("catalog_cities").delete().eq("country_id", CC);
    await admin.from("catalog_countries").delete().eq("id", CC);
  });

  const search = async (q: string) => {
    const admin = testClient(SERVICE);
    const { data, error } = await searchCatalogCities(admin as never, { q, limit: 200 });
    if (error) throw new Error(`searchCatalogCities("${q}"): ${error.message}`);
    return (data ?? []) as unknown as CityRow[];
  };

  it("🔴 ① คำที่เจาะจง fixture ล้วน ต้องคืน 0 แถว — ข้อพิสูจน์ว่าตัวกรองติด", async () => {
    const admin = testClient(SERVICE);
    // 🔴 **คำที่ใช้ต้องตรงกับ *ชื่อเมือง* เท่านั้น** — `searchCatalogCities` `.or()` แมตช์แค่
    //    `name_th`/`name_en`/`name_local` ของ **เมือง** · ไม่แมตช์ชื่อประเทศเลย
    //    ⚠️ ดังนั้นคำว่า `"ทดสอบ"` (ชื่อ*ประเทศ* fixture) คืน 0 แถว **ไม่ว่าตัวกรองจะมีหรือไม่มี**
    //       = คำที่พิสูจน์อะไรไม่ได้เลย · control ข้างล่างจับข้อนี้ได้ตอนผมเผลอใช้มันเอง
    for (const q of ["เมืองC", "เมืองS"]) {
      // 🔴 control ของเคสนี้เอง: **ต้องมีเมืองที่ชื่อตรงคำนี้อยู่จริงในตาราง**
      //    ไม่งั้น "ค้นแล้วได้ 0" แปลว่า *ไม่มีอะไรให้เจอตั้งแต่แรก* ไม่ใช่ *กรองได้*
      //    (ถ้าวันหนึ่ง fixture ถูกกวาดหมด เคสนี้จะเตือนว่ามันไม่ได้ตรวจอะไรแล้ว แทนที่จะเขียวเงียบ)
      const raw = await admin.from("catalog_cities").select("id", { count: "exact", head: true }).ilike("name_th", `%${q}%`);
      if (raw.error) throw new Error(`นับเมืองที่ชื่อตรง "${q}": ${raw.error.message}`);
      expect(
        raw.count ?? 0,
        `ไม่มีเมืองชื่อตรง "${q}" ในตารางเลย — เคสนี้จะเขียวเพราะไม่มีอะไรให้กรอง ไม่ใช่เพราะกรองได้`,
      ).toBeGreaterThan(0);

      const rows = await search(q);
      expect(
        rows.map((r) => `${r.name_th}/${r.country_id}`),
        `ค้น "${q}" แล้วยังเจอ fixture — ตัวกรอง supported ไม่ติด (ผู้ใช้เห็นเมืองของชุดทดสอบ)`,
      ).toEqual([]);
    }
  });

  it("🔴 ② control ในรอบเดียวกัน: คำที่ต้องเจอของจริง ต้องคืน > 0 — พิสูจน์ว่า '0 แถว' ข้างบนมาจากการกรอง ไม่ใช่ฟังก์ชันพัง", async () => {
    // ⚠️ **ข้อนี้คือสิ่งที่ทำให้เคส ① มีความหมาย** — ถ้า searchCatalogCities พังทั้งตัว ① จะเขียวเหมือนกันเป๊ะ
    const rows = await search("โอซากะ");
    expect(
      rows.length,
      "ค้นเมืองจริงแล้วไม่เจอเลย — ฟังก์ชันค้นพัง · แปลว่าเคส '0 แถว' ข้างบนไม่ได้พิสูจน์อะไร",
    ).toBeGreaterThan(0);
  });

  it("🔴 ③ ทุกแถวที่คืนมาต้องมี catalog_countries ไม่เป็น null — กัน `!inner` หลุดแล้วเงียบ", async () => {
    // 🎯 ถ้ามีคนถอด `!inner` ออก PostgREST จะคืนแถวโดยให้ embed เป็น `null`
    //    → แถวพวกนั้น **ไม่มี `supported` ให้เช็ค จึงผ่านเคส ④ ได้ทั้งดุ้น** · รูที่ต้องปิดแยก (P1 ชี้)
    const rows = await search("อ");
    expect(rows.length, "ไม่มีแถวให้ตรวจ — ดูเคส ② ก่อน").toBeGreaterThan(0);
    const nullEmbed = rows.filter((r) => r.catalog_countries === null).map((r) => r.name_th);
    expect(
      nullEmbed,
      "มีแถวที่ embed ประเทศเป็น null = `!inner` หายไปแล้ว · ตัวกรอง supported ไม่มีผลกับแถวพวกนี้",
    ).toEqual([]);
  });

  it("🔴 ④ เส้นทางจริงของผู้ใช้: ค้นคำปนกัน ต้องมีผล และต้องไม่มีประเทศที่ปิดสักแถว", async () => {
    const admin = testClient(SERVICE);
    const off = await admin.from("catalog_countries").select("id").eq("supported", false);
    if (off.error) throw new Error(`อ่านประเทศที่ปิด: ${off.error.message}`);
    const offIds = new Set(((off.data ?? []) as { id: string }[]).map((c) => c.id));
    // control: ต้องมีประเทศที่ปิดอยู่จริง ไม่งั้นเคสนี้ไม่ได้กรองอะไรเลย
    expect(offIds.size, "ไม่มีประเทศ supported=false เลย — เคสนี้จะเขียวเพราะไม่มีอะไรให้กัน").toBeGreaterThan(0);

    const rows = await search("อ");
    expect(rows.length, "ค้น 'อ' ไม่เจออะไรเลย — เคยเจอ 1,736 แถว").toBeGreaterThan(0);
    const leaked = rows.filter((r) => offIds.has(r.country_id)).map((r) => `${r.name_th}/${r.country_id}`);
    expect(
      leaked,
      "ค้นแบบปกติแล้วเจอเมืองของประเทศที่ปิดอยู่ — เส้นทางที่ผู้ใช้เดินจริงยังรั่ว",
    ).toEqual([]);
  });
});
