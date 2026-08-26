"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, type TripPlan } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

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
 */
export function usePlans() {
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);

  const applyRows = useCallback((rows: PlanRow[]) => {
    setPlans(rows.map(({ id, name, created_at }) => ({ id, name, created_at })));
    // 🔴 แผนที่ active คือแถวที่ `is_active` — **ไม่ใช่ค่าที่เก็บแยกไว้อีกที่** (`D52`)
    setActivePlanId(rows.find((r) => r.is_active)?.id ?? null);
  }, []);

  const reload = useCallback(async () => {
    if (!supabaseConfigured) return;
    const res = await fetch("/api/engine/plans");
    if (!res.ok) return;
    const rows = (await res.json()) as PlanRow[];
    applyRows(rows);
    writeCache("plans", { plans: rows.map(({ id, name, created_at }) => ({ id, name, created_at })), activePlanId: rows.find((r) => r.is_active)?.id ?? null });
  }, [applyRows]);

  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const channelName = `trip_plans_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const cached = readCache<{ plans: TripPlan[]; activePlanId: string | null }>("plans");
      if (cached) {
        setPlans(cached.plans);
        setActivePlanId(cached.activePlanId);
        setLoaded(true);
      }

      const res = await fetch("/api/engine/plans");
      if (cancelled) return;
      if (res.ok) {
        const rows = (await res.json()) as PlanRow[];
        applyRows(rows);
        writeCache("plans", {
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
    }

    init();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [applyRows]);

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
      if (!supabaseConfigured) return null;
      let newId: string | null = null;
      const ok = await call("สร้างแผนใหม่", async () => {
        const res = await fetch("/api/engine/plans", {
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
          fetch("/api/engine/plans", {
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
      if (!supabaseConfigured) return;
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      await call("เปลี่ยนชื่อแผน", () =>
        fetch("/api/engine/plans", {
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
      if (!supabaseConfigured) return;
      const ok = await call("ลบแผน", () =>
        fetch(`/api/engine/plans?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      );
      // 🔴 ดึงใหม่เสมอแม้สำเร็จ — ลบแผนที่ active อยู่ทำให้ *แผนอื่นกลายเป็น active*
      //    ซึ่งเป็นผลข้างเคียงที่ฝั่งนี้เดาเองไม่ได้
      if (ok) await reload();
    },
    [call, reload]
  );

  const switchActivePlan = useCallback(
    async (id: string) => {
      if (!supabaseConfigured) return;
      const before = activePlanId;
      setActivePlanId(id);
      const ok = await call("สลับแผนที่ใช้อยู่", () =>
        fetch("/api/engine/plans", {
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
