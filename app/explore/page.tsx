"use client";

import { BackHomeLink } from "@/components/BackHomeLink";
import { DestinationExplorer } from "@/components/DestinationExplorer";
import { E5_COPY } from "@/lib/i18n";

/**
 * `/explore` — ขั้นที่ ① ของ flow สร้างทริปใหม่: **เลือกประเทศก่อน**
 * เจ้าของเนื้อ: P2-UI/UX · **routing เป็นโซน P3 — เขาส่งงานนี้ต่อมาเอง** (5 ก.ย. 2026)
 *
 * ผู้ใช้สั่งตรง:
 * > *"ถ้ากดปุ่มนี้ พาไปที่นี่ด้วย `/explore` **แต่ให้เลือกประเทศก่อน**"*
 *
 * ## 🔴 หน้านี้ไม่มีตรรกะของตัวเอง และนั่นคือเงื่อนไขที่ทำให้มันถูก
 * ตะแกรงประเทศคือ `DestinationExplorer` **ใบเดียวกับที่หน้าแรกใช้** — ไม่ใช่สำเนา
 * 🎯 ***สำเนาที่ต้องมีคนซิงก์ จะล้าเสมอ*** (`§3.5` เตือนรูปนี้ไว้ตอนวางเปลือก workflow)
 * ⇒ วันที่การ์ดประเทศเปลี่ยนหน้าตา ทั้งสองที่เปลี่ยนพร้อมกันโดยไม่มีใครต้องจำ
 *
 * ## 🔴 ยังต้องล็อกอิน — **ตั้งใจ ไม่ใช่ลืม** (P1 กับ P3 ตัดสินตรงกันโดยไม่ได้คุยกัน)
 * `proxy.ts` มี `PUBLIC_PATHS` และหน้านี้ **ไม่ได้อยู่ในนั้น** · เปิดสาธารณะเป็นการตัดสินใจแยกใบ
 * ที่ต้องดูทั้ง rate limit และ RPC ที่ `anon` เรียกได้ (`§3.5` ทะเบียนข้อ 9) — ไม่ใช่ผลพลอยได้ของงาน UI
 *
 * ## 🔴 ห้าม import `lib/engine/db.ts` เข้าหน้านี้ — `lib/__tests__/serverDataReach.test.ts` บังคับ
 * แดงแม้แค่ *import ถึง* โดยยังไม่เรียก (P5 ยิงทิศแดงยืนยันแล้วกับ `/explore/[countryId]`)
 */
export default function ExplorePage() {
  /**
   * 🔴 **`w-full` บน `<main>` จำเป็น ไม่ใช่ของแถม** — `<body>` เป็น `flex flex-col`
   * ⇒ `<main>` เป็น flex item และ `mx-auto` บน flex item แปลว่า *"หดเหลือเท่าเนื้อหา"*
   * (P2 เจอกับ `/explore/kr` เมื่อวาน: `max-w-4xl` ไม่มีผลเลยเพราะกว้างไม่เคยถึง 896)
   * · `pb-24 lg:pb-10` เว้นที่ให้ `SiteNav` ซึ่งเป็น `fixed bottom-0` ต่ำกว่า `lg`
   *   🔴 **แถบเองอยู่ที่ `app/explore/layout.tsx` แล้ว — แต่ *ที่ว่างให้มัน* ยังเป็นของหน้า**
   *      (layout ไม่รู้ว่าหน้าไหนมี `<main>` ทรงไหน) ⇒ หน้าใหม่ใต้ `/explore` ต้องเว้นเอง
   */
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:py-10 lg:pb-10">
      <BackHomeLink />
      <h1 className="mt-3 text-xl font-bold sm:text-2xl">{E5_COPY.explorer.heading}</h1>
      <p className="mb-4 mt-1 text-sm text-content-soft">{E5_COPY.explorer.subheading}</p>
      <DestinationExplorer />
    </main>
  );
}
