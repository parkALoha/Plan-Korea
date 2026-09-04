import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRIP_DAYS } from "@/lib/engine/tripLimits";
import { NextRequest } from "next/server";

/**
 * `POST /api/engine/trips` — **ทางสร้างทริปทางแรกที่มีในแอป** (P1 · 27 ส.ค. 2026)
 *
 * 🔴 `create_trip` อยู่ในฐานมาตั้งแต่ 25 ส.ค. **แต่ไม่มีอะไรเรียกมันเลย**
 * → บัญชีใหม่ค้างที่ *"ยังไม่มีทริป"* ตลอดกาล · **ไม่มีใคร live-verify อะไรได้ทั้งวัน**
 *
 * ⚠️ **mock เฉพาะ *ขอบนอก* (auth/db client · rate limit) แล้ว spread ของเดิมกลับ** (`S6`)
 * ตรรกะการตรวจ input เป็นของจริงทั้งเส้น — **นั่นคือสิ่งที่เคสพวกนี้วัด**
 */
const rpcSpy = vi.hoisted(() => vi.fn());
const userSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/server")>()),
  getUser: userSpy,
  createServerSupabase: async () => ({ rpc: rpcSpy }),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  // เทสต์ยิงหลายคำขอติดกัน · ตัวจริงจะเริ่มตอบ 429 กลางทางแล้วเคสจะแดงด้วยเหตุผลที่ไม่เกี่ยวกับที่วัด
  rateLimitGuard: () => null,
}));

import { POST } from "@/app/api/engine/trips/route";

const OK = { title: "เที่ยวเกาหลี", startDate: "2026-10-11", endDate: "2026-10-21" };
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/engine/trips", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  rpcSpy.mockReset();
  rpcSpy.mockResolvedValue({ data: { id: "t1", title: "เที่ยวเกาหลี" }, error: null });
  userSpy.mockReset();
  userSpy.mockResolvedValue({ id: "u1" });
});

