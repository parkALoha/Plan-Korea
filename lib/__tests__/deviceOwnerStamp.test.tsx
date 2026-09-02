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

  /**
   * 🔴 **กลับด้านจากฉบับเดิม 2 ก.ย. 2026 — และเหตุผลสำคัญกว่าตัวเคส** (P7 เจอรู · P1 แก้)
   *
   * ฉบับเดิมยืนยันว่า *"ไม่มี session → **ลบตรา**"* พร้อมเหตุผลว่า
   * *"ตราค้าง = เครื่องยังอ้างว่าเป็นของ A → คนถัดไปได้แคชของ A"*
   *
   * 🎯 **เหตุผลนั้นกลับด้านไปแล้ว เพราะ *หน้าที่ของตราเปลี่ยน*:**
   * ```
   * ตอนเขียนเคสนี้   ตรา = **บันทึกเฉย ๆ**   → ตราค้าง = คำอ้างที่ผิด → ควรลบ
   * ตั้งแต่ E6-AC14   ตรา = **ตัวสั่งล้าง**    → ตราค้าง = **สิ่งที่ทำให้แคชของ A ถูกล้าง**
   * ```
   * ⇒ **ลบตราตอน session หาย = เปิดรู `X → null → Y`** (A ล็อกอิน → token หมดอายุ → B ล็อกอิน
   *   → `previous === null` → ไม่ล้าง → **ข้อมูลของ A รอด**) ซึ่งเป็นเคสเป้าหมายของ `AC` เอง
   *
   * ⚠️ **เคสนี้ไม่ได้ผิดตอนเขียน** — มันถูกสำหรับหน้าที่ที่ตรามีตอนนั้น
   * 🔴 **และเหตุผล *fail closed* ที่เคย ④ อ้างไว้ อ้างถึงผู้อ่านที่ไม่มีอยู่จริง** —
   *    วัดแล้ว: `readDeviceOwner()` **ไม่ถูกเรียกจากที่ไหนเลยนอกไฟล์ตัวเองและเคสทดสอบ**
   *
   * ✅ **เก็บ *ความกังวล* ของเคสเดิมไว้ครบ เปลี่ยนแค่ *ข้อยืนยัน*** — คำถาม *"คนถัดไปได้แคชของ A ไหม"*
   *    ยังถูกถามอยู่ แค่ถามที่กลไกที่ตอบมันได้จริง
   */
  it("③ 🔴 sign-out แล้วอีกคนล็อกอิน → แคชของคนเก่าต้องหาย (ความกังวลเดิม · กลไกใหม่)", () => {
    render(<DeviceOwnerStamp />);
    listeners[0]("SIGNED_IN", { user: { id: "user-a" } });
    localStorage.setItem("trip-cache:lastTripId", JSON.stringify("trip-ของ-a"));
    listeners[0]("SIGNED_OUT", null);
    expect(readDeviceOwner(), "ตราต้องอยู่ต่อ — มันบอกว่า *ข้อมูลในเครื่องเป็นของใคร* ไม่ใช่ *ใครล็อกอินอยู่*").toBe("user-a");

    listeners[0]("SIGNED_IN", { user: { id: "user-b" } });
    expect(
      localStorage.getItem("trip-cache:lastTripId"),
      "แคชของ A รอดมาถึงมือ B — รู `X → null → Y` เปิดอยู่",
    ).toBeNull();
  });

  it("④ session ที่ไม่มี user (เช่น `TOKEN_REFRESHED` เปล่า) → ตราต้องไม่ถูกลบ", () => {
    render(<DeviceOwnerStamp />);
    listeners[0]("SIGNED_IN", { user: { id: "user-a" } });
    listeners[0]("TOKEN_REFRESHED", {});
    expect(
      readDeviceOwner(),
      "อีเวนต์ที่ไม่มี user ลบตราทิ้ง → ครั้งหน้าที่มีคนล็อกอินจะกลายเป็น `null → X` แล้วไม่ล้าง",
    ).toBe("user-a");
  });

  it("⑤ unmount → ถอนการสมัคร (mock คืนรูปเดียวกับของจริง จึงจับได้)", () => {
    const { unmount } = render(<DeviceOwnerStamp />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
