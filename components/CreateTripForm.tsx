"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSystemMode } from "@/hooks/useSystemMode";
import { TripDestinationPicker, type CityOption } from "@/components/TripDestinationPicker";
import { DateField } from "@/components/DateField";
import { showToast } from "@/lib/toast";
import { E5_COPY } from "@/lib/i18n";

/**
 * ฟอร์มสร้างทริปแรก — `E5` (P1 พบ 27 ส.ค. 2026: `create_trip` อยู่ในฐานมาตั้งแต่ 25 ส.ค. แต่ไม่มี UI
 * เรียกมันเลย บัญชีใหม่ทุกบัญชีค้างที่ "ยังไม่มีทริป" ตลอดกาล — ไม่มีใคร live-verify อะไรได้)
 *
 * วางอยู่ใน `TripStatusFallback` ตรงจุดที่ข้อความ "ยังไม่มีทริป" แสดงอยู่แล้ว ไม่ใช่ซ่อนไว้ใน setting
 * (P1 ขอ) — ผู้เรียก `POST /api/engine/trips` ตรวจ input ครบก่อนถึงฐานแล้ว (ชื่อ 1–120 ตัวอักษร ·
 * วันที่ ISO · วันจบไม่มาก่อนวันเริ่ม) ที่นี่จึงแค่ส่งค่าไปตรงๆ แล้วอ่านข้อความ error ที่ route คืนมา
 * (เป็นภาษาไทยพร้อมโชว์ตรงๆ อยู่แล้ว)
 */
const COPY = E5_COPY.createTrip;

/**
 * 🔴 **`initialDestinations` เพิ่ม 4 ก.ย. 2026** — เมนู "เลือกปลายทาง" บนหน้าแรกกดเมืองแล้ว
 * เปิดฟอร์มนี้โดยเติมปลายทางไว้แล้ว **แต่ไม่สร้างทริป** · ผู้ใช้สั่งเอง:
 * > *"เขาเลือก ประเทศ หรือเมือง **แต่ไม่ได้ระบุวันที่เพราะเขาจะกรอกเอง**"*
 * 🎯 ***สร้างทันทีที่กด = ทริปที่วันที่มั่ว ซึ่งวันนี้ลบไม่ได้ด้วย***
 * · เป็น **ค่าตั้งต้น ไม่ใช่ค่าที่ล็อก** — ผู้ใช้เพิ่ม/ลบเมืองในฟอร์มได้ตามปกติ
 */
