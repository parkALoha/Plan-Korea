"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildDayBridge, type DayBridge } from "@/lib/engine/dayBridge";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { get as storeGet, set as storeSet, tripKey } from "@/lib/engine/offlineStore";
import type { DayOvernightRow } from "@/lib/engine/overnightShape";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * 🔴 **แหล่งเดียวของ "วันของทริปนี้" — `E6-AC11`** · เจ้าของ: P3-FE/Perf · 30 ส.ค. 2026
 *
 * ## ปัญหาที่มันมาแก้ — และมันไม่ใช่เรื่องจำนวนคำขอเป็นหลัก
 * ก่อนหน้านี้ **4 hook ยิง `/days` เองคนละครั้ง แล้วสร้าง `buildDayBridge([], …)` คนละใบ**
 * (`useStops` · `useDaySettings` · `useBookings` · `useOvernightOverrides`) + `usePlatformItinerary`
 * ยิงเป็นรายที่ 5 → วัดได้ **8 คำขอต่อการโหลดหนึ่งหน้า**
 *
 * 🎯 **แต่ราคาจริงคือ *จำนวนที่ ๆ ความหมายจะเพี้ยนได้* ไม่ใช่จำนวนคำขอ** (P1)
 * · เกิดจริงแล้ววันเดียวกัน: `useOvernightOverrides` เทียบ `bridge.matched` ซึ่ง **เป็น `0` เสมอ**
 *   หลังผู้เรียกเปลี่ยนเป็น `buildDayBridge([], …)` → แถบ 🚧 ค้างถาวร + แคชไม่เคยถูกเขียน
 *   **อีกสามใบไม่เพี้ยนเพราะมันบังเอิญเทียบคนละค่า** — ถ้าเป็นแหล่งเดียว จะมีที่เดียวให้ผิดและที่เดียวให้แก้
 * · 🔴 **นี่คือเหตุผลที่เกณฑ์ปิด `AC11` ไม่ใช่ "จำนวนคำขอ = 1"** — ตัวเลขนั้นปิดได้ด้วยการใส่ dedupe
 *   ทับข้างบนโดยไม่แตะรากเลย · เกณฑ์จริงคือ **`buildDayBridge` เลิก export ให้เหลือผู้เรียกเดียว**
 *   → ระบบโมดูลบังคับเอง ไม่มีข้อความให้ `grep` ไม่มีชื่อให้ผูก (P1 เสนอ · รูปเดียวกับ `it.fails`)
 *
 * ## ⚠️ ยังไม่จบ — ไฟล์นี้เป็นก้าวที่ 1 จาก 2
 * วันนี้ย้ายมาแล้ว **1 ผู้เรียก** (`useOvernightOverrides`) · อีก 3 ตัวยังยิงเอง
 * **`buildDayBridge` จึงยัง `export` อยู่ และจะยังไม่ปิด `AC11` จนกว่าจะย้ายครบ**
 * 🔴 **ห้ามอ่านการมีอยู่ของไฟล์นี้ว่า `AC11` เสร็จ** — เกณฑ์ปิดคือ export หาย ไม่ใช่ provider โผล่
 */
type TripDaysValue = {
  /** `null` = ยังไม่ได้คำตอบ (หรือคำขอล้ม) — **ไม่ใช่ "ทริปไม่มีวัน"** ซึ่งคือ `[]` */
  rows: DayOvernightRow[] | null;
  /** สะพานใบเดียวของทั้งหน้า — `dayKeyToDbId` ให้ `uuid → uuid` (ฝั่ง `"d*"` ไม่มีผู้ผลิตแล้ว) */
  bridge: DayBridge;
  loaded: boolean;
  reload: () => void;
};

const Ctx = createContext<TripDaysValue | undefined>(undefined);

