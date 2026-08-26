"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";

type HiddenPlaceRow = {
  place_id: string;
  hidden_by: string | null;
  /** 🔴 ฐานเป็นคนเขียน (`D7`) — `null` = ยังไม่ได้รับคำตอบกลับมา */
  hidden_at: string | null;
};

/** หน่วงก่อนดึงใหม่ — realtime ยิงถี่ตอนซ่อนหลายที่ติดกัน */
const REFETCH_DEBOUNCE_MS = 300;

/**
 * สถานที่ที่ซ่อนจากคลัง — **`E3` ย้ายมาอ่าน/เขียนผ่าน route แล้ว**
 *
 * ## 🔴 ไคลเอนต์พูด *slug* เท่านั้น — การแปลงเป็น `uuid` อยู่ฝั่งเซิร์ฟเวอร์
 * ต่างจาก `useOvernightOverrides` ที่สะพานอยู่ฝั่งนี้ **เพราะ `"d0"` มีอยู่แต่ในไฟล์ TS**
 * · `catalog_places.legacy_slug` **อยู่ในฐาน** → เซิร์ฟเวอร์แปลงเองได้ และควรแปลงที่นั่น
 * 🎯 **เลือกฝั่งตาม *ข้อมูลอยู่ที่ไหน* ไม่ใช่ตามความเคยชิน** — ผิดฝั่งแล้วต้องส่ง uuid ไปกลับโดยไม่มีเหตุผล
 *
 * ## realtime เป็น *สัญญาณ* ไม่ใช่แหล่งข้อมูล (P3 · `§15`)
 * `payload.new` เป็นแถวดิบของสคีมาใหม่ (`catalog_place_id` เป็น `uuid` · ไม่มี slug)
 * **merge ตรง ๆ = ใส่ uuid ลงใน map ที่คีย์ด้วย slug แล้วเงียบ** → ดึงใหม่แทน
 * 🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม
 */
export function useHiddenPlaces(tripId: string | null) {
  const [hidden, setHidden] = useState<Record<string, HiddenPlaceRow>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  const fetchInto = useCallback(async (tripId: string) => {
    const res = await fetch(`/api/engine/trips/${tripId}/hidden-places`);
    if (!res.ok) return null;
    const rows = (await res.json()) as HiddenPlaceRow[];
    const map: Record<string, HiddenPlaceRow> = {};
    for (const r of rows) map[r.place_id] = r;
    return map;
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function
    const channelName = `hidden_places_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const map = await fetchInto(activeTripId);
      if (cancelled) return;
      if (map) setHidden(map);
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "hidden_places" }, () => {
          // 🔴 ไม่แตะ payload เลย — มันเป็นแถวดิบที่ไม่มี slug · ใช้เป็นสัญญาณอย่างเดียว
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            const id = tripIdRef.current;
            if (!id || cancelled) return;
            const fresh = await fetchInto(id);
            if (fresh && !cancelled) setHidden(fresh);
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
  }, [tripId, fetchInto]);

  const reload = useCallback(async () => {
    const id = tripIdRef.current;
    if (!id) return;
    const fresh = await fetchInto(id);
    if (fresh) setHidden(fresh);
  }, [fetchInto]);

  /** เขียนไม่ผ่าน → ดึงของจริงมาทับ state ที่เดาไว้ (สัญญาที่ `writeGuard` เขียนไว้ในหัวไฟล์ตัวเอง) */
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
      if (!ok) await reload();
      return ok;
    },
    [reload]
  );

  const hidePlace = useCallback(
    async (placeId: string, hiddenBy?: string) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      setHidden((prev) => ({
        ...prev,
        // 🔴 `null` จนกว่าฐานจะตอบ (`D7`) — เวลานี้เป็นของ `default now()` ไม่ใช่ของนาฬิกาเครื่องนี้
        [placeId]: { place_id: placeId, hidden_by: hiddenBy ?? null, hidden_at: null },
      }));
      await guard(
        "ซ่อนสถานที่",
        () =>
          fetch(`/api/engine/trips/${tripId}/hidden-places`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId, hiddenBy: hiddenBy ?? null }),
          }),
        (body) => {
          const stamped = typeof body.hiddenAt === "string" ? body.hiddenAt : null;
          if (stamped) {
            setHidden((prev) => (prev[placeId] ? { ...prev, [placeId]: { ...prev[placeId], hidden_at: stamped } } : prev));
          }
        }
      );
    },
    [guard]
  );

  const unhidePlace = useCallback(
    async (placeId: string) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      setHidden((prev) => {
        const next = { ...prev };
        delete next[placeId];
        return next;
      });
      await guard("เลิกซ่อนสถานที่", () =>
        fetch(`/api/engine/trips/${tripId}/hidden-places?placeId=${encodeURIComponent(placeId)}`, {
          method: "DELETE",
        })
      );
    },
    [guard]
  );

  // 🔴 คืนรูปเดิมครบทุกช่อง — `hiddenPlaceIds` กับ `supabaseConfigured` มีผู้เรียกอยู่จริง
  //    ⚠️ ผมทำสองตัวนี้หายในฉบับแรก **และ `tsc` เป็นคนจับ ไม่ใช่ผม**
  //    นี่คือชั้นที่ P4 เรียกว่า "ชั้นคอมไพล์ฟรี" — สัญญาของ hook ถูกบังคับโดยไม่ต้องมีเคย
  const hiddenPlaceIds = new Set(Object.keys(hidden));

  return { hidden, hiddenPlaceIds, loaded, hidePlace, unhidePlace, supabaseConfigured };
}
