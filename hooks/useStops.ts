"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseConfigured, supabase, type TripStop } from "@/lib/supabase";
import { buildUuidToDayKey, mapStopRows } from "@/hooks/dayKeyMaps";
import { useTripDays } from "@/hooks/useTripDays";
import { readHandoff, writeHandoffNoisily } from "@/lib/engine/cacheHandoff";
import { writeGuard } from "@/lib/writeGuard";
import { showToast } from "@/lib/toast";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";
import { parseStopsPayload, shouldCacheSideMap } from "@/lib/engine/stopsPayload";
import type { Place } from "@/data/places";

/**
 * จุดแวะของแผน — **`E3` ผ่าน route แล้ว** · `D6`
 *
 * ## 🔴 `order_index` ไม่ใช่ค่าที่เก็บอีกต่อไป
 * `D6` เปลี่ยนเป็นคีย์เรียงได้ (`rank`) ตั้งแต่ `E2` · **route คำนวณ `order_index` จากตำแหน่งให้**
 * และ **เซิร์ฟเวอร์เป็นเจ้าของ `rank`** — ฝั่งนี้พูดเป็น *ตำแหน่ง* เท่านั้น
 *
 * 🎯 **ผลที่ `D6` ซื้อมาอยู่ตรงนี้:** ลากจุดแวะหนึ่งจุด **เขียนแถวเดียว**
 * ของเดิมต้องเลื่อน `order_index` ของทั้งวัน → **สองคนลากพร้อมกันเขียนทับกันทั้งชุด**
 * · `shiftForInsert` ที่เคยเลื่อนทั้งวันจึง **หายไปทั้งฟังก์ชัน ไม่ใช่ถูกแปลง**
 *
 * ## สะพาน `"d0"` → uuid อยู่ฝั่งนี้ (`P-72`) · slug → uuid อยู่ฝั่ง route
 * เลือกฝั่งตาม **ข้อมูลอยู่ที่ไหน**: `"d0"` อยู่ในไฟล์ TS · `legacy_slug` อยู่ในฐาน
 */
/** อ้างอิงคงที่ — คืน `[]` ใหม่ทุกครั้งจะทำให้ผู้เรียกที่ใช้ `useMemo` คำนวณใหม่ทุก render */
const EMPTY_STOPS: TripStop[] = [];

/** identity คงที่ — `useMemo` ของผู้เรียกที่ขึ้นกับ side-map จะได้ไม่ re-run ทุกรอบ render */
const EMPTY_CATALOG: Record<string, Place> = {};

function sortStops(stops: TripStop[]) {
  return [...stops].sort((a, b) =>
    a.day_id === b.day_id ? a.order_index - b.order_index : a.day_id.localeCompare(b.day_id)
  );
}

type StopDto = Omit<TripStop, "day_id" | "plan_id"> & { trip_day_id: string };

