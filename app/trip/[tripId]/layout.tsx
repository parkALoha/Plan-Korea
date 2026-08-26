"use client";

import { useParams } from "next/navigation";
import { TripDataProvider } from "@/components/TripDataProvider";
import { TripStatusFallback } from "@/components/TripStatusFallback";
import { useActiveTripId } from "@/hooks/useActiveTripId";

/**
 * Layout ของ `/trip/[tripId]/...` — `E5-AC1`/`E5-AC2`
 *
 * 🔴 **เรียก `useActiveTripId({ fromRoute })` ตัวเดียวกับที่หน้า bare ใช้ ไม่ใช่เชื่อ `params.tripId`
 * ตรง ๆ** (P1 ขอ) — URL ที่พิมพ์/บุ๊กมาร์กไว้ก็เป็น "แหล่งความจริงที่อาจเก่า" ได้เหมือน localStorage:
 * ทริปถูกลบ · สิทธิ์ถูกถอน · เปิดคนละบัญชี — ถ้า `tripId` ใน path ใช้ไม่ได้แล้ว `resolveTripId()`
 * (ใน `useActiveTripId.ts`) จะตกไปหา fallback เดียวกับหน้า bare แทนที่จะ render ต่อด้วย id ที่ตายแล้ว
 *
 * `E5-AC2` ("สลับทริปแล้ว URL เปลี่ยน · refresh แล้วยังอยู่ทริปเดิม · กด back ได้ถูกทริป") ยังได้มาฟรี
 * จาก Next.js routing เหมือนเดิม เพราะ `fromRoute` มาจาก `useParams()` สดทุกครั้ง ไม่มี state ค้าง —
 * ตัว `resolveTripId()` แค่เพิ่มการตรวจว่า id นั้น**ยังใช้ได้จริง**ก่อนเชื่อ ไม่ได้เปลี่ยนที่มาของมัน
 *
 * `useActiveTripId()` เขียน `lastTripId` ลง localStorage เองทุกครั้งที่ resolve สำเร็จ (ไม่ว่าจะมาจาก
 * `fromRoute` หรือ fallback) ให้หน้า bare (`/`, `/today`, `/summary`) รู้ว่าครั้งหน้าควรพาไปทริปไหนก่อน
 */
export default function TripLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tripId: string }>();
  const trip = useActiveTripId({ fromRoute: params.tripId });

  if (trip.status !== "ready") return <TripStatusFallback trip={trip} />;
  return <TripDataProvider tripId={trip.tripId}>{children}</TripDataProvider>;
}
