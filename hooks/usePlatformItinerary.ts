"use client";

import { useCallback, useEffect, useState } from "react";
import type { Day } from "@/data/itinerary";
import { readTripCache, writeTripCache } from "@/lib/localCache";
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
  /**
   * `cityIdByDayId` แยกออกมาแทนที่จะยัดลง `Day` — **`Day` เป็นชนิดของไฟล์ทริปเกาหลีเดิม**
   * ที่มีผู้อ่านทั่วแอป การเพิ่มฟิลด์ที่มีค่าเฉพาะทริปแพลตฟอร์มจะกลายเป็น `undefined` เงียบ ๆ ทุกที่
   * ที่เหลือ · ตัวเลือกเมืองต้องการ **id** (ไม่ใช่ชื่อ) เพราะ `PATCH` รับ `cityId` และชื่อซ้ำกันได้
   */
  | {
      status: "ready";
      days: Day[];
      cityIdByDayId: Record<string, string | null>;
      /**
       * 🔴 `true` = ของจากเครื่อง ยังไม่ได้ยืนยันกับฐานรอบนี้ (`E6-AC4`)
       * ผู้เรียกไม่ต้องอ่านก็ได้ **แต่ต้องอ่านได้** — ไม่งั้น "เห็นข้อมูลตอนออฟไลน์" กับ
       * "เห็นข้อมูลสด" แยกไม่ออกจากภายนอก ซึ่งเป็นรูปเดียวกับ `P-50` (*ธงที่อ่านไม่ได้ ไม่ใช่ธง*)
       */
      fromCache?: boolean;
    }
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
export function usePlatformItinerary(
  tripId: string,
  enabled: boolean
): { state: PlatformItineraryState; reload: () => void } {
  const [result, setResult] = useState<{ forTripId: string; state: PlatformItineraryState } | null>(
    null
  );
  /**
   * 🔴 **หลังบันทึกเมืองของวัน ต้องอ่านใหม่จากฐาน ไม่ใช่เดาค่าใหม่ลง state เอง**
   * `PATCH …/days` ตอบแค่ `{ok:true}` — **ไม่ส่งแถวที่แก้แล้วกลับมา** → ถ้าจะอัปเดตในมือเองต้อง
   * **ปั้น `cityEn` ขึ้นเอง** ทั้งที่ `useTripCatalogCities` มีแต่ชื่อไทย · ค่าที่ปั้นเองจะดูถูกบนจอ
   * แต่ไม่ตรงกับฐาน และไม่มีอะไรฟ้องจนกว่าจะมีคนเปิด `/summary?lang=en`
   */
  const [nonce, setNonce] = useState(0);

  /**
   * ## `E6-AC4` — ทริปแพลตฟอร์มต้องอ่านได้ตอนไม่มีเน็ต
   *
   * 🔴 **ก่อนหน้านี้ hook นี้ไม่แคชอะไรเลย** · ทริปเกาหลีรอดเพราะ `ITINERARY` ติดมากับบันเดิล
   * **ทริปแพลตฟอร์มไม่มีอะไรติดมาเลย → เปิดตอนออฟไลน์แล้วว่างเปล่า และว่างโดยไม่มี error**
   * 🎯 นั่นแปลว่า *"อ่าน offline ได้"* กับ *"ไม่พังเพราะไม่พยายามโหลดอะไร"* แยกไม่ออก — เกณฑ์ที่วัดไม่ได้
   *
   * ## ลำดับ: hydrate จากเครื่อง → ยิงของสด → ทับ
   * ท่าเดียวกับ `useStops` ซึ่งพิสูจน์แล้วว่าเวิร์ก · **hydrate ใน effect ไม่ใช่ใน `useState`**
   * เพราะค่าเริ่มต้นที่ต่างกันระหว่างเซิร์ฟเวอร์กับเบราว์เซอร์ทำให้ hydration ไม่ตรงกัน
   *
   * 🔴 **แคชเก็บ *แถวดิบจากฐาน* ไม่ใช่ `Day[]` ที่แปลงแล้ว** — `toDay()` เปลี่ยนได้ทุกเมื่อ
   * (คอมเมนต์ข้างบนบอกเองว่า union 6 เมืองจะถูกรื้อเฟสถัดไป) · **เก็บผลของการแปลง = ผูกแคชกับโค้ดรุ่นนี้**
   * เก็บสิ่งที่ฐานตอบมา แล้วแปลงตอนอ่าน → รุ่นถัดไปอ่านของเดิมได้โดยไม่ต้องล้าง
   *
   * ⚠️ **ไม่มีกฎ "ห้ามทับด้วยผลว่าง" ที่นี่ และนั่นตั้งใจ** — `[]` เป็นคำตอบที่ถูกต้องได้จริง
   * (ทริปที่ยังไม่มีวัน — `useTripDaysGate` มีอยู่เพื่อสถานะนั้นโดยเฉพาะ) · กฎนั้นมีไว้กับ *การหดที่อธิบายไม่ได้*
   * เช่น `mapRows` ของ `useStops` ที่ทิ้งแถวเงียบ ๆ · **ที่นี่ไม่มีตัวแปลงที่ทำแถวหายได้**
   */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // `async function` ครอบ — ท่าเดียวกับ `useStops.ts:84` · `setState` ตรง ๆ ในตัว effect
    // ผิดกฎ `react-hooks/set-state-in-effect` (และ CI รัน `--max-warnings=0`)
    async function load() {
      const cached = readTripCache<DbDayRow[]>(tripId, "days");
      if (cached && !cancelled) setResult({ forTripId: tripId, state: readyFrom(cached, true) });
      try {
        const r = await fetch(`/api/engine/trips/${tripId}/days`);
        if (!r.ok) throw new Error(`days ${r.status}`);
        const rows = (await r.json()) as DbDayRow[];
        if (cancelled) return;
        writeTripCache(tripId, "days", rows);
        setResult({ forTripId: tripId, state: readyFrom(rows, false) });
      } catch {
        // 🔴 ล้มแล้วมีของในเครื่อง = ใช้ของนั้นต่อ **ไม่ใช่ขึ้น error ทับของที่อ่านได้อยู่**
        //    "ออฟไลน์" คือ *ผลของคำขอที่ล้ม* ไม่ใช่สถานะที่แอปติดตามเอง (`navigator.onLine` โกหก)
        if (cancelled || cached) return;
        setResult({ forTripId: tripId, state: { status: "error" } });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const state: PlatformItineraryState = !enabled
    ? { status: "ready", days: [], cityIdByDayId: {} }
    : result?.forTripId === tripId
      ? result.state
      : { status: "loading" };
  return { state, reload };
}

function readyFrom(rows: DbDayRow[], fromCache: boolean): PlatformItineraryState {
  return {
    status: "ready",
    days: rows.map(toDay),
    cityIdByDayId: Object.fromEntries(rows.map((r) => [r.id, r.city_id])),
    fromCache,
  };
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
