import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRetryingClockSkew } from "@/lib/auth/server";

/**
 * ลองใหม่เฉพาะเคส "นาฬิกาเหลื่อม" — เจอบนหน้าเว็บจริง 27 ส.ค. 2026
 * เจ้าของ: P1-Lead
 *
 * 🔴 **ที่มา: `GET /api/engine/trips → 502 {"error":"…JWT issued at future"}` บนหน้าจอผู้ใช้จริง**
 * โทเคนออกโดย GoTrue ตรวจโดย PostgREST — คนละเครื่อง · เหลื่อมกันเสี้ยววินาทีแล้วโทเคนที่เพิ่ง
 * refresh จะถูกปฏิเสธ · **คำขอถัดไปผ่าน** — แปลว่ารอแล้วยิงใหม่คือคำตอบ
 *
 * ⚠️ **เมื่อคืนตัวเดียวกันนี้ทำชุดทดสอบแดง และผมสรุปว่า "transient ในเทสต์"**
 * — วัดถูก (มันชั่วคราวจริง) **แต่สรุปขอบเขตผิด** · ไฟล์นี้มีเพราะขอบเขตที่ผมสรุปผิด
 *
 * 🎯 **เคสที่สำคัญที่สุดคือเคสที่ *ไม่* ควร retry** — retry ที่กว้างเกินจะทำให้ auth ที่ล้มจริง
 * ใช้เวลานานขึ้นเพื่อจะได้ error เดิม และกลบสาเหตุที่แท้จริง
 */

const skew = () =>
  new Response(JSON.stringify({ message: "JWT issued at future" }), { status: 401 });
const expired = () =>
  new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 });
const ok = () => new Response(JSON.stringify([{ id: "t1" }]), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

/** คืนตัวนับจำนวนครั้งที่ fetch ถูกเรียก + ตัว stub */
function stub(...responses: Array<() => Response>) {
  let i = 0;
  const spy = vi.fn(async () => (responses[Math.min(i++, responses.length - 1)])());
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("fetchRetryingClockSkew", () => {
  it("🔴 นาฬิกาเหลื่อมแล้วหายเอง → ยิงใหม่จนได้ 200 (เคสที่เกิดจริงบนหน้าเว็บ)", async () => {
    const spy = stub(skew, ok);
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips");
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("เหลื่อมค้างไม่หาย → คืน 401 ตัวสุดท้าย ไม่วนไม่จบ", async () => {
    const spy = stub(skew);
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips");
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(3); // ยิงแรก + retry 2 รอบ
  });

  it("🔴 โทเคนหมดอายุจริง = **ห้าม retry** — ไม่งั้นผู้ใช้รอนานขึ้นเพื่อจะได้ error เดิม", async () => {
    const spy = stub(expired);
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips");
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ไม่ใช่ 401 = ไม่ retry (500 ไม่รู้ว่าฝั่งโน้นทำไปแล้วหรือยัง)", async () => {
    const spy = stub(() => new Response("boom", { status: 500 }));
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips");
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("🔴 body ที่ส่งซ้ำไม่ได้ (stream) = ไม่ retry — ยิงซ้ำจะได้ body ว่าง ซึ่งแย่กว่าไม่ยิง", async () => {
    const spy = stub(skew, ok);
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } });
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips", {
      method: "POST", body: body as unknown as BodyInit,
    });
    expect(res.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("body เป็นสตริง = retry ได้ (คำขอเขียนปกติของเราเป็นสตริง)", async () => {
    const spy = stub(skew, ok);
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips", {
      method: "POST", body: JSON.stringify({ title: "t" }),
    });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("🔴 ผู้เรียกต้องอ่าน body ของคำตอบที่เราไม่ retry ได้ — `clone()` ต้องไม่กินของจริง", async () => {
    stub(expired);
    const res = await fetchRetryingClockSkew("https://x/rest/v1/trips");
    await expect(res.json()).resolves.toEqual({ message: "JWT expired" });
  });
});
