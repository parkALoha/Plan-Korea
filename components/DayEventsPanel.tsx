"use client";

import { useState } from "react";
import type { DayEvent } from "@/data/itinerary";
import type { Place } from "@/data/places";
import type { CustomPlace } from "@/lib/supabase";
import { resolveEventPlace } from "@/lib/eventPlace";
import { placeQueryKey } from "@/lib/placeQuery";
import { LayoverBadges } from "./LayoverBadges";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { RowIconBox, TripListRow } from "./TripListRow";
import { PlaceThumb } from "./PlaceThumb";

/** ตั๋วที่จองมาแล้วเท่านั้นที่ล็อกจริง — เหตุการณ์อื่น (เวลาเช็คอิน/เวลาออกจากโรงแรม) เป็นคำแนะนำที่ปรับได้
 *  ไม่ใส่ `editable` ถือว่าล็อก เพื่อให้พฤติกรรมเดิมของเหตุการณ์ที่ยังไม่ได้ระบุ kind ไม่เปลี่ยน */
function isLocked(event: DayEvent): boolean {
  return event.editable !== true;
}

/**
 * เที่ยวบิน/เดดไลน์ของวันนั้น — เวลาตายตัว แสดงแยกจากจุดแวะที่ลากจัดลำดับได้
 * เฟส 15: แยก "ตั๋วที่ล็อกแล้ว" ออกจาก "เวลาที่เป็นคำแนะนำ" ให้เห็นด้วยตา แทนที่จะเหมาว่าล็อกหมดทั้งแผง
 *
 * เฟส 28: แถวในแผงนี้ใช้**โครงเดียวกับ `SortableStopRow` เป๊ะๆ** — ช่องซ้ายสุดขนาดเท่าที่จับลาก
 * (`h-10 w-7`) · คอลัมน์เวลา `w-12 sm:w-14` · รูป/ไอคอน `h-10 w-10` · ชื่อ `font-semibold` ·
 * บรรทัดรายละเอียดย่อหน้า `pl-10 sm:pl-14` เท่าบรรทัดโน้ต · คั่นด้วย `divide-y divide-line`
 * เหตุผล: วันบิน (11/21 ต.ค.) เคยเป็นตัวหนังสือล้วนคนละหน้าตากับทั้งเว็บ กดอะไรไม่ได้เลย
 * ทั้งที่ "สนามบินไหน อยู่ตรงไหน" คือสิ่งที่ต้องรู้ที่สุดของวันนั้น
 *
 * ⚠️ ถ้าแก้เลย์เอาต์แถวจุดแวะใน `SortableStopRow` ต้องมาแก้ที่นี่ด้วย — จงใจไม่แยกเป็น component
 * ร่วมเพราะแถวจุดแวะพ่วงเรื่อง drag/dwell/โน้ต/รูป ที่แผงนี้ไม่มีและไม่ควรมี
 */
export function DayEventsPanel({
  events,
  heading = "✈️ ตารางบิน/เวลาตายตัวของวันนี้",
  hotelPlace = null,
  customPlaces,
}: {
  events: DayEvent[];
  heading?: string;
  /** สถานที่ที่เก็บใน Supabase — ต้องส่งมา ไม่งั้นแถวที่อ้าง `home-base` จะ resolve ไม่เจอ */
  customPlaces: CustomPlace[];
  /** ที่พักที่ตื่นมาจากคืนก่อนหน้า — รองรับ `placeId: "@hotel"` (แถวเช็คเอาต์เช้าวันกลับ)
   *  null = ยังไม่ได้ตั้งที่พักคืนนั้น แถวนั้นแสดงเป็นแถวธรรมดาที่กดไม่ได้ */
  hotelPlace?: Place | null;
}) {
  const [viewPlace, setViewPlace] = useState<Place | null>(null);

  const lockedCount = events.filter(isLocked).length;
  const legend =
    lockedCount === events.length
      ? "🔒 ตั๋วจองแล้ว แก้ไม่ได้"
      : lockedCount === 0
        ? "✏️ เวลาแนะนำ ปรับได้"
        : "🔒 ตั๋วจองแล้ว · ✏️ ปรับได้";

  return (
    <div className="border-b border-line">
      <div className="flex items-baseline justify-between gap-2 bg-surface-soft/40 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-content-soft">
        <span>{heading}</span>
        <span className="shrink-0 font-normal normal-case text-content-soft/70">{legend}</span>
      </div>

      <div className="divide-y divide-line border-t border-line">
        {events.map((event, i) => {
          const locked = isLocked(event);
          const place = resolveEventPlace(event, hotelPlace, customPlaces);
          // สีพื้นของแถวเหมือนเดิมทุกประการ — เดดไลน์ที่พลาดไม่ได้กับช่วงต่อเครื่องต้องเด้งออกมาจากแถวปกติ
          // แถวเตือนคุมสีตัวอักษรจากตัวแถว ข้างในจึงไม่ทับด้วย text-content (ครีมบนครีมตอนธีมมืด)
          const alert = event.alert === true;
          const tone = alert
            ? "bg-maple-soft/70 text-maple-dark"
            : event.kind === "layover"
              ? "bg-surface-soft/50"
              : "";

          const body = (
            <>
              <TripListRow
                muted={alert}
                leading={
                  place ? (
                    <PlaceThumb query={placeQueryKey(place)} category={place.category} size="2xl" />
                  ) : (
                    <RowIconBox>{event.icon}</RowIconBox>
                  )
                }
                time={event.time}
                endTime={event.endTime}
                corner={
                  <span
                    aria-label={locked ? "ตั๋วจองแล้ว แก้ไม่ได้" : "เวลาแนะนำ ปรับตามหน้างานได้"}
                    title={locked ? "ตั๋วจองแล้ว แก้ไม่ได้" : "เวลาแนะนำ ปรับตามหน้างานได้"}
                    className="text-xs text-content-soft/60"
                  >
                    {locked ? "🔒" : "✏️"}
                  </span>
                }
                title={
                  <>
                    {place ? `${event.icon} ` : ""}
                    {event.title}
                    {event.flight && (
                      <span className="ml-1.5 rounded bg-surface-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-content-soft">
                        {event.flight.fromCode} → {event.flight.toCode}
                      </span>
                    )}
                  </>
                }
                subtitle={place ? `📍 ${place.nameTh} — แตะดูรูป/แผนที่/นำทาง` : undefined}
              >
                {(event.detail || event.layover) && (
                  <div className="px-3 pb-2.5 text-xs leading-relaxed text-content-soft sm:px-4">
                    {event.detail}
                    {event.layover && <LayoverBadges layover={event.layover} />}
                  </div>
                )}
              </TripListRow>
            </>
          );

          // มีสถานที่ = ทั้งแถวกดได้ เหมือนแถวจุดแวะที่กดตรงไหนก็เปิดรายละเอียด
          return place ? (
            <button
              key={i}
              type="button"
              onClick={() => setViewPlace(place)}
              className={`block w-full text-left hover:bg-surface-soft/60 ${tone}`}
            >
              {body}
            </button>
          ) : (
            <div key={i} className={tone}>
              {body}
            </div>
          );
        })}
      </div>

      {viewPlace && (
        <PlaceDetailModal
          place={viewPlace}
          previousPlace={null}
          hotel={null}
          onClose={() => setViewPlace(null)}
        />
      )}
    </div>
  );
}
