/**
 * เติม custom_places.google_place_id ให้แถวที่บันทึกไว้ก่อน migration 0027
 *
 * ค้นด้วย "ชื่อที่บันทึกไว้ + กรอบพิกัดรอบจุดที่บันทึกไว้" (locationRestriction ~500 ม.) จึงไม่มีทาง
 * ได้ร้านชื่อเดียวกันคนละประเทศเหมือนที่ /api/place-details เคยเจอ แล้วเลือกผลที่ใกล้พิกัดเดิมที่สุด
 * ผลไหนห่างเกิน 300 ม. ถือว่าไม่ชัวร์ ข้ามไป (ปล่อยเป็น null = ระบบตกไปใช้ชื่อค้นเหมือนเดิม)
 *
 *   node scripts/backfill-place-ids.mjs          # ดูอย่างเดียว ไม่เขียนอะไร
 *   node scripts/backfill-place-ids.mjs --write  # เขียนลง Supabase จริง
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_KEY = env.GOOGLE_MAPS_API_KEY;
const WRITE = process.argv.includes("--write");

/** ระยะที่ยอมรับว่าเป็นร้านเดียวกันกับที่บันทึกไว้ */
const MAX_DISTANCE_METERS = 300;
/** กรอบค้นหารอบพิกัดเดิม — กว้างกว่าเกณฑ์ด้านบนเล็กน้อยเผื่อพิกัดที่ Google เก็บขยับไปนิดหน่อย */
const SEARCH_RADIUS_METERS = 500;

function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function rectangleAround({ lat, lng }, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    low: { latitude: lat - latDelta, longitude: lng - lngDelta },
    high: { latitude: lat + latDelta, longitude: lng + lngDelta },
  };
}

async function supabaseFetch(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function findPlaceId(row) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: row.maps_query,
      languageCode: "th",
      locationRestriction: { rectangle: rectangleAround(row, SEARCH_RADIUS_METERS) },
    }),
  });
  if (!res.ok) return { error: `google ${res.status}` };

  const { places = [] } = await res.json();
  const scored = places
    .filter((p) => p.location)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      meters: distanceMeters(row, { lat: p.location.latitude, lng: p.location.longitude }),
    }))
    .sort((a, b) => a.meters - b.meters);

  const best = scored[0];
  if (!best) return { error: "ไม่พบผลลัพธ์ในกรอบพิกัด" };
  if (best.meters > MAX_DISTANCE_METERS) return { error: `ผลที่ใกล้สุดห่าง ${Math.round(best.meters)} ม.` };
  return { best };
}

const rows = await supabaseFetch("custom_places?select=id,name_th,maps_query,lat,lng,google_place_id");
const todo = rows.filter((r) => !r.google_place_id);
console.log(`custom_places ทั้งหมด ${rows.length} แถว · ยังไม่มี place id ${todo.length} แถว`);
if (!WRITE) console.log("(โหมดดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)\n");

let filled = 0;
let skipped = 0;
for (const row of todo) {
  const { best, error } = await findPlaceId(row);
  if (error) {
    console.log(`  ✗ ${row.name_th} — ${error}`);
    skipped++;
    continue;
  }
  console.log(`  ✓ ${row.name_th} → ${best.id}  (${Math.round(best.meters)} ม. · ${best.address})`);
  if (WRITE) {
    await supabaseFetch(`custom_places?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ google_place_id: best.id }),
    });
  }
  filled++;
}

console.log(`\nเติมได้ ${filled} แถว · ข้าม ${skipped} แถว${WRITE ? "" : " (ยังไม่ได้เขียนลง DB)"}`);
