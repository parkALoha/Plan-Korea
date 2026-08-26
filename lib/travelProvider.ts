import type { TravelMode } from "@/lib/schedule";

export type RealTravelTime = {
  durationMinutes: number;
  distanceMeters: number | null;
};

/**
 * 🔴 **ผลของการถามผู้ให้บริการ — แยก "ไม่มีเส้นทาง" ออกจาก "ถามไม่สำเร็จ"** (P1 · 27 ส.ค. 2026)
 *
 * ## ปัญหาที่มันแก้
 * `fetchRealTravelTime()` คืน `null` ให้ **4 สาเหตุที่ต่างกันมาก**:
 * ① ไม่มีคีย์ ② `!res.ok` (เน็ต/quota/500) ③ Google บอกว่า**ไม่มีเส้นทาง** ④ แปลงเวลาไม่ได้
 * · คอมเมนต์ในไฟล์เขียนไว้ว่า *"คืน null เมื่อ Google ไม่มีเส้นทางให้โหมดนั้น"* — **จริงข้อเดียวจากสี่ข้อ** (`D82`)
 *
 * 🎯 **และมันทำให้ `estimateReason` ที่ `copilot-spec.md §28` เพิ่งออกแบบไว้ *ทำไม่ได้เลย***
 * P5 แยก `no_real_data` (ถาวร → *"อย่ารอ"*) ออกจาก `provider_failed` (ชั่วคราว → *"ลองใหม่"*)
 * **ข้อมูลที่ใช้แยกถูกทำลายตรงบรรทัดนี้ ก่อนถึงชั้นที่ต้องใช้มัน**
 * · P7 มาถึงข้อสรุปเดียวกันจากฝั่งแคช: *"แคชเป็นบันทึกว่ายิงแล้วได้อะไรกลับมา"*
 *   — บันทึกที่เขียนว่า `null` เฉย ๆ **ไม่ได้บันทึกอะไรเลย**
 *
 * ⚠️ **`not_configured` แยกจาก `provider_failed` โดยตั้งใจ** — ไม่มีคีย์คือปัญหาของ*เรา*
 * ไม่ใช่ของผู้ให้บริการ · ถ้ายุบรวมกัน **สภาพแวดล้อมที่ตั้งค่าไม่ครบจะดูเหมือน Google ล่ม**
 */
export type TravelTimeOutcome =
  | { ok: true; value: RealTravelTime }
  /** ผู้ให้บริการตอบแล้วว่า **ไม่มีเส้นทาง** สำหรับโหมดนี้ — ถาวร ไม่ต้องลองใหม่ */
  | { ok: false; reason: "no_route" }
  /** ถามไม่สำเร็จ (เน็ต · quota · 5xx · คำตอบผิดรูป) — **ชั่วคราว ลองใหม่ได้** */
  | { ok: false; reason: "provider_failed" }
  /** ไม่มีคีย์ในสภาพแวดล้อมนี้ — **ปัญหาของเรา ไม่ใช่ของผู้ให้บริการ** */
  | { ok: false; reason: "not_configured" };

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
  const outcome = await fetchRealTravelTimeOutcome(origin, destination, mode);
  return outcome.ok ? outcome.value : null;
}

/**
 * รุ่นที่**บอกด้วยว่าทำไมไม่ได้ค่า** — ดู `TravelTimeOutcome`
 * 🔴 ตัวเก่า (`fetchRealTravelTime`) เป็นเปลือกบางของตัวนี้ **ไม่ใช่โค้ดคนละชุด**
 *    ผู้เรียกเดิมไม่ต้องแก้ · และ **ไม่มีทางที่สองตัวจะเดินคนละตรรกะได้** (ซึ่งเป็นสิ่งที่กัดทีมนี้มาทั้งวัน)
 */
export async function fetchRealTravelTimeOutcome(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode
): Promise<TravelTimeOutcome> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  let res: Response;
  try {
    res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
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
  } catch {
    // ⚠️ `fetch` **โยน** ตอนเน็ตหลุด/DNS ล้ม — ไม่ได้คืน response ที่ `!ok`
    //    ฉบับก่อนหน้าไม่ดัก → error หลุดขึ้นไปถึงผู้เรียกแทนที่จะเป็น `null` ตามสัญญาของฟังก์ชัน
    return { ok: false, reason: "provider_failed" };
  }

  if (!res.ok) return { ok: false, reason: "provider_failed" };

  let data: { routes?: { duration?: unknown; distanceMeters?: number | null }[] };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "provider_failed" };
  }

  const route = data.routes?.[0];
  // 🔴 **`200` + ไม่มี route = "ไม่มีเส้นทาง" ไม่ใช่ "ถามไม่สำเร็จ"** — นี่คือเคสของเกาหลี/`drive`
  //    ผู้ให้บริการ *ตอบแล้ว* ว่าให้ไม่ได้ · ลองใหม่กี่ครั้งก็ได้คำตอบเดิม
  if (!route?.duration) return { ok: false, reason: "no_route" };

  const seconds = parseInt(String(route.duration).replace("s", ""), 10);
  // ⚠️ ตอบมาแล้วแต่แปลงไม่ได้ = **คำตอบผิดรูป** → เป็นความล้มเหลวของการถาม ไม่ใช่ "ไม่มีเส้นทาง"
  if (!Number.isFinite(seconds)) return { ok: false, reason: "provider_failed" };

  return {
    ok: true,
    value: {
      durationMinutes: Math.round(seconds / 60),
      distanceMeters: route.distanceMeters ?? null,
    },
  };
}
