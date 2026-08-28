"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildUuidToDayKey } from "@/hooks/dayKeyMaps";
import { buildDayBridge } from "@/lib/engine/dayBridge";
import { supabase, supabaseConfigured, TripBooking, BookingCategory, BookingStatus } from "@/lib/supabase";
import { readTripCache, writeTripCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { reportDayBridgeDropIfAny, reportDayBridgeWarningIfAny } from "@/lib/engine/dayBridgeIncomplete";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

function makeBookingId() {
  return `bk-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function sortBookings(bookings: TripBooking[]) {
  return [...bookings].sort((a, b) => {
    const ka = `${a.date ?? ""}${a.time ?? ""}`;
    const kb = `${b.date ?? ""}${b.time ?? ""}`;
    return ka.localeCompare(kb) || a.created_at.localeCompare(b.created_at);
  });
}

export type NewBooking = {
  category: BookingCategory;
  title: string;
  dayId?: string | null;
  date?: string | null;
  time?: string | null;
  confirmationNumber?: string | null;
  link?: string | null;
  note?: string | null;
  addedBy?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  status?: BookingStatus;
  bookByDaysBefore?: number | null;
};

/** ตั๋ว/booking ทั้งหมดของทริป — trip-wide ไม่แยกตามแผน A/B เหมือน trip_hotels
 *  ตัวจริงที่ fetch + เปิด realtime channel เรียกครั้งเดียวที่ BookingsProvider ที่เหลืออ่านผ่าน useBookings()
 *  🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
function useBookingsStore(tripId: string | null) {
  const [bookings, setBookings] = useState<TripBooking[]>([]);
  const tripIdRef = useRef<string | null>(null);
  const dayToUuid = useRef<Map<string, string>>(new Map());
  const uuidToDay = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  // 🔴 สลับทริปแล้วต้องไม่เห็นตั๋วของทริปเก่า — ดู `useHotels.tsx` สำหรับเหตุผลเต็ม
  //    (provider ไม่ถูก remount ตอนสลับทริป · คีย์แคชที่ scope แล้วแก้ได้แค่ครึ่งเดียว)
  const [shownTripId, setShownTripId] = useState<string | null>(tripId);
  if (shownTripId !== tripId) {
    setShownTripId(tripId);
    setBookings([]);
    setLoaded(!supabaseConfigured);
  }

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function

    const channelName = `bookings_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      // 🔴 คืนการใช้แคชที่ผมทำหายตอนเขียนใหม่ — `eslint` จับให้ (import ค้างโดยไม่มีใครใช้)
      //    แคชคือสิ่งที่ทำให้หน้าขึ้นทันทีตอนเปิดและยังอ่านได้ตอนเน็ตหลุด (เฟส 18)
      const cached = readTripCache<TripBooking[]>(activeTripId, "bookings");
      if (cached) {
        setBookings(sortBookings(cached));
        setLoaded(true);
      }

      const dbDays = await fetchReadJson<{ id: string; date: string }[]>(
        `/api/engine/trips/${tripId}/days`
      );
      if (cancelled) return;
      if (!dbDays) return void setLoaded(true);
      /**
       * 🔴 **สะพานไม่มีฝั่ง `ITINERARY` อีกแล้ว — ส่ง `[]` โดยเจตนา** (P1 ตัดสิน 28 ส.ค. 2026)
       *
       * เดิมโหลดไฟล์ทริปเกาหลีมาจับคู่ด้วย **วันที่ปฏิทินล้วน ไม่ผูก `tripId` เลย** → ทริปใดก็ตามที่วัน
       * ทับช่วง 11–21 ต.ค. จะได้คีย์ `"d*"` ปนเข้ามา · P4 วัดเจอสภาพครึ่ง ๆ: ทริปที่ทับ **5 จาก 11 วัน**
       * → `d0..d4` เขียนได้ · `d5..d10` แปลงเป็น `null` → `insertAt` **`return` เงียบ ไม่มี error ไม่มี toast**
       * 🎯 **ผู้ใช้กดเพิ่มของในวันที่ 6–11 แล้วไม่มีอะไรเกิดขึ้น และไม่มีอะไรบอกว่าทำไม**
       *
       * ✅ ส่ง `[]` **กำจัดสภาพ "วันที่แสดงได้แต่เขียนไม่ได้" ทิ้งทั้งชั้น** ไม่ใช่เพิ่มเงื่อนไขมากันทีละเคส
       * · ทำได้ตอนนี้เพราะไม่มีหน้าไหนเรนเดอร์วันจากไฟล์นั้นอีกแล้ว → **คีย์ `d*` ไม่มีผู้บริโภคเหลือ**
       * ⚠️ **ถอดแค่ฝั่ง `ITINERARY` ไม่ใช่ถอดสะพาน** — `dayKeyToDbId` ยังให้ `uuid → uuid`
       *   ซึ่งเป็นสิ่งที่ทริปแพลตฟอร์มใช้จริงทุกวันนี้
       */
      const bridge = buildDayBridge([], dbDays);
      reportDayBridgeWarningIfAny(bridge);
      // สะพานเป็นคนถือแมปวัน — ห้ามประกอบเองซ้ำที่นี่
      // ⚠️ เดิมคอมเมนต์นี้เขียนว่าแมปมี `"d0"→uuid` **และ** `uuid→uuid` — **หมดอายุตั้งแต่ส่ง `[]`**
      //    ตอนนี้เหลือ `uuid→uuid` ล้วน · ฝั่ง `"d0"` ไม่มีผู้ผลิตและไม่มีผู้บริโภคแล้ว
      dayToUuid.current = new Map(bridge.dayKeyToDbId);
      // เหตุผลที่ห้ามกลับด้าน `dayKeyToDbId` เอง อยู่ใน `hooks/dayKeyMaps.ts` (คีย์ซ้อน → `"d0"` หาย)
      uuidToDay.current = buildUuidToDayKey(dbDays, bridge);

      const rows = await fetchReadJson<(TripBooking & { trip_day_id: string | null })[]>(
        `/api/engine/trips/${tripId}/bookings`
      );
      if (cancelled) return;
      if (rows) {
        // 🔴 `day_id` ที่ route คืนมาเป็น uuid — แปลงเป็น `"d0"` ที่นี่
        //    วันที่ไม่มีในไฟล์เดิม → `day_id` เป็น `null` **ไม่ใช่ uuid ดิบ** ที่ UI หาไม่เจอ
        const mapped = rows.map((r) => ({
          ...r, day_id: r.trip_day_id ? uuidToDay.current.get(r.trip_day_id) ?? null : null,
        }));
        setBookings(sortBookings(mapped));
        // 🔴 booking ไม่ถูกทิ้งเมื่อสะพานวันไม่ครบ (ต่างจาก stops) — ได้แค่ `day_id: null` แทน จึงไม่ต้อง
        // กัน writeCache (จำนวนแถวเท่าเดิม ไม่มีอะไรให้ปกป้อง) แค่เตือนถ้าบางใบเสียการผูกวันไป
        reportDayBridgeDropIfAny(
          rows.filter((r) => r.trip_day_id !== null).length,
          mapped.filter((r) => r.day_id !== null).length
        );
        writeTripCache(activeTripId, "bookings", mapped);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
      noteRealtimeSubscribed("bookings");
    }

    init();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId]);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const reload = useCallback(async () => {
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId) return;
    const rows = await fetchReadJson<(TripBooking & { trip_day_id: string | null })[]>(
      `/api/engine/trips/${tripId}/bookings`
    );
    if (!rows) return;
    const mapped = rows.map((r) => ({
      ...r, day_id: r.trip_day_id ? uuidToDay.current.get(r.trip_day_id) ?? null : null,
    }));
    setBookings(sortBookings(mapped));
    reportDayBridgeDropIfAny(
      rows.filter((r) => r.trip_day_id !== null).length,
      mapped.filter((r) => r.day_id !== null).length
    );
    writeTripCache(tripId, "bookings", mapped);
  }, []);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  /** เขียนแบบมีเสียง: พังแล้ว toast บอก แล้วดึงของจริงมาทับ state ที่เดาไว้ */
  const guard = useCallback(
    async (label: string, run: () => Promise<Response>) => {
      const ok = await writeGuard(label, async () => {
        const res = await run();
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await reload();
      return ok;
    },
    [reload]
  );

  const addBooking = useCallback(async (input: NewBooking) => {
    const now = new Date().toISOString();
    const newBooking: TripBooking = {
      id: makeBookingId(),
      category: input.category,
      title: input.title,
      day_id: input.dayId ?? null,
      date: input.date ?? null,
      time: input.time ?? null,
      confirmation_number: input.confirmationNumber ?? null,
      link: input.link ?? null,
      note: input.note ?? null,
      added_by: input.addedBy ?? null,
      created_at: now,
      // 🔴 `null` = ยังไม่มีเวลาจากเซิร์ฟเวอร์ (`D7`) · ใช้เฉพาะเส้นทางที่ยังไม่ตั้งค่า Supabase
      updated_at: null,
      file_url: input.fileUrl ?? null,
      file_name: input.fileName ?? null,
      status: input.status ?? "booked",
      book_by_days_before: input.bookByDaysBefore ?? null,
    };
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId) {
      setBookings((prev) => sortBookings([...prev, newBooking]));
      return newBooking.id;
    }
    // 🔴 **เขียนก่อนแล้วค่อยใส่ state** — `id` มาจากฐาน (grant ไม่เปิด `id`)
    const res = await fetch(`/api/engine/trips/${tripId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: input.category, title: input.title,
        tripDayId: input.dayId ? dayToUuid.current.get(input.dayId) ?? null : null,
        date: input.date ?? null, time: input.time ?? null,
        confirmationNumber: input.confirmationNumber ?? null,
        link: input.link ?? null, note: input.note ?? null,
        fileUrl: input.fileUrl ?? null, fileName: input.fileName ?? null,
        status: input.status ?? "booked",
        bookByDaysBefore: input.bookByDaysBefore ?? null,
        addedBy: input.addedBy ?? null,
      }),
    });
    if (!res.ok) {
      await guard("เพิ่มตั๋ว/booking", async () => res);
      return newBooking.id;
    }
    const created = (await res.json()) as TripBooking & { trip_day_id: string | null };
    const mapped: TripBooking = {
      ...created,
      day_id: created.trip_day_id ? uuidToDay.current.get(created.trip_day_id) ?? null : null,
    };
    setBookings((prev) => sortBookings([...prev, mapped]));
    return mapped.id;
  }, [guard]);

  const updateBooking = useCallback(
    async (bookingId: string, patch: Partial<NewBooking>) => {
      // ⚠️ ส่งเป็นชื่อของ route (camelCase) · route แปลงเป็นชื่อคอลัมน์เอง
      //    และ **ส่งเฉพาะช่องที่ grant เปิด** — `updated_at` เซิร์ฟเวอร์เขียนเอง (`D7`)
      const dbPatch: Record<string, unknown> = {};
      if (patch.category !== undefined) dbPatch.category = patch.category;
      if (patch.title !== undefined) dbPatch.title = patch.title;
      // 🔴 `dayId` เป็น `"d0"` → ต้องแปลงเป็น uuid ก่อนส่ง
      if (patch.dayId !== undefined) {
        dbPatch.tripDayId = patch.dayId ? dayToUuid.current.get(patch.dayId) ?? null : null;
      }
      if (patch.date !== undefined) dbPatch.date = patch.date;
      if (patch.time !== undefined) dbPatch.time = patch.time;
      if (patch.confirmationNumber !== undefined) dbPatch.confirmationNumber = patch.confirmationNumber;
      if (patch.link !== undefined) dbPatch.link = patch.link;
      if (patch.note !== undefined) dbPatch.note = patch.note;
      if (patch.fileUrl !== undefined) dbPatch.fileUrl = patch.fileUrl;
      if (patch.fileName !== undefined) dbPatch.fileName = patch.fileName;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.bookByDaysBefore !== undefined) dbPatch.bookByDaysBefore = patch.bookByDaysBefore;

      if (!supabaseConfigured) {
        setBookings((prev) =>
          sortBookings(
            prev.map((b) =>
              b.id === bookingId
                ? {
                    ...b,
                    ...(patch.category !== undefined ? { category: patch.category } : {}),
                    ...(patch.title !== undefined ? { title: patch.title } : {}),
                    ...(patch.dayId !== undefined ? { day_id: patch.dayId } : {}),
                    ...(patch.date !== undefined ? { date: patch.date } : {}),
                    ...(patch.time !== undefined ? { time: patch.time } : {}),
                    ...(patch.confirmationNumber !== undefined
                      ? { confirmation_number: patch.confirmationNumber }
                      : {}),
                    ...(patch.link !== undefined ? { link: patch.link } : {}),
                    ...(patch.note !== undefined ? { note: patch.note } : {}),
                    ...(patch.fileUrl !== undefined ? { file_url: patch.fileUrl } : {}),
                    ...(patch.fileName !== undefined ? { file_name: patch.fileName } : {}),
                    ...(patch.status !== undefined ? { status: patch.status } : {}),
                    ...(patch.bookByDaysBefore !== undefined
                      ? { book_by_days_before: patch.bookByDaysBefore }
                      : {}),
                  }
                : b
            )
          )
        );
        return;
      }
      await guard("แก้ตั๋ว/booking", () =>
        fetch(`/api/engine/trips/${tripIdRef.current}/bookings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bookingId, ...dbPatch }),
        })
      );
    },
    [guard]
  );

  const removeBooking = useCallback(
    async (bookingId: string) => {
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      if (!supabaseConfigured) return;
      await guard("ลบตั๋ว/booking", () =>
        fetch(`/api/engine/trips/${tripIdRef.current}/bookings?id=${encodeURIComponent(bookingId)}`, { method: "DELETE" })
      );
    },
    [guard]
  );

  return useMemo(
    () => ({ bookings, loaded, addBooking, updateBooking, removeBooking, supabaseConfigured }),
    [bookings, loaded, addBooking, updateBooking, removeBooking]
  );
}

const BookingsContext = createContext<ReturnType<typeof useBookingsStore> | null>(null);

export function BookingsProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  const value = useBookingsStore(tripId);
  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error("useBookings ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
