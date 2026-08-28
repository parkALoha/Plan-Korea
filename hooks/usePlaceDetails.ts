"use client";

import { useEffect, useState } from "react";
import type { GoogleOpeningHours, GoogleReview } from "@/lib/googlePlaces";

export type PlaceDetails = {
  openingHours: GoogleOpeningHours | null;
  rating: number | null;
  userRatingCount: number | null;
  primaryType: string | null;
  reviews: GoogleReview[] | null;
  /** ชื่อ/ที่อยู่ภาษาท้องถิ่น (เฟส 14) — สำหรับสถานที่ที่ผู้ใช้เพิ่มเอง ซึ่งไม่มี nameLocal ฝังใน data/places.ts */
  nameLocal: string | null;
  addressLocal: string | null;
};

const EMPTY_DETAILS: PlaceDetails = {
  openingHours: null,
  rating: null,
  userRatingCount: null,
  primaryType: null,
  reviews: null,
  nameLocal: null,
  addressLocal: null,
};

// แคชในหน่วยความจำแท็บ (L1) — export ให้ useDayOpeningHours ใช้ร่วมกัน (บั๊ก 9.2: เดิมสองฮุคนี้ยิง
// /api/place-details endpoint เดียวกันแต่คนละ Map แยกกัน สถานที่เดียวกันเลยถูกยิงซ้ำจากสองจุด)
// แคชถาวรจริงๆ (L2, ข้าม reload/คนละคน) อยู่ที่ตาราง place_details_cache ฝั่ง Supabase
export const placeDetailsCache = new Map<string, PlaceDetails>();
const inFlight = new Map<string, Promise<PlaceDetails>>();

function toDetails(d: Record<string, unknown> | null | undefined): PlaceDetails {
  if (!d) return EMPTY_DETAILS;
  return {
    openingHours: (d.openingHours as PlaceDetails["openingHours"]) ?? null,
    rating: (d.rating as number | null) ?? null,
    userRatingCount: (d.userRatingCount as number | null) ?? null,
    primaryType: (d.primaryType as string | null) ?? null,
    reviews: (d.reviews as PlaceDetails["reviews"]) ?? null,
    nameLocal: (d.nameLocal as string | null) ?? null,
    addressLocal: (d.addressLocal as string | null) ?? null,
  };
}

/**
 * รวมคำขอที่เกิดใน ~20ms เดียวกันให้เป็นคำขอเดียว (เฟส 19)
 *
 * หน้าแผน mount การ์ดวัน 11 ใบพร้อมกัน แต่ละใบขอรายละเอียดของสถานที่ในวันนั้น — เดิมกลายเป็น
 * ~34 HTTP request ต่อการเปิดหน้า 1 ครั้ง ทั้งที่เป็น endpoint เดียวกันหมด · dedupe เดิม (แคช + inFlight
 * จากบั๊ก 9.2) กันยิง "ซ้ำที่เดิม" ได้แล้ว แต่กัน "หลายที่ในเวลาไล่เลี่ยกัน" ไม่ได้
 *
 * แยกคิวตาม locale เพราะเซิร์ฟเวอร์ใช้ค่านี้ทั้งก้อน (ทริปนี้มีเกาหลีกับเวียดนามปนกันในวันเดียวไม่ได้อยู่แล้ว
 * แต่คนละวันเป็นคนละภาษาแน่ๆ)
 */
const BATCH_WINDOW_MS = 20;
type PendingEntry = { resolve: (details: PlaceDetails) => void };
const pending = new Map<string, Map<string, PendingEntry[]>>(); // localeKey -> query -> waiters
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flush(localeKey: string) {
  flushTimers.delete(localeKey);
  const byQuery = pending.get(localeKey);
  pending.delete(localeKey);
  if (!byQuery || byQuery.size === 0) return;

  const queries = Array.from(byQuery.keys());
  const localeParam = localeKey === "-" ? "" : `&locale=${localeKey}`;
  const url = `/api/place-details?queries=${encodeURIComponent(queries.join("|"))}${localeParam}`;

  fetch(url)
    .then((r) => r.json())
    .then((data) => (data.results ?? {}) as Record<string, Record<string, unknown>>)
    .catch(() => ({} as Record<string, Record<string, unknown>>))
    .then((results) => {
      for (const query of queries) {
        const details = toDetails(results[query]);
        placeDetailsCache.set(query, details);
        inFlight.delete(query);
        for (const waiter of byQuery.get(query) ?? []) waiter.resolve(details);
      }
    });
}

