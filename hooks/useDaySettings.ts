"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ITINERARY } from "@/data/itinerary";
import { buildDayBridge, dayBridgeWarning } from "@/lib/engine/dayBridge";
import { supabase, supabaseConfigured, TripDaySettings } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";
import { showToast } from "@/lib/toast";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

/** 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
export function useDaySettings(tripId: string | null, planId: string | null) {
  const [settings, setSettings] = useState<Record<string, TripDaySettings>>({});
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const tripIdRef = useRef<string | null>(null);
  const dayIdRef = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    const channelName = `trip_day_settings_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const toMap = (rows: { trip_day_id: string; start_time: string; return_travel_mode: string | null; is_locked: boolean }[], bridge: ReturnType<typeof buildDayBridge>) => {
        const map: Record<string, TripDaySettings> = {};
        for (const row of rows) {
          /**
           * คีย์ต้องเป็น **`Day.id` ที่ UI ใช้จริง** ซึ่งไม่ใช่ `"d0"` เสมอไปอีกแล้ว
           * · ทริปเกาหลี → `"d0"` (มาจาก `ITINERARY`) · ทริปแพลตฟอร์ม → **`uuid`** (มาจาก `usePlatformItinerary`)
           *
           * ⚠️ **ข้อความเดิมตรงนี้เขียนว่า "วันที่ไม่มีในไฟล์ ข้าม ไม่ใช่ใส่ uuid" — หมดอายุแล้ว**
           * มันถูกตอนที่ UI พูด `"d0"` ภาษาเดียว · ตอนนี้ *ข้าม* แปลว่า **ทริปแพลตฟอร์มอ่านค่าที่บันทึกไว้
           * ไม่เจอเลยสักวัน** (เวลาออกเดินทาง · ล็อกวัน · โหมดเดินทางขากลับ หายทั้งหมดหลังรีเฟรช)
           * · วัดจริง 28 ส.ค. 2026: กด "🔓 ล็อกวันนี้" บนทริปแพลตฟอร์มแล้วปุ่มไม่เปลี่ยน
           */
          const key = bridge.toLegacyId(row.trip_day_id) ?? row.trip_day_id;
          map[key] = {
            plan_id: planId ?? "",
            day_id: key,
            start_time: row.start_time,
            return_travel_mode: row.return_travel_mode,
            is_locked: row.is_locked,
          };
        }
        return map;
      };

      if (!supabaseConfigured || !tripId || !planId) return void setLoaded(true);

      const cached = readCache<TripDaySettings[]>(`daySettings:${planId}`);
      if (cached) {
        const m: Record<string, TripDaySettings> = {};
        for (const row of cached) m[row.day_id] = row;
        setSettings(m);
        setLoaded(true);
      }

      const dbDays = await fetchReadJson<{ id: string; date: string }[]>(
        `/api/engine/trips/${tripId}/days`
      );
      if (cancelled) return;
      if (!dbDays) return void setLoaded(true);
      const bridge = buildDayBridge(ITINERARY, dbDays);
      const warn = dayBridgeWarning(bridge, ITINERARY.length);
      if (warn) console.warn(`[daySettings] ${warn}`);
      reportDayBridgeWarningIfAny(bridge);
      // 🔴 วันของทริปแพลตฟอร์มอ้างด้วย `uuid` ของตัวเอง — ไม่มีคู่ใน `ITINERARY` เลย
      //    (รูปเดียวกับ `useStops` · เหตุผลเต็มอยู่ที่นั่น) · ถ้าไม่เติม แมปจะว่างสำหรับทริปพวกนั้น
      //    แล้วทุกการตั้งค่าจะเด้งออกพร้อมข้อความที่โทษ `E7` ทั้งที่วันอยู่ในฐานเรียบร้อย
      dayIdRef.current = new Map([
        ...ITINERARY.map((d) => [d.id, bridge.toDbId(d.id)] as const).filter(
          (e): e is readonly [string, string] => e[1] !== null
        ),
        ...dbDays.map((d) => [d.id, d.id] as const),
      ]);

      const rows = await fetchReadJson<
        { trip_day_id: string; start_time: string; return_travel_mode: string | null; is_locked: boolean }[]
      >(`/api/engine/trips/${tripId}/day-settings?planId=${encodeURIComponent(planId)}`);
      if (cancelled) return;
      if (rows) {
        const map = toMap(rows, bridge);
        setSettings(map);
        // 🔴 ห้ามทับแคชด้วยผลที่หดเพราะสะพานวันไม่ครบ (P1/P7) — ดู lib/engine/dayBridgeIncomplete.ts
        if (!reportDayBridgeDropIfAny(rows.length, Object.keys(map).length)) {
          writeCache(`daySettings:${planId}`, Object.values(map));
        }
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_day_plan_settings" }, () => {
          // 🔴 payload มี `trip_day_id` เป็น uuid ไม่มี `"d0"` — ใช้เป็นสัญญาณอย่างเดียว
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
      noteRealtimeSubscribed("trip_day_plan_settings");
    }

    init();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, planId]);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const reload = useCallback(async () => {
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !planId || !tripId) return;
    const rows = await fetchReadJson<
      { trip_day_id: string; start_time: string; return_travel_mode: string | null; is_locked: boolean }[]
    >(`/api/engine/trips/${tripId}/day-settings?planId=${encodeURIComponent(planId)}`);
    if (!rows) return;
    const map: Record<string, TripDaySettings> = {};
    for (const row of rows) {
      const legacyId = [...dayIdRef.current.entries()].find(([, uuid]) => uuid === row.trip_day_id)?.[0];
      if (!legacyId) continue;
      map[legacyId] = {
        plan_id: planId, day_id: legacyId, start_time: row.start_time,
        return_travel_mode: row.return_travel_mode, is_locked: row.is_locked,
      };
    }
    setSettings(map);
    if (!reportDayBridgeDropIfAny(rows.length, Object.keys(map).length)) {
      writeCache(`daySettings:${planId}`, Object.values(map));
    }
  }, [planId]);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  /**
   * เขียนตั้งค่าของวัน × แผน — **รับเป็นชุดเสมอ** แม้จะเขียนวันเดียว
   *
   * 🔴 "ล็อกทุกวัน" เขียนทีเดียวหลายแถว · เขียนทีละคำขอ = ล็อกได้ครึ่งเดียวถ้าเน็ตหลุดกลางทาง
   * **แล้วผู้ใช้จะไม่รู้ว่าครึ่งไหน**
   */
  const writeRows = useCallback(
    async (label: string, rows: { dayId: string; startTime?: string; returnTravelMode?: string | null; isLocked?: boolean }[]) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !planId || !tripId) return;
      const mapped = rows.map((r) => ({
        tripDayId: dayIdRef.current.get(r.dayId),
        startTime: r.startTime,
        returnTravelMode: r.returnTravelMode,
        isLocked: r.isLocked,
      }));
      // 🔴 วันที่ยังไม่มีในฐาน → **หยุดและบอก** ไม่ใช่ส่งไปให้ FK ฟ้องด้วยข้อความที่อ่านไม่ออก
      if (mapped.some((m) => !m.tripDayId)) {
        console.error("[daySettings] มีวันที่ยังไม่มีในฐาน — E7 อาจยังไม่ได้ย้ายข้อมูล");
        showToast("error", "บางวันยังไม่มีในระบบของทริปนี้ — ตั้งค่ายังไม่ได้ตอนนี้");
        await reload();
        return;
      }
      const ok = await writeGuard(label, async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/day-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, rows: mapped }),
        });
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await reload();
    },
    [planId, reload]
  );

  const setStartTime = useCallback(
    async (dayId: string, startTime: string) => {
      if (!planId) return;
      // ด่านสุดท้ายกัน "" หลุดลง DB (ฝั่ง UI กันไว้แล้วที่ DayStopsSection แต่ start_time เป็นคอลัมน์ text
      // ไม่มีด่านจาก DB เอง — บั๊ก 7.3) เขียน "" ทับได้จริงแล้วพัง timeToMinutes ทั้งวันของทุกคนที่ sync มาเห็น
      if (!startTime.trim()) return;
      setSettings((prev) => ({
        ...prev,
        [dayId]: { ...prev[dayId], plan_id: planId, day_id: dayId, start_time: startTime },
      }));
      if (!supabaseConfigured) return;
      await writeRows("เวลาออกเดินทาง", [{ dayId, startTime }]);
    },
    [planId, writeRows]
  );

  // โหมดเดินทางขากลับที่พักของวันนั้น — คอลัมน์ return_travel_mode มาจาก migration 0015
  // ถ้ายังไม่ได้รัน migration การ upsert จะ error เงียบๆ (จับไว้) แล้วหน้าเว็บยังใช้ค่าประมาณต่อได้
  const setReturnTravelMode = useCallback(
    async (dayId: string, mode: string) => {
      if (!planId) return;
      // upsert ต้องส่ง start_time ไปด้วย (คอลัมน์ not null) — ค่าเดิมของวันนั้นหรือค่า default เดียวกับที่หน้าเว็บใช้
      const startTime = settings[dayId]?.start_time ?? "07:00";
      setSettings((prev) => ({
        ...prev,
        [dayId]: { ...prev[dayId], plan_id: planId, day_id: dayId, start_time: startTime, return_travel_mode: mode },
      }));
      if (!supabaseConfigured) return;
      await writeRows("โหมดเดินทางขากลับที่พัก", [{ dayId, startTime, returnTravelMode: mode }]);
    },
    [planId, settings, writeRows]
  );

  // ล็อก/ปลดล็อกวัน — คอลัมน์ is_locked มาจาก migration 0021
  // อัปเดต state ในเครื่องก่อนเสมอ (ปุ่มต้องตอบสนองทันที) แล้วค่อยยิงขึ้น DB ให้อีกคนเห็นผ่าน realtime
  const setDaysLocked = useCallback(
    async (dayIds: string[], locked: boolean) => {
      if (!planId || dayIds.length === 0) return;
      // start_time เป็นคอลัมน์ not null — ต้องส่งไปด้วยทุกครั้งที่ upsert แถวที่อาจยังไม่มี
      const rows = dayIds.map((dayId) => ({
        plan_id: planId,
        day_id: dayId,
        start_time: settings[dayId]?.start_time ?? "07:00",
        is_locked: locked,
      }));
      setSettings((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.day_id] = { ...prev[row.day_id], ...row };
        return next;
      });
      if (!supabaseConfigured) return;
      await writeRows(locked ? "ล็อกวัน" : "ปลดล็อกวัน",
        dayIds.map((dayId) => ({ dayId, startTime: settings[dayId]?.start_time ?? "07:00", isLocked: locked })));
    },
    [planId, settings, writeRows]
  );

  return { settings, loaded, setStartTime, setReturnTravelMode, setDaysLocked, supabaseConfigured };
}
