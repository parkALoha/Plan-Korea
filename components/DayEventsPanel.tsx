"use client";

import { useState } from "react";
import type { DayEvent } from "@/data/itinerary";
import type { Place } from "@/data/places";
import type { PlaceSources } from "@/lib/resolvePlace";
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
  placeSources,
  onEditEvent,
}: {
  events: DayEvent[];
  /**
   * เปิดฟอร์มแก้แถวนี้ — **ไม่ส่ง = แผงนี้อ่านอย่างเดียว** (`/summary` และทริปที่แผนมาจากไฟล์โค้ด)
   * 🔴 ปุ่มขึ้นเฉพาะแถวที่ **มี `stopId`** เท่านั้น · แถวจาก `data/itinerary.ts` ไม่มี id
   *    ⇒ ไม่มีอะไรให้ `PATCH` ตามนิยาม · ดูเหตุผลเต็มที่ `DayEvent.stopId`
   */
  onEditEvent?: (stopId: string, event: DayEvent) => void;
  heading?: string;
  /** แหล่งสถานที่ของทริปนี้ (คลังกลาง + ของผู้ใช้) — ต้องส่งมา ไม่งั้นแถวที่อ้าง `home-base` จะ resolve ไม่เจอ */
  placeSources: PlaceSources;
  /** ที่พักที่ตื่นมาจากคืนก่อนหน้า — รองรับ `placeId: "@hotel"` (แถวเช็คเอาต์เช้าวันกลับ)
   *  null = ยังไม่ได้ตั้งที่พักคืนนั้น แถวนั้นแสดงเป็นแถวธรรมดาที่กดไม่ได้ */
  hotelPlace?: Place | null;
}) {
  const [viewPlace, setViewPlace] = useState<Place | null>(null);

  /* 🔴 คำอธิบายเดิมเขียนว่า "✏️ ปรับได้" ซึ่ง **ไม่จริง** — แถวในแผงนี้มาจาก `data/itinerary.ts`
     ซึ่งเป็นไฟล์โค้ด ไม่มีทางแก้ผ่านหน้าเว็บเลยสักทาง (ไล่หาแล้ว: `DayEvent` ไม่มี onUpdate/
     modal/API เขียนสักตัว) · "ปรับได้" หมายถึงยืดหยุ่นได้ตอนอยู่หน้างานจริง แต่คู่กับรูป ✏️
     มันถูกอ่านว่า "กดแล้วแก้ได้" — ผู้ใช้ทักเองว่าดูแล้วไม่รู้ว่าอะไรมาจากไหน (4 ก.ย. 2026)
     ⇒ บอกที่มาให้ชัดแทน และเก็บ 🔒 ไว้เฉพาะเรื่องที่เป็นจริงในโลกจริง (ตั๋วจองแล้ว = เลื่อนไม่ได้) */
  const lockedCount = events.filter(isLocked).length;
  /**
   * 🔴 **แก้ 4 ก.ย. 2026 — ป้ายเดิม *"แก้ในเว็บไม่ได้"* เป็นเท็จแล้วสำหรับแถวที่มาจากฐาน** (P2)
   * ตอนเขียนมันจริงทุกตัวอักษร (ไม่มีสายเขียนเลยสักเส้น) · `E5` ต่อสายครบแล้ว ⇒ ป้ายต้องตามสภาพจริง
   * ✅ **ผูกกับ `onEditEvent` ที่ผู้เรียกส่งมา ไม่ใช่กับวันที่หรือชื่อ branch** — วันที่ผู้เรียกเลิกส่ง
   *    ป้ายกลับไปพูดความจริงเองโดยไม่ต้องมีใครแก้ไฟล์นี้ (บทเรียน *คำบรรยายสภาพ* จาก `HotelsFlatList`)
   * ⚠️ 🔒 ยังพูดเรื่องเดิม: **ตั๋วจองแล้ว = เลื่อนเวลาไม่ได้ในโลกจริง** ไม่เกี่ยวกับการแก้ในเว็บ
   */
  const legend = onEditEvent
    ? lockedCount > 0
      ? "🔒 ตั๋วจองแล้ว (เลื่อนเวลาจริงไม่ได้) · แตะ ✏️ เพื่อแก้"
      : "แตะ ✏️ เพื่อแก้"
    : lockedCount > 0
      ? "🔒 ตั๋วจองแล้ว · แก้ในเว็บไม่ได้"
      : "แก้ในเว็บไม่ได้";

  return (
    <div className="border-b border-line">
      <div className="flex items-baseline justify-between gap-2 bg-surface-soft/40 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-content-soft">
        <span>{heading}</span>
        <span className="shrink-0 font-normal normal-case text-content-soft/70">{legend}</span>
      </div>

      <div className="divide-y divide-line border-t border-line">
        {events.map((event, i) => {
          const locked = isLocked(event);
          const place = resolveEventPlace(event, hotelPlace, placeSources);
          // สีพื้นของแถวเหมือนเดิมทุกประการ — เดดไลน์ที่พลาดไม่ได้กับช่วงต่อเครื่องต้องเด้งออกมาจากแถวปกติ
          // แถวเตือนคุมสีตัวอักษรจากตัวแถว ข้างในจึงไม่ทับด้วย text-content (ครีมบนครีมตอนธีมมืด)
          const alert = event.alert === true;
          /* 🔴 เดิมเป็น `bg-maple-soft/70 text-maple-dark` — **ทั้งคู่เป็นโทเคน brand ที่ไม่พลิกตามธีม**
             ⇒ ในธีมมืด แถวเตือน (เดดไลน์ที่พลาดไม่ได้) กลายเป็น *แผ่นสว่างจ้ากลางจอมืด*
             วัดจริงในเบราว์เซอร์: พื้นออกมาเป็น `lab(91.655 …)` = สีอ่อน ทั้งที่ทั้งหน้าเป็นธีมมืด
             `alert-soft`/`alert-ink` เป็นคู่เชิงความหมายที่พลิกตามธีม **และพลิกกลับตอนพิมพ์**
             🎯 เจอเพราะไปวัดคอนทราสต์ของ *เวลา* ไม่ใช่เพราะไปตรวจแถวเตือน — ของที่ไม่พลิกตามธีม
                ไม่ส่งเสียงอะไรเลยจนกว่าจะมีคนเปิดธีมมืดแล้วมองมันตรง ๆ */
          const tone = alert
            ? "bg-alert-soft text-alert-ink"
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
                  /* ไม่มีไอคอนเมื่อไม่ล็อก — "ไม่มีอะไร" คือคำตอบที่ถูก
                     ของเดิมใส่ ✏️ ซึ่งอ่านว่ากดแล้วแก้ได้ ทั้งที่แก้ไม่ได้ · ที่มาของแถว
                     บอกที่หัวแผงแล้ว ไม่ต้องบอกซ้ำทุกแถว */
                  locked ? (
                    <span
                      aria-label="ตั๋วจองแล้ว เวลานี้เลื่อนไม่ได้"
                      title="ตั๋วจองแล้ว เวลานี้เลื่อนไม่ได้"
                      className="text-xs text-content-soft/60"
                    >
                      🔒
                    </span>
                  ) : undefined
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
                detail={
                  event.detail || event.layover ? (
                    <>
                      {event.detail}
                      {event.layover && <LayoverBadges layover={event.layover} />}
                    </>
                  ) : undefined
                }
              />
            </>
          );

          // มีสถานที่ = ทั้งแถวกดได้ เหมือนแถวจุดแวะที่กดตรงไหนก็เปิดรายละเอียด
          /**
           * 🔴 **ปุ่มแก้เป็น *พี่น้อง* ของเนื้อแถว ไม่ใช่ลูก** — เนื้อแถวของแถวที่มีสถานที่เป็น `<button>`
           * อยู่แล้ว (กดดูรูป/แผนที่) · ซ้อนปุ่มในปุ่มเป็น HTML ที่ไม่ถูกต้อง และเบราว์เซอร์จะกินคลิกชั้นใน
           * ⇒ ห่อด้วย flex แล้ววางสองปุ่มข้างกัน **ทั้งสองอย่างจึงยังกดได้ครบ ไม่ต้องเลือกอย่างใดอย่างหนึ่ง**
           * · ปุ่มแก้ขึ้นเฉพาะ `event.stopId` มีค่า — แถวจากไฟล์โค้ดไม่มี id ⇒ ไม่มีปุ่มตั้งแต่ต้น
           */
          const editable = onEditEvent && event.stopId;
          const rowBody = place ? (
            <button
              type="button"
              onClick={() => setViewPlace(place)}
              className="block min-w-0 flex-1 text-left hover:bg-surface-soft/60"
            >
              {body}
            </button>
          ) : (
            <div className="min-w-0 flex-1">{body}</div>
          );

          return (
            <div key={i} className={`flex items-start ${tone}`}>
              {rowBody}
              {editable && (
                <button
                  type="button"
                  onClick={() => onEditEvent(event.stopId!, event)}
                  aria-label={`แก้ ${event.title}`}
                  title={`แก้ ${event.title}`}
                  className="shrink-0 self-stretch px-3 py-3 text-sm text-content-soft hover:bg-surface-soft/60"
                >
                  ✏️
                </button>
              )}
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
