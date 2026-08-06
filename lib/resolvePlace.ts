import { PLACES, Place } from "@/data/places";
import type { CustomPlace } from "@/lib/supabase";

export function resolvePlace(placeId: string, customPlaces: CustomPlace[]): Place | null {
  const known = PLACES.find((p) => p.id === placeId);
  if (known) return known;

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
