"use client";

import { useParams } from "next/navigation";
import { HomeContent } from "@/app/page";

/**
 * `/trip/[tripId]` — `E5-AC1`
 *
 * `TripDataProvider` มาจาก `app/trip/[tripId]/layout.tsx` แล้ว (ครอบทั้ง segment) ไม่ต้องห่อซ้ำ
 * ที่นี่แค่อ่าน `tripId` จาก path แล้วส่งต่อให้ `HomeContent` ตัวเดียวกับที่หน้า bare `/` ใช้
 */
export default function TripHomePage() {
  const params = useParams<{ tripId: string }>();
  return <HomeContent tripId={params.tripId} />;
}
