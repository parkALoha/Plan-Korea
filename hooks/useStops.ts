"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripStop } from "@/lib/supabase";

function makeStopId() {
  return `stop-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function sortStops(stops: TripStop[]) {
  return [...stops].sort((a, b) =>
    a.day_id === b.day_id ? a.order_index - b.order_index : a.day_id.localeCompare(b.day_id)
  );
}

export function useStops(planId: string | null) {
  const [stops, setStops] = useState<TripStop[]>([]);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    const channelName = `trip_stops_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      if (!supabaseConfigured || !planId) {
        setStops([]);
        return;
      }

      const { data } = await supabase
        .from("trip_stops")
        .select("*")
        .eq("plan_id", planId);
      if (cancelled) return;
      if (data) setStops(sortStops(data as TripStop[]));
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_stops", filter: `plan_id=eq.${planId}` },
          (payload) => {
            setStops((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((s) => s.id !== (payload.old as TripStop).id);
              }
              const row = payload.new as TripStop;
              const exists = prev.some((s) => s.id === row.id);
              const next = exists ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row];
              return sortStops(next);
            });
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [planId]);

  // คืน id ของจุดแวะที่เพิ่งเพิ่ม (ให้ผู้เรียกเอาไปเล่น animation "เพิ่งถูกเพิ่ม" ต่อได้)
  const addStop = useCallback(
    async (dayId: string, placeId: string, addedBy?: string, travelMode?: string | null) => {
      if (!planId) return undefined;
      const dayStops = stops.filter((s) => s.day_id === dayId);
      const newStop: TripStop = {
        id: makeStopId(),
        plan_id: planId,
        day_id: dayId,
        place_id: placeId,
        order_index: dayStops.length,
        dwell_minutes: null,
        travel_mode: travelMode ?? null,
        note: null,
        added_by: addedBy ?? null,
        updated_at: new Date().toISOString(),
      };
      if (!supabaseConfigured) {
        setStops((prev) => sortStops([...prev, newStop]));
        return newStop.id;
      }
      await supabase.from("trip_stops").insert(newStop);
      return newStop.id;
    },
    [planId, stops]
  );

  /** ดัน order_index ของจุดแวะที่อยู่ >= atIndex ในวันเดียวกันขึ้นไปทีละ 1 (ให้ที่ว่างสำหรับแทรกจุดใหม่ตรง atIndex)
   *  อัปเดต state local ก่อนเลย (optimistic) กัน UI สะดุดระหว่างรอ realtime — คืนแถวที่ต้อง shift ไว้ให้เขียนลง DB ต่อ */
  const shiftForInsert = useCallback(
    (dayId: string, atIndex: number) => {
      const toShift = stops.filter((s) => s.day_id === dayId && s.order_index >= atIndex);
      setStops((prev) =>
        prev.map((s) =>
          s.day_id === dayId && s.order_index >= atIndex
            ? { ...s, order_index: s.order_index + 1 }
            : s
        )
      );
      return toShift;
    },
    [stops]
  );

  const writeInsert = useCallback(async (toShift: TripStop[], newStop: TripStop) => {
    if (!supabaseConfigured) return newStop.id;
    await Promise.all([
      ...toShift.map((s) =>
        supabase
          .from("trip_stops")
          .update({ order_index: s.order_index + 1, updated_at: new Date().toISOString() })
          .eq("id", s.id)
      ),
      supabase.from("trip_stops").insert(newStop),
    ]);
    return newStop.id;
  }, []);

  /** ใช้ตอน "แทรกร้านตรงนี้" — เพิ่มจุดแวะแทรกกลางวันที่ atIndex แทนที่จะต่อท้ายวันเสมอเหมือน addStop */
  const insertStopAt = useCallback(
    async (
      dayId: string,
      placeId: string,
      atIndex: number,
      addedBy?: string,
      travelMode?: string | null
    ) => {
      if (!planId) return undefined;
      const newStop: TripStop = {
        id: makeStopId(),
        plan_id: planId,
        day_id: dayId,
        place_id: placeId,
        order_index: atIndex,
        dwell_minutes: null,
        travel_mode: travelMode ?? null,
        note: null,
        added_by: addedBy ?? null,
        updated_at: new Date().toISOString(),
      };
      const toShift = shiftForInsert(dayId, atIndex);
      setStops((prev) => sortStops([...prev, newStop]));
      return writeInsert(toShift, newStop);
    },
    [planId, shiftForInsert, writeInsert]
  );

  /** ใช้ตอน "แทรกเดินทางข้ามเมืองตรงนี้" — เหมือน insertStopAt แต่เป็นแถว kind="intercity" ไม่ใช่สถานที่
   *  place_id ว่างเปล่าโดยตั้งใจ (ไม่ใช่สถานที่จริง) dwell_minutes เก็บระยะเวลาเดินทางที่กินเวลาใน timeline จริง */
  const insertIntercityAt = useCallback(
    async (
      dayId: string,
      atIndex: number,
      input: { from: string; to: string; mode: "bus" | "ktx" | "other"; minutes: number },
      addedBy?: string
    ) => {
      if (!planId) return undefined;
      const newStop: TripStop = {
        id: makeStopId(),
        plan_id: planId,
        day_id: dayId,
        place_id: "",
        order_index: atIndex,
        dwell_minutes: input.minutes,
        travel_mode: null,
        note: null,
        kind: "intercity",
        intercity_from: input.from,
        intercity_to: input.to,
        intercity_mode: input.mode,
        added_by: addedBy ?? null,
        updated_at: new Date().toISOString(),
      };
      const toShift = shiftForInsert(dayId, atIndex);
      setStops((prev) => sortStops([...prev, newStop]));
      return writeInsert(toShift, newStop);
    },
    [planId, shiftForInsert, writeInsert]
  );

  const updateStopPlace = useCallback(async (stopId: string, placeId: string) => {
    if (!supabaseConfigured) {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, place_id: placeId } : s)));
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ place_id: placeId, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  const updateDwellMinutes = useCallback(async (stopId: string, dwellMinutes: number | null) => {
    if (!supabaseConfigured) {
      setStops((prev) =>
        prev.map((s) => (s.id === stopId ? { ...s, dwell_minutes: dwellMinutes } : s))
      );
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ dwell_minutes: dwellMinutes, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  const updateTravelMode = useCallback(async (stopId: string, travelMode: string | null) => {
    if (!supabaseConfigured) {
      setStops((prev) =>
        prev.map((s) => (s.id === stopId ? { ...s, travel_mode: travelMode } : s))
      );
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ travel_mode: travelMode, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  const updateNote = useCallback(async (stopId: string, note: string | null) => {
    if (!supabaseConfigured) {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, note } : s)));
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  const updateOrderIndex = useCallback(async (stopId: string, orderIndex: number) => {
    if (!supabaseConfigured) {
      setStops((prev) =>
        sortStops(prev.map((s) => (s.id === stopId ? { ...s, order_index: orderIndex } : s)))
      );
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ order_index: orderIndex, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  /** ใช้ตอนลากจัดลำดับใหม่ (drag-and-drop) — รับ id ทั้งวันเรียงตามลำดับใหม่ แล้วเขียน order_index ทับทั้งชุด
   *  อัปเดต state local ก่อนเลย (optimistic) กัน UI สะดุด/เด้งกลับระหว่างรอ realtime echo กลับมาทีละแถว */
  const reorderStops = useCallback(async (dayId: string, orderedStopIds: string[]) => {
    const orderMap = new Map(orderedStopIds.map((id, i) => [id, i]));
    setStops((prev) =>
      sortStops(
        prev.map((s) =>
          s.day_id === dayId && orderMap.has(s.id) ? { ...s, order_index: orderMap.get(s.id)! } : s
        )
      )
    );
    if (!supabaseConfigured) return;
    await Promise.all(
      orderedStopIds.map((id, i) =>
        supabase
          .from("trip_stops")
          .update({ order_index: i, updated_at: new Date().toISOString() })
          .eq("id", id)
      )
    );
  }, []);

  /** ใช้ตอนลากจุดแวะข้ามไปอีกวันหนึ่ง (คนละ day_id) — ต่อท้ายวันปลายทางเสมอ
   *  ไม่ต้องจัด order_index วันต้นทางใหม่ เพราะ sortStops ก็อ้างอิงแค่ day_id + order_index ของตัวเอง ไม่สนช่องว่าง */
  const moveStopToDay = useCallback(
    async (stopId: string, targetDayId: string) => {
      const newOrderIndex = stops.filter((s) => s.day_id === targetDayId).length;
      setStops((prev) =>
        sortStops(
          prev.map((s) =>
            s.id === stopId ? { ...s, day_id: targetDayId, order_index: newOrderIndex } : s
          )
        )
      );
      if (!supabaseConfigured) return;
      await supabase
        .from("trip_stops")
        .update({ day_id: targetDayId, order_index: newOrderIndex, updated_at: new Date().toISOString() })
        .eq("id", stopId);
    },
    [stops]
  );

  /** ติ๊ก/ยกเลิกติ๊ก "มาถึงแล้ว" จากหน้า "วันนี้" — visitedAt = null ล้างค่า (ยกเลิกติ๊ก) */
  const setVisitedAt = useCallback(async (stopId: string, visitedAt: string | null) => {
    if (!supabaseConfigured) {
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, visited_at: visitedAt } : s)));
      return;
    }
    await supabase
      .from("trip_stops")
      .update({ visited_at: visitedAt, updated_at: new Date().toISOString() })
      .eq("id", stopId);
  }, []);

  const markVisited = useCallback(
    (stopId: string) => setVisitedAt(stopId, new Date().toISOString()),
    [setVisitedAt]
  );

  const unmarkVisited = useCallback((stopId: string) => setVisitedAt(stopId, null), [setVisitedAt]);

  const removeStop = useCallback(async (stopId: string) => {
    if (!supabaseConfigured) {
      setStops((prev) => prev.filter((s) => s.id !== stopId));
      return;
    }
    await supabase.from("trip_stops").delete().eq("id", stopId);
  }, []);

  /** ใช้ตอนนำเข้าตัวเลือกเดิมจาก trip_selections เป็นครั้งแรก (ดู bootstrap ใน app/page.tsx) */
  const bulkInsert = useCallback(async (rows: TripStop[]) => {
    if (!supabaseConfigured) {
      setStops((prev) => sortStops([...prev, ...rows]));
      return;
    }
    await supabase.from("trip_stops").insert(rows);
  }, []);

  return {
    stops,
    loaded,
    addStop,
    insertStopAt,
    insertIntercityAt,
    updateStopPlace,
    updateDwellMinutes,
    updateTravelMode,
    updateNote,
    updateOrderIndex,
    reorderStops,
    moveStopToDay,
    markVisited,
    unmarkVisited,
    removeStop,
    bulkInsert,
    supabaseConfigured,
  };
}
