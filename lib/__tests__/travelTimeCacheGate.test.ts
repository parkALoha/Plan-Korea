import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * **`E3-AC6` — ประตูบัญชีขาวต้องคุม *ฝั่งอ่าน* ด้วย ไม่ใช่แค่ฝั่งเขียน**
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ช่องที่ไฟล์นี้ปิด
 * `catalogPublicSlugs.test.ts` คุม **ตัวฟังก์ชัน** ครบแล้ว —
 * พิกัดที่พักไม่ผ่าน · UUID ส่วนตัวไม่ผ่าน · คิวรีล้ม = เซตว่าง (fail-closed)
 * 🔴 **แต่ไม่มีอะไรพิสูจน์ว่า *route เรียกใช้มันจริงตอนอ่าน***
 * 🎯 ***ด่านที่ทดสอบเครื่องมือ ไม่ได้ทดสอบการใช้เครื่องมือ*** —
 *    รูปเดียวกับที่ `cacheFullSignal.test.ts` มีไว้แก้ (`noteCacheFailure` ดังจริง
 *    แต่ไม่มีใครเรียกมันจาก `writeCache`)
 *
 * ## ทำไมฝั่งอ่านสำคัญเท่าฝั่งเขียน
 * `AC6` เขียนว่า *"การ hit แคช = ข้าม DB = **ข้าม RLS**"*
 * · ฝั่งเขียนกันไม่ให้ *ของส่วนตัวเข้าไปอยู่* ในแคช
 * · 🔴 **ฝั่งอ่านกันไม่ให้ *คนที่ไม่ควรเห็น* หยิบของที่อยู่ในนั้นแล้วออกมา**
 *   ⇒ ถ้าฝั่งอ่านไม่ถูกกัน แถวที่หลุดเข้าไปก่อนหน้า (หรือจากเส้นทางอื่น) จะถูกเสิร์ฟต่อ
 *
 * ## ⚠️ ขอบเขตของไฟล์นี้ — เขียนไว้ไม่ให้ใครอ่านเกิน
 * · ครอบ **`/api/travel-time` เท่านั้น** · `place-details`/`place-photos` มีประตูของตัวเอง
 *   (`catalogPublicMapsQueries`) และ **ยังไม่มีเทสต์ระดับ route แบบนี้**
 * · **ไม่ใช่เทสต์ A/B ตามเกณฑ์เดิมของ `AC6`** (A อุ่นแคช → B ไม่ใช่สมาชิกเปิดแล้วต้องไม่ได้ข้อมูล)
 *   ⇒ **ห้ามอ่านว่าปิด `AC6`** · มันปิดข้อย่อยหนึ่งข้อที่ AC ระบุว่ายังเปิดอยู่
 */
const rateSpy = vi.hoisted(() => vi.fn(() => null));
const slugsSpy = vi.hoisted(() => vi.fn());
const fetchRealSpy = vi.hoisted(() => vi.fn());
const fromSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", async (o) => ({
  ...(await o<typeof import("@/lib/rateLimit")>()),
  rateLimitGuard: rateSpy,
}));
// 🔴 **ห้ามใช้ `importOriginal` กับโมดูลพวกนี้** — `lib/supabase.ts` เรียก `createClient()`
//    ตอน import และ `supabase-js` สร้าง `RealtimeClient` ใน constructor เสมอ
//    ซึ่ง **โยนทิ้งบน Node 20** (ไม่มี global `WebSocket` · CI ปักหมุด 20.12.2)
//    ⇒ suite จะล้มตั้งแต่ collect · vitest รายงาน "no tests" **ไม่ใช่ "ผ่าน"**
//    (ตัวรายงานของทีมจับข้อนี้ได้เอง — *"ไม่มีเคสให้รันเลยสักเคส"*)
//    📌 จดไว้ใน `memory/project_plan_korea_gotchas.md` แล้ว · เจอซ้ำเป็นครั้งที่สอง
vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true, supabase: null }));
vi.mock("@/lib/auth/server", () => ({ createServerSupabase: async () => ({ from: fromSpy }) }));
vi.mock("@/lib/engine/db", () => ({ catalogPublicSlugs: slugsSpy }));
vi.mock("@/lib/travelProvider", () => ({ fetchRealTravelTime: fetchRealSpy }));

import { GET } from "@/app/api/travel-time/route";

/** คีย์ที่ *เข้ารหัสพิกัดที่พัก* — รูปที่ `hotelAnchorId()` สร้างจริง (`lib/hotelLegs.ts:12`) */
const PRIVATE_ORIGIN = "hotel@38.19051,128.59874";
const PUBLIC_A = "gyeongbokgung";
const PUBLIC_B = "bukchon-hanok";

