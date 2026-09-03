"use client";

import { useSyncExternalStore } from "react";
import { hasCacheEverBeenFull, onCacheFull } from "@/lib/localCache";

/**
 * ที่เก็บในเครื่องเต็มจนเขียนแคชไม่ลงหรือยัง — `E6-AC7` ครึ่งฝั่งผู้ใช้
 * เจ้าของ: P2-UI/UX · 3 ก.ย. 2026 · ตะขอฝั่งล่างเป็นของ P1 (`lib/localCache.ts`)
 *
 * ## 🔴 ทำไมต้องมีทั้ง *สมัครฟัง* และ *อ่านย้อนหลัง*
 * การเขียนแคชล้มเกิดตอนไหนก็ได้ — **ก่อน** หรือ **หลัง** แถบนี้ mount
 * · ฟังอย่างเดียว → พลาดครั้งที่เกิดก่อน mount (ซึ่งเป็นครั้งที่เกิดบ่อยที่สุด เพราะแคชถูกเขียน
 *   ตั้งแต่หน้าแรกโหลด ก่อน layout จะ hydrate เสร็จด้วยซ้ำ)
 * · อ่านย้อนหลังอย่างเดียว → **ผู้ใช้ที่เปิดค้างไว้แล้วเต็มระหว่างใช้งาน จะไม่เห็นอะไรเลยจนกว่าจะรีโหลด**
 * ⇒ `useSyncExternalStore` ให้ทั้งสองอย่างในตัวเดียว และ**ไม่ต้อง `setState` ในเอฟเฟกต์**
 *   (ผิด `react-hooks/set-state-in-effect` และเป็นด่านที่ทีมนี้ชนมาแล้วหลายรอบ)
 *
 * 📌 `getServerSnapshot` = `false` เสมอ — ฝั่งเซิร์ฟเวอร์ไม่มี `localStorage` จึงเต็มไม่ได้ตามนิยาม
 */
export function useCacheFull(): boolean {
  return useSyncExternalStore(onCacheFull, hasCacheEverBeenFull, () => false);
}
