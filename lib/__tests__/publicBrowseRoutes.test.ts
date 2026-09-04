import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * `/api/engine/countries` · `/api/engine/cities` — **สองเส้นที่คนยังไม่ล็อกอินแตะได้**
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่ง (*"คนที่ไม่ได้ล็อกอิน ควรจะเข้าหน้าแรกได้"*)
 *
 * ## 🔴 ทำไมไฟล์นี้ต้องมี — มันมาแทนด่านที่ผมเพิ่งทำให้ใช้ไม่ได้
 * `engineAttackSurface` มีด่านสแกนว่า *"ทุก route ต้องเรียก `getUser()`+`unauthenticatedResponse()`"*
 * · `/countries` เปิดสาธารณะทั้งใบ ⇒ ประกาศ `authExempt` **ด่านนั้นเลิกตรวจมันทันที**
 * · `/cities` เปิด **บางกิ่ง** ⇒ ด่านสแกนสตริงแยก *"กิ่งไหนเปิด"* ไม่ได้ตามนิยาม
 * 🎯 ***`authExempt` ไม่ใช่การยกเว้น มันคือการย้ายภาระพิสูจน์มาที่นี่ — ถ้าไม่มีไฟล์นี้ มันคือการยกเว้นจริง ๆ***
 *
 * ## 🔴 และเคสที่สำคัญที่สุดคือ **ฝั่งที่ยังต้องปิด** ไม่ใช่ฝั่งที่เปิด
 * เปิดเกินไปแล้วจะไม่มีใครบ่น — ผู้ใช้ได้ของที่ขอ · **ไม่มีอาการให้ใครสังเกต**
 * ⇒ เคส `q` ของคนไม่ล็อกอิน (④) คือเคสที่จะเงียบที่สุดถ้าพัง จึงตรวจ **ทั้งรหัสและว่า RPC ไม่ถูกเรียก**
 */
const rpcSpy = vi.hoisted(() => vi.fn());
const userSpy = vi.hoisted(() => vi.fn());
const fromSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/server")>()),
  getUser: userSpy,
  createServerSupabase: async () => ({ rpc: rpcSpy, from: fromSpy }),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  rateLimitGuard: () => null,
}));

import { GET as countriesGET } from "@/app/api/engine/countries/route";
import { GET as citiesGET } from "@/app/api/engine/cities/route";

const countries = () => countriesGET(new NextRequest("http://localhost/api/engine/countries"));
const cities = (qs: string) =>
  citiesGET(new NextRequest(`http://localhost/api/engine/cities${qs}`));

beforeEach(() => {
  rpcSpy.mockReset();
  fromSpy.mockReset();
  userSpy.mockReset();
});

