import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// ใช้ URL/key ปลอมตอนยังไม่ตั้งค่า .env.local เพื่อไม่ให้แอปพังตั้งแต่โหลดหน้า
// (ทุกจุดที่เรียกจริงต้องเช็ค supabaseConfigured ก่อนเสมอ)
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

export type TripHotel = {
  leg_id: string;
  city: string;
  hotel_name: string;
  formatted_address: string | null;
  lat: number;
  lng: number;
  updated_at: string;
  /** ชื่อ/ที่อยู่ภาษาท้องถิ่นของที่พัก (migration 0026) — ส่งเข้า Naver/Kakao และให้คนขับแท็กซี่ดู
   *  ปิดงานค้างของเฟส 14 ที่ทำให้จุดแวะไปแล้วแต่ที่พักยังส่งชื่อไทยอยู่
   *  optional เพราะแถวที่บันทึกไว้ก่อน migration จะไม่มีค่าเหล่านี้ (ต้องกดบันทึกที่พักใหม่ถึงจะเติมให้) */
  name_local?: string | null;
  address_local?: string | null;
  /** ชื่อ/ที่อยู่ภาษาอังกฤษ + เบอร์โทร — ช่อง "ที่พักในเกาหลี" ของ ตม./K-ETA ต้องกรอกเป็นอังกฤษ (เฟส 16) */
  name_en?: string | null;
  address_en?: string | null;
  phone?: string | null;
};

/** ข้อมูลหลายภาษาของที่พักที่ /api/geocode?locale=... ดึงมาให้ตอนบันทึก — null ได้ทุกช่อง */
export type HotelLocalized = {
  nameLocal: string | null;
  addressLocal: string | null;
  nameEn: string | null;
  addressEn: string | null;
  phone: string | null;
};

export type TripPlan = {
  id: string;
  name: string;
  created_at: string;
};

export type CustomPlace = {
  id: string;
  added_by: string | null;
  city: string;
  name_th: string;
  name_en: string | null;
  /** ชื่อเกาหลี (migration 0029) — ใช้โชว์คนขับแท็กซี่/ค้นใน Naver-Kakao · optional เพราะแถวเก่า
   *  ก่อน migration ยังเป็น null จนกว่าจะกดบันทึกสถานที่นั้นใหม่ */
  name_ko?: string | null;
  category: string;
  lat: number;
  lng: number;
  maps_query: string;
  /** Google place id ของสถานที่นี้ (migration 0027) — เก็บตอนกดเพิ่มจากลิสต์ค้นหา/แนะนำ
   *  optional เพราะแถวที่บันทึกไว้ก่อน migration ยังเป็น null จนกว่าสคริปต์ backfill จะเติมให้ */
  google_place_id?: string | null;
  description: string | null;
  created_at: string;
};

/**
 * โน้ต/รูปที่ฝากไว้กับสถานที่ในคลัง ระหว่างที่มันไม่ได้อยู่ในวันไหนของแผนนี้ (migration 0028)
 * ย้ายมาจากแถว trip_stops ตอนลากกลับคลัง แล้วย้ายกลับไปตอนลากลงวันอีกครั้ง — ดู hooks/usePlaceNotes.ts
 */
export type PlaceNote = {
  plan_id: string;
  place_id: string;
  note: string | null;
  photo_url: string | null;
  updated_at: string;
};

