"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SummaryContent } from "@/app/summary/page";

/**
 * `/trip/[tripId]/summary` — `E5-AC1`
 *
 * `TripDataProvider` มาจาก `app/trip/[tripId]/layout.tsx` แล้ว (ครอบทั้ง segment) ไม่ต้องห่อซ้ำ
 * ที่นี่แค่อ่าน `tripId` จาก path แล้วส่งต่อให้ `SummaryContent` ตัวเดียวกับที่หน้า bare `/summary` ใช้
 */
export default function TripSummaryPage() {
  const params = useParams<{ tripId: string }>();
  return (
    <Suspense
      fallback={<div className="px-4 py-10 text-center text-sm text-content-soft">กำลังโหลด...</div>}
    >
      <SummaryContent tripId={params.tripId} />
    </Suspense>
  );
}
