"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured, CustomPlace } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

function makeCustomPlaceId() {
  return `custom-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** ตัวจริงที่ fetch + เปิด realtime channel — เรียกครั้งเดียวที่ CustomPlacesProvider
 *  (เดิม NearbyPlacesModal เรียก hook นี้เองอีกชุด = ดึงตารางซ้ำ + channel ที่สองทุกครั้งที่เปิด modal) */
function useCustomPlacesStore() {
  const [customPlaces, setCustomPlaces] = useState<CustomPlace[]>([]);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `custom_places_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readCache<CustomPlace[]>("customPlaces");
      if (cached) {
        setCustomPlaces(cached);
        setLoaded(true);
      }

      const { data } = await supabase.from("custom_places").select("*");
      if (cancelled) return;
      if (data) {
        setCustomPlaces(data as CustomPlace[]);
        writeCache("customPlaces", data);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "custom_places" },
          (payload) => {
            setCustomPlaces((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((p) => p.id !== (payload.old as CustomPlace).id);
              }
              const row = payload.new as CustomPlace;
              const exists = prev.some((p) => p.id === row.id);
              return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row];
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

  const addCustomPlace = useCallback(
    async (place: Omit<CustomPlace, "id" | "created_at">) => {
      const newPlace: CustomPlace = {
        ...place,
        id: makeCustomPlaceId(),
        created_at: new Date().toISOString(),
      };
      // อัปเดต state local ก่อนเลย (optimistic) — ตัวที่เรียกฟังก์ชันนี้มักจะเอา id ที่ได้ไปใช้ resolvePlace
      // ต่อทันที (เช่น เดาโหมดเดินทางจากพิกัด) ถ้ารอ realtime echo อย่างเดียวจะไม่ทันเห็นสถานที่นี้เลย
      // เช็ค exists กันตอน echo ย้อนกลับมาซ้ำทีหลัง
      setCustomPlaces((prev) => (prev.some((p) => p.id === newPlace.id) ? prev : [...prev, newPlace]));
      if (!supabaseConfigured) return newPlace;
      // เขียนไม่ผ่าน → ถอนการ์ดที่เพิ่งโผล่ในคลังออก ไม่งั้นมันค้างอยู่จนรีโหลดแล้วหายไปเฉยๆ
      if (!(await writeGuard("เพิ่มสถานที่ใหม่", () =>
        supabase.from("custom_places").insert(newPlace)
      ))) {
        setCustomPlaces((prev) => prev.filter((p) => p.id !== newPlace.id));
      }
      return newPlace;
    },
    []
  );

  return useMemo(
    () => ({ customPlaces, loaded, addCustomPlace, supabaseConfigured }),
    [customPlaces, loaded, addCustomPlace]
  );
}

const CustomPlacesContext = createContext<ReturnType<typeof useCustomPlacesStore> | null>(null);

export function CustomPlacesProvider({ children }: { children: ReactNode }) {
  const value = useCustomPlacesStore();
  return <CustomPlacesContext.Provider value={value}>{children}</CustomPlacesContext.Provider>;
}

export function useCustomPlaces() {
  const ctx = useContext(CustomPlacesContext);
  if (!ctx) throw new Error("useCustomPlaces ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
