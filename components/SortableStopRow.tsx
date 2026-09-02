"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Place } from "@/data/places";
import { categoryMetaOf } from "@/components/categoryMeta";
import type { TripStop } from "@/lib/supabase";
import type { ScheduledStop, TravelMode } from "@/lib/schedule";
import { computeDepartureAdvice } from "@/lib/departureAdvice";
import { placeQueryKey } from "@/lib/placeQuery";
import { uploadStopPhoto, removeStopPhoto } from "@/lib/stopPhoto";
import { useSystemMode } from "@/hooks/useSystemMode";
import { InsertBetweenRow } from "./InsertBetweenRow";
import NoteBody, { itemsToNote, noteItems, type NoteItem } from "./NoteBody";
import { PhotoLightbox } from "./PhotoLightbox";
import { PlaceThumb } from "./PlaceThumb";
import { TravelModeRow } from "./TravelModeRow";
import { TransferAdvicePanel } from "./TransferAdvicePanel";
import { INTERCITY_MODE_LABEL, intercityModeIconOf, type IntercityMode } from "./IntercityEditModal";

/* กฎการจัดรูปโน้ตอยู่ใน NoteBody (บุลเล็ต/ลำดับ/ป้ายเวลา) — แต่ก่อนบอกไว้ที่ placeholder ที่เดียว
   ซึ่งหายทันทีที่พิมพ์ตัวแรก คนพิมพ์จึงไม่มีทางรู้ว่า "-" หรือ "09:30" ทำอะไรได้ ต้องอยู่ตลอดเวลาพิมพ์ */
const NOTE_FORMAT_HINT = "ขึ้นต้นด้วย 09:30 จะได้ป้ายเวลา";

/** ความสูงสูงสุดของช่องพิมพ์โน้ต (px) — เกินนี้ให้เลื่อนในช่องแทนดันแถวอื่นตกจอ */
const NOTE_MAX_H = 240;

/* โตตาม *ความสูงจริงของข้อความ* ไม่ใช่จำนวน "\n" — ของเดิมนับบรรทัดที่กด Enter เอง
   พิมพ์ยาวรวดเดียวบนมือถือแล้วตัวหนังสือวนบรรทัด ช่องยังสูงเท่าเดิม มองไม่เห็นของที่พิมพ์ */
