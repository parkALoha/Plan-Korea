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
    city: "seoul", // ไม่ได้ใช้จริง — แถวที่พักไม่เคยถูกกรองตามเมือง แต่ type บังคับให้ใส่
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
    city: custom.city as Place["city"],
    category: custom.category as Place["category"],
    descriptionTh: custom.description ?? "",
    lat: custom.lat,
    lng: custom.lng,
    mapsQuery: custom.maps_query,
    youtubeQuery: custom.name_th,
  };
}