export function TripDaysProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  /**
   * 🔴 **ผลผูกกับ `tripId` ที่มันมาจาก ไม่ใช่ state ลอย ๆ** — รูปเดียวกับ `usePlatformItinerary`
   * ถ้าเก็บแค่ `rows` แล้วผู้ใช้สลับทริป **เฟรมระหว่างทางจะได้วันของทริปเก่าโดยไม่มีอะไรบอก**
   * (แล้วสะพานจะแมป `trip_day_id` ของทริปใหม่ไม่เจอ → แถวหล่นเงียบ ซึ่งคืออาการที่ `AC11` มาแก้พอดี)
   */
  const [result, setResult] = useState<{ forTripId: string; rows: DayOvernightRow[] | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const enabled = supabaseConfigured && !!tripId;

  useEffect(() => {
    if (!enabled || !tripId) return;
    let cancelled = false;
    /**
     * 🔴 **อ่านแคชก่อนแล้วค่อยยิงของสด — `E6-AC4`** (ด่าน `offlineReadCoverage` ของ P7 จับได้ทันที
     * ตอนผมย้ายการยิงมาที่นี่ · **ก่อนหน้านี้ไม่มีใครแคช "วัน" เลยสักตัว** แต่ไม่มีอะไรจับ
     * เพราะ 4 hook เดิมแคช *ข้อมูลของตัวเอง* ไว้ จึงไม่เข้าเงื่อนไขของด่าน)
     * 🎯 **การรวมแหล่งทำให้ช่องว่างที่กระจายอยู่ 4 ที่ กลายเป็นช่องเดียวที่มองเห็นและปิดได้ครั้งเดียว**
     * · ลำดับ hydrate→fetch กับการแข่งกันอยู่ใน `hydrateThenFetch` (ท่าเดียวกับ `usePlatformItinerary`)
     */
    async function load() {
      const key = tripKey(tripId!, "dayRows");
      await hydrateThenFetch<DayOvernightRow[]>({
        readCache: () => storeGet<DayOvernightRow[]>(key),
        fetchFresh: async () => {
          const r = await fetch(`/api/engine/trips/${tripId}/days`);
          if (!r.ok) throw new Error(`days ${r.status}`);
          return (await r.json()) as DayOvernightRow[];
        },
        writeCache: (rows) => storeSet(key, rows),
        onWriteFailed: () => noteCacheFailure("offlineStore/dayRows/write", { code: "idb" }),
        applyCache: (rows) => setResult({ forTripId: tripId!, rows }),
        applyFresh: (rows) => setResult({ forTripId: tripId!, rows }),
        // 🔴 อ่านไม่ได้ → `rows: null` **ไม่ใช่ `[]`** — ผู้เรียกต้องแยก *"ถามไม่ได้"* ออกจาก *"ไม่มีวัน"*
        applyError: () => setResult({ forTripId: tripId!, rows: null }),
        isCancelled: () => cancelled,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, tripId, nonce]);

  // ผลของทริปอื่นไม่นับ — ระหว่างสลับทริปจะเป็น "ยังไม่โหลด" ไม่ใช่ "ข้อมูลของทริปก่อน"
  const fresh = result && tripId && result.forTripId === tripId ? result : null;
  const rows = fresh ? fresh.rows : null;
  const loaded = !enabled || fresh !== null;

  const bridge = useMemo(() => buildDayBridge([], rows ?? []), [rows]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo<TripDaysValue>(() => ({ rows, bridge, loaded, reload }), [rows, bridge, loaded, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 🔴 **โยนเมื่อถูกเรียกนอก provider — ไม่คืนค่าเริ่มต้นเงียบ ๆ**
 * ค่าเริ่มต้นแบบ `{ rows: null }` จะทำให้ hook ที่อยู่ผิดที่ **ดูเหมือนทำงานแต่ไม่มีวันได้ข้อมูล**
 * ซึ่งเป็นอาการเดียวกับบั๊กที่ `AC11` มาแก้พอดี (`P-50`: ธงที่อ่านไม่ได้ ไม่ใช่ธง)
 */
export function useTripDays(): TripDaysValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTripDays ต้องอยู่ใต้ <TripDaysProvider> (อยู่ใน TripDataProvider)");
  return v;
}
