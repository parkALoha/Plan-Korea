"use client";

import { useParams } from "next/navigation";
import { TripPlanScreen } from "@/components/TripPlanScreen";

/**
 * `/trip/[tripId]` — `E5-AC1`
 *
 * `TripDataProvider` มาจาก `app/trip/[tripId]/layout.tsx` แล้ว (ครอบทั้ง segment) ไม่ต้องห่อซ้ำ
 * ที่นี่แค่อ่าน `tripId` จาก path แล้วส่งต่อให้ `TripPlanScreen` (`components/TripPlanScreen.tsx`)
 * 🔴 เดิม import `HomeContent` จาก `@/app/page` — ย้ายออกมาแล้วตอนที่ `/` เปลี่ยนความหมายเป็นหน้า
 * Home ลิสต์ทริป (27 ส.ค. 2026) ไม่งั้นแก้ `app/page.tsx` ให้เป็น Home จะได้ import วนทันที
 */
export default function TripHomePage() {
  const params = useParams<{ tripId: string }>();
  return <TripPlanScreen tripId={params.tripId} />;
}
