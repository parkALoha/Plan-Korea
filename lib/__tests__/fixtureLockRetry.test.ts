import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { acquireFixtureLock } from "./_testClient";

/**
 * `acquireFixtureLock` — การจัดแยก error (P1 · หัว branch แดง 26 ส.ค. 2026)
 *
 * 🔴 บั๊กเดิม: กิ่ง `error` throw ทุกอย่างที่ไม่ใช่ `PGRST202` · ลูป retry วนเฉพาะตอน `data !== true`
 *    → `JWT issued at future` (transient ครั้งเดียว) = `beforeAll` ล้ม = **273 เคสถูกข้าม ชุดสดหายทั้งชุด**
 * 🎯 asymmetry (P1): retry เกินหนึ่งรอบ = ช้า ~2 วิ · throw เร็วหนึ่งครั้ง = ชุดหาย → transient ต้อง retry ไม่ throw
 *
 * เทสต์นี้เป็น unit ล้วน (fake client · ไม่ต่อฐาน · ไม่ต้อง creds) — พิสูจน์ทั้ง 3 กิ่ง และกัน regression
 * ถ้ามีใครใส่ `throw` กลับเข้ากิ่ง transient เคสแรกจะแดงทันที
 */
function fakeAdmin(rpcImpl: (fn: string) => { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: (fn: string) => Promise.resolve(rpcImpl(fn)) } as unknown as SupabaseClient;
}

describe("acquireFixtureLock — การจัดแยก error", () => {
  it("🔴 transient (ไม่ใช่ PGRST202/22023) → retry จนสำเร็จ ไม่ throw", async () => {
    let acquireCalls = 0;
    const admin = fakeAdmin((fn) => {
      if (fn === "acquire_fixture_lock") {
        acquireCalls += 1;
        // ครั้งแรกพลาดชั่วคราว (JWT blip) · ครั้งที่สองได้ล็อก
        return acquireCalls === 1
          ? { data: null, error: { code: "XXJWT", message: "JWT issued at future" } }
          : { data: true, error: null };
      }
      return { data: true, error: null }; // release_fixture_lock → true
    });
    const lock = await acquireFixtureLock(admin, "t", { pollMs: 1, timeoutMs: 5000 });
    expect(acquireCalls, "ต้อง retry แล้วสำเร็จ ไม่ใช่ throw ที่ครั้งแรก").toBeGreaterThanOrEqual(2);
    await lock.release();
  });

  it("PGRST202 (RPC ยังไม่ลง) → no-op เงียบ ไม่ throw", async () => {
    let calls = 0;
    const admin = fakeAdmin(() => {
      calls += 1;
      return { data: null, error: { code: "PGRST202", message: "function not found" } };
    });
    const lock = await acquireFixtureLock(admin, "t", { pollMs: 1, timeoutMs: 5000 });
    expect(calls, "PGRST202 = คืนทันที ไม่ retry").toBe(1);
    await lock.release(); // no-op — ไม่ throw
  });

  it("🔴 22023 (พารามิเตอร์ผิด · deterministic) → throw ทันที ไม่ retry", async () => {
    let calls = 0;
    const admin = fakeAdmin(() => {
      calls += 1;
      return { data: null, error: { code: "22023", message: "TTL ต้องอยู่ระหว่าง 1–1800" } };
    });
    await expect(acquireFixtureLock(admin, "t", { pollMs: 1, timeoutMs: 5000 })).rejects.toThrow(/deterministic 22023/);
    expect(calls, "deterministic error = ไม่ retry").toBe(1);
  });

  it("🔴 42501 (permission denied · grant service_role หาย) → throw ทันที ไม่ retry (คลาส 42 · P1)", async () => {
    // SQLSTATE class 42 = syntax/access violation = deterministic ทุกตัว → retry 240s แล้ว Ctrl-C = สุสาน fixture (890)
    let calls = 0;
    const admin = fakeAdmin(() => {
      calls += 1;
      return { data: null, error: { code: "42501", message: "permission denied for function acquire_fixture_lock" } };
    });
    await expect(acquireFixtureLock(admin, "t", { pollMs: 1, timeoutMs: 5000 })).rejects.toThrow(/deterministic 42501/);
    expect(calls, "42* = deterministic = ไม่ retry").toBe(1);
  });
});