/** ยิงขอ/อ่านจากแคช query เดียว dedupe ทั้งใน cache (เสร็จแล้ว) และ inFlight (กำลังโหลดอยู่) กันยิงซ้ำ
 *  ตอนการ์ดหลายใบ mount พร้อมกัน (บั๊ก 9.2 — เดิม usePlaceDetails ไม่มี inFlight เลย ต่างจาก useDayTravelTimes)
 *  คำขอที่รอดด่าน dedupe จะถูกรวมเป็นคำขอเดียวต่อ ~20ms อีกชั้น (เฟส 19 — ดู flush ด้านบน) */
/**
 * 🔴 **คีย์ว่าง = สถานที่ที่ยังไม่มีตัวระบุฝั่ง Google — ต้องไม่ยิง** (P2 · 28 ส.ค. 2026)
 * `placeQueryKey` คืน `googlePlaceId` ถ้ามี ไม่งั้นคืน `mapsQuery` · **สถานที่ในคลัง (`catalog_places`)
 * ไม่มีทั้งสองอย่างเลยสักแถว** (วัดจริง: ซกโช 0/6 · โซล 0/19 · ปูซาน 0/23 · พิกัดกับคำบรรยายมีครบ)
 * → เข้าคิวด้วยคีย์ `""` → `?queries=` ว่าง → **400 ทุกครั้งที่เปิดหน้า**
 * ⚠️ ตัวรวมคำขอมีด่าน `size === 0` อยู่แล้ว **แต่มันกัน "ไม่มีรายการ" ไม่ได้กัน "มีรายการที่ว่าง"**
 *    คนละเงื่อนไข และหน้าตาเหมือนกันทุกประการตอนอ่านโค้ด
 * · นี่แค่หยุดคำขอเสีย **ไม่ใช่ทำให้รูปขึ้น** — รูป/เวลาเปิดปิดของสถานที่ในคลังต้องรอฝั่งข้อมูล (แจ้ง P1 แล้ว)
 */
export function fetchPlaceDetails(query: string, locale?: "ko" | "vi" | null): Promise<PlaceDetails> {
  if (!query) return Promise.resolve(EMPTY_DETAILS);
  const cached = placeDetailsCache.get(query);
  // มีในแคชแล้วแต่ยังไม่มีชื่อท้องถิ่น ทั้งที่รอบนี้ขอมาพร้อม locale → ต้องยิงใหม่ ไม่งั้นแคชรอบก่อน
  // (ที่ยิงโดยไม่ส่ง locale เช่นจาก useDayOpeningHours) จะบังไม่ให้ได้ nameLocal เลยตลอดทั้ง session
  if (cached && (!locale || cached.nameLocal !== null)) return Promise.resolve(cached);
  const existing = inFlight.get(query);
  if (existing) return existing;

  const localeKey = locale ?? "-";
  const promise = new Promise<PlaceDetails>((resolve) => {
    const byQuery = pending.get(localeKey) ?? new Map<string, PendingEntry[]>();
    pending.set(localeKey, byQuery);
    const waiters = byQuery.get(query) ?? [];
    waiters.push({ resolve });
    byQuery.set(query, waiters);
    if (!flushTimers.has(localeKey)) {
      flushTimers.set(localeKey, setTimeout(() => flush(localeKey), BATCH_WINDOW_MS));
    }
  });

  inFlight.set(query, promise);
  return promise;
}

/** details === undefined คือกำลังโหลด — เวลาเปิด-ปิด/เรทติ้ง/รีวิว/ประเภทร้านของสถานที่นี้ (เฟส 2) */
export function usePlaceDetails(query: string): PlaceDetails | undefined {
  const [result, setResult] = useState<{ query: string; details: PlaceDetails } | undefined>(
    () => (placeDetailsCache.has(query) ? { query, details: placeDetailsCache.get(query)! } : undefined)
  );

  useEffect(() => {
    if (placeDetailsCache.has(query)) return;
    let cancelled = false;
    fetchPlaceDetails(query).then((details) => {
      if (!cancelled) setResult({ query, details });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.details : undefined;
}
