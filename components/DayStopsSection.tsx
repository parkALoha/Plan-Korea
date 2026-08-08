"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, cityCenter, Place } from "@/data/places";
import type { City, Day, DayEvent } from "@/data/itinerary";
import { CITY_META, CITY_NAME_TH } from "@/data/itinerary";
import { BOOKING_FILES_BUCKET, supabase, type CustomPlace, type TripHotel, type TripStop } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import {
  estimateTravelMinutes,
  TRAVEL_MODES,
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  type ScheduledStop,
  type TravelMode,
} from "@/lib/schedule";
import { useDaySchedule } from "@/hooks/useDaySchedule";
import { weekdayHoursLabel } from "@/lib/openingHours";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { DayMapPanel } from "./DayMapPanel";
import { DaySummaryBar } from "./DaySummaryBar";
import { PlaceThumb } from "./PlaceThumb";
import { RouteSuggestionModal } from "./RouteSuggestionModal";
import { INTERCITY_MODE_ICON, INTERCITY_MODE_LABEL, type IntercityMode } from "./IntercityEditModal";

const DWELL_STEP_MINUTES = 15;
const MIN_DWELL_MINUTES = 15;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BOOKING_FILES_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

function TravelModeRow({
  fromPlace,
  toPlace,
  mode,
  resolvedMinutes,
  isReal,
  prefix,
  locked,
  onSetMode,
}: {
  /** ต้นทาง/ปลายทางของช่วงนี้ — เป็นจุดแวะหรือที่พักก็ได้ ใช้แค่พิกัดคำนวณระยะ */
  fromPlace: Pick<Place, "lat" | "lng">;
  toPlace: Pick<Place, "lat" | "lng">;
  mode: TravelMode | null;
  /** เวลาที่ schedule คำนวณจริงไว้แล้ว (ตรงกับ mode ปัจจุบัน) ใช้โชว์ตอนเลือกโหมดแล้ว */
  resolvedMinutes: number;
  /** true = เวลาจริงจาก Google Routes API, false = ยังเป็นเส้นตรง haversine ประมาณการ */
  isReal: boolean;
  /** ข้อความนำหน้า เช่น "ออกจากที่พัก" / "กลับที่พัก" — ไม่ใส่ = ช่วงระหว่างจุดแวะปกติ */
  prefix?: string;
  /** true = วันนี้ล็อกอยู่ — โชว์โหมดที่เลือกไว้เฉยๆ เปลี่ยนไม่ได้ */
  locked?: boolean;
  onSetMode: (mode: TravelMode) => void;
}) {
  // key={mode} จากผู้เรียก (ดูด้านล่าง) ทำให้ component นี้ remount ใหม่ทุกครั้งที่ mode เปลี่ยน
  // (เลือกครั้งแรก / เปลี่ยนโหมด / อีกคน sync มา) picking เลยรีเซ็ตอัตโนมัติโดยไม่ต้องใช้ effect
  const [picking, setPicking] = useState(mode == null);

  const distanceKm = haversineKm(fromPlace.lat, fromPlace.lng, toPlace.lat, toPlace.lng);

  if (locked) {
    return (
      <div className="bg-cream-soft/60 px-4 py-1.5 text-[11px] text-ink-soft">
        {prefix ? `${prefix} · ` : ""}
        {mode
          ? `${TRAVEL_MODE_EMOJI[mode]} ${TRAVEL_MODE_LABEL[mode]} ${isReal ? "" : "~"}${resolvedMinutes} นาทีเดินทาง ${isReal ? "(จริง)" : "(ประมาณการ)"}`
          : "ยังไม่ได้เลือกวิธีเดินทาง"}
      </div>
    );
  }

  if (mode && !picking) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 bg-cream-soft/60 px-4 py-1.5 text-[11px] text-ink-soft">
        <span>
          {prefix ? `${prefix} · ` : ""}
          {TRAVEL_MODE_EMOJI[mode]} {TRAVEL_MODE_LABEL[mode]} {isReal ? "" : "~"}
          {resolvedMinutes} นาทีเดินทาง {isReal ? "(จริง)" : "(ประมาณการ)"}
        </span>
        <button
          onClick={() => setPicking(true)}
          className="-my-1 px-1 py-1.5 font-medium text-pine-dark underline hover:text-pine"
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    // ปุ่มเลือกโหมดสูงแค่ 23px บนมือถือ กดพลาดง่าย — ดันเป็น 32px ด้วย py-1.5 (จอ sm ขึ้นไปคงความกระชับเดิม)
    <div className="flex flex-wrap items-center gap-1.5 bg-cream-soft/60 px-3 py-2 text-[11px] text-ink-soft sm:px-4 sm:py-1.5">
      <span>{prefix ? `${prefix} — เดินทางแบบไหน:` : "เดินทางแบบไหน:"}</span>
      {TRAVEL_MODES.map((m) => (
        <button
          key={m}
          onClick={() => onSetMode(m)}
          className="rounded-full border border-cream-soft bg-white px-2.5 py-1.5 text-ink hover:border-maple/40 sm:py-0.5"
        >
          {TRAVEL_MODE_EMOJI[m]} {TRAVEL_MODE_LABEL[m]} ~{estimateTravelMinutes(distanceKm, m)} น.
        </button>
      ))}
    </div>
  );
}

