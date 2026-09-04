"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hotelRangeKey } from "@/lib/hotelLegs";
import { supabase, supabaseConfigured, type HotelLocalized, type TripHotel } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { readHandoff, writeHandoffNoisily } from "@/lib/engine/cacheHandoff";
import { tripKey } from "@/lib/engine/offlineStore";

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

/** เวลาจริงจาก trigger ฝั่งฐาน — `D7` ไคลเอนต์อ่านอย่างเดียว ไม่เคยเป็นคนเขียน */
function stampOf(body: Record<string, unknown>): string | null {
  return typeof body.updatedAt === "string" ? body.updatedAt : null;
}

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
    // 🔴 `null` จนกว่าฐานจะตอบ (`D7`) — trigger ฝั่งฐานเป็นเจ้าของเวลานี้
    updated_at: null,
  };
}

/**
 * 🔴 คีย์ด้วย **ช่วงวันที่** ไม่ใช่ `leg_id` — สคีมาใหม่ไม่มี `leg_id` (`D51`)
 *    `HotelsProvider` อยู่บนสุดของทรี **legs ยังไม่มีตรงนั้น** จึงคีย์ด้วยของที่ฐานมีจริง
 *    ผู้เรียกใช้ `hotelRangeKey(leg)` เพื่อหา — **ฟังก์ชันเดียวกันทั้งสองฝั่ง**
 * ⚠️ ยกออกมานอก `init()` ตอนย้ายไป IndexedDB — เดิมมีสองใบ (ใน `init` กับใน `refetch`) ที่ต้องตรงกันเอง
 */
function toHotelMap(rows: TripHotel[]): Record<string, TripHotel> {
  const map: Record<string, TripHotel> = {};
  for (const row of rows) {
    map[hotelRangeKey({ startDate: row.check_in, endDate: row.check_out })] = row;
  }
  return map;
}

