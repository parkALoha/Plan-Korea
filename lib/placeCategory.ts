import type { Category } from "@/data/places";

// แปลง primaryType ของ Google เป็นหมวดหมู่ของแอป — ใช้ตอนเพิ่มที่เที่ยวจาก "ที่เที่ยวในเมืองนี้"
// เข้าคลัง จะได้ไปอยู่กลุ่มที่ถูกต้อง (🏛️ วัฒนธรรม / 🌲 ธรรมชาติ / 🏖️ ชายหาด ...) โดยไม่ต้องเลือกเอง
const TYPE_TO_CATEGORY: Record<string, Category> = {
  beach: "beach",
  park: "nature",
  national_park: "nature",
  hiking_area: "nature",
  garden: "nature",
  botanical_garden: "nature",
  museum: "culture",
  art_gallery: "culture",
  historical_landmark: "culture",
  historical_place: "culture",
  cultural_landmark: "culture",
  monument: "culture",
  hindu_temple: "culture",
  buddhist_temple: "culture",
  church: "culture",
  observation_deck: "viewpoint",
  tourist_attraction: "viewpoint",
  amusement_park: "viewpoint",
  aquarium: "viewpoint",
  zoo: "viewpoint",
  market: "market",
  food_court: "market",
  shopping_mall: "shopping",
  department_store: "shopping",
  clothing_store: "shopping",
  cafe: "cafe",
  coffee_shop: "cafe",
  bakery: "cafe",
  bar: "nightlife",
  night_club: "nightlife",
  restaurant: "restaurant",
};

export function categoryFromGoogleType(
  googleType: string | null | undefined,
  fallback: Category = "viewpoint"
): Category {
  if (!googleType) return fallback;
  return TYPE_TO_CATEGORY[googleType] ?? fallback;
}
