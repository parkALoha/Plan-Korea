"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * hydrate เสร็จหรือยัง — `false` ตอน render ฝั่งเซิร์ฟเวอร์และในเฟรมแรกของ client, `true` หลังจากนั้น
 *
 * ใช้ปิดของที่ **มีอยู่จริงเฉพาะฝั่ง client** ไม่ให้ไปโผล่ใน HTML: `new Date()` และ `localStorage`
 * — สองอย่างนี้ทำให้เกิด hydration mismatch (React error #418) ซึ่งอาการคือ React ทิ้ง HTML ที่
 * เซิร์ฟเวอร์ส่งมาแล้ว render subtree นั้นใหม่ทั้งก้อน · หน้ายังใช้งานได้ แต่ console เต็มไปด้วย error
 * จนบดบังบั๊กจริงตอนต้องดีบักหน้างาน
 *
 * ทำไมเรื่องนี้โผล่เฉพาะ production: `next build` **prerender หน้าพวกนี้เป็น HTML ตอน build**
 * (เห็นได้ที่ `.next/server/app/today.html`) เวลาที่ฝังจึงเป็นเวลาที่ build ไม่ใช่เวลาที่เปิดเว็บ
 * ส่วน dev server render ตอนมี request พอดี เวลาสองฝั่งจึงตรงกันเองและไม่มีใครเห็นปัญหา
 *
 * ใช้ `useSyncExternalStore` แทน `useState` + `useEffect` เพราะไม่ต้อง setState ในเอฟเฟกต์เลย
 * (eslint `react-hooks/set-state-in-effect` ห้ามไว้ — เหตุผลเดียวกับที่ hooks/useDarkTheme.ts ใช้)
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
