import type { TripStop } from "@/lib/supabase";
import type { ScheduledStop } from "@/lib/schedule";
import { timeToMinutes, minutesToTime } from "@/lib/schedule";

/**
 * ประมาณว่าตอนนี้ "ช้ากว่าแผน" กี่นาที — ใช้แสดงในหน้า "วันนี้" เท่านั้น ไม่เขียนกลับ DB เด็ดขาด
 * (ตกลงกันไว้ 7 ส.ค. 2026: เลื่อนให้ดูอย่างเดียว แผนต้นฉบับใน DB ต้องไม่ถูกแตะ)
 * มีจุดที่ติ๊ก "มาถึงแล้ว" แล้ว → เทียบเวลาจริงของจุดล่าสุดกับเวลาที่แผนวางไว้ (แม่นสุด เพราะเป็นข้อเท็จจริง)
 * ยังไม่ติ๊กจุดไหนเลย → เทียบเวลาปัจจุบันกับจุดแรกที่วางแผนไว้ (กันเคสยังไม่ถึงจุดแรกแต่ออกช้าไปแล้ว)
 * ค่าบวก = ช้ากว่าแผน, ค่าลบ = เร็วกว่าแผน
 */
export function estimateDelayMinutes(
  dayStops: TripStop[],
  schedule: ScheduledStop[],
  now: Date
): number {
  let lastVisitedIndex = -1;
  for (let i = 0; i < dayStops.length; i++) {
    if (dayStops[i].visited_at) lastVisitedIndex = i;
  }

  if (lastVisitedIndex >= 0) {
    const sched = schedule[lastVisitedIndex];
    const visitedAt = dayStops[lastVisitedIndex].visited_at;
    if (!sched || !visitedAt) return 0;
    const actual = new Date(visitedAt);
    const actualMinutes = actual.getHours() * 60 + actual.getMinutes();
    return actualMinutes - timeToMinutes(sched.arrival);
  }

  if (schedule.length === 0) return 0;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, nowMinutes - timeToMinutes(schedule[0].arrival));
}

/** เลื่อนเวลา HH:MM ไปตามจำนวนนาทีที่ช้า/เร็วกว่าแผน — ใช้แสดงผลเท่านั้น */
export function shiftTime(time: string, deltaMinutes: number): string {
  if (!deltaMinutes) return time;
  return minutesToTime(timeToMinutes(time) + deltaMinutes);
}
