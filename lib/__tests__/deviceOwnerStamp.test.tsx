// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { readDeviceOwner } from "@/lib/auth/deviceOwner";

/**
 * `E6-AC14` — `DeviceOwnerStamp` ต่อสาย `onAuthStateChange` → `stampDeviceOwner`
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026
 *
 * ## 🔴 สิ่งที่เคสนี้มีไว้จับ — **การสมัครบน client ผิดตัว**
 * ```
 * lib/supabase.ts        createClient(...)        session อยู่ localStorage
 * lib/auth/browser.ts    createBrowserClient(...) session อยู่ **คุกกี้**  ← auth จริงเดินทางนี้
 * ```
 * สมัครผิดตัว = **ไม่เคยได้ยินการล็อกอินเลยสักครั้ง และเงียบสนิท** → ตราไม่เคยถูกประทับ →
 * `readDeviceOwner()` เป็น `null` ตลอดกาล → ผู้อ่าน fail closed → **แคชใช้ไม่ได้ทั้งแอปโดยไม่มีอะไรฟ้อง**
 *
 * ⚠️ **เคสนี้ไม่ได้พิสูจน์ว่า *คุกกี้* คือที่ที่ session อยู่จริง** — มันพิสูจน์ว่าคอมโพเนนต์สมัครกับ
 * โมดูลที่ชื่อ `@/lib/auth/browser` · ถ้าวันหนึ่ง auth ย้ายที่เก็บ **เคสนี้จะยังเขียวและผิด**
 * (ตัวที่ผูกความจริงนั้นคือ `lib/auth/signIn.ts` ซึ่งใช้ `createBrowserSupabase()` เหมือนกัน)
 */

const listeners: ((event: string, session: unknown) => void)[] = [];
const unsubscribe = vi.fn();

vi.mock("@/lib/auth/browser", () => ({
  createBrowserSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        // 🔴 รูปคืนค่าต้องตรงของจริง — mock ที่คืนรูปผิดทำให้ cleanup เงียบ
        //    (บทเรียนเดิม: `.subscribe()` ที่คืน `undefined` ทำให้ `removeChannel` ไม่เคยถูกเรียก)
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

const { DeviceOwnerStamp } = await import("@/components/DeviceOwnerStamp");

beforeEach(() => {
  listeners.length = 0;
  unsubscribe.mockClear();
  window.localStorage.clear();
});

describe("DeviceOwnerStamp", () => {
  it("① เคสควบคุม — mount แล้วต้องสมัครจริง (ไม่ใช่ไม่ทำอะไรแล้วเคสล่างเขียวฟรี)", () => {
    render(<DeviceOwnerStamp />);
    expect(listeners.length, "ไม่ได้สมัคร onAuthStateChange เลย — เคสข้างล่างจะเขียวโดยไม่ตรวจอะไร").toBe(1);
  });

  it("② มี session → ประทับ id ของเจ้าของ", () => {
    render(<DeviceOwnerStamp />);
    expect(readDeviceOwner()).toBeNull();
    listeners[0]("SIGNED_IN", { user: { id: "user-a" } });
    expect(readDeviceOwner()).toBe("user-a");
  });

  it("③ 🔴 ไม่มี session → **ลบตรา** ไม่ใช่ปล่อยของเก่าค้าง", () => {
    render(<DeviceOwnerStamp />);
    listeners[0]("SIGNED_IN", { user: { id: "user-a" } });
    listeners[0]("SIGNED_OUT", null);
    // ตราค้าง = เครื่องยังอ้างว่าเป็นของ A ทั้งที่ออกจากระบบแล้ว → คนถัดไปบนเครื่องเดียวกันได้แคชของ A
    expect(readDeviceOwner()).toBeNull();
  });

  it("④ session ที่ไม่มี user → ถือว่าไม่รู้เจ้าของ (fail closed)", () => {
    render(<DeviceOwnerStamp />);
    listeners[0]("SIGNED_IN", { user: { id: "user-a" } });
    listeners[0]("TOKEN_REFRESHED", {});
    expect(readDeviceOwner()).toBeNull();
  });

  it("⑤ unmount → ถอนการสมัคร (mock คืนรูปเดียวกับของจริง จึงจับได้)", () => {
    const { unmount } = render(<DeviceOwnerStamp />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
