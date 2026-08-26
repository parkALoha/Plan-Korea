"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured, CustomPlace } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

function makeCustomPlaceId() {
  return `custom-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** ตัวจริงที่ fetch + เปิด realtime channel — เรียกครั้งเดียวที่ CustomPlacesProvider
 *  (เดิม NearbyPlacesModal เรียก hook นี้เองอีกชุด = ดึงตารางซ้ำ + channel ที่สองทุกครั้งที่เปิด modal) */
/** หน่วงก่อนดึงใหม่ — realtime ยิงถี่ตอนมีคนเพิ่มหลายที่ติดกัน · ดึงทุกครั้งคือ N คำขอ */
const REFETCH_DEBOUNCE_MS = 300;

/**
 * 🔴 **`tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1`** — ไม่ใช่ resolve เองอีกต่อไป
 * เดิม hook นี้ยิง `GET /api/engine/trips` + `chooseSoleTrip()` เอง (เหมือนอีก 8 hook) ซึ่งพอมีทริปที่สอง
 * จะได้ `ambiguous` เงียบ ๆ — เปลี่ยนพร้อมกันทั้ง 9 hook ในคอมมิตเดียว (P1 เตือนไว้ ไม่ทำทีละตัว)
 */
function useCustomPlacesStore(tripId: string | null) {
  const [customPlaces, setCustomPlaces] = useState<CustomPlace[]>([]);
  const tripIdRef = useRef<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function

    const channelName = `custom_places_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    /**
     * 🔴 **อ่านผ่าน route ไม่ใช่ `.from()` ตรง ๆ อีกแล้ว** — `E3-AC1`
     *    RLS ยังเป็นคนกรองเหมือนเดิม แค่ย้ายที่รันไปฝั่งเซิร์ฟเวอร์ (`D38`)
     */
    async function fetchPlaces(tripId: string): Promise<CustomPlace[] | null> {
      return fetchReadJson<CustomPlace[]>(`/api/engine/trips/${tripId}/custom-places`);
    }

    async function init() {
      const cached = readCache<CustomPlace[]>("customPlaces");
      if (cached) {
        setCustomPlaces(cached);
        setLoaded(true);
      }

      const rows = await fetchPlaces(activeTripId);
      if (cancelled) return;
      if (rows) {
        setCustomPlaces(rows);
        writeCache("customPlaces", rows);
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "custom_places" },
          (payload) => {
            // 🔴 **DELETE ใช้ `payload.old.id` ได้ · INSERT/UPDATE ห้ามแปลง `payload.new` เด็ดขาด** (P3 · `§15`)
            //    `postgres_changes` ส่งแถวดิบของตารางเดียวจาก WAL **ไม่มี join**
            //    → `payload.new` ไม่มีชื่อและไม่มีเมือง · แปลงแล้วจะได้ชื่อว่างทุกแถว **โดยไม่มี error**
            //    (`toCustomPlace` โยนถ้าใครลองทำ — แต่ทางที่ถูกคือไม่เรียกมันเลย)
            if (payload.eventType === "DELETE") {
              const gone = (payload.old as { id?: string }).id;
              if (gone) setCustomPlaces((prev) => prev.filter((p) => p.id !== gone));
              return;
            }
            // ใช้เป็น *สัญญาณว่ามีอะไรเปลี่ยน* แล้วดึงใหม่ — คง join ไว้จุดเดียวที่ `db.ts`
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(async () => {
              const id = tripIdRef.current;
              if (!id || cancelled) return;
              const fresh = await fetchPlaces(id);
              if (fresh && !cancelled) {
                setCustomPlaces(fresh);
                writeCache("customPlaces", fresh);
              }
            }, REFETCH_DEBOUNCE_MS);
          }
        )
        .subscribe();
      noteRealtimeSubscribed("custom_places");
    }

    init();

    return () => {
      cancelled = true;
      // 🔴 เคลียร์ตัวตั้งเวลาด้วย ไม่งั้น refetch จะยิงหลัง unmount แล้ว setState ใส่ของที่ตายแล้ว
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId]);

  const addCustomPlace = useCallback(
    async (place: Omit<CustomPlace, "id" | "created_at">) => {
      // 🔴 **เขียนก่อน แล้วค่อยใส่ state — กลับด้านจากของเดิมที่เป็น optimistic** (`E3`)
      //
      // เหตุผลไม่ใช่ความชอบ: `id` **ไม่อยู่ใน grant ของไคลเอนต์** (`20260825140057:137`)
      // → ฐานเป็นคนออก id · ฝั่งนี้เดาไม่ได้ · จะ optimistic ต้องใช้ id ชั่วคราวแล้วสลับทีหลัง
      // ซึ่งเปิดคลาสบั๊กทั้งชุด (echo ซ้ำ · อ้าง id เก่าค้าง · สลับไม่ทัน)
      //
      // 🎯 **และมันดีกว่าเดิมในทางที่ผู้ใช้เห็น:** ของเดิมการ์ดโผล่แล้วหายถ้าเขียนไม่ผ่าน
      //    ตอนนี้ **ถ้าเขียนไม่ผ่าน การ์ดไม่เคยโผล่เลย** — ไม่มีผี
      // ⚠️ ราคา: การ์ดขึ้นช้ากว่าเดิมหนึ่ง round trip · ผู้เรียกทุกตัว `await` อยู่แล้ว จึงไม่มีใครต้องแก้
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) {
        // ยังไม่มีทริป/ยังไม่ตั้งค่า — คืนรูปเดิมให้ผู้เรียกเดินต่อได้ (โหมดไม่มีฐาน)
        return { ...place, id: makeCustomPlaceId(), created_at: new Date().toISOString() };
      }

      let created: CustomPlace | null = null;
      const ok = await writeGuard("เพิ่มสถานที่ใหม่", async () => {
        const res = await fetch(`/api/engine/trips/${tripId}/custom-places`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(place),
        });
        if (res.ok) {
          created = (await res.json()) as CustomPlace;
          return { error: null };
        }
        // 🔴 ส่ง `code` ต่อให้ `writeGuard` — มันแยก "ไม่มีสิทธิ์" ออกจาก "ลองใหม่ได้" จากตรงนี้
        //    แปลงทิ้งเมื่อไหร่ ผู้ใช้จะได้ข้อความ "ลองใหม่อีกครั้ง" กับของที่ลองใหม่ไม่ได้ตลอดกาล
        const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        return { error: { code: body.code ?? String(res.status), message: body.error } };
      });

      if (ok && created) {
        const row = created as CustomPlace;
        setCustomPlaces((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]));
        return row;
      }
      // ล้มแล้ว — `writeGuard` บอกผู้ใช้ไปแล้ว · คืนรูปที่ผู้เรียกใช้ต่อได้โดยไม่ทำให้ทั้งหน้าพัง
      return { ...place, id: makeCustomPlaceId(), created_at: new Date().toISOString() };
    },
    []
  );

  return useMemo(
    () => ({ customPlaces, loaded, addCustomPlace, supabaseConfigured }),
    [customPlaces, loaded, addCustomPlace]
  );
}

const CustomPlacesContext = createContext<ReturnType<typeof useCustomPlacesStore> | null>(null);

export function CustomPlacesProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  const value = useCustomPlacesStore(tripId);
  return <CustomPlacesContext.Provider value={value}>{children}</CustomPlacesContext.Provider>;
}

export function useCustomPlaces() {
  const ctx = useContext(CustomPlacesContext);
  if (!ctx) throw new Error("useCustomPlaces ต้องถูกเรียกใต้ <TripDataProvider> เท่านั้น");
  return ctx;
}
