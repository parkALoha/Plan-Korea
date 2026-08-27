"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSystemMode } from "@/hooks/useSystemMode";
import { TripDestinationPicker, type CityOption } from "@/components/TripDestinationPicker";
import { showToast } from "@/lib/toast";

/**
 * ฟอร์มสร้างทริปแรก — `E5` (P1 พบ 27 ส.ค. 2026: `create_trip` อยู่ในฐานมาตั้งแต่ 25 ส.ค. แต่ไม่มี UI
 * เรียกมันเลย บัญชีใหม่ทุกบัญชีค้างที่ "ยังไม่มีทริป" ตลอดกาล — ไม่มีใคร live-verify อะไรได้)
 *
 * วางอยู่ใน `TripStatusFallback` ตรงจุดที่ข้อความ "ยังไม่มีทริป" แสดงอยู่แล้ว ไม่ใช่ซ่อนไว้ใน setting
 * (P1 ขอ) — ผู้เรียก `POST /api/engine/trips` ตรวจ input ครบก่อนถึงฐานแล้ว (ชื่อ 1–120 ตัวอักษร ·
 * วันที่ ISO · วันจบไม่มาก่อนวันเริ่ม) ที่นี่จึงแค่ส่งค่าไปตรงๆ แล้วอ่านข้อความ error ที่ route คืนมา
 * (เป็นภาษาไทยพร้อมโชว์ตรงๆ อยู่แล้ว)
 */
export function CreateTripForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // เมืองปลายทาง (E5 ข้อ 3, 7230241) — ไม่บังคับ ลำดับที่เลือกคือลำดับที่ส่ง (ดู TripDestinationPicker)
  const [destinations, setDestinations] = useState<CityOption[]>([]);
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
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-2.5 text-left">
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
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-content-soft">เริ่ม</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            disabled={readOnly}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-content-soft">สิ้นสุด</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            disabled={readOnly}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>
      <TripDestinationPicker selected={destinations} onChange={setDestinations} disabled={readOnly} />
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
        disabled={submitting || readOnly || !title.trim() || !startDate || !endDate}
        className="rounded-xl bg-maple py-2.5 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
      >
        {submitting ? "กำลังสร้าง..." : "สร้างทริป"}
      </button>
    </form>
  );
}
