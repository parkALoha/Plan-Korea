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

export type TripSelection = {
  slot_id: string;
  day_id: string;
  place_id: string;
  selected_by: string | null;
  updated_at: string;
};

export type TripHotel = {
  leg_id: string;
  city: string;
  hotel_name: string;
  formatted_address: string | null;
  lat: number;
  lng: number;
  updated_at: string;
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
  category: string;
  lat: number;
  lng: number;
  maps_query: string;
  description: string | null;
  created_at: string;
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
  added_by: string | null;
  updated_at: string;
  /** "place" (ปกติ) | "intercity" (แถวเดินทางข้ามเมือง กินเวลาใน timeline แต่ไม่ใช่สถานที่)
   *  optional เพราะแถวเก่าจาก state fallback ตอนยังไม่ได้ตั้งค่า Supabase อาจไม่มีฟิลด์นี้ — ให้ถือเป็น "place" */
  kind?: "place" | "intercity";
  /** ใช้เมื่อ kind === "intercity" — เมืองต้นทาง/ปลายทางของช่วงเดินทางนี้ (ข้อความอิสระ) */
  intercity_from?: string | null;
  intercity_to?: string | null;
  /** ใช้เมื่อ kind === "intercity" — "bus" | "ktx" | "other" */
  intercity_mode?: string | null;
  /** เวลาจริงที่มาถึงจุดนี้ ติ๊กจากหน้า "วันนี้" (เฟส 6) — null = ยังไม่มาถึง
   *  optional เพราะแถวเก่าจาก state fallback ตอนยังไม่ได้ตั้งค่า Supabase อาจไม่มีฟิลด์นี้ */
  visited_at?: string | null;
};

export type BookingCategory = "flight" | "hotel" | "ktx" | "bus" | "ticket" | "other";

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
};

export type ChecklistItem = {
  id: string;
  text: string;
  is_checked: boolean;
  checked_by: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
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
