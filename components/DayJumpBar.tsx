"use client";

import { useEffect, useState } from "react";
import type { Day } from "@/data/itinerary";
import { CITY_META } from "@/data/itinerary";

/** id ของ <section> การ์ดวัน — ใช้ร่วมกันระหว่างแถบนี้กับ DayStopsSection */
export function dayCardElementId(dayId: string) {
  return `day-card-${dayId}`;
}

/**
 * แถบวันแบบ sticky (เฟส 17) — แก้ปัญหาสกรอลล์ยาว 11 วันรวดบนมือถือ
 * กดชิปแล้วกระโดดไปการ์ดวันนั้น และชิปของวันที่กำลังดูอยู่จะไฮไลต์ให้เองตามการสกรอลล์
 */
export function DayJumpBar({ itinerary }: { itinerary: Day[] }) {
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

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

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-cream-soft bg-cream/95 px-4 py-2 backdrop-blur print:hidden">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {itinerary.map((day) => {
          const active = day.id === activeDayId;
          const label = new Date(day.date).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
          });
          return (
            <button
              key={day.id}
              onClick={() =>
                document
                  .getElementById(dayCardElementId(day.id))
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium ${
                active
                  ? "bg-ink text-cream"
                  : "bg-cream-soft text-ink-soft hover:bg-maple-soft"
              }`}
            >
              {CITY_META[day.city].icon} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
