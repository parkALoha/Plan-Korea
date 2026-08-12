"use client";

import { useSyncExternalStore } from "react";
import {
  dismissToast,
  getServerToasts,
  getToasts,
  subscribeToasts,
  type ToastKind,
} from "@/lib/toast";

/** ใช้โทเคนเชิงความหมาย ไม่ใช่สีตรงๆ — ToastHost อยู่ใน layout จึงโผล่บน `/today` ที่เป็นธีมมืดด้วย */
const KIND_STYLE: Record<ToastKind, string> = {
  error: "bg-panel-maple text-panel-maple-ink",
  success: "bg-panel-pine text-panel-pine-ink",
  info: "bg-surface-raised text-content ring-1 ring-line",
};

const KIND_ICON: Record<ToastKind, string> = {
  error: "⚠️",
  success: "✅",
  info: "↩️",
};

/**
 * ที่แสดง toast ของทั้งเว็บ (เฟส 20.1) — mount ครั้งเดียวใน `app/layout.tsx` ได้ครบทั้ง 3 หน้า
 *
 * วางไว้เหนือแถบเมนูล่างของมือถือ (`BottomNav` สูง ~3.5rem + safe area)
 * z สูงกว่าปุ่มลอย "📍 สถานที่" (z-30) ของหน้าแผน เพื่อให้ปุ่ม "เลิกทำ" กดโดนแน่ๆ เวลาซ้อนกัน
 */
export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-5"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-toast-in pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-lg shadow-ink/20 ${
            KIND_STYLE[toast.kind]
          }`}
        >
          <span aria-hidden className="shrink-0 text-base leading-none">
            {KIND_ICON[toast.kind]}
          </span>
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.undo ? (
            <button
              onClick={toast.undo}
              className="shrink-0 rounded-lg bg-pine px-3 py-1.5 text-xs font-semibold text-cream hover:bg-pine-dark"
            >
              เลิกทำ
            </button>
          ) : (
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="ปิดข้อความนี้"
              className="-mr-1 shrink-0 rounded-full px-2 py-1 text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
