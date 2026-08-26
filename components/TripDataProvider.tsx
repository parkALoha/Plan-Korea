"use client";

import type { ReactNode } from "react";
import { BookingsProvider } from "@/hooks/useBookings";
import { CustomPlacesProvider } from "@/hooks/useCustomPlaces";
import { HotelsProvider } from "@/hooks/useHotels";
import { DayBridgeIncompleteBanner } from "@/components/DayBridgeIncompleteBanner";
import { useTripDaysGate } from "@/hooks/useTripDaysGate";
import { TripDaysEmptyNotice } from "@/components/TripDaysEmptyNotice";

/** ข้อมูลระดับทริปที่ทุกหน้าใช้ร่วมกัน (ที่พัก / booking / สถานที่ที่เพิ่มเอง)
 *  รวมไว้ที่ layout ครั้งเดียว — แต่ละ hook เลย fetch + เปิด realtime channel ชุดเดียวทั้งแอป
 *  และไม่ต้องโหลดใหม่ตอนสลับไปมาระหว่างหน้าแรก / today / summary
 *
 * 🔴 **`tripId` เป็น prop บังคับตั้งแต่ `E5-AC1`** — เดิม 3 hook ข้างในนี้ resolve เอง (`chooseSoleTrip`
 * + `GET /api/engine/trips`) ซึ่งพอมีทริปที่สองจะได้ `ambiguous` เงียบ ๆ · ตอนนี้ผู้เรียก (`/trip/[tripId]`
 * layout หรือหน้า bare ผ่าน `useActiveTripId()`) เป็นคนตัดสินแทนที่เดียว แล้วส่งลงมา */
export function TripDataProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  // 🔴 gate ชั้นบนสุด (P1, 27 ส.ค. 2026) — ตรวจก่อนมี provider ไหนเริ่ม fetch เลย เพื่อไม่ให้ทริปที่
  //    เปิดดูไม่ได้ยิง request เปล่า ๆ ไปหลายเส้น · `"unknown"` (ยังไม่รู้/fetch ล้ม) ยัง render ปกติเสมอ
  //    ไม่บล็อก — บล็อกเฉพาะตอนยืนยันแล้วว่า `trip_days` ว่างจริง (`"empty"`)
  const gate = useTripDaysGate(tripId);
  if (gate === "empty") return <TripDaysEmptyNotice />;
  return (
    <HotelsProvider tripId={tripId}>
      <BookingsProvider tripId={tripId}>
        <CustomPlacesProvider tripId={tripId}>
          <DayBridgeIncompleteBanner />
          {children}
        </CustomPlacesProvider>
      </BookingsProvider>
    </HotelsProvider>
  );
}
