"use client";

import { useState } from "react";

/**
 * รหัสผู้ใช้ + ปุ่มคัดลอก — เจ้าของ: P7 (รื้อหน้าตา 4 ก.ย. 2026)
 *
 * 🔴 **ทำไมยังต้องมี ทั้งที่ผู้ใช้ทั่วไปไม่ต้องใช้:** `user id` เป็นสิ่งเดียวที่ทีมใช้หาแถวของคนคนนี้
 * ในฐานได้แน่นอน (อีเมลซ้ำกันข้ามบัญชีไม่ได้ก็จริง แต่คนพิมพ์ผิด/จำผิดได้) · เอาออกจากหน้าจอทั้งหมด
 * = ตอนมีปัญหาจริงจะไม่มีทางให้ผู้ใช้ส่งค่านี้มาเลย
 * 🎯 **จึงไม่ใช่ "โชว์" หรือ "ไม่โชว์" แต่เป็น *โชว์ตอนที่มันมีความหมาย*** — ซ่อนค่าไว้ ให้ปุ่มเดียว
 * ที่พาไปถึงมันได้เมื่อมีคนขอ
 *
 * ⚠️ `navigator.clipboard` ไม่มีบน HTTP ที่ไม่ใช่ localhost และผู้ใช้ปฏิเสธสิทธิ์ได้
 * → ล้มแล้วต้อง **โผล่ค่าให้เลือกเอง** ไม่ใช่เงียบ (ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น แย่กว่าไม่มีปุ่ม)
 */
export function CopyUserId({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xs text-content-soft">รหัสผู้ใช้ — ใช้ตอนแจ้งปัญหา</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(userId);
              setState("copied");
            } catch {
              // คัดลอกไม่ได้ = โผล่ค่าออกมาให้ลากเลือกเอง ไม่ใช่บอกว่า "ล้มเหลว" แล้วจบ
              setState("manual");
            }
          }}
          className="shrink-0 rounded-control border border-line px-2.5 py-1 text-2xs text-content-soft hover:border-pine hover:text-pine"
        >
          {state === "copied" ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      {state === "manual" && (
        <>
          {/* บอกว่า *ทำไม* ปุ่มไม่ทำงาน ไม่ใช่แค่โผล่ค่าเฉย ๆ — ไม่งั้นคนกดจะคิดว่าปุ่มพัง
              (`select-all` = แตะครั้งเดียวเลือกทั้งก้อน · UUID ลากเลือกเองบนมือถือยากมาก) */}
          <p className="mt-1.5 text-2xs text-content-soft">
            คัดลอกอัตโนมัติไม่ได้ — แตะที่ค่าด้านล่างเพื่อเลือกทั้งหมด แล้วคัดลอกเอง
          </p>
          <p className="mt-1 select-all break-all rounded-control border border-line bg-surface-soft px-2.5 py-1.5 font-mono text-2xs text-content-soft">
            {userId}
          </p>
        </>
      )}
    </div>
  );
}
