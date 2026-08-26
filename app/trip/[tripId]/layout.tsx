"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { TripDataProvider } from "@/components/TripDataProvider";
import { rememberActiveTripId } from "@/hooks/useActiveTripId";

/**
 * Layout ของ `/trip/[tripId]/...` — `E5-AC1`/`E5-AC2`
 *
 * `tripId` มาจาก **path** ตรง ๆ ผ่าน `useParams()` — ไม่ resolve เอง ไม่เดา ตรงกับหลักการเดียวกับ
 * ฝั่งเซิร์ฟเวอร์ (`app/api/engine/trips/[tripId]/.../route.ts`) `E5-AC2` ("สลับทริปแล้ว URL เปลี่ยน ·
 * refresh แล้วยังอยู่ทริปเดิม · กด back ได้ถูกทริป") ได้มาฟรีจาก Next.js routing เอง เพราะ `tripId`
 * ไม่เคยถูกเก็บเป็น state ที่ไหนเลยนอกจาก URL — เปลี่ยน URL = เปลี่ยนทริปทันที ไม่มี state ค้าง
 *
 * `rememberActiveTripId()` บันทึกไว้ให้หน้า bare (`/`, `/today`, `/summary` — `BareTripDataProvider`)
 * รู้ว่าครั้งหน้าควรพาไปทริปไหนก่อน โดยไม่ต้องเดาจาก `chooseSoleTrip` เพียงอย่างเดียว
 */
export default function TripLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;

  useEffect(() => {
    if (tripId) rememberActiveTripId(tripId);
  }, [tripId]);

  return <TripDataProvider tripId={tripId ?? null}>{children}</TripDataProvider>;
}
