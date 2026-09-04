"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTripMembers } from "@/hooks/useTripMembers";
import { showToast } from "@/lib/toast";

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
  tripId,
  who,
  accountName,
  onWhoChange,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
  onClose,
}: {
  /** ทริปที่กำลังตั้งค่า — ใช้ยิงลบ และใช้เช็คว่าผู้ใช้เป็นเจ้าของไหม */
  tripId: string;
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
              type="button"
                onClick={() => {
                  onWhoChange(nameDraft.trim());
                  setEditingName(false);
                }}
                className="rounded-lg bg-pine px-3 py-2 text-xs font-medium text-cream hover:bg-pine-dark"
              >
                ยืนยันชื่อนี้
              </button>
              <button
              type="button"
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
              type="button"
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
              type="button"
                onClick={() => {
                  onToggleLockAll();
                  setConfirmingLock(false);
                }}
                className="rounded-lg bg-pine px-3 py-2 text-xs font-medium text-cream hover:bg-pine-dark"
              >
                {allLocked ? "ยืนยัน ปลดล็อกทุกวัน" : "ยืนยัน ล็อกทุกวัน"}
              </button>
              <button
              type="button"
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
              type="button"
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

      <TripDeleteSection tripId={tripId} />
    </Modal>
  );
}

/**
 * **ย้ายทริปไปถังขยะ** — `DELETE /api/engine/trips/<id>` (หลังบ้านโดย P1 · `f9e7693`)
 * เจ้าของ UI: P2-UI/UX · 4 ก.ย. 2026 · **ผู้ใช้เลือกตำแหน่งนี้เอง**
 *
 * ## 🔴 ทำไมอยู่ในหน้าทริป ไม่ใช่บนการ์ดหน้าแรก
 * ผมเสนอสองทางให้ผู้ใช้เลือกจาก *สิ่งที่เขาเห็น* (ไม่ใช่จากชื่อหน้าจอ) · เขาเลือกทางนี้
 * · การ์ดหน้าแรกสะอาดเหมือนเดิม — เขาเพิ่งสั่งถอดปุ่มปักหมุดออกด้วยคำว่า *"มันรก"* ในชั่วโมงเดียวกัน
 * · 🎯 ***และตอนกดลบ เขาเห็นเต็ม ๆ แล้วว่ากำลังลบทริปไหน*** — บนการ์ดต้องเชื่อว่ากดถูกใบ
 *
 * ## 🔴 คำต้องเป็น "ย้ายไปถังขยะ" ไม่ใช่ "ลบถาวร" — มันคือ soft delete
 * `deleted_at` ถูกตั้ง · ข้อมูลยังอยู่ครบ · กู้คืนได้ ⇒ **เขียนว่ากู้ไม่ได้ = โกหก**
 * · ⚠️ **และห้ามใช้ `confirm()` ของเบราว์เซอร์** — ยืนยันสองขั้นในกล่องนี้ รูปเดียวกับ `confirmingLock` ข้างบน
 *
 * ## 🔴 `wasTemplate` ต้องบอก — และมันคือข้อที่เงียบที่สุดในทั้งใบ
 * ถ้าทริปนี้เคยเป็น *ทริปแนะนำ* ธงจะถูกล้างตอนลบ ⇒ ***กู้คืนแล้วมันจะไม่กลับไปเป็นทริปแนะนำเอง***
 * ไม่บอก = ผู้ใช้รู้ตอนสายเกินไป **และไม่มีทางเดาได้เลยว่าทำไม**
 *
 * ## ⚠️ เห็นเฉพาะเจ้าของ — และ "ยังไม่รู้" ต้องไม่เท่ากับ "ไม่ใช่เจ้าของ"
 * `role === "owner"` เท่านั้นที่ลบได้ (ฝั่งฐานบังคับอยู่แล้ว) ⇒ คนอื่นไม่ควรเห็นปุ่มตั้งแต่แรก
 * 🔴 **แต่ตอนยังโหลดสมาชิกไม่เสร็จ เราไม่รู้ ⇒ ไม่แสดง** · โผล่ทีหลังดีกว่าโผล่แล้วหาย
 */
function TripDeleteSection({ tripId }: { tripId: string }) {
  const { members, loaded } = useTripMembers(tripId);
  const user = useCurrentUser();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const isOwner =
    loaded &&
    user.status === "ready" &&
    members.some((m) => m.userId === user.id && m.role === "owner");
  if (!isOwner) return null;

  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/api/engine/trips/${tripId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(String(r.status));
      const body = (await r.json()) as {
        dayCount?: number;
        stopCount?: number;
        wasTemplate?: boolean;
      };
      /**
       * 🔴 **บอกว่า *เก็บอะไรไป* ไม่ใช่แค่ "ลบแล้ว"** — ตัวเลขคือสิ่งที่ทำให้ผู้ใช้รู้ทันทีว่ากดถูกใบไหม
       * · และ `wasTemplate` ต้องอยู่ในข้อความเดียวกัน **ไม่ใช่ toast ที่สอง** ซึ่งจะถูกอ่านข้าม
       */
      const parts = [
        `เก็บทริปนี้ไว้ในถังขยะแล้ว`,
        typeof body.dayCount === "number" ? `${body.dayCount} วัน` : null,
        typeof body.stopCount === "number" ? `${body.stopCount} จุดแวะ` : null,
      ].filter(Boolean);
      showToast("success", parts.join(" · "));
      if (body.wasTemplate) {
        showToast("info", "ทริปนี้เคยเป็นทริปแนะนำ — กู้คืนแล้วต้องตั้งเป็นทริปแนะนำใหม่อีกครั้ง");
      }
      /**
       * ออกจากหน้าทริปที่เพิ่งถูกเก็บ — อยู่ต่อจะเห็นหน้าที่ชี้ไปยังของที่ไม่อยู่ในรายการแล้ว
       * 🔴 `router.replace` ไม่ใช่ `push` — **ไม่งั้นกดย้อนกลับจะเด้งเข้าหน้าทริปที่เพิ่งเก็บไป**
       *    ซึ่งจะโหลดไม่ขึ้นและอ่านเหมือนเว็บพัง · `refresh()` ให้รายการหน้าแรกไม่ค้างของเก่า
       */
      router.replace("/");
      router.refresh();
    } catch {
      setBusy(false);
      showToast("error", "เก็บทริปไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
  }

  return (
    <section className="pt-5">
      <div className="mb-1.5 text-sm font-semibold text-content">ถังขยะ</div>
      {confirming ? (
        <div className="rounded-lg border border-maple bg-maple-soft/40 p-3">
          <p className="text-sm text-content">
            เก็บทริปนี้ไว้ในถังขยะใช่ไหม — ทริปจะหายจากรายการ แต่ยังกู้คืนได้ทีหลัง
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg bg-pine px-3 py-2 text-xs font-medium text-cream hover:bg-pine-dark disabled:opacity-50"
            >
              ยืนยัน เก็บเข้าถังขยะ
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg bg-maple px-3 py-2 text-xs font-medium text-cream hover:bg-maple-dark disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <button
              type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-content hover:bg-surface-soft"
        >
          🗑️ ย้ายทริปนี้ไปถังขยะ
        </button>
      )}
      <p className="mt-1.5 text-xs text-content-soft">
        ไม่ได้ลบถาวร — วัน จุดแวะ และที่พักยังอยู่ครบ กู้คืนได้จากหน้าบัญชี
      </p>
    </section>
  );
}
