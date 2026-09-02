"use client";

import { useEffect, useState } from "react";
import { noteCacheFailure } from "@/lib/engine/cacheGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { get as storeGet, set as storeSet, tripKey } from "@/lib/engine/offlineStore";

/** หัวทริป — ชื่อ + ช่วงวัน · `null` = ทริปนี้ไม่มีในรายการที่ API ตอบ (ไม่ใช่ "อ่านไม่ได้") */
export type TripMeta = {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
};

type TripRow = { id: string; title: string; start_date: string; end_date: string };

/**
 * ชื่อและช่วงวันของทริปที่เปิดอยู่ — **แคชได้ตอนออฟไลน์**
 * เจ้าของ: P3-FE/Perf · 2 ก.ย. 2026 · ต่อจาก `E6-AC4`
 *
 * ## 🔴 อาการที่ผู้ใช้เจอเองตอนทดสอบออฟไลน์จริง (เซิร์ฟเวอร์ดับสนิท)
 * ```
 * ออนไลน์   📋 เกาหลี ต.ค. 2026 · 11 – 21 ต.ค. 2026
 * ออฟไลน์   📋 ทริปนี้            ← ชื่อกับช่วงวันหายไป
 * ```
 * **ทุกอย่างอื่นรอดหมด** — 62 จุดแวะ · 11 วัน · ที่พัก · ตั๋ว · เช็คลิสต์ · แบนเนอร์ "เน็ตหลุด"
 * · ต้นเหตุ: `app/summary/page.tsx` กับ `components/TripHeader.tsx` ยิง `fetch("/api/engine/trips")`
 *   ตรง ๆ ใน `useEffect` **ไม่ผ่านชั้นแคชเลย** (บล็อกเดียวกันคัดลอกกันมา — คอมเมนต์ในไฟล์แรกเขียนเองว่า
 *   *"เหมือน `TripHeader.tsx`"*)
 *
 * ## 🎯 ข้อมูลอยู่ในเครื่องอยู่แล้ว — **หน้าจอเอื้อมไม่ถึงเพราะคนละคีย์คนละเส้นทาง**
 * `useTripCatalogCities` ยิง endpoint **เดียวกัน** และแคชผลไว้แล้วตั้งแต่ `B6`
 * · รูปเดียวกับที่ไฟล์นั้นเขียนไว้เอง (*"แคชถูกต้องแต่เอื้อมไม่ถึงเพราะประตูปิดก่อน"*) **แค่ย้ายจาก
 *   ชั้น *ประตู* มาที่ชั้น *คีย์***
 *
 * ## 🔴 เก็บ *หัวทริปใบเดียว* ไม่ใช่รายการทริปทั้งบัญชี — และนี่คือเหตุผลด้านความปลอดภัย ไม่ใช่ขนาด
 * `/api/engine/trips` คืน **ทริปทุกใบของผู้ใช้** · `HomeScreen` เก็บทั้งก้อนไว้ที่คีย์ระดับบัญชี
 * (`tripList`) พร้อม `ownerId` และมีด่านล้างเมื่อเจ้าของเปลี่ยน (`HomeScreen.tsx:214`)
 * 🎯 **อ่านคีย์นั้นตรง ๆ จากหน้าทริป = เอาด่านนั้นออกจากเส้นทาง** — ผู้ใช้ที่ deep-link เข้า
 * `/trip/<id>/summary` โดยไม่ผ่านหน้าแรกเลย จะไม่มีใครล้างให้
 * · ✅ ที่นี่จึงเก็บ **เฉพาะหัวของทริปนั้น** ที่ `tripKey(tripId, "tripMeta")` — **รูปเดียวกับ
 *   `catalogCities` เป๊ะ** ซึ่งเขียนเหตุผลเดียวกันไว้ (*"`rows` คือรายการทริปทุกใบของผู้ใช้"*)
 * · `signOut()` ล้างทั้งสองที่เก็บอยู่แล้ว (`clearAllCaches()` + `clearOfflineStore()` · `signIn.ts:82-89`)
 *
 * ⚠️ **ช่องที่ *ยัง* เหลือ และไม่ใช่ของใหม่ที่ไฟล์นี้สร้าง:** *"ล็อกอินบัญชีใหม่บนเครื่องเดิมโดยไม่ signOut"*
 * — ด่านของ `HomeScreen` ล้างเฉพาะ `localStorage` ไม่ได้แตะ IndexedDB → `catalogCities` ของทริปเก่า
 * ก็ค้างเหมือนกันวันนี้ · **ไฟล์นี้รับสภาพเดียวกัน ไม่ได้ทำให้แย่ลง** แต่ควรมีคนแก้ที่ชั้นนั้น (P1 รับทราบแล้ว)
 */
export function useTripMeta(tripId: string | null): TripMeta | null {
  const [result, setResult] = useState<{ forTripId: string; meta: TripMeta } | null>(null);

  useEffect(() => {
    if (!tripId) return;
    const id = tripId;
    let cancelled = false;

    // `async function` ครอบ — `setState` ตรง ๆ ในเอฟเฟกต์ผิด `react-hooks/set-state-in-effect`
    async function load() {
      const key = tripKey(id, "tripMeta");
      await hydrateThenFetch<TripMeta>({
        readCache: () => storeGet<TripMeta>(key),
        fetchFresh: async () => {
          const r = await fetch("/api/engine/trips");
          if (!r.ok) throw new Error(`trips ${r.status}`);
          const rows = (await r.json()) as TripRow[];
          const trip = rows.find((t) => t.id === id);
          // 🔴 เก็บเฉพาะหัวของทริปนี้ ไม่ใช่ `rows` ทั้งก้อน (เหตุผลอยู่หัวไฟล์)
          return {
            title: trip?.title ?? null,
            startDate: trip?.start_date ?? null,
            endDate: trip?.end_date ?? null,
          };
        },
        writeCache: (meta) => storeSet(key, meta),
        onWriteFailed: () => noteCacheFailure("offlineStore/tripMeta/write", { code: "idb" }),
        applyCache: (meta) => setResult({ forTripId: id, meta }),
        applyFresh: (meta) => setResult({ forTripId: id, meta }),
        // 🔴 ยิงล้มและไม่มีแคช → `null` = *ยังไม่รู้* · ผู้เรียกตกไปที่ป้ายกลาง ("ทริปนี้")
        //    ซึ่งเป็นพฤติกรรมเดิมเป๊ะ — ไม่ใช่หน้าจอ error
        applyError: () => setResult(null),
        isCancelled: () => cancelled,
      });
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return result?.forTripId === tripId ? result.meta : null;
}
