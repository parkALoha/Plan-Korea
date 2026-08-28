import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `PATCH /api/engine/trips/[tripId]/days` — **กิ่ง `cityId` (เมืองของวัน)** · เจ้าของ: P4-QA/Sec · 28 ส.ค. 2026
 *
 * ⚠️ **mock เฉพาะ *ขอบนอก* (auth/db client · rate limit · DAL) แล้ว spread ของเดิมกลับ** (`S6`)
 * ตรรกะตรวจ input กับการเลือกกิ่งเป็นของจริงทั้งเส้น — **นั่นคือสิ่งที่ไฟล์นี้วัด · ไม่มีคำขอไปฐานเลย**
 *
 * ## `tripId` ใน URL ↔ `dayId` ใน body — สองชั้น และไฟล์นี้ครอบได้ชั้นเดียว
 * เดิม `setDayCity`/`setOvernightIntent` เป็น `.eq("id", dayId)` **เฉย ๆ** → ผูกกันด้วย **RLS เท่านั้น**
 * · P1 เติม `.eq("trip_id", tripId)` ให้ทั้งสองตัวแล้ว (28 ส.ค. 2026) → กลายเป็นสองชั้น
 *
 * ✅ **ชั้นที่ไฟล์นี้ครอบ:** route ส่ง `tripId` *ของ URL* ต่อให้ DAL จริงไหม (สายไฟถูกต่อไหม)
 * 🔴 **ชั้นที่ไฟล์นี้ครอบไม่ได้ และห้ามอ่านว่าครอบ:** `.eq("trip_id", …)` กรองได้จริงไหม + RLS
 *    — DAL ถูก mock ทั้งตัว **ตัวกรองไม่เคยถูกรัน** · เคส *"editor ของ A ยิง dayId ของ B"*
 *    ยังต้องอยู่ในชุดสด (`engineCrossUser`) เท่านั้น (รูปเดียวกับ `D70`)
 */
const getUserSpy = vi.hoisted(() => vi.fn());
const setDayCitySpy = vi.hoisted(() => vi.fn());
const setOvernightSpy = vi.hoisted(() => vi.fn());
const cityExistsSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/server")>()),
  getUser: getUserSpy,
  createServerSupabase: async () => ({}),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  rateLimitGuard: () => null,
}));
vi.mock("@/lib/engine/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine/db")>()),
  setDayCity: setDayCitySpy,
  setOvernightIntent: setOvernightSpy,
  catalogCityExists: cityExistsSpy,
}));

import { PATCH } from "@/app/api/engine/trips/[tripId]/days/route";

const TRIP = "11111111-1111-4111-8111-111111111111";
const DAY = "22222222-2222-4222-8222-222222222222";
const CITY = "33333333-3333-4333-8333-333333333333";

const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://localhost/api/engine/trips/${TRIP}/days`, {
      method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ tripId: TRIP }) },
  );

beforeEach(() => {
  getUserSpy.mockReset(); getUserSpy.mockResolvedValue({ id: "u1" });
  setDayCitySpy.mockReset(); setDayCitySpy.mockResolvedValue({ data: [{ id: DAY }], error: null });
  setOvernightSpy.mockReset(); setOvernightSpy.mockResolvedValue({ data: [{ id: DAY }], error: null });
  cityExistsSpy.mockReset(); cityExistsSpy.mockResolvedValue({ data: { id: CITY }, error: null });
});

describe("กิ่ง `cityId` — แยก 'ล้างค่า' ออกจาก 'ไม่แตะ'", () => {
  it("🔴 `cityId: null` = **ล้างค่า** — ต้องเข้ากิ่ง cityId และส่ง null ต่อ ไม่ใช่ตกไปทาง overnight", async () => {
    const res = await patch({ dayId: DAY, cityId: null });
    expect(res.status).toBe(200);
    expect(setDayCitySpy).toHaveBeenCalledWith(expect.anything(), TRIP, DAY, null);
    // 🎯 หัวใจของ `"cityId" in body` — `!body.cityId` จะกลืนเคสนี้ไปทาง overnight แล้วตอบ 400
    expect(setOvernightSpy, "ล้างเมือง ต้องไม่ไปยุ่งกับที่นอน").not.toHaveBeenCalled();
    // ล้างค่าไม่ต้องถามคลังว่ามีเมืองนี้ไหม
    expect(cityExistsSpy).not.toHaveBeenCalled();
  });

  it("🔴 ไม่ส่ง `cityId` เลย → ต้องไปทาง overnight เหมือนเดิม (regression ของกิ่งเก่า)", async () => {
    const res = await patch({ dayId: DAY, kind: "none" });
    expect(res.status).toBe(200);
    expect(setOvernightSpy).toHaveBeenCalledWith(expect.anything(), TRIP, DAY, { kind: "none" });
    expect(setDayCitySpy, "ไม่ส่ง cityId = ไม่แตะเมืองของวัน").not.toHaveBeenCalled();
  });

  it("ตั้งเมืองปกติ → ถามคลังก่อน แล้วเขียน", async () => {
    const res = await patch({ dayId: DAY, cityId: CITY });
    expect(res.status).toBe(200);
    expect(cityExistsSpy).toHaveBeenCalledWith(expect.anything(), CITY);
    // 🔴 `tripId` ที่ส่งต่อต้องเป็นของ *URL* — ไม่ใช่ค่าจาก body ที่ผู้ใช้ส่งมาเอง
    //    (ด่านสิทธิ์ `guard()` ตัดสินจาก URL · ถ้าตัวเขียนใช้ค่าอื่น สองอย่างจะพูดคนละทริป)
    expect(setDayCitySpy).toHaveBeenCalledWith(expect.anything(), TRIP, DAY, CITY);
  });
});