describe("🔴 คนยังไม่ล็อกอิน — กิ่งที่เปิด และกิ่งที่ยังต้องปิด", () => {
  beforeEach(() => userSpy.mockResolvedValue(null));

  it("① /countries เปิดให้คนยังไม่ล็อกอิน (ทิศบวก — ขาดไปแล้วเคส ④ ไม่มีความหมาย)", async () => {
    rpcSpy.mockResolvedValue({
      data: [{ id: "kr", name_th: "เกาหลีใต้", name_en: "South Korea", city_count: 15, sample_cities: ["ปูซาน"] }],
      error: null,
    });
    const res = await countries();
    expect(res.status, `ควร 200 · 401 = ปิดหน้าแรกใส่คนที่ยังไม่รู้ว่าเว็บทำอะไรได้: ${await res.clone().text()}`).toBe(200);
    const body = (await res.json()) as { id: string; cityCount: number; sampleCities: string[] }[];
    // 🔴 ตรวจ *รูปที่ผู้เรียกใช้* ไม่ใช่แค่ 200 — route แปลง snake_case ของ RPC เป็น camelCase
    //    พลาดตรงนี้ = การ์ดประเทศบนหน้าแรกโชว์ `undefined` โดยที่ status ยัง 200
    expect(body[0].cityCount, "cityCount หายไป = ไม่ได้แปลงจาก city_count").toBe(15);
    expect(body[0].sampleCities).toEqual(["ปูซาน"]);
  });

  it("② /cities?country=kr เปิดให้ดูรายเมือง (ทิศบวก)", async () => {
    rpcSpy.mockResolvedValue({
      data: [{ id: "c1", name_th: "โซล", name_en: "Seoul", slug: "seoul" }],
      error: null,
    });
    const res = await cities("?country=kr");
    expect(res.status, `ควร 200: ${await res.clone().text()}`).toBe(200);
    const body = (await res.json()) as { country_id: string; legacy_slug: string }[];
    expect(body[0].country_id, "country_id ต้องเติมจากพารามิเตอร์ — RPC ไม่คืนมา").toBe("kr");
    expect(body[0].legacy_slug, "legacy_slug ต้องแปลงจาก slug (คีย์รูปประจำเมือง)").toBe("seoul");
  });

  it("🔴 ③ ต้องไม่มี lat/lng ติดมา — `null` ที่ผ่านการตรวจชนิด อันตรายกว่าฟิลด์ที่ไม่มี", async () => {
    rpcSpy.mockResolvedValue({
      data: [{ id: "c1", name_th: "โซล", name_en: "Seoul", slug: "seoul" }],
      error: null,
    });
    const body = (await (await cities("?country=kr")).json()) as Record<string, unknown>[];
    // `cityCenterOf()` รับ null แล้วคืน null อย่างสุภาพ ⇒ แผนที่ว่างโดยไม่มีอะไรฟ้อง
    expect(Object.keys(body[0]), "มี lat/lng โผล่มา = ผู้เรียกจะส่งเข้า cityCenterOf() แล้วได้ null เงียบ ๆ")
      .not.toContain("lat");
    expect(Object.keys(body[0])).not.toContain("lng");
  });

  it("🔴 ④ ค้นด้วย `q` ต้องถูกปฏิเสธ — และ **RPC ต้องไม่ถูกเรียกเลย**", async () => {
    const res = await cities("?country=kr&q=โซล");
    expect(res.status, "คนยังไม่ล็อกอินค้นคลังได้ = ทางดูดคลังทีละหน้า").toBe(401);
    // 🔴 เช็ค `rpcSpy` ด้วย ไม่ใช่แค่รหัส — ตอบ 401 *หลัง* ยิงฐานไปแล้ว ยังนับเป็นรั่ว
    //    (ราคาถูกจ่ายไปแล้ว · และมันจะเงียบเพราะผู้เรียกเห็นแค่ 401)
    expect(rpcSpy, "ตอบ 401 แต่ยิงฐานไปแล้ว").not.toHaveBeenCalled();
  });

  it("🔴 ⑤ ไม่ระบุ country ต้องได้ 401 ไม่ใช่ `[]` — `[]` อ่านว่า 'ไม่มีเมือง' ซึ่งเป็นคำโกหก", async () => {
    const res = await cities("");
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe("ล็อกอินแล้ว — ทางเดิมต้องไม่เปลี่ยน (เคสควบคุม)", () => {
  beforeEach(() => userSpy.mockResolvedValue({ id: "u1" }));

  it("🔴 ⑥ ค้นด้วย `q` ได้ และเดิน `searchCatalogCities` ไม่ใช่ RPC สาธารณะ", async () => {
    // ตัวจริงของ `searchCatalogCities` เดิน `from()` — ไม่ใช่ `rpc()`
    const chain = {
      select: () => chain, eq: () => chain, or: () => chain, order: () => chain,
      limit: async () => ({ data: [{ id: "c1", name_th: "โซล", lat: 37.5, lng: 127 }], error: null }),
    };
    fromSpy.mockReturnValue(chain);
    const res = await cities("?q=โซล");
    expect(res.status, `ควร 200: ${await res.clone().text()}`).toBe(200);
    // 🎯 ***นี่คือเคสที่แยก "เปิดกิ่งสาธารณะ" ออกจาก "เปลี่ยนทั้งเส้นไปใช้ RPC"***
    //    ถ้าใครเผลอให้คนล็อกอินเดิน RPC สาธารณะด้วย จะเสีย lat/lng ทั้งเว็บโดยที่ status ยัง 200
    expect(rpcSpy, "คนล็อกอินแล้วถูกส่งไปทาง RPC สาธารณะ = เสีย lat/lng/name_local ทั้งเส้น")
      .not.toHaveBeenCalled();
    expect(fromSpy).toHaveBeenCalled();
  });
});
