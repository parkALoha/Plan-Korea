import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnvKey } from "./_helpers";

/**
 * client สำหรับเทสต์สด (RLS / route) — **ของกลาง · ทุกเทสต์ที่ต่อฐานต้อง import ตัวนี้ ห้ามเรียก `createClient` ตรง**
 *
 * เจ้าของ: P4-QA/Sec · **ย้ายออกจาก `rlsMatrix.test.ts` มาที่นี่ 27 ส.ค. 2026** (P1 ชี้ว่ามันติดอยู่ในไฟล์เดียว
 * ไม่ได้ export → คนถัดไปที่เขียนเทสต์สดจะเรียก `createClient` เองแล้วเจอบั๊ก F1 ซ้ำทั้งดุ้น)
 * · **ไม่ใส่ไว้ใน `_helpers.ts`** เพราะ `_helpers` ไม่มี dependency บน `supabase-js` เลย และมีเทสต์เพียว ๆ
 *   หลายตัว import มัน — เอา `createClient` ไปไว้ที่นั่น = ลาก `supabase-js` เข้าไฟล์ที่ไม่ได้ใช้มันสัก 8 ไฟล์
 *
 * 🔴 F1 (P4 พบ · P1 ยืนยันด้วยการรัน): `supabase-js 2.112` สร้าง `RealtimeClient` ใน constructor
 * **เสมอ** แม้เราไม่ได้ใช้ Realtime เลยสักเคส · บน Node 20 ไม่มี `globalThis.WebSocket`
 * (เพิ่งมีตั้งแต่ Node 22) → `createClient` โยนทิ้งตั้งแต่บรรทัดแรกของ `beforeAll`
 *
 * 🎯 **อาการที่ทำให้มันรอดมานาน:** ผลรวมยังพิมพ์ `16 passed | 22 skipped` โดยความล้มเหลวไปโผล่แยกเป็น
 * "Failed Suites 1" — **อ่านเหมือนปัญหาสภาพแวดล้อม ไม่ใช่ปัญหา RLS** · และ `RLS_MATRIX_REQUIRED=1`
 * ที่แปลง skip เป็น fail **ไม่ครอบทางเข้านี้** → `owner_id` (คอลัมน์ที่ `P-15` เปลี่ยนชื่อไปแล้ว) อยู่ได้โดยไม่มีใครเห็น
 * เพราะ **ไม่เคยมีใครรันชุดสดได้จริงสักครั้ง**
 *
 * **ทางแก้ (P4 พิสูจน์บนเครื่องนี้):** ส่ง `transport` เข้าไปเอง —
 * `RealtimeClient` ใช้ `options?.transport ?? WebSocketFactory.getWebSocketConstructor()`
 * → **ส่งมาแล้วตัวที่โยนไม่ถูกเรียกเลย** · ไม่ต้องอัป Node ไม่ต้องลง dependency สักตัว
 *
 * 🎯 และสตับตัวนี้ **ไม่ใช่แค่ทางเลี่ยง มันเป็นด่านเพิ่ม**: เทสต์สดพวกนี้ไม่ได้ใช้ realtime เลยสักบรรทัด
 * ถ้าวันหนึ่งมีใครเผลอเปิด socket **มันจะแดงพร้อมบอกเหตุผล ไม่ใช่เงียบแล้วทำงานได้**
 *
 * ⚠️ **ยังยืนยันไม่ได้ว่า Node 20 ไม่มีกับดักตัวที่สองรออยู่** (`auth.admin.createUser`, `signInWithPassword`)
 * — ต้องมี creds จริงถึงจะรู้ · **อย่านับว่า F1 ปิดสนิทจนกว่าชุดสดจะขยับจริง**
 * 📌 หนี้: `supabase-js` เตือนทุกครั้งว่า Node ≤20 เลิกซัพพอร์ต · `ci.yml` ปักหมุด `20.12.2` โดยไม่มี `.nvmrc`/`engines` → ส่ง P6 แล้ว
 */
export const NO_SOCKET = function () {
  throw new Error(
    "เทสต์สดต้องไม่เปิด WebSocket — ถ้าเห็น error นี้ แปลว่ามีเคสไหนเริ่มใช้ realtime\n" +
      "  ทางแก้ที่ถูกคือถามว่าเคสนั้นควรใช้ realtime จริงไหม **ไม่ใช่เปลี่ยนสตับนี้ให้เป็น socket จริง**",
  );
} as unknown as never;

export function testClient(key: string): SupabaseClient {
  return createClient(readEnvKey("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: { persistSession: false },
    realtime: { transport: NO_SOCKET },
  });
}
