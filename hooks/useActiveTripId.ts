"use client";

import { useEffect, useState } from "react";
import { chooseSoleTrip } from "@/lib/engine/tripChoice";
// 🔴 ไม่ import `readCache` มาที่นี่โดยตั้งใจ — การอ่าน `lastTripId` ต้องผ่าน `readOwnedCache` เท่านั้น
//    (`lib/__tests__/lastTripIdOwnerGate.test.ts` บังคับ) · เหลือไว้เฉพาะฝั่ง *เขียน*/*ล้าง* ซึ่งไม่ได้เสิร์ฟข้อมูลให้ใคร
import { writeCache, clearCache } from "@/lib/localCache";
import { readDeviceOwner, readOwnedCache } from "@/lib/auth/deviceOwner";

/** localStorage key เก็บ tripId ล่าสุดที่ resolve สำเร็จ (ไม่ว่าจาก route หรือ fallback) — เขียนใน
 *  `useActiveTripId()` เองทุกครั้งที่ได้ `"ready"` ไม่มีฟังก์ชันแยกให้เรียกจากที่อื่น (จุดเดียว ไม่ซ้ำ) */
const LAST_TRIP_ID_KEY = "lastTripId";

export type ActiveTripState =
  | { status: "loading" }
  | { status: "ready"; tripId: string }
  | { status: "none" }
  | { status: "ambiguous"; tripIds: string[] }
  /** ออฟไลน์ตั้งแต่เปิดแอปครั้งแรก ไม่เคยมี tripId ให้ใช้เลย — ต่างจาก `"error"` ตรงข้อความ (P1 · `E5`) */
  | { status: "offline-first-launch" }
  | { status: "error"; message: string };

/**
 * 🔴 **ตัวตัดสิน "ทริปไหน" ตัวเดียวของทั้งแอป — `resolveTripId()` ด้านล่าง** (P1 ขอ, `E5`)
 *
 * มีคำตอบสามแหล่งสำหรับคำถามเดียวกัน ("ทริปไหน"): route params (`/trip/[tripId]`) · localStorage
 * (`lastTripId`, หน้า bare) · `chooseSoleTrip()` (fallback) — **ถ้าลำดับ fallback ถูกเขียนซ้ำที่ไหนอีก
 * แม้แต่ที่เดียว วันหนึ่งมันจะต่างกันแล้วผู้ใช้เห็นคนละทริประหว่างสองหน้า** ซึ่งเป็นรูปเดียวกับ
 * `storageKeyOf`/`dayBridge`/`hotelRangeKey` ที่ไล่ปิดกันมาทั้งวัน — `useActiveTripId()` (ฮุคเดียว)
 * เรียก `resolveTripId()` (ฟังก์ชันตัดสินใจล้วน) ตัวเดียวกันไม่ว่าจะมี `fromRoute` หรือไม่
 */
export function useActiveTripId(opts: { fromRoute?: string } = {}): ActiveTripState {
  const { fromRoute } = opts;
  const [state, setState] = useState<ActiveTripState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let trips: { id: string }[];
      try {
        const res = await fetch("/api/engine/trips");
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: `เปิดรายการทริปไม่ได้ (${res.status})` });
          return;
        }
        trips = (await res.json()) as { id: string }[];
      } catch {
        // 🔴 `fetch` ที่ throw คือออฟไลน์จริง (คนละเคสกับ `!res.ok`) — resolveTripId ตัดสินว่าจะแสดงอะไร
        if (cancelled) return;
        /**
         * 🔴 **`E6-AC14` — กิ่งนี้เป็นกิ่งเดียวที่เสิร์ฟ `lastTripId` โดยไม่มีเซิร์ฟเวอร์มายืนยัน**
         *
         * กิ่งออนไลน์ข้างล่างปลอดภัยอยู่แล้ว: `resolveTripId` เทียบ `cachedId` กับ `trips` ที่เซิร์ฟเวอร์
         * คืนมา (ผ่าน RLS ของผู้ใช้จริง) → id ของเจ้าของคนก่อนถูกคัดออกเอง · **กิ่งนี้ไม่มีตัวเทียบนั้น**
         *
         * ## ⚠️ ทำไมสองฝั่งของการเทียบมาจากตราเหมือนกัน — และทำไมมันไม่ใช่ "เทียบค่ากับตัวเอง"
         * 🎯 **การป้องกันเกิดตอน *ออนไลน์* · ตอนออฟไลน์เราแค่ *ใช้ผล* ของมัน**
         * ออฟไลน์ B มีตัวตนบนเครื่องนี้ไม่ได้ถ้าไม่เคยล็อกอิน — และการล็อกอิน **ต้องออนไลน์** ซึ่งเป็น
         * วินาทีที่ `stampDeviceOwner` อัปเดตตราและล้างข้อมูลของ A ไปแล้ว
         * · 🔴 **สิ่งที่กิ่งนี้กันจริง ๆ คือกรณีตราเป็น `null`** (รอบแรกหลัง deploy · ล้าง `localStorage` มา ·
         *   ยังไม่เคยผ่าน auth event เลย) = *ไม่รู้ว่าข้อมูลนี้ของใคร* → **ไม่เสิร์ฟ** (fail closed)
         *   **ถ้าลบการเทียบทิ้งเพราะดู "ไร้ประโยชน์" กิ่งนั้นจะหายไปด้วย**
         *
         * ## 🔴 ห้ามเปลี่ยนไปเอา `viewerId` จาก `supabase.auth.getSession()` — วัดแล้ว 2 เหตุ
         * token หมดอายุ + ออฟไลน์ → คืน `session: null` (**เจ้าของตัวจริงจะไม่เห็นอะไรเลย**)
         * และ **ใช้เวลา ~25 วินาที** เพราะมัน retry การ refresh → จอค้างก่อนล้มเหลว
         * · ⚠️ เหตุที่สองยืนอยู่ได้แม้ไลบรารีจะแก้เหตุแรก · รายละเอียดในสัญญาของ `readOwnedCache`
         */
        const cachedId = readOwnedCache<string>(LAST_TRIP_ID_KEY, readDeviceOwner());
        setState(cachedId ? { status: "ready", tripId: cachedId } : { status: "offline-first-launch" });
        return;
      }
      if (cancelled) return;

      /**
       * 🔴 กิ่งออนไลน์ก็อ่านผ่านด่านเดียวกัน **ทั้งที่ `resolveTripId` กรอง id ของคนอื่นออกอยู่แล้ว**
       * เหตุผลไม่ใช่ความปลอดภัยเพิ่ม แต่คือ **ทำให้คุณสมบัติที่ตรวจได้เป็นจริงทั้งไฟล์:**
       * ***`LAST_TRIP_ID_KEY` ถูกอ่านผ่าน `readOwnedCache` เท่านั้น ไม่มีข้อยกเว้น***
       * · ถ้าเหลือ `readCache` ดิบไว้สักจุด **ด่านจะต้องรู้ว่าจุดไหน "ถูก" ซึ่งแปลว่าต้องมีทะเบียน**
       *   และทะเบียนคือสิ่งที่เราเลี่ยงมาทั้งคืน · 🎯 *กฎที่ไม่มีข้อยกเว้น ตรวจด้วยตาได้ · กฎที่มีข้อยกเว้นต้องมีคนดูแล*
       * · ราคาที่จ่าย: ตราเป็น `null` ตอนออนไลน์ (รอบแรกหลัง deploy) → ทิ้ง `cachedId` ไปหนึ่งครั้ง
       *   **ไม่ใช่ข้อมูลหาย** — `resolveTripId` ยังมี `trips` จากเซิร์ฟเวอร์ให้เลือกต่อได้ตามปกติ
       */
      const cachedId = readOwnedCache<string>(LAST_TRIP_ID_KEY, readDeviceOwner());
      const result = resolveTripId(trips, { fromRoute, cachedId });
      if (result.clearCache) clearCache(LAST_TRIP_ID_KEY);
      else if (result.state.status === "ready") writeCache(LAST_TRIP_ID_KEY, result.state.tripId);
      setState(result.state);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [fromRoute]);

  return state;
}