export function CreateTripForm({ initialDestinations = [] }: { initialDestinations?: CityOption[] } = {}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /**
   * เมืองปลายทาง (`E5` ข้อ 3, `7230241`) — ลำดับที่เลือกคือลำดับที่ส่ง (ดู `TripDestinationPicker`)
   *
   * 🔴 **บังคับตั้งแต่ 4 ก.ย. 2026 — เดิมไม่บังคับ และนั่นสร้างทริปที่ตายถาวร**
   * หน้าแผนตัดสินว่าเป็น "ทริปแพลตฟอร์ม" จาก `cities.length > 0` (`TripPlanScreen.tsx:150-151`)
   * ไม่มีเมือง → `dayPlanSource = "unsupported"` → **การ์ดวันไม่ขึ้นเลย เห็นแต่ `DayPlanUnavailableNotice`**
   * และ `trip_destinations` เขียนได้ **ครั้งเดียวตอนสร้าง** (`app/api/engine/trips/route.ts:169-172`)
   * ⇒ ไม่มีเส้นทางไหนแก้ทีหลังได้ · ผู้ใช้ที่ข้ามช่องนี้ได้ทริปที่ใช้ไม่ได้ **และลบทิ้งก็ยังไม่ได้**
   *
   * 🎯 ***ช่องที่ข้ามได้ แต่ข้ามแล้วผลลัพธ์พังถาวร ไม่ใช่ "ไม่บังคับ" — มันคือกับดัก***
   * · 📌 ทางที่ถูกกว่าคือ *"แก้เมืองทีหลังได้"* ซึ่งกำลังทำอยู่ (แผน 4 ก.ย. ข้อ 1.3)
   *   ใบนี้ปิดประตูก่อน เพราะ **ราคาของการปิดคือคลิกเพิ่มหนึ่งครั้ง · ราคาของการเปิดค้างไว้คือทริปที่กู้ไม่ได้**
   * · ⚠️ **route ยังรับคำขอที่ไม่มี `cityIds` เหมือนเดิมโดยตั้งใจ** — ด่านนี้อยู่ที่ UI ชั้นเดียว
   *   ถ้าวันหนึ่ง 1.3 ลงแล้ว (แก้เมืองทีหลังได้) ข้อบังคับนี้ผ่อนได้ **และควรผ่อน**
   */
  const [destinations, setDestinations] = useState<CityOption[]>(initialDestinations);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // เซสชันหมดอายุแยกจาก error ทั่วไป — ต้องมีปุ่มเข้าสู่ระบบใหม่ ไม่ใช่แค่ข้อความ (P1 27 ส.ค. 2026)
  const [sessionExpired, setSessionExpired] = useState(false);

  // ปิดที่ทางเข้าตอนอ่านสถานะ — ฟอร์มนี้เป็นแบบเดียวกับ BookingEditModal ฯลฯ ทุกประการ (กรอกชื่อ+
  // วันที่แล้วเจอ 503 ตอนจบคือแรงที่เสียเปล่า) route เองก็ไม่ตรวจโหมดนี้โดยตั้งใจ (ให้ trigger กันแทน)
  // (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || readOnly) return;
    setSubmitting(true);
    setError(null);
    setSessionExpired(false);
    try {
      const res = await fetch("/api/engine/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          endDate,
          ...(destinations.length > 0 ? { cityIds: destinations.map((c) => c.id) } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        code?: string;
        destinationsError?: string;
      };
      if (!res.ok || !data.id) {
        // 🔴 เช็คจาก `code` ไม่ใช่ข้อความ — ข้อความเปลี่ยนได้ (P1 27 ส.ค. 2026)
        if (data.code === "unauthenticated") {
          setSessionExpired(true);
        } else {
          setError(data.error ?? "สร้างทริปไม่สำเร็จ — ลองใหม่อีกครั้ง");
        }
        // 🔴 **ไม่เด้งไป /login เอง ไม่ว่ากรณีไหน** (P1 27 ส.ค. 2026) — ฟอร์มนี้มีของที่ผู้ใช้พิมพ์ไว้แล้ว
        // (ชื่อทริป + วันที่) การ redirect อัตโนมัติเสียของนั้นทันที เกณฑ์เดียวกับที่ตัดสินให้ปิด (ไม่ใช่ซ่อน)
        // ทางเข้าตอน read-only: "ราคาอยู่ที่งานที่เสียไปก่อนจะถึงปุ่ม" (P7) — auto-redirect ใช้ได้กับหน้าที่
        // แค่*อ่าน*เท่านั้น ไม่ใช่หน้าที่กำลังกรอกฟอร์ม จึงโชว์ปุ่มให้ผู้ใช้กดเองแทน (ดู JSX ด้านล่าง)
        // ⚠️ อย่าเพิ่ม redirect ตรงนี้ทีหลังเพราะ "ดูเป็นของที่ควรมี" — เหตุผลด้านบนคือคำตอบแล้ว
        setSubmitting(false);
        return;
      }
      // 🔴 ทริปเกิดจริงแล้ว (201) แต่การเขียนจุดหมายอาจล้มแยกต่างหาก — P1 ยังคืน 201 พร้อม
      // destinationsError แนบมา (27 ส.ค. 2026) เพราะทริปไม่ได้หาย แค่เมืองที่เลือกไว้ไม่ถูกบันทึก
      // ถ้าเงียบไป ผู้ใช้จะไม่รู้จนกว่าจะเปิดการ์ดมาดูแล้วสงสัยเองว่าทำไมจุดหมายหาย — บอกตรงๆ แล้วพาเข้า
      // ทริปตามปกติ (ทริปเองสร้างสำเร็จ ไม่ใช่เรื่องที่ต้องกันผู้ใช้ไว้)
      if (data.destinationsError) {
        showToast("info", "สร้างทริปแล้ว แต่บันทึกเมืองปลายทางไม่สำเร็จ — เพิ่มได้ภายหลัง");
      }
      // ทริปแรกของบัญชีนี้เพิ่งเกิด — พาไปเปิดทันที `/trip/[tripId]` เป็นหน้าใหม่ (mount ใหม่ทั้งก้อน)
      // ไม่ใช่หน้าเดิมที่ useActiveTripId() ค้างสถานะ "none" อยู่ จึงดึงรายการทริปสดใหม่เองแน่นอน
      router.push(`/trip/${data.id}`);
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง");
      setSubmitting(false);
    }
  }

  return (
    // 🔴 ฟอร์มไม่จำกัดความกว้างเอง — **ผู้เรียกเป็นคนกำหนด** (P2 · 28 ส.ค. 2026)
    // เดิมมี `max-w-xs` (320px) ติดมาจากตอนที่ฟอร์มนี้ยืนกลางหน้าเปล่าอย่างเดียว · พอถูกเรียกในโมดัล
    // กว้าง 448px มันเลยกินแค่ 320 แล้ว **ชิดซ้าย เหลือขอบขวาลอย 108px** (วัดแล้ว: กล่อง 327–775 ·
    // ช่องกรอก 347–667) — ผู้ใช้ทักว่า "ไม่ center และดูไม่สมดุล" ซึ่งถูก แม้ตัวกล่องจะ center พอดีเป๊ะ
    // 📌 หน้าเปล่ายังแคบเท่าเดิม เพราะผู้เรียกห่อด้วย `max-w-xs` ให้แล้ว
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2.5 text-left">
      {readOnly && (
        <div
          role="status"
          className="rounded-lg bg-panel-gold px-3 py-2 text-xs font-medium text-panel-gold-ink"
        >
          🔧 ระบบปิดรับการแก้ไขชั่วคราว — สร้างทริปตอนนี้ไม่ได้
          {systemMode.state === "ok" && systemMode.reason ? ` (${systemMode.reason})` : ""}
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-soft">ชื่อทริป</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น เที่ยวเกาหลี ต.ค. 2026"
          maxLength={120}
          required
          disabled={readOnly}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
      </div>
      {/* ปฏิทินของเราเอง ไม่ใช่ <input type="date"> ของเบราว์เซอร์ (ผู้ใช้สั่ง 28 ส.ค. 2026) — ดู DateField
          🔴 เดิมมี `required` บน input ให้เบราว์เซอร์กันฟอร์มว่างให้ · ปุ่ม/div ไม่มี validation ในตัว
          จึงต้องพึ่งเงื่อนไข disabled ของปุ่ม "สร้างทริป" ด้านล่างแทน (มี !startDate/!endDate อยู่แล้ว) */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-content-soft">{COPY.startLabel}</span>
          <DateField
            id="trip-start"
            ariaLabel="วันเริ่มทริป"
            value={startDate}
            onChange={(iso) => {
              setStartDate(iso);
              // วันจบที่มาก่อนวันเริ่มใช้ไม่ได้แล้ว — ล้างทิ้งแทนที่จะปล่อยให้ค้างแล้วโดน 400 ตอนกดสร้าง
              if (endDate && endDate < iso) setEndDate("");
            }}
            disabled={readOnly}
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-content-soft">{COPY.endLabel}</span>
          <DateField
            id="trip-end"
            ariaLabel="วันสิ้นสุดทริป"
            value={endDate}
            onChange={setEndDate}
            min={startDate || undefined}
            disabled={readOnly}
          />
        </div>
      </div>
      <TripDestinationPicker selected={destinations} onChange={setDestinations} disabled={readOnly} />
      {/* 🔴 ปุ่มที่ disabled โดยไม่บอกว่าทำไม แย่กว่าปุ่มที่กดแล้วขึ้น error — ผู้ใช้ไม่มีทางเดาถูก
          ว่าช่องไหนขาด · ขึ้นเฉพาะเมื่อกรอกอย่างอื่นครบแล้ว เพื่อไม่ให้เตือนตั้งแต่ฟอร์มยังว่าง */}
      {destinations.length === 0 && !!title.trim() && !!startDate && !!endDate && (
        <p className="text-xs text-content-soft">เลือกเมืองปลายทางอย่างน้อย 1 เมืองก่อนสร้างทริป</p>
      )}
      {sessionExpired && (
        <div className="rounded-lg bg-panel-maple/70 px-3 py-2 text-xs text-panel-maple-ink">
          <p className="mb-1.5">เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ — ชื่อทริปกับวันที่ที่กรอกไว้ยังอยู่ตรงนี้</p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-maple px-3 py-1.5 font-semibold text-white hover:bg-maple-dark"
          >
            เข้าสู่ระบบใหม่
          </a>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={
          submitting || readOnly || !title.trim() || !startDate || !endDate || destinations.length === 0
        }
        className="rounded-xl bg-maple py-2.5 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
      >
        {submitting ? "กำลังสร้าง..." : "สร้างทริป"}
      </button>
    </form>
  );
}