/** จำลอง `supabase.from(...)` ให้บันทึกว่ามีใครแตะตารางแคชไหม */
function fakeFrom() {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq", "insert", "upsert", "delete"]) {
    chain[k] = () => chain;
  }
  chain.maybeSingle = async () => ({ data: null, error: null });
  return chain;
}

const call = (o: string, d: string) =>
  GET(new NextRequest(
    `http://localhost/api/travel-time?originPlaceId=${encodeURIComponent(o)}` +
    `&destPlaceId=${encodeURIComponent(d)}&originLat=1&originLng=1&destLat=2&destLng=2&mode=drive`,
  ));

describe("E3-AC6 — /api/travel-time ต้องไม่อ่านแคชเมื่อคีย์ไม่ผ่านบัญชีขาว", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateSpy.mockReturnValue(null);
    fromSpy.mockImplementation(() => fakeFrom());
    fetchRealSpy.mockResolvedValue({ durationMinutes: 12, distanceMeters: 3400, isReal: true });
  });

  /**
   * 🔴 **ทิศบวกต้องมาก่อน** — ถ้าเส้นทางแคชไม่เคยถูกเดินเลย
   * เคสข้างล่าง (`ไม่แตะแคช`) จะเขียวโดยไม่ได้พิสูจน์อะไร
   * (`TEAM.md` — *"การแก้ไม่เกิด" กับ "เคสไม่เคยถูกรัน" อ่านเหมือนกันเป๊ะ*)
   */
  it("① ทิศบวก — คีย์สาธารณะทั้งคู่ → **ต้องแตะ `travel_time_cache`**", async () => {
    slugsSpy.mockResolvedValue(new Set([PUBLIC_A, PUBLIC_B]));
    await call(PUBLIC_A, PUBLIC_B);
    const tables = fromSpy.mock.calls.map((c) => c[0]);
    expect(tables, "เส้นทางแคชไม่เคยถูกเดิน — เคส ② จะพิสูจน์อะไรไม่ได้")
      .toContain("travel_time_cache");
  });

  /**
   * 🔴 **ใบหลัก** — คีย์ที่เข้ารหัสพิกัดที่พัก **ต้องไม่ถูกใช้แตะแคชเลย**
   * ไม่ใช่แค่ "ไม่เขียน" — **ไม่อ่านด้วย**
   */
  it("② คีย์เป็นพิกัดที่พัก → **ห้ามแตะ `travel_time_cache` เลยสักครั้ง**", async () => {
    slugsSpy.mockResolvedValue(new Set([PUBLIC_B]));   // ปลายทางผ่าน · ต้นทางไม่ผ่าน
    await call(PRIVATE_ORIGIN, PUBLIC_B);
    const tables = fromSpy.mock.calls.map((c) => c[0]);
    expect(tables,
      `route แตะ ${JSON.stringify(tables)} ทั้งที่ต้นทางเป็นพิกัดที่พัก — ` +
      "การ hit แคชคือการข้าม RLS (D11)").not.toContain("travel_time_cache");
  });

  /**
   * ⚠️ **เคสควบคุมฝั่งลบใบที่สอง** — ต้องกันทั้งสองปลาย ไม่ใช่แค่ปลายแรก
   * 🔴 ถ้าโค้ดเช็คแค่ `originPlaceId` เคส ② จะเขียวทั้งที่ช่องยังเปิดอยู่ครึ่งหนึ่ง
   */
  it("③ ปลายทางไม่ผ่านบัญชีขาว → ก็ห้ามแตะแคชเหมือนกัน", async () => {
    slugsSpy.mockResolvedValue(new Set([PUBLIC_A]));   // ต้นทางผ่าน · ปลายทางไม่ผ่าน
    await call(PUBLIC_A, PRIVATE_ORIGIN);
    expect(fromSpy.mock.calls.map((c) => c[0])).not.toContain("travel_time_cache");
  });

  /**
   * 🔴 **fail-closed ต้องถึงระดับ route ไม่ใช่แค่ในฟังก์ชัน**
   * `catalogPublicSlugs` คืนเซตว่างเมื่อคิวรีล้ม — route ต้องแปลว่า "แคชไม่ได้" ไม่ใช่ "ไม่มีข้อจำกัด"
   */
  it("④ บัญชีขาวคืนเซตว่าง (คิวรีล้ม) → ห้ามแตะแคช และยังต้องตอบผู้ใช้ได้", async () => {
    slugsSpy.mockResolvedValue(new Set());
    const res = await call(PUBLIC_A, PUBLIC_B);
    expect(fromSpy.mock.calls.map((c) => c[0])).not.toContain("travel_time_cache");
    expect(res.status, "ล้มแล้วต้องยังตอบได้ ไม่ใช่ 5xx").toBeLessThan(500);
    expect(fetchRealSpy, "ต้องถอยไปถาม Google แทน ไม่ใช่ตอบว่าไม่มีข้อมูล").toHaveBeenCalled();
  });
});
