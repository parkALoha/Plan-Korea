import type { CustomPlace } from "../supabase";
import type { Db } from "./db";
import { customPlaceRowsOfTrip } from "./db";
import { toCustomPlace, type CustomPlaceRow } from "./customPlaceShape";

/**
 * อ่านคลังสถานที่ของทริป — **การแปลงรูปอยู่ที่ [`customPlaceShape.ts`](./customPlaceShape.ts)**
 *
 * แยกกันเพราะ realtime handler ฝั่งเบราว์เซอร์ต้องใช้ตัวแปลงตัวเดียวกัน **แต่ใช้ไฟล์นี้ไม่ได้**
 * (มันพึ่ง `db.ts`) · ดูเหตุผลเต็มในหัวไฟล์นั้น
 */
/** อ่านคลังของทริป แล้วคืนรูปที่ UI ใช้ — **RLS เป็นคนกรองว่าเห็นทริปไหนได้** */
export async function customPlacesOfTrip(db: Db, tripId: string): Promise<CustomPlace[]> {
  const { data, error } = await customPlaceRowsOfTrip(db, tripId);
  if (error) throw new Error(`อ่านคลังสถานที่ไม่ได้: ${error.message}`);
  return (data as unknown as CustomPlaceRow[] | null ?? []).map(toCustomPlace);
}

/** อ่านแถวเดียวหลังสร้าง — ใช้คิวรีตัวเดียวกับตอนอ่านทั้งลิสต์ **จึงได้ join ชุดเดียวกันแน่นอน** */
export async function oneCustomPlace(db: Db, tripId: string, id: string): Promise<CustomPlace> {
  const { data, error } = await customPlaceRowsOfTrip(db, tripId).eq("id", id).limit(1);
  if (error) throw new Error(`อ่านสถานที่ที่เพิ่งสร้างไม่ได้: ${error.message}`);
  const rows = (data as unknown as CustomPlaceRow[] | null) ?? [];
  if (rows.length === 0) throw new Error("สร้างแล้วแต่อ่านกลับไม่เจอ");
  return toCustomPlace(rows[0]);
}
