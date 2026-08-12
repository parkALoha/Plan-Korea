"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";

type HiddenPlaceRow = {
  place_id: string;
  hidden_by: string | null;
  hidden_at: string;
};

export function useHiddenPlaces() {
  const [hidden, setHidden] = useState<Record<string, HiddenPlaceRow>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `hidden_places_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data } = await supabase.from("hidden_places").select("*");
      if (cancelled) return;
      if (data) {
        const map: Record<string, HiddenPlaceRow> = {};
        for (const row of data as HiddenPlaceRow[]) map[row.place_id] = row;
        setHidden(map);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "hidden_places" },
          (payload) => {
            setHidden((prev) => {
              const next = { ...prev };
              if (payload.eventType === "DELETE") {
                delete next[(payload.old as HiddenPlaceRow).place_id];
              } else {
                const row = payload.new as HiddenPlaceRow;
                next[row.place_id] = row;
              }
              return next;
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
  }, []);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const reload = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data } = await supabase.from("hidden_places").select("*");
    if (!data) return;
    const map: Record<string, HiddenPlaceRow> = {};
    for (const row of data as HiddenPlaceRow[]) map[row.place_id] = row;
    setHidden(map);
  }, []);

  /** เขียนแบบมีเสียง: พังแล้ว toast บอก แล้ว sync state กลับให้ตรงความจริง */
  const guard = useCallback(
    async (label: string, run: () => PromiseLike<{ error: unknown } | { error: unknown }[]>) => {
      if (!(await writeGuard(label, run))) await reload();
    },
    [reload]
  );

  const hidePlace = useCallback(async (placeId: string, hiddenBy?: string) => {
    const row: HiddenPlaceRow = {
      place_id: placeId,
      hidden_by: hiddenBy ?? null,
      hidden_at: new Date().toISOString(),
    };
    setHidden((prev) => ({ ...prev, [placeId]: row }));
    if (!supabaseConfigured) return;
    await guard("ซ่อนสถานที่", () => supabase.from("hidden_places").insert(row));
  }, [guard]);

  const unhidePlace = useCallback(async (placeId: string) => {
    setHidden((prev) => {
      const next = { ...prev };
      delete next[placeId];
      return next;
    });
    if (!supabaseConfigured) return;
    await guard("กู้สถานที่ที่ซ่อนไว้", () =>
      supabase.from("hidden_places").delete().eq("place_id", placeId)
    );
  }, [guard]);

  const hiddenPlaceIds = new Set(Object.keys(hidden));

  return { hidden, hiddenPlaceIds, loaded, hidePlace, unhidePlace, supabaseConfigured };
}
