"use client";

import { HomeScreen } from "@/components/HomeScreen";

/**
 * `/` — หน้า Home จริง (`E5`, 27 ส.ค. 2026) — เดิมหน้านี้คือดีเทลทริปเดียว (เด้งเข้าทริปตรงผ่าน
 * `useActiveTripId()`) ย้ายเนื้อนั้นไปเป็น `components/TripPlanScreen.tsx` ให้ `/trip/[tripId]`
 * ใช้แทนแล้ว — ที่นี่เหลือแค่ลิสต์ทริปของบัญชีนี้ + ทางสร้างทริปใหม่ (ดู `components/HomeScreen.tsx`)
 */
export default function HomePage() {
  return <HomeScreen />;
}
