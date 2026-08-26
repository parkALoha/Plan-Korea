"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * `"loading"` — กำลังเช็ค/ยังไม่เคยเช็ค (แสดง skeleton ที่ไม่มีเนื้อหาให้ผิด)
 * `"empty"` — ยืนยันแล้วว่า `trip_days` ว่างเปล่าจริง (แสดง `DayPlanUnavailableNotice`)
 * `"ready"` — มีวันจริง **หรือ** เช็คไม่สำเร็จ (เน็ตหลุด/500) — fail-open หลังลองแล้ว ไม่ใช่ก่อนลอง
 */
export type TripDaysGateState = "loading" | "empty" | "ready";

/**
 * gate เฉพาะโครงวันที่มาจาก `ITINERARY` — ไม่ใช่ gate ทั้งหน้า (P1/P2/P3, 27 ส.ค. 2026)
 *
 * ทริปที่สร้างบนแพลตฟอร์มก่อน migration `create_trip_makes_days` มี `trip_days` ว่างเปล่า — 3 หน้าหลัก
 * ยัง render `ITINERARY` (เนื้อหาของทริปเกาหลี) เป็นโครงวันเงียบ ๆ ไม่ว่าทริปไหนเปิดอยู่ — ไม่ใช่
 * "จุดแวะหาย" แต่เป็น "ข้อมูลของทริปอื่นที่ดูเหมือนของจริง" (P2 วัดสด)
 *
 * 🔴 **เคยเรียกที่ `TripDataProvider` มาก่อน (`08c591c`) — ย้ายออกแล้ว** เพราะบล็อกทั้งต้นไม้รวม
 * ที่พัก/booking/สถานที่ที่เพิ่มเอง ซึ่งไม่มีตัวไหนพึ่ง `trip_days` เลย — ตอนนี้แต่ละหน้าเรียกเองแล้วห่อ
 * เฉพาะส่วนที่ render โครงวันจริง ๆ (ดู `docs/engine/frontend-arch.md` §21/§22)
 *
 * 🔴 **ยังไม่ใส่กิ่ง `matched === 0`** (สะพานจับคู่ได้บางส่วน) — ตามที่ P1 ขอ: กิ่งนั้นทดสอบไม่ได้จนกว่า
 * migration ลงจริง (วันนี้ `trip_days` ว่างเปล่าทุกทริปเหมือนกันหมด) จะเพิ่มพร้อมกับตอนยืนยันว่ามันทำงาน
 *
 * 🔴 **แก้ 27 ส.ค. 2026 — เดิม `"unknown"` render เนื้อหาจริงทันทีแบบ optimistic ทำให้เห็นแผนของทริปอื่น
 * แวบหนึ่งก่อน gate ทัน** (P2 วัดสดกับ `/trip/{id}`) แยก `"loading"` (กำลังเช็ค — โชว์ skeleton ไม่ใช่เนื้อหา)
 * ออกจาก `"ready"` (เช็คแล้ว มีวันจริง **หรือ** เช็คไม่สำเร็จ) — fail-open ยังอยู่ แต่เป็นทางออกหลังลองแล้ว
 * ไม่ใช่ค่าเริ่มต้นที่ทำให้เนื้อหาผิดโชว์ก่อนเสมอ
 */
export function useTripDaysGate(tripId: string | null): TripDaysGateState {
  const [state, setState] = useState<TripDaysGateState>("loading");

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    let cancelled = false;

    (async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/engine/trips/${tripId}/days`);
        if (cancelled) return;
        if (!res.ok) {
          setState("ready"); // เช็คไม่สำเร็จ — fail-open หลังลองแล้ว ไม่บล็อกต่อ
          return;
        }
        const rows = (await res.json()) as unknown[];
        if (cancelled) return;
        setState(rows.length === 0 ? "empty" : "ready");
      } catch {
        if (!cancelled) setState("ready"); // เน็ตหลุด/parse ล้ม — เช็คไม่สำเร็จเหมือนกัน
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return state;
}
