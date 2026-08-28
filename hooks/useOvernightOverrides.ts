"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ITINERARY, type City } from "@/data/itinerary";
import { supabaseConfigured } from "@/lib/supabase";
import { buildDayBridge, dayBridgeWarning } from "@/lib/engine/dayBridge";
import { toOvernightOverrides, type DayOvernightRow } from "@/lib/engine/overnightShape";
import { writeGuard } from "@/lib/writeGuard";
import { readTripCache, writeTripCache } from "@/lib/localCache";
import { showToast } from "@/lib/toast";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

type Overrides = Record<string, City>;

/**
 * คืนที่ยังไม่ล็อกว่านอนเมืองไหน — **`E3` ย้ายมาอ่าน/เขียนผ่าน route แล้ว**
 *
 * ## 🔴 เปลี่ยนที่เก็บตาม `D80` ไม่ใช่แค่เปลี่ยนที่รัน
 * เดิม: `trip_meta.overnight_overrides` แถวเดียว `id=1` เก็บเป็น JSON ก้อนเดียว
 * ใหม่: **`trip_days.overnight_kind` + `overnight_city_id` รายวัน**
 *
 * 🎯 **`D80` แยกสามสถานะที่รูปเดิมยุบเป็นอันเดียว:**
 * ```
 * null    ยังไม่ตัดสิน
 * 'none'  ตั้งใจไม่นอนโรงแรม (นอนบนเครื่อง)
 * 'city'  ตั้งใจนอนเมืองหนึ่ง
 * ```
 * ⚠️ **`Record` ที่ไม่มีคีย์ครอบทั้ง `null` และ `'none'`** — UI เดิมแยกไม่ออก **และแยกไม่ออกมาตลอด**
 * นั่นคือข้อจำกัดที่ `D80` มีไว้แก้ · **`E5` ค่อยเปิดให้เห็นครบ ไม่ใช่ตอนนี้**
 *
 * ## สะพาน `"d0"` → `uuid` อยู่ฝั่งนี้ ไม่ใช่ฝั่ง route
 * route พูด `uuid`/`date` เท่านั้น · `"d0"` เป็นเรื่องของ `data/itinerary.ts` ซึ่งเป็นไฟล์ของเว็บเดิม
 * 🎯 **วันที่ `E5-AC1` มาถึง สะพานหายไปเฉย ๆ โดยไม่ต้องแตะ route**
 * 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม
 */
export function useOvernightOverrides(tripId: string | null) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  // 🔴 สลับทริปแล้วต้องไม่เห็นเมืองที่นอนของทริปเก่า — ดู `useHotels.tsx` สำหรับเหตุผลเต็ม
  //    (provider ไม่ถูก remount ตอนสลับทริป · คีย์แคชที่ scope แล้วแก้ได้แค่ครึ่งเดียว)
  const [shownTripId, setShownTripId] = useState<string | null>(tripId);
  if (shownTripId !== tripId) {
    setShownTripId(tripId);
    setOverrides({});
    setLoaded(!supabaseConfigured);
  }
  const tripIdRef = useRef<string | null>(null);
  const dayIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function
    let cancelled = false;

    async function init() {
      const cached = readTripCache<Overrides>(activeTripId, "overnightOverrides");
      if (cached) {
        setOverrides(cached);
        setLoaded(true);
      }

      const rows = await fetchReadJson<DayOvernightRow[]>(`/api/engine/trips/${tripId}/days`);
      if (cancelled) return;
      if (!rows) return void setLoaded(true);

      const bridge = buildDayBridge(ITINERARY, rows);
      // 🔴 **สะพานว่าง ≠ ไม่มีใครตั้งค่าที่นอน** — ถ้าไม่บอก หน้าจอจะเงียบเหมือนไม่มีข้อมูล
      //    ทั้งที่จริงคือ `E7` ยังไม่ได้ย้ายวันมาสักวัน (`P-21` ในรูปที่จะกัดตอน cutover)
      const warn = dayBridgeWarning(bridge, ITINERARY.length);
      if (warn) console.warn(`[overnight] ${warn}`);
      reportDayBridgeWarningIfAny(bridge);

      // สะพานเป็นคนถือแมปที่ครบ (`"d0"→uuid` **และ** `uuid→uuid`) — ห้ามประกอบเองซ้ำที่นี่
      // 🔴 เหตุผลอยู่ที่หัว `dayBridge.ts`: *"ถ้าแต่ละตัวแปลงเอง มันจะแปลงไม่เหมือนกันสักวัน"*
      //    วันนั้นมาถึงแล้วจริง ๆ — `useStops` กับ `useDaySettings` เคยแปลงกันคนละแบบอยู่พักหนึ่ง
      // ⚠️ **ตัวนี้ยังไม่มีทางเข้าจาก UI สำหรับทริปแพลตฟอร์ม** (`onOvernightCityChange` ถูกส่งเฉพาะ
      //    วันที่มี `day.overnightOptions` ซึ่งวันจากฐานไม่มี) → **ยังยิงยืนยันจากหน้าจอไม่ได้**
      //    แก้ล่วงหน้าเพราะเป็นบรรทัดเดียวกับอีกสองฮุคที่วัดแล้วว่าพัง ไม่ใช่เพราะเห็นอาการ
      dayIdRef.current = new Map(bridge.dayKeyToDbId);

      const next = toOvernightOverrides(rows, bridge) as Overrides;
      setOverrides(next);
      // 🔴 ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — วัดจากจำนวนวันที่สะพานจับคู่ได้จริง
      // (`bridge.matched`) เทียบกับจำนวนวันที่ฐานมีจริง (`rows.length`) ไม่ใช่ผลลัพธ์ที่ toMap ให้มา
      if (!reportDayBridgeDropIfAny(rows.length, bridge.matched)) {
        writeTripCache(activeTripId, "overnightOverrides", next);
      }
      setLoaded(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const setOvernightCity = useCallback(
    async (dayId: string, city: City) => {
      const tripId = tripIdRef.current;
      const dbDayId = dayIdRef.current.get(dayId);
      if (!supabaseConfigured || !tripId || !dbDayId) {
        // 🔴 ไม่มีวันนั้นในฐาน — **ห้ามอัปเดตหน้าจอเงียบ ๆ** ผู้ใช้จะเชื่อว่าบันทึกแล้ว
        //    (เดิมโค้ดนี้ตั้ง state ก่อนเสมอ แล้วถอนคืนตอนล้ม · ถ้าไม่มีปลายทางเลยก็ไม่ควรตั้งตั้งแต่แรก)
        if (supabaseConfigured && tripId) {
          showToast("error", "วันนี้ยังไม่มีในระบบของทริปนี้ — บันทึกที่นอนยังไม่ได้ตอนนี้");
        }
        return;
      }

      const before = overrides;
      const next = { ...overrides, [dayId]: city };
      setOverrides(next); // แถวเดียว จึงถอนคืนตรง ๆ ได้ ไม่ต้องดึงใหม่ทั้งตาราง
      const ok = await writeGuard("เมืองที่นอนคืนนี้", async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/days`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayId: dbDayId, city }),
        });
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) {
        setOverrides(before);
      } else {
        writeTripCache(tripId, "overnightOverrides", next);
      }
    },
    [overrides]
  );

  return { overnightOverrides: overrides, loaded, setOvernightCity };
}
