"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, Place } from "@/data/places";
import type { Day } from "@/data/itinerary";
import { CITY_META } from "@/data/itinerary";
import type { CustomPlace, TripHotel, TripStop } from "@/lib/supabase";
import { resolvePlace } from "@/lib/resolvePlace";
import { haversineKm } from "@/lib/geo";
import {
  computeSchedule,
  estimateTravelMinutes,
  estimateTravelMinutesBetween,
  TRAVEL_MODES,
  TRAVEL_MODE_EMOJI,
  TRAVEL_MODE_LABEL,
  type ScheduleStopInput,
  type ScheduledStop,
  type TravelMode,
} from "@/lib/schedule";
import { PlaceDetailModal } from "./PlaceDetailModal";

const DWELL_STEP_MINUTES = 15;
const MIN_DWELL_MINUTES = 15;

function TravelModeRow({
  fromPlace,
  toPlace,
  mode,
  resolvedMinutes,
  onSetMode,
}: {
  fromPlace: Place;
  toPlace: Place;
  mode: TravelMode | null;
  /** เวลาที่ schedule คำนวณจริงไว้แล้ว (ตรงกับ mode ปัจจุบัน) ใช้โชว์ตอนเลือกโหมดแล้ว */
  resolvedMinutes: number;
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
          {TRAVEL_MODE_EMOJI[mode]} {TRAVEL_MODE_LABEL[mode]} ~{resolvedMinutes} นาทีเดินทาง
          (ประมาณการ)
        </span>
        <button
          onClick={() => setPicking(true)}
          className="font-medium text-pine-dark underline hover:text-pine"
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-cream-soft/60 px-4 py-1.5 text-[11px] text-ink-soft">
      <span>เดินทางแบบไหน:</span>
      {TRAVEL_MODES.map((m) => (
        <button
          key={m}
          onClick={() => onSetMode(m)}
          className="rounded-full border border-cream-soft bg-white px-2 py-0.5 text-ink hover:border-maple/40"
        >
          {TRAVEL_MODE_EMOJI[m]} {TRAVEL_MODE_LABEL[m]} ~{estimateTravelMinutes(distanceKm, m)} น.
        </button>
      ))}
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
  onSetTravelMode,
  onView,
  onUpdateDwell,
  onRemoveStop,
}: {
  stop: TripStop;
  dayId: string;
  index: number;
  sched: ScheduledStop;
  prevPlace: Place | undefined;
  isFlashing: boolean;
  onSetTravelMode: (mode: TravelMode) => void;
  onView: () => void;
  onUpdateDwell: (minutes: number) => void;
  onRemoveStop: () => void;
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

  return (
    <div ref={setNodeRef} style={style} className={isFlashing ? "animate-stop-added" : undefined}>
      {index > 0 && prevPlace && sched.place && sched.travelMinutesFromPrev != null && (
        <TravelModeRow
          key={stop.travel_mode ?? "unset"}
          fromPlace={prevPlace}
          toPlace={sched.place}
          mode={(stop.travel_mode as TravelMode | null) ?? null}
          resolvedMinutes={sched.travelMinutesFromPrev}
          onSetMode={onSetTravelMode}
        />
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          {...attributes}
          {...listeners}
          aria-label="ลากเพื่อจัดลำดับใหม่"
          style={{ touchAction: "none" }}
          className="shrink-0 cursor-grab rounded px-1 py-2 text-ink-soft/60 hover:bg-cream-soft hover:text-ink-soft active:cursor-grabbing"
        >
          ⠿
        </button>

        <div className="w-14 shrink-0 text-center text-[11px] leading-tight text-ink-soft">
          <div className="font-semibold text-ink">{sched.arrival}</div>
          <div>{sched.departure}</div>
        </div>

        <button
          onClick={() => sched.place && onView()}
          disabled={!sched.place}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          {sched.place ? (
            <>
              <div className="truncate font-semibold text-ink hover:underline">
                {CATEGORY_EMOJI[sched.place.category]} {sched.place.nameTh}
              </div>
              {stop.added_by && (
                <div className="text-xs text-ink-soft">เลือกโดย {stop.added_by}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-maple-dark">ไม่พบข้อมูลสถานที่</div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
          <button
            onClick={() =>
              onUpdateDwell(Math.max(MIN_DWELL_MINUTES, sched.resolvedDwellMinutes - DWELL_STEP_MINUTES))
            }
            aria-label="ลดเวลาที่อยู่"
            className="rounded-full bg-cream-soft px-1.5 py-0.5 hover:bg-maple-soft"
          >
            −
          </button>
          <span className="w-11 text-center">{sched.resolvedDwellMinutes} น.</span>
          <button
            onClick={() => onUpdateDwell(sched.resolvedDwellMinutes + DWELL_STEP_MINUTES)}
            aria-label="เพิ่มเวลาที่อยู่"
            className="rounded-full bg-cream-soft px-1.5 py-0.5 hover:bg-maple-soft"
          >
            +
          </button>
        </div>

        <button
          onClick={onRemoveStop}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-cream-soft"
        >
          ✕
        </button>
      </div>
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
  onAddPlace,
  flashStopId,
}: {
  day: Day;
  /** stops for this day only, already sorted by order_index */
  stops: TripStop[];
  customPlaces: CustomPlace[];
  hotel: TripHotel | null;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  onRemoveStop: (stopId: string) => void;
  onUpdateDwell: (stopId: string, minutes: number) => void;
  onUpdateTravelMode: (stopId: string, mode: TravelMode) => void;
  onAddPlace: () => void;
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

  const placesById = useMemo(() => {
    const map = new Map<string, Place>();
    for (const stop of stops) {
      const place = resolvePlace(stop.place_id, customPlaces);
      if (place) map.set(stop.place_id, place);
    }
    return map;
  }, [stops, customPlaces]);

  const schedule = useMemo(() => {
    const inputs: ScheduleStopInput[] = stops.map((s) => ({
      id: s.id,
      placeId: s.place_id,
      dwellMinutes: s.dwell_minutes,
      travelMode: (s.travel_mode as TravelMode | null) ?? null,
    }));
    return computeSchedule(startTime, inputs, placesById, (fromId, toId, mode) => {
      const from = placesById.get(fromId);
      const to = placesById.get(toId);
      return from && to ? estimateTravelMinutesBetween(from, to, mode) : null;
    });
  }, [stops, placesById, startTime]);

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
        {hotel && <div className="mt-1 text-xs opacity-90">🏨 พักที่ {hotel.hotel_name}</div>}
        <label className="mt-2 flex w-fit items-center gap-1.5 text-xs opacity-90">
          🕐 ออกเดินทาง
          <input
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className="rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-cream [color-scheme:dark] focus:border-gold focus:outline-none"
          />
        </label>
      </div>

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
                onSetTravelMode={(mode) => onUpdateTravelMode(stop.id, mode)}
                onView={() => setViewIndex(i)}
                onUpdateDwell={(minutes) => onUpdateDwell(stop.id, minutes)}
                onRemoveStop={() => onRemoveStop(stop.id)}
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
