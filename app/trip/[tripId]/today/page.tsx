"use client";

import { useParams } from "next/navigation";
import { TodayPageContent } from "@/app/today/page";

/**
 * `/trip/[tripId]/today` — `E5-AC1`
 *
 * `TripDataProvider` มาจาก `app/trip/[tripId]/layout.tsx` แล้ว (ครอบทั้ง segment) ไม่ต้องห่อซ้ำ
 * ที่นี่แค่อ่าน `tripId` จาก path แล้วส่งต่อให้ `TodayPageContent` ตัวเดียวกับที่หน้า bare `/today` ใช้
 */
export default function TripTodayPage() {
  const params = useParams<{ tripId: string }>();
  return <TodayPageContent tripId={params.tripId} />;
}
