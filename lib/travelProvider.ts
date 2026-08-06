import type { TravelMode } from "@/lib/schedule";

export type RealTravelTime = {
  durationMinutes: number;
  distanceMeters: number | null;
};

const GOOGLE_TRAVEL_MODE: Record<TravelMode, string> = {
  walk: "WALK",
  transit: "TRANSIT",
  drive: "DRIVE",
};

/**
 * เรียก Routes API (New) computeRoutes — ตัวแทน Distance Matrix เดิมที่เป็น legacy API
 * (โปรเจกต์นี้ห้ามเรียก maps.googleapis.com/maps/api/* ดู AGENTS.md)
 *
 * คืน null เมื่อ Google ไม่มีเส้นทางให้โหมดนั้น (พบบ่อยกับ WALK/DRIVE ในเกาหลีใต้ เพราะกฎหมาย
 * ส่งออกข้อมูลแผนที่ — ดู PLAN.md หัวข้อ "ข้อจำกัดสำคัญ") ผู้เรียกต้อง fallback เป็นค่าประมาณการเอง
 */
export async function fetchRealTravelTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode
): Promise<RealTravelTime | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: GOOGLE_TRAVEL_MODE[mode],
      ...(mode === "drive" ? { routingPreference: "TRAFFIC_AWARE" } : {}),
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route?.duration) return null;

  const seconds = parseInt(String(route.duration).replace("s", ""), 10);
  if (!Number.isFinite(seconds)) return null;

  return {
    durationMinutes: Math.round(seconds / 60),
    distanceMeters: route.distanceMeters ?? null,
  };
}
