"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, type PlaceNote } from "@/lib/supabase";
import { chooseSoleTrip } from "@/lib/engine/trip";
import { writeGuard } from "@/lib/writeGuard";
import { readCache, writeCache } from "@/lib/localCache";

const REFETCH_DEBOUNCE_MS = 300;

/**
 * โน้ต/รูปที่ฝากไว้กับสถานที่ระหว่างที่มันไม่ได้อยู่ในวันไหนของแผน — **`E3` ผ่าน route แล้ว**
 *
 * ## 🔴 `place_notes` ชี้สถานที่ได้สองทาง และการแยกอยู่ฝั่งเซิร์ฟเวอร์
 * `catalog_place_id` (คลังกลาง · UI ใช้ slug) หรือ `custom_place_id` (ของทริป · UI ใช้ id ตรง)
 * · **route แยกโดย *ถามฐาน* ว่า slug นั้นมีในคลังกลางไหม ไม่ใช่ดูรูปแบบสตริง**
 *   🎯 `custom-xxx` เป็นแค่ธรรมเนียม **ไม่มีอะไรบังคับ** — เดาจากรูปแบบคือเดา
 *
 * ## realtime เป็นสัญญาณ (P3 · `§15`)
 * `payload.new` มี `catalog_place_id` เป็น `uuid` **ไม่มี slug** → merge ตรง ๆ ได้คีย์ผิดชนิด
 */
export function usePlaceNotes(planId: string | null) {
  const [notes, setNotes] = useState<Record<string, PlaceNote>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const [available, setAvailable] = useState(true);
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotes = useCallback(async (tripId: string, plan: string) => {
    const res = await fetch(
      `/api/engine/trips/${tripId}/place-notes?planId=${encodeURIComponent(plan)}`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as PlaceNote[];
    return Object.fromEntries(rows.map((n) => [n.place_id, n]));
  }, []);

  useEffect(() => {
    const channelName = `place_notes_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      if (!supabaseConfigured || !planId) {
        setNotes({});
        return;
      }

      const cached = readCache<PlaceNote[]>(`placeNotes:${planId}`);
      if (cached) {
        setNotes(Object.fromEntries(cached.map((n) => [n.place_id, n])));
        setLoaded(true);
      }

      const tripsRes = await fetch("/api/engine/trips");
      if (cancelled || !tripsRes.ok) return void setLoaded(true);
      const trip = chooseSoleTrip((await tripsRes.json()) as { id: string }[]);
      if (cancelled || !trip.ok) return void setLoaded(true);
      tripIdRef.current = trip.tripId;

      const map = await fetchNotes(trip.tripId, planId);
      if (cancelled) return;
      if (map) {
        setNotes(map);
        writeCache(`placeNotes:${planId}`, Object.values(map));
        setAvailable(true);
      } else {
        // 🔴 อ่านไม่ได้ ≠ ไม่มีโน้ต · `available=false` ทำให้ UI ไม่เสนอปุ่มที่กดแล้วล้มแน่ ๆ
        setAvailable(false);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "place_notes" }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            const id = tripIdRef.current;
            if (!id || !planId || cancelled) return;
            const fresh = await fetchNotes(id, planId);
            if (fresh && !cancelled) setNotes(fresh);
          }, REFETCH_DEBOUNCE_MS);
        })
        .subscribe();
    }

    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [planId, fetchNotes]);

  const reload = useCallback(async () => {
    const id = tripIdRef.current;
    if (!id || !planId) return;
    const fresh = await fetchNotes(id, planId);
    if (fresh) setNotes(fresh);
  }, [planId, fetchNotes]);

  const stashNote = useCallback(
    async (placeId: string, note: string | null, photoUrl: string | null) => {
      if (!planId || !available) return false;
      if (!note && !photoUrl) return false;
      const tripId = tripIdRef.current;
      const row: PlaceNote = {
        plan_id: planId,
        place_id: placeId,
        note,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      };
      setNotes((prev) => ({ ...prev, [placeId]: row }));
      if (!supabaseConfigured || !tripId) return true;

      const ok = await writeGuard("เก็บโน้ตไว้กับสถานที่", async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/place-notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, placeId, note, photoUrl }),
        });
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await reload();
      return ok;
    },
    [planId, available, reload]
  );

  const clearNote = useCallback(
    async (placeId: string) => {
      if (!planId || !available) return;
      const tripId = tripIdRef.current;
      setNotes((prev) => {
        if (!prev[placeId]) return prev;
        const next = { ...prev };
        delete next[placeId];
        return next;
      });
      if (!supabaseConfigured || !tripId) return;

      const ok = await writeGuard("ล้างโน้ตของสถานที่", async () => {
        const res = await fetch(
          `/api/engine/trips/${tripId}/place-notes?planId=${encodeURIComponent(planId)}&placeId=${encodeURIComponent(placeId)}`,
          { method: "DELETE" }
        );
        if (res.ok) return { error: null };
        const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: b.code ?? String(res.status), message: b.error } };
      });
      if (!ok) await reload();
    },
    [planId, available, reload]
  );

  return { placeNotes: notes, loaded, available, stashNote, clearNote };
}
