"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/**
 * ของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก — ชื่อที่ใช้ติดจุดแวะ / ล็อกทั้งทริป (เฟส 20.3)
 *
 * เดิมทุกอันกางอยู่บนหัวเว็บ ทำให้หัวสูงเกือบเต็มจอมือถือก่อนจะเห็นเนื้อหาสักบรรทัด
 * ย้ายมาไว้หลังปุ่ม ⚙️ แทน เหลือบนหัวแค่ชื่อทริปกับจำนวนจุด
 *
 * ## 🔴 4 ก.ย. 2026 — ทั้งสองอย่างในนี้ต้อง "ตั้งใจกด" ก่อนถึงจะเปลี่ยน (ผู้ใช้สั่ง)
 * ```
 * ชื่อ        เดิม: ช่องกรอกที่แก้ได้ตลอดเวลา — เผลอพิมพ์ทับได้โดยไม่ตั้งใจ และไม่มีจังหวะ "ตกลง"
 * ล็อกทริป   เดิม: กดปุ่มเดียวเปลี่ยนสถานะทุกวันทันที — ไม่มีทางถอยก่อนมันเกิด
 * ```
 * 🎯 **สองอันนี้กระทบของที่คนอื่นเห็น (ชื่อติดอยู่กับจุดแวะ) และกระทบทั้งทริปพร้อมกัน (ล็อกทุกวัน)**
 * — ปุ่มเดียวจบจึงเบาเกินไปสำหรับผลที่มันสร้าง
 *
 * ## 📌 ยังไม่ใช่ "ระบบเปลี่ยนชื่อ" เต็มรูป
 * ค่าที่แก้ที่นี่เก็บใน `localStorage` ของเครื่องนี้เท่านั้น · **ชื่อบัญชี (`profiles.display_name`)
 * ยังเขียนไม่ได้ทั้งเว็บ** (ไม่มี `PATCH` โปรไฟล์ที่ไหนเลย — โซน API) → ข้อความในกล่องบอกตรงนี้ไว้
 */