export type TripStop = {
  id: string;
  plan_id: string;
  day_id: string;
  place_id: string;
  order_index: number;
  dwell_minutes: number | null;
  /** โหมดเดินทางมาจุดนี้จากจุดก่อนหน้าในวันเดียวกัน — "walk" | "transit" | "drive" | null (ยังไม่เลือก) */
  travel_mode: string | null;
  /** โน้ตสั้นๆ ที่จดเอง เช่น "ร้านนี้อร่อย รีบไป" — null/ว่าง = ไม่มีโน้ต */
  note: string | null;
  /** รูปหน้างานที่ถ่ายเอง เก็บใน bucket booking-files เดียวกับไฟล์แนบ booking — null = ไม่มีรูป
   *  optional เพราะแถวเก่าจาก state fallback ตอนยังไม่ได้ตั้งค่า Supabase อาจไม่มีฟิลด์นี้ */
  photo_url?: string | null;
  added_by: string | null;
  updated_at: string;
  /** "place" (ปกติ) | "intercity" (แถวเดินทางข้ามเมือง กินเวลาใน timeline แต่ไม่ใช่สถานที่)
   *  | "transfer" (ไปสนามบิน/สถานี — มี place_id จริงจาก data/transferPoints.ts เวลาเดินทางจึงเป็นของจริง)
   *  | "hotel" (แวะที่พักกลางวัน เช็คอิน/ฝากกระเป๋า — place_id ฝังพิกัดที่พักไว้ในตัว `hotel@lat,lng`)
   *  optional เพราะแถวเก่าจาก state fallback ตอนยังไม่ได้ตั้งค่า Supabase อาจไม่มีฟิลด์นี้ — ให้ถือเป็น "place"
   *  หมายเหตุ: คอลัมน์ `kind` ใน DB เป็น text อิสระ ไม่มี CHECK constraint — เพิ่มค่าใหม่ไม่ต้อง migration */
  kind?: "place" | "intercity" | "transfer" | "hotel";
  /** ใช้เมื่อ kind === "intercity" — เมืองต้นทาง/ปลายทางของช่วงเดินทางนี้ (ข้อความอิสระ) */
  intercity_from?: string | null;
  intercity_to?: string | null;
  /** ใช้เมื่อ kind === "intercity" — "bus" | "ktx" | "other" */
  intercity_mode?: string | null;
  /** ใช้เมื่อ kind === "transfer" (migration 0025) — เวลาที่ต้องไปให้ทัน "HH:MM" เช่น เวลาบิน
   *  ว่าง = ไม่มีเดดไลน์ เป็นแค่แถวเดินทางไปสนามบินเฉยๆ */
  transfer_target_time?: string | null;
  /** ป้ายกำกับสิ่งที่ต้องไปให้ทัน เช่น "VN409 อินชอน → โฮจิมินห์" */
  transfer_target_label?: string | null;
  /** เวลาจริงที่มาถึงจุดนี้ ติ๊กจากหน้า "วันนี้" (เฟส 6) — null = ยังไม่มาถึง
   *  optional เพราะแถวเก่าจาก state fallback ตอนยังไม่ได้ตั้งค่า Supabase อาจไม่มีฟิลด์นี้ */
  visited_at?: string | null;
};

export type BookingCategory = "flight" | "hotel" | "ktx" | "bus" | "ticket" | "other";

/** 'walk_up' = ซื้อหน้างาน ไม่ต้องจองล่วงหน้า (migration 0031) — ต่างจาก booked ที่แปลว่า "ทำแล้ว"
 *  ก่อนมีค่านี้ ของที่ซื้อหน้างานต้องยัดเป็น booked แล้วเขียน "ซื้อหน้างาน — " นำหน้า title เอาเอง
 *  ทำให้ตัวเลข "จองแล้ว" นับของที่ยังไม่ได้จองรวมไปด้วย */
export type BookingStatus = "booked" | "pending" | "walk_up";

/** Supabase Storage bucket สำหรับไฟล์แนบตั๋ว (ตั้งสาธารณะเหมือน RLS ของตารางอื่น) */
export const BOOKING_FILES_BUCKET = "booking-files";

export type TripBooking = {
  id: string;
  category: BookingCategory;
  title: string;
  day_id: string | null;
  date: string | null;
  time: string | null;
  confirmation_number: string | null;
  link: string | null;
  note: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  file_url: string | null;
  file_name: string | null;
  /** จองแล้ว/รอจอง (migration 0030) — default 'booked' ฝั่ง DB เพราะแถวเก่าส่วนใหญ่มีเลขที่จองอยู่แล้ว */
  status: BookingStatus;
  /** ต้องจองล่วงหน้ากี่วันก่อนวันที่ใช้ตั๋ว (คอลัมน์ `date`) — ใช้คำนวณวันครบกำหนดจอง ดู lib/bookingDeadline.ts
   *  null = ยังไม่รู้/ไม่มีกำหนด */
  book_by_days_before: number | null;
};

export type ChecklistCategory = "packing" | "before_hotel_checkout" | "before_flight";

export type ChecklistItem = {
  id: string;
  text: string;
  is_checked: boolean;
  checked_by: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  category: ChecklistCategory;
};

export type TripDaySettings = {
  plan_id: string;
  day_id: string;
  /** เวลาที่ "ออกจากที่พัก" ของวันนั้น (ไม่ใช่เวลาถึงจุดแวะแรก) */
  start_time: string;
  /**
   * โหมดเดินทางขากลับจากจุดแวะสุดท้าย → ที่พักคืนนั้น
   * undefined ได้เมื่อ migration 0015 ยังไม่ถูกรัน — ถือเท่ากับ null (ใช้ค่าประมาณ)
   */
  return_travel_mode?: string | null;
  /**
   * true = วันนี้ถูกล็อกไว้ (ลงตัวแล้ว) แก้/ลาก/เพิ่มจุดแวะไม่ได้จนกว่าจะปลดล็อก
   * undefined ได้เมื่อ migration 0021 ยังไม่ถูกรัน — ถือเท่ากับ false
   */
  is_locked?: boolean;
};