/** เที่ยวบิน/เดดไลน์ของวันนั้น — เวลาตายตัว จองมาแล้ว แก้ในเว็บไม่ได้ เลยแสดงแยกจากจุดแวะที่ลากจัดลำดับได้
 *  (นี่คือส่วนเดียวของวันที่ตั้งใจให้ล็อกถาวร ที่เหลือของวันบินแก้ได้เหมือนวันปกติทุกอย่าง) */
function DayEventsPanel({
  events,
  heading = "✈️ ตารางบิน/เวลาตายตัวของวันนี้",
}: {
  events: DayEvent[];
  heading?: string;
}) {
  return (
    <div className="border-b border-cream-soft bg-cream-soft/40">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        <span>{heading}</span>
        <span className="shrink-0 font-normal normal-case text-ink-soft/70">🔒 ตั๋วจองแล้ว แก้ไม่ได้</span>
      </div>
      <div className="space-y-1 px-4 pb-3 pt-1.5">
        {events.map((event, i) => (
          <div
            key={i}
            className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-xs ${
              event.alert ? "bg-maple-soft/70 text-maple-dark" : "text-ink"
            }`}
          >
            <div className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">
              {event.time}
              {event.endTime && (
                <div className="font-normal text-ink-soft">↓ {event.endTime}</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {event.icon} {event.title}
              </div>
              {event.detail && (
                <div className="mt-0.5 leading-relaxed text-ink-soft">{event.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableStopRow({
  stop,
  dayId,
  index,
  sched,
  prevPlace,
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
}: {
  stop: TripStop;
  dayId: string;
  index: number;
  sched: ScheduledStop;
  prevPlace: Place | undefined;
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
  const [noteDraft, setNoteDraft] = useState(stop.note ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("ไฟล์ใหญ่เกิน 10MB กรุณาเลือกไฟล์อื่น");
      return;
    }
    setUploadingPhoto(true);
    setPhotoError(null);
    const path = `stop-photo-${stop.id}-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
    if (error) {
      setPhotoError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      setUploadingPhoto(false);
      return;
    }
    // มีรูปเก่าอยู่แล้ว ลบทิ้งก่อนแทนที่ด้วยรูปใหม่ ไม่งั้นไฟล์ค้างใน bucket
    const oldPath = stop.photo_url ? storagePathFromPublicUrl(stop.photo_url) : null;
    if (oldPath) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([oldPath]);
    const { data } = supabase.storage.from(BOOKING_FILES_BUCKET).getPublicUrl(path);
    onUpdatePhoto(data.publicUrl);
    setUploadingPhoto(false);
  }

  async function handleRemovePhoto() {
    const path = stop.photo_url ? storagePathFromPublicUrl(stop.photo_url) : null;
    if (path) await supabase.storage.from(BOOKING_FILES_BUCKET).remove([path]);
    onUpdatePhoto(null);
  }

  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    rowRef?.(el);
  };

  // ปุ่มปรับเวลาที่อยู่ + ปุ่มลบ — ประกาศครั้งเดียวแล้ววางสองที่ เพราะมือถือกับจอใหญ่วางคนละแถวกัน
  // (มือถือยกลงไปแถวล่างเพื่อคืนความกว้างให้ชื่อสถานที่ ดูคอมเมนต์ที่แถวหลัก)
  const dwellControls = (
    <>
      <button
        onClick={() =>
          onUpdateDwell(Math.max(MIN_DWELL_MINUTES, sched.resolvedDwellMinutes - DWELL_STEP_MINUTES))
        }
        aria-label="ลดเวลาที่อยู่"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cream-soft text-base hover:bg-maple-soft sm:h-7 sm:w-7 sm:text-xs"
      >
        −
      </button>
      <span className="w-11 text-center tabular-nums">{sched.resolvedDwellMinutes} น.</span>
      <button
        onClick={() => onUpdateDwell(sched.resolvedDwellMinutes + DWELL_STEP_MINUTES)}
        aria-label="เพิ่มเวลาที่อยู่"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cream-soft text-base hover:bg-maple-soft sm:h-7 sm:w-7 sm:text-xs"
      >
        +
      </button>
    </>
  );

  const removeButton = (
    <button
      onClick={onRemoveStop}
      aria-label="เอาจุดแวะนี้ออก"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-cream-soft sm:h-7 sm:w-7 sm:text-xs"
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
      {!locked && (onInsertBefore || onInsertIntercityBefore) && (
        <div className="flex flex-wrap gap-x-3 bg-cream-soft/30 px-3 sm:px-4">
          {onInsertBefore && (
            <button
              onClick={onInsertBefore}
              className="py-2 text-[11px] font-medium text-maple hover:underline sm:py-1"
            >
              + แทรกร้านอาหารตรงนี้
            </button>
          )}
          {onInsertIntercityBefore && (
            <button
              onClick={onInsertIntercityBefore}
              className="py-2 text-[11px] font-medium text-pine-dark hover:underline sm:py-1"
            >
              + แทรกเดินทางข้ามเมืองตรงนี้
            </button>
          )}
        </div>
      )}
      {/* มือถือ: แถวนี้เหลือแค่ ที่จับลาก + เวลา + ชื่อ เพื่อให้ชื่อสถานที่ได้ความกว้างเต็ม
          (ของเดิมยัดปุ่มปรับเวลา/ลบไว้ด้วย ชื่อเลยเหลือ ~74px จาก 341px จนอ่านไม่ออก)
          ปุ่มที่ยกออกไปอยู่แถวโน้ตด้านล่างแทน · จอ sm ขึ้นไปยังเป็นแถวเดียวเหมือนเดิม */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {locked ? (
          <span
            aria-label="วันนี้ล็อกอยู่ ลากจัดลำดับไม่ได้"
            className="flex h-10 w-7 shrink-0 items-center justify-center text-xs text-ink-soft/40 sm:h-auto sm:w-auto sm:px-1 sm:py-2"
          >
            🔒
          </span>
        ) : (
          <button
            {...attributes}
            {...listeners}
            aria-label="ลากเพื่อจัดลำดับใหม่"
            style={{ touchAction: "none" }}
            className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded text-ink-soft/60 hover:bg-cream-soft hover:text-ink-soft active:cursor-grabbing sm:h-auto sm:w-auto sm:px-1 sm:py-2"
          >
            ⠿
          </button>
        )}

        <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-ink-soft sm:w-14">
          <div className="font-semibold text-ink">{sched.arrival}</div>
          <div>{sched.departure}</div>
        </div>

        {stop.kind === "intercity" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-lg">
              {INTERCITY_MODE_ICON[(stop.intercity_mode as IntercityMode) ?? "other"]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">
                {INTERCITY_MODE_LABEL[(stop.intercity_mode as IntercityMode) ?? "other"]} ·{" "}
                {stop.intercity_from} → {stop.intercity_to}
              </span>
              <span className="block truncate text-xs text-ink-soft">
                ใช้เวลาเดินทาง {sched.resolvedDwellMinutes} นาที
              </span>
            </span>
          </div>
        ) : (
          <button
            onClick={() => sched.place && onView()}
            disabled={!sched.place}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-default"
          >
            {sched.place ? (
              <>
                <PlaceThumb
                  query={sched.place.mapsQuery}
                  category={sched.place.category}
                  className="h-10 w-10 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink hover:underline">
                    {CATEGORY_EMOJI[sched.place.category]} {sched.place.nameTh}
                  </span>
                  {stop.added_by && (
                    <span className="block truncate text-xs text-ink-soft">เลือกโดย {stop.added_by}</span>
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
          <span className="hidden shrink-0 items-center text-xs tabular-nums text-ink-soft sm:flex lg:hidden">
            {sched.resolvedDwellMinutes} น.
          </span>
        ) : (
          <>
            <div className="hidden shrink-0 items-center gap-1 text-xs text-ink-soft sm:flex lg:hidden">
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
        {locked ? (
          stop.note ? (
            <span className="block text-xs italic text-ink-soft">📝 {stop.note}</span>
          ) : null
        ) : editingNote ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onUpdateNote(noteDraft.trim() || null);
                  setEditingNote(false);
                }
                if (e.key === "Escape") {
                  setNoteDraft(stop.note ?? "");
                  setEditingNote(false);
                }
              }}
              placeholder="จดโน้ตสั้นๆ เช่น ร้านนี้อร่อย รีบไป"
              className="min-w-0 flex-1 basis-full rounded-lg border border-cream-soft px-2 py-1.5 text-sm text-ink focus:border-maple focus:outline-none sm:basis-0 sm:py-1 sm:text-xs"
            />
            <button
              onClick={() => {
                onUpdateNote(noteDraft.trim() || null);
                setEditingNote(false);
              }}
              className="shrink-0 rounded-lg bg-pine px-2.5 py-1 text-xs font-medium text-cream hover:bg-pine-dark"
            >
              บันทึก
            </button>
            <button
              onClick={() => {
                setNoteDraft(stop.note ?? "");
                setEditingNote(false);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-cream-soft"
            >
              ยกเลิก
            </button>
            {stop.note && (
              <button
                onClick={() => {
                  onUpdateNote(null);
                  setNoteDraft("");
                  setEditingNote(false);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-maple-dark hover:bg-maple-soft"
              >
                ลบ
              </button>
            )}
          </div>
        ) : stop.note ? (
          <button
            onClick={() => {
              setNoteDraft(stop.note ?? "");
              setEditingNote(true);
            }}
            className="text-left text-xs italic text-ink-soft hover:text-ink"
          >
            📝 {stop.note}
          </button>
        ) : (
          <button
            onClick={() => setEditingNote(true)}
            className="py-1.5 text-xs text-ink-soft/60 hover:text-ink-soft"
          >
            + โน้ต
          </button>
        )}
        </div>
        {/* ปุ่มปรับเวลาที่อยู่ + ลบ — โชว์แถวนี้ตอนมือถือ และตอน lg ขึ้นไปที่มีแผนที่แย่งพื้นที่ด้วย (ดูคอมเมนต์บนแถวหลัก) — ซ่อนตอนกำลังพิมพ์โน้ตเพื่อไม่แย่งที่ช่องพิมพ์ */}
        {locked ? (
          <span className="flex shrink-0 items-center text-xs tabular-nums text-ink-soft sm:hidden lg:flex">
            อยู่ {sched.resolvedDwellMinutes} น.
          </span>
        ) : (
          !editingNote && (
            <div className="flex shrink-0 items-center gap-1 text-xs text-ink-soft sm:hidden lg:flex">
              {dwellControls}
              {removeButton}
            </div>
          )
        )}
      </div>
      {(stop.photo_url || (!locked && stop.kind !== "intercity")) && (
        <div className="px-3 pb-2 pl-10 sm:px-4 sm:pl-14">
          {stop.photo_url ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- รูปมาจาก Supabase Storage สาธารณะ ไม่ใช่ static asset */}
              <img
                src={stop.photo_url}
                alt="รูปหน้างานของจุดแวะนี้"
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
              {!locked && (
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
            stop.kind !== "intercity" && (
              <label className="inline-flex cursor-pointer items-center gap-1 py-1.5 text-xs text-ink-soft/60 hover:text-ink-soft">
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
    </div>
  );
}

export function DayStopsSection({
  day,
  stops,
  customPlaces,
  hotel,
  startHotel,
  returnTravelMode,
  onReturnTravelModeChange,
  startTime,
  onStartTimeChange,
  onRemoveStop,
  onUpdateDwell,
  onUpdateTravelMode,
  onUpdateNote,
  onUpdatePhoto,
  onReorder,
  onAddPlace,
  onInsertPlace,
  onInsertIntercity,
  flashStopId,
  onOvernightCityChange,
  locked,
  onToggleLock,
}: {
  day: Day;
  /** stops for this day only, already sorted by order_index */
  stops: TripStop[];
  customPlaces: CustomPlace[];
  /** ที่พักคืนนี้ = จุดจบของวัน */
  hotel: TripHotel | null;
  /** ที่พักคืนก่อนหน้า = จุดเริ่มของวัน (วันย้ายเมืองจะคนละที่กับ hotel) */
  startHotel: TripHotel | null;
  /** โหมดเดินทางขากลับที่พัก (จุดสุดท้าย → hotel) */
  returnTravelMode: TravelMode | null;
  onReturnTravelModeChange: (mode: TravelMode) => void;
  /** เวลาที่ออกจากที่พักที่ตั้งเองไว้ (ไม่ใช่เวลาถึงจุดแวะแรก) — null = ยังไม่เคยตั้ง ใช้ค่าเริ่มต้นของวันนั้น */
  startTime: string | null;
  onStartTimeChange: (value: string) => void;
  onReorder: (orderedStopIds: string[]) => void;
  /** มีค่าเฉพาะวันที่ยังเลือกเมืองนอนได้ (day.overnightOptions) */
  onOvernightCityChange?: (city: City) => void;
  onRemoveStop: (stopId: string) => void;
  onUpdateDwell: (stopId: string, minutes: number) => void;
  onUpdateTravelMode: (stopId: string, mode: TravelMode) => void;
  onUpdateNote: (stopId: string, note: string | null) => void;
  onUpdatePhoto: (stopId: string, photoUrl: string | null) => void;
  onAddPlace: () => void;
  /** เปิด modal หาร้านอาหารแทรกที่ตำแหน่ง atIndex ของวันนี้ ศูนย์กลางค้นหา = จุดก่อนหน้าตำแหน่งนั้น (หรือที่พัก/กลางเมืองถ้าแทรกก่อนจุดแรก) */
  onInsertPlace: (atIndex: number, center: { lat: number; lng: number }, prevPlace: Place | null) => void;
  /** เปิด modal แทรกเดินทางข้ามเมืองที่ตำแหน่ง atIndex ของวันนี้ พร้อมค่า default จาก/ไปเมือง */
  onInsertIntercity: (atIndex: number, fromDefault: string, toDefault: string) => void;
  /** id ของจุดแวะที่เพิ่งถูกเพิ่ม (ทั้งวันไหนก็ได้) — ใช้ไฮไลต์แถวนั้นสั้นๆ */
  flashStopId: string | null;
  /** true = วันนี้ลงตัวแล้ว ล็อกไว้กันเผลอลาก/แก้ตอนเลื่อนดู */
  locked: boolean;
  onToggleLock: () => void;
}) {
  // droppable ของทั้งวันนี้ — ใช้ตอนลากการ์ดจากคลัง sidebar มาวาง หรือลากจุดแวะข้ามมาจากวันอื่น
  // (การจัดลำดับ/ย้ายข้ามวันจริงๆ ถูกจัดการที่ DndContext ระดับบนสุดใน app/page.tsx)
  const { setNodeRef: setDayDroppableRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { type: "day", dayId: day.id },
    disabled: locked,
  });

  const dateLabel = new Date(day.date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
  const meta = CITY_META[day.city];

  // ศูนย์กลางค้นหาตอนแทรกร้านก่อนจุดแรกของวัน (ยังไม่มี "จุดก่อนหน้า" ให้อิง) — ที่พักคืนนั้นก่อน ไม่งั้นใช้กลางเมือง
  const centerBeforeFirstStop = hotel ? { lat: hotel.lat, lng: hotel.lng } : cityCenter(day.city);

  // ค่า default จาก/ไปของแถวเดินทางข้ามเมือง — เดาจาก city ของวันนี้ ไปเมืองที่นอนคืนนี้ (ถ้าต่างจากเมืองที่เที่ยว)
  const intercityFromDefault = CITY_NAME_TH[day.city];
  const intercityToDefault = CITY_NAME_TH[day.overnightCity ?? day.city];

  const {
    mealCount,
    placesById,
    startAnchor,
    endAnchor,
    startAnchorMode,
    openingHoursByQuery,
    beforeAnchorEvent,
    afterAnchorEvent,
    eventsBeforeStops,
    eventsAfterStops,
    defaultStartTime,
    effectiveStartTime,
    buildSchedule,
    daySchedule,
    schedule,
    deadlineOverrunMinutes,
    isTravelTimeReal,
    isClosedAt,
    closedStopIds,
    dominantMode,
    hasEstimatedLeg,
    firstPlace,
    lastPlace,
    showStartAnchorRow,
    showEndAnchorRow,
  } = useDaySchedule({ day, stops, customPlaces, hotel, startHotel, returnTravelMode, startTime });

  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [suggestingRoute, setSuggestingRoute] = useState(false);
  const viewSched = viewIndex != null ? schedule[viewIndex] : null;

  // ส่งให้แผนที่ใช้โชว์ในป๊อปอัพ (โน้ต + จุดที่จะไปตอนปิด)
  const notesByStopId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const stop of stops) map[stop.id] = stop.note;
    return map;
  }, [stops]);

  // ไฮไลต์สองทาง: คลิกหมุดบนแผนที่ ↔ คลิกชื่อสถานที่ในลิสต์ — แยกอิสระต่อวัน คนละหน้าที่กับ flashStopId (pulse ชั่วคราวตอนเพิ่งเพิ่มจุดแวะ)
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasMapPoints = schedule.some((s) => s.place != null);

  useEffect(() => {
    if (!activeStopId) return;
    rowRefs.current.get(activeStopId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeStopId]);

  return (
    <section
      className={`mb-5 overflow-hidden rounded-2xl border bg-white shadow-sm shadow-ink/5 ${
        locked ? "border-pine/40 ring-1 ring-pine/25" : "border-cream-soft"
      }`}
    >
      <div
        className="px-4 py-3 text-cream"
        style={{
          background: `linear-gradient(135deg, ${meta.color}, ${meta.colorDark})`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs opacity-80">
              {dateLabel} · วัน{day.weekdayTh}
            </div>
            <div className="text-lg font-bold">
              {meta.icon} {day.cityTh}
            </div>
          </div>
          {/* ล็อกวันที่ลงตัวแล้ว — กันเผลอลากจุดแวะหลุดตอนเลื่อนดูบนมือถือ */}
          <button
            onClick={onToggleLock}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              locked
                ? "bg-white text-ink"
                : "border border-white/30 bg-white/10 text-cream hover:bg-white/20"
            }`}
          >
            {locked ? "🔒 ล็อกไว้" : "🔓 ล็อกวันนี้"}
          </button>
        </div>
        {day.note && <div className="mt-1 text-xs leading-relaxed opacity-90">{day.note}</div>}
        {/* ชื่อโรงแรมจาก Google มักพ่วงที่อยู่เต็มมาด้วย บนมือถือกินไป 2-3 บรรทัดในหัวการ์ด — ตัดให้เหลือบรรทัดเดียว */}
        {hotel && (
          <div className="mt-1 truncate text-xs opacity-90" title={hotel.hotel_name}>
            🏨 พักที่ {hotel.hotel_name}
          </div>
        )}
        {day.overnightOptions && onOvernightCityChange && !locked && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs opacity-90">
            <span>🛏️ คืนนี้นอนที่</span>
            {day.overnightOptions.map((city) => {
              const active = (day.overnightCity ?? day.city) === city;
              return (
                <button
                  key={city}
                  onClick={() => onOvernightCityChange(city)}
                  className={`rounded-full px-2.5 py-1.5 font-medium sm:py-1 ${
                    active
                      ? "bg-white text-ink"
                      : "border border-white/30 bg-white/10 text-cream hover:bg-white/20"
                  }`}
                >
                  {CITY_META[city].icon} {CITY_NAME_TH[city]}
                  {city === day.overnightOptions?.[0] ? " (จองไว้)" : ""}
                </button>
              );
            })}
          </div>
        )}
        {day.noHotel ? (
          <div className="mt-1 text-xs opacity-90">🛫 วันเดินทาง — ไม่มีคืนที่ต้องจองที่พัก</div>
        ) : (
          <div className="mt-1 text-xs opacity-90">
            {mealCount > 0 ? `🍽️ วางมื้อไว้ ${mealCount} มื้อ` : "⚠️ ยังไม่มีมื้ออาหารวันนี้"}
          </div>
        )}
        {/* เวลาเริ่มนับตารางของวัน — ตั้งเองได้ทุกวันรวมวันบิน (ตารางบินยังล็อกอยู่ในแผงด้านล่าง)
            วันที่มีเหตุการณ์ตายตัวเป็นจุดเริ่ม (เช่น ถึงเมืองเก่าฮานอย 15:30) ใช้เวลานั้นเป็นค่าเริ่มต้นให้
            แต่ถ้าผ่าน ตม./รับกระเป๋าเร็วหรือช้ากว่าที่เผื่อไว้ ก็ปรับเองแล้วกด "กลับไปใช้เวลาแนะนำ" คืนได้ */}
        {locked ? (
          <div className="mt-2 text-xs opacity-90">🕐 ออกเดินทาง {effectiveStartTime} · 🔒 ล็อกไว้</div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-90">
            <label className="flex items-center gap-1.5">
              🕐 ออกเดินทาง
              <input
                type="time"
                value={effectiveStartTime}
                // กดปุ่ม ✕ ล้างช่องนี้ส่ง "" มา (browser native) — เดิมเขียนลง DB ตรงๆ แล้วพัง timeToMinutes
                // ทั้งวัน (บั๊ก 7.3) เพราะ start_time เป็นคอลัมน์ text ไม่ใช่ time เลยไม่มีด่านกันจากฝั่ง DB
                onChange={(e) => {
                  if (e.target.value) onStartTimeChange(e.target.value);
                }}
                className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-cream [color-scheme:dark] focus:border-gold focus:outline-none"
              />
            </label>
            {beforeAnchorEvent && (
              <span>
                (แนะนำ {beforeAnchorEvent.time} — ต่อจาก {beforeAnchorEvent.icon}{" "}
                {beforeAnchorEvent.title})
              </span>
            )}
            {startTime != null && startTime !== defaultStartTime && (
              <button
                onClick={() => onStartTimeChange(defaultStartTime)}
                className="underline hover:text-gold"
              >
                กลับไปใช้เวลาแนะนำ ({defaultStartTime})
              </button>
            )}
          </div>
        )}
      </div>

      {eventsBeforeStops && eventsBeforeStops.length > 0 && (
        <DayEventsPanel events={eventsBeforeStops} />
      )}

      {hasMapPoints && (
        <div className="flex gap-1 border-b border-cream-soft bg-cream-soft/30 px-3 pt-2 lg:hidden">
          <button
            onClick={() => setMobileView("list")}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${
              mobileView === "list" ? "bg-white text-ink" : "text-ink-soft"
            }`}
          >
            📋 รายการ
          </button>
          <button
            onClick={() => setMobileView("map")}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${
              mobileView === "map" ? "bg-white text-ink" : "text-ink-soft"
            }`}
          >
            🗺️ แผนที่
          </button>
        </div>
      )}
      {/* min-w-0 บนตัว flex item ฝั่งลิสต์สำคัญมาก — ไม่มีแล้วเนื้อหายาวๆ ในลิสต์จะดันแผนที่ทะลุออกนอกการ์ด */}
      <div className="lg:flex lg:items-start lg:gap-3 lg:px-3 lg:py-3">
        <div
          ref={setDayDroppableRef}
          className={`min-w-0 divide-y divide-cream-soft transition-colors lg:flex-1 ${
            mobileView === "list" ? "block" : "hidden"
          } lg:block ${isOver ? "bg-maple-soft/40 ring-2 ring-inset ring-maple" : ""}`}
        >
          {stops.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-ink-soft">
              {locked
                ? "วันนี้ล็อกไว้และยังไม่มีจุดแวะ — ปลดล็อกที่หัวการ์ดถ้าจะเพิ่ม"
                : "ยังไม่มีจุดแวะ — กดปุ่ม “+ เพิ่มสถานที่ให้วันนี้” ด้านล่าง หรือลากจากคลังบนจอใหญ่ก็ได้"}
            </div>
          )}
          {/* จุดเริ่มของวัน = ที่พักคืนก่อนหน้า (วันย้ายเมืองจะเป็นคนละที่กับที่พักคืนนี้) */}
          {showStartAnchorRow && startAnchor && (
            <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
              <span className="w-12 shrink-0 text-center font-semibold tabular-nums sm:w-14">
                {effectiveStartTime}
              </span>
              <span className="min-w-0 flex-1 truncate" title={startAnchor.label}>
                🏨 ออกจาก {startAnchor.label}
              </span>
            </div>
          )}
          {showStartAnchorRow && startAnchor && firstPlace && (
            <TravelModeRow
              key={`start-${startAnchorMode ?? "unset"}`}
              fromPlace={startAnchor}
              toPlace={firstPlace}
              mode={startAnchorMode}
              resolvedMinutes={daySchedule.travelMinutesFromStart ?? 0}
              isReal={isTravelTimeReal(startAnchor.id, firstPlace.id, startAnchorMode)}
              prefix="จากที่พัก"
              locked={locked}
              onSetMode={(mode) => onUpdateTravelMode(stops[0].id, mode)}
            />
          )}
          {stops.length > 0 && !locked && (
            <div className="flex flex-wrap gap-x-3 bg-cream-soft/30 px-3 sm:px-4">
              <button
                onClick={() => onInsertPlace(0, centerBeforeFirstStop, null)}
                className="py-2 text-[11px] font-medium text-maple hover:underline sm:py-1"
              >
                + แทรกร้านอาหารก่อนจุดแรก
              </button>
              <button
                onClick={() => onInsertIntercity(0, intercityFromDefault, intercityToDefault)}
                className="py-2 text-[11px] font-medium text-pine-dark hover:underline sm:py-1"
              >
                + แทรกเดินทางข้ามเมืองก่อนจุดแรก
              </button>
            </div>
          )}
          <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {schedule.map((sched, i) => {
              const stop = stops[i];
              const prevPlace = i > 0 ? schedule[i - 1].place : undefined;
              return (
                <SortableStopRow
                  key={stop.id}
                  stop={stop}
                  dayId={day.id}
                  index={i}
                  sched={sched}
                  prevPlace={prevPlace}
                  isFlashing={stop.id === flashStopId}
                  isActive={stop.id === activeStopId}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(stop.id, el);
                    else rowRefs.current.delete(stop.id);
                  }}
                  isTravelReal={
                    prevPlace != null &&
                    sched.place != null &&
                    isTravelTimeReal(prevPlace.id, sched.place.id, (stop.travel_mode as TravelMode | null) ?? null)
                  }
                  closedWarning={closedStopIds.has(stop.id)}
                  closedHoursLabel={
                    sched.place != null
                      ? weekdayHoursLabel(openingHoursByQuery.get(sched.place.mapsQuery), day.date)
                      : null
                  }
                  locked={locked}
                  onSetTravelMode={(mode) => onUpdateTravelMode(stop.id, mode)}
                  onView={() => {
                    setViewIndex(i);
                    setActiveStopId(stop.id);
                  }}
                  onUpdateDwell={(minutes) => onUpdateDwell(stop.id, minutes)}
                  onUpdateNote={(note) => onUpdateNote(stop.id, note)}
                  onUpdatePhoto={(photoUrl) => onUpdatePhoto(stop.id, photoUrl)}
                  onRemoveStop={() => onRemoveStop(stop.id)}
                  onInsertBefore={
                    i > 0 && prevPlace
                      ? () => onInsertPlace(i, { lat: prevPlace.lat, lng: prevPlace.lng }, prevPlace)
                      : undefined
                  }
                  onInsertIntercityBefore={
                    i > 0
                      ? () => onInsertIntercity(i, intercityFromDefault, intercityToDefault)
                      : undefined
                  }
                />
              );
            })}
          </SortableContext>

          {/* จุดจบของวัน = กลับไปนอนที่พักคืนนี้ */}
          {showEndAnchorRow && endAnchor && lastPlace && (
            <TravelModeRow
              key={`end-${returnTravelMode ?? "unset"}`}
              fromPlace={lastPlace}
              toPlace={endAnchor}
              mode={returnTravelMode}
              resolvedMinutes={daySchedule.travelMinutesToEnd ?? 0}
              isReal={isTravelTimeReal(lastPlace.id, endAnchor.id, returnTravelMode)}
              prefix="กลับที่พัก"
              locked={locked}
              onSetMode={onReturnTravelModeChange}
            />
          )}
          {showEndAnchorRow && endAnchor && (
            <div className="flex items-center gap-2 bg-pine-soft/40 px-3 py-2 text-xs text-pine-dark sm:px-4">
              <span className="w-12 shrink-0 text-center font-semibold tabular-nums sm:w-14">
                {daySchedule.arriveBackAt}
              </span>
              <span className="min-w-0 flex-1 truncate" title={endAnchor.label}>
                🏨 กลับถึง {endAnchor.label}
              </span>
            </div>
          )}

          {locked ? (
            <button
              onClick={onToggleLock}
              className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-ink-soft hover:bg-cream-soft/60"
            >
              🔒 วันนี้ล็อกไว้ — แตะเพื่อปลดล็อกและแก้ไข
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                onClick={onAddPlace}
                className="flex flex-1 items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-maple hover:bg-maple-soft/40"
              >
                + เพิ่มสถานที่ให้วันนี้
              </button>
              {stops.length >= 3 && (
                <button
                  onClick={() => setSuggestingRoute(true)}
                  className="px-4 py-3 text-sm font-medium text-pine-dark hover:bg-pine-soft/40"
                >
                  ✨ ลองจัดเส้นทางใหม่
                </button>
              )}
            </div>
          )}
        </div>

        {hasMapPoints && (
          <div
            className={`h-72 px-3 pb-3 pt-3 lg:h-[420px] lg:w-72 lg:shrink-0 lg:px-0 lg:pb-0 lg:pt-0 ${
              mobileView === "map" ? "block" : "hidden"
            } lg:block`}
          >
            <DayMapPanel
              schedule={schedule}
              startHotel={startHotel}
              endHotel={hotel}
              notesByStopId={notesByStopId}
              closedStopIds={closedStopIds}
              activeStopId={activeStopId}
              onSelectStop={setActiveStopId}
              onOpenDetail={(stopId) => {
                const index = schedule.findIndex((s) => s.id === stopId);
                if (index >= 0) setViewIndex(index);
              }}
              className="h-full"
            />
          </div>
        )}
      </div>

      {hasMapPoints && (
        <DaySummaryBar
          schedule={daySchedule}
          startHotel={startHotel}
          endHotel={hotel}
          dominantMode={dominantMode}
          hasEstimatedLeg={hasEstimatedLeg}
        />
      )}

      {deadlineOverrunMinutes != null && afterAnchorEvent && (
        <div className="bg-maple-soft/70 px-4 py-2 text-xs text-maple-dark">
          ⚠️ ตารางที่วางไว้จบช้ากว่ากำหนด &quot;{afterAnchorEvent.title}&quot; ({afterAnchorEvent.time}) ไป{" "}
          {deadlineOverrunMinutes} นาที ลองลดเวลาที่อยู่บางจุดหรือตัดบางจุดออก
        </div>
      )}

      {eventsAfterStops.length > 0 && (
        <DayEventsPanel events={eventsAfterStops} heading="✈️ ต่อจากนั้น" />
      )}

      {suggestingRoute && (
        <RouteSuggestionModal
          stops={stops}
          placesById={placesById}
          startAt={startAnchor}
          endAt={endAnchor}
          buildSchedule={buildSchedule}
          isClosedAt={isClosedAt}
          onApply={onReorder}
          onClose={() => setSuggestingRoute(false)}
        />
      )}

      {viewSched?.place && (
        <PlaceDetailModal
          place={viewSched.place}
          previousPlace={
            viewIndex != null && viewIndex > 0 ? schedule[viewIndex - 1].place ?? null : null
          }
          hotel={hotel}
          onClose={() => setViewIndex(null)}
        />
      )}
    </section>
  );
}
