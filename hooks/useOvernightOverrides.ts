"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ITINERARY, type City } from "@/data/itinerary";
import { supabaseConfigured } from "@/lib/supabase";
import { chooseSoleTrip } from "@/lib/engine/trip";
import { buildDayBridge, dayBridgeWarning } from "@/lib/engine/dayBridge";
import { toOvernightOverrides, type DayOvernightRow } from "@/lib/engine/overnightShape";
import { writeGuard } from "@/lib/writeGuard";
import { readCache, writeCache } from "@/lib/localCache";

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
 */
export function useOvernightOverrides() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const tripIdRef = useRef<string | null>(null);
  const dayIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;

    async function init() {
      const cached = readCache<Overrides>("overnightOverrides");
      if (cached) {
        setOverrides(cached);
        setLoaded(true);
      }

      const tripsRes = await fetch("/api/engine/trips");
      if (cancelled || !tripsRes.ok) return void setLoaded(true);
      const trip = chooseSoleTrip((await tripsRes.json()) as { id: string }[]);
      if (cancelled || !trip.ok) return void setLoaded(true);
      tripIdRef.current = trip.tripId;

      const res = await fetch(`/api/engine/trips/${trip.tripId}/days`);
      if (cancelled || !res.ok) return void setLoaded(true);
      const rows = (await res.json()) as DayOvernightRow[];
      if (cancelled) return;

      const bridge = buildDayBridge(ITINERARY, rows);
      // 🔴 **สะพานว่าง ≠ ไม่มีใครตั้งค่าที่นอน** — ถ้าไม่บอก หน้าจอจะเงียบเหมือนไม่มีข้อมูล
      //    ทั้งที่จริงคือ `E7` ยังไม่ได้ย้ายวันมาสักวัน (`P-21` ในรูปที่จะกัดตอน cutover)
      const warn = dayBridgeWarning(bridge, ITINERARY.length);
      if (warn) console.warn(`[overnight] ${warn}`);

      dayIdRef.current = new Map(
        ITINERARY.map((d) => [d.id, bridge.toDbId(d.id)]).filter(
          (e): e is [string, string] => e[1] !== null
        )
      );

      const next = toOvernightOverrides(rows, bridge) as Overrides;
      setOverrides(next);
      writeCache("overnightOverrides", next);
      setLoaded(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOvernightCity = useCallback(
    async (dayId: string, city: City) => {
      const tripId = tripIdRef.current;
      const dbDayId = dayIdRef.current.get(dayId);
      if (!supabaseConfigured || !tripId || !dbDayId) {
        // 🔴 ไม่มีวันนั้นในฐาน — **ห้ามอัปเดตหน้าจอเงียบ ๆ** ผู้ใช้จะเชื่อว่าบันทึกแล้ว
        //    (เดิมโค้ดนี้ตั้ง state ก่อนเสมอ แล้วถอนคืนตอนล้ม · ถ้าไม่มีปลายทางเลยก็ไม่ควรตั้งตั้งแต่แรก)
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
        writeCache("overnightOverrides", next);
      }
    },
    [overrides]
  );

  return { overnightOverrides: overrides, loaded, setOvernightCity };
}
