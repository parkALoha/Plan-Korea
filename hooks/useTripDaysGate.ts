"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase";

export type TripDaysGateState = "unknown" | "empty" | "has-days";

/**
 * gate ชั้นบนของ `TripDataProvider` — `dbDaysCount === 0` กิ่งเดียว (P1, 27 ส.ค. 2026)
 *
 * ทริปที่สร้างบนแพลตฟอร์มก่อน migration `create_trip_makes_days` มี `trip_days` ว่างเปล่า —
 * แต่ 3 หน้าหลัก (`page.tsx`/`today`/`summary`) ไม่เคยรู้เรื่องนี้เลย ยัง render `ITINERARY` (เนื้อหาของ
 * ทริปเกาหลี) เต็มหน้าเงียบ ๆ — ไม่ใช่ "จุดแวะหาย" แต่เป็น "ข้อมูลของทริปอื่นที่ดูเหมือนของจริง" (P2 วัดสด)
 *
 * 🔴 **ยังไม่ใส่กิ่ง `matched === 0`** (สะพานจับคู่ได้บางส่วน) — ตามที่ P1 ขอ: กิ่งนั้นทดสอบไม่ได้จนกว่า
 * migration ลงจริง (วันนี้ `trip_days` ว่างเปล่าทุกทริปเหมือนกันหมด) จะเพิ่มพร้อมกับตอนยืนยันว่ามันทำงาน
 *
 * 🔴 **ต้อง fail-open** — "ยังไม่รู้ว่ามีวันไหม" ≠ "รู้ว่าไม่มีวัน" ค่าเริ่มต้น/ตอน fetch ล้ม (เน็ตหลุด/
 * 500) คือ `"unknown"` ไม่ใช่ `"empty"` เพื่อไม่ให้ทริปเกาหลีที่เปิดใช้จริงถูกบล็อกเพราะ fetch พลาดจังหวะเดียว
 */
export function useTripDaysGate(tripId: string | null): TripDaysGateState {
  const [state, setState] = useState<TripDaysGateState>("unknown");

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    let cancelled = false;

    (async () => {
      setState("unknown");
      try {
        const res = await fetch(`/api/engine/trips/${tripId}/days`);
        if (cancelled || !res.ok) return;
        const rows = (await res.json()) as unknown[];
        if (cancelled) return;
        setState(rows.length === 0 ? "empty" : "has-days");
      } catch {
        // เน็ตหลุด/parse ล้ม — ปล่อยเป็น "unknown" ต่อ ไม่บล็อกหน้าเพราะไม่รู้
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return state;
}