describe("กิ่ง `cityId` — ด่านก่อนถึงฐาน", () => {
  // 🔴 เส้นแบ่ง "400 เร็ว" กับ "502 หลังยิงฐาน" — ค่าขยะต้องไม่เดินทางไปถึง DAL
  for (const [label, cityId] of [
    ["ตัวเลข", 123], ["boolean", true], ["array", []], ["object", {}], ["ไม่ใช่ uuid", "not-a-uuid"],
  ] as const) {
    it(`\`cityId\` เป็น${label} → 400 และ **ไม่แตะฐาน**`, async () => {
      const res = await patch({ dayId: DAY, cityId });
      expect(res.status).toBe(400);
      expect(cityExistsSpy, "ค่าที่รูปผิดต้องถูกกันก่อนถึง DAL").not.toHaveBeenCalled();
      expect(setDayCitySpy).not.toHaveBeenCalled();
    });
  }

  it("เมืองไม่มีในคลัง → 400 (ไม่ใช่ 502 และไม่ใช่ปล่อยไปชน FK)", async () => {
    cityExistsSpy.mockResolvedValue({ data: null, error: null });
    const res = await patch({ dayId: DAY, cityId: CITY });
    expect(res.status).toBe(400);
    expect(setDayCitySpy, "เมืองไม่มี ต้องไม่เขียนอะไรเลย").not.toHaveBeenCalled();
  });

  it("คลังตอบ error → 502 (บั๊กเรา ไม่ใช่ input ผู้ใช้)", async () => {
    cityExistsSpy.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await patch({ dayId: DAY, cityId: CITY })).status).toBe(502);
  });

  it("🔴 เขียนแล้วได้ 0 แถว = RLS กรองออก → 403 **ไม่ใช่ 200**", async () => {
    setDayCitySpy.mockResolvedValue({ data: [], error: null });
    const res = await patch({ dayId: DAY, cityId: CITY });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("42501");
  });

  it("`42501` จาก DAL → 403 · error อื่น → 502", async () => {
    setDayCitySpy.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    expect((await patch({ dayId: DAY, cityId: CITY })).status).toBe(403);
    setDayCitySpy.mockResolvedValue({ data: null, error: { code: "42P01", message: "no table" } });
    expect((await patch({ dayId: DAY, cityId: CITY })).status).toBe(502);
  });
});

describe("รูปของ body — `try/catch` กัน parse ล้ม ไม่ได้กันรูปผิด", () => {
  // 🔴 `JSON.parse("null")` **สำเร็จ** → catch ไม่ทำงาน → เดิม `body.dayId` โยน → 500
  //    `5` / `"x"` / `[]` ไม่โยน (อ่านพร็อพที่ไม่มีได้) — **`null` ตัวเดียวที่พัง** จึงต้องมีเคสของมันเอง
  for (const [label, raw] of [
    ["null", "null"], ["ตัวเลข", "5"], ["สตริง", '"x"'], ["array", "[]"],
  ] as const) {
    it(`body = ${label} → 400 ไม่ใช่ 500 และ **ไม่แตะฐาน**`, async () => {
      const res = await patch(raw);
      expect(res.status).toBe(400);
      expect(setDayCitySpy).not.toHaveBeenCalled();
      expect(setOvernightSpy).not.toHaveBeenCalled();
    });
  }

  it("body ที่ parse ไม่ได้ → 400 (กิ่ง catch เดิม ต้องไม่หายไป)", async () => {
    expect((await patch("ไม่ใช่ json")).status).toBe(400);
  });
});

describe("🔴 `cityId` มาพร้อม `city`/`kind` = สองคำสั่งในคำขอเดียว → ปฏิเสธ", () => {
  // 🎯 ทางที่ถูกปฏิเสธคือ *ให้ `cityId` ชนะ* — คำสั่ง overnight จะหายเงียบแต่ตอบ `ok:true`
  //    ไคลเอนต์เชื่อว่าทำครบทั้งสอง **และไม่มีอะไรในคำตอบบอกว่ามันไม่ได้ทำ**
  for (const [label, extra] of [
    ["kind", { kind: "none" }], ["city", { city: "busan" }], ["ทั้งคู่", { kind: "none", city: "busan" }],
  ] as const) {
    it(`\`cityId\` + \`${label}\` → 400 และ **ไม่เขียนอะไรเลยสักตัว**`, async () => {
      const res = await patch({ dayId: DAY, cityId: CITY, ...extra });
      expect(res.status).toBe(400);
      expect(setDayCitySpy, "ปฏิเสธแล้วต้องไม่เขียนครึ่งเดียว").not.toHaveBeenCalled();
      expect(setOvernightSpy).not.toHaveBeenCalled();
    });
  }

  it("`cityId: null` + `kind` ก็ปฏิเสธ — ล้างค่าก็ยังเป็นคำสั่งเรื่องเมือง", async () => {
    expect((await patch({ dayId: DAY, cityId: null, kind: "none" })).status).toBe(400);
    expect(setDayCitySpy).not.toHaveBeenCalled();
  });
});
