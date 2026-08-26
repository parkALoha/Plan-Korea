"use client";

import { useEffect, useState } from "react";
import { chooseSoleTrip } from "@/lib/engine/tripChoice";
import { readCache, writeCache } from "@/lib/localCache";

/** localStorage key เก็บ tripId ล่าสุดที่เปิดผ่าน `/trip/[tripId]/...` — ดู `rememberActiveTripId()` */
const LAST_TRIP_ID_KEY = "lastTripId";

export type ActiveTripState =
  | { status: "loading" }
  | { status: "ready"; tripId: string }
  | { status: "none" }
  | { status: "ambiguous"; tripIds: string[] }
  | { status: "error"; message: string };

/**
 * ตัวตัดสิน "ทริปไหน" สำหรับหน้า **bare** (`/`, `/today`, `/summary`) — `E5-AC1`
 *
 * ## ทำไมต้องมีตัวนี้แยกจาก `chooseSoleTrip`
 * `chooseSoleTrip` เป็นกฎบริสุทธิ์ (ไม่ import อะไร) ที่ 9 hook เคยเรียก**แยกกันคนละที่**
 * ทำให้พอมีทริปที่สอง แต่ละ hook ได้ `ambiguous` เงียบ ๆ ไม่พร้อมกัน — ตอนนี้ 9 hook รับ `tripId`
 * จากผู้เรียกแล้ว (ไม่ resolve เอง) **ต้องมีที่เดียวที่ตัดสินแทน** และหน้า bare (ที่ไม่มี `[tripId]`
 * ในหน้า URL ให้ยึด) คือที่ที่ต้องใช้ตัวนี้ — เรียกครั้งเดียวต่อหน้า ไม่ใช่ครั้งเดียวต่อ hook
 *
 * ## `lastTripId` มาก่อน `chooseSoleTrip` เสมอ
 * ทริปล่าสุดที่ผู้ใช้เปิดจริง (`rememberActiveTripId`, เรียกจาก `/trip/[tripId]/layout.tsx`) ตรงกับ
 * ความตั้งใจของผู้ใช้มากกว่ากฎ "ทริปเดียว = ใช้เลย" เพราะพอมีทริปที่สองจริง `chooseSoleTrip` จะไม่มีวัน
 * เลือกให้อีก (คืน `ambiguous` เสมอ) — ถ้าไม่มี `lastTripId` ที่ยังใช้ได้จริง ค่อย fallback ไปใช้กฎเดิม
 */
export function useActiveTripId(): ActiveTripState {
  const [state, setState] = useState<ActiveTripState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const res = await fetch("/api/engine/trips");
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: "error", message: `เปิดรายการทริปไม่ได้ (${res.status})` });
        return;
      }
      const trips = (await res.json()) as { id: string }[];
      if (cancelled) return;

      // 🔴 ทริปล่าสุดที่เคยเปิด ยังอยู่ในรายการที่เห็นได้จริงไหม — เช็คกับของจริงเสมอ ไม่เชื่อ cache เปล่า ๆ
      //    (สิทธิ์อาจถูกถอนไปแล้วตั้งแต่ครั้งก่อน — `trips` มาจาก RLS จริง ไม่ใช่จากที่จำไว้)
      const cachedId = readCache<string>(LAST_TRIP_ID_KEY);
      if (cachedId && trips.some((t) => t.id === cachedId)) {
        setState({ status: "ready", tripId: cachedId });
        return;
      }

      const resolved = chooseSoleTrip(trips);
      if (resolved.ok) {
        writeCache(LAST_TRIP_ID_KEY, resolved.tripId);
        setState({ status: "ready", tripId: resolved.tripId });
        return;
      }
      if (resolved.reason === "ambiguous") {
        setState({ status: "ambiguous", tripIds: resolved.tripIds });
      } else if (resolved.reason === "none") {
        setState({ status: "none" });
      } else {
        setState({ status: "error", message: resolved.message });
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** เรียกตอนเข้า `/trip/[tripId]/...` จริง — ให้หน้า bare รู้ว่าครั้งหน้าควรพาไปทริปไหนก่อน */
export function rememberActiveTripId(tripId: string): void {
  writeCache(LAST_TRIP_ID_KEY, tripId);
}
