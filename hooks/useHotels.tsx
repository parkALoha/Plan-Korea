"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripHotel } from "@/lib/supabase";

function makeHotel(
  legId: string,
  city: string,
  hotelName: string,
  lat: number,
  lng: number,
  formattedAddress?: string | null
): TripHotel {
  return {
    leg_id: legId,
    city,
    hotel_name: hotelName,
    formatted_address: formattedAddress ?? null,
    lat,
    lng,
    updated_at: new Date().toISOString(),
  };
}

export function useHotels() {
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
      const { data } = await supabase.from("trip_hotels").select("*");
      if (cancelled) return;
      if (data) {
        const map: Record<string, TripHotel> = {};
        for (const row of data as TripHotel[]) map[row.leg_id] = row;
        setHotels(map);
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

  const setHotel = useCallback(
    async (
      legId: string,
      city: string,
      hotelName: string,
      lat: number,
      lng: number,
      formattedAddress?: string | null
    ) => {
      if (!supabaseConfigured) {
        setHotels((prev) => ({
          ...prev,
          [legId]: makeHotel(legId, city, hotelName, lat, lng, formattedAddress),
        }));
        return;
      }
      await supabase.from("trip_hotels").upsert({
        leg_id: legId,
        city,
        hotel_name: hotelName,
        formatted_address: formattedAddress ?? null,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      });
    },
    []
  );

  const clearHotel = useCallback(async (legId: string) => {
    if (!supabaseConfigured) {
      setHotels((prev) => {
        const next = { ...prev };
        delete next[legId];
        return next;
      });
      return;
    }
    await supabase.from("trip_hotels").delete().eq("leg_id", legId);
  }, []);

  return { hotels, loaded, setHotel, clearHotel, supabaseConfigured };
}
