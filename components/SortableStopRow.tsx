"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, Place } from "@/data/places";
import { BOOKING_FILES_BUCKET, supabase, type TripStop } from "@/lib/supabase";
import type { ScheduledStop, TravelMode } from "@/lib/schedule";
import { computeDepartureAdvice } from "@/lib/departureAdvice";
import { placeQueryKey } from "@/lib/placeQuery";
import { InsertBetweenRow } from "./InsertBetweenRow";
import { PlaceThumb } from "./PlaceThumb";
import { TravelModeRow } from "./TravelModeRow";
import { TransferAdvicePanel } from "./TransferAdvicePanel";
import { INTERCITY_MODE_ICON, INTERCITY_MODE_LABEL, type IntercityMode } from "./IntercityEditModal";

const DWELL_STEP_MINUTES = 15;
const MIN_DWELL_MINUTES = 15;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BOOKING_FILES_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

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
        ) : stop.kind === "hotel" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-lg">
              🏨
            </span>
            <span className="min-w-0 flex-1">
              {/* ชื่อโรงแรมมาจาก trip_hotels สดๆ ไม่ใช่จาก place_id — เปลี่ยนโรงแรมแล้วแถวนี้เปลี่ยนตาม */}
              <span className="block truncate font-semibold text-ink">
                แวะที่พัก · {hotelName ?? "ยังไม่ได้ตั้งที่พักของช่วงนี้"}
              </span>
              <span className="block truncate text-xs text-ink-soft">
                อยู่ที่พัก {sched.resolvedDwellMinutes} นาที (เช็คอิน / ฝากกระเป๋า / พัก)
              </span>
            </span>
          </div>
        ) : stop.kind === "transfer" ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pine-soft/50 text-lg">
              ✈️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">
                ไปสนามบิน/สถานี · {sched.place?.nameTh ?? "ไม่พบข้อมูลปลายทาง"}
              </span>
              <span className="block truncate text-xs text-ink-soft">
                เผื่อเวลาที่นั่น {sched.resolvedDwellMinutes} นาที
                {stop.transfer_target_label ? ` · ${stop.transfer_target_label}` : ""}
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
                  query={placeQueryKey(sched.place)}
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
      {stop.kind === "transfer" && sched.place && (
        <TransferAdvicePanel
          advice={transferAdvice}
          targetLabel={stop.transfer_target_label ?? null}
          airportId={sched.place.id}
          checkinBufferMinutes={sched.resolvedDwellMinutes}
          travelMinutes={travelMinutesIn}
          isTravelReal={isTravelReal}
        />
      )}
      {(stop.photo_url || (!locked && !isSpecialRow)) && (
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
            !isSpecialRow && (
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
