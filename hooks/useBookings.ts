"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, TripBooking, BookingCategory } from "@/lib/supabase";

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
};

/** ตั๋ว/booking ทั้งหมดของทริป — trip-wide ไม่แยกตามแผน A/B เหมือน trip_hotels */
export function useBookings() {
  const [bookings, setBookings] = useState<TripBooking[]>([]);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `bookings_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data } = await supabase.from("bookings").select("*");
      if (cancelled) return;
      if (data) setBookings(sortBookings(data as TripBooking[]));
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          (payload) => {
            setBookings((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((b) => b.id !== (payload.old as TripBooking).id);
              }
              const row = payload.new as TripBooking;
              const exists = prev.some((b) => b.id === row.id);
              const next = exists ? prev.map((b) => (b.id === row.id ? row : b)) : [...prev, row];
              return sortBookings(next);
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
      updated_at: now,
      file_url: input.fileUrl ?? null,
      file_name: input.fileName ?? null,
    };
    if (!supabaseConfigured) {
      setBookings((prev) => sortBookings([...prev, newBooking]));
      return newBooking.id;
    }
    await supabase.from("bookings").insert(newBooking);
    return newBooking.id;
  }, []);

  const updateBooking = useCallback(
    async (bookingId: string, patch: Partial<NewBooking>) => {
      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.category !== undefined) dbPatch.category = patch.category;
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.dayId !== undefined) dbPatch.day_id = patch.dayId;
      if (patch.date !== undefined) dbPatch.date = patch.date;
      if (patch.time !== undefined) dbPatch.time = patch.time;
      if (patch.confirmationNumber !== undefined) dbPatch.confirmation_number = patch.confirmationNumber;
      if (patch.link !== undefined) dbPatch.link = patch.link;
      if (patch.note !== undefined) dbPatch.note = patch.note;
      if (patch.fileUrl !== undefined) dbPatch.file_url = patch.fileUrl;
      if (patch.fileName !== undefined) dbPatch.file_name = patch.fileName;

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
                  }
                : b
            )
          )
        );
        return;
      }
      await supabase.from("bookings").update(dbPatch).eq("id", bookingId);
    },
    []
  );

  const removeBooking = useCallback(async (bookingId: string) => {
    if (!supabaseConfigured) {
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      return;
    }
    await supabase.from("bookings").delete().eq("id", bookingId);
  }, []);

  return { bookings, loaded, addBooking, updateBooking, removeBooking, supabaseConfigured };
}
