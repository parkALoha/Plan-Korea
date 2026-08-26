"use client";

import { soleTripMessage } from "@/lib/engine/tripChoice";
import type { ActiveTripState } from "@/hooks/useActiveTripId";
import { CreateTripForm } from "./CreateTripForm";

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
  // 🔴 **`offline-first-launch` ต้องเป็นข้อความที่ตัดสินใจแล้ว ไม่ใช่หน้า offline fallback เปล่า ๆ ของ
  // sw.js** (P1 ขอ, E5) — PWA เปิดครั้งแรกบนเครื่องใหม่ตอนไม่มีเน็ต ไม่เคยมี tripId ให้ใช้เลย: ต่างจาก
  // ผู้ใช้เก่าที่มี `lastTripId` แคชไว้แล้ว (เคสนั้น `useActiveTripId` ใช้ค่าเก่าต่อได้เลย ไม่มาถึงที่นี่)
  // — ต้องบอกตรง ๆ ว่าทำไมไม่มีอะไรให้ดู ไม่ใช่ให้ผู้ใช้คิดว่าแอปพัง
  if (trip.status === "offline-first-launch") {
    return (
      <div className="flex min-h-full items-center justify-center p-8 text-center">
        <p className="text-content">
          📴 ยังไม่เคยเปิดแอปนี้ตอนมีเน็ตเลย — ต้องเชื่อมต่อเน็ตอย่างน้อยหนึ่งครั้งก่อน หลังจากนั้นจะเปิด
          ออฟไลน์ได้ตามปกติ
        </p>
      </div>
    );
  }
  // 🔴 "ยังไม่มีทริป" ต้องมีทางออกอยู่ตรงนี้เลย ไม่ใช่ซ่อนไว้ใน setting (P1 27 ส.ค. 2026) — ก่อนหน้านี้
  // create_trip อยู่ในฐานมาตั้งแต่ 25 ส.ค. แต่ไม่มี UI เรียกมันเลย บัญชีใหม่ทุกบัญชีค้างอยู่ตรงนี้ตลอดกาล
  if (trip.status === "none") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-content">{soleTripMessage({ ok: false, reason: "none" })}</p>
        <CreateTripForm />
      </div>
    );
  }
  const message = soleTripMessage({ ok: false, reason: "error", message: trip.message });
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-center">
      <p className="text-content">{message}</p>
    </div>
  );
}
