"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hotelRangeKey } from "@/lib/hotelLegs";
import { chooseSoleTrip } from "@/lib/engine/trip";
import { supabase, supabaseConfigured, type HotelLocalized, type TripHotel } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

/** ทุกอย่างที่ต้องรู้ตอนบันทึกที่พักหนึ่งที่ — รวมเป็นอ็อบเจกต์เดียวตั้งแต่เฟส 16
 *  (เดิมเป็น 6 อาร์กิวเมนต์เรียงกัน พอเพิ่มชื่อหลายภาษาเข้าไปอีก 5 ช่องแล้วสลับตำแหน่งกันง่ายมาก) */
export type HotelInput = {
  legId: string;
  /** 🔴 `E3`/`D51` — สคีมาใหม่ระบุที่พักด้วย *ช่วงวันที่* ไม่ใช่ `legId`
   *  ✅ **บังคับแล้ว 26 ส.ค. 2026** — เคยเป็น optional อยู่ *หนึ่งคอมมิต* เพื่อไม่ให้ `tsc` แดงคา
   *     ระหว่างรอ `HotelLegsPanel` ต่อ (P2 · `5eb1b6f`) · **ปิดทันทีที่เขาลง ไม่ปล่อยข้ามวัน** */
  checkIn: string;
  checkOut: string;
  city: string;
  hotelName: string;
  lat: number;
  lng: number;
  formattedAddress?: string | null;
  localized?: HotelLocalized | null;
};

function toRow(input: HotelInput): TripHotel {
  return {
    // 🔴 ไม่มี `leg_id` แล้ว (`D51`) — ช่วงวันที่คือตัวระบุ
    check_in: input.checkIn,
    check_out: input.checkOut,
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
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // 🔴 คีย์ด้วย **ช่วงวันที่** ไม่ใช่ `leg_id` — สคีมาใหม่ไม่มี `leg_id` (`D51`)
        //    `HotelsProvider` อยู่บนสุดของทรี **legs ยังไม่มีตรงนั้น** จึงคีย์ด้วยของที่ฐานมีจริง
        //    ผู้เรียกใช้ `hotelRangeKey(leg)` เพื่อหา — **ฟังก์ชันเดียวกันทั้งสองฝั่ง**
        for (const row of rows) {
          map[hotelRangeKey({ startDate: row.check_in, endDate: row.check_out })] = row;
        }
        return map;
      };

      const cached = readCache<TripHotel[]>("hotels");
      if (cached) {
        setHotels(toMap(cached));
        setLoaded(true);
      }

      if (!supabaseConfigured) return void setLoaded(true);

      const tripsRes = await fetch("/api/engine/trips");
      if (cancelled || !tripsRes.ok) return void setLoaded(true);
      const trip = chooseSoleTrip((await tripsRes.json()) as { id: string }[]);
      if (cancelled || !trip.ok) return void setLoaded(true);
      tripIdRef.current = trip.tripId;

      const res = await fetch(`/api/engine/trips/${trip.tripId}/hotels`);
      if (cancelled) return;
      if (res.ok) {
        const rows = (await res.json()) as TripHotel[];
        setHotels(toMap(rows));
        writeCache("hotels", rows);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_hotels" }, () => {
          // 🔴 ไม่แตะ payload — แถวดิบมี `city_id` เป็น uuid ไม่มี slug (P3 · `§15`)
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            const id = tripIdRef.current;
            if (!id || cancelled) return;
            const r = await fetch(`/api/engine/trips/${id}/hotels`);
            if (!r.ok || cancelled) return;
            const rows = (await r.json()) as TripHotel[];
            setHotels(toMap(rows));
            writeCache("hotels", rows);
          }, 300);
        })
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const refetch = useCallback(async () => {
    const id = tripIdRef.current;
    if (!supabaseConfigured || !id) return;
    const res = await fetch(`/api/engine/trips/${id}/hotels`);
    if (!res.ok) return;
    const rows = (await res.json()) as TripHotel[];
    const map: Record<string, TripHotel> = {};
    for (const row of rows) {
      map[hotelRangeKey({ startDate: row.check_in, endDate: row.check_out })] = row;
    }
    setHotels(map);
    writeCache("hotels", rows);
  }, []);

  /** เขียนแบบมีเสียง: พังแล้ว toast บอก แล้วดึงของจริงมาทับ state ที่เดาไว้ */
  const guard = useCallback(
    async (label: string, run: () => Promise<Response>) => {
      const ok = await writeGuard(label, async () => {
        const res = await run();
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await refetch();
      return ok;
    },
    [refetch]
  );

  const setHotel = useCallback(async (input: HotelInput) => {
    const key = hotelRangeKey({ startDate: input.checkIn, endDate: input.checkOut });
    const row = toRow(input);
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId) {
      setHotels((prev) => ({ ...prev, [key]: row }));
      return;
    }
    setHotels((prev) => ({ ...prev, [key]: row }));
    await guard("บันทึกที่พัก", () =>
      fetch(`/api/engine/trips/${tripId}/hotels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: input.checkIn, checkOut: input.checkOut,
          city: input.city, hotelName: input.hotelName,
          formattedAddress: input.formattedAddress ?? null,
          lat: input.lat, lng: input.lng,
          nameLocal: input.localized?.nameLocal ?? null,
          addressLocal: input.localized?.addressLocal ?? null,
          nameEn: input.localized?.nameEn ?? null,
          addressEn: input.localized?.addressEn ?? null,
          phone: input.localized?.phone ?? null,
        }),
      })
    );
  }, [guard]);

  /**
   * ลบที่พักของช่วงวันหนึ่ง
   *
   * 🔴 รับ **ช่วงวันที่** ด้วยเสมอ — `legId` ยังอยู่ในลายเซ็นเพราะผู้เรียกใช้มันเป็นป้าย
   * แต่ **ตัวที่ระบุแถวจริงคือ `range`** · ✅ บังคับแล้วตั้งแต่ P2 ต่อ (`5eb1b6f`)
   */
  const clearHotel = useCallback(
    async (legId: string, range: { startDate: string; endDate: string }) => {
      void legId;
      const key = hotelRangeKey(range);
      const [checkIn, checkOut] = key.split("..");
      const tripId = tripIdRef.current;

      setHotels((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });

      if (!supabaseConfigured || !tripId) return;
      await guard("ลบที่พัก", () =>
        fetch(
          `/api/engine/trips/${tripId}/hotels?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}`,
          { method: "DELETE" }
        )
      );
    },
    [guard]
  );

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
