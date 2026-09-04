"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { TripPlan } from "@/lib/supabase";

/** โหมดของ modal — ทั้ง 3 อย่างใช้กล่องเดียวกันเพราะเป็นเรื่องเดียวกัน (จัดการแผน) และหน้าตาเหมือนกันหมด
 *  ยกเว้นข้อความกับปุ่มยืนยัน */
export type PlanEditMode = "create" | "rename" | "delete";

const MAX_NAME_LENGTH = 60;

/**
 * สร้าง/เปลี่ยนชื่อ/ลบแผน — แทน `window.prompt`/`window.confirm` เดิมที่หน้าตาไม่เข้ากับเว็บ
 * และบนมือถือ (โดยเฉพาะ PWA ที่ติดหน้าจอโฮม) กล่องของระบบดูเหมือนเว็บค้างมากกว่ากล่องให้กรอกข้อมูล
 */
export function PlanEditModal({
  mode,
  plan,
  onClose,
  onSubmit,
}: {
  mode: PlanEditMode;
  /** แผนที่กำลังทำอยู่ — โหมด create ใช้เป็น "แผนต้นทางที่จะก๊อป" (null = ยังไม่มีแผนไหนเลย) */
  plan: TripPlan | null;
  onClose: () => void;
  /** create/rename ส่งชื่อที่ตัดช่องว่างแล้ว · delete ส่ง null */
  onSubmit: (name: string | null) => void;
}) {
  const [name, setName] = useState(() => (mode === "rename" ? plan?.name ?? "" : ""));

  const trimmed = name.trim();
  const canSubmit = mode === "delete" || trimmed.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(mode === "delete" ? null : trimmed);
  }

  const title =
    mode === "create" ? "สร้างแผนใหม่" : mode === "rename" ? "เปลี่ยนชื่อแผน" : "ลบแผนนี้";

  return (
    <Modal
      onClose={onClose}
      title={title}
      size="md"
      bodyClassName="space-y-3"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 rounded-xl py-3 font-semibold text-white disabled:opacity-40 ${
              mode === "delete" ? "bg-alert hover:brightness-90" : "bg-maple-dark hover:brightness-90"
            }`}
          >
            {mode === "create" ? "สร้างแผน" : mode === "rename" ? "บันทึกชื่อ" : "ลบแผนนี้"}
          </button>
        </>
      }
    >
      {mode === "delete" ? (
        <>
          <p className="text-sm text-content">
            ลบแผน <span className="font-semibold">“{plan?.name}”</span> ทิ้งเลยไหม
          </p>
          <p className="rounded-lg bg-maple-soft/50 px-3 py-2 text-xs text-maple-dark">
            ⚠️ จุดแวะทุกวัน + เวลาเริ่มวัน/สถานะล็อกของแผนนี้จะถูกลบไปด้วย กู้คืนไม่ได้
            <br />
            ที่พัก · ตั๋ว/booking · ของที่ต้องเตรียม ใช้ร่วมกันทุกแผน จะไม่ถูกลบ
          </p>
        </>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-content-soft">ชื่อแผน</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
              placeholder="เช่น แผน B (เน้นคาเฟ่)"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
            />
          </div>
          {mode === "create" && (
            <p className="text-xs text-content-soft">
              {plan
                ? `ก๊อปจุดแวะทั้งหมดจาก “${plan.name}” มาเป็นจุดตั้งต้น แล้วแก้ได้อิสระโดยไม่กระทบแผนเดิม`
                : "เริ่มจากแผนเปล่าๆ"}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
