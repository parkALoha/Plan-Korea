import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { testClient } from "./_testClient";

/**
 * **ยิงทิศแดงใส่ `public.assert_cache_lockdown()` — ด่านที่เคยมีแต่พิน**
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมไฟล์นี้ต้องมี
 * ไล่ด่านฝั่งฐานทั้ง 10 ตัวแล้ว (4 ก.ย. 2026) — **9 ตัวมีเทสต์ที่ทำสิ่งต้องห้ามจริงแล้วคาดหวังว่าล้ม**
 * (`assert_day_has_no_stops` มีทั้งทิศลบและทิศบวก · `assert_trip_has_plan` · `assert_place_not_in_use` ·
 *  `assert_trip_has_owner` · `read_only_*` · ฯลฯ)
 * · 🔴 **`assert_cache_keys_in_catalog` (ข้อ ⑥ ของ `assert_cache_lockdown`) เป็นตัวเดียวที่ไม่มี**
 *   มันถูก **พิน** ใน `schemaPins` ว่ามีอยู่ และถูก *เรียก* ใน `cache-warm.yml` (ซึ่งรันไม่ได้เพราะ
 *   default branch ไม่มี `.github/`) ⇒ **ไม่เคยมีอะไรพิสูจน์ว่ามันจับการละเมิดได้**
 * 🎯 ตรงกับเกณฑ์ของทีมเอง: ***"ด่านที่ยังไม่พิสูจน์ว่าแดงเป็น ไม่ใช่ด่าน"***
 *
 * ## ⚠️ ทำไมต้องระวังเป็นพิเศษ — ต่างจากทิศแดงฝั่งโค้ด
 * มัลแตนต์ของไฟล์นี้คือ **แถวจริงในฐานที่ใช้ร่วมกัน** · ถ้ามันค้าง
 * **`assert_cache_lockdown` จะแดงใส่ทุกคนใน CI** โดยที่ไม่มีใครรู้ว่ามาจากเทสต์นี้
 * · ✅ **กันสามชั้น:** ① ล้างของค้างก่อนเริ่ม (เผื่อรอบก่อนถูกฆ่ากลางคัน)
 *   ② `finally` ลบทันทีแม้ assertion ล้ม · ③ `afterAll` กวาดซ้ำ
 * · 🔴 **คีย์ใช้ prefix `__redprobe__` ที่ไม่มีวันเป็นคีย์จริง** — คลังไม่มีทางมี `maps_query` แบบนี้
 */
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const hasCreds = Boolean(SERVICE && URL_);

/** 🔴 prefix นี้ต้องไม่มีวันชนคีย์จริง — คลังเก็บ `maps_query` เป็นชื่อสถานที่หรือ `place_id:…` */
const PROBE = "__redprobe__cacheLockdown__";