export function TripSettingsModal({
  who,
  accountName,
  onWhoChange,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
  onClose,
}: {
  who: string;
  accountName: string;
  onWhoChange: (value: string) => void;
  lockedDayCount: number;
  totalDayCount: number;
  onToggleLockAll: () => void;
  onClose: () => void;
}) {
  const allLocked = totalDayCount > 0 && lockedDayCount === totalDayCount;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(who);
  const [confirmingLock, setConfirmingLock] = useState(false);

  return (
    <Modal onClose={onClose} title="ตั้งค่าทริป" size="md" bodyClassName="divide-y divide-line">
      <section className="pb-5">
        <div className="mb-1.5 text-sm font-semibold text-content">ชื่อผู้ใช้งาน</div>

        {editingName ? (
          <>
            <input
              id="trip-who"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onWhoChange(nameDraft.trim());
                  setEditingName(false);
                }
                if (e.key === "Escape") setEditingName(false);
              }}
              /* 🔴 placeholder = **ค่าที่จะถูกใช้จริงถ้าปล่อยว่าง** ไม่ใช่ตัวอย่างสมมติ (ผู้ใช้สั่ง 4 ก.ย. 2026)
                 เดิมเขียน "เช่น เอ / บี" ซึ่งเป็นคำแนะนำ — **มันบอกว่าควรพิมพ์อะไร แต่ไม่บอกว่าถ้าไม่พิมพ์จะได้อะไร**
                 🎯 ช่องว่างที่มีค่าเริ่มต้นอยู่แล้ว ต้องโชว์ค่านั้นเป็นเงา ๆ — คนถึงจะรู้ว่า "ไม่กรอก" ไม่ได้แปลว่า "ไม่มีชื่อ" */
              placeholder={accountName || "เช่น เอ / บี"}
              className="w-full rounded-lg border border-maple px-3 py-2 text-sm text-content focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  onWhoChange(nameDraft.trim());
                  setEditingName(false);
                }}
                className="rounded-lg bg-pine px-3 py-2 text-xs font-medium text-cream hover:bg-pine-dark"
              >
                ยืนยันชื่อนี้
              </button>
              <button
                onClick={() => setEditingName(false)}
                /* ยกเลิก = **ปุ่มพื้นทึบสีแดง** ทรงเดียวกับปุ่มยืนยัน (ผู้ใช้สั่ง 4 ก.ย. 2026)
                   🔴 รอบแรกผมทำเป็น *ตัวหนังสือสีแดง* ซึ่งยังไม่ใช่ — ผู้ใช้ทักว่า *"หน้าตายังไม่เป็นปุ่ม"*
                   🎯 สีบอกว่ามันคืออะไร · **พื้นทึบบอกว่ามันกดได้** — ของที่กดได้ต้องดูเหมือนกดได้ก่อน
                   แล้วค่อยต่างกันด้วยสี · ตัวหนังสือเปล่า ๆ ข้างปุ่มพื้นทึบอ่านเป็นลิงก์หรือคำอธิบาย */
                className="rounded-lg bg-maple px-3 py-2 text-xs font-medium text-cream hover:bg-maple-dark"
              >
                ยกเลิก
              </button>
            </div>
            {/* ล้างช่องแล้วยืนยัน = กลับไปใช้ชื่อบัญชี ไม่ใช่ "ไม่มีชื่อ" — บอกไว้เพราะเดาไม่ได้จากหน้าจอ */}
            <p className="mt-1.5 text-xs text-content-soft">
              เว้นว่างแล้วยืนยัน = กลับไปใช้ชื่อจากบัญชีของคุณ
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate rounded-lg bg-surface-soft px-3 py-2 text-sm text-content">
                {who || "—"}
              </p>
              <button
                onClick={() => {
                  setNameDraft(who);
                  setEditingName(true);
                }}
                className="shrink-0 rounded-lg bg-surface-soft px-3 py-2 text-xs font-medium text-content hover:bg-maple-soft"
              >
                ✏️ แก้ไขชื่อ
              </button>
            </div>
            <p className="mt-1.5 text-xs text-content-soft">
              ชื่อนี้จะติดไปกับจุดแวะที่คุณเพิ่ม — อีกคนจะได้รู้ว่าใครเลือกอะไรไว้
              <br />
              ค่าเริ่มต้นมาจากบัญชีที่ล็อกอิน · แก้ที่นี่มีผลเฉพาะเครื่องนี้
            </p>
          </>
        )}
      </section>

      <section className="pt-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-content">ล็อกทั้งทริป</span>
          {/* สถานะอยู่คู่หัวข้อ ไม่ใช่ต่อท้ายข้อความบนปุ่ม — ปุ่มควรบอกว่า *กดแล้วเกิดอะไร* อย่างเดียว */}
          {totalDayCount > 0 && (
            <span className="text-xs tabular-nums text-content-soft">
              ล็อกแล้ว {lockedDayCount}/{totalDayCount} วัน
            </span>
          )}
        </div>

        {confirmingLock ? (
          /* 🔴 ถามด้วย *จำนวนวันที่จะถูกเปลี่ยน* ไม่ใช่ "แน่ใจไหม" — คำถามที่ไม่มีตัวเลขตอบยากพอ ๆ กับไม่ถาม */
          <div className="rounded-lg border border-maple bg-maple-soft/40 p-3">
            <p className="text-sm text-content">
              {allLocked
                ? `ปลดล็อกทั้ง ${totalDayCount} วันใช่ไหม — ทุกวันจะกลับมาลากจุดแวะได้`
                : `ล็อกทั้ง ${totalDayCount} วันใช่ไหม — ทุกวันจะแก้ไม่ได้จนกว่าจะปลดล็อก`}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  onToggleLockAll();
                  setConfirmingLock(false);
                }}
                className="rounded-lg bg-pine px-3 py-2 text-xs font-medium text-cream hover:bg-pine-dark"
              >
                {allLocked ? "ยืนยัน ปลดล็อกทุกวัน" : "ยืนยัน ล็อกทุกวัน"}
              </button>
              <button
                onClick={() => setConfirmingLock(false)}
                /* ยกเลิก = **ปุ่มพื้นทึบสีแดง** ทรงเดียวกับปุ่มยืนยัน (ผู้ใช้สั่ง 4 ก.ย. 2026)
                   🔴 รอบแรกผมทำเป็น *ตัวหนังสือสีแดง* ซึ่งยังไม่ใช่ — ผู้ใช้ทักว่า *"หน้าตายังไม่เป็นปุ่ม"*
                   🎯 สีบอกว่ามันคืออะไร · **พื้นทึบบอกว่ามันกดได้** — ของที่กดได้ต้องดูเหมือนกดได้ก่อน
                   แล้วค่อยต่างกันด้วยสี · ตัวหนังสือเปล่า ๆ ข้างปุ่มพื้นทึบอ่านเป็นลิงก์หรือคำอธิบาย */
                className="rounded-lg bg-maple px-3 py-2 text-xs font-medium text-cream hover:bg-maple-dark"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLock(true)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-content hover:bg-surface-soft"
          >
            {allLocked ? "🔓 ปลดล็อกทุกวัน" : "🔒 ล็อกทุกวัน"}
          </button>
        )}

        <p className="mt-1.5 text-xs text-content-soft">
          ใช้ตอนแผนนิ่งแล้วก่อนออกเดินทาง — เปิดดูบนมือถือได้โดยไม่กลัวเผลอลากจุดแวะหลุด
        </p>
      </section>
    </Modal>
  );
}
