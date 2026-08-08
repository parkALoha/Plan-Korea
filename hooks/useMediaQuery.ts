"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/**
 * อ่านค่า matchMedia แบบปลอดภัยสำหรับ SSR ผ่าน useSyncExternalStore แทนการตั้งค่าใน useEffect ตรงๆ
 * (เจอ eslint react-hooks/set-state-in-effect — React แนะนำให้ใช้ useSyncExternalStore สำหรับอ่านค่าจาก
 * external mutable state แบบนี้อยู่แล้ว) getServerSnapshot คืน false เสมอ (server ไม่รู้ขนาดจอจริง)
 * React จัดการ sync กับค่าจริงฝั่ง client ให้เองตอน hydrate โดยไม่ต้องมี state/effect เพิ่ม
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false
  );
}
