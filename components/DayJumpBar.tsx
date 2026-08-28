"use client";

import { cityMetaOf } from "@/components/cityMeta";
import { useEffect, useRef, useState } from "react";
import type { Day } from "@/data/itinerary";

/** id ของ <section> การ์ดวัน — ใช้ร่วมกันระหว่างแถบนี้กับ DayStopsSection */
export function dayCardElementId(dayId: string) {
  return `day-card-${dayId}`;
}

/**
 * แถบวันแบบ sticky (เฟส 17) — แก้ปัญหาสกรอลล์ยาว 11 วันรวดบนมือถือ
 * กดชิปแล้วกระโดดไปการ์ดวันนั้น และชิปของวันที่กำลังดูอยู่จะไฮไลต์ให้เองตามการสกรอลล์
 *
 * เฟส 20.3: ชิปที่ไฮไลต์อยู่เลื่อนเข้ามาในจอเอง — เดิมพอดูวันที่ 9 ชิปของวันนั้นหลุดออกไป
 * ทางขวานอกจอ ต้องปัดแถบหาเองทุกครั้ง (แถบนี้ถูกย้ายขึ้นไปไว้บนสุดใต้หัวเว็บด้วย
 * จากเดิมที่อยู่ใต้แผงเตรียมทริป ซึ่งทำให้กว่าจะติดบนจอต้องเลื่อนผ่านแผงพวกนั้นไปก่อน)
 */
export function DayJumpBar({ itinerary }: { itinerary: Day[] }) {
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement>(null);
  // ผู้ใช้กำลังปัดแถบชิปอยู่เอง — ห้ามชิงเลื่อนแย่งนิ้ว
  const userScrollingRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sections = itinerary
      .map((d) => document.getElementById(dayCardElementId(d.id)))
      .filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;

    // ถือว่า "วันที่กำลังดู" คือการ์ดบนสุดที่ยังโผล่พ้นใต้แถบนี้อยู่ — rootMargin ด้านบนตัดพื้นที่
    // ที่แถบ sticky บังไว้ออก ไม่งั้นการ์ดที่ถูกแถบบังจะยังนับว่ามองเห็นอยู่
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveDayId(visible[0].target.id.replace("day-card-", ""));
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 }
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [itinerary]);

  useEffect(() => {
    if (!activeDayId || userScrollingRef.current) return;
    // block: "nearest" สำคัญ — แถบนี้ติดบนจออยู่แล้ว จึงไม่ไปลากหน้าเว็บเลื่อนแนวตั้งแย่งกับ
    // การสกรอลล์ที่ผู้ใช้กำลังทำอยู่ เลื่อนแค่ในแนวนอนของตัวแถบเอง
    chipRefs.current
      .get(activeDayId)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeDayId]);

  function holdAutoScroll() {
    userScrollingRef.current = true;
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
  }

  function releaseAutoScroll() {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    // เผื่อเวลาให้ momentum scroll ของมือถือหยุดก่อนคืนสิทธิ์ให้ระบบเลื่อนเอง
    releaseTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 1200);
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur print:hidden">
      <div
        ref={scrollerRef}
        onPointerDown={holdAutoScroll}
        onPointerUp={releaseAutoScroll}
        onPointerCancel={releaseAutoScroll}
        className="flex gap-1.5 overflow-x-auto pb-0.5"
      >
        {itinerary.map((day) => {
          const active = day.id === activeDayId;
          const label = new Date(day.date).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
          });
          return (
            <button
              key={day.id}
              ref={(el) => {
                if (el) chipRefs.current.set(day.id, el);
                else chipRefs.current.delete(day.id);
              }}
              aria-current={active ? "true" : undefined}
              onClick={() =>
                document
                  .getElementById(dayCardElementId(day.id))
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium ${
                active
                  ? "bg-ink text-cream"
                  : "bg-surface-soft text-content-soft hover:bg-maple-soft"
              }`}
            >
              {cityMetaOf(day.city).icon} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
