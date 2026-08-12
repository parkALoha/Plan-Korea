"use client";

import { useEffect, useState } from "react";
import { cityCenter } from "@/data/places";
import type { Day } from "@/data/itinerary";
import type { DayWeather } from "@/lib/weather";

/** แคชระดับโมดูล + กันยิงซ้ำระหว่างที่คำขอเดิมยังค้างอยู่ (รูปแบบเดียวกับ usePlaceDetails ตั้งแต่บั๊ก 9.2)
 *  — หน้าแผน mount การ์ดวัน 11 ใบพร้อมกัน ถ้าไม่ dedupe จะยิงเมืองเดียวกันซ้ำ 3-4 รอบ */
const cache = new Map<string, DayWeather[]>();
const inFlight = new Map<string, Promise<DayWeather[]>>();

function keyOf(city: string, start: string, end: string) {
  return `${city}|${start}|${end}`;
}

async function fetchCityWeather(
  city: Day["city"],
  start: string,
  end: string
): Promise<DayWeather[]> {
  const key = keyOf(city, start, end);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const center = cityCenter(city);
  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/weather?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}&start=${start}&end=${end}`
      );
      const data = await res.json();
      const days: DayWeather[] = data.days ?? [];
      cache.set(key, days);
      return days;
    } catch {
      return [];
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * พยากรณ์อากาศของทุกวันในทริป — ยิง **1 คำขอต่อเมือง** ครอบช่วงวันที่ของเมืองนั้น
 * ไม่ใช่ 1 คำขอต่อวัน (11 วันแต่มีแค่ 6 เมือง และหลายวันติดกันอยู่เมืองเดียวกัน)
 *
 * คืน `null` ต่อวันที่ยังพยากรณ์ไม่ได้ — Open-Meteo มองไปข้างหน้าได้ ~16 วันเท่านั้น
 * ตอนวางแผนล่วงหน้าเป็นเดือนจึงว่างทั้งหมด ซึ่งเป็นสภาพปกติ ไม่ใช่ error
 */
export function useTripWeather(itinerary: Day[]) {
  const [byDay, setByDay] = useState<Record<string, DayWeather>>({});
  // เหลืออีกกี่วันถึงวันแรกของทริป — คำนวณใน effect ไม่ใช่ตอน render เพราะ Date.now() เป็น impure
  // (eslint `react-hooks/purity` จับ) · null = ยังไม่ได้คำนวณรอบแรก
  const [daysUntilFirstDay, setDaysUntilFirstDay] = useState<number | null>(null);

  useEffect(() => {
    if (itinerary.length === 0) return;
    let cancelled = false;

    // ช่วงวันของแต่ละเมือง (วันแรกสุด → วันท้ายสุดที่อยู่เมืองนั้น)
    const rangeByCity = new Map<Day["city"], { start: string; end: string }>();
    for (const day of itinerary) {
      const current = rangeByCity.get(day.city);
      if (!current) rangeByCity.set(day.city, { start: day.date, end: day.date });
      else {
        if (day.date < current.start) current.start = day.date;
        if (day.date > current.end) current.end = day.date;
      }
    }

    (async () => {
      // อยู่ในบล็อก async ไม่ใช่ body ของ effect ตรงๆ — eslint `react-hooks/set-state-in-effect`
      // ห้ามเฉพาะการเรียก setState แบบ synchronous ในตัว effect ซึ่งทำให้เกิด cascading render
      if (!cancelled) {
        setDaysUntilFirstDay(
          Math.ceil((new Date(itinerary[0].date).getTime() - Date.now()) / 86_400_000)
        );
      }
      const results = await Promise.all(
        Array.from(rangeByCity.entries()).map(async ([city, range]) => ({
          city,
          days: await fetchCityWeather(city, range.start, range.end),
        }))
      );
      if (cancelled) return;
      const next: Record<string, DayWeather> = {};
      for (const { city, days } of results) {
        const byDate = new Map(days.map((d) => [d.date, d]));
        for (const day of itinerary) {
          if (day.city !== city) continue;
          const found = byDate.get(day.date);
          // API คืนแถวของวันที่นอกช่วงพยากรณ์มาด้วยแต่ค่าเป็น null ล้วน — ถือว่ายังไม่มีข้อมูล
          if (found && found.tempMax != null) next[day.id] = found;
        }
      }
      setByDay(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [itinerary]);

  return { byDay, daysUntilFirstDay };
}
