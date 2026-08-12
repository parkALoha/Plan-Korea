import { PLACES, Place } from "@/data/places";
import { findTransferPoint } from "@/data/transferPoints";
import type { CustomPlace } from "@/lib/supabase";

export function resolvePlace(placeId: string, customPlaces: CustomPlace[]): Place | null {
  const known = PLACES.find((p) => p.id === placeId);
  if (known) return known;

  // สนามบิน/สถานีของแถว kind="transfer" — อยู่นอก PLACES เพื่อไม่ให้โผล่ในคลังสถานที่
  // แต่ต้อง resolve ได้ ไม่งั้น computeSchedule ถือว่าแถวนั้นไม่มีพิกัด แล้วเวลาเดินทางหายไปทั้งช่วง
  const transferPoint = findTransferPoint(placeId);
  if (transferPoint) return transferPoint;

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
