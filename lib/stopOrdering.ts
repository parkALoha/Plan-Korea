import type { TripStop } from "@/lib/supabase";

/** order_index ถัดไปที่ต่อท้ายวันนี้ — ใช้ max(order_index)+1 แทน dayStops.length (บั๊ก 8.1)
 *  เพราะ order_index มีช่องว่างได้ (เช่น หลังลากจุดแวะออกจากวันไปวันอื่น) ใช้ length ตรงๆ จะชนกับแถวเดิม */
export function nextOrderIndex(dayStops: TripStop[]): number {
  if (dayStops.length === 0) return 0;
  return Math.max(...dayStops.map((s) => s.order_index)) + 1;
}

/** แปลง "ตำแหน่งใน array ที่เรียงตาม order_index แล้ว" (atIndex จาก UI) ให้เป็นค่า order_index จริงที่จะแทรก
 *  ตรงนั้น — เดิม insertStopAt ใช้ atIndex เป็น order_index ตรงๆ ซึ่งผิดเมื่อ order_index มีช่องว่าง (บั๊ก 8.2)
 *  เช่น วันมีช่องว่าง 0,2,3 แล้วผู้ใช้กดแทรกที่ตำแหน่งที่ 1 (ใน array) ควรได้ order_index = 2 ไม่ใช่ 1 */
export function orderIndexAtPosition(dayStops: TripStop[], atIndex: number): number {
  const sorted = [...dayStops].sort((a, b) => a.order_index - b.order_index);
  if (sorted.length === 0) return 0;
  if (atIndex <= 0) return sorted[0].order_index;
  if (atIndex >= sorted.length) return sorted[sorted.length - 1].order_index + 1;
  return sorted[atIndex].order_index;
}
