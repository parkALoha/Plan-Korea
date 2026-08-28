"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase";
import { buildDayBridge } from "@/lib/engine/dayBridge";
import { fetchReadJson } from "@/lib/engine/fetchReadJson";
import { classifyLegacyDayPlan, type LegacyDayPlanState } from "@/lib/engine/legacyDayPlan";


/**
 * ด่านของ **หน้าที่เรนเดอร์วันจาก `data/itinerary.ts` ล้วน** — `/today` · `/summary`
 * เจ้าของ: P3-FE/Perf · 28 ส.ค. 2026 (P1 ยิงยืนยันบนหน้าจอจริง แล้วอนุมัติ)
 *
 * ## 🔴 บั๊กที่ด่านนี้มีไว้หยุด — ทริปญี่ปุ่นแสดง *แผนทริปเกาหลีทั้งฉบับ*
 * P1 เปิด `/trip/647ed2c2/summary` (ทริปญี่ปุ่น 11–14 ต.ค. โตเกียว) แล้วได้:
 * ```
 * หัวหน้า      📋 เที่ยวญี่ปุ่น · 11 – 14 ต.ค. 2026        ← ชื่อ/วันที่ **ถูก**
 * เนื้อข้างล่าง  📅 11 วัน · ปูซาน 12–15 · ซกโช 15–16 · โซล 17–21
 *              ✈️ VN610 กรุงเทพ→ฮานอย · VN428 ฮานอย→กิมแฮ   ← **แผนเกาหลีทั้งฉบับ**
 * ```
 * **ออนไลน์ ปกติ ไม่ต้องออฟไลน์** · 🔴 และมันแย่กว่าหน้าว่างมาก เพราะ**หัวเรื่องถูกต้อง** ผู้ใช้จึงไม่มี
 * เหตุผลจะสงสัยเนื้อข้างล่าง — เห็น *"ยังแสดงไม่ได้"* แล้วรู้ว่ายังไม่เสร็จ · เห็น *"ปูซาน 12–15 ต.ค."*
 * บนทริปโตเกียวแล้ว **เชื่อ** (`D55` ในรูปที่แรงที่สุด: ข้อมูลผิดพาไปผิดที่ ไม่ใช่แค่ข้อมูลไม่ครบ)
 *
 * ## 🔴 ทำไมต้องมีด่านใหม่ แทนที่จะแก้ `useTripDaysGate`
 * `useTripDaysGate` ถามว่า **"ทริปนี้มีวันไหม"** — ตอนเขียนมันเป็นตัวแทนที่ถูกของคำถามที่เราสนใจจริง
 * (*"หน้านี้เรนเดอร์ทริปนี้ได้ไหม"*) **เพราะตอนนั้นสองคำถามให้คำตอบเดียวกัน**: ทริปแพลตฟอร์มมี 0 วัน
 * 🎯 **`create_trip_makes_days` ทำให้มันแยกออกจากกัน** — ทริปแพลตฟอร์มมีวันจริงแล้ว → `"ready"` →
 * ด่านปล่อยผ่านเคสที่มันมีไว้บล็อกพอดี · **โค้ดยังทำสิ่งที่เขียนไว้เป๊ะ สิ่งที่เปลี่ยนคือคำถามนั้นเลิกเป็น
 * ตัวแทนของคำถามที่เราสนใจ** — ไม่มีอะไรฟ้องได้ เพราะไม่มีบรรทัดไหนผิด
 * · ⚠️ **และ `useTripDaysGate` ยังถูกสำหรับผู้เรียกเดิม** (`TripPlanScreen` ประกอบมันเข้ากับ
 *   `itinerarySourceResolved` ของ `B6` ซึ่งรู้จักทริปแพลตฟอร์มจริง) → **ห้ามแก้ความหมายของมัน**
 *   ไม่งั้นทริปแพลตฟอร์มจะแสดงวันของตัวเองไม่ได้ · ด่านนี้จึงเป็นคนละตัว ไม่ใช่การแก้ตัวเดิม
 *
 * ## 🔴 ด่านนี้ **หยุดการโกหก — ไม่ได้ทำให้ใช้งานได้**
 * `/today` · `/summary` **ยังไม่รองรับทริปแพลตฟอร์ม** หลังจากนี้ · มันแค่เลิกแสดงแผนของทริปอื่นแทน
 * **อย่าอ่านว่า "สองหน้านี้ผ่าน `B6` แล้ว"** — ทางที่ทำให้ใช้งานได้จริงคือต่อ `B6`
 * (`usePlatformItinerary`) เข้าสองหน้านี้เหมือนที่ `TripPlanScreen` ทำ ซึ่งยังไม่ได้ทำ
 *
 * 🔴 **`unreadable` แยกจาก `no-days`/`foreign` เพราะผู้ใช้ทำคนละอย่าง** — อ่านไม่ได้ = ต่อเน็ตแล้วลองใหม่
 * ได้เอง · ไม่มีวัน/คนละทริป = รอระบบ (P2 เขียนเหตุผลไว้ที่ `DayPlanUnavailableNotice` แล้ว)
 */
