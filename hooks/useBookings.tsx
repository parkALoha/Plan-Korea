"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDayBridge } from "@/lib/engine/dayBridge";
import { chooseSoleTrip } from "@/lib/engine/tripChoice";
import { supabase, supabaseConfigured, TripBooking, BookingCategory, BookingStatus } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

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
 *  ตัวจริงที่ fetch + เปิด realtime channel เรียกครั้งเดียวที่ BookingsProvider ที่เหลืออ่านผ่าน useBookings() */
function useBookingsStore() {
  const [bookings, setBookings] = useState<TripBooking[]>([]);
  const tripIdRef = useRef<string | null>(null);
  const dayToUuid = useRef<Map<string, string>>(new Map());
  const uuidToDay = useRef<Map<string, string>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `bookings_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      // 🔴 คืนการใช้แคชที่ผมทำหายตอนเขียนใหม่ — `eslint` จับให้ (import ค้างโดยไม่มีใครใช้)
      //    แคชคือสิ่งที่ทำให้หน้าขึ้นทันทีตอนเปิดและยังอ่านได้ตอนเน็ตหลุด (เฟส 18)
      const cached = readCache<TripBooking[]>("bookings");
      if (cached) {
        setBookings(sortBookings(cached));
        setLoaded(true);
      }

      if (!supabaseConfigured) return void setLoaded(true);

      const tripsRes = await fetch("/api/engine/trips");
      if (cancelled || !tripsRes.ok) return void setLoaded(true);
      const trip = chooseSoleTrip((await tripsRes.json()) as { id: string }[]);
      if (cancelled || !trip.ok) return void setLoaded(true);
      tripIdRef.current = trip.tripId;

      const daysRes = await fetch(`/api/engine/trips/${trip.tripId}/days`);
      if (cancelled || !daysRes.ok) return void setLoaded(true);
      // 🔴 **`import()` ไม่ใช่ static import โดยตั้งใจ** — `layoutImportGraph` จับได้ว่า
      //    hook นี้อยู่ใน `TripDataProvider` ซึ่งอยู่ใน root layout
      //    → static import จะลาก `data/itinerary.ts` (2,290 บรรทัด) **เข้าบันเดิลของทุกหน้า
      //    รวม `/login` และ 404 ซึ่งไม่ต้องล็อกอินด้วยซ้ำ**
      //    ⚠️ ด่านจับให้ ไม่ใช่ผมเห็นเอง · hook อื่นที่ import ตรง ๆ ได้เพราะไม่ได้อยู่ใน layout
      const { ITINERARY } = await import("@/data/itinerary");
      const bridge = buildDayBridge(ITINERARY, (await daysRes.json()) as { id: string; date: string }[]);
      dayToUuid.current = new Map(
        ITINERARY.map((d) => [d.id, bridge.toDbId(d.id)]).filter((e): e is [string, string] => e[1] !== null)
      );
      uuidToDay.current = new Map([...dayToUuid.current].map(([k, v]) => [v, k]));

      const res = await fetch(`/api/engine/trips/${trip.tripId}/bookings`);
      if (cancelled) return;
      if (res.ok) {
        const rows = (await res.json()) as (TripBooking & { trip_day_id: string | null })[];
        // 🔴 `day_id` ที่ route คืนมาเป็น uuid — แปลงเป็น `"d0"` ที่นี่
        //    วันที่ไม่มีในไฟล์เดิม → `day_id` เป็น `null` **ไม่ใช่ uuid ดิบ** ที่ UI หาไม่เจอ
        const mapped = rows.map((r) => ({
          ...r, day_id: r.trip_day_id ? uuidToDay.current.get(r.trip_day_id) ?? null : null,
        }));
        setBookings(sortBookings(mapped));
        writeCache("bookings", mapped);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  /** ดึงของจริงจาก DB มาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard (เฟส 20.2) */
  const reload = useCallback(async () => {
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId) return;
    const res = await fetch(`/api/engine/trips/${tripId}/bookings`);
    if (!res.ok) return;
    const rows = (await res.json()) as (TripBooking & { trip_day_id: string | null })[];
    const mapped = rows.map((r) => ({
      ...r, day_id: r.trip_day_id ? uuidToDay.current.get(r.trip_day_id) ?? null : null,
    }));
    setBookings(sortBookings(mapped));
    writeCache("bookings", mapped);
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

export function BookingsProvider({ children }: { children: ReactNode }) {
  const value = useBookingsStore();
  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error("useBookings ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