/** 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
export function useStops(tripId: string | null, planId: string | null) {
  const [stops, setStops] = useState<TripStop[]>([]);
  /**
   * side-map จาก `/stops` (`E6-AC13`) — **ไม่แคช และตั้งใจไม่แคชในคอมมิตนี้**
   * 🔴 คีย์แคชเดิม `stops:<planId>` เก็บ `TripStop[]` มาตั้งแต่ต้น · ยัด `places` รวมเข้าไป
   * = ผู้ใช้ที่อัปเดตโค้ดตอนออนไลน์แล้วออฟไลน์ทันที มีแคชรูปเก่าที่โค้ดใหม่อ่านไม่ออก
   * → คีย์แยก (`stopPlaces:<planId>`) มาทีหลังพร้อมเคสของมัน · **ตอนนี้ออฟไลน์ = ไม่มี side-map**
   *   ซึ่งเสื่อมไปที่ `PLACES` สถิตย์ + `customPlaces` (ที่แคชอยู่แล้ว) ไม่ใช่หน้าพัง
   */
  const [catalogPlaces, setCatalogPlaces] = useState<Record<string, Place>>(EMPTY_CATALOG);

  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const tripIdRef = useRef<string | null>(null);
  // 🔴 `E6-AC11` — วันของทริปมาจาก provider เดียว ไม่ยิงเอง (ดู `hooks/useTripDays.tsx`)
  const { rows: dayRows, bridge } = useTripDays();
  const dayToUuid = useRef<Map<string, string>>(new Map());
  const uuidToDay = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 🔴 **ของสดลงจอไปแล้วหรือยัง — `E6-AC7`** · รูปเดียวกับ `useBookings` (เหตุผลเต็มอยู่ที่นั่น)
   * `init()` ไม่ได้ยิงเอง — การยิงอยู่ที่ `reload()` ซึ่งเอฟเฟกต์ที่สองเรียกเมื่อสะพานวันพร้อม
   * · ธงใบเดียวครอบ **ทั้งสองคีย์** (`stops` · `stopPlaces`) เพราะ `reload()` ลงจอพร้อมกันทั้งคู่
   */
  const freshApplied = useRef(false);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  // ตรรกะจริงอยู่ใน `hooks/dayKeyMaps.ts` เพื่อให้ยิงเทสต์ได้ตรง ๆ — **จุดเรียกนี้คือที่ที่บั๊กเกิด
  // และเป็นที่ที่เทสต์เข้าไม่ถึงตอนนั้น** (P4 ชี้ · 28 ส.ค. 2026)
  const mapRows = useCallback(
    (rows: StopDto[]): TripStop[] =>
      mapStopRows(rows, uuidToDay.current, planId ?? ""),
    [planId]
  );

  const reload = useCallback(async () => {
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId || !planId) return;
    /**
     * 🔴 **อ่านผ่าน `parseStopsPayload` ไม่ใช่ `as StopDto[]` ตรง ๆ** (`E6-AC13` · 2 ก.ย. 2026)
     * `AC13` กำลังจะเปลี่ยนคำตอบของ route นี้เป็น `{ stops, places }` — **อาเรย์ → อ็อบเจกต์**
     * ไคลเอนต์ที่เปิดค้างตอน deploy จะอ่านอ็อบเจกต์ด้วยโค้ดที่คาดอาเรย์ → `rawRows.length` เป็น
     * `undefined` → **จุดแวะหายทั้งวันโดยไม่มี error** · ต่อสายฝั่งอ่านไว้ก่อน route เปลี่ยน
     * จึงไม่มีหน้าต่างที่สองฝั่งไม่ตรงกันเลย ไม่ใช่แค่หน้าต่างที่แคบลง
     * · 📌 วันนี้ route ยังคืนอาเรย์ → `payload.places` เป็น `{}` เสมอ และยังไม่มีใครอ่านมัน
     */
    const payload = parseStopsPayload<StopDto>(
      await fetchReadJson<unknown>(
        `/api/engine/trips/${tripId}/stops?planId=${encodeURIComponent(planId)}`
      )
    );
    if (!payload) return;
    const rawRows = payload.stops;
    // 🔴 ว่าง = `{}` ที่ identity คงที่ ไม่ใช่อ็อบเจกต์ใหม่ทุกครั้ง (ดู `EMPTY_CATALOG`)
    setCatalogPlaces(Object.keys(payload.places).length > 0 ? payload.places : EMPTY_CATALOG);
    const mapped = sortStops(mapRows(rawRows));
    setStops(mapped);
    // 🔴 ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — state ในเครื่องอัปเดตได้ปกติ (จะถูกต้องเองเมื่อ
    // สะพานดีขึ้น) แต่แคชออฟไลน์ต้องไม่ถูกทำลายด้วยความว่างที่เกิดจากบั๊ก ไม่ใช่จากทริปที่ไม่มีจุดแวะจริง
    freshApplied.current = true; // 🔴 ตั้ง **หลัง** ลงจอจริง (ดูเหตุผลที่ประกาศธง) · ครอบทั้ง `stops` และ `stopPlaces`
    if (!reportDayBridgeDropIfAny(rawRows.length, mapped.length)) {
      writeHandoffNoisily(`stops:${planId}`, mapped, "stops");
    }
    /**
     * 🔴 **คีย์แยกใบ ไม่ยัดรวมกับ `stops:<planId>`** (`E6-AC13`)
     * คีย์เดิมเก็บ `TripStop[]` มาตั้งแต่ต้น · ยัด `places` เข้าไป = ผู้ใช้ที่อัปเดตโค้ดตอนออนไลน์
     * แล้วออฟไลน์ทันที **มีแคชรูปเก่าที่โค้ดใหม่อ่านไม่ออก** และต้องมีโค้ดแปลงรุ่นที่ลบไม่ได้ตลอดกาล
     * (ไม่มีวันรู้ว่าเครื่องสุดท้ายอัปเดตหรือยัง) · **แยกคีย์ = แคชเก่าอ่านได้โดยนิยาม**
     *
     * 🔴 **`{}` ห้ามทับของเดิม** — เป็นสัญญาณของการเสื่อม ไม่ใช่ข้อมูล
     * route คืน `places: {}` เมื่อคิวรีคลังล้ม (`console.error` ฝั่งเซิร์ฟเวอร์ · จุดแวะยังมาครบ)
     * → ทับแคชด้วยมัน = **คลังล่มหนึ่งครั้ง แล้วผู้ใช้เสียชื่อสถานที่ตอนออฟไลน์ไปจนกว่าจะออนไลน์อีกครั้ง**
     * · รูปเดียวกับกฎ *ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ* บรรทัดบน — คนละสาเหตุ เหตุผลเดียวกัน
     */
    if (shouldCacheSideMap(payload.places)) {
      writeHandoffNoisily(`stopPlaces:${planId}`, payload.places, "stopPlaces");
    }
  }, [planId, mapRows]);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId || !planId) return;
    const channelName = `trip_stops_changes_${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    /**
     * 🔴 **`cancelled` กลับมาเพราะการอ่านแคชเป็น async แล้ว** (`E6-AC7` · P7 · 4 ก.ย. 2026)
     * คอมเมนต์เดิม *"ไม่มี `await` เหลือแล้ว … `cancelled` ถูกถอด"* จริงเฉพาะตอน `localStorage` อ่าน sync
     */
    let cancelled = false;

    /**
     * 🔴 **การอ่านแคชต้องไม่ขวาง `subscribe()`** — เหตุผลเต็มอยู่ที่ `useDaySettings.ts` (บล็อกเดียวกัน)
     * ย่อ: `await` การอ่านดิสก์ก่อน `subscribe()` แปลว่า **ดิสก์ที่ไม่ตอบ = ไม่มี realtime ตลอดกาล**
     * · `daySettingsSubscribe.test.tsx` (P3) จับฉบับแรกของผมได้ **และของจริงแย่กว่าที่มันวัด**
     *
     * 🔴 **อ่านสองคีย์ *พร้อมกัน* ไม่ใช่ต่อกัน** — คีย์แยกใบตั้งแต่ `E6-AC13`
     * ต่อกัน = รอสองรอบดิสก์ ซึ่งหลัง `AC7` แต่ละรอบเป็น async **สองชั้น** (IDB → ฝาแฝด)
     * ⇒ หน่วงจนของสดชนะเกือบทุกครั้ง **แล้วแคชจะไม่เคยได้ขึ้นจอเลยตอนออนไลน์**
     */
    function hydrateFromCache() {
      void Promise.all([
        readHandoff<Record<string, Place>>(`stopPlaces:${planId}`),
        readHandoff<TripStop[]>(`stops:${planId}`),
      ]).then(([cachedPlaces, cached]) => {
        if (cancelled) return;
        // 🔴 **ใส่แคชก็ต่อเมื่อของสดยังไม่มา** — `reload()` อยู่คนละเอฟเฟกต์ (รอสะพานวัน) จึงแข่งกันได้
        //    ตอน `localStorage` ข้อนี้จริงฟรี ๆ เพราะอ่าน sync · IndexedDB ไม่แถมมาให้ (ดู `useBookings`)
        if (freshApplied.current) return;
        // ไม่มีแคช = ไม่มี side-map (เสื่อมไปที่ `PLACES` + `customPlaces`) ไม่ใช่ error
        if (cachedPlaces) setCatalogPlaces(cachedPlaces);
        if (cached) {
          setStops(sortStops(cached));
          setLoaded(true);
        }
      });
    }

    function init() {
      hydrateFromCache();

      // 🔴 **`E6-AC11` ก้าวที่ 3 (30 ส.ค. 2026 · P3): เลิกยิง `/days` เอง เลิกสร้างสะพานเอง**
      //    ย้ายไปเอฟเฟกต์แยกข้างล่างที่ขึ้นกับ `useTripDays()` — **เอฟเฟกต์นี้เหลือแค่ แคช + channel**
      //    เหตุผลที่ต้องแยก (ไม่ใช่ความสะอาด): `subscribe()` ต้องเกิดครั้งเดียวต่อ `(tripId, planId)`
      //    ถ้า `rows`/`bridge` หลุดเข้า deps ที่นี่ มันจะสมัครใหม่ทุกครั้งที่ "วัน" เปลี่ยน identity
      //    · เคสนับอยู่ใน `lib/__tests__/daySettingsSubscribe.test.tsx` (โครงเดียวกันทั้งสอง hook)
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_stops" }, () => {
          // 🔴 ไม่แตะ payload — แถวดิบมี `rank` ไม่มี `order_index` และ `trip_day_id` เป็น uuid
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
      noteRealtimeSubscribed("trip_stops");
    }

    freshApplied.current = false; // ธงเป็นของ *(tripId, planId)* คู่ปัจจุบัน — ไม่รีเซ็ตแล้วสลับแผนจะกันแคชของแผนใหม่
    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, planId]);

  /**
   * 🔴 **เอฟเฟกต์ที่สอง — ผูกกับ "วัน" เท่านั้น** (`E6-AC11` ก้าวที่ 3 · 30 ส.ค. 2026 · P3)
   * ต้องตั้ง **สองแมป** ก่อนดึงแถว: `dayToUuid` (ไว้เขียนกลับ) และ `uuidToDay` (ไว้แปลงแถวที่อ่านมา)
   * · `mapStopRows` อ่าน `uuidToDay.current` → ถ้าดึงแถวก่อนตั้งแมป **ทุกแถวจะถูกทิ้งเงียบ**
   *   (`mapStopRows` ข้ามแถวที่หาวันไม่เจอ) — จึงต้องอยู่ในเอฟเฟกต์เดียวกับการเรียก `refetch`
   * · ⚠️ ขอบเขตที่ P1 อนุมัติ: ย้าย *ที่อยู่* ของ effect เท่านั้น — callback/filter ของ subscription คงเดิม
   */
  useEffect(() => {
    if (!supabaseConfigured || !tripId || !planId) return;
    // `rows === null` = ยังไม่ได้คำตอบ/อ่านไม่ได้ — ไม่ใช่ "ทริปไม่มีวัน"
    if (!dayRows) return;
    reportDayBridgeWarningIfAny(bridge);
    dayToUuid.current = new Map(bridge.dayKeyToDbId);
    // เหตุผลที่ห้ามกลับด้าน `dayKeyToDbId` เอง อยู่ใน `hooks/dayKeyMaps.ts` (คีย์ซ้อน → `"d0"` หาย)
    uuidToDay.current = buildUuidToDayKey(dayRows, bridge);
    void refetchRef.current?.();
  }, [tripId, planId, dayRows, bridge]);

  /** เขียนแบบมีเสียง แล้วดึงของจริงมาทับ state ที่เดาไว้ตอนล้ม */
  const call = useCallback(
    async (label: string, run: () => Promise<Response>) => {
      const ok = await writeGuard(label, async () => {
        const res = await run();
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await reload();
      return ok;
    },
    [reload]
  );

  /** เพิ่มจุดแวะที่ตำแหน่งหนึ่ง — **เขียนแถวเดียว** เซิร์ฟเวอร์คำนวณ `rank` ให้ */
  const insertAt = useCallback(
    async (dayId: string, atIndex: number | undefined, body: Record<string, unknown>) => {
      const tripId = tripIdRef.current;
      const tripDayId = dayToUuid.current.get(dayId);
      if (!supabaseConfigured || !tripId || !planId) return undefined;
      if (!tripDayId) {
        // 🔴 วันนั้นยังไม่มีในฐาน — **หยุดและบอก** ไม่ใช่ส่งไปให้ FK ฟ้องแบบอ่านไม่ออก
        console.error("[stops] วันนี้ยังไม่มีในฐาน — E7 อาจยังไม่ได้ย้ายข้อมูล", dayId);
        showToast("error", "วันนี้ยังไม่มีในระบบของทริปนี้ — เพิ่มจุดแวะยังไม่ได้ตอนนี้");
        return undefined;
      }
      let created: TripStop | undefined;
      const ok = await call("เพิ่มจุดแวะ", async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/stops`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, tripDayId, atIndex, ...body }),
        });
        if (res.ok) {
          const dto = (await res.json()) as StopDto;
          created = mapRows([dto])[0];
        }
        return res;
      });
      if (ok) await reload();
      return created?.id;
    },
    [planId, call, reload, mapRows]
  );

  const addStop = useCallback(
    async (
      dayId: string,
      placeId: string,
      addedBy?: string,
      travelMode?: string | null,
      stashed?: { note: string | null; photoUrl: string | null }
    ) =>
      insertAt(dayId, undefined, {
        placeId, addedBy: addedBy ?? null, travelMode: travelMode ?? null,
        note: stashed?.note ?? null, photoUrl: stashed?.photoUrl ?? null,
      }),
    [insertAt]
  );

  const insertStopAt = useCallback(
    async (dayId: string, placeId: string, atIndex: number, addedBy?: string, travelMode?: string | null) =>
      insertAt(dayId, atIndex, { placeId, addedBy: addedBy ?? null, travelMode: travelMode ?? null }),
    [insertAt]
  );

  const insertIntercityAt = useCallback(
    async (
      dayId: string, atIndex: number,
      input: { from: string; to: string; mode: "bus" | "ktx" | "other"; minutes: number },
      addedBy?: string
    ) =>
      insertAt(dayId, atIndex, {
        kind: "intercity", addedBy: addedBy ?? null,
        intercityFrom: input.from, intercityTo: input.to, intercityMode: input.mode,
        dwellMinutes: input.minutes,
      }),
    [insertAt]
  );

  const insertHotelAt = useCallback(
    async (
      dayId: string, atIndex: number,
      input: { hotelPlaceId: string; dwellMinutes: number; travelMode: string | null },
      addedBy?: string
    ) =>
      insertAt(dayId, atIndex, {
        kind: "hotel", addedBy: addedBy ?? null,
        dwellMinutes: input.dwellMinutes, travelMode: input.travelMode,
      }),
    [insertAt]
  );

  const insertTransferAt = useCallback(
    async (
      dayId: string, atIndex: number,
      input: {
        placeId: string; checkinBufferMinutes: number;
        targetTime: string | null; targetLabel: string | null; travelMode: string | null;
      },
      addedBy?: string
    ) =>
      insertAt(dayId, atIndex, {
        kind: "transfer", placeId: input.placeId, addedBy: addedBy ?? null,
        dwellMinutes: input.checkinBufferMinutes, travelMode: input.travelMode,
        transferTargetTime: input.targetTime, transferTargetLabel: input.targetLabel,
      }),
    [insertAt]
  );

  const patch = useCallback(
    async (label: string, stopId: string, body: Record<string, unknown>) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      await call(label, () =>
        fetch(`/api/engine/trips/${tripId}/stops`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: stopId, ...body }),
        })
      );
    },
    [call]
  );

  const updateStopPlace = useCallback(
    async (stopId: string, placeId: string) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, place_id: placeId } : s)));
      // ⚠️ **เปลี่ยนสถานที่ของจุดแวะเดิมไม่รองรับใน route** — `catalog_place_id`/`custom_place_id`
      //    ต้องเลือกทางเดียว และการสลับข้ามชนิดเปลี่ยนความหมายของแถว
      //    → ดึงของจริงมาทับเพื่อไม่ให้หน้าจอค้างอยู่กับค่าที่ฐานไม่รับ
      console.error("[stops] เปลี่ยนสถานที่ของจุดแวะเดิมยังไม่รองรับใน E3 — ลบแล้วเพิ่มใหม่แทน");
      await reload();
    },
    [reload]
  );

  const updateDwellMinutes = useCallback(
    async (stopId: string, dwellMinutes: number | null) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, dwell_minutes: dwellMinutes } : s)));
      await patch("เวลาที่ใช้ที่จุดแวะ", stopId, { dwellMinutes });
    },
    [patch]
  );

  const updateTravelMode = useCallback(
    async (stopId: string, travelMode: string | null) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, travel_mode: travelMode } : s)));
      await patch("โหมดเดินทาง", stopId, { travelMode });
    },
    [patch]
  );

  const updateNote = useCallback(
    async (stopId: string, note: string | null) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, note } : s)));
      await patch("โน้ตของจุดแวะ", stopId, { note });
    },
    [patch]
  );

  const updatePhoto = useCallback(
    async (stopId: string, photoUrl: string | null) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, photo_url: photoUrl } : s)));
      await patch("รูปของจุดแวะ", stopId, { photoUrl });
    },
    [patch]
  );

  /** 🔴 ย้ายไปตำแหน่งที่ `orderIndex` ในวันเดิม — เซิร์ฟเวอร์คำนวณ `rank` ให้ */
  const updateOrderIndex = useCallback(
    async (stopId: string, orderIndex: number) => {
      const stop = stops.find((s) => s.id === stopId);
      const tripDayId = stop ? dayToUuid.current.get(stop.day_id) : undefined;
      if (!stop || !tripDayId || !planId) return;
      await patch("ลำดับจุดแวะ", stopId, { planId, tripDayId, atIndex: orderIndex });
      await reload();
    },
    [stops, planId, patch, reload]
  );

  const reorderStops = useCallback(
    async (dayId: string, orderedStopIds: string[]) => {
      const tripId = tripIdRef.current;
      const tripDayId = dayToUuid.current.get(dayId);
      if (!supabaseConfigured || !tripId || !planId || !tripDayId) return;
      const order = new Map(orderedStopIds.map((id, i) => [id, i]));
      setStops((prev) =>
        sortStops(prev.map((s) => (order.has(s.id) ? { ...s, order_index: order.get(s.id)! } : s)))
      );
      await call("จัดลำดับจุดแวะ", () =>
        fetch(`/api/engine/trips/${tripId}/stops`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, tripDayId, orderedIds: orderedStopIds }),
        })
      );
      await reload();
    },
    [planId, call, reload]
  );

  const moveStopToDay = useCallback(
    async (stopId: string, targetDayId: string) => {
      const tripDayId = dayToUuid.current.get(targetDayId);
      if (!tripDayId || !planId) return;
      await patch("ย้ายจุดแวะข้ามวัน", stopId, { planId, tripDayId });
      await reload();
    },
    [planId, patch, reload]
  );

  const setVisitedAt = useCallback(
    async (stopId: string, visitedAt: string | null) => {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, visited_at: visitedAt } : s)));
      await patch("ติ๊กว่ามาถึงแล้ว", stopId, { visitedAt });
    },
    [patch]
  );

  const markVisited = useCallback(
    (stopId: string) => setVisitedAt(stopId, new Date().toISOString()),
    [setVisitedAt]
  );
  const unmarkVisited = useCallback((stopId: string) => setVisitedAt(stopId, null), [setVisitedAt]);

  const removeStop = useCallback(
    async (stopId: string): Promise<TripStop | undefined> => {
      const tripId = tripIdRef.current;
      const snapshot = stops.find((s) => s.id === stopId);
      setStops((prev) => prev.filter((s) => s.id !== stopId));
      if (!supabaseConfigured || !tripId) return snapshot;
      await call("ลบจุดแวะ", () =>
        fetch(`/api/engine/trips/${tripId}/stops?id=${encodeURIComponent(stopId)}`, { method: "DELETE" })
      );
      return snapshot;
    },
    [stops, call]
  );

  /**
   * กู้จุดแวะคืน — 🔴 **ได้ `id` ใหม่** ด้วยเหตุผลเดียวกับ `useChecklist.restoreItem`
   * ไคลเอนต์ตั้ง `id` ไม่ได้ และแถวเดิมเป็น tombstone ถาวร (`D76`)
   */
  const restoreStop = useCallback(
    async (stop: TripStop) => {
      await insertAt(stop.day_id, stop.order_index, {
        placeId: stop.place_id, kind: stop.kind ?? "place",
        addedBy: stop.added_by, travelMode: stop.travel_mode,
        dwellMinutes: stop.dwell_minutes, note: stop.note, photoUrl: stop.photo_url,
        intercityFrom: stop.intercity_from, intercityTo: stop.intercity_to,
        intercityMode: stop.intercity_mode,
        transferTargetTime: stop.transfer_target_time,
        transferTargetLabel: stop.transfer_target_label,
        visitedAt: stop.visited_at,
      });
    },
    [insertAt]
  );

  return {
    // 🔴 ไม่มีแผน = ไม่มีจุดแวะ · **กรองตอนคืนค่า ไม่ใช่ `setState` ในเอฟเฟกต์**
    //    `react-hooks/set-state-in-effect` ห้ามอันหลัง เพราะมันทำให้ render ซ้อน
    //    (กฎเดียวกับที่จับงานของ P2 เมื่อคืน) · ค่าที่คำนวณได้ ไม่ต้องเก็บเป็น state
    stops: planId ? stops : EMPTY_STOPS,
    /** สถานที่จากคลังที่จุดแวะของแผนนี้อ้างถึง — ป้อน `resolvePlace(id, { customPlaces, catalog })` */
    catalogPlaces,
    loaded,
    addStop,
    insertStopAt,
    insertIntercityAt,
    insertTransferAt,
    insertHotelAt,
    updateStopPlace,
    updateDwellMinutes,
    updateTravelMode,
    updateNote,
    updatePhoto,
    updateOrderIndex,
    reorderStops,
    moveStopToDay,
    markVisited,
    unmarkVisited,
    removeStop,
    restoreStop,
    supabaseConfigured,
  };
}
