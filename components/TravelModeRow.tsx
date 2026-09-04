"use client";

import { useState } from "react";
import type { Place } from "@/data/places";
import { haversineKm } from "@/lib/geo";
import {
  estimateTravelMinutes,
  TRAVEL_MODES,
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  type TravelMode,
} from "@/lib/schedule";

/** แถวคั่นระหว่างจุดแวะ — บอกวิธีเดินทางของช่วงนั้นและให้เลือกโหมดใหม่ได้
 *  ใช้ทั้งช่วงระหว่างจุดแวะปกติและช่วงออกจาก/กลับที่พัก (ต่างกันแค่ prefix) */
export function TravelModeRow({
  fromPlace,
  toPlace,
  mode,
  resolvedMinutes,
  isReal,
  prefix,
  locked,
  onSetMode,
}: {
  /** ต้นทาง/ปลายทางของช่วงนี้ — เป็นจุดแวะหรือที่พักก็ได้ ใช้แค่พิกัดคำนวณระยะ */
  fromPlace: Pick<Place, "lat" | "lng">;
  toPlace: Pick<Place, "lat" | "lng">;
  mode: TravelMode | null;
  /** เวลาที่ schedule คำนวณจริงไว้แล้ว (ตรงกับ mode ปัจจุบัน) ใช้โชว์ตอนเลือกโหมดแล้ว */
  resolvedMinutes: number;
  /** true = เวลาจริงจาก Google Routes API, false = ยังเป็นเส้นตรง haversine ประมาณการ */
  isReal: boolean;
  /** ข้อความนำหน้า เช่น "ออกจากที่พัก" / "กลับที่พัก" — ไม่ใส่ = ช่วงระหว่างจุดแวะปกติ */
  prefix?: string;
  /** true = วันนี้ล็อกอยู่ — โชว์โหมดที่เลือกไว้เฉยๆ เปลี่ยนไม่ได้ */
  locked?: boolean;
  onSetMode: (mode: TravelMode) => void;
}) {
  // key={mode} จากผู้เรียก (ดูด้านล่าง) ทำให้ component นี้ remount ใหม่ทุกครั้งที่ mode เปลี่ยน
  // (เลือกครั้งแรก / เปลี่ยนโหมด / อีกคน sync มา) picking เลยรีเซ็ตอัตโนมัติโดยไม่ต้องใช้ effect
  const [picking, setPicking] = useState(mode == null);

  const distanceKm = haversineKm(fromPlace.lat, fromPlace.lng, toPlace.lat, toPlace.lng);

  if (locked) {
    return (
      <div className="bg-surface-soft/60 px-4 py-1.5 text-2xs text-content-soft">
        {prefix ? `${prefix} · ` : ""}
        {mode
          ? `${TRAVEL_MODE_EMOJI[mode]} ${TRAVEL_MODE_LABEL[mode]} ${isReal ? "" : "~"}${resolvedMinutes} นาทีเดินทาง ${isReal ? "(จริง)" : "(ประมาณการ)"}`
          : "ยังไม่ได้เลือกวิธีเดินทาง"}
      </div>
    );
  }

  if (mode && !picking) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 bg-surface-soft/60 px-4 py-1.5 text-2xs text-content-soft">
        <span>
          {prefix ? `${prefix} · ` : ""}
          {TRAVEL_MODE_EMOJI[mode]} {TRAVEL_MODE_LABEL[mode]} {isReal ? "" : "~"}
          {resolvedMinutes} นาทีเดินทาง {isReal ? "(จริง)" : "(ประมาณการ)"}
        </span>
        <button
          onClick={() => setPicking(true)}
          className="-my-1 px-1 py-1.5 font-medium text-pine-dark underline hover:text-pine"
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    // ปุ่มเลือกโหมดสูงแค่ 23px บนมือถือ กดพลาดง่าย — ดันเป็น 32px ด้วย py-1.5 (จอ sm ขึ้นไปคงความกระชับเดิม)
    <div className="flex flex-wrap items-center gap-1.5 bg-surface-soft/60 px-3 py-2 text-2xs text-content-soft sm:px-4 sm:py-1.5">
      <span>{prefix ? `${prefix} — เดินทางแบบไหน:` : "เดินทางแบบไหน:"}</span>
      {TRAVEL_MODES.map((m) => (
        <button
          key={m}
          onClick={() => onSetMode(m)}
          className="rounded-full border border-line bg-surface-raised px-2.5 py-1.5 text-content hover:border-maple/40 sm:py-0.5"
        >
          {TRAVEL_MODE_EMOJI[m]} {TRAVEL_MODE_LABEL[m]} ~{estimateTravelMinutes(distanceKm, m)} น.
        </button>
      ))}
    </div>
  );
}
