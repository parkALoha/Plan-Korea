"use client";

import { useCallback, useEffect, useState } from "react";
import type { City } from "@/data/itinerary";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";

type Overrides = Record<string, City>;

/**
 * คืนที่ยังไม่ล็อกว่านอนเมืองไหน (day.overnightOptions) — เก็บตัวเลือกไว้ใน trip_meta.overnight_overrides
 * แถวเดียว id=1 เหมือน active_plan_id เพราะที่พักเป็นของทริปทั้งทริป ไม่ได้แยกตามแผน A/B
 */
export function useOvernightOverrides() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    // ชื่อ channel ต้องไม่ซ้ำต่อการ mount (React Strict Mode รัน effect 2 รอบใน dev)
    const channelName = `trip_meta_overnight_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readCache<Overrides>("overnightOverrides");
      if (cached) {
        setOverrides(cached);
        setLoaded(true);
      }

      const { data } = await supabase
        .from("trip_meta")
        .select("overnight_overrides")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.overnight_overrides) {
        setOverrides(data.overnight_overrides as Overrides);
        writeCache("overnightOverrides", data.overnight_overrides);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_meta" },
          (payload) => {
            const row = payload.new as { overnight_overrides?: Overrides };
            setOverrides(row?.overnight_overrides ?? {});
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const setOvernightCity = useCallback(
    async (dayId: string, city: City) => {
      const next = { ...overrides, [dayId]: city };
      setOverrides(next); // อัปเดตทันทีไม่รอ realtime ตีกลับ
      if (!supabaseConfigured) return;
      await supabase.from("trip_meta").upsert({ id: 1, overnight_overrides: next });
    },
    [overrides]
  );

  return { overnightOverrides: overrides, loaded, setOvernightCity };
}
