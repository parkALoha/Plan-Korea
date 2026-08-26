"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured, ChecklistCategory, ChecklistItem } from "@/lib/supabase";
import { writeGuard } from "@/lib/writeGuard";
import { noteRealtimeSubscribed } from "@/lib/engine/realtimeStatus";

function makeChecklistId() {
  return `cl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** เวลาจริงจาก trigger ฝั่งฐาน — `D7` ไคลเอนต์อ่านอย่างเดียว ไม่เคยเป็นคนเขียน */
function stampOf(body: Record<string, unknown>): string | null {
  return typeof body.updatedAt === "string" ? body.updatedAt : null;
}

function sortItems(items: ChecklistItem[]) {
  return [...items].sort((a, b) => {
    if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** checklist ของที่ต้องเตรียม — trip-wide ไม่แยกตามแผน A/B เหมือน bookings
 *  🔴 `tripId` มาจากผู้เรียก (route `/trip/[tripId]`) ตั้งแต่ `E5-AC1` — ดู `useCustomPlaces.tsx` สำหรับเหตุผลเต็ม */
export function useChecklist(tripId: string | null) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const tripIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;

    const channelName = `checklist_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const res = await fetch(`/api/engine/trips/${tripId}/checklist`);
      if (cancelled) return;
      if (res.ok) setItems(sortItems((await res.json()) as ChecklistItem[]));
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () => {
          // 🔴 ไม่แตะ payload — แถวดิบใช้ `legacy_checked_by` ไม่ใช่ `checked_by` (P3 · `§15`)
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void refetchRef.current?.(), 300);
        })
        .subscribe();
      noteRealtimeSubscribed("checklist_items");
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
    const id = tripIdRef.current;
    if (!supabaseConfigured || !id) return;
    const res = await fetch(`/api/engine/trips/${id}/checklist`);
    if (!res.ok) return;
    setItems(sortItems((await res.json()) as ChecklistItem[]));
  }, []);


  // 🔴 realtime เรียกผ่าน ref เพื่อไม่ผูก effect หลักเข้ากับ `reload`
  //    เขียน ref ตอน render ตรง ๆ ไม่ได้ (`react-hooks/refs`) — ต้องอยู่ใน effect
  useEffect(() => {
    refetchRef.current = reload;
  }, [reload]);

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
      if (!ok) await reload();
      return ok;
    },
    [reload]
  );

  const addItem = useCallback(
    async (text: string, category: ChecklistCategory = "packing", addedBy?: string | null) => {
      const now = new Date().toISOString();
      const newItem: ChecklistItem = {
        id: makeChecklistId(),
        text,
        is_checked: false,
        checked_by: null,
        added_by: addedBy ?? null,
        created_at: now,
        // 🔴 `null` = ยังไม่มีเวลาจากเซิร์ฟเวอร์ (`D7`) — เส้นทางนี้คือตอนยังไม่ตั้งค่า Supabase
        //    ปั้นเวลาเองจะกลายเป็นค่าที่ดูเหมือนของฐานแต่มาจากนาฬิกาเครื่องนี้
        updated_at: null,
        category,
      };
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) {
        setItems((prev) => sortItems([...prev, newItem]));
        return newItem.id;
      }
      // 🔴 **เขียนก่อนแล้วค่อยใส่ state** — `id` มาจากฐาน ไคลเอนต์เดาไม่ได้ (grant ไม่เปิด `id`)
      //    เดิม optimistic ด้วย id ที่คิดเอง แล้วแถวจริงจะมี id คนละตัว → ติ๊ก/ลบจะชี้ผิดแถว
      const res = await fetch(`/api/engine/trips/${tripId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, category, addedBy: addedBy ?? null }),
      });
      if (!res.ok) {
        await guard("เพิ่มของที่ต้องเตรียม", async () => res);
        return newItem.id;
      }
      const created = (await res.json()) as ChecklistItem;
      setItems((prev) => sortItems([...prev, created]));
      return created.id;
    },
    [guard]
  );

  const toggleItem = useCallback(async (itemId: string, checked: boolean, checkedBy?: string | null) => {
    // 🔴 ไม่มี `updated_at` ในนี้ (`D7`) — แถวยังไม่ได้รับการยืนยัน เวลาที่แสดงจึงยังเป็นของเดิม
    const patch = {
      is_checked: checked,
      checked_by: checked ? checkedBy ?? null : null,
    };
    setItems((prev) => sortItems(prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i))));
    const tripId = tripIdRef.current;
    if (!supabaseConfigured || !tripId) return;
    await guard(
      "ติ๊กของที่ต้องเตรียม",
      () =>
        fetch(`/api/engine/trips/${tripId}/checklist`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: itemId, isChecked: checked }),
        }),
      // เวลาที่แท้จริงมาจาก trigger ฝั่งฐาน · เขียนลง state เมื่อคำตอบกลับมาแล้วเท่านั้น
      (body) => {
        const stamped = stampOf(body);
        if (stamped) setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, updated_at: stamped } : i)));
      }
    );
  }, [guard]);

  /** คืนแถวที่เพิ่งลบ ให้ผู้เรียกเอาไปทำปุ่ม "เลิกทำ" บน toast (เฟส 20.2) */
  const removeItem = useCallback(
    async (itemId: string): Promise<ChecklistItem | undefined> => {
      const snapshot = items.find((i) => i.id === itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) return snapshot;
      await guard("ลบของที่ต้องเตรียม", () =>
        fetch(`/api/engine/trips/${tripId}/checklist?id=${encodeURIComponent(itemId)}`, { method: "DELETE" })
      );
      return snapshot;
    },
    [items, guard]
  );

  /**
   * กู้รายการที่เพิ่งลบ
   *
   * 🔴 **ได้ `id` ใหม่ ไม่ใช่ id เดิม** — สคีมาใหม่ไม่ให้ไคลเอนต์ตั้ง `id` และแถวเดิมเป็น tombstone (`D76`)
   * ⚠️ เดิมเป็น `insert(item)` ทั้งก้อนซึ่งคืน id เดิมมาได้ · **ตอนนี้คืนไม่ได้แล้วโดยการออกแบบ**
   * · ผู้ใช้เห็นเหมือนเดิมทุกอย่าง (ของกลับมา) · **สิ่งที่ต่างคือ id ซึ่งไม่มีใครในหน้าจอเห็น**
   */
  const restoreItem = useCallback(
    async (item: ChecklistItem) => {
      const tripId = tripIdRef.current;
      if (!supabaseConfigured || !tripId) {
        setItems((prev) => sortItems([...prev.filter((i) => i.id !== item.id), item]));
        return;
      }
      const res = await fetch(`/api/engine/trips/${tripId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text, category: item.category, addedBy: item.added_by }),
      });
      if (!res.ok) {
        await guard("กู้ของที่ต้องเตรียมคืน", async () => res);
        return;
      }
      const created = (await res.json()) as ChecklistItem;
      setItems((prev) => sortItems([...prev.filter((i) => i.id !== item.id), created]));
      return;
    },
    [guard]
  );

  return { items, loaded, addItem, toggleItem, removeItem, restoreItem, supabaseConfigured };
}
