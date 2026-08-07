"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, ChecklistItem } from "@/lib/supabase";

function makeChecklistId() {
  return `cl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function sortItems(items: ChecklistItem[]) {
  return [...items].sort((a, b) => {
    if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** checklist ของที่ต้องเตรียม — trip-wide ไม่แยกตามแผน A/B เหมือน bookings */
export function useChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const channelName = `checklist_changes_${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data } = await supabase.from("checklist_items").select("*");
      if (cancelled) return;
      if (data) setItems(sortItems(data as ChecklistItem[]));
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "checklist_items" },
          (payload) => {
            setItems((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((i) => i.id !== (payload.old as ChecklistItem).id);
              }
              const row = payload.new as ChecklistItem;
              const exists = prev.some((i) => i.id === row.id);
              const next = exists ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row];
              return sortItems(next);
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

  const addItem = useCallback(async (text: string, addedBy?: string | null) => {
    const now = new Date().toISOString();
    const newItem: ChecklistItem = {
      id: makeChecklistId(),
      text,
      is_checked: false,
      checked_by: null,
      added_by: addedBy ?? null,
      created_at: now,
      updated_at: now,
    };
    if (!supabaseConfigured) {
      setItems((prev) => sortItems([...prev, newItem]));
      return newItem.id;
    }
    await supabase.from("checklist_items").insert(newItem);
    return newItem.id;
  }, []);

  const toggleItem = useCallback(async (itemId: string, checked: boolean, checkedBy?: string | null) => {
    const patch = {
      is_checked: checked,
      checked_by: checked ? checkedBy ?? null : null,
      updated_at: new Date().toISOString(),
    };
    if (!supabaseConfigured) {
      setItems((prev) => sortItems(prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i))));
      return;
    }
    await supabase.from("checklist_items").update(patch).eq("id", itemId);
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    if (!supabaseConfigured) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      return;
    }
    await supabase.from("checklist_items").delete().eq("id", itemId);
  }, []);

  return { items, loaded, addItem, toggleItem, removeItem, supabaseConfigured };
}
