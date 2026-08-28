"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseConfigured, supabase, type TripStop } from "@/lib/supabase";
import { buildUuidToDayKey, mapStopRows } from "@/hooks/dayKeyMaps";
import { buildDayBridge } from "@/lib/engine/dayBridge";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";
import { showToast } from "@/lib/toast";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

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

function sortStops(stops: TripStop[]) {
  return [...stops].sort((a, b) =>
    a.day_id === b.day_id ? a.order_index - b.order_index : a.day_id.localeCompare(b.day_id)
  );
}

type StopDto = Omit<TripStop, "day_id" | "plan_id"> & { trip_day_id: string };

/** 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
export function useStops(tripId: string | null, planId: string | null) {
  const [stops, setStops] = useState<TripStop[]>([]);

  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const tripIdRef = useRef<string | null>(null);
  const dayToUuid = useRef<Map<string, string>>(new Map());
  const uuidToDay = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const rawRows = await fetchReadJson<StopDto[]>(
      `/api/engine/trips/${tripId}/stops?planId=${encodeURIComponent(planId)}`
    );
    if (!rawRows) return;
    const mapped = sortStops(mapRows(rawRows));
    setStops(mapped);
    // 🔴 ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — state ในเครื่องอัปเดตได้ปกติ (จะถูกต้องเองเมื่อ
    // สะพานดีขึ้น) แต่แคชออฟไลน์ต้องไม่ถูกทำลายด้วยความว่างที่เกิดจากบั๊ก ไม่ใช่จากทริปที่ไม่มีจุดแวะจริง
    if (!reportDayBridgeDropIfAny(rawRows.length, mapped.length)) {
      writeCache(`stops:${planId}`, mapped);
    }
  }, [planId, mapRows]);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId || !planId) return;
    const channelName = `trip_stops_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readCache<TripStop[]>(`stops:${planId}`);
      if (cached) {
        setStops(sortStops(cached));
        setLoaded(true);
      }

      const dbDays = await fetchReadJson<{ id: string; date: string }[]>(
        `/api/engine/trips/${tripId}/days`
      );
      if (cancelled) return;
      if (!dbDays) return void setLoaded(true);
      // 🔴 `import()` ไม่ใช่ static — `useStops` ถูกเรียกจากหลายหน้า และเราไม่อยาก
      //    ให้ `data/itinerary.ts` ติดไปกับบันเดิลที่ไม่ต้องใช้ (บทเรียนจาก `useBookings`)
      const { ITINERARY } = await import("@/data/itinerary");
      const bridge = buildDayBridge(ITINERARY, dbDays);
      reportDayBridgeWarningIfAny(bridge);
      // สะพานเป็นคนถือแมปที่ครบ (`"d0"→uuid` **และ** `uuid→uuid`) — ห้ามประกอบเองซ้ำที่นี่
      // 🔴 เคยประกอบเองอยู่พักหนึ่ง แล้ว `useDaySettings`/`useOvernightOverrides` ก็ประกอบของตัวเอง
      //    ซึ่งเป็นสิ่งที่ `dayBridge` เตือนไว้ตั้งแต่หัวไฟล์ว่า *"มันจะแปลงไม่เหมือนกันสักวัน"*
      dayToUuid.current = new Map(bridge.dayKeyToDbId);
      // เหตุผลที่ห้ามกลับด้าน `dayKeyToDbId` เอง อยู่ใน `hooks/dayKeyMaps.ts` (คีย์ซ้อน → `"d0"` หาย)
      uuidToDay.current = buildUuidToDayKey(dbDays, bridge);

      await refetchRef.current?.();
      if (cancelled) return;
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

    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, planId]);

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
