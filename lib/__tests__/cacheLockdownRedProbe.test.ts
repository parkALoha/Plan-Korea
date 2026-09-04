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
  const admin = testClient(SERVICE);
  const sweep = async () => {
    await admin.from("place_details_cache").delete().like("maps_query", `${PROBE}%`);
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
    const { error } = await admin.rpc("assert_cache_lockdown");
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
    const ins = await admin
      .from("place_details_cache")
      .insert({ maps_query: key, fetched_at: new Date().toISOString() });
    // 🔴 มัลแตนต์ต้องลงจริง ไม่งั้นผลลบข้างล่างไม่มีความหมาย (`TEAM.md` — ทิศแดงที่ no-op เงียบ)
    expect(ins.error?.message ?? null, "แทรกแถวโพรบไม่สำเร็จ — ทิศแดงนี้จะไม่ได้ทดสอบอะไร").toBeNull();

    try {
      const { error } = await admin.rpc("assert_cache_lockdown");
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
   * ⚠️ **เคสควบคุมฝั่งลบ** — พิสูจน์ว่าการกวาดคืนสภาพได้จริง
   * 🔴 ถ้าไม่มีเคสนี้ ไฟล์นี้อาจทิ้งของค้างแล้วไม่มีใครรู้จนกว่า CI จะแดง
   */
  it("③ หลังกวาด ด่านต้องกลับมาผ่าน", async () => {
    const { error } = await admin.rpc("assert_cache_lockdown");
    expect(error?.message ?? null, "กวาดแถวโพรบไม่หมด — ไฟล์นี้กำลังทิ้งของค้างไว้ให้คนอื่น").toBeNull();
  });
});
