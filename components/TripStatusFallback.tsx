"use client";

import { soleTripMessage } from "@/lib/engine/tripChoice";
import type { ActiveTripState } from "@/hooks/useActiveTripId";

/**
 * จอที่แสดงระหว่าง/แทนที่หน้า **bare** (`/`, `/today`, `/summary`) — `E5-AC1`
 *
 * ใช้คู่กับ `useActiveTripId()`: หน้าเหล่านี้เช็ค `trip.status !== "ready"` แล้ว render ตัวนี้แทน
 * เนื้อหาจริง — แยกออกมาเพราะทั้ง 3 หน้าต้องแสดงจอเดียวกันทุกประการตอนยังไม่รู้ว่าเป็นทริปไหน
 */
export function TripStatusFallback({ trip }: { trip: Exclude<ActiveTripState, { status: "ready" }> }) {
  if (trip.status === "loading") {
    return <div className="flex min-h-full items-center justify-center p-8 text-content-soft">กำลังเปิด…</div>;
  }
  if (trip.status === "ambiguous") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-content">{soleTripMessage({ ok: false, reason: "ambiguous", tripIds: trip.tripIds })}</p>
        <ul className="flex flex-col gap-2">
          {trip.tripIds.map((id) => (
            <li key={id}>
              <a href={`/trip/${id}`} className="underline text-pine">
                {id}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const message =
    trip.status === "none"
      ? soleTripMessage({ ok: false, reason: "none" })
      : soleTripMessage({ ok: false, reason: "error", message: trip.message });
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-center">
      <p className="text-content">{message}</p>
    </div>
  );
}
