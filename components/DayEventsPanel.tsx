import type { DayEvent } from "@/data/itinerary";
import { LayoverBadges } from "./LayoverBadges";

/** ตั๋วที่จองมาแล้วเท่านั้นที่ล็อกจริง — เหตุการณ์อื่น (เวลาเช็คอิน/เวลาออกจากโรงแรม) เป็นคำแนะนำที่ปรับได้
 *  ไม่ใส่ `editable` ถือว่าล็อก เพื่อให้พฤติกรรมเดิมของเหตุการณ์ที่ยังไม่ได้ระบุ kind ไม่เปลี่ยน */
function isLocked(event: DayEvent): boolean {
  return event.editable !== true;
}

/** เที่ยวบิน/เดดไลน์ของวันนั้น — เวลาตายตัว แสดงแยกจากจุดแวะที่ลากจัดลำดับได้
 *  เฟส 15: แยก "ตั๋วที่ล็อกแล้ว" ออกจาก "เวลาที่เป็นคำแนะนำ" ให้เห็นด้วยตา แทนที่จะเหมาว่าล็อกหมดทั้งแผง */
export function DayEventsPanel({
  events,
  heading = "✈️ ตารางบิน/เวลาตายตัวของวันนี้",
}: {
  events: DayEvent[];
  heading?: string;
}) {
  const lockedCount = events.filter(isLocked).length;
  const legend =
    lockedCount === events.length
      ? "🔒 ตั๋วจองแล้ว แก้ไม่ได้"
      : lockedCount === 0
        ? "✏️ เวลาแนะนำ ปรับได้"
        : "🔒 ตั๋วจองแล้ว · ✏️ ปรับได้";

  return (
    <div className="border-b border-line bg-surface-soft/40">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
        <span>{heading}</span>
        <span className="shrink-0 font-normal normal-case text-content-soft/70">{legend}</span>
      </div>
      <div className="space-y-1 px-4 pb-3 pt-1.5">
        {events.map((event, i) => {
          const locked = isLocked(event);
          return (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-xs ${
                event.alert
                  ? "bg-maple-soft/70 text-maple-dark"
                  : event.kind === "layover"
                    ? "bg-surface-raised/70 text-content ring-1 ring-inset ring-line"
                    : "text-content"
              }`}
            >
              <div className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">
                {event.time}
                {event.endTime && (
                  <div className="font-normal text-content-soft">↓ {event.endTime}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {event.icon} {event.title}
                  <span
                    className="ml-1 text-[10px] font-normal text-content-soft/70"
                    title={locked ? "ตั๋วจองแล้ว แก้ไม่ได้" : "เวลาแนะนำ ปรับตามหน้างานได้"}
                  >
                    {locked ? "🔒" : "✏️"}
                  </span>
                  {event.flight && (
                    <span className="ml-1 rounded bg-surface-soft px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-content-soft">
                      {event.flight.fromCode} → {event.flight.toCode}
                    </span>
                  )}
                </div>
                {event.detail && (
                  <div className="mt-0.5 leading-relaxed text-content-soft">{event.detail}</div>
                )}
                {event.layover && <LayoverBadges layover={event.layover} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
