"use client";

import { useEffect } from "react";

/** ล็อกไม่ให้หน้าเว็บข้างหลังเลื่อนตอนเปิด modal */
export function useBodyScrollLock() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}
