"use client";

import { useParams } from "next/navigation";
import { CityPickerScreen } from "@/components/CityPickerScreen";

/**
 * `/explore/[countryId]` — ขั้นที่ ② ของ flow สร้างทริปใหม่ (ผู้ใช้สั่ง 4 ก.ย. 2026)
 * เจ้าของเนื้อ: P5 · **routing เป็นโซน P3 — แจ้งก่อนวางไฟล์แล้ว**
 *
 * ## 🔴 ทำไมชื่อนี้ — **และเหตุผลแรกที่ผมเขียนไว้ตรงนี้เป็นเท็จ P3 ยิงจริงแล้วหักล้าง**
 * ```
 * ผมอ้าง (ผิด)  `/trip/new` จะถูก `[tripId]` จับเป็น `tripId="new"` แล้วพังตอน runtime
 * P3 วัดจริง     วาง `app/trip/new/page.tsx` ในหมุดแล้ว build → `○ /trip/new` ขึ้นเป็น route ของตัวเอง
 *                **Next แยก static ออกจาก dynamic ให้เอง · ไม่มี conflict**
 * ```
 * ⚠️ **ผมเขียนข้อจำกัดทางเทคนิคที่ไม่มีอยู่จริง แล้วใช้มันเลือกชื่อ route** — ถ้าไม่มีใครไปยิง
 * มันจะอยู่ในไฟล์นี้ตลอดไปในฐานะ *เหตุผล* ที่คนหลังอ่านแล้วเชื่อ
 * 🎯 ***ข้อจำกัดที่แต่งขึ้นเอง อันตรายกว่าการเลือกผิด — การเลือกผิดยังแก้ได้ แต่ข้อจำกัดปลอมจะถูกอ้างต่อ***
 *
 * ## ✅ เหตุผลจริงที่ยังใช้ `/explore/[countryId]` (P3 เสนอเกณฑ์ · P5 ตัดสิน)
 * เกณฑ์: ***หน้านี้มีความหมายไหมถ้าผู้ใช้เปิดมันตรง ๆ (bookmark · แชร์ · กด back มาเจอ)***
 * · **มี** — มันคือ *"ดูเมืองในประเทศนี้"* ซึ่งอ่านรู้เรื่องโดยไม่ต้องรู้ว่ามาจากปุ่มไหน
 *   ⇒ ต่างจาก *"ขั้นที่ 2 ของ wizard"* ซึ่ง URL ควรผูกกับ flow (`/trip/new/[countryId]`)
 * · และ `explore` **มีอยู่ในคำศัพท์ของเว็บแล้ว** (`DestinationExplorer` · `TripDestinationPicker`) ไม่ได้เปิดคำใหม่
 * 🔴 **ถ้าวันหนึ่งหน้านี้เข้าถึงได้จากปุ่ม "สร้างทริปใหม่" ทางเดียว และเปิดตรง ๆ แล้วงง — `/trip/new/[countryId]` ถูกกว่า**
 *    (ย้ายได้ ไม่มีข้อจำกัดทางเทคนิคขวางอยู่ ตามที่ P3 พิสูจน์)
 *
 * ## 🔴 ห้าม import `lib/engine/db.ts` เข้าหน้านี้ — `lib/__tests__/serverDataReach.test.ts` บังคับ
 * ด่านนั้นค้ำสมมติฐานของ `proxy.ts` (ปล่อยผ่านตอนติดต่อ auth ไม่ได้ **ปลอดภัยได้ข้อเดียวคือหน้าเว็บ
 * ไม่เรนเดอร์ข้อมูลจากเซิร์ฟเวอร์**) · **แดงแม้แค่ *import ถึง* โดยยังไม่เรียก**
 * ✅ ยืนยันทิศแดงแล้วกับไฟล์นี้เอง: ใส่ `import { tripsVisibleToMe } from "@/lib/engine/db"` →
 *    ด่านแดงและระบุชื่อ `components/CityPickerScreen.tsx` ตรง ๆ → ถอนออก → เขียว
 *
 * หน้าบางเหมือน `app/trip/[tripId]/page.tsx` โดยตั้งใจ — อ่าน param แล้วส่งต่อ ไม่มีตรรกะที่นี่
 */
export default function ExploreCountryPage() {
  const params = useParams<{ countryId: string }>();
  return <CityPickerScreen countryId={params.countryId} />;
}
