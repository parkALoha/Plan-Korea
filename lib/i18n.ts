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
  /**
   * เมนู "เลือกปลายทาง" บนหน้าแรก — `components/DestinationExplorer.tsx`
   * 🔴 **คนละเมนูกับ "ทริปแนะนำ"** — เมนูนี้ *ไม่ตั้งจำนวนวันให้* ผู้ใช้กรอกวันที่เอง (ผู้ใช้สั่งเอง 4 ก.ย. 2026)
   */
  explorer: {
    /**
     * 🔴 **สามหัวข้อขึ้นต้นด้วยคำเดียวกัน: `ทริป___` — ของฉัน / แนะนำ / ใหม่**
     * ตอบคำถามเดียวกันสามสถานะ · ของเดิม `เริ่มจากปลายทาง` เสียความขนาน
     * และผู้ใช้เรียกมันเองว่า *"สร้างทริปใหม่"* (P1 เสนอชุดคำ · ผู้ใช้ยังไม่ค้าน)
     */
    /**
     * 🔴 **`ไปไหนดี?` ไม่ใช่ `ทริปใหม่`** — ผู้ใช้เสนอเอง 4 ก.ย. 2026 และผมเห็นด้วย
     *
     * P1 เสนอชุด `ทริป___` (ของฉัน/แนะนำ/ใหม่) เพื่อความขนาน · **แต่หัวข้อนี้ไม่ใช่ *รายการ* มันคือ *คำถาม***
     * อีกสองหัวข้อตอบว่า *"มีอะไรอยู่"* · หัวข้อนี้ตอบว่า *"จะเริ่มยังไง"*
     * 🎯 ***การแตกความขนานตรงนี้จึงมีความหมาย ไม่ใช่ความไม่สม่ำเสมอ*** — และ `ทริปใหม่` อธิบาย
     *    *ผลลัพธ์* ที่ผู้ใช้จะได้ ส่วน `ไปไหนดี?` พูด *คำถามที่เขามีอยู่ในหัวจริง ๆ ตอนเปิดหน้านี้*
     * · คำรองยังบอกวิธีทำอยู่ (`เลือกประเทศที่อยากไป`) ⇒ ไม่เสียความชัดว่ากดแล้วเกิดอะไร
     * · 📌 ไม่เว้นวรรคหน้า `?` — ไทยไม่เว้น (ผู้ใช้พิมพ์ `ไปไหนดี ?` มา แต่นั่นคือการเว้นตอนพิมพ์ข้อความ)
     */
    heading: "ไปไหนดี?",
    subheading: "เลือกประเทศที่อยากไป",
    citiesIn: (country: string) => `เมืองใน${country}`,
    cityCount: (n: number) => `${n} เมือง`,
    backToCountries: "← เลือกประเทศอื่น",
    countriesError: "⚠️ อ่านรายชื่อประเทศไม่ได้ตอนนี้ — เน็ตอาจสะดุด",
    citiesError: "⚠️ อ่านเมืองของประเทศนี้ไม่ได้ตอนนี้",
    noCities: "ยังไม่มีเมืองของประเทศนี้ในคลัง",
  },
  home: {
    /**
     * ชื่อผลิตภัณฑ์บนแถบหัว — **`luitrip`** (ผู้ใช้ตั้งเอง 4 ก.ย. 2026)
     *
     * 🔴 **เขียนเป็นละตินตัวเล็กตามที่เขาพิมพ์มา ไม่แปลงเป็นไทย** — เป็นวิสามานยนาม/เวิร์ดมาร์ก
     * และตรงกับโดเมน · คำอธิบายภาษาไทยอยู่ที่ `brandTagline` ใต้ชื่อ ⇒ **คนไทยยังได้บริบทครบ**
     * 🎯 ***และมันแปลว่าเราไม่ต้องส่งการสะกดไทยที่ยังไม่มีใครยืนยัน*** (P1 กำลังถามผู้ใช้อยู่ว่า
     *    "ลุยทริป" ถูกไหม) — ***ชื่อที่สะกดผิดบนหัวเว็บ แพงกว่าชื่อที่อ่านไม่ออกทันที***
     *
     * ⚠️ **`"แพลนทริป"` ที่เหลือในไฟล์นี้ไม่ใช่แบรนด์ — ห้าม find-replace** (P1 เตือน · ตรวจแล้ว 5 จุด)
     * `upcomingTrips: "แพลนทริปที่จะมาถึง"` = คำไทยธรรมดา (แผนการเดินทาง) · อีก 3 จุดเป็นคอมเมนต์
     * 🔴 แทนทั้งไฟล์จะได้ `luitripที่จะมาถึง` — **คอมไพล์ผ่าน · lint ผ่าน · จับได้ด้วยตาคนเท่านั้น**
     */
    brand: "luitrip",
    brandTagline: "วางแผนทริปร่วมกัน",
    tripCount: (n: number) => `${n} ทริป`,
    /** ช่องค้นหาในแถบหัว — ค้นจาก **ชื่อทริป + ชื่อจุดหมาย** (ผู้ใช้ขอ 4 ก.ย. 2026) */
    searchPlaceholder: "ค้นหาทริป หรือเมือง/ประเทศ",
    searchClear: "ล้างคำค้น",
    /**
     * แท็บหมวด — 🔴 **ไม่มี "ยอดนิยม"** ตามที่เรฟเขียนไว้ · ทริปเป็นของส่วนตัว
     * **ไม่มีมิติความนิยมในระบบเลย** ⇒ ใส่ไปจะเป็นแท็บที่ว่างตลอดกาล (P1 ชี้ · P2 เห็นด้วย)
     */
    tabAll: "ทั้งหมด",
    tabUpcoming: "กำลังจะมาถึง",
    tabSolo: "ส่วนตัว",
    tabGroup: "ทริปกลุ่ม",
    sortLabel: "เรียงตาม",
    sortByDate: "วันเดินทาง",
    sortByName: "ชื่อทริป",
    /** ว่างเพราะ *ตัวกรอง* ไม่ใช่เพราะ *ไม่มีทริป* — สองอย่างนี้ห้ามใช้ข้อความเดียวกัน */
    noMatch: "ไม่มีทริปที่ตรงกับที่กรองไว้",
    noMatchClear: "ล้างตัวกรอง",
    /**
     * ป้ายนับถอยหลังบนการ์ด — **คำนวณฝั่ง client เท่านั้น** (ดู `useMounted` ที่จุดเรียก)
     * 🔴 สี่สถานะ ไม่ใช่ตัวเลขเดียว: *ยังไม่ถึง* · *เริ่มวันนี้* · *กำลังเที่ยว* · *จบแล้ว*
     *    ยุบเป็น "อีก n วัน" อย่างเดียว = ทริปที่ผ่านไปแล้วจะขึ้นเลขติดลบ ซึ่งอ่านเหมือนเว็บพัง
     */
    daysUntil: (n: number) => `อีก ${n} วัน`,
    startsToday: "เริ่มวันนี้",
    ongoing: "กำลังเที่ยวอยู่",
    ended: "จบแล้ว",
    greeting: (name: string) => `สวัสดี คุณ${name}`,
    login: "เข้าสู่ระบบ",
    account: "บัญชี",
    upcomingTrips: "แพลนทริปที่จะมาถึง",
    /** หัวข้อส่วน "ทริปของฉัน" — ผู้ใช้ขอชื่อนี้ตรง ๆ (4 ก.ย. 2026) */
    myTrips: "ทริปของฉัน",
    newTrip: "+ สร้างทริปใหม่",
    noTripsYet: "ยังไม่มีทริป — สร้างทริปแรกก่อนเริ่มวางแผน",
    readOnlyFab: "ระบบปิดรับการแก้ไขชั่วคราว — สร้างทริปตอนนี้ไม่ได้",
    tripsUnreadable: "⚠️ เปิดรายการทริปไม่ได้ตอนนี้ — เน็ตอาจสะดุด ทริปของคุณยังอยู่",
    retry: "ลองใหม่",
    /** ทูลทิปตอนนับสมาชิกไม่ได้ — อยู่ใน `title=` จึงรอดสายตามาตลอด (ดู `createTrip` ข้างล่าง) */
    memberCountUnknown: "อ่านจำนวนสมาชิกไม่ได้ — คาดว่ามีอย่างน้อย 1 คนเสมอ",
    /**
     * ปุ่มปักหมุด — 🔴 **ถ้อยคำต้องเป็น *การกระทำของคุณ* ไม่ใช่ *คุณสมบัติของทริป***
     * `pinned_at` อยู่บน `trip_members` ของผู้เรียก ⇒ Alice ปักแล้ว Bob ไม่เห็น
     * ⇒ ห้ามเขียนว่า *"ทริปนี้ถูกปักหมุด"* ซึ่งอ่านเหมือนสถานะที่ทุกคนเห็นตรงกัน (P1 ย้ำตอนอนุมัติ)
     * · เขียนเป็นคำสั่งที่จะเกิดเมื่อกด (`aria-label` ของปุ่ม toggle) — ไม่ใช่คำบรรยายสภาพปัจจุบัน
     */
    pinAdd: "ปักหมุดไว้บนสุด",
    pinRemove: "เอาหมุดออก",
    /**
     * 🔴 ล้มแล้วต้องบอก — **ปุ่มนี้เด้งกลับเอง** ถ้าเงียบ ผู้ใช้จะเห็นหมุดติดแล้วหลุด
     * โดยไม่มีอะไรอธิบาย ซึ่งอ่านเหมือนเว็บพัง (รูปเดียวกับ `destinationsError` ของ `POST /trips`)
     */
    pinFailed: "ปักหมุดไม่สำเร็จ — ลองใหม่อีกครั้ง",
    /** คำอธิบายกลุ่มบนสุดของรายการ · ขึ้นเฉพาะตอนมีหมุดจริง — ไม่มีหมุด = ไม่มีหัวข้อ ไม่ใช่หัวข้อว่าง */
    pinnedGroup: "ปักหมุดไว้",
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
    // 🔴 เดิม `"เมืองปลายทาง (ไม่บังคับ)"` — **เปลี่ยน 4 ก.ย. 2026 พร้อมกับที่ปุ่มสร้างบังคับให้เลือก**
    //    เหตุผลเต็มอยู่ที่ `components/CreateTripForm.tsx` (ทริปที่ไม่มีเมือง = ทริปที่ตายถาวร)
    // 🎯 ***ป้ายที่บอกว่า "ไม่บังคับ" ข้าง ๆ ปุ่มที่กดไม่ได้เพราะยังไม่เลือก แย่กว่าไม่มีป้ายเลย***
    //    ผู้ใช้จะสรุปว่า **เว็บพัง** ไม่ใช่ว่าตัวเองยังกรอกไม่ครบ · สองข้อความนี้ต้องเปลี่ยนพร้อมกันเสมอ
    //    📌 เจอด้วยการเปิดหน้าจริงหลังแก้ ไม่ใช่จากอ่านโค้ด — `tsc`/`lint` เขียวทั้งคู่ตอนมันขัดกันอยู่
    label: "เมืองปลายทาง",
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
