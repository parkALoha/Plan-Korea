"use client";

import { useEffect, useState } from "react";

export type TripMember = { userId: string; role: string; displayName: string | null };

/**
 * สมาชิกของทริปหนึ่งใบ — `GET /api/engine/trips/[tripId]/members` (P1 27 ส.ค. 2026, `b81b42e`)
 *
 * 🔴 **`displayName: null` ไม่ใช่ "ยังไม่ตั้งชื่อ" — ทุกบัญชีมีชื่อตั้งแต่สมัครเสมอ** ค่า `null` แปลว่า
 * เราอ่านชื่อเขาไม่ได้ (สิทธิ์ชั้นที่สองปฏิเสธ) ซึ่งเป็นสัญญาณว่าสิทธิ์สองชั้นไม่ตรงกัน ไม่ใช่ข้อมูลขาด
 * — ผู้เรียกห้ามแสดงเป็นช่องว่างเงียบๆ (ดู `TripHeader.tsx` ที่ใช้ค่านี้)
 *
 * เก็บผลคู่กับ tripId ที่ผลนั้นเป็นของ แล้ว derive ตอน render (แพทเทิร์นเดียวกับ `TripHeader.tsx`'s
 * tripResult) แทน setState แยกก้อนสำหรับ "loaded" ตรงๆ ในเอฟเฟกต์ — กัน react-hooks/set-state-in-effect
 * และผลข้างเคียงคือถูกอยู่แล้ว: สมาชิกของทริปเก่าไม่ควรโผล่เป็น "ผลของทริปใหม่" ระหว่างรอโหลด
 */
export function useTripMembers(tripId: string): { members: TripMember[]; loaded: boolean } {
  const [result, setResult] = useState<{ forTripId: string; members: TripMember[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engine/trips/${tripId}/members`)
      .then((r) => r.json())
      .then((rows: TripMember[]) => {
        if (cancelled) return;
        setResult({ forTripId: tripId, members: rows });
      })
      .catch(() => {
        if (!cancelled) setResult({ forTripId: tripId, members: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (result?.forTripId !== tripId) return { members: [], loaded: false };
  return { members: result.members, loaded: true };
}