requireLiveCreds(hasCreds, "cache lockdown red probe", [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

describe.runIf(hasCreds)("assert_cache_lockdown — ต้องแดงเมื่อมีคีย์นอกคลัง", () => {
  /**
   * 🔴 **สร้าง client ในตัวเคส ไม่ใช่ในตัว `describe`** — `describe.runIf(false)` **ยังรัน body อยู่ดี**
   * มันคุมว่า *เคส* จะถูกรันไหม ไม่ได้คุมว่า *body* จะถูกประเมินไหม (body ต้องรันเพื่อลงทะเบียนเคส)
   * → `testClient("")` ตอน collect ⇒ `Error: supabaseUrl is required` ⇒ **ทั้งไฟล์ล้มตั้งแต่ collect**
   *
   * ⚠️ **และมันล้มเฉพาะที่ที่ไม่มี creds ซึ่งคือ job `verify` ของ CI พอดี** (ตั้งใจไม่ให้มี `service_role`)
   * บนเครื่องที่มี `.env.local` มันเขียวเสมอ — **ผมจึงไม่เห็นมันเลยจนรันแบบไม่มี creds ในหมุด** (P1 · 4 ก.ย. 2026)
   * 🎯 ***สนามที่สะดวกกว่า ปิดบั๊กที่เกิดเฉพาะในสนามที่ขัดสนกว่า*** — และรายงานผลว่า "ผ่าน" เหมือนกันเป๊ะ
   *
   * 📌 เป็นสำนวนเดียวกับที่ `cacheHeartbeat.test.ts` ใช้อยู่แล้ว (สร้าง client ในแต่ละ `it`)
   */
  const admin = () => testClient(SERVICE);
  const sweep = async () => {
    await admin().from("place_details_cache").delete().like("maps_query", `${PROBE}%`);
    await sweepTravel();
  };
  /**
   * 🔴 กวาดด้วย **prefix ของ UUID โพรบ** ไม่ใช่ด้วยคีย์ทั่วไป
   * 🎯 ***ตัวกวาดต้องแยกของตัวเองออกจากของจริงได้ ไม่ใช่แค่ลบสิ่งที่ตรงกับสิ่งที่เพิ่งใส่***
   * — ตารางนี้มีแถวจริง 57 แถว การกวาดที่กว้างไปจะลบแคชของคนอื่น
   */
  const sweepTravel = async () => {
    await admin().from("travel_time_cache").delete().like("from_place_id", "00000000-dead-%");
  };

  // ① เผื่อรอบก่อนถูกฆ่ากลางคัน — เริ่มจากสภาพสะอาดเสมอ
  beforeAll(sweep);
  // ③ กวาดซ้ำ ไม่ว่าจะเกิดอะไรขึ้น
  afterAll(sweep);

  /**
   * ⚠️ **ทิศบวกต้องมาก่อน** — ถ้าสภาพจริงแดงอยู่แล้ว ทิศแดงข้างล่างพิสูจน์อะไรไม่ได้
   * 🔴 และถ้าเคสนี้แดง **แปลว่ามีของค้างในฐานจริง ไม่ใช่เทสต์พัง** — ไปหาว่าใครทิ้งไว้
   */
  it("① ทิศบวก — สภาพฐานปัจจุบันต้องผ่าน", async () => {
    const { error } = await admin().rpc("assert_cache_lockdown");
    expect(
      error?.message ?? null,
      "ฐานมีการละเมิด cache lockdown อยู่แล้ว — ทิศแดงข้างล่างจะพิสูจน์อะไรไม่ได้",
    ).toBeNull();
  });

  /**
   * 🔴 **ใบที่ทำให้ด่านนี้เป็นด่านจริง** — ก่อนหน้านี้มีแต่พินว่า *ฟังก์ชันมีอยู่*
   */
  it("② ทิศแดง — ยัดคีย์ที่ไม่อยู่ในคลัง แล้วด่านต้อง raise", async () => {
    const key = `${PROBE}${Date.now()}`;
    const ins = await admin()
      .from("place_details_cache")
      .insert({ maps_query: key, fetched_at: new Date().toISOString() });
    // 🔴 มัลแตนต์ต้องลงจริง ไม่งั้นผลลบข้างล่างไม่มีความหมาย (`TEAM.md` — ทิศแดงที่ no-op เงียบ)
    expect(ins.error?.message ?? null, "แทรกแถวโพรบไม่สำเร็จ — ทิศแดงนี้จะไม่ได้ทดสอบอะไร").toBeNull();

    try {
      const { error } = await admin().rpc("assert_cache_lockdown");
      expect(error, "ด่านไม่ raise ทั้งที่มีคีย์นอกคลัง — **ด่านมองไม่เห็นการละเมิด**").not.toBeNull();
      // ข้อความต้องบอกว่าไปดูที่ไหน ไม่ใช่แค่ว่าผิด
      expect(
        error?.message ?? "",
        "ข้อความ error ไม่ได้ระบุตาราง — คนที่เจอมันแดงจะไม่รู้ว่าต้องไปลบอะไร",
      ).toContain("place_details_cache");
    } finally {
      // ② ลบทันทีแม้ assertion ล้ม — ของค้างจะทำให้ CI แดงใส่ทุกคน
      await sweep();
    }
  });

  /**
   * 🔴 **`E3-AC6` — กิ่งที่ `backlog.md` เขียนไว้เองว่าด่านสคีมาจับไม่ได้**
   *
   * ## รูที่ AC ระบุ (คำต่อคำ)
   * `travel_time_cache.from_place_id`/`to_place_id` เป็น **`text` ธรรมดา** ⇒ สคีมาพิสูจน์ไม่ได้ว่า
   * ค่าจะไม่ใช่ `custom_places.id` (UUID ที่ผูกทริป) · ถ้าโค้ดในอนาคตใส่ลงไปจริง
   * **แถวแคชนั้นกลายเป็นข้อมูลของทริปหนึ่งทันที** — คนนอกทริปอ่านเวลาเดินทางแล้ว
   * triangulate พิกัดสถานที่ส่วนตัวได้ · **และด่านสคีมายังเขียวอยู่** (คอลัมน์ไม่มีคำว่า `trip` ไม่มี FK)
   *
   * ## ทำไมเคสนี้ปิดมันได้ ทั้งที่ด่านสคีมาปิดไม่ได้
   * `app.assert_cache_keys_in_catalog()` (migration `20260903220000` บรรทัด 57-63) ไม่ได้ถามเรื่อง *ชนิด*
   * มันถามว่า **ปลายทางทั้งสองฝั่งเป็น `legacy_slug` ของ `catalog_places` หรือเปล่า**
   * ⇒ UUID ของ custom place **ไม่มีทางแมตช์** ⇒ ด่าน raise
   * 🎯 ***ด่านสคีมาถามว่า "คอลัมน์หน้าตายังไง" · ด่านนี้ถามว่า "ค่าในนั้นเป็นของใคร" — คนละคำถาม***
   *
   * ⚠️ **ขอบเขต: นี่ไม่ใช่เทสต์ A/B ตามถ้อยคำเดิมของ `AC6`** (A อุ่นแคช → B ไม่ใช่สมาชิกเปิดแล้วต้องไม่ได้)
   * มันปิด **กลไก**ที่ทำให้สถานการณ์นั้นเกิดได้ · **ห้ามติ๊กปิด `AC6` จากไฟล์นี้เอง — ส่ง P8 ตัดสิน**
   */
  it("④ ทิศแดง `travel_time_cache` — UUID รูป custom place ที่ปลายทาง ด่านต้อง raise", async () => {
    // 🔴 ต้องเป็น **UUID** ไม่ใช่สตริงมั่ว — รูปของ `custom_places.id` คือสิ่งที่ AC บรรยาย
    //    สตริงมั่วจะพิสูจน์แค่ "ด่านจับของแปลก" ซึ่งเป็นคำถามที่อ่อนกว่า
    const fakeCustomPlaceId = "00000000-dead-4bee-8000-0000000c0ffe";
    const ins = await admin().from("travel_time_cache").insert({
      from_place_id: fakeCustomPlaceId,
      to_place_id: fakeCustomPlaceId,
      travel_mode: "drive",
      duration_minutes: 1,
      fetched_at: new Date().toISOString(),
    });
    expect(ins.error?.message ?? null, "แทรกแถวโพรบไม่สำเร็จ — ทิศแดงนี้จะไม่ได้ทดสอบอะไร").toBeNull();

    try {
      const { error } = await admin().rpc("assert_cache_lockdown");
      expect(
        error,
        "ด่านไม่ raise ทั้งที่ปลายทางเป็น UUID ที่ไม่อยู่ในคลัง — **นี่คือรูที่ `E3-AC6` ระบุไว้เป๊ะ**",
      ).not.toBeNull();
      expect(
        error?.message ?? "",
        "ข้อความ error ไม่ได้ระบุตาราง — คนที่เจอมันแดงจะไม่รู้ว่าต้องไปลบอะไร",
      ).toContain("travel_time_cache");
    } finally {
      await sweepTravel();
    }
  });

  /**
   * 🔴 **เคสคัดแยก — ถ้าไม่มีใบนี้ เคส ④ เขียวได้ด้วยด่านที่ *แดงใส่ทุกแถว* ใน `travel_time_cache`**
   *
   * 🎯 ***ฝั่งบวกอย่างเดียวพิสูจน์ได้แค่ว่าด่านดัง ไม่ได้พิสูจน์ว่ามันเลือกถูก***
   *
   * ## ทำไมเคสนี้ไม่แทรกแถวเอง (ฉบับแรกแทรก แล้วชน `CHECK`)
   * `travel_mode` มี `CHECK (travel_mode = ANY ('walk','transit','drive'))` ⇒ ใช้โหมดสงวนไม่ได้
   * และคีย์ของเคสนี้เป็น `legacy_slug` **ของจริง** ⇒ ถ้ากวาดด้วยคีย์ **จะลบแถวแคชจริงของคนอื่น**
   * · PK คือ `(from,to,mode)` ⇒ แทรกด้วยโหมดจริงก็เสี่ยงชนแถวที่มีอยู่
   * ✅ **แต่ฐานมีแถวจริงอยู่แล้ว** ⇒ ไม่ต้องแทรกอะไรเลย · **อ่านอย่างเดียว ไม่แตะของกลาง**
   *
   * ## 🔴 แล้วทำไมไม่ปล่อยให้เคส ① ทำหน้าที่นี้
   * เคส ① บอกแค่ *"สภาพปัจจุบันผ่าน"* — **มันจะผ่านเหมือนกันถ้าตารางนี้ว่างเปล่า**
   * ⇒ อำนาจแยกแยะของมันจะหายไปเงียบ ๆ วันที่ไม่มีแถว **โดยที่ผลรันไม่เปลี่ยนเลย**
   * ***เคสนี้จึงยืนยัน *เงื่อนไขที่ทำให้เคส ① มีความหมาย* ให้เห็น แทนที่จะพึ่งมันโดยไม่บอก***
   */
  it("⑤ เคสควบคุม — ฐานต้องมีแถว `travel_time_cache` ที่คีย์ถูกต้องอยู่จริง แล้วด่านยังผ่าน", async () => {
    const { count, error: cErr } = await admin()
      .from("travel_time_cache")
      .select("*", { count: "exact", head: true });
    expect(cErr?.message ?? null, "อ่าน travel_time_cache ไม่ได้").toBeNull();
    expect(
      count ?? 0,
      "ตารางว่าง — เคส ④ จะเขียวได้แม้ด่านจะแดงใส่ทุกแถว **อำนาจแยกแยะหายไปเงียบ ๆ**",
    ).toBeGreaterThan(0);

    const { error } = await admin().rpc("assert_cache_lockdown");
    expect(
      error?.message ?? null,
      `ด่าน raise ทั้งที่มี ${count} แถวที่คีย์ถูกต้อง — **ด่านกว้างเกิน จะแดงใส่คนที่ทำถูก แล้วมันจะถูกลบทั้งใบ**`,
    ).toBeNull();
  });

  /**
   * ⚠️ **เคสควบคุมฝั่งลบ** — พิสูจน์ว่าการกวาดคืนสภาพได้จริง
   * 🔴 ถ้าไม่มีเคสนี้ ไฟล์นี้อาจทิ้งของค้างแล้วไม่มีใครรู้จนกว่า CI จะแดง
   */
  it("③ หลังกวาด ด่านต้องกลับมาผ่าน", async () => {
    const { error } = await admin().rpc("assert_cache_lockdown");
    expect(error?.message ?? null, "กวาดแถวโพรบไม่หมด — ไฟล์นี้กำลังทิ้งของค้างไว้ให้คนอื่น").toBeNull();
  });
});
