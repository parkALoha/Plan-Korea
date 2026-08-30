"use client";

import type { ReactNode } from "react";
import { BookingsProvider } from "@/hooks/useBookings";
import { CustomPlacesProvider } from "@/hooks/useCustomPlaces";
import { HotelsProvider } from "@/hooks/useHotels";
import { DayBridgeIncompleteBanner } from "@/components/DayBridgeIncompleteBanner";
import { TripDaysProvider } from "@/hooks/useTripDays";

/** ข้อมูลระดับทริปที่ทุกหน้าใช้ร่วมกัน (ที่พัก / booking / สถานที่ที่เพิ่มเอง)
 *  รวมไว้ที่ layout ครั้งเดียว — แต่ละ hook เลย fetch + เปิด realtime channel ชุดเดียวทั้งแอป
 *  และไม่ต้องโหลดใหม่ตอนสลับไปมาระหว่างหน้าแรก / today / summary
 *
 * 🔴 **`tripId` เป็น prop บังคับตั้งแต่ `E5-AC1`** — เดิม 3 hook ข้างในนี้ resolve เอง (`chooseSoleTrip`
 * + `GET /api/engine/trips`) ซึ่งพอมีทริปที่สองจะได้ `ambiguous` เงียบ ๆ · ตอนนี้ผู้เรียก (`/trip/[tripId]`
 * layout หรือหน้า bare ผ่าน `useActiveTripId()`) เป็นคนตัดสินแทนที่เดียว แล้วส่งลงมา
 *
 * 🔴 **`useTripDaysGate` เคยเรียกที่นี่ (`08c591c`) — ย้ายออกแล้ว (P1/P3, 27 ส.ค. 2026)** ไม่มี provider
 * ตัวไหนในนี้พึ่ง `trip_days` เลยสักตัว (`useHotels`/`useCustomPlaces` ไม่อ้างถึงเลย · `useBookings` มี
 * `trip_day_id` เป็น nullable ไม่ถูกทิ้งแม้สะพานจับคู่ไม่ได้) — gate ตรงนี้เคยบล็อกที่พัก/booking/สถานที่ที่
 * ใช้งานได้จริงไปด้วยทั้งที่ไม่เกี่ยวกัน ดู `hooks/useTripDaysGate.ts` (ตัวเดิม ไม่เปลี่ยน logic) ที่ตอนนี้
 * ถูกเรียกใน `HomeContent`/`TodayContent`/`SummaryContent` แทน — ห่อเฉพาะโครงวันที่มาจาก `ITINERARY` เท่านั้น
 * ที่พัก/booking/สถานที่ที่เพิ่มเองยังโชว์ปกติเสมอไม่ว่า `trip_days` จะว่างหรือไม่ */
export function TripDataProvider({ tripId, children }: { tripId: string | null; children: ReactNode }) {
  return (
    // 🔴 `TripDaysProvider` อยู่นอกสุด — `E6-AC11` · ทุก hook ที่ต้องการ "วันของทริป" อ่านจากที่นี่
    //    (รวม `BookingsProvider` ที่อยู่ข้างในและยังยิง `/days` เองอยู่วันนี้)
    <TripDaysProvider tripId={tripId}>
    <HotelsProvider tripId={tripId}>
      <BookingsProvider tripId={tripId}>
        <CustomPlacesProvider tripId={tripId}>
          <DayBridgeIncompleteBanner />
          {children}
        </CustomPlacesProvider>
      </BookingsProvider>
    </HotelsProvider>
    </TripDaysProvider>
  );
}
