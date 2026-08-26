"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured, CustomPlace } from "@/lib/supabase";
import { chooseSoleTrip } from "@/lib/engine/trip";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

function makeCustomPlaceId() {
  return `custom-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** ตัวจริงที่ fetch + เปิด realtime channel — เรียกครั้งเดียวที่ CustomPlacesProvider
 *  (เดิม NearbyPlacesModal เรียก hook นี้เองอีกชุด = ดึงตารางซ้ำ + channel ที่สองทุกครั้งที่เปิด modal) */
/** หน่วงก่อนดึงใหม่ — realtime ยิงถี่ตอนมีคนเพิ่มหลายที่ติดกัน · ดึงทุกครั้งคือ N คำขอ */
const REFETCH_DEBOUNCE_MS = 300;

function useCustomPlacesStore() {
  const [customPlaces, setCustomPlaces] = useState<CustomPlace[]>([]);
  const tripIdRef = useRef<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `custom_places_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    /**
     * 🔴 **อ่านผ่าน route ไม่ใช่ `.from()` ตรง ๆ อีกแล้ว** — `E3-AC1`
     *    RLS ยังเป็นคนกรองเหมือนเดิม แค่ย้ายที่รันไปฝั่งเซิร์ฟเวอร์ (`D38`)
     */
    async function fetchPlaces(tripId: string): Promise<CustomPlace[] | null> {
      const res = await fetch(`/api/engine/trips/${tripId}/custom-places`);
      if (!res.ok) return null;
      return (await res.json()) as CustomPlace[];
    }

    async function init() {
      const cached = readCache<CustomPlace[]>("customPlaces");
      if (cached) {
        setCustomPlaces(cached);
        setLoaded(true);
      }

      // 🔴 กฎการเลือกทริปเป็นตัวเดียวกับฝั่งเซิร์ฟเวอร์ (`chooseSoleTrip`)
      //    เขียนกฎเองที่นี่ = วันหนึ่งสองฝั่งจะเลือกคนละใบ แล้วผู้ใช้เห็นทริปเปลี่ยนกลางเฟรม
      const tripsRes = await fetch("/api/engine/trips");
      if (cancelled) return;
      if (!tripsRes.ok) {
        setLoaded(true);
        return;
      }
      const trip = chooseSoleTrip((await tripsRes.json()) as { id: string }[]);
      if (cancelled) return;
      if (!trip.ok) {
        // ⚠️ ยังไม่มีทริป / มีหลายทริป — **ไม่ใช่ error และห้ามเดาให้**
        //    `E5-AC1` (`/trip/[tripId]`) เป็นคนแก้เรื่องนี้ถาวร
        setLoaded(true);
        return;
      }
      tripIdRef.current = trip.tripId;

      const rows = await fetchPlaces(trip.tripId);
      if (cancelled) return;
      if (rows) {
        setCustomPlaces(rows);
        writeCache("customPlaces", rows);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "custom_places" },
          (payload) => {
            // 🔴 **DELETE ใช้ `payload.old.id` ได้ · INSERT/UPDATE ห้ามแปลง `payload.new` เด็ดขาด** (P3 · `§15`)
            //    `postgres_changes` ส่งแถวดิบของตารางเดียวจาก WAL **ไม่มี join**
            //    → `payload.new` ไม่มีชื่อและไม่มีเมือง · แปลงแล้วจะได้ชื่อว่างทุกแถว **โดยไม่มี error**
            //    (`toCustomPlace` โยนถ้าใครลองทำ — แต่ทางที่ถูกคือไม่เรียกมันเลย)
            if (payload.eventType === "DELETE") {
              const gone = (payload.old as { id?: string }).id;
              if (gone) setCustomPlaces((prev) => prev.filter((p) => p.id !== gone));
              return;
            }
            // ใช้เป็น *สัญญาณว่ามีอะไรเปลี่ยน* แล้วดึงใหม่ — คง join ไว้จุดเดียวที่ `db.ts`
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(async () => {
              const id = tripIdRef.current;
              if (!id || cancelled) return;
              const fresh = await fetchPlaces(id);
              if (fresh && !cancelled) {
                setCustomPlaces(fresh);
                writeCache("customPlaces", fresh);
              }
            }, REFETCH_DEBOUNCE_MS);
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      // 🔴 เคลียร์ตัวตั้งเวลาด้วย ไม่งั้น refetch จะยิงหลัง unmount แล้ว setState ใส่ของที่ตายแล้ว
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
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
