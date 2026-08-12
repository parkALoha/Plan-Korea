"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Lang = "th" | "en";

const STORAGE_KEY = "trip-lang";

/**
 * พจนานุกรมของหน้า `/summary` เท่านั้น (ตัดสินใจไว้ในเฟส 16)
 *
 * ทำไมไม่แปลทั้งเว็บ: ไทยฝังอยู่ ~25 ไฟล์ แต่ภาษาอังกฤษมีประโยชน์จริงแค่ตอนยื่นเอกสารให้เจ้าหน้าที่
 * (ตม./K-ETA/เคาน์เตอร์โรงแรม) ซึ่งเกิดที่หน้าสรุปหน้าเดียว — โฟกัสหน้าเดียวได้ผลเต็มด้วยงาน ~20%
 * หน้าแผน/หน้าวันนี้ยังเป็นไทยล้วนตามที่ใช้กันอยู่จริง
 */
const DICT = {
  th: {
    backToPlan: "← หน้าแผน",
    today: "📍 วันนี้",
    exportJson: "⬇️ Export JSON",
    print: "🖨️ พิมพ์",
    summaryTitle: "📋 สรุปแผนเที่ยวเกาหลี",
    tripDates: "11 – 21 ต.ค. 2026",
    readOnlyNote: "หน้านี้ดูอย่างเดียว แก้ไขไม่ได้ (แก้ที่หน้าแผน)",
    stopsInTrip: "จุดทั้งทริป",
    days: "วัน",
    locked: "ล็อกแล้ว",
    plan: "แผน",
    loading: "กำลังโหลด...",
    hotelsAll: "🏨 ที่พักทั้งทริป",
    nights: "คืน",
    noHotelChosen: "⚠️ ยังไม่ได้เลือกที่พัก",
    bookingsAll: "🎫 ตั๋ว/booking ทั้งหมด",
    confirmationNumber: "เลขที่จอง",
    checklistTitle: "✅ ของที่ต้องเตรียม",
    dailyPlan: "📅 แผนรายวัน",
    daysWithoutStops: "ยังไม่มีจุดแวะ",
    fixedTimes: "✈️ เวลาตายตัวของวันนี้",
    departAt: "🕐 ออกเดินทาง",
    stayAt: "🏨 พักที่",
    travelDayNoHotel: "🛫 วันเดินทาง — ไม่มีคืนที่ต้องจอง",
    leaveFrom: "🏨 ออกจาก",
    backTo: "🏨 กลับถึง",
    noStopsToday: "ยังไม่มีจุดแวะในวันนี้",
    stayFor: "อยู่",
    minutes: "นาที",
    chosenBy: "เลือกโดย",
    stops: "จุด",
    meals: "มื้อ",
    travelTotal: "เดินทางรวม ~",
    km: "กม.",
    lockedShort: "🔒 ล็อกแล้ว",
    todaysBookings: "🎫 ตั๋ว/booking ของวันนี้",
    noPlaceData: "ไม่พบข้อมูลสถานที่",
    immigrationView: "🛂 หน้าสำหรับ ตม.",
    fullSummary: "📋 สรุปเต็ม",
  },
  en: {
    backToPlan: "← Planner",
    today: "📍 Today",
    exportJson: "⬇️ Export JSON",
    print: "🖨️ Print",
    summaryTitle: "📋 Korea Trip Summary",
    tripDates: "11 – 21 Oct 2026",
    readOnlyNote: "Read-only view — edit on the planner page",
    stopsInTrip: "stops",
    days: "days",
    locked: "locked",
    plan: "Plan",
    loading: "Loading...",
    hotelsAll: "🏨 Accommodation",
    nights: "nights",
    noHotelChosen: "⚠️ Not booked yet",
    bookingsAll: "🎫 Bookings",
    confirmationNumber: "Confirmation no.",
    checklistTitle: "✅ Packing checklist",
    dailyPlan: "📅 Day by day",
    daysWithoutStops: "days with no stops yet",
    fixedTimes: "✈️ Fixed schedule",
    departAt: "🕐 Depart",
    stayAt: "🏨 Staying at",
    travelDayNoHotel: "🛫 Travel day — no hotel needed",
    leaveFrom: "🏨 Leave",
    backTo: "🏨 Back at",
    noStopsToday: "No stops planned",
    stayFor: "Stay",
    minutes: "min",
    chosenBy: "added by",
    stops: "stops",
    meals: "meals",
    travelTotal: "travel ~",
    km: "km",
    lockedShort: "🔒 Locked",
    todaysBookings: "🎫 Bookings today",
    noPlaceData: "Place data missing",
    immigrationView: "🛂 Immigration sheet",
    fullSummary: "📋 Full summary",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type TKey = keyof (typeof DICT)["th"];

function isLang(value: string | null): value is Lang {
  return value === "th" || value === "en";
}

// ภาษาที่จำไว้ใน localStorage เก็บเป็น external store แทน useState — เขียนจาก effect ได้โดยไม่ชน
// eslint `react-hooks/set-state-in-effect` (ปัญหาเดียวกับที่ hooks/useMediaQuery.ts เจอตอนเฟส 9.3
// แล้วแก้ด้วย useSyncExternalStore เหมือนกัน) และ SSR คืน "th" เสมอผ่าน getServerSnapshot
const storeListeners = new Set<() => void>();

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "th";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isLang(saved) ? saved : "th";
}

function writeStoredLang(lang: Lang) {
  window.localStorage.setItem(STORAGE_KEY, lang);
  for (const listener of storeListeners) listener();
}

function subscribeStoredLang(onChange: () => void) {
  storeListeners.add(onChange);
  return () => {
    storeListeners.delete(onChange);
  };
}

const serverLang = (): Lang => "th";

/**
 * ภาษาที่กำลังใช้บนหน้านี้ ตามลำดับความสำคัญ: `?lang=` ใน URL → ที่จำไว้ใน localStorage → ไทย
 *
 * ต้องเรียกใต้ `<Suspense>` เท่านั้น เพราะ `useSearchParams` ทำให้ subtree ถึงขอบ Suspense ที่ใกล้ที่สุด
 * ถูกเรนเดอร์ฝั่ง client ล้วน (ดู `node_modules/next/dist/docs/.../use-search-params.md`)
 * — ซึ่งกลับเป็นผลดี: อ่าน localStorage ตอน initial state ได้เลยโดยไม่เกิด hydration mismatch
 */
export function useLang() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paramLang = searchParams.get("lang");

  const stored = useSyncExternalStore(subscribeStoredLang, readStoredLang, serverLang);

  const lang: Lang = isLang(paramLang) ? paramLang : stored;

  // เปิดลิงก์ที่พก ?lang= มา = ตั้งใจใช้ภาษานั้น จำไว้ให้ครั้งต่อไปที่เปิดโดยไม่มีพารามิเตอร์
  useEffect(() => {
    if (isLang(paramLang)) writeStoredLang(paramLang);
  }, [paramLang]);

  // เขียนภาษาลง URL ด้วยเสมอ เพื่อให้ลิงก์ที่แชร์/บุ๊กมาร์กพกภาษาติดไปเอง
  const setLang = useCallback(
    (next: Lang) => {
      writeStoredLang(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("lang", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const t = useCallback((key: TKey) => DICT[lang][key], [lang]);

  return { lang, setLang, t };
}
