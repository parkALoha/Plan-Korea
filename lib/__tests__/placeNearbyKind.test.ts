import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `app/api/place-nearby` — **ด่าน allowlist ของ `kind`** (P1 · 27 ส.ค. 2026)
 *
 * 🔴 คอมเมนต์ในไฟล์นั้นเขียนเจตนาไว้ตรง ๆ ว่า
 * *"จำกัดไว้เป็น allowlist ฝั่งเซิร์ฟเวอร์ **ไม่ปล่อยให้ client ส่ง type อะไรก็ได้เข้า Google**"*
 * แต่กลไกเดิมคือ `const t = KIND_TYPES[kind]; if (!t) return 400`
 * → **`?kind=constructor` ได้ฟังก์ชัน `Object` (truthy) → เดินผ่านด่าน แล้วยิง Google จริง**
 * 🎯 ตระกูล `D82`: **ถ้อยคำกับกลไกเดินคนละทาง โดยไม่มีใครแก้ฝั่งไหน**
 *
 * ⚠️ **`searchNearby` ถูก mock** — เคสนี้ต้องพิสูจน์ว่า *ไม่มีการเรียก Google เลย*
 * ถ้าปล่อยให้เรียกจริง เทสต์จะเผา quota ทุกครั้งที่รัน **และจะพิสูจน์ตรงข้ามกับที่ตั้งใจ**
 */
const searchNearbySpy = vi.hoisted(() => vi.fn());

/**
 * 🔴 **`...(await importOriginal())` จำเป็น — ด่าน `S6` จับผมได้ตอนรันชุดเต็ม (P1 · 27 ส.ค. 2026)**
 *
 * ฉบับแรกเขียน `vi.mock("@/lib/rateLimit", () => ({ rateLimitGuard: () => null }))` เฉย ๆ
 * ซึ่ง **แทนที่ทั้งโมดูล** → export ตัวอื่นหายหมด และ **กลืน export ใหม่ทุกตัวที่ใครเพิ่มทีหลัง**
 *
 * 🎯 และเคสของผมคือเคสที่ `S6` ยกตัวอย่างไว้เป๊ะ: **ผม mock ทับตัวจำกัดอัตรา ซึ่งเป็นตัวควบคุม
 * เชิงป้องกัน** · ถ้าวันหนึ่ง `lib/rateLimit` เพิ่มด่านตัวที่สอง ไฟล์นี้จะกลืนมันเงียบ ๆ
 * แล้วเทสต์จะ **รับรองโค้ดที่ไม่เคยผ่านด่านนั้นเลย**
 * · `S6` เขียนไว้ตรงกว่านั้นอีก: *"การซ่อมที่เป็นธรรมชาติที่สุดของบั๊กนี้ คือการปิดด่านความปลอดภัย
 *   และไม่มีขั้นตอนไหนในนั้นที่รู้สึกผิดปกติ"*
 *
 * ⚠️ **ที่แทนจริง ๆ มีแค่ 2 ตัว และทั้งคู่มีเหตุผลของตัวเอง:**
 * · `searchNearby` — ถ้าไม่แทน เทสต์จะยิง Google จริงและเผา quota ทุกครั้งที่รัน
 * · `rateLimitGuard` — เทสต์นี้ยิงหลายคำขอติดกัน · ตัวจริงจะเริ่มตอบ `429` กลางทาง
 *   แล้วเคสจะแดงด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่วัด
 */
vi.mock("@/lib/googlePlaces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/googlePlaces")>()),
  searchNearby: searchNearbySpy,
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  rateLimitGuard: () => null,
}));

import { GET } from "@/app/api/place-nearby/route";

const call = (kind: string) =>
  GET(new NextRequest(`http://localhost/api/place-nearby?lat=35.1&lng=129.0&kind=${encodeURIComponent(kind)}`));

