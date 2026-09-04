"use client";

import { useParams } from "next/navigation";
import { CityPickerScreen } from "@/components/CityPickerScreen";

/**
 * `/explore/[countryId]` — ขั้นที่ ② ของ flow สร้างทริปใหม่ (ผู้ใช้สั่ง 4 ก.ย. 2026)
 * เจ้าของเนื้อ: P5 · **routing เป็นโซน P3 — แจ้งก่อนวางไฟล์แล้ว**
 *
 * 🔴 **ทำไมไม่ใช่ `/trip/new/[countryId]` ซึ่งตรงความหมายกว่า**
 * `app/trip/[tripId]/page.tsx` มีอยู่ก่อน ⇒ `/trip/new` จะถูกจับเป็น `tripId="new"`
 * **และมันจะไม่พังตอน build — มันจะพังตอน runtime เป็น "ไม่พบทริป"** ซึ่งอ่านเหมือนบั๊กข้อมูล ไม่ใช่บั๊ก routing
 *
 * หน้าบางเหมือน `app/trip/[tripId]/page.tsx` โดยตั้งใจ — อ่าน param แล้วส่งต่อ ไม่มีตรรกะที่นี่
 */
export default function ExploreCountryPage() {
  const params = useParams<{ countryId: string }>();
  return <CityPickerScreen countryId={params.countryId} />;
}
