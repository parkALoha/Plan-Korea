"use client";

import { useEffect, useState } from "react";

export type CatalogCity = {
  /** `catalog_cities.id` (uuid) — คีย์ที่ `/api/engine/places?cityId=` ใช้ */
  id: string;
  nameTh: string;
  /** `legacy_slug` — คีย์ของรูปประจำเมือง (`/covers/city-<slug>.svg`) */
  slug: string | null;
};

/**
 * เมืองปลายทางของทริป (จาก `trip_destinations`) — `B6` เฟส 1
 *
 * ## 🔴 ทำไมต้องมี: ไซด์บาร์คลังสถานที่ผูกกับ 6 เมืองเกาหลีในไฟล์สถิต
 * `PlaceSidebar` เดิมได้รายชื่อเมืองจาก `itinerary` ซึ่งมาจาก `ITINERARY` ใน `data/itinerary.ts`
 * (ค่าคงที่ · `City` เป็น union 6 ค่าตายตัว) → **เลือกโตเกียวเป็นจุดหมายได้ แต่โตเกียวไม่มีทางโผล่ใน
 * ไซด์บาร์** เพราะมันไม่ได้อยู่ในไฟล์นั้น
 *
 * ## 🎯 สัญญาณที่ใช้แยกทาง — **"ทริปนี้มีเมืองปลายทางไหม" ไม่ใช่ "วันที่ตรงกับไฟล์เดิมไหม"**
 * วัดจากของจริง (28 ส.ค. 2026): ทริปเกาหลีเดิมคืน `destinations: []` เพราะสร้างก่อนมีตัวเลือกจุดหมาย
 * ส่วนทริปที่สร้างบนแพลตฟอร์มมีครบทุกใบ
 * · ⚠️ **เคยคิดจะเทียบวันที่กับ `ITINERARY` แทน — ทิ้งไปเพราะมันพังเงียบ:** ถ้าผู้ใช้สร้างทริปใหม่ที่บังเอิญ
 *   ตรงกับ 11–21 ต.ค. พอดี มันจะถูกตัดสินว่าเป็นทริปเกาหลีเดิม แล้วเนื้อหาที่ไม่ใช่ของเขาจะโผล่มา
 *   **โดยไม่มีอะไรฟ้อง** · สัญญาณจากข้อมูลของทริปเองไม่มีปัญหานี้
 *
 * 🔴 **ลิสต์ว่าง = "ทริปนี้ไม่มีจุดหมาย" ไม่ใช่ "อ่านไม่ได้"** — สองอย่างนี้ต้องแยกกัน ผู้เรียกจะได้ไม่
 * เผลอตกไปทางเดิมตอนที่แค่เน็ตสะดุด (รูปเดียวกับที่ `HomeScreen` แยกไว้)
 */
export type TripCitiesState =
  | { status: "loading" }
  | { status: "ready"; cities: CatalogCity[] }
  | { status: "error" };

type TripRow = {
  id: string;
  destinations?: { cityId: string; nameTh: string; slug: string | null }[];
};

export function useTripCatalogCities(tripId: string): TripCitiesState {
  // เก็บผลคู่กับ tripId ที่ผลนั้นเป็นของ แล้ว derive ตอน render — กัน react-hooks/set-state-in-effect
  // และกันเมืองของทริปเก่าโผล่เป็นของทริปใหม่ระหว่างรอโหลด (แพทเทิร์นเดียวกับ `useTripMembers`)
  const [result, setResult] = useState<{ forTripId: string; state: TripCitiesState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/trips")
      .then((r) => {
        if (!r.ok) throw new Error(`trips ${r.status}`);
        return r.json() as Promise<TripRow[]>;
      })
      .then((rows) => {
        if (cancelled) return;
        const trip = rows.find((t) => t.id === tripId);
        const cities = (trip?.destinations ?? []).map((d) => ({
          id: d.cityId,
          nameTh: d.nameTh,
          slug: d.slug ?? null,
        }));
        setResult({ forTripId: tripId, state: { status: "ready", cities } });
      })
      .catch(() => {
        if (!cancelled) setResult({ forTripId: tripId, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return result?.forTripId === tripId ? result.state : { status: "loading" };
}
