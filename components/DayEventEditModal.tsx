"use client";

import { useState } from "react";
import type { DayEvent, DayEventKind } from "@/data/itinerary";
import type { EventInput } from "@/hooks/useStops";
import { useSystemMode } from "@/hooks/useSystemMode";
import { Modal } from "./Modal";

/**
 * ฟอร์มสร้าง/แก้ **แถวเวลาตายตัว** (เที่ยวบิน · เช็คอิน · เดดไลน์) — `E5` · P2 · 4 ก.ย. 2026
 *
 * ## ทำไมมันเพิ่งมีได้ตอนนี้
 * `WRITABLE` ของ `/stops` ไม่มีฟิลด์ event สักตัวจนถึง `759ad11` ⇒ ก่อนหน้านั้น **ไม่มีทางบันทึกเลย**
 * ทริปเกาหลีจึงมี `DayEvent` 35 รายการที่ถูก *พิมพ์มือลงไฟล์โค้ด* (`data/itinerary.ts`) และ
 * ผู้ใช้ถามเองว่า *"ถ้าสร้างทริปใหม่ผ่านหน้าบ้าน มันคงไม่ได้แบบนี้ถูกไหม"* — ถูก
 *
 * ## 🔴 สามแกนที่ฐานบังคับ และฟอร์มนี้บังคับซ้ำ *เพื่อข้อความ* ไม่ใช่เพื่อแทนด่าน
 * `trip_stops_event_needs_core`: `fixed_start_time` + `title` + `icon` ต้องครบเมื่อ `kind='event'`
 * `trip_stops_flight_fields_complete`: ข้อมูลเที่ยวบิน **ครบชุดหรือไม่มีเลย**
 * 🎯 **ฐานคือด่านจริง ฟอร์มคือคำอธิบาย** — ถ้าฟอร์มนี้ถูกข้าม (เรียก API ตรง) ฐานยังปฏิเสธเหมือนเดิม
 * · route แปลง `23514` เป็น **400 พร้อมข้อความไทย** แล้ว จึงไม่มีเส้นทางไหนที่ผู้ใช้เห็น 502 ดิบ
 *
 * ## 🔴 สอง "ล็อก" ที่หน้าตาเหมือนกันแต่คนละเรื่อง — **ห้ามยุบเข้าหากัน**
 * · `flexible` (`time_is_flexible`) = *เวลานี้เลื่อนได้ในโลกจริงไหม* · `false` = ตั๋วจองแล้ว → 🔒
 * · `stopId` = *แถวนี้แก้ผ่านเว็บได้ไหม* — แถวจากไฟล์โค้ดไม่มี id จึงไม่มีปุ่มแก้ตั้งแต่ต้น
 * ⇒ **แถวที่ 🔒 อยู่ ยังต้องแก้ในเว็บได้** (พิมพ์เลขไฟลต์ผิดต้องแก้ได้) · ดู `DayEvent.stopId`
 */
const KIND_OPTIONS: { value: DayEventKind | ""; label: string }[] = [
  { value: "", label: "ทั่วไป" },
  { value: "flight", label: "✈️ เที่ยวบิน" },
  { value: "layover", label: "🛄 ต่อเครื่อง" },
  { value: "transfer", label: "🚌 เดินทางไป/กลับสนามบิน" },
  { value: "checkin", label: "🏨 เช็คอิน/เช็คเอาต์" },
  { value: "deadline", label: "⏰ เดดไลน์" },
];

/** ไอคอนที่เดาให้ตอนเลือกชนิด — **ค่าตั้งต้นเท่านั้น ผู้ใช้พิมพ์ทับได้เสมอ** */
const ICON_BY_KIND: Record<string, string> = {
  flight: "✈️",
  layover: "🛄",
  transfer: "🚌",
  checkin: "🏨",
  deadline: "⏰",
};

const ANCHOR_OPTIONS: { value: "" | "before" | "after"; label: string; hint: string }[] = [
  { value: "", label: "ไม่ผูกกับตาราง", hint: "แสดงเป็นแถวเวลาเฉย ๆ ไม่ขยับจุดแวะ" },
  { value: "before", label: "เริ่มนับจุดแวะต่อจากนี้", hint: "เช่น ถึงสนามบินแล้วออกไปเที่ยวต่อ" },
  { value: "after", label: "จุดแวะทั้งวันต้องจบก่อนเวลานี้", hint: "เช่น ต้องกลับไปขึ้นเครื่อง" },
];

