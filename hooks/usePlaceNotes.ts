"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, type PlaceNote } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/localCache";
import { writeGuard } from "@/lib/writeGuard";

/**
 * โน้ต/รูปที่ฝากไว้กับ "สถานที่ในคลัง" ระหว่างที่มันไม่ได้อยู่ในวันไหน (migration 0028)
 *
 * ลากจุดแวะกลับคลัง = ลบแถว trip_stops ทิ้ง — เดิมโน้ตที่จดไว้หายไปด้วย ทั้งที่ผู้ใช้คิดว่า
 * "เก็บกลับคลัง" คือพักไว้ก่อน ไม่ใช่ทิ้ง · ตอนนี้โน้ต+รูปย้ายมาพักที่ตารางนี้แล้วกลับไปติดกับ
 * จุดแวะใหม่เองตอนลากลงวันอีกครั้ง (ดู addStopWithStashedNote ใน app/page.tsx)
 *
 * ยังไม่ได้รัน migration 0028 = `available` เป็น false แล้วทุกฟังก์ชันเขียนกลายเป็น no-op เงียบๆ
 * (ไม่เด้ง toast "บันทึกไม่สำเร็จ" ทุกครั้งที่ลากการ์ด) — พฤติกรรมที่เหลือกลับไปเหมือนก่อนเฟส 22 เป๊ะ
 */
export function usePlaceNotes(planId: string | null) {
  const [notes, setNotes] = useState<Record<string, PlaceNote>>({});
  const [loaded, setLoaded] = useState(() => !supabaseConfigured);
  const [available, setAvailable] = useState(true);

  const cacheKey = `placeNotes:${planId}`;

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

      const { data, error } = await supabase
        .from("place_notes")
        .select("*")
        .eq("plan_id", planId);
      if (cancelled) return;
      // ตารางยังไม่มีจริง (ยังไม่รัน 0028) — ปิดฟีเจอร์นี้ทิ้งเงียบๆ แทนที่จะพังทั้งหน้า
      if (error) {
        setAvailable(false);
        setLoaded(true);
        return;
      }
      const rows = (data ?? []) as PlaceNote[];
      setNotes(Object.fromEntries(rows.map((n) => [n.place_id, n])));
      writeCache(`placeNotes:${planId}`, rows);
      setLoaded(true);

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "place_notes", filter: `plan_id=eq.${planId}` },
          (payload) => {
            setNotes((prev) => {
              const next = { ...prev };
              if (payload.eventType === "DELETE") {
                delete next[(payload.old as PlaceNote).place_id];
              } else {
                const row = payload.new as PlaceNote;
                next[row.place_id] = row;
              }
              return next;
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
  }, [planId]);

  /** ดึงของจริงมาทับ state ตอนเขียนไม่ผ่าน — คู่กับ writeGuard เหมือน hook อื่น (เฟส 20.2) */
  const reload = useCallback(async () => {
    if (!supabaseConfigured || !planId) return;
    const { data } = await supabase.from("place_notes").select("*").eq("plan_id", planId);
    if (!data) return;
    const rows = data as PlaceNote[];
    setNotes(Object.fromEntries(rows.map((n) => [n.place_id, n])));
    writeCache(cacheKey, rows);
  }, [planId, cacheKey]);

  /** เก็บโน้ต/รูปของจุดแวะที่กำลังจะถูกเอาออกจากวัน ไว้กับตัวสถานที่ในคลัง
   *  ไม่มีทั้งโน้ตและรูป = ไม่ต้องเขียนอะไร (การ์ดในคลังจะได้ไม่ขึ้นป้าย "มีโน้ต" เปล่าๆ) */
  const stashNote = useCallback(
    async (placeId: string, note: string | null, photoUrl: string | null) => {
      if (!planId || !available) return false;
      if (!note && !photoUrl) return false;
      const row: PlaceNote = {
        plan_id: planId,
        place_id: placeId,
        note,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      };
      setNotes((prev) => ({ ...prev, [placeId]: row }));
      if (!supabaseConfigured) return true;
      const ok = await writeGuard("เก็บโน้ตไว้กับสถานที่", () =>
        supabase.from("place_notes").upsert(row)
      );
      if (!ok) await reload();
      return ok;
    },
    [planId, available, reload]
  );

  /** ล้างโน้ตที่ฝากไว้ — เรียกตอนโน้ตถูกย้ายกลับไปติดกับจุดแวะแล้ว (หรือตอนกด "เลิกทำ") */
  const clearNote = useCallback(
    async (placeId: string) => {
      if (!planId || !available) return;
      setNotes((prev) => {
        if (!prev[placeId]) return prev;
        const next = { ...prev };
        delete next[placeId];
        return next;
      });
      if (!supabaseConfigured) return;
      const ok = await writeGuard("ล้างโน้ตของสถานที่", () =>
        supabase.from("place_notes").delete().eq("plan_id", planId).eq("place_id", placeId)
      );
      if (!ok) await reload();
    },
    [planId, available, reload]
  );

  return { placeNotes: notes, loaded, available, stashNote, clearNote };
}
