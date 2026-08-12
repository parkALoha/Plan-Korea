import type { Place } from "@/data/places";

/**
 * สนามบิน/สถานีปลายทางของแถว "✈️ ไปสนามบิน" (`trip_stops.kind = "transfer"`)
 *
 * แยกจาก `PLACES` โดยตั้งใจ — สนามบินไม่ใช่ที่เที่ยว ไม่ควรโผล่ในคลังสถานที่ให้เลือกเพิ่มลงวัน
 * แต่ต้อง resolve เป็น `Place` ได้ (ดู `lib/resolvePlace.ts`) เพื่อให้ `computeSchedule` +
 * Routes API คำนวณเวลาเดินทางจริงจากจุดก่อนหน้าไปสนามบินให้เอง แทนที่จะให้กรอกตัวเลขเดาเอง
 *
 * `nameLocal`/`addressLocal` มาจากชื่อ/ที่อยู่ทางการของสนามบินนั้น — ใช้ทั้งปุ่มนำทาง Naver/Kakao
 * และการ์ด "ยื่นให้คนขับดู" (เฟส 14) เหมือนสถานที่ปกติทุกอย่าง
 */
export const TRANSFER_POINTS: Place[] = [
  {
    id: "airport-han",
    nameTh: "สนามบินโหน่ยบ่าย (HAN)",
    nameEn: "Noi Bai International Airport",
    nameLocal: "Sân bay quốc tế Nội Bài",
    addressLocal: "Phú Minh, Sóc Sơn, Hà Nội, Việt Nam",
    city: "hanoi",
    category: "transport",
    descriptionTh: "สนามบินฮานอย — อาคารระหว่างประเทศคือ T2 (VN610 ลง / VN428 ขึ้น)",
    lat: 21.2212,
    lng: 105.8072,
    mapsQuery: "Noi Bai International Airport Terminal 2",
    youtubeQuery: "Noi Bai airport terminal 2 guide",
  },
  {
    id: "airport-pus",
    nameTh: "สนามบินกิมแฮ (PUS)",
    nameEn: "Gimhae International Airport",
    nameLocal: "김해국제공항",
    addressLocal: "부산광역시 강서구 공항진입로 108",
    city: "busan",
    category: "transport",
    descriptionTh: "สนามบินปูซาน — เข้าเมืองด้วยสาย BGL ต่อรถไฟฟ้าสาย 2 หรือลิมูซีนบัส",
    lat: 35.1795,
    lng: 128.9382,
    mapsQuery: "Gimhae International Airport",
    youtubeQuery: "Gimhae airport to Busan city",
  },
  {
    id: "airport-icn",
    nameTh: "สนามบินอินชอน (ICN)",
    nameEn: "Incheon International Airport",
    nameLocal: "인천국제공항",
    addressLocal: "인천광역시 중구 공항로 272",
    city: "seoul",
    category: "transport",
    descriptionTh: "สนามบินโซล — AREX จากสถานีโซลถึง T1 ก่อนแล้วต่อไป T2 (เช็คอาคารของ VN409 ก่อนเดินทาง)",
    lat: 37.4491,
    lng: 126.4506,
    mapsQuery: "Incheon International Airport Terminal 1",
    youtubeQuery: "Incheon airport AREX guide",
  },
];

export function findTransferPoint(id: string): Place | null {
  return TRANSFER_POINTS.find((p) => p.id === id) ?? null;
}
