"use client";

import { useEffect, useState } from "react";
import { photoCache } from "@/lib/photoCache";

const inFlight = new Map<string, Promise<string[]>>();

/** รวมคำขอที่เกิดใน ~20ms เดียวกันเป็นคำขอเดียว (เฟส 19) — เหตุผลและกลไกเดียวกับ usePlaceDetails
 *  เดิมการ์ดวัน 11 ใบ + คลังสถานที่ ยิงเส้นนี้รวม ~27-34 ครั้งต่อการเปิดหน้า 1 ครั้ง */
const BATCH_WINDOW_MS = 20;
const pending = new Map<string, ((photos: string[]) => void)[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  const byQuery = new Map(pending);
  pending.clear();
  if (byQuery.size === 0) return;

  const queries = Array.from(byQuery.keys());
  fetch(`/api/place-photos?queries=${encodeURIComponent(queries.join("|"))}`)
    .then((r) => r.json())
    .then((d) => (d.results ?? {}) as Record<string, string[]>)
    .catch(() => ({} as Record<string, string[]>))
    .then((results) => {
      for (const query of queries) {
        const photos = results[query] ?? [];
        photoCache.set(query, photos);
        inFlight.delete(query);
        for (const resolve of byQuery.get(query) ?? []) resolve(photos);
      }
    });
}

/** ยิง/อ่านจากแคช query เดียว dedupe ทั้ง cache (เสร็จแล้ว) และ inFlight (กำลังโหลดอยู่)
 *  กันการ์ดหลายใบของสถานที่เดียวกัน mount พร้อมกันแล้วยิงซ้ำ (บั๊ก 9.2)
 *  ที่รอดด่านนี้ไปจะถูกรวมเป็นคำขอเดียวต่อ ~20ms อีกชั้น (เฟส 19) */
/**
 * 🔴 **คีย์ว่าง = สถานที่ที่ยังไม่มีตัวระบุฝั่ง Google — ต้องไม่ยิง** (P2 · 28 ส.ค. 2026)
 * `placeQueryKey` คืน `googlePlaceId` ถ้ามี ไม่งั้นคืน `mapsQuery` · **สถานที่ในคลัง (`catalog_places`)
 * ไม่มีทั้งสองอย่างเลยสักแถว** (วัดจริง: ซกโช 0/6 · โซล 0/19 · ปูซาน 0/23 · พิกัดกับคำบรรยายมีครบ)
 * → เข้าคิวด้วยคีย์ `""` → `?queries=` ว่าง → **400 ทุกครั้งที่เปิดหน้า**
 * ⚠️ ตัวรวมคำขอมีด่าน `size === 0` อยู่แล้ว **แต่มันกัน "ไม่มีรายการ" ไม่ได้กัน "มีรายการที่ว่าง"**
 *    คนละเงื่อนไข และหน้าตาเหมือนกันทุกประการตอนอ่านโค้ด
 * · นี่แค่หยุดคำขอเสีย **ไม่ใช่ทำให้รูปขึ้น** — รูป/เวลาเปิดปิดของสถานที่ในคลังต้องรอฝั่งข้อมูล (แจ้ง P1 แล้ว)
 */
function fetchPlacePhotos(query: string): Promise<string[]> {
  if (!query) return Promise.resolve([]);
  const cached = photoCache.get(query);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(query);
  if (existing) return existing;

  const promise = new Promise<string[]>((resolve) => {
    const waiters = pending.get(query) ?? [];
    waiters.push(resolve);
    pending.set(query, waiters);
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  });

  inFlight.set(query, promise);
  return promise;
}

/** photos === null คือกำลังโหลด, [] คือโหลดเสร็จแต่ไม่มีรูป, string[] คือ URL รูปที่ใช้ได้ */
export function usePlacePhotos(query: string): string[] | null {
  const [result, setResult] = useState<{ query: string; photos: string[] } | null>(
    () => (photoCache.has(query) ? { query, photos: photoCache.get(query)! } : null)
  );

  useEffect(() => {
    if (photoCache.has(query)) return;
    let cancelled = false;
    fetchPlacePhotos(query).then((photos) => {
      if (!cancelled) setResult({ query, photos });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return result?.query === query ? result.photos : null;
}
