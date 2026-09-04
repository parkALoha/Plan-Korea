"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Lang = "th" | "en";

const STORAGE_KEY = "trip-lang";

/**
 * ไฟล์นี้มี **2 ขอบเขตแยกกัน** (P1 27 ส.ค. 2026 — แก้หัวคอมเมนต์นี้เพราะเคยมีแค่ขอบเขตเดียว
 * แล้วเกือบทำให้ไฟล์นี้ "โกหก" เรื่องขอบเขตตัวเองตอนมีขอบเขตที่สองเพิ่มเข้ามา):
 *
 * ① `DICT`/`useLang()` ด้านล่าง — **พจนานุกรมของหน้า `/summary` เท่านั้น** (ตัดสินใจไว้ในเฟส 16)
 *    มี TH/EN คู่กันเพราะหน้านั้นมีปุ่มสลับภาษาจริง (ยื่นเอกสาร ตม./K-ETA/เคาน์เตอร์โรงแรม)
 *    ทำไมไม่แปลทั้งเว็บ: ไทยฝังอยู่ ~25 ไฟล์ แต่อังกฤษมีประโยชน์จริงแค่หน้านี้หน้าเดียว —
 *    โฟกัสหน้าเดียวได้ผลเต็มด้วยงาน ~20% หน้าแผน/หน้าวันนี้ยังเป็นไทยล้วนตามที่ใช้กันอยู่จริง
 *
 * ② `E5_COPY` ท้ายไฟล์ — **ข้อความของ UI ใหม่ฝั่ง `E5`** (Home ฯลฯ) ที่ยังไม่มีปุ่มสลับภาษาเลย
 *    `E5-AC7` สั่งว่าโค้ดใหม่ต้องรวมข้อความไว้ที่เดียว ไม่กระจายเป็น `COPY` ท้องถิ่นทีละไฟล์ — ถ้าให้
 *    กระจาย พอ `E5` มีหลาย component จะกลับไปเป็นสภาพ "ไทยฝังกระจาย 30+ ไฟล์" ที่ `D3` บันทึกไว้
 *    ไม่รวมเข้า `DICT` ด้านบนเพราะนั่นผูกกับตัวสลับภาษาของ `/summary` โดยเฉพาะ ยัดเข้าไปจะต้องเขียน
 *    คำแปล EN ที่ไม่มีใครใช้ — มี TH อย่างเดียวไปก่อน EN มาทีเดียวตอน `M2` (`D20`)
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

/**
 * ข้อความของ UI ใหม่ฝั่ง `E5` — ดูขอบเขต ② ที่หัวไฟล์ ทำไมแยกจาก `DICT` ข้างบน
 *
 * ยังไม่มีปุ่มสลับภาษา — export เป็นออบเจกต์ธรรมดา ไม่ผ่าน `useLang()`/`t()` เหมือน `/summary`
 * เพิ่ม `en` เมื่อไหร่ค่อยเปลี่ยนรูปให้ตรงกับ `DICT` ตอนนั้น (`M2`)
 */
