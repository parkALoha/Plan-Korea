import type { DayEvent } from "@/data/itinerary";

/** เที่ยวบิน/เดดไลน์ของวันนั้น — เวลาตายตัว จองมาแล้ว แก้ในเว็บไม่ได้ เลยแสดงแยกจากจุดแวะที่ลากจัดลำดับได้
 *  (นี่คือส่วนเดียวของวันที่ตั้งใจให้ล็อกถาวร ที่เหลือของวันบินแก้ได้เหมือนวันปกติทุกอย่าง) */
export function DayEventsPanel({
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