describe("kind allowlist", () => {
  it("🔴 คีย์สายโปรโตไทป์ต้องได้ 400 และ **ห้ามแตะ Google เลย**", async () => {
    for (const bad of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      searchNearbySpy.mockClear();
      const res = await call(bad);
      expect(res.status, bad).toBe(400);
      expect(await res.json(), bad).toEqual({ results: [], error: "unknown kind" });
      // 🎯 ข้อนี้คือหัวใจ — 400 อย่างเดียวไม่พอ ถ้ามันยิงไปแล้วค่อยตอบ 400
      expect(searchNearbySpy, bad).not.toHaveBeenCalled();
    }
  });

  it("kind ที่ไม่รู้จักทั่วไปก็ 400 เหมือนเดิม", async () => {
    // 🔴 **`"hotel"` ย้ายไปฝั่งบวกแล้ว 4 ก.ย. 2026 (P1)** — มันกลายเป็น kind จริงเมื่อผู้ใช้สั่งทำ
    //    ฟีเจอร์แนะนำโรงแรม · แทนด้วย `"lodging"` ซึ่งเป็นคำที่ Google ใช้และ **เราจงใจไม่รับ**
    //    (`lodging` ตัวกว้างของ Google รวม campground/rv_park/farmstay ⇒ ขึ้นในรายการโรงแรมแล้วดูเหมือนระบบเสีย)
    // 🎯 ***เคสนี้แดงตอนผมเพิ่ม `hotel` ซึ่งคือสิ่งที่มันควรทำ — คนเขียนเลือก `"hotel"` เป็นตัวอย่าง
    //    "คำที่ฟังดูน่าจะรองรับแต่ไม่รองรับ" และวันที่มันถูกรองรับ ด่านก็บอกทันที***
    //    ⚠️ ตัวแทนที่เลือกต้องเป็นคำที่ **ไม่มีวันถูกรับ** ไม่ใช่คำถัดไปที่เราจะเพิ่ม — ไม่งั้นย้ายกันไม่จบ
    for (const bad of ["", "lodging", "RESTAURANT", "restaurant ", "../etc"]) {
      searchNearbySpy.mockClear();
      const res = await call(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(searchNearbySpy, JSON.stringify(bad)).not.toHaveBeenCalled();
    }
  });

  it("ด้านบวก: kind ที่ถูกต้องยังเดินต่อได้ — ถ้าข้อนี้แดง เคสด้านลบไม่ได้พิสูจน์อะไร", async () => {
    for (const ok of ["restaurant", "attraction", "place", "hospital", "hotel"]) {
      searchNearbySpy.mockClear();
      searchNearbySpy.mockResolvedValue({ places: [], error: null });
      const res = await call(ok);
      expect(res.status, ok).toBe(200);
      expect(searchNearbySpy, ok).toHaveBeenCalledTimes(1);
      // รัศมี/การเรียงต้องมาจริง ไม่ใช่ `undefined` ที่หลุดมาจากตาราง
      const [, types, , radius, rank] = searchNearbySpy.mock.calls[0];
      expect(Array.isArray(types), ok).toBe(true);
      expect(typeof radius, ok).toBe("number");
      expect(["POPULARITY", "DISTANCE"], ok).toContain(rank);
    }
  });

  it("ไม่ส่ง kind → ค่าเริ่มต้น `restaurant`", async () => {
    searchNearbySpy.mockClear();
    searchNearbySpy.mockResolvedValue({ places: [], error: null });
    const res = await GET(new NextRequest("http://localhost/api/place-nearby?lat=35.1&lng=129.0"));
    expect(res.status).toBe(200);
    expect(searchNearbySpy.mock.calls[0][1]).toEqual(["restaurant"]);
  });

  it("🔴 พิกัดที่ไม่ใช่ตัวเลข → 400 และ **ห้ามแตะ Google**", async () => {
    // `if (!lat || !lng)` เดิมตรวจแค่ว่า *มี* → `?lat=abc` ผ่านไปเป็น `NaN` แล้วยิง Google จริง
    // 🎯 รูปเดียวกับช่อง `kind`: **ด่านที่ผ่านได้ ทำให้เกิดคำขอที่ไม่ควรมี**
    for (const [la, ln] of [["abc", "129"], ["35.1", "xyz"], ["NaN", "129"], ["", "129"], ["Infinity", "129"]]) {
      searchNearbySpy.mockClear();
      const res = await GET(new NextRequest(`http://localhost/api/place-nearby?lat=${la}&lng=${ln}&kind=restaurant`));
      expect(res.status, `${la},${ln}`).toBe(400);
      expect(searchNearbySpy, `${la},${ln}`).not.toHaveBeenCalled();
    }
  });

  it("🔴 พิกัดนอกช่วงของโลก → 400", async () => {
    // ไม่ใช่แค่ `isFinite` — พิกัดนอกโลกไม่มีความหมาย และเป็นสัญญาณว่าฝั่งเรียกพัง
    for (const [la, ln] of [["91", "0"], ["-91", "0"], ["0", "181"], ["0", "-181"]]) {
      searchNearbySpy.mockClear();
      const res = await GET(new NextRequest(`http://localhost/api/place-nearby?lat=${la}&lng=${ln}&kind=restaurant`));
      expect(res.status, `${la},${ln}`).toBe(400);
      expect(searchNearbySpy, `${la},${ln}`).not.toHaveBeenCalled();
    }
  });

  it("ขอบของช่วงยังผ่าน (±90 / ±180)", async () => {
    for (const [la, ln] of [["90", "180"], ["-90", "-180"], ["0", "0"]]) {
      searchNearbySpy.mockClear();
      searchNearbySpy.mockResolvedValue({ places: [], error: null });
      const res = await GET(new NextRequest(`http://localhost/api/place-nearby?lat=${la}&lng=${ln}&kind=restaurant`));
      expect(res.status, `${la},${ln}`).toBe(200);
    }
  });

  it("🔴 `radius` ที่พัง → ตกไปใช้ค่าเริ่มต้นของ kind ไม่ใช่ส่ง `NaN` ไป Google", async () => {
    for (const bad of ["abc", "", "-100", "0", "NaN"]) {
      searchNearbySpy.mockClear();
      searchNearbySpy.mockResolvedValue({ places: [], error: null });
      const res = await GET(new NextRequest(
        `http://localhost/api/place-nearby?lat=35.1&lng=129&kind=restaurant&radius=${encodeURIComponent(bad)}`));
      expect(res.status, bad).toBe(200);
      expect(searchNearbySpy.mock.calls[0][3], bad).toBe(1200); // ค่าเริ่มต้นของ restaurant
    }
  });

  it("`radius` ที่ใหญ่เกินถูกตัดที่ 50000", async () => {
    searchNearbySpy.mockClear();
    searchNearbySpy.mockResolvedValue({ places: [], error: null });
    await GET(new NextRequest("http://localhost/api/place-nearby?lat=35.1&lng=129&kind=restaurant&radius=999999"));
    expect(searchNearbySpy.mock.calls[0][3]).toBe(50000);
  });
});