export const E5_COPY = {
  home: {
    greeting: (name: string) => `สวัสดี คุณ${name}`,
    login: "เข้าสู่ระบบ",
    account: "บัญชี",
    upcomingTrips: "แพลนทริปที่จะมาถึง",
    newTrip: "+ สร้างทริปใหม่",
    noTripsYet: "ยังไม่มีทริป — สร้างทริปแรกก่อนเริ่มวางแผน",
    readOnlyFab: "ระบบปิดรับการแก้ไขชั่วคราว — สร้างทริปตอนนี้ไม่ได้",
    tripsUnreadable: "⚠️ เปิดรายการทริปไม่ได้ตอนนี้ — เน็ตอาจสะดุด ทริปของคุณยังอยู่",
    retry: "ลองใหม่",
    /** ทูลทิปตอนนับสมาชิกไม่ได้ — อยู่ใน `title=` จึงรอดสายตามาตลอด (ดู `createTrip` ข้างล่าง) */
    memberCountUnknown: "อ่านจำนวนสมาชิกไม่ได้ — คาดว่ามีอย่างน้อย 1 คนเสมอ",
  },
  /**
   * ฟอร์มสร้างทริป
   * 🔴 ไฟล์ `CreateTripForm.tsx` ลงมาตั้งแต่ 27 ส.ค. 00:16 ในคอมมิตของ `E5` เอง พร้อมไทย hardcode
   * ในเนื้อ JSX ครบชุด · `E5-AC7` ("โค้ดใหม่ของ E5 ห้ามมีไทย hardcode") ถูกติ๊กเวลา 10:20 วันเดียวกัน
   * โดยวัดเฉพาะหน้า Home → **เกณฑ์เท็จตั้งแต่วินาทีที่ติ๊ก ไม่ใช่เพี้ยนทีหลัง** (P2 วัดย้อนหลัง 28 ส.ค.)
   * 📌 รอบนี้ย้ายเฉพาะ 3 จุดที่ด่านจับได้ ตามที่ผู้ใช้ตัดสิน — ที่เหลือในไฟล์นั้นยังรอคิว
   */
  createTrip: {
    startLabel: "เริ่ม",
    endLabel: "สิ้นสุด",
  },
  /**
   * ตัวเลือกจุดหมาย — ผู้ใช้สั่ง 28 ส.ค. 2026: *"ควรให้เลือกประเทศ และ เลือกเมือง และกด + เมือง/ประเทศได้
   * แต่ต้องอยู่ในลิสของเรา — เผื่อ ต่อเครื่อง หรือบินต่อ"* (เดิมเป็นช่องค้นข้อความช่องเดียว ไม่แยกประเทศ)
   */
  /** ข้อความของคอมโพเนนต์ `Dropdown` เอง — ใช้ร่วมทุกที่ที่เรียกมัน ไม่ผูกกับฟอร์มใดฟอร์มหนึ่ง */
  dropdown: {
    noMatch: (q: string) => `ไม่พบตัวเลือกที่ตรงกับ “${q}”`,
  },
  destinationPicker: {
    label: "เมืองปลายทาง (ไม่บังคับ)",
    hint: "เพิ่มได้หลายเมือง ข้ามประเทศได้ — เผื่อต่อเครื่องหรือบินต่อ · ลำดับที่เพิ่มคือลำดับในทริป",
    countryLabel: "ประเทศ",
    countryPlaceholder: "เลือกประเทศ",
    cityLabel: "เมือง",
    cityPlaceholder: "เลือกเมือง",
    cityNeedsCountry: "เลือกประเทศก่อน",
    cityLoading: "กำลังโหลด...",
    add: "+ เพิ่ม",
    remove: (name: string) => `เอา ${name} ออก`,
    /** ลำดับ = ลำดับการเดินทางจริง การสลับจึงเป็น "ไปก่อน/ไปทีหลัง" ไม่ใช่แค่ "ขึ้น/ลง" ในรายการ */
    moveEarlier: (name: string) => `ย้าย ${name} ไปก่อนหน้า`,
    moveLater: (name: string) => `ย้าย ${name} ไปทีหลัง`,
    countriesError: "⚠️ โหลดรายชื่อประเทศไม่ได้ — เลือกจุดหมายตอนนี้ไม่ได้ เพิ่มภายหลังได้",
    citiesError: "⚠️ โหลดรายชื่อเมืองของประเทศนี้ไม่ได้",
    noCities: "ยังไม่มีเมืองของประเทศนี้ในคลัง",
    alreadyAdded: "เพิ่มไว้แล้ว",
    atMax: "เพิ่มได้สูงสุด 20 เมือง",
    /** 🔴 route เพดาน limit=50 — ถ้าชนพอดีแปลว่าอาจมีเมืองที่ไม่ได้แสดง ต้องบอก ไม่ใช่ตัดเงียบ */
    maybeTruncated: "แสดง 50 เมืองแรกของประเทศนี้ — อาจมีมากกว่านี้ในคลัง",
  },
  /** ปฏิทินของเราเอง (`DateField`) — แทน `<input type="date">` ของเบราว์เซอร์ (ผู้ใช้สั่ง 28 ส.ค. 2026) */
  dateField: {
    placeholder: "เลือกวันที่",
    prevMonth: "เดือนก่อนหน้า",
    nextMonth: "เดือนถัดไป",
  },
  /** ตัวเลือกเมืองบนหัวการ์ดวัน (`DayCityPicker`) — `B6` เฟส 3 */
  dayCityPicker: {
    ariaLabel: "เมืองของวัน",
    /* 🔴 ปุ่มตอน *ยังไม่เลือก* กับ *ตัวเลือกในรายการ* ทำคนละหน้าที่ — เดิมใช้คำเดียวกัน
       · ปุ่ม  = คำเชิญ ("เลือกเมืองของวันนี้") — บอกว่าต้องทำอะไร
       · รายการ = ตัวเลือกที่แปลว่า *ล้างค่า* ("ไม่ระบุเมือง") — เป็นคำนาม ไม่ใช่คำสั่ง
       🎯 คำเดิม "ยังไม่ระบุเมือง" อ่านเป็น *รายงานสถานะ* ทั้งสองที่ → บนปุ่มมันไม่ชวนให้กด
       และในรายการมันฟังเหมือนกำลังบอกสถานะ ไม่ใช่ตัวเลือกที่กดได้ */
    placeholder: "เลือกเมืองของวันนี้",
    unset: "ไม่ระบุเมือง",
    noDestinations: "(ยังไม่ได้ตั้งจุดหมายของทริปนี้)",
    saveFailed: "บันทึกเมืองไม่สำเร็จ",
  },
} as const;
