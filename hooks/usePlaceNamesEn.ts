"use client";

import { useEffect, useMemo, useState } from "react";

/** แคระดับโมดูล (อยู่ทั้งแท็บ) — สลับไปมาระหว่าง /summary กับหน้า ตม. ไม่ยิงซ้ำ
 *  ค่า null = ถามแล้วแต่ Google ไม่มีชื่ออังกฤษให้ (จำไว้ด้วย ไม่งั้นจะถามซ้ำทุกครั้งที่เปิดหน้า) */
const nameCache = new Map<string, string | null>();

/** คำขอที่ยังบินอยู่ เก็บเป็น "คำสัญญาต่อ query" — กันยิงซ้ำตอน effect ถูกเรียกสองรอบ
 *  (React StrictMode ตอน dev) หรือมีหลายคอมโพเนนต์ขอชุดเดียวกันพร้อมกัน · ต้องเก็บ Promise ไม่ใช่แค่
 *  ธงว่า "กำลังยิงอยู่" เพราะรอบที่สองต้องมีอะไรให้รอ ไม่งั้นมันข้ามไปเฉยๆ แล้วไม่เรนเดอร์ใหม่อีกเลย
 *  (กลไกเดียวกับ inFlight ใน usePlaceDetails — บั๊ก 9.2) */
const inFlight = new Map<string, Promise<void>>();

function readCached(queries: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const query of queries) {
    const cached = nameCache.get(query);
    if (cached) out[query] = cached;
  }
  return out;
}

/**
 * ชื่ออังกฤษของสถานที่หลายแห่งในคำขอเดียว (เฟส 22) — ใช้ที่หน้า ตม./K-ETA ที่ต้องเป็นอังกฤษล้วน
 *
 * ผู้เรียกส่งมาเฉพาะ "ตัวที่ชื่อไม่ใช่อักษรละติน" (ดู looksLatin ใน lib/latinScript.ts) จึงไม่เปลือง
 * โควตา Google กับสถานที่ที่ชื่ออังกฤษอยู่แล้ว · ยิงไม่ผ่าน/ออฟไลน์ = คีย์นั้นหายไปจากผลลัพธ์เฉยๆ
 * แล้วผู้เรียกใช้ชื่อเดิมต่อ (คืนเฉพาะชื่อที่ได้จริง ไม่คืน null ให้ต้องมาเช็คซ้ำ)
 */
export function usePlaceNamesEn(queries: string[]): Record<string, string> {
  // ทำเป็นสตริงเดียวเพื่อใช้เป็น dependency ของ effect ได้ (อาร์เรย์เป็นตัวใหม่ทุกเรนเดอร์)
  const key = useMemo(() => Array.from(new Set(queries)).sort().join("|"), [queries]);
  // ตัวแคชอยู่นอก React — นับรอบที่เติมของใหม่เข้าไปแทนการเก็บผลลัพธ์ซ้ำใน state
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = (key ? key.split("|") : []).filter((q) => !nameCache.has(q));
    if (missing.length === 0) return;

    // ตัวที่ยังไม่มีใครถามให้ = ยิงคำขอเดียวรวดเดียว แล้วผูก promise เดียวกันไว้กับทุก query ในชุดนั้น
    const pending = missing.filter((q) => !inFlight.has(q));
    if (pending.length > 0) {
      const request = fetch(
        `/api/place-name?queries=${encodeURIComponent(pending.join("|"))}&lang=en`
      )
        .then((r) => r.json())
        .then((d) => (d.results ?? {}) as Record<string, string | null>)
        .catch(() => ({}) as Record<string, string | null>)
        .then((results) => {
          for (const query of pending) {
            nameCache.set(query, results[query] ?? null);
            inFlight.delete(query);
          }
        });
      for (const query of pending) inFlight.set(query, request);
    }

    let cancelled = false;
    Promise.all(missing.map((q) => inFlight.get(q))).then(() => {
      if (!cancelled) setVersion((n) => n + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(
    () => readCached(key ? key.split("|") : []) as Record<string, string>,
    // version ไม่ได้ถูกใช้ในตัวฟังก์ชัน แต่เป็นตัวบอกว่า nameCache (external store) เพิ่งเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, version]
  );
}