export function useLegacyDayPlanGate(tripId: string | null): LegacyDayPlanState {
  const [state, setState] = useState<LegacyDayPlanState>("loading");

  useEffect(() => {
    if (!supabaseConfigured || !tripId) return;
    const activeTripId = tripId; // narrowed ครั้งเดียว — TS ไม่พา narrowing ข้าม async function
    let cancelled = false;

    (async () => {
      setState("loading");
      const rows = await fetchReadJson<{ id: string; date: string }[]>(
        `/api/engine/trips/${activeTripId}/days`
      );
      if (cancelled) return;
      // 🔴 **ตั้งสถานะตรง ๆ ไม่เรียก `classifyLegacyDayPlan` ที่นี่** (P1 จับได้ · 28 ส.ค. 2026)
      // ของเดิมส่ง `classifyLegacyDayPlan(rows, 0, 0)` — **`legacyDayCount = 0` เป็นคำที่ไม่จริง**
      // (`ITINERARY` มี 11 วันเสมอ ไม่ว่า `rows` จะเป็นอะไร) มันปลอดภัย *เพราะลำดับของ early return
      // ในตัวฟังก์ชัน* ไม่ใช่เพราะค่าที่ส่งถูก → วันที่มีคนสลับลำดับหรือเพิ่มกิ่งข้างบน
      // `matched === rows.length && rows.length === legacyDayCount` จะกลายเป็น `0 === 0 && 0 === 0`
      // → **`legacy`** = fail-open ตัวเดิมกลับมาทางประตูหลัง
      // 🎯 **ทางแก้คือไม่สร้างอาร์กิวเมนต์ที่เป็นเท็จตั้งแต่แรก** ไม่ใช่เขียนคอมเมนต์เตือนว่ามันปลอดภัยอยู่
      //    · ที่นี่ยังไม่มี `ITINERARY` (ตั้งใจ — ไม่โหลดไฟล์ทริปเกาหลีถ้าไม่จำเป็น) จึงส่งค่าจริงไม่ได้
      //    → เคสที่ยังไม่ต้องใช้ `legacyDayCount` ก็ไม่ควรต้องกรอกมัน
      if (!rows) return void setState("unreadable");
      if (rows.length === 0) return void setState("no-days");

      // `import()` ไม่ใช่ static — ตัวด่านเองไม่ควรลาก `data/itinerary.ts` เข้าบันเดิลของทุกคนที่ import มัน
      const { ITINERARY } = await import("@/data/itinerary");
      if (cancelled) return;
      // 🔴 ใช้สะพานตัวเดียวกับที่ทั้งแอปใช้ ไม่เทียบวันที่เอง — *"ถ้าแต่ละตัวแปลงเอง
      //    มันจะแปลงไม่เหมือนกันสักวัน"* (`dayBridge.ts` เขียนไว้เอง และวันนั้นมาถึงแล้วจริง)
      const bridge = buildDayBridge(ITINERARY, rows);
      setState(classifyLegacyDayPlan(rows, bridge.matched, ITINERARY.length));
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return state;
}

export type { LegacyDayPlanState };
