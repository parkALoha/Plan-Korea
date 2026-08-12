"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured, type HotelLocalized, type TripHotel } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

/** ทุกอย่างที่ต้องรู้ตอนบันทึกที่พักหนึ่งที่ — รวมเป็นอ็อบเจกต์เดียวตั้งแต่เฟส 16
 *  (เดิมเป็น 6 อาร์กิวเมนต์เรียงกัน พอเพิ่มชื่อหลายภาษาเข้าไปอีก 5 ช่องแล้วสลับตำแหน่งกันง่ายมาก) */
export type HotelInput = {
  legId: string;
  city: string;
  hotelName: string;
  lat: number;
  lng: number;
  formattedAddress?: string | null;
  localized?: HotelLocalized | null;
};

function toRow(input: HotelInput): TripHotel {
  return {
    leg_id: input.legId,
    city: input.city,
    hotel_name: input.hotelName,
    formatted_address: input.formattedAddress ?? null,
    lat: input.lat,
    lng: input.lng,
    name_local: input.localized?.nameLocal ?? null,
    address_local: input.localized?.addressLocal ?? null,
    name_en: input.localized?.nameEn ?? null,
    address_en: input.localized?.addressEn ?? null,
    phone: input.localized?.phone ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** ตัวจริงที่ fetch + เปิด realtime channel — เรียกได้ครั้งเดียวทั้งแอปที่ HotelsProvider
 *  (เรียกซ้ำหลายที่ = ดึงทั้งตารางซ้ำ + เปิด channel ใหม่ทุกครั้ง) ที่เหลือใช้ useHotels() อ่านจาก context */
function useHotelsStore() {
  const [hotels, setHotels] = useState<Record<string, TripHotel>>({});
  // ยังไม่ได้ตั้งค่า Supabase — ใช้ state ในเครื่องไปก่อน (ไม่ sync ระหว่างเครื่อง) ถือว่าโหลดเสร็จตั้งแต่แรก
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    // ชื่อ channel ต้องไม่ซ้ำกันต่อการ mount เพราะ React Strict Mode (dev) รัน effect
    // นี้ 2 รอบ — ถ้าใช้ชื่อเดิม supabase-js จะคืน channel เดิมที่ subscribe() ไปแล้ว
    // แล้วมาเรียก .on() ซ้ำใส่ channel เดิมไม่ได้ (จะ throw)
    const channelName = `trip_hotels_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const toMap = (rows: TripHotel[]) => {
        const map: Record<string, TripHotel> = {};
        for (const row of rows) map[row.leg_id] = row;
        return map;
      };

      const cached = readCache<TripHotel[]>("hotels");
      if (cached) {
        setHotels(toMap(cached));
        setLoaded(true);
      }

      const { data } = await supabase.from("trip_hotels").select("*");
      if (cancelled) return;
      if (data) {
        setHotels(toMap(data as TripHotel[]));
        writeCache("hotels", data);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_hotels" },
          (payload) => {
            setHotels((prev) => {
              const next = { ...prev };
              if (payload.eventType === "DELETE") {
                delete next[(payload.old as TripHotel).leg_id];
              } else {
                const row = payload.new as TripHotel;
                next[row.leg_id] = row;
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
    const { data } = await supabase.from("trip_hotels").select("*");
    if (!data) return;
    const map: Record<string, TripHotel> = {};
    for (const row of data as TripHotel[]) map[row.leg_id] = row;
    setHotels(map);
    writeCache("hotels", data);
  }, []);

  /** เขียนแบบมีเสียง: พังแล้ว toast บอก แล้ว sync state กลับให้ตรงความจริง */
  const guard = useCallback(
    async (label: string, run: () => PromiseLike<{ error: unknown } | { error: unknown }[]>) => {
      if (!(await writeGuard(label, run))) await reload();
    },
    [reload]
  );

  const setHotel = useCallback(async (input: HotelInput) => {
    const row = toRow(input);
    if (!supabaseConfigured) {
      setHotels((prev) => ({ ...prev, [input.legId]: row }));
      return;
    }
    await guard("บันทึกที่พัก", () => supabase.from("trip_hotels").upsert(row));
  }, [guard]);

  const clearHotel = useCallback(async (legId: string) => {
    if (!supabaseConfigured) {
      setHotels((prev) => {
        const next = { ...prev };
        delete next[legId];
        return next;
      });
      return;
    }
    await guard("ลบที่พัก", () => supabase.from("trip_hotels").delete().eq("leg_id", legId));
  }, [guard]);

  return useMemo(
    () => ({ hotels, loaded, setHotel, clearHotel, supabaseConfigured }),
    [hotels, loaded, setHotel, clearHotel]
  );
}

const HotelsContext = createContext<ReturnType<typeof useHotelsStore> | null>(null);

export function HotelsProvider({ children }: { children: ReactNode }) {
  const value = useHotelsStore();
  return <HotelsContext.Provider value={value}>{children}</HotelsContext.Provider>;
}

export function useHotels() {
  const ctx = useContext(HotelsContext);
  if (!ctx) throw new Error("useHotels ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
