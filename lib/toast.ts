"use client";

/**
 * ช่องทางเดียวของทั้งเว็บสำหรับบอกผลลัพธ์ที่ผู้ใช้ต้องรู้ (เฟส 20.1)
 *
 * เดิมไม่มีเลย — การเขียนลง Supabase ที่พังจึงเงียบสนิท และการลบก็ไม่มีทางกลับ
 * ทำเป็น module singleton + `useSyncExternalStore` แบบเดียวกับ `hooks/useDarkTheme.ts`
 * เพื่อให้เรียกจาก hook ตัวไหนก็ได้โดยไม่ต้องส่ง prop ลงไปทั้งต้นไม้
 */

export type ToastKind = "error" | "success" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  /** มีเฉพาะ toast ที่สร้างด้วย showUndoToast — กดแล้วเรียกอันนี้แล้วปิด toast */
  undo?: () => void;
};

const DEFAULT_DURATION_MS = 4500;
/** undo ต้องอยู่นานพอให้ "เอ๊ะ เมื่อกี้กดอะไรไป" แล้วหาปุ่มเจอ แต่ไม่นานจนค้างเกะกะ */
const UNDO_DURATION_MS = 8000;

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener();
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function scheduleDismiss(id: string, durationMs: number) {
  clearTimer(id);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), durationMs)
  );
}

export function dismissToast(id: string) {
  clearTimer(id);
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getToasts() {
  return toasts;
}

/** อ้างอิงคงที่ ไม่งั้น useSyncExternalStore จะวนไม่จบตอน render ฝั่ง server */
const EMPTY: Toast[] = [];
export function getServerToasts() {
  return EMPTY;
}

export function showToast(kind: ToastKind, message: string, durationMs = DEFAULT_DURATION_MS) {
  // ข้อความเดิมซ้ำ (เช่น reorder ที่เขียนหลายแถวรวดแล้วพังทุกแถว) — ต่อเวลาอันเดิมแทนที่จะซ้อนกันเป็นตั้ง
  const existing = toasts.find((t) => t.kind === kind && t.message === message && !t.undo);
  if (existing) {
    scheduleDismiss(existing.id, durationMs);
    return existing.id;
  }

  const id = `toast-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  toasts = [...toasts, { id, kind, message }];
  emit();
  scheduleDismiss(id, durationMs);
  return id;
}

/** ทำไปเลยแล้วให้ทางกลับ — ใช้แทนกล่อง "แน่ใจไหม" ที่ขวางทางทุกครั้งทั้งที่ส่วนใหญ่ผู้ใช้ตั้งใจอยู่แล้ว */
export function showUndoToast(message: string, onUndo: () => void) {
  const id = `toast-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  toasts = [
    ...toasts,
    {
      id,
      kind: "info",
      message,
      undo: () => {
        dismissToast(id);
        onUndo();
      },
    },
  ];
  emit();
  scheduleDismiss(id, UNDO_DURATION_MS);
  return id;
}
