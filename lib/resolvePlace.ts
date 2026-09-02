import { PLACES, Place } from "@/data/places";
import { findTransferPoint } from "@/data/transferPoints";
import type { CustomPlace } from "@/lib/supabase";

/**
 * แปลง id รูปแบบ `hotel@{lat},{lng}` (สร้างจาก `hotelAnchorId`) กลับเป็น Place
 * คืน null ถ้าไม่ใช่รูปแบบนี้หรือพิกัดเสีย — ให้ resolvePlace ไปลองทางอื่นต่อ
 */
function parseHotelPlaceId(placeId: string): Place | null {
  if (!placeId.startsWith("hotel@")) return null;
  const [lat, lng] = placeId.slice("hotel@".length).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: placeId,
    nameTh: "ที่พัก",
    nameEn: "Accommodation",
    /**
     * 🔴 `null` = **ไม่รู้** · เคยเป็น `"seoul"` พร้อมคอมเมนต์ว่า *"ไม่ได้ใช้จริง"* จนถึง 2 ก.ย. 2026
     * → **โรงแรมที่โตเกียวประกาศตัวว่าอยู่โซล** และคอมเมนต์นั้นตรวจไม่ได้ · หมดอายุได้เงียบ ๆ
     * 🎯 รูปเดียวกับ `noHotel` ที่ *"ไม่มีใครส่งมา"* แล้วมีคนอ่านจริงภายหลัง (นับวันบินเป็นคืนที่ต้องมีโรงแรม)
     * — **ค่าที่ใส่เพราะ type บังคับ คือค่าที่จะมีคนอ่านวันหนึ่ง** · `E6-AC12` เปิดชนิดให้พูดว่า "ไม่รู้" ได้
     */
    city: null,
    category: "transport",
    descriptionTh: "แวะที่พัก (เช็คอิน / ฝากกระเป๋า / พัก)",
    lat,
    lng,
    mapsQuery: `${lat},${lng}`,
    youtubeQuery: "",
  };
}

export function resolvePlace(placeId: string, customPlaces: CustomPlace[]): Place | null {
  const known = PLACES.find((p) => p.id === placeId);
  if (known) return known;

  // สนามบิน/สถานีของแถว kind="transfer" — อยู่นอก PLACES เพื่อไม่ให้โผล่ในคลังสถานที่
  // แต่ต้อง resolve ได้ ไม่งั้น computeSchedule ถือว่าแถวนั้นไม่มีพิกัด แล้วเวลาเดินทางหายไปทั้งช่วง
  const transferPoint = findTransferPoint(placeId);
  if (transferPoint) return transferPoint;

  // แถว "แวะที่พัก" (kind="hotel") — id ฝังพิกัดมาในตัวเอง (ดู hotelAnchorId ใน lib/hotelLegs.ts)
  // จึง resolve ได้โดยไม่ต้องส่งตาราง trip_hotels เข้ามาทุกจุดที่เรียก resolvePlace (12 จุดทั่วโปรเจกต์)
  // ชื่อที่คืนเป็นชื่อกลางๆ — แถวจริงใน SortableStopRow โชว์ชื่อโรงแรมจาก trip_hotels ทับอีกที
  // ซึ่งอัปเดตตามเมื่อผู้ใช้เปลี่ยนโรงแรม ต่างจากชื่อที่ฝังใน id ที่จะค้างเป็นของเก่า
  const hotelPoint = parseHotelPlaceId(placeId);
  if (hotelPoint) return hotelPoint;

  const custom = customPlaces.find((p) => p.id === placeId);
  if (!custom) return null;

  return {
    id: custom.id,
    nameTh: custom.name_th,
    nameEn: custom.name_en ?? custom.name_th,
    city: custom.city,
    category: custom.category,
    descriptionTh: custom.description ?? "",
    lat: custom.lat,
    lng: custom.lng,
    mapsQuery: custom.maps_query,
    googlePlaceId: custom.google_place_id ?? null,
    youtubeQuery: custom.name_th,
  };
}
