"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { City } from "@/data/itinerary";
import { supabaseConfigured } from "@/lib/supabase";
import { useTripDays } from "@/hooks/useTripDays";
import { toOvernightOverrides } from "@/lib/engine/overnightShape";
import { writeGuard } from "@/lib/writeGuard";
import { readTripCache, writeTripCache } from "@/lib/localCache";
import { showToast } from "@/lib/toast";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";

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
  // 🔴 `E6-AC11` — วันของทริปมาจาก provider เดียว ไม่ยิงเอง (ดู `hooks/useTripDays.tsx`)
  const { rows, bridge } = useTripDays();

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว
    // 🔴 **ไม่มี `async`/`cancelled` แล้ว** — `E6-AC11` ย้ายการยิง `/days` ไป provider
    //    เอฟเฟกต์นี้จึงเป็นการ *แปลงค่าที่มีอยู่แล้ว* ล้วน ๆ · ไม่มี await = ไม่มีการแข่งกันให้ยกเลิก
    // 🔴 `rows === null` = **ยังไม่ได้คำตอบ หรืออ่านไม่ได้** — ไม่ใช่ "ทริปไม่มีวัน" (`[]` ต่างหากที่แปลว่านั้น)
    //    ปล่อยผ่านเป็น `[]` ตรงนี้จะทำให้แคชถูกทับด้วยผลว่าง ซึ่งเป็นบั๊กที่ `reportDayBridgeDropIfAny` กันอยู่

    function apply() {
      const cached = readTripCache<Overrides>(activeTripId, "overnightOverrides");
      if (cached) {
        setOverrides(cached);
        setLoaded(true);
      }

      // 🔴 **`E6-AC11` (30 ส.ค. 2026 · P3): เลิกยิง `/days` เอง — อ่านจาก `useTripDays()` แหล่งเดียว**
      //    เดิม hook นี้ยิงเองแล้วสร้าง `buildDayBridge([], rows)` ใบของตัวเอง เหมือนอีก 3 ตัว
      //    → สะพาน 4 ใบที่ต้องเพี้ยนพร้อมกันถึงจะมีคนเห็น · ใบนี้เพี้ยนไปแล้วจริงเมื่อวันเดียวกัน
      //      (`bridge.matched` เป็น `0` เสมอ → แถบ 🚧 ค้าง + แคชไม่เคยถูกเขียน)
      if (!rows) return void setLoaded(true);

      // 🔴 **สะพานว่าง ≠ ไม่มีใครตั้งค่าที่นอน** — ถ้าไม่บอก หน้าจอจะเงียบเหมือนไม่มีข้อมูล
      //    ทั้งที่จริงคือ `E7` ยังไม่ได้ย้ายวันมาสักวัน (`P-21` ในรูปที่จะกัดตอน cutover)
      // `dayBridgeWarning` ถูกถอด: ทุกกิ่งของมันอิง `ITINERARY` ทั้งหมด → ส่ง `[]` แล้ว
      // **มันคืน `null` เสมอตามนิยาม** · ด่านที่ทริกเกอร์ไม่ได้ ไม่ใช่ด่าน (`P-50`)
      reportDayBridgeWarningIfAny(bridge);

      // สะพานเป็นคนถือแมปวัน — ห้ามประกอบเองซ้ำที่นี่
      // ⚠️ เดิมคอมเมนต์นี้เขียนว่าแมปมี `"d0"→uuid` **และ** `uuid→uuid` — **หมดอายุตั้งแต่ส่ง `[]`**
      //    ตอนนี้เหลือ `uuid→uuid` ล้วน · ฝั่ง `"d0"` ไม่มีผู้ผลิตและไม่มีผู้บริโภคแล้ว
      // 🔴 เหตุผลอยู่ที่หัว `dayBridge.ts`: *"ถ้าแต่ละตัวแปลงเอง มันจะแปลงไม่เหมือนกันสักวัน"*
      //    วันนั้นมาถึงแล้วจริง ๆ — `useStops` กับ `useDaySettings` เคยแปลงกันคนละแบบอยู่พักหนึ่ง
      // ⚠️ **ตัวนี้ยังไม่มีทางเข้าจาก UI สำหรับทริปแพลตฟอร์ม** (`onOvernightCityChange` ถูกส่งเฉพาะ
      //    วันที่มี `day.overnightOptions` ซึ่งวันจากฐานไม่มี) → **ยังยิงยืนยันจากหน้าจอไม่ได้**
      //    แก้ล่วงหน้าเพราะเป็นบรรทัดเดียวกับอีกสองฮุคที่วัดแล้วว่าพัง ไม่ใช่เพราะเห็นอาการ
      dayIdRef.current = new Map(bridge.dayKeyToDbId);

      const next = toOvernightOverrides(rows, bridge) as Overrides;
      setOverrides(next);
      // 🔴 ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — เทียบจำนวนวันที่ฐานมี (`rows.length`)
      // กับจำนวนวันที่สะพาน**แมปได้จริง**
      //
      // 🔴 **แก้ 30 ส.ค. 2026 (P3) — เดิมใช้ `bridge.matched` และมันเป็น `0` เสมอตามนิยาม**
      //    `matched` นับ *คู่ที่จับได้ระหว่างวันในไฟล์กับวันในฐาน* โดยไล่จาก `legacyDays`
      //    ตั้งแต่ผู้เรียกเปลี่ยนเป็น `buildDayBridge([], rows)` (P2 · 28 ส.ค.) **`legacyDays` ว่างเสมอ
      //    → `matched === 0` เสมอ** → `reportDayBridgeDropIfAny(11, 0)` = `true` **ทุกครั้งที่โหลด**
      //    ผลสองอย่าง ทั้งคู่เงียบ:
      //      ① แถบ 🚧 "ยังแสดงไม่ได้" ติดค้างถาวร (ธง `rowsDropped` **ตั้งได้ ล้างไม่ได้** โดยตั้งใจ)
      //      ② `writeTripCache` **ไม่เคยถูกเรียกเลย** → ค่าที่นอนไม่เคยลงแคช → อ่านออฟไลน์ไม่เห็น
      //    🎯 **ไม่มีบรรทัดไหนที่นี่เปลี่ยนเลย — *ความหมายของค่าที่รับมา* เปลี่ยนใต้เท้า**
      //    · คอมเมนต์เหนือขึ้นไป 8 บรรทัดจับ expiry ฝาแฝดของมันได้แล้ว (`dayKeyToDbId` "หมดอายุตั้งแต่ส่ง `[]`")
      //      **แต่ `matched` ที่อยู่ในบรรทัดถัดมาไม่ถูกตรวจ** — เจอตอน `B6` เปิดหน้าจริงแล้วแถบยังค้าง
      //    ✅ ตัวที่ถูกคือ `dayKeyToDbId.size` = จำนวนวันที่แมปได้จริง (uuid→uuid หนึ่งตัวต่อวันในฐาน)
      if (!reportDayBridgeDropIfAny(rows.length, bridge.dayKeyToDbId.size)) {
        writeTripCache(activeTripId, "overnightOverrides", next);
      }
      setLoaded(true);
    }

    apply();
  }, [tripId, rows, bridge]);

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
