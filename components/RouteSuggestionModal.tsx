"use client";

import { useMemo, useState } from "react";
import { CATEGORY_EMOJI, type Place } from "@/data/places";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { TripStop } from "@/lib/supabase";
import type { DaySchedule } from "@/lib/schedule";
import { routeDistanceKm, suggestOrder, type RoutePoint } from "@/lib/optimizeRoute";

function totalTravelMinutes(schedule: DaySchedule): number {
  return (
    (schedule.travelMinutesFromStart ?? 0) +
    schedule.stops.reduce((sum, s) => sum + (s.travelMinutesFromPrev ?? 0), 0) +
    (schedule.travelMinutesToEnd ?? 0)
  );
}

/**
 * เสนอลำดับจุดแวะใหม่ให้ดูก่อน แล้วค่อยกดใช้เอง — ไม่จัดลำดับให้อัตโนมัติ
 * เพราะระยะทางสั้นสุดไม่ได้แปลว่าดีที่สุด (เวลาเปิด-ปิด, ควรไปช่วงไหน, มื้ออาหาร)
 */
export function RouteSuggestionModal({
  stops,
  placesById,
  startAt,
  endAt,
  buildSchedule,
  isClosedAt,
  onApply,
  onClose,
}: {
  stops: TripStop[];
  placesById: Map<string, Place>;
  startAt: RoutePoint | null;
  endAt: RoutePoint | null;
  /** คำนวณตารางเวลาของลำดับที่ให้มา ด้วย logic เดียวกับที่หน้าวันใช้อยู่ (เวลาจริงจาก Google ถ้ามี) */
  buildSchedule: (ordered: TripStop[]) => DaySchedule;
  /** true = ช่วงเวลานี้สถานที่ปิดตามข้อมูล Google */
  isClosedAt: (place: Place, arrival: string, departure: string) => boolean;
  onApply: (orderedStopIds: string[]) => void;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const [pinRestaurants, setPinRestaurants] = useState(true);

  const routable = useMemo(
    () =>
      stops
        .map((stop) => ({ stop, place: placesById.get(stop.place_id) }))
        .filter((x): x is { stop: TripStop; place: Place } => x.place != null),
    [stops, placesById]
  );

  const suggestion = useMemo(() => {
    const points: RoutePoint[] = routable.map(({ place }) => ({
      id: place.id,
      lat: place.lat,
      lng: place.lng,
    }));
    const pinned = new Set<number>();
    if (pinRestaurants) {
      routable.forEach(({ place }, i) => {
        if (place.category === "restaurant") pinned.add(i);
      });
    }
    const ordered = suggestOrder(points, { startAt, endAt, pinnedIndexes: pinned });
    // สถานที่เดียวกันอาจถูกใส่ซ้ำในวันเดียวได้ (เช่น แวะคาเฟ่เดิมสองรอบ) จึงจับคู่แบบคิว ไม่ใช่ map ตัวต่อตัว
    const queueByPlaceId = new Map<string, TripStop[]>();
    routable.forEach(({ stop, place }) => {
      const queue = queueByPlaceId.get(place.id);
      if (queue) queue.push(stop);
      else queueByPlaceId.set(place.id, [stop]);
    });
    const orderedStops = ordered.map((p) => queueByPlaceId.get(p.id)!.shift()!);
    // จุดที่ resolve place ไม่ได้ (ข้อมูลหาย) ต่อท้ายไว้ตามเดิม ไม่ให้หลุดหายไปจากวัน
    const unresolved = stops.filter((s) => !placesById.has(s.place_id));
    return {
      points,
      ordered,
      orderedStops: [...orderedStops, ...unresolved],
      distanceBeforeKm: routeDistanceKm(points, startAt, endAt),
      distanceAfterKm: routeDistanceKm(ordered, startAt, endAt),
    };
  }, [routable, stops, placesById, startAt, endAt, pinRestaurants]);

  const before = useMemo(() => buildSchedule(stops), [buildSchedule, stops]);
  const after = useMemo(
    () => buildSchedule(suggestion.orderedStops),
    [buildSchedule, suggestion.orderedStops]
  );

  const minutesSaved = totalTravelMinutes(before) - totalTravelMinutes(after);
  const kmSaved = suggestion.distanceBeforeKm - suggestion.distanceAfterKm;
  const isSameOrder = suggestion.orderedStops.every((s, i) => s.id === stops[i]?.id);

  // จุดที่ "ลำดับใหม่แล้วจะไปตอนปิด" — เตือนแรงๆ เพราะนี่คือข้อเสียหลักของการจัดตามระยะทางอย่างเดียว
  const newlyClosed = after.stops.filter((s) => {
    if (!s.place) return false;
    const wasClosed = before.stops.find((b) => b.id === s.id);
    const nowClosed = isClosedAt(s.place, s.arrival, s.departure);
    const previouslyClosed =
      wasClosed?.place != null && isClosedAt(wasClosed.place, wasClosed.arrival, wasClosed.departure);
    return nowClosed && !previouslyClosed;
  });
  const stillClosed = after.stops.filter(
    (s) => s.place != null && isClosedAt(s.place, s.arrival, s.departure)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">✨ ลองจัดเส้นทางใหม่</h2>
              <p className="text-xs text-ink-soft">
                เรียงจุดแวะให้เดินทางรวมสั้นลง โดยเริ่ม-จบที่ที่พัก — ดูก่อนแล้วค่อยกดใช้
              </p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-soft">
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-3 flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={pinRestaurants}
              onChange={(e) => setPinRestaurants(e.target.checked)}
              className="h-4 w-4 accent-maple"
            />
            ตรึงร้านอาหารไว้ที่ลำดับเดิม (กันมื้อเที่ยง/เย็นหลุดเวลา)
          </label>

          {isSameOrder ? (
            <div className="rounded-lg bg-cream-soft/60 px-3 py-3 text-sm text-ink-soft">
              ลำดับที่วางไว้ตอนนี้ดีอยู่แล้ว — จัดใหม่แล้วไม่สั้นลงอย่างมีนัยสำคัญ
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-lg bg-pine-soft/60 px-3 py-2 text-xs text-pine-dark">
                {minutesSaved > 0
                  ? `⏱️ เดินทางรวมน้อยลง ~${minutesSaved} นาที`
                  : "⏱️ เวลาเดินทางรวมไม่ต่างกันมาก"}
                {kmSaved > 0.05 && ` · 📏 ระยะสั้นลง ~${kmSaved.toFixed(1)} กม.`}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    ลำดับปัจจุบัน
                  </div>
                  <ol className="space-y-1.5">
                    {before.stops.map((s, i) => (
                      <li key={s.id} className="rounded-lg bg-cream-soft/50 px-2 py-1.5 text-xs">
                        <div className="font-medium text-ink">
                          {i + 1}. {s.place ? `${CATEGORY_EMOJI[s.place.category]} ${s.place.nameTh}` : "—"}
                        </div>
                        <div className="text-[11px] text-ink-soft">
                          {s.arrival}–{s.departure}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-maple-dark">
                    ลำดับที่เสนอ
                  </div>
                  <ol className="space-y-1.5">
                    {after.stops.map((s, i) => {
                      const closed = s.place != null && isClosedAt(s.place, s.arrival, s.departure);
                      return (
                        <li
                          key={s.id}
                          className={`rounded-lg px-2 py-1.5 text-xs ${
                            closed ? "bg-maple-soft/70" : "bg-maple-soft/30"
                          }`}
                        >
                          <div className="font-medium text-ink">
                            {i + 1}. {s.place ? `${CATEGORY_EMOJI[s.place.category]} ${s.place.nameTh}` : "—"}
                          </div>
                          <div className={`text-[11px] ${closed ? "text-maple-dark" : "text-ink-soft"}`}>
                            {s.arrival}–{s.departure}
                            {closed && " ⚠️ ปิด"}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>

              {stillClosed.length > 0 && (
                <div className="mt-3 rounded-lg bg-maple-soft/70 px-3 py-2 text-xs leading-relaxed text-maple-dark">
                  ⚠️ ลำดับใหม่จะไปถึงตอนที่อาจปิดแล้ว:{" "}
                  {stillClosed.map((s) => s.place?.nameTh).filter(Boolean).join(", ")}
                  {newlyClosed.length > 0 && " — บางจุดเดิมยังเปิดอยู่ ลองเช็กก่อนกดใช้"}
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
                * คำนวณจากระยะเส้นตรงระหว่างจุด ไม่ใช่เส้นทางจริง — เอาไว้เป็นไอเดีย ตัดสินใจเองอีกที
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 px-5 pb-5 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-cream-soft py-3 text-sm font-medium text-ink-soft hover:bg-cream-soft"
          >
            ยกเลิก
          </button>
          <button
            disabled={isSameOrder}
            onClick={() => {
              onApply(suggestion.orderedStops.map((s) => s.id));
              onClose();
            }}
            className="flex-1 rounded-xl bg-maple py-3 text-sm font-semibold text-white hover:bg-maple-dark disabled:cursor-not-allowed disabled:bg-cream-soft disabled:text-ink-soft"
          >
            ใช้ลำดับนี้
          </button>
        </div>
      </div>
    </div>
  );
}