/** ตัวจริงที่ fetch + เปิด realtime channel — เรียกได้ครั้งเดียวทั้งแอปที่ HotelsProvider
 *  (เรียกซ้ำหลายที่ = ดึงทั้งตารางซ้ำ + เปิด channel ใหม่ทุกครั้ง) ที่เหลือใช้ useHotels() อ่านจาก context
 *  🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
function useHotelsStore(tripId: string | null) {
  const [hotels, setHotels] = useState<Record<string, TripHotel>>({});
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ยังไม่ได้ตั้งค่า Supabase — ใช้ state ในเครื่องไปก่อน (ไม่ sync ระหว่างเครื่อง) ถือว่าโหลดเสร็จตั้งแต่แรก
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  // 🔴 **ครึ่งที่สองของบั๊กข้ามทริป** — คีย์แคชที่ผูกทริป (`readTripCache`) แก้แค่ครึ่งแรก (P3, 27 ส.ค. 2026)
  // `TripDataProvider` **ไม่ถูก remount ตอนสลับทริป** (ไม่มี `key` prop ที่ไหนเลย — ตรวจแล้วทั้ง
  // `app/trip/[tripId]/layout.tsx` และหน้า bare) → state ของ provider อยู่ข้ามการสลับทริป
  // → ที่พักของทริป A **ค้างบนจอตอนเปิดทริป B** จนกว่า fetch ของ B จะกลับมา · ออฟไลน์ = ค้างถาวร
  // ⚠️ **และพอคีย์แคชถูก scope แล้ว ครึ่งนี้กลับเด่นขึ้น**: ทริป B ที่ยังไม่มีแคชจะไม่ `setHotels` เลย
  //    → สิ่งเดียวที่อยู่บนจอคือของ A ล้วน ๆ · **แก้คีย์อย่างเดียวจึงยังไม่ปิดอาการที่ผู้ใช้เห็น**
  // 🎯 รีเซ็ต **ตอน render ไม่ใช่ในเอฟเฟกต์** — แพตเทิร์น "adjust state on prop change" ของ React เอง
  //    (เอฟเฟกต์จะโดน `react-hooks/set-state-in-effect` และยังช้าไปหนึ่งเฟรมด้วย = เห็นของผิดแวบหนึ่ง)
  const [shownTripId, setShownTripId] = useState<string | null>(tripId);
  if (shownTripId !== tripId) {
    setShownTripId(tripId);
    setHotels({});
    setLoaded(!supabaseConfigured);
  }

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  /**
   * ยิงของสด **และเก็บลงเครื่องเสมอ** — `E6-AC7`
   *
   * 🔴 **การเขียนแคชอยู่ที่นี่ ไม่ใช่ที่ผู้เรียก** · ของสดมาได้ 3 ทาง (โหลดแรก · realtime · `refetch()`
   * ตอนเขียนไม่ผ่าน) — ให้ผู้เรียกเขียนเอง = **สามที่ที่ต้องจำ และที่ที่ลืมจะเงียบสนิท**
   * (ท่าเดียวกับ `useChecklist` ซึ่งเคยลืมไปทั้งฮุคมาแล้ว)
   */
  const fetchRows = useCallback(async (id: string) => {
    const rows = await fetchReadJson<TripHotel[]>(`/api/engine/trips/${id}/hotels`);
    if (!rows) return null;
    writeHandoffNoisily(tripKey(id, "hotels"), rows, "hotels");
    return rows;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function

    // ชื่อ channel ต้องไม่ซ้ำกันต่อการ mount เพราะ React Strict Mode (dev) รัน effect
    // นี้ 2 รอบ — ถ้าใช้ชื่อเดิม supabase-js จะคืน channel เดิมที่ subscribe() ไปแล้ว
    // แล้วมาเรียก .on() ซ้ำใส่ channel เดิมไม่ได้ (จะ throw)
    const channelName = `trip_hotels_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      /**
       * 🔴 **`E6-AC7`** — `localStorage` อ่าน sync จึง hydrate เสร็จก่อนยิงเน็ตเสมอ **ลำดับมาฟรี**
       * IndexedDB อ่าน async → **ของสดมาถึงก่อนการอ่านแคชเสร็จได้** → แคชทับของใหม่ด้วยของเก่า
       * ⇒ ลำดับต้องถูกบังคับด้วย `hydrateThenFetch` ไม่ใช่ด้วยการเรียงบรรทัด (เหตุผลเต็มอยู่หัวไฟล์นั้น)
       */
      void hydrateThenFetch<TripHotel[]>({
        readCache: () => readHandoff<TripHotel[]>(tripKey(activeTripId, "hotels")),
        fetchFresh: async () => {
          const rows = await fetchRows(activeTripId);
          // `fetchReadJson` กลืน error แล้วคืน `null` · `hydrateThenFetch` ต้องการ **การโยน** เพื่อแยก
          // "ยิงล้ม" ออกจาก "ยิงได้แต่ว่าง" — `[]` เป็นคำตอบที่ถูกต้อง (ยังไม่มีที่พัก) ห้ามยุบเข้ากับ null
          if (!rows) throw new Error("hotels unreachable");
          return rows;
        },
        // ไม่ส่ง `writeCache` — `fetchRows` เขียนให้แล้วทุกทาง (ดูเหตุผลที่หัวมัน)
        /**
         * 🔴 **`setLoaded` ย้ายเข้ามาในกิ่ง apply — ไม่ใช่รอหลัง `await`** (P7 · 4 ก.ย. 2026 · `E6-AC7`)
         * `hydrateThenFetch` **ไม่ settle เลย** ถ้าดิสก์ไม่ตอบ (พิสูจน์แล้วที่ `hydrateThenFetch.test.ts:169`
         * ซึ่ง assert `settled === false` ตรง ๆ) · เดิมที่นั่นเขียนว่า *"ผลต่อผู้ใช้เป็นศูนย์"*
         * **ซึ่งจริงตอนไม่มีอะไรต่อท้าย `await` — และผมเพิ่งทำให้มันไม่จริงตอนย้าย hook นี้**
         * ⇒ ดิสก์ค้าง = `setLoaded(true)` ไม่เกิด **และ `subscribe()` ไม่เกิด** ทั้งที่ของสดขึ้นจอไปแล้ว
         * 🎯 **`await` ที่เพิ่มเข้าไปในเส้นทางเดิม ส่งต่อ *การไม่จบ* ให้ทุกอย่างที่อยู่ข้างหลังมัน**
         */
        applyCache: (rows) => {
          setHotels(toHotelMap(rows));
          setLoaded(true);
        },
        applyFresh: (rows) => {
          setHotels(toHotelMap(rows));
          setLoaded(true);
        },
        // ไม่มีทั้งของสดและของในเครื่อง → คง `{}` · `fetchReadJson` ยิง toast แล้ว
        applyError: () => setLoaded(true),
        isCancelled: () => cancelled,
      });
      // 🔴 ไม่เช็ค `cancelled` ตรงนี้แล้ว — ไม่มี `await` คั่นอีกต่อไป มันจึงเป็น `false` เสมอ
      //    (เช็คที่ตรวจของที่เป็นไปไม่ได้ อ่านเหมือนเช็คที่ทำงาน — แย่กว่าไม่มี)
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_hotels" }, () => {
          // 🔴 ไม่แตะ payload — แถวดิบมี `city_id` เป็น uuid ไม่มี slug (P3 · `§15`)
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            const id = tripIdRef.current;
            if (!id || cancelled) return;
            const rows = await fetchRows(id);
            if (!rows || cancelled) return;
            setHotels(toHotelMap(rows));
          }, 300);
        })
        .subscribe();
      noteRealtimeSubscribed("trip_hotels");
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, fetchRows]);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const refetch = useCallback(async () => {
    const id = tripIdRef.current;
    if (!supabaseConfigured || !id) return;
    const rows = await fetchRows(id);
    if (!rows) return;
    setHotels(toHotelMap(rows));
  }, [fetchRows]);

  /** เขียนแบบมีเสียง: พังแล้ว toast บอก แล้วดึงของจริงมาทับ state ที่เดาไว้ */
  const guard = useCallback(
    // `onOk` มีไว้อ่าน body ของคำตอบที่สำเร็จ — body อ่านได้ครั้งเดียว จึงต้องอ่านตรงนี้ที่เดียว
    async (label: string, run: () => Promise<Response>, onOk?: (body: Record<string, unknown>) => void) => {
      const ok = await writeGuard(label, async () => {
        const res = await run();
        if (res.ok) {
          if (onOk) onOk((await res.json().catch(() => ({}))) as Record<string, unknown>);
          return { error: null };
        }
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
      }),
      // เวลาจริงจาก trigger ฝั่งฐาน — เติมทีหลังเมื่อคำตอบกลับมา
      // 🔴 `country` ก็เติมทีหลังเหมือนกัน — `toRow()` ไม่รู้ country (client ไม่มี city→country
      // mapping ในตัว) route จึงต้องคืนมาให้ ไม่งั้นปุ่มแผนที่จะไม่มี country จนกว่าจะโหลดหน้าใหม่
      (body) => {
        const stamped = stampOf(body);
        const country = typeof body.country === "string" ? body.country : null;
        setHotels((prev) =>
          prev[key] ? { ...prev, [key]: { ...prev[key], ...(stamped ? { updated_at: stamped } : {}), country } } : prev
        );
      }
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

export function HotelsProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  const value = useHotelsStore(tripId);
  return <HotelsContext.Provider value={value}>{children}</HotelsContext.Provider>;
}

export function useHotels() {
  const ctx = useContext(HotelsContext);
  if (!ctx) throw new Error("useHotels ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
