"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, type PlaceNote } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
import { hydrateThenFetch } from "@/lib/engine/hydrateThenFetch";
import { readHandoff, writeHandoffNoisily } from "@/lib/engine/cacheHandoff";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

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
 * 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม
 */
export function usePlaceNotes(tripId: string | null, planId: string | null) {
  const [notes, setNotes] = useState<Record<string, PlaceNote>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const [available, setAvailable] = useState(true);
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  /**
   * ยิงของสด **และเก็บลงเครื่องเสมอ** — `E6-AC7`
   *
   * 🔴 **ปิดช่องที่มีมาก่อนหน้านี้ ไม่ใช่แค่ย้ายที่เก็บ** (P7 · 4 ก.ย. 2026)
   * เดิม `writeCache` อยู่ใน `init()` **ที่เดียว** ⇒ ของสดที่มาจาก *realtime* กับ *`reload()`*
   * **ไม่เคยลงแคชเลย** → แก้โน้ตแล้วปิดแอปทันที เปิดออฟไลน์ **ได้โน้ตรุ่นก่อนแก้**
   * 🎯 *ขั้นที่ข้ามได้จะถูกข้ามสักวัน* — เอาการเขียนออกจากมือผู้เรียกทั้งสามทาง (ท่าเดียวกับ `useChecklist`)
   */
  const fetchNotes = useCallback(async (tripId: string, plan: string) => {
    const rows = await fetchReadJson<PlaceNote[]>(
      `/api/engine/trips/${tripId}/place-notes?planId=${encodeURIComponent(plan)}`
    );
    if (!rows) return null;
    writeHandoffNoisily(`placeNotes:${plan}`, rows, "placeNotes");
    return Object.fromEntries(rows.map((n) => [n.place_id, n]));
  }, []);

  useEffect(() => {
    const channelName = `place_notes_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      if (!supabaseConfigured || !tripId || !planId) {
        setNotes({});
        return;
      }

      /**
       * 🔴 **`subscribe()` ขึ้นมาก่อน `await` โดยตั้งใจ** (P7 · 4 ก.ย. 2026)
       * `hydrateThenFetch` **ไม่ settle เลย** ถ้าดิสก์ไม่ตอบ (`hydrateThenFetch.test.ts:169`
       * assert `settled === false` ตรง ๆ) ⇒ ทุกอย่างหลัง `await` **ไม่เกิดตลอดกาล**
       * · ฮุคอื่นแก้ด้วยการ `void` ทั้งก้อน · **ที่นี่ทำไม่ได้เพราะ `available` ต้องใช้ `outcome`**
       *   → ยกเฉพาะสิ่งที่ *ไม่* ต้องรอผล (การสมัคร realtime) ขึ้นมาไว้ข้างหน้าแทน
       * ⚠️ **ราคาที่ยังจ่ายอยู่:** ดิสก์ค้าง → `available` ค้างที่ค่าเริ่มต้น (`true`)
       *   ⇒ UI ยังเสนอปุ่มโน้ต · กดแล้วจะล้มแบบมีเสียง (`writeGuard`) **ไม่ใช่ล้มเงียบ**
       *   จึงยอมรับได้ · จดไว้เพราะมันเป็นของที่เหลือ ไม่ใช่ของที่แก้แล้ว
       * · 📌 realtime ที่มาก่อนข้อมูลชุดแรกไม่เป็นไร — handler แค่ debounce แล้วยิงใหม่
       */
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
      noteRealtimeSubscribed("place_notes");

      // 🔴 `E6-AC7` — IndexedDB อ่าน async → ลำดับ hydrate→fetch ไม่มาฟรีอีกแล้ว (ดู `hydrateThenFetch`)
      const outcome = await hydrateThenFetch<PlaceNote[]>({
        readCache: () => readHandoff<PlaceNote[]>(`placeNotes:${planId}`),
        fetchFresh: async () => {
          const map = await fetchNotes(tripId, planId);
          // ต้อง **โยน** เพื่อแยก "อ่านไม่ได้" ออกจาก "ยิงได้แต่ยังไม่มีโน้ต" (`[]` เป็นคำตอบที่ถูกต้อง)
          if (!map) throw new Error("place notes unreachable");
          return Object.values(map);
        },
        // ไม่ส่ง `writeCache` — `fetchNotes` เขียนให้แล้วทุกทาง
        // 🔴 `setLoaded` อยู่ในกิ่ง apply ด้วยเหตุผลเดียวกับ `subscribe()` ข้างบน — ดิสก์ค้างต้องไม่ค้างจอ
        applyCache: (rows) => {
          setNotes(Object.fromEntries(rows.map((n) => [n.place_id, n])));
          setLoaded(true);
        },
        applyFresh: (rows) => {
          setNotes(Object.fromEntries(rows.map((n) => [n.place_id, n])));
          setLoaded(true);
        },
        applyError: () => setLoaded(true),
        isCancelled: () => cancelled,
      });
      if (cancelled) return;
      /**
       * 🔴 **อ่านไม่ได้ ≠ ไม่มีโน้ต** · `available=false` ทำให้ UI ไม่เสนอปุ่มที่กดแล้วล้มแน่ ๆ
       * ⚠️ **`"cache-only"` ต้องเป็น `false` ด้วย** — มีของอ่านได้ แต่ *เขียน* ไม่ได้แน่นอนเพราะเน็ตล้ม
       *    (พฤติกรรมเดิมเป๊ะ: เดิมดูว่า `map` เป็น `null` ไหม ซึ่งเป็นจริงทุกครั้งที่ยิงไม่สำเร็จ)
       */
      setAvailable(outcome === "fresh");
      setLoaded(true);
    }

    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, planId, fetchNotes]);

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
        // 🔴 `null` จนกว่าฐานจะตอบ (`D7`) — เวลาของแถวนี้ไม่ใช่ของนาฬิกาเครื่องนี้
        updated_at: null,
      };
      setNotes((prev) => ({ ...prev, [placeId]: row }));
      if (!supabaseConfigured || !tripId) return true;

      const ok = await writeGuard("เก็บโน้ตไว้กับสถานที่", async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/place-notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, placeId, note, photoUrl }),
        });
        if (res.ok) {
          // เวลาจริงจาก trigger ฝั่งฐาน — เติมเข้าแถวที่วางไว้ล่วงหน้า (`D7`)
          const b = (await res.json().catch(() => ({}))) as { updatedAt?: unknown };
          const stamped = typeof b.updatedAt === "string" ? b.updatedAt : null;
          if (stamped) {
            setNotes((prev) =>
              prev[placeId] ? { ...prev, [placeId]: { ...prev[placeId], updated_at: stamped } } : prev
            );
          }
          return { error: null };
        }
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
