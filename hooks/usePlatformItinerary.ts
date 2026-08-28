"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/data/itinerary";
import { WEEKDAYS_EN_FULL, WEEKDAYS_TH_FULL } from "@/lib/tripDateRange";

/** แถวที่ `GET /api/engine/trips/<id>/days` คืนมาหลัง P1 เพิ่ม `city_id` (28 ส.ค. 2026)
 *  ⚠️ `catalog_cities` (ของเดิม) = เมืองที่ **นอน** · `city` (ของใหม่) = เมืองที่ **วันนั้นอยู่**
 *     ชื่อคีย์กำกวมโดยรู้ตัว — P1 ไม่เปลี่ยนชื่อเดิมเพราะ `DayOvernightRow` ที่ UI ใช้อยู่อ่านชื่อนั้น */
type DbDayRow = {
  id: string;
  date: string;
  city_id: string | null;
  city: { id: string; legacy_slug: string | null; name_th: string; name_en: string } | null;
};

export type PlatformItineraryState =
  | { status: "loading" }
  | { status: "ready"; days: Day[] }
  | { status: "error" };

/** ป้ายของวันที่ผู้ใช้ยังไม่ได้เลือกเมือง — **สภาพตั้งต้นของทุกวันในทริปใหม่** ไม่ใช่เคสขอบ
 *  (ผู้ใช้ตัดสิน 28 ส.ค. 2026: *"ไม่ต้องเดาเลย ให้ว่างไว้แล้วผมเลือกเอง"* หลังเห็นว่าสูตรเฉลี่ยทุกแบบ
 *   ยัดเมืองลงวันบินผิด — ทริปจริงของเขามีวันบินเต็ม ๆ 2 วัน) */
const UNSET_CITY_TH = "ยังไม่ระบุเมือง";
const UNSET_CITY_EN = "No city yet";

/**
 * แปลงวันจากฐาน → `Day[]` ที่หน้าแผนทริปใช้ — `B6` เฟส 2
 *
 * ## 🔴 นี่คือ *ทางแยก* ไม่ใช่การแทนที่ `ITINERARY`
 * `ITINERARY` ถือ **เนื้อหาของทริปเกาหลีจริงที่ยังไม่มีที่อยู่ในฐาน** — ตารางบิน (`events`) · โน้ตรายวัน ·
 * ตัวเลือกเมืองนอน (`overnightOptions`) · `noHotel` · เวลาตายตัว · นี่คือ `P-57` ที่ P1 บันทึกไว้ว่า
 * *"ไม่มี AC ข้อไหนบังคับให้เนื้อในมันมีปลายทาง"* — **ยังจริงทุกตัวอักษร**
 * 🎯 **แทนทั้งก้อน = ทริปที่บิน 11 ต.ค. เสียตารางบินจริง** · ราคาที่รับไม่ได้ → ทริปเกาหลีเดินทางเดิม
 *
 * ## สิ่งที่วันจากฐาน **ไม่มี** และผู้เรียกต้องรู้
 * `events` · `note` · `overnightOptions` · `noHotel` · `overnightCity` — **ว่างทั้งหมดโดยตั้งใจ**
 * ไม่ใช่ข้อมูลหาย แต่คือ *ยังไม่มีที่เก็บในฐาน* · การ์ดวันรองรับการไม่มีของพวกนี้อยู่แล้ว (เป็น optional)
 *
 * ## 🔴 `city` ถูก cast เข้า union 6 ค่า และมัน "ผิด" โดยรู้ตัว
 * `Day["city"]` เป็น union ของ 6 เมืองเกาหลี · เมืองจากคลังมี 42 · slug ที่ไม่อยู่ใน union (เช่น `tokyo`)
 * จะถูก cast ลงไปตรง ๆ → `CITY_META[...]` เป็น `undefined` → **`DayStopsSection` ต้องมี fallback**
 * (ใส่ไว้แล้ว: `UNSET_CITY_META`) · ทางแก้จริงคือเลิกใช้ union ซึ่งลาก 10 ไฟล์ 37 จุด — **เฟสถัดไป**
 */
export function usePlatformItinerary(tripId: string, enabled: boolean): PlatformItineraryState {
  const [result, setResult] = useState<{ forTripId: string; state: PlatformItineraryState } | null>(
    null
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/engine/trips/${tripId}/days`)
      .then((r) => {
        if (!r.ok) throw new Error(`days ${r.status}`);
        return r.json() as Promise<DbDayRow[]>;
      })
      .then((rows) => {
        if (cancelled) return;
        const days = rows.map(toDay);
        setResult({ forTripId: tripId, state: { status: "ready", days } });
      })
      .catch(() => {
        if (!cancelled) setResult({ forTripId: tripId, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, enabled]);

  if (!enabled) return { status: "ready", days: [] };
  return result?.forTripId === tripId ? result.state : { status: "loading" };
}

function toDay(row: DbDayRow): Day {
  // 🔴 พาร์สจากสตริงเอง ไม่ใช่ `new Date(row.date)` — `new Date("2026-08-01")` อ่านเป็น **UTC**
  //    แล้วผู้ใช้ไทย (UTC+7) จะได้ชื่อวันของวันก่อนหน้าในบางกรณี · `new Date(y, m-1, d)` เป็นเวลาท้องถิ่น
  const [y, m, d] = row.date.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return {
    id: row.id,
    date: row.date,
    weekdayTh: WEEKDAYS_TH_FULL[weekday],
    weekdayEn: WEEKDAYS_EN_FULL[weekday],
    city: (row.city?.legacy_slug ?? "") as Day["city"],
    cityTh: row.city?.name_th ?? UNSET_CITY_TH,
    cityEn: row.city?.name_en ?? UNSET_CITY_EN,
    slots: [],
  };
}