describe("ด่านก่อนถึงฐาน", () => {
  it("ไม่ล็อกอิน → 401 และ **ไม่แตะฐาน**", async () => {
    userSpy.mockResolvedValue(null);
    const res = await post(OK);
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("body ไม่ใช่ JSON → 400", async () => {
    const res = await post("ไม่ใช่ json");
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("🔴 ชื่อทริปว่าง/ยาวเกิน → 400 **ก่อน**เรียก RPC", async () => {
    // 🎯 ถ้าปล่อยผ่าน ผู้ใช้จะได้ข้อความของ Postgres (`length(trim(title)) between 1 and 120`)
    //    ซึ่งอ่านไม่รู้เรื่อง · **ตอบเป็นภาษาคนตั้งแต่ที่นี่**
    for (const title of ["", "   ", "\t\n", "ก".repeat(121), 42, null, undefined]) {
      rpcSpy.mockClear();
      const res = await post({ ...OK, title });
      expect(res.status, JSON.stringify(title)).toBe(400);
      expect(rpcSpy, JSON.stringify(title)).not.toHaveBeenCalled();
    }
  });

  it("ชื่อยาว 120 พอดี → ผ่าน (ขอบต้องไม่ถูกกันไปด้วย)", async () => {
    expect((await post({ ...OK, title: "ก".repeat(120) })).status).toBe(201);
  });

  it("🔴 วันที่ผิดรูป → 400", async () => {
    for (const d of ["11/10/2026", "2026-1-1", "2026-10-11T00:00:00Z", "", "วันนี้", 20261011]) {
      rpcSpy.mockClear();
      expect((await post({ ...OK, startDate: d })).status, String(d)).toBe(400);
      expect(rpcSpy, String(d)).not.toHaveBeenCalled();
    }
  });

  it("🔴 วันสิ้นสุดมาก่อนวันเริ่ม → 400 ไม่ใช่ปล่อยให้ CHECK ของฐานฟ้อง", async () => {
    expect((await post({ ...OK, startDate: "2026-10-21", endDate: "2026-10-11" })).status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("วันเดียว (เริ่ม = จบ) ต้องผ่าน — ทริปวันเดียวมีจริง", async () => {
    expect((await post({ ...OK, startDate: "2026-10-11", endDate: "2026-10-11" })).status).toBe(201);
  });

  /**
   * 🔴 **เพดานเปลี่ยนจาก 366 → `MAX_TRIP_DAYS` (30) เมื่อ 4 ก.ย. 2026** — ผู้ใช้ตัดสินเอง
   * (*"สูงสุด 30 วันพอ"*) หลัง P1 เสนอตอนออกแบบ flow สร้างทริปใหม่
   *
   * 🔴 **และ 366 ไม่ได้หายไป — มันย้ายชั้น ไม่ได้ถูกยกเลิก**
   * ```
   * 30   route (`MAX_TRIP_DAYS`)  "ทริปยาวสุดที่เราออกแบบให้รองรับ"        ← เพดานของสินค้า
   * 366  ฐาน (`create_trip`)      "กันคนพิมพ์ปีผิดแล้วสร้าง 3,653 แถวรวด"  ← เพดานกันอุบัติเหตุ
   * ```
   * 🎯 ***สองเลขตอบคนละคำถาม ⇒ ตั้งใจให้ต่างกัน*** — ต่างจาก `MAX_TRIP_DESTINATIONS`
   *    ที่สองเลขตอบคำถามเดียวกันแล้วไม่ตรงกัน (บั๊ก) · **อย่า "แก้ให้ตรงกัน"**
   * ⚠️ เคสนี้ **import ค่าจริง ไม่พิมพ์ 30 ซ้ำ** — ไม่งั้นวันที่ผู้ใช้เปลี่ยนใจ เคสจะแดงโดยไม่มีบั๊ก
   */
  /**
   * 🔴 **เคสนี้ตรึง *การตัดสินใจ* ไม่ใช่ *พฤติกรรม* — และมันจำเป็นเพราะเคสข้างล่าง `import` ค่า**
   * พอเคสขอบใช้ `MAX_TRIP_DAYS` แทนเลขจริง มันจะเขียวไม่ว่าค่านั้นจะเป็นเท่าไหร่
   * ⇒ ***การ import ทำให้เคสทนต่อการเปลี่ยนค่า ซึ่งคือสิ่งที่เราต้องการสำหรับ "ขอบทำงานไหม"
   *    แต่เป็นสิ่งที่เราไม่ต้องการสำหรับ "ใครอนุญาตให้เปลี่ยนค่า"***
   * · 30 มาจากผู้ใช้โดยตรง (4 ก.ย. 2026) — **ไม่ใช่ค่าที่ทีมเลือกเอง**
   * · แดงเมื่อไหร่ = มีคนเปลี่ยนเพดานสินค้า ⇒ **ต้องมีคำของผู้ใช้ก่อนแก้บรรทัดนี้**
   */
  it("🔴 เพดาน 30 วันเป็นการตัดสินใจของผู้ใช้ — เปลี่ยนต้องมีคำของเขา", () => {
    expect(MAX_TRIP_DAYS).toBe(30);
  });

  it("🔴 ช่วงวันที่ยาวเกินเพดาน → 400 **ก่อน**ถึงฐาน", async () => {
    rpcSpy.mockClear();
    const res = await post({ ...OK, startDate: "2026-10-11", endDate: "2036-10-11" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(String(MAX_TRIP_DAYS));
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("เพดานพอดีต้องผ่าน · เกินหนึ่งวันต้องไม่ผ่าน — ขอบต้องไม่ถูกกันไปด้วย", async () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const at = (n: number) =>
      new Date(start.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    // นับหัวท้าย ⇒ วันสุดท้ายของทริป `MAX_TRIP_DAYS` วัน คือ +(MAX_TRIP_DAYS - 1)
    expect((await post({ ...OK, startDate: at(0), endDate: at(MAX_TRIP_DAYS - 1) })).status).toBe(201);
    expect((await post({ ...OK, startDate: at(0), endDate: at(MAX_TRIP_DAYS) })).status).toBe(400);
  });
});

describe("เส้นทางที่ถูกต้อง", () => {
  it("ส่งค่าเข้า RPC ครบและตัดช่องว่างหัวท้ายชื่อ", async () => {
    await post({ ...OK, title: "  เที่ยวเกาหลี  ", baseTimezone: "Asia/Seoul" });
    expect(rpcSpy).toHaveBeenCalledWith("create_trip", {
      p_title: "เที่ยวเกาหลี",
      p_start_date: "2026-10-11",
      p_end_date: "2026-10-21",
      p_base_timezone: "Asia/Seoul",
    });
  });

  it("ไม่ส่ง `baseTimezone` → ต้องไม่ส่ง *สตริง* เข้า RPC", async () => {
    // 🔴 สิ่งที่เคสนี้กันคือ **สตริงว่าง/ช่องว่างล้วนหลุดเข้า RPC** ไม่ใช่ตัวแทนของ "ไม่มีค่า"
    //    `null` (ส่งตรง ๆ) กับ `undefined` (ละพารามิเตอร์) เดินเส้นเดียวกันเป๊ะที่ฐาน:
    //    `20260827080000:48` `p_base_timezone text default null`
    //    `20260827080000:76` `coalesce(nullif(trim(p_base_timezone), ''), 'Asia/Bangkok')`
    //    → ผูกเคสกับ *ตัวแทน* ตัวใดตัวหนึ่ง = แดงตอนเปลี่ยนชนิด ทั้งที่พฤติกรรมไม่ขยับ (เกิดจริง 28 ส.ค.)
    // ⚠️ ขอบเขต: เคสนี้ดู **อาร์กิวเมนต์ที่ส่งเข้า `rpc()`** ไม่ใช่ body ที่ออกไปจริง
    //    (`JSON.stringify` ตัดคีย์ที่เป็น `undefined` ทิ้ง — เคสนี้พิสูจน์เรื่องนั้นให้ไม่ได้)
    const tzOf = () => rpcSpy.mock.calls[0][1].p_base_timezone as unknown;
    await post(OK);
    expect(tzOf() == null, `ละค่า → ต้องไม่เป็นสตริง · ได้ ${JSON.stringify(tzOf())}`).toBe(true);
    rpcSpy.mockClear();
    await post({ ...OK, baseTimezone: "   " });
    expect(tzOf() == null, `ช่องว่างล้วน → ต้องไม่เป็นสตริง · ได้ ${JSON.stringify(tzOf())}`).toBe(true);
  });

  it("สำเร็จ → `201` พร้อมแถวที่สร้าง", async () => {
    const res = await post(OK);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "t1", title: "เที่ยวเกาหลี" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("🔴 แยก 'ด่านทำงาน' ออกจาก 'บั๊กเรา' — รูปเดียวกับ `verdictFor()` ของ P4", () => {
  it("`42501` → 403 (สิทธิ์) · `PT503` → 503 (โหมดอ่านอย่างเดียว) · อื่น → 502 (บั๊กเรา)", async () => {
    for (const [code, status] of [["42501", 403], ["PT503", 503], ["22023", 400], ["42P01", 502], [undefined, 502]] as const) {
      rpcSpy.mockResolvedValue({ data: null, error: { code, message: "x" } });
      expect((await post(OK)).status, String(code)).toBe(status);
    }
  });

  it("🔴 route **ไม่** ตรวจโหมดอ่านอย่างเดียวเอง — ฐานเป็นคนกัน", async () => {
    // เขียนซ้ำที่นี่ = แหล่งความจริงที่สองที่ต้องคอยให้ตรงกับ trigger ตลอดไป
    // เคสนี้ตรึงว่า route ส่งต่อ `PT503` ของฐาน **ไม่ใช่สร้างคำตอบเอง**
    rpcSpy.mockResolvedValue({ data: null, error: { code: "PT503", message: "ระบบอยู่ในโหมดอ่านอย่างเดียว" } });
    const res = await post(OK);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("ระบบอยู่ในโหมดอ่านอย่างเดียว");
  });
});