function growNote(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, NOTE_MAX_H)}px`;
  el.style.overflowY = el.scrollHeight > NOTE_MAX_H ? "auto" : "hidden";
}

/** กัน blur ตอนกดปุ่มในโหมดแก้โน้ต — ไม่งั้น onBlur ของ textarea จะบันทึก/ปิดก่อนที่ onClick จะได้ทำงาน
 *  (ผลคือปุ่ม "ยกเลิก" กดไม่ติดเลย เพราะแถวถูกเรนเดอร์ใหม่ไปแล้วระหว่าง mousedown→mouseup) */
function keepFocus(e: ReactMouseEvent) {
  e.preventDefault();
}

const DWELL_STEP_MINUTES = 15;
const MIN_DWELL_MINUTES = 15;

/** หนึ่งแถวจุดแวะในตารางของวัน — ลากจัดลำดับได้ พร้อมโน้ต/รูป/เวลาที่อยู่/แถวเดินทางที่นำหน้ามัน */
export function SortableStopRow({
  stop,
  dayId,
  index,
  sched,
  prevPlace,
  travelMinutesIn,
  isFlashing,
  isActive,
  rowRef,
  isTravelReal,
  closedWarning,
  closedHoursLabel,
  locked,
  onSetTravelMode,
  onView,
  onUpdateDwell,
  onUpdateNote,
  onUpdatePhoto,
  onRemoveStop,
  onInsertBefore,
  onInsertIntercityBefore,
  onInsertHotelBefore,
  hotelName,
  signedPhotoUrl,
}: {
  stop: TripStop;
  dayId: string;
  index: number;
  sched: ScheduledStop;
  prevPlace: Place | undefined;
  /** เวลาเดินทางที่พามาถึงจุดนี้ — จุดแรกของวันใช้ค่าจากที่พัก (daySchedule.travelMinutesFromStart)
   *  ซึ่ง sched.travelMinutesFromPrev ไม่มี · ใช้คำนวณ "ควรออกกี่โมง" ของแถว kind="transfer" */
  travelMinutesIn: number | null;
  isFlashing: boolean;
  /** true = จุดแวะนี้ถูกเลือกอยู่ (คลิกหมุดบนแผนที่ หรือคลิกชื่อในลิสต์) — ไฮไลต์ค้างไว้ต่างจาก isFlashing ที่เป็น pulse ชั่วคราว */
  isActive: boolean;
  /** เก็บ DOM node ของแถวนี้ไว้ scrollIntoView ได้ตอนถูกเลือกจากฝั่งแผนที่ */
  rowRef?: (el: HTMLDivElement | null) => void;
  isTravelReal: boolean;
  /** true = เวลาที่คำนวณได้ (ถึง-ออก) ตกนอกเวลาเปิดของสถานที่นี้ ตามข้อมูลจาก Google */
  closedWarning: boolean;
  /** ข้อความเวลาเปิด-ปิดของวันนั้นจาก Google (เช่น "วันจันทร์: 9:00–18:00") โชว์คู่กับ closedWarning ให้รู้ว่าเปิดกี่โมงจริงๆ */
  closedHoursLabel: string | null;
  /** true = วันนี้ถูกล็อกไว้ — ซ่อนปุ่มแก้ทั้งหมดและลากจัดลำดับไม่ได้ (ยังกดดูรายละเอียดสถานที่ได้) */
  locked: boolean;
  onSetTravelMode: (mode: TravelMode) => void;
  onView: () => void;
  onUpdateDwell: (minutes: number) => void;
  onUpdateNote: (note: string | null) => void;
  onUpdatePhoto: (photoUrl: string | null) => void;
  onRemoveStop: () => void;
  /** เปิด modal หาร้านอาหารแทรกก่อนจุดแวะนี้ — undefined เมื่อเป็นจุดแวะแรกของวัน (ยังไม่มี "ก่อนหน้า" ให้อ้างอิง) */
  onInsertBefore: (() => void) | undefined;
  /** เปิด modal แทรกเดินทางข้ามเมืองก่อนจุดแวะนี้ */
  onInsertIntercityBefore: (() => void) | undefined;
  /** แทรกแถว "แวะที่พัก" ก่อนจุดแวะนี้ — undefined เมื่อวันนี้ยังไม่ได้ตั้งที่พัก (ไม่มีพิกัดให้แวะ) */
  onInsertHotelBefore: (() => void) | undefined;
  /** ชื่อที่พักของช่วงนี้ — ใช้โชว์บนแถว kind="hotel" (ดึงสดจาก trip_hotels ไม่ใช่จาก place_id) */
  hotelName: string | null;
  /** signed URL ของ stop.photo_url เซ็นไว้แล้วจาก DayStopsSection (E2-AC13 ②) — แถวนี้ไม่รู้จักการเซ็น
   *  เอง ตั้งใจ เพราะ parent มี stops ทั้งวันอยู่ในมืออยู่แล้วและเซ็นรวมทีเดียวถูกกว่าเซ็นทีละแถว
   *  undefined = ยังเซ็นไม่เสร็จ · null = เซ็นไม่สำเร็จ (ต้องบอกว่าเปิดไม่ได้) · string = เปิดได้ */
  signedPhotoUrl: string | null | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    data: { type: "stop", dayId },
    disabled: locked,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editingNote, setEditingNote] = useState(false);
  /* โน้ตเก็บใน DB เป็น text ก้อนเดียวเหมือนเดิม แต่ *ตอนแก้* เป็นรายการทีละข้อ —
     คนใช้จริงคิดเป็น "ข้อ 1 ข้อ 2" ไม่ได้คิดเป็นก้อนข้อความที่ต้องกด Enter เอง */
  const [noteDraft, setNoteDraft] = useState<NoteItem[]>(() => noteItems(stop.note ?? ""));
  /* เขียนลงฐานเฉพาะตอนมีการแก้จริง — ถ้าเทียบด้วยข้อความจะเจอโน้ตเก่าที่คั่นด้วย " · "
     ถูกเขียนใหม่เป็นบรรทัดทุกครั้งที่แค่เปิดดูแล้วปิด (ผลเหมือนเดิมบนจอ แต่เป็นการเขียนที่ไม่มีใครสั่ง) */
  const [noteDirty, setNoteDirty] = useState(false);
  /* ช่องที่เพิ่งถูกเพิ่มต้องได้โฟกัสเอง ไม่งั้นกด "+ เพิ่มข้อ" แล้วต้องเอื้อมไปแตะช่องอีกที
     ใช้ ref + callback ref แทน useEffect เพราะ setState ใน effect ผิดกฎ React Compiler */
  const focusItemRef = useRef<number | null>(null);

  const openNoteEditor = () => {
    const items = noteItems(stop.note ?? "");
    setNoteDraft(items.length ? items : [{ marker: "", text: "" }]);
    setNoteDirty(false);
    setEditingNote(true);
    focusItemRef.current = Math.max(0, items.length - 1);
  };
  const closeNoteEditor = () => {
    setNoteDirty(false);
    setEditingNote(false);
  };
  const commitNote = (items: NoteItem[]) => {
    onUpdateNote(itemsToNote(items) || null);
    closeNoteEditor();
  };
  const addNoteItem = (at: number) => {
    /* ข้อใหม่เป็นบุลเล็ตเสมอ — คนกด "เพิ่มข้อ" คือกำลังทำรายการ ไม่ใช่เขียนย่อหน้าต่อ
       และถ้าของเดิมมีข้อเดียวที่ยังไม่มีสัญลักษณ์ ให้มันกลายเป็นบุลเล็ตด้วย
       ไม่งั้นจะได้ย่อหน้า 1 อัน + บุลเล็ต 1 อัน ซึ่งไม่ใช่สิ่งที่คนกดปุ่มขอ */
    const base =
      noteDraft.length === 1 && !noteDraft[0].marker && noteDraft[0].text.trim()
        ? [{ marker: "- ", text: noteDraft[0].text }]
        : [...noteDraft];
    base.splice(at, 0, { marker: "- ", text: "" });
    focusItemRef.current = at;
    setNoteDirty(true);
    setNoteDraft(base);
  };
  const removeNoteItem = (i: number) => {
    const next = noteDraft.filter((_, j) => j !== i);
    focusItemRef.current = Math.max(0, i - 1);
    setNoteDirty(true);
    setNoteDraft(next.length ? next : [{ marker: "", text: "" }]);
  };
  const setNoteItemText = (i: number, text: string) => {
    setNoteDirty(true);
    setNoteDraft(noteDraft.map((it, j) => (j === i ? { ...it, text } : it)));
  };
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState(false);
  // ปิดที่ทางเข้า (โน้ต/อัปโหลดรูป) ตอนอ่านสถานะ — สองจุดนี้เป็นแรงจริงที่เสียได้ (พิมพ์โน้ตยาว/อัปโหลดรูป
  // แล้วเจอ 503) ต่างจากปุ่มลาก/ลบ/ปรับเวลาในแถวนี้ที่เป็นคลิกเดียวไม่มีแรงจะเสีย (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  async function handlePhotoChange(file: File | null) {
    if (!file || readOnly) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    const result = await uploadStopPhoto(stop.id, file, stop.photo_url);
    if ("error" in result) {
      setPhotoError(result.error);
      setUploadingPhoto(false);
      return;
    }
    onUpdatePhoto(result.url);
    setUploadingPhoto(false);
  }

  async function handleRemovePhoto() {
    if (readOnly) return;
    await removeStopPhoto(stop.photo_url);
    onUpdatePhoto(null);
  }

  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    rowRef?.(el);
  };

  // แถวพิเศษ (ข้ามเมือง/ไปสนามบิน/แวะที่พัก) ไม่ใช่สถานที่ที่ไปถ่ายรูปหรือกดดูรายละเอียดได้
  const isSpecialRow =
    stop.kind === "intercity" || stop.kind === "transfer" || stop.kind === "hotel";

  // "ควรออกกี่โมงถึงจะทันเครื่อง" — คำนวณย้อนกลับจากเวลาบินที่ผูกไว้กับแถวนี้ (transfer_target_time)
  const transferAdvice =
    stop.kind === "transfer" && stop.transfer_target_time
      ? computeDepartureAdvice({
          targetTime: stop.transfer_target_time,
          plannedArrivalMinutes: sched.arrivalMinutes,
          travelMinutes: travelMinutesIn ?? 0,
          checkinBufferMinutes: sched.resolvedDwellMinutes,
        })
      : null;

  // ปุ่มปรับเวลาที่อยู่ + ปุ่มลบ — ประกาศครั้งเดียวแล้ววางสองที่ เพราะมือถือกับจอใหญ่วางคนละแถวกัน
  // (มือถือยกลงไปแถวล่างเพื่อคืนความกว้างให้ชื่อสถานที่ ดูคอมเมนต์ที่แถวหลัก)
  const dwellControls = (
    <>
      <button
        onClick={() =>
          onUpdateDwell(Math.max(MIN_DWELL_MINUTES, sched.resolvedDwellMinutes - DWELL_STEP_MINUTES))
        }
        aria-label="ลดเวลาที่อยู่"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-base hover:bg-maple-soft sm:h-7 sm:w-7 sm:text-xs"
      >
        −
      </button>
      <span className="w-11 text-center tabular-nums">{sched.resolvedDwellMinutes} น.</span>
      <button
        onClick={() => onUpdateDwell(sched.resolvedDwellMinutes + DWELL_STEP_MINUTES)}
        aria-label="เพิ่มเวลาที่อยู่"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-base hover:bg-maple-soft sm:h-7 sm:w-7 sm:text-xs"
      >
        +
      </button>
    </>
  );

  const removeButton = (
    <button
      onClick={onRemoveStop}
      aria-label="เอาจุดแวะนี้ออก"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-content-soft hover:bg-surface-soft sm:h-7 sm:w-7 sm:text-xs"
    >
      ✕
    </button>
  );

  return (
    <div
      ref={setRefs}
      style={style}
      className={
        [isFlashing && "animate-stop-added", isActive && "ring-2 ring-inset ring-maple/60"]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {index > 0 && prevPlace && sched.place && sched.travelMinutesFromPrev != null && (
        <TravelModeRow
          key={stop.travel_mode ?? "unset"}
          fromPlace={prevPlace}
          toPlace={sched.place}
          mode={(stop.travel_mode as TravelMode | null) ?? null}
          resolvedMinutes={sched.travelMinutesFromPrev}
          isReal={isTravelReal}
          locked={locked}
          onSetMode={onSetTravelMode}
        />
      )}
      {/* แทรกร้านอาหารกลางวันได้เลย ไม่ต้องเพิ่มท้ายวันแล้วลากขึ้นมาเอง — ศูนย์กลางค้นหาอิงจุดก่อนหน้าตรงนี้ */}
      {!locked && (
        <InsertBetweenRow
          actions={[
            ...(onInsertBefore
              ? [{ label: "+ แทรกร้านอาหารตรงนี้", tone: "maple" as const, onClick: onInsertBefore }]
              : []),
            ...(onInsertHotelBefore
              ? [{ label: "🏨 + แวะที่พักตรงนี้", tone: "pine" as const, onClick: onInsertHotelBefore }]
              : []),
            ...(onInsertIntercityBefore
              ? [
                  {
                    label: "+ แทรกเดินทางข้ามเมืองตรงนี้",
                    tone: "pine" as const,
                    onClick: onInsertIntercityBefore,
                  },
                ]
              : []),
          ]}
        />
      )}
      {/* มือถือ: แถวนี้เหลือแค่ ที่จับลาก + เวลา + ชื่อ เพื่อให้ชื่อสถานที่ได้ความกว้างเต็ม
          (ของเดิมยัดปุ่มปรับเวลา/ลบไว้ด้วย ชื่อเลยเหลือ ~74px จาก 341px จนอ่านไม่ออก)
          ปุ่มที่ยกออกไปอยู่แถวโน้ตด้านล่างแทน · จอ sm ขึ้นไปยังเป็นแถวเดียวเหมือนเดิม */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {locked ? (
          <span
            aria-label="วันนี้ล็อกอยู่ ลากจัดลำดับไม่ได้"
            className="flex h-10 w-7 shrink-0 items-center justify-center text-xs text-content-soft/40 sm:h-auto sm:w-auto sm:px-1 sm:py-2"
          >
            🔒
          </span>
        ) : (
          <button
            {...attributes}
            {...listeners}
            aria-label="ลากเพื่อจัดลำดับใหม่"
            style={{ touchAction: "none" }}
            className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded text-content-soft/60 hover:bg-surface-soft hover:text-content-soft active:cursor-grabbing sm:h-auto sm:w-auto sm:px-1 sm:py-2"
          >
            ⠿
          </button>
        )}

        <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-content-soft sm:w-14">
          <div className="font-semibold text-content">{sched.arrival}</div>
          <div>{sched.departure}</div>
        </div>

        {stop.kind === "intercity" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-3xl">
              {intercityModeIconOf(stop.intercity_mode)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-content">
                {INTERCITY_MODE_LABEL[(stop.intercity_mode as IntercityMode) ?? "other"]} ·{" "}
                {stop.intercity_from} → {stop.intercity_to}
              </span>
              <span className="block truncate text-xs text-content-soft">
                ใช้เวลาเดินทาง {sched.resolvedDwellMinutes} นาที
              </span>
            </span>
          </div>
        ) : stop.kind === "hotel" ? (
          // กดได้เหมือนแถวจุดแวะปกติ — แถวนี้มี `place` เหมือนกัน (schedule.ts resolve ให้ทุก kind)
          // และ DayMapPanel ก็วาดหมุดให้ ถ้าไม่ผูก onView จะกดหมุดบนแผนที่ได้แต่กดในลิสต์ไม่ได้
          <button
            onClick={() => sched.place && onView()}
            disabled={!sched.place}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-default"
          >
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-3xl">
              🏨
            </span>
            <span className="min-w-0 flex-1">
              {/* ชื่อโรงแรมมาจาก trip_hotels สดๆ ไม่ใช่จาก place_id — เปลี่ยนโรงแรมแล้วแถวนี้เปลี่ยนตาม */}
              <span className="block truncate font-semibold text-content hover:underline">
                แวะที่พัก · {hotelName ?? "ยังไม่ได้ตั้งที่พักของช่วงนี้"}
              </span>
              <span className="block truncate text-xs text-content-soft">
                อยู่ที่พัก {sched.resolvedDwellMinutes} นาที (เช็คอิน / ฝากกระเป๋า / พัก)
              </span>
            </span>
          </button>
        ) : stop.kind === "transfer" ? (
          // เหตุผลเดียวกับ hotel ด้านบน — สถานี/สนามบินมีพิกัดจริงและมีหมุดบนแผนที่
          <button
            onClick={() => sched.place && onView()}
            disabled={!sched.place}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-default"
          >
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-3xl">
              {sched.place && "transferKind" in sched.place && sched.place.transferKind === "station"
                ? "🚉"
                : "✈️"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-content hover:underline">
                {sched.place && "transferKind" in sched.place && sched.place.transferKind === "station"
                  ? "ไปสถานี"
                  : "ไปสนามบิน"}{" "}
                · {sched.place?.nameTh ?? "ไม่พบข้อมูลปลายทาง"}
              </span>
              <span className="block truncate text-xs text-content-soft">
                เผื่อเวลาที่นั่น {sched.resolvedDwellMinutes} นาที
                {stop.transfer_target_label ? ` · ${stop.transfer_target_label}` : ""}
              </span>
            </span>
          </button>
        ) : (
          <button
            onClick={() => sched.place && onView()}
            disabled={!sched.place}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-default"
          >
            {sched.place ? (
              <>
                <PlaceThumb
                  query={placeQueryKey(sched.place)}
                  category={sched.place.category}
                  className="h-20 w-20 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-content hover:underline">
                    {categoryMetaOf(sched.place.category).emoji} {sched.place.nameTh}
                  </span>
                  {stop.added_by && (
                    <span className="block truncate text-xs text-content-soft">เลือกโดย {stop.added_by}</span>
                  )}
                </span>
              </>
            ) : (
              <span className="text-sm text-maple-dark">ไม่พบข้อมูลสถานที่</span>
            )}
          </button>
        )}

        {/* ซ่อนช่วง lg ขึ้นไปด้วย เพราะแผนที่ข้างๆ แย่งพื้นที่แถวจนชื่อสถานที่เหลือไม่พอ (บั๊กเดียวกับที่แก้ไว้ฝั่งมือถือ) */}
        {locked ? (
          <span className="hidden shrink-0 items-center text-xs tabular-nums text-content-soft sm:flex lg:hidden">
            {sched.resolvedDwellMinutes} น.
          </span>
        ) : (
          <>
            <div className="hidden shrink-0 items-center gap-1 text-xs text-content-soft sm:flex lg:hidden">
              {dwellControls}
            </div>
            <div className="hidden sm:block lg:hidden">{removeButton}</div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 pb-2 pl-10 sm:px-4 sm:pl-14">
        <div className="min-w-0 flex-1">
        {/* มือถือ: ช่องพิมพ์โน้ตกินเต็มบรรทัด ปุ่มบันทึก/ยกเลิก/ลบ ตกไปบรรทัดล่าง
            (ของเดิมทุกอย่างอยู่แถวเดียว ช่องพิมพ์เลยแคบจนพิมพ์ไม่ได้จริง) */}
        {/* readOnly ใช้ทางเดียวกับ locked สำหรับโน้ต — ทั้งคู่แปลว่า "แก้ตอนนี้ไม่ได้" แค่คนละเหตุผล
            (locked = วันนี้ถูกล็อกเอง · readOnly = ทั้งระบบปิดรับการแก้ไขชั่วคราว) */}
        {locked || readOnly ? (
          stop.note ? (
            <NoteBody
              note={stop.note}
              previewLines={2}
              className="text-xs text-content-soft"
            />
          ) : null
        ) : editingNote ? (
          /* แก้โน้ตทีละ "ข้อ" ไม่ใช่ก้อนข้อความก้อนเดียว — ของเดิมเป็น textarea ช่องเดียว
             คนใช้ต้องรู้เองว่ากด Enter คือขึ้นข้อใหม่ และลบข้อกลาง ๆ ต้องเลือกทั้งบรรทัดเอง
             ที่เก็บใน DB ยังเป็น text บรรทัดละข้อเหมือนเดิม (ดู itemsToNote ใน NoteBody) */
          <div
            className="rounded-lg border border-line bg-surface p-1.5"
            onBlur={(e) => {
              /* บันทึกเมื่อโฟกัสออกจาก *ทั้งกล่อง* ไม่ใช่ออกจากช่องใดช่องหนึ่ง
                 ไม่งั้นแค่ย้ายจากข้อ 1 ไปข้อ 2 ก็ยิงบันทึกแล้ว
                 ปุ่มข้างในกัน blur ด้วย onMouseDown จึงไม่เข้าเงื่อนไขนี้เลย */
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (noteDirty) commitNote(noteDraft);
              else closeNoteEditor();
            }}
          >
            <ol className="space-y-1">
              {noteDraft.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="w-4 shrink-0 pt-1.5 text-center text-[11px] tabular-nums text-content-soft/60">
                    {i + 1}
                  </span>
                  <textarea
                    rows={1}
                    ref={(el) => {
                      growNote(el);
                      if (el && focusItemRef.current === i) {
                        focusItemRef.current = null;
                        el.focus();
                        el.setSelectionRange(el.value.length, el.value.length);
                      }
                    }}
                    value={item.text}
                    onChange={(e) => {
                      setNoteItemText(i, e.target.value);
                      growNote(e.currentTarget);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        commitNote(noteDraft);
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNoteItem(i + 1);
                        return;
                      }
                      /* ลบข้อว่างด้วย Backspace — ท่าที่คนพิมพ์เร็วคาดหวังจากรายการทุกที่
                         (กันไว้ไม่ให้ลบข้อสุดท้ายทิ้ง ไม่งั้นกล่องจะว่างจนไม่มีที่ให้พิมพ์) */
                      if (e.key === "Backspace" && !item.text && noteDraft.length > 1) {
                        e.preventDefault();
                        removeNoteItem(i);
                        return;
                      }
                      if (e.key === "Escape") closeNoteEditor();
                    }}
                    placeholder="เช่น 10:30 ต่อคิวหน้าร้าน"
                    className="min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-line px-2 py-1 text-sm leading-relaxed text-content focus:border-maple focus:outline-none"
                  />
                  <button
                    onMouseDown={keepFocus}
                    onClick={() => removeNoteItem(i)}
                    title="ลบข้อนี้"
                    aria-label={`ลบข้อ ${i + 1}`}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-sm text-content-soft/60 hover:bg-maple-soft hover:text-maple-dark"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <button
                onMouseDown={keepFocus}
                onClick={() => addNoteItem(noteDraft.length)}
                className="shrink-0 rounded-lg border border-dashed border-line px-2 py-1 text-xs text-content-soft hover:border-pine hover:text-pine"
              >
                + เพิ่มข้อ
              </button>
              <span className="flex-1" />
              <button
                onMouseDown={keepFocus}
                onClick={() => commitNote(noteDraft)}
                className="shrink-0 rounded-lg bg-pine px-2.5 py-1 text-xs font-medium text-cream hover:bg-pine-dark"
              >
                บันทึก
              </button>
              <button
                onMouseDown={keepFocus}
                onClick={closeNoteEditor}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-content-soft hover:bg-surface-soft"
              >
                ยกเลิก
              </button>
              {stop.note && (
                <button
                  onMouseDown={keepFocus}
                  onClick={() => {
                    onUpdateNote(null);
                    setNoteDraft([{ marker: "", text: "" }]);
                    closeNoteEditor();
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-maple-dark hover:bg-maple-soft"
                >
                  ลบทั้งหมด
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-content-soft/70">
              {NOTE_FORMAT_HINT}
              {/* คีย์ลัดมีจริงเฉพาะบนคีย์บอร์ด — บนมือถือท่าบันทึกคือแตะออกนอกกล่อง บอกคนละอย่างกัน */}
              <span className="hidden sm:inline">
                {" "}
                · Enter ขึ้นข้อใหม่ · ⌘/Ctrl+↵ บันทึก · Esc ยกเลิก
              </span>
              <span className="sm:hidden"> · แตะนอกกล่องเพื่อบันทึก</span>
            </p>
          </div>
        ) : stop.note ? (
          /* div ไม่ใช่ button — ข้างในมีปุ่ม "ดูทั้งหมด" ของ NoteBody อยู่ ซ้อน button ในกันไม่ได้ */
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              openNoteEditor();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNoteEditor();
              }
            }}
            className="cursor-pointer rounded-lg border-l-2 border-pine-soft py-0.5 pl-2 text-left text-xs text-content-soft hover:text-content"
            title="แตะเพื่อแก้โน้ต"
          >
            <NoteBody note={stop.note} previewLines={2} />
          </div>
        ) : (
          <button
            onClick={openNoteEditor}
            className="py-1.5 text-xs text-content-soft/60 hover:text-content-soft"
          >
            + โน้ต
          </button>
        )}
        </div>
        {/* ปุ่มปรับเวลาที่อยู่ + ลบ — โชว์แถวนี้ตอนมือถือ และตอน lg ขึ้นไปที่มีแผนที่แย่งพื้นที่ด้วย (ดูคอมเมนต์บนแถวหลัก) — ซ่อนตอนกำลังพิมพ์โน้ตเพื่อไม่แย่งที่ช่องพิมพ์ */}
        {locked ? (
          <span className="flex shrink-0 items-center text-xs tabular-nums text-content-soft sm:hidden lg:flex">
            อยู่ {sched.resolvedDwellMinutes} น.
          </span>
        ) : (
          !editingNote && (
            <div className="flex shrink-0 items-center gap-1 text-xs text-content-soft sm:hidden lg:flex">
              {dwellControls}
              {removeButton}
            </div>
          )
        )}
      </div>
      {stop.kind === "transfer" && sched.place && (
        <TransferAdvicePanel
          advice={transferAdvice}
          targetLabel={stop.transfer_target_label ?? null}
          airportId={sched.place.id}
          isAirport={!("transferKind" in sched.place) || sched.place.transferKind !== "station"}
          checkinBufferMinutes={sched.resolvedDwellMinutes}
          travelMinutes={travelMinutesIn}
          isTravelReal={isTravelReal}
        />
      )}
      {(stop.photo_url || (!locked && !isSpecialRow && !readOnly)) && (
        <div className="px-3 pb-2 pl-10 sm:px-4 sm:pl-14">
          {stop.photo_url ? (
            <div className="flex items-center gap-2">
              {/* signedPhotoUrl มี 3 สถานะ (E2-AC13 ②) — เซ็นรวมกันทั้งวันที่ DayStopsSection ไม่ใช่ที่นี่
                  undefined กำลังเซ็น · null เซ็นไม่สำเร็จ (ต้องบอก ไม่ใช่กลืน) · string เปิดได้ */}
              {signedPhotoUrl === undefined && (
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-surface-soft" />
              )}
              {signedPhotoUrl === null && (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-[10px] text-content-soft"
                  title="เปิดรูปไม่ได้"
                >
                  🖼️✕
                </div>
              )}
              {typeof signedPhotoUrl === "string" && (
                <button
                  type="button"
                  onClick={() => setZoomedPhoto(true)}
                  aria-label="ดูรูปหน้างานขนาดเต็ม"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ Supabase Storage ไม่ใช่ static asset */}
                  <img
                    src={signedPhotoUrl}
                    alt="รูปหน้างานของจุดแวะนี้"
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                </button>
              )}
              {!locked && !readOnly && (
                <button
                  onClick={handleRemovePhoto}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-maple-dark hover:bg-maple-soft"
                >
                  ลบรูป
                </button>
              )}
            </div>
          ) : (
            !locked &&
            !isSpecialRow &&
            !readOnly && (
              <label className="inline-flex cursor-pointer items-center gap-1 py-1.5 text-xs text-content-soft/60 hover:text-content-soft">
                {uploadingPhoto ? "กำลังอัปโหลด..." : "📷 + รูป"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
              </label>
            )
          )}
          {photoError && <p className="text-[11px] text-red-600">{photoError}</p>}
        </div>
      )}
      {closedWarning && (
        <div className="bg-maple-soft/60 px-4 pb-2 text-[11px] text-maple-dark">
          ⚠️ ช่วงเวลานี้สถานที่อาจปิดแล้ว
          {closedHoursLabel ? ` — ${closedHoursLabel}` : " (ตามเวลาเปิด-ปิดจาก Google)"}
        </div>
      )}
      {zoomedPhoto && typeof signedPhotoUrl === "string" && (
        <PhotoLightbox
          src={signedPhotoUrl}
          alt="รูปหน้างานของจุดแวะนี้ ขนาดเต็ม"
          onClose={() => setZoomedPhoto(false)}
        />
      )}
    </div>
  );
}
