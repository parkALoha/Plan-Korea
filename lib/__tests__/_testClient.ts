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

/**
 * 🔴 **S6 ↔ F1 ชนกัน · snippet มาตรฐานที่ต้อง *ก๊อป* (import ไม่ได้)** — 27 ส.ค. 2026 (P1 เจอ · P4 จด)
 *
 * `S6` (mockShape) บังคับ `vi.mock("@/lib/…")` ให้ spread `importOriginal()` · แต่
 * `importOriginal("@/lib/supabase")` **รันโมดูลจริง** → F1: `RealtimeClient` เรียก
 * `WebSocketFactory.getWebSocketConstructor()` → Node 20 ไม่มี `WebSocket` → **โยนตั้งแต่ mock**
 * ทำตามข้อหนึ่ง = ชนอีกข้อ · เจอกับทุกคนที่ spread-mock `@/lib/supabase` ต่อจากนี้
 *
 * 🔴 **ทำไม *ไม่* ทำเป็น setup ไฟล์กลาง (global):** การมี `WebSocket` ทั้ง env จะกลบสัญญาณ
 * *"import supabase-js ล้ม = ของขวัญ"* ที่ `lib/engine/storageKey.ts` พึ่งอยู่ (โมดูลที่ไม่ควร import มัน
 * จะเลิกล้มเงียบ ๆ) · วันนี้ไม่มี setup ไฟล์ และสัญญาณนั้นไม่มีตัวสำรองครบ (`layoutImportGraph` เป็น canary แคบ)
 * → **opt-in ต่อไฟล์ ไม่เปลี่ยน env ของทั้งชุดเพื่อไฟล์ไม่กี่ตัว** · (ถ้า dup โตจนคุ้ม: globalize *พร้อม* import-graph guard
 * ที่ตรึงว่าโมดูล sw.js ห้าม import supabase-js — ตั้งสัญญาณนั้นใหม่ให้เป๊ะ แล้วค่อย global ได้)
 *
 * `vi.hoisted` ต้องอยู่ในไฟล์เทสต์เอง (hoist เหนือ import → import ฟังก์ชันมาใช้ไม่ได้) → **ก๊อป snippet นี้บนสุดของไฟล์**
 * ที่ spread-mock `@/lib/supabase` · **สตับ *โยน* ถ้ามีคนใช้ realtime จริง — ห้ามเปลี่ยนเป็น socket จริง** (รูปเดียวกับ `NO_SOCKET` แต่ระดับ global):
 *
 * ```ts
 * vi.hoisted(() => {
 *   const g = globalThis as { WebSocket?: unknown };
 *   g.WebSocket ??= class {
 *     constructor() {
 *       throw new Error("เทสต์นี้ต้องไม่เปิด WebSocket — เห็น = มีเคสใช้ realtime · แก้ที่เคส ไม่ใช่เปลี่ยนสตับเป็น socket จริง");
 *     }
 *   };
 * });
 * ```
 * 📌 มีอยู่แล้วใน `guardedStorage.test.ts` · `signStoredFile.test.ts` — ก๊อปจากที่นี่ให้ตรง (พร้อมคำเตือน)
 */

/** ล็อกที่ถืออยู่ · `release()` ปลดเมื่อจบชุด */
export type FixtureLock = { readonly holder: string; release: () => Promise<void> };

/**
 * ล็อกชุดสด — กันสองเซสชัน seed รหัส `TEST_COUNTRY_CODES` เดียวกัน*พร้อมกัน* (`R11`/`P-68`) · P1 RPC · P4 wire
 *
 * 🔴 **แถว+expiry ไม่ใช่ `pg_advisory_lock`** — supabase-js เป็น REST (pooled ทุก request) ถือ session lock ข้ามชุดไม่ได้
 *    (P4 วัด: `.env.local` ไม่มี pg connection string) · expiry แก้ "แถวค้าง" แบบเดียวกับ `app.system_mode` (P1)
 * 🔴 **forward-compat:** RPC ยังไม่ลง (`PGRST202`) → คืน no-op **เงียบสนิท** (ไม่ล็อก ไม่ spam) จนกว่า migration ที่ 3 จะมา
 * 🔴 **bounded-retry แล้ว fail-loud** (ไม่ skip · `D72`: คน push ต้องยืนยันหรือแดง ไม่ใช่เขียวกลวง) · ข้อความบอก *ใคร* ถือ
 * 🔴 **release เช็คว่ายังถือ** — ถ้าหลุด (`③` ของ P1: TTL สั้นกว่าเวลาชุด) → **ดัง console.error ไม่ throw** (throw ใน afterAll กลบผลเคสที่เพิ่งรัน)
 */
export async function acquireFixtureLock(
  admin: SupabaseClient,
  holder: string,
  opts: { ttlSeconds?: number; timeoutMs?: number; pollMs?: number } = {},
): Promise<FixtureLock> {
  const ttl = opts.ttlSeconds ?? 300;
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const pollMs = opts.pollMs ?? 2000;
  const noop: FixtureLock = { holder, release: async () => {} };
  const started = Date.now();
  for (;;) {
    const { data, error } = await admin.rpc("acquire_fixture_lock", { p_holder: holder, p_ttl_seconds: ttl });
    if (error) {
      if (error.code === "PGRST202") return noop; // RPC ยังไม่ลง → เงียบ (ยังไม่มีการกันชน จนกว่าจะลง)
      throw new Error(`acquire_fixture_lock: ${error.message}`);
    }
    if (data === true) {
      return {
        holder,
        release: async () => {
          const cur = await admin.rpc("fixture_lock_holder");
          const stillMine = (cur.data as { held_by?: string } | null)?.held_by === holder;
          await admin.rpc("release_fixture_lock", { p_holder: holder });
          if (!stillMine) {
            console.error(
              `\n🔴 fixture lock '${holder}' หลุดกลางรัน (ตอนนี้: ${JSON.stringify(cur.data)}) — ` +
                `**TTL (${ttl}s) สั้นกว่าเวลาชุดสด** · ชุดรันแบบไม่กันชนบางช่วง (③ ของ P1) → เพิ่ม TTL ให้ > เวลาชุด\n`,
            );
          }
        },
      };
    }
    if (Date.now() - started > timeoutMs) {
      const h = await admin.rpc("fixture_lock_holder");
      throw new Error(
        `ขอ fixture lock ไม่ได้ใน ${timeoutMs}ms — ถือโดย ${JSON.stringify(h.data)} · มีชุดสดค้าง? ไปดู **ไม่ใช่ของพัง** (R11 · รอ+retry แล้วยังไม่ว่าง)`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
