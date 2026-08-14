import type { DayEvent } from "@/data/itinerary";
import type { Place } from "@/data/places";
import type { CustomPlace } from "@/lib/supabase";
import { resolvePlace } from "@/lib/resolvePlace";

/** `DayEvent.placeId` ที่หมายถึง "ที่พักที่ตื่นมาจากคืนก่อนหน้า" — พิกัดมาจาก `trip_hotels` ตอน render
 *  ไม่ใช่ค่าคงที่ใน `data/itinerary.ts` จึงต้องส่ง `hotelPlace` เข้ามาให้ */
export const EVENT_HOTEL_PLACE_ID = "@hotel";

/**
 * สถานที่จริงของแถวตารางบิน — ใช้ร่วมกันทั้ง 3 หน้า (หน้าแผน `/`, `/summary`, `/today`)
 * เพื่อให้แถวเดียวกันชี้ไปที่เดียวกันเสมอ ไม่ว่าจะเปิดจากหน้าไหน
 *
 * ต้องส่ง `customPlaces` เข้ามาด้วย ไม่ใช่ `[]` — ที่พักของเราเองที่กรุงเทพ (`home-base`) อยู่ใน
 * `custom_places` ของ Supabase ไม่ได้อยู่ในโค้ด เพราะเป็นที่อยู่จริงของเจ้าของทริปที่ไม่ควรขึ้น git
 * ถ้ายังโหลดไม่เสร็จ/ไม่มีแถวนั้น จะคืน null แล้วแถวนั้นแสดงเป็นแถวธรรมดาที่กดไม่ได้ (ไม่พัง)
 */
export function resolveEventPlace(
  event: DayEvent,
  hotelPlace: Place | null,
  customPlaces: CustomPlace[]
): Place | null {
  if (!event.placeId) return null;
  if (event.placeId === EVENT_HOTEL_PLACE_ID) return hotelPlace;
  return resolvePlace(event.placeId, customPlaces);
}
