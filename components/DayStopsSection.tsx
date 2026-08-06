"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, cityCenter, Place } from "@/data/places";
import type { City, Day, DayEvent } from "@/data/itinerary";
import { CITY_META, CITY_NAME_TH } from "@/data/itinerary";
import type { CustomPlace, TripHotel, TripStop } from "@/lib/supabase";
import { resolvePlace } from "@/lib/resolvePlace";
import { haversineKm } from "@/lib/geo";
import {
  computeSchedule,
  estimateTravelMinutes,
  estimateTravelMinutesBetween,
  timeToMinutes,
  TRAVEL_MODES,
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  type ScheduleStopInput,
  type ScheduledStop,
  type TravelMode,
} from "@/lib/schedule";
import { useDayTravelTimes, type TravelTimePair } from "@/hooks/useDayTravelTimes";
import { useDayOpeningHours } from "@/hooks/useDayOpeningHours";
import { isOpenDuring, weekdayHoursLabel } from "@/lib/openingHours";
import { PlaceDetailModal } from "./PlaceDetailModal";

const DWELL_STEP_MINUTES = 15;
const MIN_DWELL_MINUTES = 15;

function TravelModeRow({
  fromPlace,
  toPlace,
  mode,
  resolvedMinutes,
  isReal,
  onSetMode,
}: {
  fromPlace: Place;
  toPlace: Place;
  mode: TravelMode | null;
  /** เวลาที่ schedule คำนวณจริงไว้แล้ว (ตรงกับ mode ปัจจุบัน) ใช้โชว์ตอนเลือกโหมดแล้ว */
  resolvedMinutes: number;
  /** true = เวลาจริงจาก Google Routes API, false = ยังเป็นเส้นตรง haversine ประมาณการ */
  isReal: boolean;
  onSetMode: (mode: TravelMode) => void;
}) {
  // key={mode} จากผู้เรียก (ดูด้านล่าง) ทำให้ component นี้ remount ใหม่ทุกครั้งที่ mode เปลี่ยน
  // (เลือกครั้งแรก / เปลี่ยนโหมด / อีกคน sync มา) picking เลยรีเซ็ตอัตโนมัติโดยไม่ต้องใช้ effect
  const [picking, setPicking] = useState(mode == null);

  const distanceKm = haversineKm(fromPlace.lat, fromPlace.lng, toPlace.lat, toPlace.lng);

  if (mode && !picking) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 bg-cream-soft/60 px-4 py-1.5 text-[11px] text-ink-soft">
        <span>
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
      <span>เดินทางแบบไหน:</span>
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

/** เที่ยวบิน/เดดไลน์ของวันนั้น — เวลาตายตัว จองมาแล้ว แก้ในเว็บไม่ได้ เลยแสดงแยกจากจุดแวะที่ลากจัดลำดับได้ */
function DayEventsPanel({
  events,
  heading = "✈️ ตารางบิน/เวลาตายตัวของวันนี้",
}: {
  events: DayEvent[];
  heading?: string;
}) {
  return (
    <div className="border-b border-cream-soft bg-cream-soft/40">
      <div className="px-4 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        {heading}
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
  isTravelReal,
  closedWarning,
  closedHoursLabel,
  onSetTravelMode,
  onView,
  onUpdateDwell,
  onUpdateNote,
  onRemoveStop,
  onInsertBefore,
}: {
  stop: TripStop;
  dayId: string;
  index: number;
  sched: ScheduledStop;
  prevPlace: Place | undefined;
  isFlashing: boolean;
  isTravelReal: boolean;
  /** true = เวลาที่คำนวณได้ (ถึง-ออก) ตกนอกเวลาเปิดของสถานที่นี้ ตามข้อมูลจาก Google */
  closedWarning: boolean;
  /** ข้อความเวลาเปิด-ปิดของวันนั้นจาก Google (เช่น "วันจันทร์: 9:00–18:00") โชว์คู่กับ closedWarning ให้รู้ว่าเปิดกี่โมงจริงๆ */
  closedHoursLabel: string | null;
  onSetTravelMode: (mode: TravelMode) => void;
  onView: () => void;
  onUpdateDwell: (minutes: number) => void;
  onUpdateNote: (note: string | null) => void;
  onRemoveStop: () => void;
  /** เปิด modal หาร้านอาหารแทรกก่อนจุดแวะนี้ — undefined เมื่อเป็นจุดแวะแรกของวัน (ยังไม่มี "ก่อนหน้า" ให้อ้างอิง) */
  onInsertBefore: (() => void) | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
    data: { type: "stop", dayId },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(stop.note ?? "");

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
    <div ref={setNodeRef} style={style} className={isFlashing ? "animate-stop-added" : undefined}>
      {index > 0 && prevPlace && sched.place && sched.travelMinutesFromPrev != null && (
        <TravelModeRow
          key={stop.travel_mode ?? "unset"}
          fromPlace={prevPlace}
          toPlace={sched.place}
          mode={(stop.travel_mode as TravelMode | null) ?? null}
          resolvedMinutes={sched.travelMinutesFromPrev}
          isReal={isTravelReal}
          onSetMode={onSetTravelMode}
        />
      )}
      {/* แทรกร้านอาหารกลางวันได้เลย ไม่ต้องเพิ่มท้ายวันแล้วลากขึ้นมาเอง — ศูนย์กลางค้นหาอิงจุดก่อนหน้าตรงนี้ */}
      {onInsertBefore && (
        <div className="bg-cream-soft/30 px-3 sm:px-4">
          <button
            onClick={onInsertBefore}
            className="py-2 text-[11px] font-medium text-maple hover:underline sm:py-1"
          >
            + แทรกร้านอาหารตรงนี้
          </button>
        </div>
      )}
      {/* มือถือ: แถวนี้เหลือแค่ ที่จับลาก + เวลา + ชื่อ เพื่อให้ชื่อสถานที่ได้ความกว้างเต็ม
          (ของเดิมยัดปุ่มปรับเวลา/ลบไว้ด้วย ชื่อเลยเหลือ ~74px จาก 341px จนอ่านไม่ออก)
          ปุ่มที่ยกออกไปอยู่แถวโน้ตด้านล่างแทน · จอ sm ขึ้นไปยังเป็นแถวเดียวเหมือนเดิม */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <button
          {...attributes}
          {...listeners}
          aria-label="ลากเพื่อจัดลำดับใหม่"
          style={{ touchAction: "none" }}
          className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded text-ink-soft/60 hover:bg-cream-soft hover:text-ink-soft active:cursor-grabbing sm:h-auto sm:w-auto sm:px-1 sm:py-2"
        >
          ⠿
        </button>

        <div className="w-12 shrink-0 text-center text-[11px] leading-tight text-ink-soft sm:w-14">
          <div className="font-semibold text-ink">{sched.arrival}</div>
          <div>{sched.departure}</div>
        </div>

        <button
          onClick={() => sched.place && onView()}
          disabled={!sched.place}
          className="min-w-0 flex-1 py-1.5 text-left disabled:cursor-default"
        >
          {sched.place ? (
            <>
              <div className="truncate font-semibold text-ink hover:underline">
                {CATEGORY_EMOJI[sched.place.category]} {sched.place.nameTh}
              </div>
              {stop.added_by && (
                <div className="truncate text-xs text-ink-soft">เลือกโดย {stop.added_by}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-maple-dark">ไม่พบข้อมูลสถานที่</div>
          )}
        </button>

        <div className="hidden shrink-0 items-center gap-1 text-xs text-ink-soft sm:flex">
          {dwellControls}
        </div>
        <div className="hidden sm:block">{removeButton}</div>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2 pl-10 sm:px-4 sm:pl-14">
        <div className="min-w-0 flex-1">
        {/* มือถือ: ช่องพิมพ์โน้ตกินเต็มบรรทัด ปุ่มบันทึก/ยกเลิก/ลบ ตกไปบรรทัดล่าง
            (ของเดิมทุกอย่างอยู่แถวเดียว ช่องพิมพ์เลยแคบจนพิมพ์ไม่ได้จริง) */}
        {editingNote ? (
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
        {/* ปุ่มปรับเวลาที่อยู่ + ลบ ของฝั่งมือถือ — ซ่อนตอนกำลังพิมพ์โน้ตเพื่อไม่แย่งที่ช่องพิมพ์ */}
        {!editingNote && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-ink-soft sm:hidden">
            {dwellControls}
            {removeButton}
          </div>
        )}
      </div>
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
  startTime,
  onStartTimeChange,
  onRemoveStop,
  onUpdateDwell,
  onUpdateTravelMode,
  onUpdateNote,
  onAddPlace,
  onInsertPlace,
  flashStopId,
  onOvernightCityChange,
}: {
  day: Day;
  /** stops for this day only, already sorted by order_index */
  stops: TripStop[];
  customPlaces: CustomPlace[];
  hotel: TripHotel | null;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  /** มีค่าเฉพาะวันที่ยังเลือกเมืองนอนได้ (day.overnightOptions) */
  onOvernightCityChange?: (city: City) => void;
  onRemoveStop: (stopId: string) => void;
  onUpdateDwell: (stopId: string, minutes: number) => void;
  onUpdateTravelMode: (stopId: string, mode: TravelMode) => void;
  onUpdateNote: (stopId: string, note: string | null) => void;
  onAddPlace: () => void;
  /** เปิด modal หาร้านอาหารแทรกที่ตำแหน่ง atIndex ของวันนี้ ศูนย์กลางค้นหา = จุดก่อนหน้าตำแหน่งนั้น (หรือที่พัก/กลางเมืองถ้าแทรกก่อนจุดแรก) */
  onInsertPlace: (atIndex: number, center: { lat: number; lng: number }, prevPlace: Place | null) => void;
  /** id ของจุดแวะที่เพิ่งถูกเพิ่ม (ทั้งวันไหนก็ได้) — ใช้ไฮไลต์แถวนั้นสั้นๆ */
  flashStopId: string | null;
}) {
  // droppable ของทั้งวันนี้ — ใช้ตอนลากการ์ดจากคลัง sidebar มาวาง หรือลากจุดแวะข้ามมาจากวันอื่น
  // (การจัดลำดับ/ย้ายข้ามวันจริงๆ ถูกจัดการที่ DndContext ระดับบนสุดใน app/page.tsx)
  const { setNodeRef: setDayDroppableRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: { type: "day", dayId: day.id },
  });

  const dateLabel = new Date(day.date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
  const meta = CITY_META[day.city];

  // ศูนย์กลางค้นหาตอนแทรกร้านก่อนจุดแรกของวัน (ยังไม่มี "จุดก่อนหน้า" ให้อิง) — ที่พักคืนนั้นก่อน ไม่งั้นใช้กลางเมือง
  const centerBeforeFirstStop = hotel ? { lat: hotel.lat, lng: hotel.lng } : cityCenter(day.city);

  const mealCount = useMemo(
    () =>
      stops.filter((s) => resolvePlace(s.place_id, customPlaces)?.category === "restaurant").length,
    [stops, customPlaces]
  );

  const placesById = useMemo(() => {
    const map = new Map<string, Place>();
    for (const stop of stops) {
      const place = resolvePlace(stop.place_id, customPlaces);
      if (place) map.set(stop.place_id, place);
    }
    return map;
  }, [stops, customPlaces]);

  // คู่จุดที่เลือกโหมดเดินทางแล้วเท่านั้นที่ต้องขอเวลาจริง — คู่ที่ยังไม่เลือกโหมดใช้แค่ตัวเลือกในหน้า picker
  const travelPairs = useMemo(() => {
    const pairs: TravelTimePair[] = [];
    for (let i = 1; i < stops.length; i++) {
      const mode = stops[i].travel_mode as TravelMode | null;
      if (!mode) continue;
      const from = placesById.get(stops[i - 1].place_id);
      const to = placesById.get(stops[i].place_id);
      if (!from || !to) continue;
      pairs.push({
        fromId: from.id,
        toId: to.id,
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        mode,
      });
    }
    return pairs;
  }, [stops, placesById]);

  const realTravelTimes = useDayTravelTimes(travelPairs);

  const mapsQueries = useMemo(
    () => Array.from(new Set(Array.from(placesById.values()).map((p) => p.mapsQuery))),
    [placesById]
  );
  const openingHoursByQuery = useDayOpeningHours(mapsQueries);

  // เหตุการณ์ตายตัว (เที่ยวบิน ฯลฯ) แบ่งเป็นก่อน/หลังช่วงว่างที่แทรกจุดแวะได้ ด้วย anchor "before"/"after"
  // (ดู DayEvent ใน data/itinerary.ts) — ถ้าวันนี้ไม่มี anchor เลย events ทั้งหมดจะแสดงเหนือจุดแวะเหมือนเดิม
  const beforeAnchorEvent = day.events?.find((e) => e.anchor === "before");
  const afterAnchorEvent = day.events?.find((e) => e.anchor === "after");
  const beforeAnchorIndex = beforeAnchorEvent ? day.events!.indexOf(beforeAnchorEvent) : -1;
  const eventsBeforeStops = beforeAnchorIndex >= 0 ? day.events!.slice(0, beforeAnchorIndex + 1) : day.events;
  const eventsAfterStops = beforeAnchorIndex >= 0 ? day.events!.slice(beforeAnchorIndex + 1) : [];

  // วันที่มีเหตุการณ์ตายตัวเป็นจุดเริ่ม (เช่น ถึงย่านเมืองเก่า 15:30) ใช้เวลานั้นนับตารางจุดแวะแทน
  // เวลา "ออกเดินทาง" ที่ตั้งเองได้ — กันไม่ให้ตารางจุดแวะเริ่มก่อนที่จะถึงจริงๆ
  const effectiveStartTime = beforeAnchorEvent?.time ?? startTime;

  const schedule = useMemo(() => {
    const inputs: ScheduleStopInput[] = stops.map((s) => ({
      id: s.id,
      placeId: s.place_id,
      dwellMinutes: s.dwell_minutes,
      travelMode: (s.travel_mode as TravelMode | null) ?? null,
    }));
    return computeSchedule(effectiveStartTime, inputs, placesById, (fromId, toId, mode) => {
      const from = placesById.get(fromId);
      const to = placesById.get(toId);
      if (!from || !to) return null;
      if (mode) {
        const real = realTravelTimes.get(`${fromId}|${toId}|${mode}`);
        if (real?.minutes != null) return real.minutes;
      }
      return estimateTravelMinutesBetween(from, to, mode);
    });
  }, [stops, placesById, effectiveStartTime, realTravelTimes]);

  // จุดแวะวันนี้จบช้ากว่าเดดไลน์ตายตัว (เช่น ต้องออกไปขึ้นเครื่อง) ไปกี่นาที — null ถ้าไม่มีเดดไลน์หรือยังไม่เลย
  const deadlineOverrunMinutes = useMemo(() => {
    if (!afterAnchorEvent || schedule.length === 0) return null;
    const lastDeparture = schedule[schedule.length - 1].departure;
    const over = timeToMinutes(lastDeparture) - timeToMinutes(afterAnchorEvent.time);
    return over > 0 ? over : null;
  }, [afterAnchorEvent, schedule]);

  const isTravelTimeReal = (fromId: string, toId: string, mode: TravelMode | null) =>
    mode != null && realTravelTimes.get(`${fromId}|${toId}|${mode}`)?.minutes != null;

  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const viewSched = viewIndex != null ? schedule[viewIndex] : null;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-cream-soft bg-white shadow-sm shadow-ink/5">
      <div
        className="px-4 py-3 text-cream"
        style={{
          background: `linear-gradient(135deg, ${meta.color}, ${meta.colorDark})`,
        }}
      >
        <div className="text-xs opacity-80">
          {dateLabel} · วัน{day.weekdayTh}
        </div>
        <div className="text-lg font-bold">
          {meta.icon} {day.cityTh}
        </div>
        {day.note && <div className="mt-1 text-xs leading-relaxed opacity-90">{day.note}</div>}
        {/* ชื่อโรงแรมจาก Google มักพ่วงที่อยู่เต็มมาด้วย บนมือถือกินไป 2-3 บรรทัดในหัวการ์ด — ตัดให้เหลือบรรทัดเดียว */}
        {hotel && (
          <div className="mt-1 truncate text-xs opacity-90" title={hotel.hotel_name}>
            🏨 พักที่ {hotel.hotel_name}
          </div>
        )}
        {day.overnightOptions && onOvernightCityChange && (
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
        {beforeAnchorEvent ? (
          <div className="mt-2 text-xs opacity-90">
            🕐 เริ่มนับเวลาจุดแวะอัตโนมัติจาก {beforeAnchorEvent.icon} {beforeAnchorEvent.title} (
            {beforeAnchorEvent.time}) — เวลาบินแก้ไม่ได้
          </div>
        ) : (
          <label className="mt-2 flex w-fit items-center gap-1.5 text-xs opacity-90">
            🕐 ออกเดินทาง
            <input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(e.target.value)}
              className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-cream [color-scheme:dark] focus:border-gold focus:outline-none"
            />
          </label>
        )}
      </div>

      {eventsBeforeStops && eventsBeforeStops.length > 0 && (
        <DayEventsPanel events={eventsBeforeStops} />
      )}

      <div
        ref={setDayDroppableRef}
        className={`divide-y divide-cream-soft transition-colors ${
          isOver ? "bg-maple-soft/40 ring-2 ring-inset ring-maple" : ""
        }`}
      >
        {stops.length === 0 && (
          <div className="px-4 py-5 text-center text-sm text-ink-soft">
            ยังไม่มีจุดแวะ — ลากสถานที่จากคลังด้านข้างมาวางที่นี่ได้เลย
          </div>
        )}
        {stops.length > 0 && (
          <div className="bg-cream-soft/30 px-3 sm:px-4">
            <button
              onClick={() => onInsertPlace(0, centerBeforeFirstStop, null)}
              className="py-2 text-[11px] font-medium text-maple hover:underline sm:py-1"
            >
              + แทรกร้านอาหารก่อนจุดแรก
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
                isTravelReal={
                  prevPlace != null &&
                  sched.place != null &&
                  isTravelTimeReal(prevPlace.id, sched.place.id, (stop.travel_mode as TravelMode | null) ?? null)
                }
                closedWarning={
                  sched.place != null &&
                  isOpenDuring(
                    openingHoursByQuery.get(sched.place.mapsQuery),
                    day.date,
                    sched.arrival,
                    sched.departure
                  ) === false
                }
                closedHoursLabel={
                  sched.place != null
                    ? weekdayHoursLabel(openingHoursByQuery.get(sched.place.mapsQuery), day.date)
                    : null
                }
                onSetTravelMode={(mode) => onUpdateTravelMode(stop.id, mode)}
                onView={() => setViewIndex(i)}
                onUpdateDwell={(minutes) => onUpdateDwell(stop.id, minutes)}
                onUpdateNote={(note) => onUpdateNote(stop.id, note)}
                onRemoveStop={() => onRemoveStop(stop.id)}
                onInsertBefore={
                  i > 0 && prevPlace
                    ? () => onInsertPlace(i, { lat: prevPlace.lat, lng: prevPlace.lng }, prevPlace)
                    : undefined
                }
              />
            );
          })}
        </SortableContext>

        <button
          onClick={onAddPlace}
          className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-medium text-maple hover:bg-maple-soft/40"
        >
          + เพิ่มสถานที่ให้วันนี้
        </button>
      </div>

      {deadlineOverrunMinutes != null && afterAnchorEvent && (
        <div className="bg-maple-soft/70 px-4 py-2 text-xs text-maple-dark">
          ⚠️ ตารางที่วางไว้จบช้ากว่ากำหนด &quot;{afterAnchorEvent.title}&quot; ({afterAnchorEvent.time}) ไป{" "}
          {deadlineOverrunMinutes} นาที ลองลดเวลาที่อยู่บางจุดหรือตัดบางจุดออก
        </div>
      )}

      {eventsAfterStops.length > 0 && (
        <DayEventsPanel events={eventsAfterStops} heading="✈️ ต่อจากนั้น" />
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
