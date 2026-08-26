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

// Google ส่ง primaryType ที่ไม่อยู่ในตารางข้างบนมาบ่อยมาก โดยเฉพาะร้านอาหารที่แยกตามสัญชาติ
// (korean_restaurant, vietnamese_restaurant, ...) ถ้าไม่ดักไว้จะตกไปเป็น fallback หมด
// = ร้านอาหารไปโผล่หมวดจุดชมวิว เช็คหลัง exact match เสมอ (food_court ต้องเป็น market ไม่ใช่ shopping)
const PATTERN_RULES: [RegExp, Category][] = [
  [/_restaurant$|^restaurant_|_food$/, "restaurant"],
  [/cafe|coffee|_bakery$/, "cafe"],
  [/_market$|_grocery_store$|food_court/, "market"],
  [/_store$|_shop$|shopping/, "shopping"],
  [/_bar$|_club$|karaoke/, "nightlife"],
  [/temple|shrine|_church$|mosque|museum|historical/, "culture"],
  [/park$|garden|forest|mountain|trail/, "nature"],
];

export function categoryFromGoogleType(
  googleType: string | null | undefined,
  fallback: Category = "viewpoint"
): Category {
  if (!googleType) return fallback;
  // 🔴 `Object.hasOwn` จำเป็น — ค่านี้มาจาก **การตอบกลับของ Google** ไม่ใช่จากโค้ดเรา
  //    ฉบับก่อนหน้าเขียน `TYPE_TO_CATEGORY[googleType]` ตรง ๆ → `"constructor"` คืน
  //    **ฟังก์ชัน `Object` ออกมาเป็น `Category`** (truthy → ผ่าน `if (exact)` ไปเลย)
  //    แล้วมันจะไหลไปเป็นคีย์ของอีโมจิ/ตัวกรองหมวด ซึ่งไม่มีใครเช็คอีกชั้น
  // ⚠️ **Google ไม่ส่งค่านี้มา — แต่นั่นคือคุณสมบัติของ *Google* ไม่ใช่ของโค้ดเรา**
  //    (ตัวที่ 3 ของวัน · ตัวแรก `countryOfCitySlug` ตัวที่สอง `capabilitiesOf`)
  const exact = Object.hasOwn(TYPE_TO_CATEGORY, googleType) ? TYPE_TO_CATEGORY[googleType] : undefined;
  if (exact) return exact;
  for (const [pattern, category] of PATTERN_RULES) {
    if (pattern.test(googleType)) return category;
  }
  return fallback;
}
