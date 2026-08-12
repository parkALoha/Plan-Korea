"use client";

import { useSyncExternalStore } from "react";

/**
 * ออนไลน์อยู่ไหม (เฟส 18)
 *
 * **ทำไมไม่ใช้ `useOffline` จาก `next/offline`:** Next เวอร์ชันนี้มีให้ แต่ต้องเปิดธง
 * `experimental.useOffline` ซึ่งเปลี่ยนพฤติกรรม navigation ทั้งเว็บ (คำขอที่ล้มจะค้างรอ retry แทนที่จะ error)
 * — เป็นธง experimental บนเว็บที่ต้องใช้งานจริงตอนอยู่เกาหลีอีก 2 เดือน ไม่คุ้มความเสี่ยง
 *
 * **ทำไมไม่เชื่อ `navigator.onLine` ตรงๆ:** เจอของจริงตอนทดสอบว่าเบราว์เซอร์บางตัวคืน `false`
 * ทั้งที่โหลดหน้าเว็บและคุย Supabase ได้ปกติ — ถ้าเชื่อค่านี้ดื้อๆ เว็บจะล็อกตัวเองเป็นอ่านอย่างเดียว
 * ถาวรโดยไม่มีทางกลับ ซึ่งแย่กว่าการไม่มีฟีเจอร์นี้เลย · และในทางกลับกันมันก็คืน `true` ตอนต่อ WiFi
 * ที่ไม่มีเน็ตออกนอกด้วย
 *
 * จึงใช้ `navigator.onLine` เป็นแค่ **สัญญาณให้ไปตรวจ** แล้วยืนยันด้วยคำขอจริงเสมอ:
 * เริ่มต้นถือว่าออนไลน์ (ฝั่งปลอดภัย = แก้ข้อมูลได้) จะเปลี่ยนเป็นออฟไลน์ก็ต่อเมื่อยิงจริงแล้วไม่ผ่าน
 * และระหว่างที่เชื่อว่าออฟไลน์จะยิงซ้ำทุก 15 วิ เพื่อกลับมาเองทันทีที่เน็ตมา
 *
 * จังหวะที่ไปตรวจ: เหตุการณ์ `online`/`offline` · ตอนกลับมาเปิดหน้าจอ (`visibilitychange` —
 * ท่าที่เกิดจริงที่สุดคือควักมือถือออกจากกระเป๋ากลางอุโมงค์) · และตอน mount ถ้าเบราว์เซอร์บอกว่าไม่มีเน็ต
 * **ไม่ยิงเป็นระยะตอนออนไลน์** เพื่อไม่ให้ปลุกวิทยุมือถือทิ้งๆ ขว้างๆ ตลอดทั้งวัน
 */

const PROBE_URL = "/manifest.webmanifest"; // เล็ก + อยู่นอกด่าน PIN (ดู PUBLIC_PATHS ใน proxy.ts)
const RECOVERY_INTERVAL_MS = 15_000;

let online = true;
let probing = false;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  for (const listener of listeners) listener();
}

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(PROBE_URL, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function check() {
  if (probing) return;
  probing = true;
  const ok = await probe();
  probing = false;
  setOnline(ok);

  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  // ยิงซ้ำเฉพาะตอนที่เชื่อว่าออฟไลน์ — ออนไลน์อยู่แล้วไม่มีเหตุผลให้ยิงเปล่าๆ ตลอดเวลา
  if (!ok) recoveryTimer = setInterval(check, RECOVERY_INTERVAL_MS);
}

function onVisibilityChange() {
  if (!document.hidden) check();
}

function subscribe(onChange: () => void) {
  const first = listeners.size === 0;
  listeners.add(onChange);

  if (first) {
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // ตรวจตั้งแต่แรกเฉพาะตอนที่เบราว์เซอร์บอกว่าไม่มีเน็ต — ถ้ามันบอกว่ามี เชื่อไปก่อน ไม่ต้องเสียคำขอ
    if (!navigator.onLine) check();
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (recoveryTimer) {
        clearInterval(recoveryTimer);
        recoveryTimer = null;
      }
    }
  };
}

const getSnapshot = () => online;

/** SSR ถือว่าออนไลน์เสมอ — ค่าจริงตัวแรกมาหลัง hydrate */
const getServerSnapshot = () => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
