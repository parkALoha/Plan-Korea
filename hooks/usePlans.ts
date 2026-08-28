"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, type TripPlan } from "@/lib/supabase";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";
import { readTripCache, writeTripCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";

type PlanRow = TripPlan & { is_active: boolean };

/**
 * แผนของทริป — **`E3` ผ่าน route แล้ว** · `D52`
 *
 * ## 🔴 `activePlanId` ไม่ได้มาจาก `trip_meta` อีกแล้ว
 * `D52` ตัดสินว่า **ไม่มี `trips.active_plan_id`** — ใช้ `trip_plans.is_active`
 * + partial unique index แทน → **ไม่มี FK วน ไม่ต้องใช้ `deferrable`** (`P-27`)
 * · สลับแผนจึงต้องปลดของเก่าและตั้งของใหม่**ในทรานแซกชันเดียว** → RPC `set_active_plan`
 *
 * ## 🔴 `P-71` แก้ไปพร้อมกัน
 * ของเดิม `await writeGuard(...)` **ทิ้งค่าที่คืนมา 6 จุด** และ **ไม่มี `reload` ทั้งไฟล์**
 * → *"ก๊อปจุดแวะมาแผนใหม่"* ล้มได้โดยแอปเดินต่อเหมือนสำเร็จ
 * **แผนที่ก๊อปมาไม่ครบ ไม่มีทางรู้ว่าขาดอะไร** เพราะไม่เคยมีใครเห็นว่ามันล้ม
 * · ตอนนี้ **ทุกจุดรับค่าที่คืนมา** และ **การก๊อปทั้งใบอยู่ใน RPC ทรานแซกชันเดียว**
 *   → ล้ม = ไม่มีแผนใหม่เลย **ซึ่งดีกว่าแผนครึ่งใบ**
 *
 * ## 🔴 `tripId` เป็น prop บังคับตั้งแต่วันนี้ — แก้บั๊กที่ผู้ใช้จริงเจอ (P1 พบ, P3 แก้, 27 ส.ค. 2026)
 * เดิมไม่รับ `tripId` เลย (เขียนก่อน `E5-AC1` มี `/trip/[tripId]`) เรียก `/api/engine/plans` เฉย ๆ ซึ่งฝั่ง
 * เซิร์ฟเวอร์ต้องเดาทริปเองผ่าน `soleTrip()` — **พอผู้ใช้มีทริปที่สอง เดาไม่ได้ คืน `409 ambiguous` ทุกครั้งที่
 * เปิดหน้า** ทั้งที่หน้านั้นรู้ทริปที่ถูกต้องอยู่แล้วจาก `useActiveTripId()` (ส่งเป็น prop ลงมาให้ 9 hook ที่
 * เหลือใช้กันหมดแล้ว) — สองกลไกตัดสินใจ "ทริปไหน" ในหน้าเดียวกัน คนละที่ คนละคำตอบ
 * ⚠️ **เมื่อคืน `fetchReadJson` (§27) เปิด toast ให้ทุกจุดอ่านที่เคยเงียบ** — `409 ambiguous` (สถานะที่
 * ต้องมีหน้าเลือกทริป ไม่ใช่ "อ่านไม่สำเร็จ") เลยกลายเป็น toast แดง *"ลองรีเฟรชอีกครั้ง"* ที่รีเฟรชกี่ครั้งก็
 * ไม่หาย — งานทั้งสองฝั่งถูกคนละเรื่อง รวมกันได้ผลที่ไม่มีใครตั้งใจ
 * 🎯 **ทางแก้คือส่ง `tripId` ที่ resolve แล้วไปให้ route ใช้ตรง ๆ ไม่ใช่ปิดเสียง toast** — ตัด `soleTrip()`
 * ออกจากเส้นทางนี้ทั้งเส้น ambiguous หมดไปเพราะไม่มีอะไรให้เดาอีกแล้ว ไม่ใช่เพราะซ่อนผลของมัน
 */
export function usePlans(tripId: string | null) {
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  // 🔴 สลับทริปแล้วต้องไม่เห็นแผนของทริปเก่า — ดู `useHotels.tsx` สำหรับเหตุผลเต็ม
  //    (provider ไม่ถูก remount ตอนสลับทริป · คีย์แคชที่ scope แล้วแก้ได้แค่ครึ่งเดียว)
  // ⚠️ **`activePlanId` ต้องรีเซ็ตด้วย ไม่ใช่แค่ `plans`** — มันถูกส่งต่อเป็น `planId` ให้
  //    `useStops`/`useDaySettings`/`usePlaceNotes` ซึ่งคีย์แคชด้วย `xxx:{planId}` → ถ้าค้างข้ามทริป
  //    สามฮุคนั้นจะไปดึงแคชของแผนที่ไม่ได้อยู่ในทริปนี้ **ทั้งที่คีย์ของมันเอง scope ถูกแล้ว**
  const [shownTripId, setShownTripId] = useState<string | null>(tripId);
  if (shownTripId !== tripId) {
    setShownTripId(tripId);
    setPlans([]);
    setActivePlanId(null);
    setLoaded(!supabaseConfigured);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const tripIdRef = useRef<string | null>(null);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  const applyRows = useCallback((rows: PlanRow[]) => {
    setPlans(rows.map(({ id, name, created_at }) => ({ id, name, created_at })));
    // 🔴 แผนที่ active คือแถวที่ `is_active` — **ไม่ใช่ค่าที่เก็บแยกไว้อีกที่** (`D52`)
    setActivePlanId(rows.find((r) => r.is_active)?.id ?? null);
  }, []);

  const reload = useCallback(async () => {
    const id = tripIdRef.current;
    if (!supabaseConfigured || !id) return;
    const rows = await fetchReadJson<PlanRow[]>(`/api/engine/plans?tripId=${encodeURIComponent(id)}`);
    if (!rows) return;
    applyRows(rows);
    writeTripCache(id, "plans", { plans: rows.map(({ id, name, created_at }) => ({ id, name, created_at })), activePlanId: rows.find((r) => r.is_active)?.id ?? null });
  }, [applyRows]);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ที่นี่ครั้งเดียว — closure ของ TS ไม่ narrow ข้าม async function
    const channelName = `trip_plans_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readTripCache<{ plans: TripPlan[]; activePlanId: string | null }>(activeTripId, "plans");
      if (cached) {
        setPlans(cached.plans);
        setActivePlanId(cached.activePlanId);
        setLoaded(true);
      }

      const rows = await fetchReadJson<PlanRow[]>(
        `/api/engine/plans?tripId=${encodeURIComponent(activeTripId)}`
      );
      if (cancelled) return;
      if (rows) {
        applyRows(rows);
        writeTripCache(activeTripId, "plans", {
          plans: rows.map(({ id, name, created_at }) => ({ id, name, created_at })),
          activePlanId: rows.find((r) => r.is_active)?.id ?? null,
        });
      }
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_plans" }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
      noteRealtimeSubscribed("trip_plans");
    }

    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, applyRows]);

  /**
   * 🔴 **ทุกจุดรับค่าที่คืนมา** — `P-71` คือการทิ้งค่าที่คืนมา 6 จุดในไฟล์นี้
   * และ `reload()` ตอนล้มคือครึ่งที่หายไปอีกครึ่งหนึ่ง
   */
  const call = useCallback(
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

  const createPlan = useCallback(
    async (
      name: string,
      // 🔴 คืนรูปเดิมครบ — `activate` มีผู้เรียกอยู่จริง (`app/page.tsx:345`) และ `tsc` เป็นคนจับ
      //    `id` ของเดิมถูกถอด: ไคลเอนต์ตั้ง `id` ไม่ได้แล้ว (grant ไม่เปิด) ฐานเป็นคนออก
      options?: { duplicateFrom?: string; activate?: boolean }
    ): Promise<string | null> => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return null;
      let newId: string | null = null;
      const ok = await call("สร้างแผนใหม่", async () => {
        const res = await fetch(`/api/engine/plans?tripId=${encodeURIComponent(tripId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, duplicateFrom: options?.duplicateFrom }),
        });
        if (res.ok) {
          const body = (await res.json()) as { id: string };
          newId = body.id;
        }
        return res;
      });
      if (!ok) return null;
      // ค่าเริ่มต้นคือสลับไปแผนใหม่ทันที — ตรงกับพฤติกรรมเดิม (`activate !== false`)
      if (newId && options?.activate !== false) {
        await call("สลับแผนที่ใช้อยู่", () =>
          fetch(`/api/engine/plans?tripId=${encodeURIComponent(tripId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: newId, makeActive: true }),
          })
        );
      }
      await reload();
      return newId;
    },
    [call, reload]
  );

  const renamePlan = useCallback(
    async (id: string, name: string) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      await call("เปลี่ยนชื่อแผน", () =>
        fetch(`/api/engine/plans?tripId=${encodeURIComponent(tripId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name }),
        })
      );
    },
    [call]
  );

  const deletePlan = useCallback(
    async (id: string) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      const ok = await call("ลบแผน", () =>
        fetch(`/api/engine/plans?tripId=${encodeURIComponent(tripId)}&id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        })
      );
      // 🔴 ดึงใหม่เสมอแม้สำเร็จ — ลบแผนที่ active อยู่ทำให้ *แผนอื่นกลายเป็น active*
      //    ซึ่งเป็นผลข้างเคียงที่ฝั่งนี้เดาเองไม่ได้
      if (ok) await reload();
    },
    [call, reload]
  );

  const switchActivePlan = useCallback(
    async (id: string) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return;
      const before = activePlanId;
      setActivePlanId(id);
      const ok = await call("สลับแผนที่ใช้อยู่", () =>
        fetch(`/api/engine/plans?tripId=${encodeURIComponent(tripId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, makeActive: true }),
        })
      );
      if (!ok) setActivePlanId(before);
    },
    [call, activePlanId]
  );

  return {
    plans,
    activePlanId,
    loaded,
    createPlan,
    renamePlan,
    deletePlan,
    switchActivePlan,
    supabaseConfigured,
  };
}