/** `""` → `null` — ช่องข้อความว่างคือ "ไม่มีค่า" ไม่ใช่ "สตริงว่าง" (ฐานแยกสองอย่างนี้) */
function orNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export function DayEventEditModal({
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  /** `null` = สร้างใหม่ · มีค่า = แก้แถวเดิม (ต้องมี `stopId` ถึงจะมาถึงที่นี่ได้) */
  existing: DayEvent | null;
  onClose: () => void;
  onSave: (input: EventInput) => void | Promise<void>;
  /** ไม่ส่ง = ซ่อนปุ่มลบ (ตอนสร้างใหม่ยังไม่มีอะไรให้ลบ) */
  onDelete?: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "📌");
  const [startTime, setStartTime] = useState(existing?.time ?? "");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "");
  const [kind, setKind] = useState<DayEventKind | "">(existing?.kind ?? "");
  const [anchor, setAnchor] = useState<"" | "before" | "after">(existing?.anchor ?? "");
  const [alert, setAlert] = useState(existing?.alert === true);
  const [flexible, setFlexible] = useState(existing?.editable === true);
  const [note, setNote] = useState(existing?.detail ?? "");
  const [flightNo, setFlightNo] = useState(existing?.flight?.no ?? "");
  const [fromCode, setFromCode] = useState(existing?.flight?.fromCode ?? "");
  const [toCode, setToCode] = useState(existing?.flight?.toCode ?? "");
  const [fromEn, setFromEn] = useState(existing?.flight?.fromEn ?? "");
  const [toEn, setToEn] = useState(existing?.flight?.toEn ?? "");
  const [saving, setSaving] = useState(false);

  // ปิดที่ทางเข้าตอนโมดัลเปิด ไม่ใช่แค่ปุ่มบันทึกตอนจบ — รูปแบบเดียวกับ `HotelEditModal`/`BookingEditModal`
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  const flightFilled = [flightNo, fromCode, toCode].filter((v) => v.trim() !== "").length;
  /**
   * 🔴 ตรวจสามแกน + ครึ่งชุดของเที่ยวบิน **ก่อนส่ง เพื่อให้ข้อความอ่านออก** ไม่ใช่เพื่อแทนด่านของฐาน
   * `fromEn`/`toEn` ไม่อยู่ใน CHECK — ปล่อยว่างได้ (มันเป็นชื่อเมืองสำหรับหน้า ตม. ไม่ใช่แกนของแถว)
   */
  const problem =
    title.trim() === ""
      ? "ต้องมีชื่อแถว"
      : !/^\d{2}:\d{2}$/.test(startTime)
        ? "ต้องมีเวลาเริ่ม"
        : icon.trim() === ""
          ? "ต้องมีไอคอน"
          : endTime !== "" && endTime < startTime
            ? "เวลาสิ้นสุดอยู่ก่อนเวลาเริ่ม"
            : flightFilled > 0 && flightFilled < 3
              ? "ข้อมูลเที่ยวบินต้องครบทั้งเลขไฟลต์ · สนามบินต้นทาง · สนามบินปลายทาง (หรือเว้นว่างทั้งหมด)"
              : null;

  async function submit() {
    if (problem || readOnly || saving) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      icon: icon.trim(),
      startTime,
      endTime: orNull(endTime),
      kind: kind === "" ? null : kind,
      anchor: anchor === "" ? null : anchor,
      alert,
      flexible,
      note: orNull(note),
      flight:
        flightFilled === 3
          ? {
              no: flightNo.trim(),
              fromCode: fromCode.trim().toUpperCase(),
              toCode: toCode.trim().toUpperCase(),
              // ฐานเก็บ `not null` ไม่ได้บังคับ แต่หน้า ตม. อ่านช่องนี้ — ว่างดีกว่าค่าที่เดาเอง
              fromEn: fromEn.trim(),
              toEn: toEn.trim(),
            }
          : null,
    });
    setSaving(false);
    onClose();
  }

  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content";
  const label = "mb-1 block text-xs font-medium text-content-soft";

  return (
    <Modal
      onClose={onClose}
      title={existing ? "แก้แถวเวลาตายตัว" : "เพิ่มแถวเวลาตายตัว"}
      subtitle="เที่ยวบิน · เช็คอิน · เดดไลน์ — เวลาที่ไม่ได้ขึ้นกับลำดับจุดแวะ"
      footer={
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              disabled={readOnly || saving}
              onClick={async () => {
                setSaving(true);
                await onDelete();
                setSaving(false);
                onClose();
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-alert-ink hover:bg-alert-soft disabled:opacity-40"
            >
              ลบแถวนี้
            </button>
          )}
          <div className="flex-1" />
          {/* 🔴 บอกว่า *ทำไม* ปุ่มกดไม่ได้ — ปุ่มที่กดไม่ได้เฉย ๆ แย่กว่าปุ่มที่หายไป */}
          {problem && <span className="text-xs text-content-soft">{problem}</span>}
          <button
            type="button"
            onClick={submit}
            disabled={!!problem || readOnly || saving}
            className="rounded-lg bg-maple px-4 py-2 text-sm font-semibold text-cream disabled:opacity-40"
          >
            บันทึก
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <span className={label}>ชนิด</span>
          <select
            className={field}
            value={kind}
            onChange={(e) => {
              const next = e.target.value as DayEventKind | "";
              setKind(next);
              // เดาไอคอนให้เฉพาะตอนผู้ใช้ยังไม่ได้ตั้งเอง — ไม่ทับของที่เขาพิมพ์ไว้แล้ว
              if (ICON_BY_KIND[next] && (icon === "📌" || icon === "")) setIcon(ICON_BY_KIND[next]);
            }}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="w-20 shrink-0">
            <span className={label}>ไอคอน</span>
            <input className={`${field} text-center`} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          </div>
          <div className="min-w-0 flex-1">
            <span className={label}>ชื่อแถว</span>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น เช็คอินเที่ยวบินขาไป"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <span className={label}>เวลาเริ่ม</span>
            <input type="time" className={field} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex-1">
            <span className={label}>เวลาสิ้นสุด (ถ้ามี)</span>
            <input type="time" className={field} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <span className={label}>ผูกกับตารางของวันยังไง</span>
          <select className={field} value={anchor} onChange={(e) => setAnchor(e.target.value as "" | "before" | "after")}>
            {ANCHOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-content-soft">
            {ANCHOR_OPTIONS.find((o) => o.value === anchor)?.hint}
          </p>
        </div>

        <div>
          <span className={label}>โน้ต (ถ้ามี)</span>
          <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <label className="flex items-start gap-2 text-sm text-content">
          <input type="checkbox" className="mt-0.5" checked={alert} onChange={(e) => setAlert(e.target.checked)} />
          <span>
            เป็นเดดไลน์ที่พลาดไม่ได้
            <span className="block text-xs text-content-soft">แถวจะเปลี่ยนสีให้เด่นกว่าแถวปกติ</span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-content">
          <input type="checkbox" className="mt-0.5" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} />
          <span>
            เวลานี้ยืดหยุ่นได้จริงหน้างาน
            <span className="block text-xs text-content-soft">
              ไม่ติ๊ก = ตั๋วจองแล้ว เลื่อนไม่ได้ (ขึ้น 🔒) — <b>คนละเรื่องกับการแก้ในเว็บ ซึ่งทำได้เสมอ</b>
            </span>
          </span>
        </label>

        {/* ขึ้นเฉพาะชนิดเที่ยวบิน — ช่องที่ไม่เกี่ยวกับแถวนี้ ไม่ควรอยู่ให้เผลอกรอก */}
        {kind === "flight" && (
          <div className="rounded-xl border border-line bg-surface-soft/40 p-3">
            <p className="mb-2 text-xs font-medium text-content-soft">
              ข้อมูลเที่ยวบิน — <b>ครบทั้งสามช่องแรก หรือเว้นว่างทั้งหมด</b> (หน้า ตม. อ่านช่องพวกนี้)
            </p>
            <div className="space-y-2">
              <input className={field} value={flightNo} onChange={(e) => setFlightNo(e.target.value)} placeholder="เลขเที่ยวบิน เช่น VN610" />
              <div className="flex gap-2">
                <input className={field} value={fromCode} onChange={(e) => setFromCode(e.target.value)} placeholder="ต้นทาง เช่น BKK" maxLength={4} />
                <input className={field} value={toCode} onChange={(e) => setToCode(e.target.value)} placeholder="ปลายทาง เช่น NRT" maxLength={4} />
              </div>
              <div className="flex gap-2">
                <input className={field} value={fromEn} onChange={(e) => setFromEn(e.target.value)} placeholder="ชื่อเมืองต้นทาง (EN)" />
                <input className={field} value={toEn} onChange={(e) => setToEn(e.target.value)} placeholder="ชื่อเมืองปลายทาง (EN)" />
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
