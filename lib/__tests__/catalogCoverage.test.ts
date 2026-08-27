import { describe, expect, it } from "vitest";
import { readEnvKey, requireLiveCreds, TEST_COUNTRY_CODES } from "./_helpers";
import { testClient } from "./_testClient";

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
 * = ทุกแถวใน `catalog_countries` ที่ **ไม่ใช่รหัสทดสอบสงวน** (`TEST_COUNTRY_CODES`)
 * · เพิ่มประเทศใหม่เข้าคลัง = **เข้าเกณฑ์นี้เองทันที** ไม่ต้องมาแก้เทสต์ (ถ้าใช้ลิสต์ที่พิมพ์ไว้
 *   ประเทศใหม่จะได้รับการยกเว้นฟรีจากการที่ไม่มีใครนึกถึง — `P-21`)
 * · fixture ของชุดทดสอบอยู่ใต้รหัส ISO user-assigned (`z*`/`x*`) จึงถูกกรองออกตามนิยาม
 *   **ไม่ใช่กรองด้วย `source`** ซึ่งเป็น default ค่าเดียวกันทั้ง fixture และของจริง แยกไม่ได้
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
  const reserved = new Set<string>(Object.values(TEST_COUNTRY_CODES));

  async function survey() {
    const admin = testClient(SERVICE);
    const co = await admin.from("catalog_countries").select("id,name_th");
    if (co.error) throw new Error(`อ่าน catalog_countries: ${co.error.message}`);
    const supported = ((co.data ?? []) as { id: string; name_th: string }[])
      .filter((c) => !reserved.has(c.id))
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
    expect(rows.length, "ไม่เห็นประเทศที่ไม่ใช่รหัสทดสอบเลย — ตัวกรองหรือ creds พัง").toBeGreaterThan(0);
    expect(
      rows.some((r) => r.visitable > 0),
      "ไม่มีประเทศไหนมีสถานที่เที่ยวเลยสักแห่ง — น่าจะเป็นตัวนับพัง ไม่ใช่คลังว่างทั้งใบ",
    ).toBe(true);
    console.warn(
      "\n📊 คลังต่อประเทศ (ไม่รวมรหัสทดสอบ):\n" +
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
});
