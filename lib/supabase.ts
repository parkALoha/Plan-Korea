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
};

export type TripDaySettings = {
  plan_id: string;
  day_id: string;
  start_time: string;
};
