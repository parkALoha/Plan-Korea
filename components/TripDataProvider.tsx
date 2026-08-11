"use client";

import type { ReactNode } from "react";
import { BookingsProvider } from "@/hooks/useBookings";
import { CustomPlacesProvider } from "@/hooks/useCustomPlaces";
import { HotelsProvider } from "@/hooks/useHotels";

/** ข้อมูลระดับทริปที่ทุกหน้าใช้ร่วมกัน (ที่พัก / booking / สถานที่ที่เพิ่มเอง)
 *  รวมไว้ที่ layout ครั้งเดียว — แต่ละ hook เลย fetch + เปิด realtime channel ชุดเดียวทั้งแอป
 *  และไม่ต้องโหลดใหม่ตอนสลับไปมาระหว่างหน้าแรก / today / summary */
export function TripDataProvider({ children }: { children: ReactNode }) {
  return (
    <HotelsProvider>
      <BookingsProvider>
        <CustomPlacesProvider>{children}</CustomPlacesProvider>
      </BookingsProvider>
    </HotelsProvider>
  );
}
