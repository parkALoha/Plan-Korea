"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * อ่านโหมดของทั้งระบบตอน **โหลด** — `E3-AC7` · ข้อ ③ ของ P7
 *
 * 🔴 **`unknown` ไม่ใช่ `readOnly: false`** — อ่านธงไม่ได้ (เน็ตล่ม · เซิร์ฟเวอร์ 502)
 * แปลว่า *ไม่รู้* ไม่ใช่ *ปกติ* · ผู้เรียกต้องเลือกเองว่าจะแสดงอะไรตอนไม่รู้
 * ถ้าเราตอบ `false` แทน **แอปจะบอกผู้ใช้ว่าเขียนได้ ทั้งที่ไม่มีใครยืนยัน**
 *
 * ⚠️ **ปิดปุ่มเขียนตาม `readOnly` คือ *การสื่อสาร* ไม่ใช่ *การบังคับ*** (P7 ย้ำ · ผมเห็นด้วย)
 * ตัวบังคับอยู่ที่ trigger ในฐาน — ถ้าใครข้าม UI ไปยิง API ตรง เขาก็ยังได้ `503`
 * **สองชั้นนี้มีอยู่ด้วยเหตุผลคนละข้อ และขาดข้อไหนไปก็ไม่ได้**
 */
export type SystemMode =
  | { state: "loading" }
  | { state: "unknown" }
  | { state: "ok"; readOnly: boolean; reason: string | null };

/** อ่านครั้งเดียว — **ไม่มี `setState` ในนี้เลย** ผู้เรียกเป็นคนตัดสินใจว่าจะเก็บไหม */
async function readMode(): Promise<SystemMode> {
  try {
    const res = await fetch("/api/engine/system-mode");
    if (!res.ok) return { state: "unknown" };
    const b = (await res.json()) as { readOnly?: boolean; reason?: string | null };
    return { state: "ok", readOnly: b.readOnly === true, reason: b.reason ?? null };
  } catch {
    return { state: "unknown" };
  }
}

export function useSystemMode(): { mode: SystemMode; refresh: () => void } {
  const [mode, setMode] = useState<SystemMode>({ state: "loading" });

  // 🔴 `setState` ต้องอยู่ **หลัง `await`** เสมอ — `react-hooks/set-state-in-effect`
  //    ห้ามเรียกตรง ๆ ในเอฟเฟกต์เพราะทำให้ render ซ้อน · `alive` กันการเขียนหลัง unmount
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await readMode();
      if (alive) setMode(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(() => {
    void (async () => {
      setMode(await readMode());
    })();
  }, []);

  return { mode, refresh };
}
