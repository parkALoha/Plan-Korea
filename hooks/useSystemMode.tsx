"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

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

type SystemModeValue = { mode: SystemMode; refresh: () => void };

/**
 * ตัวจริงที่ fetch — เรียกครั้งเดียวที่ `<SystemModeProvider>` (root layout)
 *
 * 🔴 **เดิมทุกจุดที่ต้องรู้โหมดเรียก `useSystemMode()` แยกกันเอง** — ตอนมีแค่ `SystemModeBanner`
 * จุดเดียวไม่เป็นปัญหา แต่พอ `BookingEditModal` เป็นจุดที่สอง (และกำลังจะมีอีก 5 โมดัลตามมา)
 * ยิง `GET /api/engine/system-mode` ซ้ำกันหลายจุดสำหรับสถานะเดียวที่เปลี่ยนนาน ๆ ครั้ง — ย้ายมาไว้ที่
 * provider ตัวเดียว ตามที่ตั้งใจเลื่อนไว้ (docs/engine/read-only-switch.md ข้อ 9)
 */
function useSystemModeSource(): SystemModeValue {
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

const SystemModeContext = createContext<SystemModeValue | null>(null);

/** ครอบที่ root layout เท่านั้น — ต้องอยู่เหนือ `/login` ด้วย (ธงต้องอ่านได้ก่อนล็อกอิน) */
export function SystemModeProvider({ children }: { children: ReactNode }) {
  const value = useSystemModeSource();
  return <SystemModeContext.Provider value={value}>{children}</SystemModeContext.Provider>;
}

export function useSystemMode(): SystemModeValue {
  const ctx = useContext(SystemModeContext);
  if (!ctx) throw new Error("useSystemMode ต้องถูกเรียกใต้ <SystemModeProvider> เท่านั้น");
  return ctx;
}
