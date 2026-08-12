"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "trip-today-theme";

export type ThemeChoice = "light" | "dark";

const listeners = new Set<() => void>();

function isChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark";
}

/** ค่าที่เลือกไว้เอง — null = ยังไม่เคยกดสลับ ให้ตามธีมของเครื่อง */
function readChoice(): ThemeChoice | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isChoice(saved) ? saved : null;
}

function writeChoice(choice: ThemeChoice) {
  window.localStorage.setItem(STORAGE_KEY, choice);
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
  };
}

/** ธีมที่ใช้จริง = ที่เลือกไว้เอง ถ้ายังไม่เคยเลือกก็ตามเครื่อง */
function readEffective(): ThemeChoice {
  const chosen = readChoice();
  if (chosen) return chosen;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const serverSnapshot = (): ThemeChoice => "light";

/**
 * ธีมมืดของหน้าที่เรียกใช้ (เฟส 17 — ตอนนี้คือ `/today` หน้าเดียว)
 *
 * ตั้ง `data-theme` บน `<html>` ไม่ใช่บนกล่องของหน้า เพื่อให้พื้นหลัง `body` เปลี่ยนตามด้วย
 * (ไม่งั้นตอนสกรอลล์เลยขอบจะเห็นพื้นครีมโผล่มาคั่น) และ **ล้างทิ้งตอน unmount เสมอ**
 * ธีมจึงไม่รั่วไปหน้าอื่นที่ยังไม่ได้ออกแบบสำหรับพื้นมืด
 *
 * ใช้ `useSyncExternalStore` เพราะต้องฟังทั้ง localStorage (ที่เรากดเอง) และ `prefers-color-scheme`
 * ของเครื่อง — และเขียนค่าได้โดยไม่ชน eslint `react-hooks/set-state-in-effect`
 */
export function useDarkTheme() {
  const theme = useSyncExternalStore(subscribe, readEffective, serverSnapshot);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  const toggle = useCallback(() => {
    writeChoice(readEffective() === "dark" ? "light" : "dark");
  }, []);

  return { theme, toggle, isDark: theme === "dark" };
}