/**
 * ฟังก์ชันตัดสินใจล้วน (ไม่ทำ side effect) — แยกจาก `useActiveTripId` เพื่อให้ทดสอบได้ตรง ๆ ไม่ต้อง mock
 * `fetch`/`localStorage` · เรียกจากฮุคเดียวเท่านั้น ไม่มีที่อื่นเขียนลำดับ fallback ซ้ำ
 *
 * ลำดับ: `fromRoute` (ถ้ามีและยังใช้ได้จริง) → `cachedId` (ถ้ามีและยังใช้ได้จริง) → `chooseSoleTrip()`
 *
 * 🔴 **`fromRoute`/`cachedId` ที่ไม่อยู่ใน `trips` ที่เห็นได้จริง = ใช้ไม่ได้แล้ว** (ถูกถอนจากทริป · ทริป
 * ถูกลบ · เปิดคนละบัญชี) — ต้องตกไป `chooseSoleTrip()` ทันที ไม่ใช่ render ต่อด้วย id ที่ตายแล้ว (P1 ขอ)
 * `clearCache: true` บอกผู้เรียกว่าต้องล้าง `lastTripId` ทิ้ง เพราะค่าที่จำไว้เคยถูกใช้ (ไม่ว่าจะมาจาก
 * route หรือ storage) กลายเป็นค่าที่ใช้ไม่ได้แล้ว
 */
export function resolveTripId(
  trips: readonly { id: string }[],
  opts: { fromRoute?: string; cachedId?: string | null }
): { state: ActiveTripState; clearCache: boolean } {
  const known = new Set(trips.map((t) => t.id));
  const routeStale = Boolean(opts.fromRoute) && !known.has(opts.fromRoute!);

  // ① fromRoute ถ้ามีและยังใช้ได้ → ใช้เลย ② cachedId ถ้ายังใช้ได้ → รองลงมา (แม้ fromRoute จะเก่าไปแล้ว —
  // บุ๊กมาร์กทริปที่ลบไปแล้วไม่ควรทำให้พลาดทริปล่าสุดที่ยังเปิดได้จริงอยู่ในเครื่องเดียวกัน)
  if (opts.fromRoute && known.has(opts.fromRoute)) {
    return { state: { status: "ready", tripId: opts.fromRoute }, clearCache: false };
  }
  if (opts.cachedId && known.has(opts.cachedId)) {
    return { state: { status: "ready", tripId: opts.cachedId }, clearCache: routeStale };
  }

  const hadStaleId = routeStale || Boolean(opts.cachedId);
  const resolved = chooseSoleTrip(trips);
  if (resolved.ok) return { state: { status: "ready", tripId: resolved.tripId }, clearCache: hadStaleId };
  if (resolved.reason === "ambiguous") {
    return { state: { status: "ambiguous", tripIds: resolved.tripIds }, clearCache: hadStaleId };
  }
  if (resolved.reason === "none") return { state: { status: "none" }, clearCache: hadStaleId };
  return { state: { status: "error", message: resolved.message }, clearCache: hadStaleId };
}
