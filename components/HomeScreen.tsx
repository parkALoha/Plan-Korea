"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardBadge, CoverCard } from "@/components/CoverCard";
import { CreateTripForm } from "@/components/CreateTripForm";
import { DestinationExplorer } from "@/components/DestinationExplorer";
import type { CityOption } from "@/components/TripDestinationPicker";
import { AccountMenu } from "@/components/AccountMenu";
import { InitialAvatar } from "@/components/InitialAvatar";
import { Modal } from "@/components/Modal";
import { SiteNav } from "@/components/SiteNav";
import { TripInvitePanel } from "@/components/TripInvitePanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDarkTheme } from "@/hooks/useDarkTheme";
import { useMounted } from "@/hooks/useMounted";
import { useSystemMode } from "@/hooks/useSystemMode";
import { tripDateRangeLabel } from "@/lib/tripDateRange";
import { E5_COPY } from "@/lib/i18n";
import { readCache, writeCache } from "@/lib/localCache";
import { clearDeviceData } from "@/lib/auth/deviceData";

type TripDestination = {
  cityId: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  countryId: string;
  countryNameTh: string;
};

type TripListItem = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  destinations: TripDestination[];
  memberCount: number;
  /**
   * 🔴 **มุมมองส่วนตัวของผู้เรียก ไม่ใช่คุณสมบัติของทริป** — มาจาก `trip_members.pinned_at` ของ *เขา*
   * ⇒ Alice ปักแล้ว Bob ไม่เห็น · ห้ามแสดงเป็นข้อความทำนอง *"ทริปนี้ถูกปักหมุด"*
   * · เป็น timestamp ไม่ใช่ boolean เพราะฝั่งฐานเปิดทางให้ *เลือกใช้เป็นลำดับได้*
   *   **แต่หน้านี้เลือกไม่ใช้** (เหตุผลอยู่ที่ตัวเรียงใน `visibleTrips`) ⇒ ที่นี่อ่านค่าเป็นแค่ null / ไม่ null
   * ⚠️ ทริปที่มาจากแคชรุ่นก่อนหน้าจะไม่มีคีย์นี้ ⇒ `undefined` — ตัวเทียบทุกตัวใช้ `!== null`
   *   ซึ่ง `undefined` จะอ่านเป็น *ปักไว้* ผิดความจริง · จึงประกาศเป็น `| undefined` ให้ `tsc` บังคับให้คิดถึง
   */
  pinnedAt: string | null | undefined;
};

/**
 * รูปปกทริป — **ไม่มีตัวอัปโหลดแล้ว** (ผู้ใช้ตัดสิน 27 ส.ค. 2026: กันข้อมูลภาพเยอะเกิน ให้ระบบคำนวณจาก
 * จุดหมายแทน) คำนวณล้วนจาก `destinations` ที่การ์ดมีอยู่แล้ว ไม่ยิง API เพิ่ม — ไล่ 3 ชั้น:
 * รูปเมือง (`destinations[0].slug`) → รูปประเทศ (`destinations[0].countryId`) → พื้นไล่สีเดิม
 *
 * อาจไม่มีไฟล์ที่ชั้นใดชั้นหนึ่ง (หรือทั้งคู่) — ต้องตกไปพื้นไล่สีอย่างเงียบ ไม่ใช่รูปแตก ใช้ `onError`
 * ไล่ทีละชั้นแทนการเช็คว่าไฟล์มีอยู่จริงก่อน (เช็คล่วงหน้าฝั่ง client ทำไม่ได้อยู่แล้วสำหรับไฟล์ static ใน
 * public/ — ต้องปล่อยให้ browser ลองโหลดแล้วดักพลาด)
 * 🔴 **ชุดแรกที่จะมาคือรูประดับประเทศ (P1 ทาย 3 ไฟล์)** — สภาพ "มีแต่รูปประเทศ ไม่มีรูปเมือง" คือสภาพปกติ
 * ช่วงแรก ไม่ใช่ edge case ต้องทดสอบให้เห็นจริงเหมือน edge case อื่น (ดู state ด้านล่าง) — ทายถูกเป๊ะ:
 * เจอ `public/covers/country-{kr,vn,th}.svg` จริงระหว่างทดสอบ (ยังไม่ commit) นามสกุลเป็น `.svg` ไม่ใช่
 * `.jpg` ตามที่บอกไว้ตอนแรก โค้ดนี้ใช้ `.svg` ตามของจริงที่เจอ
 */
function TripCoverImage({ destinations }: { destinations: TripDestination[] }) {
  const first = destinations[0] as TripDestination | undefined;
  const [stage, setStage] = useState<"city" | "country" | "gradient">(first ? "city" : "gradient");

  if (stage === "gradient" || !first) {
    // fallback ของรูปปก — ไม่มีจุดหมาย หรือไล่ทั้งรูปเมือง/ประเทศแล้วไม่เจอสักไฟล์
    return (
      <div className="flex aspect-[5/2] w-full items-center justify-center bg-gradient-to-br from-pine to-maple text-4xl text-cream">
        🗺️
      </div>
    );
  }

  // 🔴 .svg ไม่ใช่ .jpg ตามที่ P1 บอกไว้ตอนแรก — เจอไฟล์จริงของผู้ใช้ที่ public/covers/country-{kr,vn,th}.svg
  // อยู่แล้วระหว่างทดสอบ (ยังไม่ commit ไม่มีใน git log) 3 ไฟล์ตรงกับ 3 ประเทศที่ P1 ทายไว้เป๊ะ — ใช้ตามที่
  // เจอจริงแทนสเปกเดิม ต้องแจ้ง P1 ยืนยันอีกที เผื่อรูปเมืองจริงจะเป็นคนละนามสกุล
  const src = stage === "city" ? `/covers/city-${first.slug}.svg` : `/covers/country-${first.countryId}.svg`;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง ไม่ใช่รูปผู้ใช้อัปโหลด
    <img
      src={src}
      alt=""
      className="aspect-[5/2] w-full object-cover"
      onError={() => setStage((s) => (s === "city" ? "country" : "gradient"))}
    />
  );
}

// 🔴 เดิมมีก้อน COPY ท้องถิ่นแยกไว้ในไฟล์นี้เอง (เหตุผลตอนนั้น: lib/i18n.ts เขียนขอบเขตตัวเองไว้ว่า
// "ของหน้า /summary เท่านั้น") — ย้ายเข้า E5_COPY.home ใน lib/i18n.ts แล้ว (P1 27 ส.ค. 2026 ตัดสิน:
// ผ่าน lib/i18n.ts จริงตามที่ E5-AC7 สั่ง แต่เป็น namespace ที่สอง ไม่ปนกับ DICT ของ /summary — ดูหัวไฟล์
// นั้น) ยังไม่มี EN เหมือนเดิม เพิ่มตอน M2
const COPY = E5_COPY.home;

/**
 * การ์ดทริปหนึ่งใบบน Home — `destinations`/`memberCount` มาจาก `GET /api/engine/trips` (P1 27 ส.ค. 2026,
 * `f6d74ee`) รูปปกคำนวณเองจาก `destinations` แล้ว (ดู `TripCoverImage`) ไม่มาจาก API อีกต่อไป
 *
 * 🔴 `destinations: []` เป็นปกติวันนี้ (ยังไม่มีทริปไหนเขียนจุดหมาย ตาราง `trip_destinations`
 * เพิ่งเกิด) — ไม่โชว์แถวจุดหมายเลยถ้าว่าง ดีกว่าโชว์ช่องว่าง
 * 🔴 `memberCount === 0` เป็นไปไม่ได้จริง (ทุกทริปมีเจ้าของ ≥1) — ถ้าเจอ แปลว่าอ่าน `trip_members`
 * ไม่ได้ ไม่ใช่ทริปไม่มีคน ปฏิบัติแบบเดียวกับ `displayName: null` ใน `TripHeader.tsx` (ห้ามเงียบ)
 */
type TabKey = "all" | "upcoming" | "solo" | "group";

/**
 * ตัวกรองของหน้าแรก — **ฟังก์ชันล้วน แยกจากคอมโพเนนต์เพื่อให้ยิงเทสต์ได้ตรง ๆ**
 * (บทเรียนเดียวกับ `placeGrouping.ts`: ตรรกะที่อยู่ใน closure ของคอมโพเนนต์ ไม่มีเคสไหนไปถึงได้
 *  ถ้าไม่ render — และรีโปนี้ไม่มี `@testing-library/react`)
 *
 * 🔴 **ค้นจากชื่อทริป *และ* ชื่อจุดหมาย** — ผู้ใช้เขียนเรฟว่า *"ค้นชื่อทริป/ประเทศที่เคยสร้าง"*
 *    คนไม่ได้จำชื่อที่ตัวเองตั้ง แต่จำว่า "ทริปไปปูซาน" ⇒ ค้นเฉพาะชื่อทริปจะพลาดเคสที่พบบ่อยที่สุด
 * ⚠️ เทียบแบบไม่สนตัวพิมพ์ และ **ตัดช่องว่างหัวท้าย** — คนพิมพ์เว้นวรรคติดมาเสมอตอนวางจากที่อื่น
 */
export function matchesTripQuery(
  trip: { title: string; destinations: { nameTh: string; nameEn: string }[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (trip.title.toLowerCase().includes(q)) return true;
  return trip.destinations.some(
    (d) => d.nameTh.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q)
  );
}

/**
 * แท็บหมวด — **ตัดสินจากข้อมูลที่รายการทริปมีจริงเท่านั้น**
 * · `upcoming` = ยังไม่จบ (`todayIso <= end_date`) — **ไม่ใช่ "ยังไม่เริ่ม"** ทริปที่กำลังเที่ยวอยู่
 *   ก็ยัง "จะมาถึง" ในความหมายที่ผู้ใช้ต้องเปิดดู
 * · `solo`/`group` = `memberCount`
 * 🔴 **`memberCount === 0` แปลว่า *อ่านไม่ได้* ไม่ใช่ *ไม่มีคน*** (เขียนไว้แล้วที่ `TripCard`)
 *    ⇒ นับเป็น `solo` ไม่ได้ · ให้มันตกอยู่ใน `all` อย่างเดียว **ดีกว่าจัดเข้าหมวดที่อาจผิด**
 */
export function matchesTripTab(
  trip: { end_date: string; memberCount: number },
  tab: TabKey,
  todayIso: string
): boolean {
  if (tab === "all") return true;
  if (tab === "upcoming") return todayIso <= trip.end_date;
  if (tab === "solo") return trip.memberCount === 1;
  return trip.memberCount > 1;
}

/**
 * ป้ายนับถอยหลังมุมบนของการ์ด — **สี่สถานะ ไม่ใช่ตัวเลขเดียว** (P2 · 4 ก.ย. 2026)
 *
 * 🎯 ***ของที่ผู้ใช้เปิดหน้าแรกมาหาคือ "ทริปหน้าเหลืออีกกี่วัน" — ข้อมูลนั้นไม่เคยอยู่บนหน้านี้เลย***
 * มีแค่ช่วงวันที่ ซึ่งผู้ใช้ต้องคำนวณเอง (P1 เสนอให้ทำเป็น hero ของทริปที่ใกล้ที่สุด · ผมเลือกวางบน
 * **ทุกใบ** แทน เพราะ hero จะซ้ำกับการ์ดใบแรกที่เรียงตามวันอยู่แล้ว และทำให้แถบหัวมีสองโหมด
 * — โหมดที่สองคือตอนไม่มีทริป ซึ่งเป็นสถานะของผู้ใช้ใหม่ทุกคน)
 *
 * 🔴 **`useMounted` ไม่ใช่พิธีกรรม** — `new Date()` ฝั่งเซิร์ฟเวอร์คือเวลาที่ *build* (หน้านี้ถูก
 * prerender เป็น HTML) ⇒ ต่างจากเวลาที่ผู้ใช้เปิดเว็บ = hydration mismatch (React #418)
 * และมันโผล่เฉพาะ production เพราะ dev server render ตอนมี request พอดี (ดูหัว `hooks/useMounted.ts`)
 *
 * ⚠️ **เทียบด้วย *วันที่* ไม่ใช่ *มิลลิวินาที*** — `end_date` เป็น `YYYY-MM-DD` (ทั้งวัน)
 * ถ้าหารด้วย 86400000 ตรง ๆ ทริปที่จบ "วันนี้" จะกลายเป็น "จบแล้ว" ตั้งแต่เที่ยงคืนหนึ่งวินาที
 */
function TripCountdownBadge({ startDate, endDate }: { startDate: string; endDate: string }) {
  const mounted = useMounted();
  if (!mounted) return null;

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let label: string;
  let tone: string;
  if (todayIso > endDate) {
    label = COPY.ended;
    // ทึบ ไม่ใช่ `/60` — โปร่งใสบนรูปปกที่สีต่างกันทุกใบ ทำให้คอนทราสต์เดาไม่ได้ (วัดไม่ได้ด้วย)
    tone = "bg-ink text-cream";
  } else if (todayIso >= startDate) {
    label = todayIso === startDate ? COPY.startsToday : COPY.ongoing;
    tone = "bg-pine text-cream";
  } else {
    // นับเป็น "จำนวนวันปฏิทินที่ต่างกัน" — ใช้ UTC ทั้งคู่ให้ DST ไม่ทำให้คลาดไปหนึ่งวัน
    const days = Math.round(
      (Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000,
    );
    label = COPY.daysUntil(days);
    // 🔴 `maple-dark` ไม่ใช่ `maple` — วัดแล้ว `maple`/white = **3.50 ตก WCAG AA** (ป้ายเป็น `text-2xs`
    //    = ข้อความปกติ ต้อง 4.5) · `maple-dark`/white = **4.98 ผ่าน** · เสียความสดไปนิด แลกกับอ่านออก
    tone = "bg-maple-dark text-white";
  }

  return <CardBadge tone={tone}>{label}</CardBadge>;
}

/**
 * แอตทริบิวต์ที่ปิด **ตัวช่วยพิมพ์ของเบราว์เซอร์** สำหรับช่องค้นหาในเว็บ (P2 · 4 ก.ย. 2026 · ผู้ใช้ทัก)
 *
 * ผู้ใช้เห็นกล่องดำมีหางชี้ขึ้นมาบังใต้ช่อง แสดงคำที่เพิ่งพิมพ์ (`ญี่ป`)
 * 🔴 **มันไม่ใช่ของในหน้าเรา — ไม่มี element ไหนในหน้านี้วาดมัน** ⇒ แก้ด้วย CSS ไม่ได้
 * มันคือชั้นช่วยพิมพ์ของเบราว์เซอร์/ระบบ ซึ่งเปิดให้เองกับ `<input>` ทุกช่อง:
 * ```
 * autoComplete="off"  ประวัติคำค้นเดิมของช่องนี้      · `type="search"` เปิดให้เป็นค่าเริ่มต้น
 * spellCheck={false}  ตัวตรวจคำสะกด (ขีดหยัก + ป้าย)  · ไม่รู้จักคำไทย ⇒ ขีดแดงใต้ทุกคำอยู่แล้ว
 * autoCorrect/Capitalize  ตัวเดา/แก้คำของ iOS · Safari
 * ```
 * ⚠️ **ขอบเขต: ผมยืนยันไม่ได้ว่ามันตัวไหน เพราะสร้างซ้ำในเครื่องผมไม่ได้** (คนละ OS/ภาษาป้อนเข้า)
 * ปิดทั้งชุดเพราะ **ไม่มีตัวไหนในนี้ที่ช่องค้นหาทริปได้ประโยชน์** — ไม่ใช่เพราะรู้ว่าตัวไหนผิด
 * 🎯 ***จดไว้ตรง ๆ ว่าเป็นการตัดตัวเลือกทั้งกลุ่ม ไม่ใช่การแก้ที่ต้นเหตุที่ระบุได้*** —
 *    วันที่มันยังไม่หาย คนถัดไปจะได้รู้ว่าไม่ต้องเสียเวลาไล่ตรงนี้ซ้ำ
 */
const SEARCH_INPUT_QUIET = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  /**
   * 🔴 **กรอบโฟกัสถูกปิดที่ *ตัว element* ไม่ใช่ด้วยคลาส** — ตั้งใจ และไม่ใช่การเผลอเขียน inline style
   *
   * `app/globals.css` มีกฎ **ทั้งเว็บ**: `:focus-visible { outline: 2px solid var(--color-maple) }`
   * ⇒ ช่องนี้ได้กรอบส้มมาโดยที่ **ไม่มีอะไรในไฟล์นี้บอกเลยว่ามันจะมี**
   * · คลาส `focus-visible:outline-none` ชนะได้ก็จริง **แต่ชนะด้วย *ลำดับและความจำเพาะของ CSS***
   *   ซึ่งเปลี่ยนได้จากการแก้ไฟล์อื่น · และ **สไตล์ชีตที่ค้างในเบราว์เซอร์ก็ทำให้มันยังไม่มีผล**
   * 🎯 ***`style` ชนะสไตล์ชีตทุกใบเสมอ ไม่ขึ้นกับลำดับ ความจำเพาะ หรือของที่ค้างอยู่***
   *   ⇒ ที่นี่จึงเป็นที่ที่ *ผลลัพธ์ไม่ขึ้นกับสิ่งที่มองไม่เห็นจากไฟล์นี้*
   * ⚠️ **ไม่ใช่แบบอย่างให้ใช้ inline style ทั่วไป** — ใช้ตรงนี้เพราะกำลังลบล้างกฎ global ที่มองไม่เห็น
   *   จากจุดใช้งาน · เหตุผลที่ยอมไม่มีกรอบเลย อยู่ในคอมเมนต์ที่ `<label>` ของโมดัล
   */
  style: { outline: "none" },
} as const;

function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      className={className}
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

type TripMember = { userId: string; role: string; displayName: string | null };

/**
 * **แถวสมาชิกบนการ์ด** — วงกลมซ้อนกันสูงสุด 5 ใบ · เกินนั้นเป็น `+n` · แตะเพื่อดูรายชื่อทั้งหมด
 * ผู้ใช้ออกแบบเอง 4 ก.ย. 2026 · เจ้าของ: P2-UI/UX
 *
 * ## 🔴 ทำไมต้องยิงขอรายชื่อเพิ่ม ทั้งที่การ์ดมี `memberCount` อยู่แล้ว
 * `GET /api/engine/trips` คืน **จำนวน** ไม่คืน **ตัวตน** ⇒ วาดวงกลมให้ครบโดยเดาตัวอักษร = สร้างคนที่ไม่มีอยู่
 * ⇒ ต้องขอของจริงจาก `GET /api/engine/trips/[tripId]/members` (มีอยู่แล้ว ไม่ต้องสร้าง route ใหม่)
 *
 * ## ✅ ยิง *เมื่อจำเป็นต้องใช้* — ไม่ใช่ทุกใบตอนโหลดหน้า
 * ```
 * memberCount  > 1   ยิงตอนการ์ดโผล่   ต้องใช้ชื่อมาวาดวงกลมทันที
 * memberCount <= 1   ยิงตอนกดเปิด      การ์ดวาดวงกลมของผู้ใช้เองได้อยู่แล้ว
 * ```
 * 🎯 ***ทริปส่วนตัวเป็นส่วนใหญ่ ⇒ หน้าแรกไม่ยิงอะไรเพิ่มเลยตอนโหลด และยังกดดูได้ครบทุกใบ***
 * · ⚠️ **แต่ก็ยังเป็น N คำขอสำหรับคนที่มีทริปกลุ่มเยอะ** — ทางที่ถูกกว่านี้คือให้ route รายการ
 *   ส่งชื่อย่อมาด้วยตั้งแต่แรก **ขอ P1 ไว้แล้ว** · วันที่ฟิลด์นั้นมา ให้ลบการยิงตรงนี้ทิ้ง
 *
 * ## 🔴 ล้มแล้วไม่หาย — ถอยไปเป็นรูปเดิม (วงกลมของผู้ใช้ + `+n`)
 * เพราะ `memberCount` ยัง **ถูกต้อง** อยู่แม้อ่านรายชื่อไม่ได้ ⇒ ยังบอกจำนวนได้ตามจริง
 * ⚠️ **แต่ปุ่มยังกดได้** และในโมดัลจะบอกตรง ๆ ว่าอ่านรายชื่อไม่ได้ — **ไม่ใช่โมดัลว่าง**
 */
function TripMembers({
  tripId,
  memberCount,
  viewerName,
  viewerId,
}: {
  tripId: string;
  memberCount: number;
  viewerName: string | null;
  /** id ของผู้ใช้ที่ล็อกอินอยู่ — ใช้ตัดสินว่าเขาเป็น `owner` ของทริปนี้ไหม (คุมการโผล่ของแผงชวนเพื่อน) */
  viewerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TripMember[] | "error" | null>(null);

  /**
   * 🔴 **โหลดเมื่อ *จำเป็นต้องใช้* ไม่ใช่เมื่อการ์ดโผล่**
   * ```
   * memberCount > 1   โหลดตอนการ์ดโผล่   ← ต้องใช้ *ชื่อ* มาวาดวงกลมบนการ์ดทันที
   * memberCount <= 1  โหลดตอนกดเปิด      ← การ์ดวาดวงกลมของผู้ใช้เองได้อยู่แล้ว ไม่ต้องรอใคร
   * ```
   * 🎯 ***ทริปเดี่ยวเป็นส่วนใหญ่ ⇒ หน้าแรกไม่ยิงอะไรเพิ่มเลยตอนโหลด และยังกดดูได้ครบทุกใบ***
   * · `open` อยู่ใน deps เพราะการเปิดโมดัลคือ *เงื่อนไขที่สองที่ทำให้ต้องโหลด*
   * · `members !== null` แล้วไม่โหลดซ้ำ — กดปิดเปิดใหม่ใช้ของเดิม
   */
  useEffect(() => {
    if (members !== null) return;
    if (memberCount <= 1 && !open) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/engine/trips/${tripId}/members`);
        if (!r.ok) throw new Error(String(r.status));
        const rows = (await r.json()) as TripMember[];
        if (!cancelled) setMembers(Array.isArray(rows) ? rows : "error");
      } catch {
        if (!cancelled) setMembers("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId, memberCount, open, members]);

  // 🔴 `0` = อ่านไม่ได้ ไม่ใช่ไม่มีคน — ทริปทุกใบมีเจ้าของอย่างน้อยหนึ่งคนเสมอ
  if (memberCount <= 0) {
    return (
      <span className="text-xs text-maple-dark" title={COPY.memberCountUnknown}>
        👥 ?
      </span>
    );
  }

  const known = Array.isArray(members) ? members : null;
  /**
   * 🔴 **5 ใบ คือเพดานที่ผู้ใช้ระบุ — ไม่ใช่ตัวเลขที่ผมเลือก** · ที่เหลือเป็น `+n`
   * ⚠️ **`+n` นับจาก `memberCount` เสมอ ไม่ใช่จากความยาวของรายชื่อที่โหลดมาได้**
   *    ⇒ โหลดรายชื่อไม่ครบ/ไม่ได้ **ตัวเลขยังตรงกับความจริง** (สองอย่างนี้มาจากคนละคำขอ)
   */
  const shown = known ? known.slice(0, 5) : [];
  const rest = memberCount - (shown.length || 1);
  /**
   * 🔴 **กดได้ทุกใบ รวมทริปที่มีคนเดียว** (ผู้ใช้แย้งข้อเดิมของผม 4 ก.ย. 2026)
   * ผมเคยตัดปุ่มออกเมื่อ `memberCount === 1` ด้วยเหตุผลว่า *"กดเข้าไปก็เห็นแค่ตัวเอง"*
   * · เขาตอบว่า: ***"กดเข้าไปก็เห็นไงว่า สมาชิก 1 คน รายการคือ …"***
   * 🎯 ***"เห็นแค่ตัวเอง" คือ *คำตอบ* ไม่ใช่ *ความว่างเปล่า*** — มันยืนยันว่าทริปนี้ยังไม่มีใครอื่น
   *    ซึ่งเป็นสิ่งที่คนอยากรู้จริง ๆ ก่อนจะแชร์ให้ใคร
   * · และมันทำให้การ์ดทุกใบ **ทำงานเหมือนกัน** — ของที่กดได้บ้างไม่ได้บ้างโดยไม่มีอะไรบอก
   *   คือของที่ผู้ใช้ต้องลองเองทีละใบถึงจะรู้
   */
  const clickable = true;

  const stack = (
    <span className="flex items-center gap-1">
      <span className="flex items-center">
        {shown.length > 0 ? (
          shown.map((m, i) => (
            <InitialAvatar
              key={m.userId}
              name={m.displayName ?? "?"}
              /* ซ้อนกันด้วย margin ติดลบ + วงขอบสีพื้นการ์ด ⇒ อ่านออกว่าเป็นคนละใบ ไม่ใช่ก้อนเดียว */
              className={`h-6 w-6 text-2xs ring-2 ring-surface-raised ${i > 0 ? "-ml-2" : ""}`}
            />
          ))
        ) : (
          <InitialAvatar name={viewerName ?? "?"} className="h-6 w-6 text-2xs" />
        )}
      </span>
      {rest > 0 && <span className="text-xs text-content-soft">+{rest}</span>}
    </span>
  );

  if (!clickable) return stack;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={COPY.membersOpen(memberCount)}
        className="rounded-full px-0.5 py-0.5 transition hover:bg-surface-soft"
      >
        {stack}
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={COPY.membersTitle}
          size="md"
          /**
           * 🔴 **`top` + `fillHeight`** (ผู้ใช้สั่งเอง 4 ก.ย. 2026:
           * *"ในมุมมองมือถือ modal ควรเลื่อนขึ้นมาสูง ๆ และ fix ขนาดเลย และเลื่อนดูสมาชิกได้"*)
           *
           * เดิมกล่องสูงตามจำนวนสมาชิก ⇒ **ทริปคนเดียวได้กล่องเตี้ยแปะขอบล่าง · 15 คนได้กล่องสูงเกือบเต็มจอ**
           * 🎯 ***กล่องเดียวกันเปลี่ยนขนาดตามข้อมูล ทำให้ผู้ใช้ต้องมองหาปุ่มปิดใหม่ทุกครั้งที่เปิด***
           * ⇒ ความสูงคงที่ + รายชื่อเลื่อนข้างใน = **ปุ่มปิดอยู่ที่เดิมเสมอ ไม่ว่าจะมีกี่คน**
           */
          align="top"
          fillHeight
        >
          {members === null ? (
            <p className="text-sm text-content-soft">{COPY.membersLoading}</p>
          ) : members === "error" ? (
            <p className="text-sm text-maple-dark">{COPY.membersUnreadable}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <InitialAvatar name={m.displayName ?? "?"} className="h-9 w-9 text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-content">
                      {m.displayName ?? COPY.memberNoName}
                    </span>
                    <span className="block text-xs text-content-soft">{COPY.memberRole(m.role)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/**
           * 🔴 **แผงชวนเพื่อนอยู่ใน *กล่องสมาชิก* ไม่ใช่หน้าตั้งค่า** — ผู้ใช้ขอไว้ในประโยคเดียวกับ
           * *"เลื่อนดูสมาชิกได้"* ⇒ *"เชิญได้ หรือส่งลิงก์เชิญร่วมทริปนี้ได้"*
           * 🎯 ***คำถาม "ใครอยู่ในทริปนี้" กับ "ชวนใครเพิ่ม" เป็นคำถามเดียวกันในหัวคนใช้***
           * · `isOwner` คำนวณจากรายชื่อที่กล่องนี้โหลดมาอยู่แล้ว — **ไม่ยิงเพิ่มเพื่อถามสิทธิ์**
           * · ⚠️ ระหว่างที่รายชื่อยังโหลดไม่เสร็จ `isOwner` เป็น `false` ⇒ ปุ่มยังไม่โผล่
           *   **"ยังไม่รู้" ต้องไม่เท่ากับ "ไม่ใช่เจ้าของ"** — โผล่ทีหลังดีกว่าโผล่แล้วหาย (รูปเดียวกับปุ่มลบทริป)
           */}
          <TripInvitePanel
            tripId={tripId}
            isOwner={Array.isArray(members) && members.some((m) => m.role === "owner" && m.userId === viewerId)}
          />
        </Modal>
      )}
    </>
  );
}

function TripCard({
  trip,
  viewerName,
  viewerId,
}: {
  trip: TripListItem;
  /** ชื่อผู้ใช้ที่ล็อกอินอยู่ — `null` ตอนยังอ่านไม่เสร็จ · ใช้วาดวงกลมของ *เขาเอง* เท่านั้น */
  viewerName: string | null;
  viewerId: string | null;
}) {
  const destinationLabel = trip.destinations.map((d) => d.nameTh).join(" · ");
  return (
    <CoverCard
      href={`/trip/${trip.id}`}
      /**
       * 🔴 `adaptive` — แถบข้างบนมือถือ → แบนเนอร์บนตั้งแต่ `sm` · **ไม่ใช่รสนิยม**
       * กริดทริปบนมือถือเป็นคอลัมน์เดียว · แบนเนอร์ทำให้เห็นจาก ~5 ใบเหลือ ~2.5 ใบต่อจอ (วัดแล้ว)
       * 🎯 มือถือเป็นฝั่งที่ผู้ใช้พอใจอยู่แล้ว — การรื้อ desktop ต้องไม่จ่ายด้วยความแน่นของมือถือ
       */
      cover={<TripCoverImage destinations={trip.destinations} />}
      badge={<TripCountdownBadge startDate={trip.start_date} endDate={trip.end_date} />}
      title={trip.title}
      titleTrailing={
        <TripMembers
          tripId={trip.id}
          memberCount={trip.memberCount}
          viewerName={viewerName}
          viewerId={viewerId}
        />
      }
    >
      {/* 🔴 ผู้ใช้ขอเอง: *"ชื่อทริปใหญ่และเด่นขึ้น · วันที่/สถานที่สว่างขึ้นให้อ่านง่าย"*
          `text-content-soft` → `text-content` สำหรับวันที่/สถานที่ **ซึ่งเป็นข้อมูลที่คนใช้เลือกทริป**
          เหลือ `soft` ไว้เฉพาะจำนวนสมาชิก — ***ถ้าทุกบรรทัดเด่นเท่ากัน ก็ไม่มีบรรทัดไหนเด่น*** */}
      <p className="mt-1 text-xs font-medium text-content sm:text-sm">
        {tripDateRangeLabel(trip.start_date, trip.end_date)}
      </p>
      {/**
       * 🔴 **บรรทัดสถานที่ต้องมีที่ของมันเสมอ แม้ไม่มีข้อมูล** (ผู้ใช้ทักเอง 4 ก.ย. 2026)
       * เดิมเรนเดอร์แบบมีเงื่อนไข ⇒ การ์ดที่ไม่มีจุดหมายเตี้ยกว่าเพื่อน **แถว 👥 ไม่อยู่ระดับเดียวกัน**
       * (วัดก่อน/หลัง: `472 · 447 · 472 · 472 · 472` → `472` ทุกใบ)
       * 🎯 ***จองที่ว่างไว้ ไม่ใช่เติมข้อความปลอม*** — "ยังไม่ระบุเมือง" คือการบอกสิ่งที่เราไม่รู้
       *    (ทริปเก่าไม่มีจุดหมายเพราะตอนนั้น *ยังไม่บังคับ* ไม่ใช่เพราะผู้ใช้ตั้งใจเว้น)
       */}
      {/* `pr-10` ที่เคยเผื่อไว้ให้ปุ่มปักหมุดถูกถอดแล้ว — ปุ่มไม่มีแล้ว จึงไม่มีอะไรให้หลบ */}
      <p
        className="mt-0.5 truncate text-xs text-content sm:text-sm"
        aria-hidden={destinationLabel ? undefined : true}
      >
        {destinationLabel ? `📍 ${destinationLabel}` : "\u00a0"}
      </p>
    </CoverCard>
  );
}

/**
 * **ทริปแนะนำ** — หัวข้อที่ ② จากสามหัวข้อที่ผู้ใช้สั่ง · P2 · 4 ก.ย. 2026 (route โดย P1 `3965d3f`)
 *
 * ## 🔴 ไม่มีแผน = **ไม่เรนเดอร์อะไรเลย** ไม่ใช่หัวข้อที่มีข้อความว่า "ยังไม่มี"
 * ช่วงแรก `published_template_at` ยังเป็น 0 แถวทั้งฐาน — เพราะการจัดแผนใบแรกเป็น **งานเนื้อหา ไม่ใช่งานโค้ด**
 * 🎯 ***หัวข้อเปล่าอ่านเหมือนเว็บพัง · ไม่มีหัวข้อเลยอ่านเหมือนยังไม่มีฟีเจอร์ — อย่างหลังจริงกว่า***
 * ⇒ วันที่มีคนจัดแผนใบแรก **หัวข้อจะโผล่เอง ไม่ต้องมีใครมาแก้ไฟล์นี้อีก**
 *
 * ## 🔴 อ่านไม่ได้ ก็เงียบเหมือนกัน — **และนี่คือที่ที่ผมยอมให้ต่างจากรายการทริปของฉัน**
 * รายการทริปของฉันล้ม → ต้องบอก (`tripsUnreadable`) เพราะ **ผู้ใช้รู้ว่าเขามีทริปอยู่** ของหายไปคือเรื่องใหญ่
 * ที่นี่ล้ม → เงียบ เพราะผู้ใช้ **ไม่รู้ว่ามีอะไรอยู่ตรงนี้ตั้งแต่แรก** ⇒ ข้อความเตือนจะแนะนำสิ่งที่เขาไม่ได้เสียไป
 * ⚠️ **ไม่ใช่กติกาทั่วไป** — ใช้ได้เพราะส่วนนี้เป็น *ของเสริม* ล้วน · ส่วนที่ผู้ใช้มาหาต้องส่งเสียงเสมอ
 */
type TripTemplate = {
  id: string;
  title: string;
  dayCount: number;
  nightCount: number;
  /**
   * 🔴 **`slug: null` กับ `countryId` ที่ *หายไป* คนละความหมาย — P1 ตั้งใจให้ต่าง**
   * ```
   * slug: null        `legacy_slug` เป็น null ได้จริง  → ไม่มีรูปเมืองแน่นอน ⇒ ตกชั้นถัดไปได้เลย
   * countryId หายไป   อ่านคลังไม่ได้รอบนั้น            → **ไม่รู้** ไม่ใช่ "เมืองนี้ไม่มีประเทศ"
   * ```
   * ⇒ ต้องเช็คด้วย `"countryId" in c` **ไม่ใช่ `c.countryId !== null`** · `null` ที่เราเติมเองจะเป็น
   *   คำกล่าวอ้างที่ไม่ได้วัด (รูปเดียวกับที่หน้านี้ปฏิเสธ `memberCount: 0` ว่าแปลว่า "ไม่มีคน")
   */
  cities: { id: string; nameTh: string; slug: string | null; countryId?: string }[];
};

function RecommendedTrips() {
  const [templates, setTemplates] = useState<TripTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/engine/trip-templates");
        if (!r.ok) return;
        const body = (await r.json()) as { templates?: TripTemplate[] };
        if (!cancelled && Array.isArray(body.templates)) setTemplates(body.templates);
      } catch {
        // เงียบโดยตั้งใจ — เหตุผลอยู่หัวไฟล์ของบล็อกนี้
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (templates.length === 0) return null;

  return (
    <section id="explore" className="mt-10 border-t border-line pt-6">
      <h2 className="text-lg font-bold text-content">{COPY.recommended}</h2>
      <p className="mb-3 mt-0.5 text-sm text-content-soft">{COPY.recommendedSubheading}</p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
        {templates.map((t) => (
          <CoverCard
            key={t.id}
            /**
             * 🔴 **ไม่ส่งทั้ง `href` และ `onClick` — ปุ่ม "ใช้แผนนี้" เป็นใบถัดไป**
             * `copy_trip_template` พร้อมในฐานแล้ว แต่ route ยังไม่มี ⇒ **ไม่ผูกปลายทางที่ยังไม่มี**
             * ⇒ `CoverCard` เรนเดอร์เป็น `<div>` อ่านอย่างเดียว **ไม่ใช่ปุ่มที่กดแล้วเงียบ**
             *   (เหตุผลเต็มอยู่ที่ `CoverCard.tsx` — ปุ่มที่ไม่ทำอะไร ยัง Tab ไปโดนและถูกประกาศว่า "ปุ่ม")
             */
                  cover={<TripCoverImage destinations={templateDestinations(t)} />}
            title={t.title}
          >
            <p className="mt-1 text-xs font-medium text-content sm:text-sm">
              {COPY.tripLength(t.dayCount, t.nightCount)}
            </p>
            <p
              className="mt-0.5 truncate text-xs text-content sm:text-sm"
              aria-hidden={t.cities.length ? undefined : true}
            >
              {t.cities.length ? `📍 ${t.cities.map((c) => c.nameTh).join(" · ")}` : "\u00a0"}
            </p>
          </CoverCard>
        ))}
      </div>
    </section>
  );
}

/**
 * แปลงเมืองของ template ให้เข้ารูปที่ `TripCoverImage` รับ — **แปลงอย่างเดียว ไม่เดาอะไรเพิ่ม**
 * 🔴 `countryId` ที่หายไปกลายเป็น `""` ⇒ `TripCoverImage` จะยิงหารูปประเทศไม่เจอแล้ว `onError`
 *    ตกไปพื้นไล่สีเอง · **นั่นคือพฤติกรรมที่ถูก** เพราะเราไม่รู้ประเทศจริง ๆ
 * ⚠️ ไม่ใช้ `nameEn` (template ไม่ส่งมา) — ใส่ `nameTh` ซ้ำจะเป็นข้อมูลที่เราแต่งเอง
 *    ที่นี่ปลอดภัยเพราะ `TripCoverImage` อ่านแค่ `slug`/`countryId` **แต่ห้ามเอารูปนี้ไปใช้ที่อื่นโดยไม่อ่านบรรทัดนี้**
 */
function templateDestinations(t: TripTemplate): TripDestination[] {
  return t.cities.map((c) => ({
    cityId: c.id,
    slug: c.slug ?? "",
    nameTh: c.nameTh,
    nameEn: "",
    countryId: "countryId" in c && c.countryId ? c.countryId : "",
    countryNameTh: "",
  }));
}

/**
 * แยก "อ่านไม่ได้" ออกจาก "ไม่มีข้อมูล" — เดิม `.catch()` เดียวจับทั้ง 502 และออฟไลน์แล้ว fallback เป็น
 * `trips=[]` เงียบๆ ทำให้เน็ตสะดุดหน้างานจริงดูเหมือน "ทริปหายไปหมด" (P1 ชี้ 27 ส.ค. 2026 หลังเจอ
 * 502 จริงจาก cover_image_path ระหว่าง live-verify — เห็น "ยังไม่มีทริป" ทั้งที่มีทริปอยู่)
 * รูปแบบเดียวกับ `useActiveTripId`'s `"error"` state (`hooks/useActiveTripId.ts`) แต่ไม่แยกออฟไลน์/502
 * เป็นข้อความคนละแบบ (ตามที่ P1 บอกว่า "ถ้าแยกยากเกินไป รวมเป็นอันเดียวก็ยังดีกว่าปัจจุบันมาก")
 */
/**
 * 🔴 **คีย์ระดับ global โดยเจตนา — ไม่ใช่ลืมใส่ scope**
 * รายการทริปเป็นข้อมูลของ **บัญชี** ไม่ใช่ของทริปใดทริปหนึ่ง จึงใช้ `readCache`/`writeCache` ตรง ๆ
 * แทน `readTripCache` (ซึ่งบังคับ `tripId`) · **ชนิดที่สามในรูปคีย์ของ `lib/localCache.ts`** —
 * P1 ยืนยันรูปนี้ 28 ส.ค. 2026 พร้อมกติกาว่า **global ต้องเขียนเหตุผลกำกับทุกครั้ง**
 * 🎯 เหตุผลของกติกานั้นคือเรื่องนี้เป๊ะ: ถ้าไม่เขียน คีย์ที่ *ลืม* ใส่ scope จะแยกไม่ออกจากคีย์ที่ *ตั้งใจ* ไม่มี
 * · `"tripList"` ไม่อยู่ใน `TRIP_SCOPED_NAMES` ของด่าน `tripCacheScope` จึงผ่านโดยไม่ต้องยกเว้น
 */
const TRIP_LIST_CACHE_KEY = "tripList";

/** `ownerId: null` = เขียนตอนที่ยังไม่รู้ว่าใครล็อกอิน — เติมทีหลังเมื่อ `useCurrentUser` พร้อม */
type CachedTripList = { ownerId: string | null; trips: TripListItem[] };

type TripsState =
  | { status: "loading" }
  | { status: "ready"; trips: TripListItem[] }
  | { status: "error" };

export function HomeScreen() {

  /**
   * 🔴 **ปุ่ม "+ สร้างทริปใหม่" พาไปที่ตัวเลือก ไม่ได้เปิดโมดัลแล้ว** (ผู้ใช้สั่ง 4 ก.ย. 2026)
   * เดิมกดแล้วโมดัลกรอกรายละเอียดเด้งขึ้นทันที ⇒ **บังคับให้เริ่มจากศูนย์เสมอ**
   * ทั้งที่หน้านี้มีทางลัดอยู่แล้วสองทาง (*ทริปแนะนำ* ที่จัดไว้ให้ · *ไปไหนดี?* ที่เลือกจากประเทศ)
   * · ปลายทางคือ **"ไปไหนดี?"** ตามที่ผู้ใช้เลือกเอง (ฉบับแรกหยุดที่ *ทริปแนะนำ*)
   * แต่ทั้งคู่อยู่ **ใต้รายการทริปของผู้ใช้** ⇒ คนที่มีทริปเยอะไม่มีทางเห็นถ้าไม่เลื่อนลงไปเอง
   * 🎯 ***โมดัลไม่ได้ปิดแค่หน้าจอ มันปิดตัวเลือกที่เราอุตส่าห์ทำไว้*** — ผู้ใช้เป็นคนชี้เอง
   */
  const user = useCurrentUser();
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  const [state, setState] = useState<TripsState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 🔴 ห่อ `async function` — `setState` แบบ *synchronous* ในเอฟเฟกต์ผิดกฎ React Compiler
    //    (แพทเทิร์นเดียวกับ `useCatalogPlaces` · `usePlatformItinerary`)
    async function load() {
      // อ่านแคชขึ้นจอก่อน แล้วค่อยให้ของสดทับ — ออฟไลน์แล้วยังเข้าหน้าทริปได้
      // (ก่อนหน้านี้ทำไม่ได้เลยถ้าไม่จำ URL) · ไม่มีแคช = ไม่มีอะไรเกิดขึ้น ไม่ใช่ error
      const cached = readCache<CachedTripList>(TRIP_LIST_CACHE_KEY);
      if (cached && Array.isArray(cached.trips) && cached.trips.length > 0 && !cancelled) {
        setState({ status: "ready", trips: cached.trips });
      }

      // ไม่ setState({status:"loading"}) ตรงนี้ — ตอนกดลองใหม่ จอจะค้างข้อความ "อ่านไม่ได้"
      // ต่อจนกว่า fetch จะตอบ แทนที่จะกะพริบกลับไป skeleton สั้นๆ ยอมรับได้
      try {
        const r = await fetch("/api/engine/trips");
        if (!r.ok) throw new Error(`เปิดรายการทริปไม่ได้ (${r.status})`);
        const rows = (await r.json()) as TripListItem[];
        if (cancelled) return;
        const trips = [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date));
        setState({ status: "ready", trips });
        // 🔴 อ่าน `ownerId` **ใหม่ตอนเขียน** ไม่ใช่ใช้ `cached` ที่จับไว้ก่อน `fetch`
        //    เอฟเฟกต์เติมเจ้าของทำงานคู่ขนานกับตัวนี้ · ใช้ค่าที่จับไว้ = ทับของที่มันเพิ่งเติมกลับเป็น `null`
        //    (วัดเจอจริง: เขียนสำเร็จแต่ `ownerId` เป็น `null` ตลอด → ด่านกันข้ามบัญชีไม่เคยทำงาน)
        writeCache(TRIP_LIST_CACHE_KEY, {
          ownerId: readCache<CachedTripList>(TRIP_LIST_CACHE_KEY)?.ownerId ?? null,
          trips,
        } satisfies CachedTripList);
      } catch {
        // 🔴 มีแคชอยู่แล้ว **ห้ามทับด้วย `error`** — ผู้ใช้กำลังดูรายการอยู่ การเปลี่ยนเป็นหน้าเปล่า
        //    เพราะ refresh เบื้องหลังล้ม คือทำให้แย่ลงกว่าไม่แคชเลย
        if (!cancelled && !cached) setState({ status: "error" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  /**
   * 🔴 **แคชนี้เป็นของ *บัญชี* → ต้องไม่ข้ามผู้ใช้** (P1 ชี้พร้อมกับตอนอนุมัติรูปคีย์)
   * เขียนตอนล็อกอินอยู่จึงรู้ว่าเป็นใคร · **แต่ตอนออฟไลน์ `useCurrentUser` คืน `"anon"`**
   * (มันเรียก `supabase.auth.getUser()` ซึ่งยิงเน็ต) → *"ออกจากระบบ"* กับ *"ถามไม่ได้"* แยกไม่ออกตรงนั้น
   * 🎯 จึงล้างเฉพาะตอน **รู้แน่** ว่าเป็นคนละคน — ไม่ล้างตอน `"anon"` เพราะนั่นอาจแค่เน็ตหลุด
   *    (ล้างตอนนั้น = ลบแคชของเจ้าของเครื่องทิ้งทุกครั้งที่เน็ตสะดุด ซึ่งคือสิ่งที่แคชมีไว้กัน)
   * ⚠️ **นี่ไม่ใช่ตัวแทนของการล้างตอน `signOut`** — ตัวนี้ปิดเคส *"ล็อกอินบัญชีใหม่บนเครื่องเดิม"*
   *    ส่วน *"ออกจากระบบแล้วเดินจากไป"* เป็นหน้าที่ของ `signOut()` ซึ่งเรียก `clearAllCaches()` แล้ว
   *    (`3922389` · ผมรายงานช่องนี้ตอนกำลังจะทำแคชนี้พอดี — เดิม `signOut()` ไม่ล้างอะไรเลยสักคีย์)
   * 🎯 **สองชั้นนี้กันคนละเคส ห้ามถอดอันใดอันหนึ่งเพราะ "อีกอันทำแล้ว"** — `signOut()` ทำงานเฉพาะตอน
   *    ผู้ใช้กดออกเอง · เคสสลับบัญชีโดยไม่ผ่านปุ่มนั้น (session หมดอายุ · ล็อกอินคนละแท็บ) ไม่ผ่านมันเลย
   */
  useEffect(() => {
    if (user.status !== "ready") return;
    const cached = readCache<CachedTripList>(TRIP_LIST_CACHE_KEY);
    if (!cached) return;
    if (cached.ownerId === null) {
      writeCache(TRIP_LIST_CACHE_KEY, { ...cached, ownerId: user.id } satisfies CachedTripList);
      return;
    }
    // 🔴 **ล้าง *ที่เก็บทั้งสองใบ* ไม่ใช่คีย์เดียว** (P3 ชี้ IndexedDB · P1 พบว่าใหญ่กว่านั้น · P2 แก้ 2 ก.ย. 2026)
    // ของเดิมล้างแค่ `TRIP_LIST_CACHE_KEY` → **ชื่อพาสปอร์ต · ที่พัก · ตั๋ว · สถานที่ที่เพิ่มเอง · โน้ต
    // ของเจ้าของคนก่อนอยู่ครบทั้งสองที่เก็บ** · `ImmigrationSheet.tsx:15-17` เขียนอันตรายข้อนี้ไว้เอง
    // แต่เขียนไว้สำหรับเส้นทาง `signOut` — **อันตรายเดียวกัน ปิดแค่ประตูเดียวจากสองประตู**
    // 🎯 และประตูที่เปิดอยู่คือประตูที่ผู้ใช้ *ไม่ได้ตั้งใจเดินผ่าน* (session หมดอายุ · ล็อกอินคนละแท็บ)
    //
    // ⚠️ **`void` ไม่ได้แปลว่า "ยอมให้ล้างช้าได้"** — `clearDeviceData()` เรียก `clearAllCaches()`
    // **ก่อน `await` ตัวแรก** ฝั่ง `localStorage` (ซึ่งเก็บชื่อพาสปอร์ต) จึงถูกล้าง *ในจังหวะเดียวกับ
    // ของเดิมทุกประการ* · ที่เป็น async คือฝั่ง IndexedDB เท่านั้น
    // 🔴 **แปลว่าบรรทัดนี้พึ่ง *ลำดับของคำสั่งข้างใน* `clearDeviceData()`** — ถ้าวันหลังมีคนสลับให้
    // `await clearOfflineStore()` ขึ้นก่อน การล้าง localStorage จะเลื่อนไปหลัง render โดยที่ตรงนี้ไม่มีอะไรเปลี่ยน
    // ✅ **ลำดับนั้นถูกบังคับด้วยเคสแล้ว ไม่ใช่ด้วยคำเตือน** — `lib/__tests__/deviceDataClear.test.ts`
    //    เรียก `clearDeviceData()` **โดยจงใจไม่ `await`** แล้ว assert ว่าคีย์ถูกล้างแล้วในจังหวะ sync
    //    (ถ้า `await` เคสจะเขียวไม่ว่าลำดับข้างในจะเป็นอย่างไร — การไม่ await คือสิ่งที่ทำให้มันมีอำนาจ)
    //    · สลับลำดับ → แดง 2 เคส เขียว 3 · P1 ยิงทิศแดงยืนยันแล้ว (`da1debe`)
    if (cached.ownerId !== user.id) void clearDeviceData();
  }, [user]);

  const trips = state.status === "ready" ? state.trips : null;
  /** เมืองที่กดมาจากเมนู "เลือกปลายทาง" — เปิดฟอร์มพร้อมค่าตั้งต้น · `[]` = กดปุ่มสร้างเปล่า ๆ */
  const [seedCities, setSeedCities] = useState<CityOption[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  /**
   * 🔴 **หน้าแรกต้องรู้จักธีมมืดด้วย** (P1 เจอ 5 ก.ย. 2026 · โซนผม)
   * `/today` `/summary` `/login` `/account` เรียก `useDarkTheme()` กันหมด — **หน้าแรกไม่เรียก**
   * ⇒ กดสลับเป็นมืดที่ `/account` แล้วกด *"กลับหน้าหลัก"* ⇒ **เด้งกลับเป็นสว่างทันที**
   * 🎯 ***ผู้ใช้ตั้งค่าที่ระดับ "คน" แล้วมันหายไปเมื่อเดินไปอีกหน้า — อ่านเหมือนตั้งค่าไม่ติด ไม่ใช่เหมือนหน้านี้ยังไม่รองรับ***
   * · hook นี้อ่านค่าจาก `localStorage` ตัวเดียวกันทุกหน้า ⇒ **เรียกเฉย ๆ ก็พอ ไม่ต้องมีปุ่มสลับที่นี่**
   *   (ปุ่มอยู่ที่หน้าบัญชี ซึ่งเป็นบ้านของการตั้งค่าที่ผูกกับ *คน* ไม่ใช่ *ทริป*)
   */
  useDarkTheme();

  /** โมดัลค้นหาของจอโทรศัพท์ — จอ `sm` ขึ้นไปใช้ช่องในแถบหัวแทน ไม่เคยเปิดตัวนี้ */
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * 🔴 **ปิดโมดัลเองเมื่อจอโตข้าม `sm`** — ปุ่มที่เปิดมันเป็น `sm:hidden` **แต่โมดัลไม่ได้หายตามปุ่ม**
   * ⇒ หมุนจอ / ลากขยายหน้าต่างตอนเปิดอยู่ = ได้โมดัลค้นหา **ทับช่องค้นหาที่โผล่มาในแถบหัวพอดี**
   *   สองอันเดียวกัน ผูกกับ state ตัวเดียวกัน วางซ้อนกัน — และไม่มีอะไรอธิบายให้ผู้ใช้เข้าใจ
   * 🎯 ***ซ่อนปุ่มด้วย CSS ไม่ได้ปิดสถานะที่ปุ่มนั้นเปิดไว้*** — CSS ซ่อนของที่ *มองเห็น* ไม่ได้ย้อน *สิ่งที่เกิดไปแล้ว*
   * · `640px` = จุดเดียวกับ `sm:` ของ Tailwind ที่สลับช่องค้นหา — **ผูกไว้ที่นี่เพราะเปลี่ยนไม่พร้อมกันไม่ได้**
   */
  useEffect(() => {
    if (!searchOpen) return;
    const mq = window.matchMedia("(min-width: 640px)");
    /**
     * 🔴 **ฟังอย่างเดียว ไม่เช็ค `mq.matches` ทันทีในเอฟเฟกต์** — `setState` ตรง ๆ ในเอฟเฟกต์
     * ผิดกฎ `react-hooks/set-state-in-effect` ของรีโปนี้ (`npm run lint` แดง ไม่ใช่แค่เตือน)
     * · และเคสนั้นเกิดไม่ได้อยู่แล้ว: ปุ่มที่เปิดโมดัลเป็น `sm:hidden` ⇒ **กดตอนจอโตไม่ได้ตั้งแต่แรก**
     *   ⚠️ ข้อนี้จริงเพราะ *ปุ่มถูกซ่อน* ไม่ใช่เพราะ *state ป้องกันตัวเอง* — วันที่มีทางเปิดทางอื่น ต้องกลับมาดูตรงนี้
     */
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setSearchOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [searchOpen]);
  const mounted = useMounted();
  /** 🔴 วันนี้ต้องมาจากฝั่ง client เท่านั้น — เหตุผลเดียวกับ `TripCountdownBadge` (หน้านี้ถูก prerender) */
  const todayIso = mounted ? new Date().toISOString().slice(0, 10) : "";

  /**
   * รายการที่แสดงจริง — กรอง **แล้วค่อย** เรียง · คำนวณที่เดียว เพราะทั้งหัวข้อ (จำนวน)
   * และกริดต้องเห็นชุดเดียวกัน · ตัวเลขบนหัวข้อที่ไม่ตรงกับของที่เห็นข้างล่าง อ่านเหมือนเว็บนับผิด
   *
   * 🔴 `localeCompare("th")` ไม่ใช่ `<` — เรียงชื่อไทยด้วยการเทียบ code point ให้ผลที่คนไทยอ่านว่ามั่ว
   *    (สระนำอย่าง เ/แ อยู่หลังพยัญชนะใน Unicode แต่คนอ่านว่าอยู่หน้า)
   */
  const visibleTrips = useMemo(() => {
    const list = (trips ?? []).filter(
      (t) => matchesTripQuery(t, query) && matchesTripTab(t, tab, todayIso)
    );
    /**
     * 🔴 **เรียงตามวันเดินทางอย่างเดียว — ไม่มีตัวเลือกให้ผู้ใช้กด** (ผู้ใช้สั่งเอง 4 ก.ย. 2026)
     * > *"ฟีลเตอร์เอาออก เพราะปกติก็เรียงตามวันเดินทาง มันสมเหตุสมผลแล้ว"*
     * 🎯 ***ตัวเลือกที่ทุกคนใช้ค่าเริ่มต้นเสมอ ไม่ใช่ตัวเลือก มันคือของที่กินที่บนจอ***
     * · เคยมี `เรียงตามชื่อ` ด้วย — ถอดออกพร้อมกัน · เรียงตามชื่อบนรายการที่คนมีไม่กี่ใบ ไม่ช่วยอะไร
     * ⚠️ ถ้าวันหลังมีคนมีทริปเป็นร้อยใบ ให้เอากลับมา **พร้อมเหตุผลว่าจำนวนเท่าไหร่ถึงต้องมี**
     */
    return list.sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [trips, query, tab, todayIso]);


  return (
    <main className="min-h-full bg-surface pb-36 text-content lg:pb-24">
      {/**
       * 🔴 **แถบหัวเป็น *แถบของแอป* ไม่ใช่ *แถบทักทาย*** — รื้อ 4 ก.ย. 2026 (ผู้ใช้สั่งเอง: *"Header มันดูกากไปหน่อย"*)
       *
       * ของเดิม: แถบเขียวสูง มี avatar + `สวัสดี คุณ<ชื่อ>` ตัวหนา กับ ⚙️ **ไม่มีชื่อเว็บ ไม่มีโลโก้**
       * 🎯 ***สิ่งที่เด่นที่สุดในหน้าแรกจึงเป็นชื่อผู้ใช้เอง ซึ่งเป็นข้อมูลชิ้นเดียวที่เขารู้อยู่แล้วโดยไม่ต้องเปิดเว็บ***
       * และหัวข้อจริงของหน้า (`แพลนทริปที่จะมาถึง`) ตัวเล็กกว่าคำทักทาย ⇒ ลำดับความสำคัญกลับหัว
       * · ตอนนี้เว็บกำลังจะให้คนแปลกหน้าใช้ **หน้าแรกคือที่แรกที่เขาตัดสินว่านี่ของจริงหรือของเล่น**
       *
       * ✅ แถบหัวถือ **ตัวตนของสินค้า (ซ้าย) + ทางไปบัญชี (ขวา)** · คำทักทายย้ายลงไปเป็นบรรทัดรองใต้หัวข้อ
       * · `sticky` เพราะตอนนี้มันมีของที่ต้องใช้ (กลับหน้าแรก · บัญชี) — แถบที่เลื่อนหายไปคือแถบที่ไม่มีใครใช้
       */}
      <header className="focus-ring-on-dark sticky top-0 z-20 bg-pine text-cream shadow-sm shadow-ink/10">
        <div className="mx-auto flex max-w-[110rem] items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            {/**
             * 🔴 **มาร์กจริงต้องอยู่บน *พื้นครีมทึบ* ไม่ใช่ `bg-cream/15`** (P2 · 4 ก.ย. 2026)
             * โลโก้ที่ผู้ใช้ส่งมาเป็น **เขียวสน** และแถบหัวก็เป็นพื้นเขียวเข้ม ⇒ **เขียวบนเขียว มองแทบไม่เห็น**
             * (P1 เตือนไว้ก่อนแล้ว และเขาจงใจไม่ทำเวอร์ชันสีอ่อนให้ เพราะ *การเปลี่ยนสีโลโก้ของผู้ใช้
             *  เป็นการตัดสินใจด้านดีไซน์ ไม่ใช่งานแปลงไฟล์* — ถูก)
             *
             * ✅ เลือกทาง **"มาร์กในชิปครีม"** ไม่ใช่ *"ตัดมาร์กทิ้ง เหลือแต่ตัวอักษร"*:
             * · ช่องไอคอนมีอยู่แล้วในแถบหัว (เดิมเป็นอีโมจิ 🧭) — สลับของข้างในพอ ไม่ต้องรื้อโครง
             * · **ตรงกับไอคอนแอปที่ P1 ทำไว้** ซึ่งวางมาร์กบนพื้นครีมเหมือนกัน ⇒ คนเห็นรูปเดียวกันทั้งบนเว็บและบนโฮมสกรีน
             * · **ไม่ต้องรอไฟล์เวอร์ชันสีอ่อนจากผู้ใช้** — ทางที่สามในสามทางของ P1 คือการหยุดรอ
             * ⚠️ ต้นฉบับเป็น jpeg 2048px มี artifact รอบเส้นอยู่แล้ว · **ใช้ที่ 36px มองไม่เห็น** แต่ห้ามขยายใหญ่กว่านี้
             */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/ ที่ทีมวางเอง */}
              <img src="/logo-mark.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <span className="min-w-0">
              {/**
               * 🔴 **ชื่อสองภาษา บรรทัดเดียวกัน · ตัวอักษรเหมือนกันทุกประการ**
               * ผู้ใช้สั่งสองรอบ: *"ลุยทริป ควรอยู่ บรรทัดเดียวกับ luitrip"* →
               * *"ควรเป็นตัวอักษรที่เหมือนกับ luitrip ทุกประการ"* (4 ก.ย. 2026)
               *
               * ⚠️ **ฉบับก่อนหน้าทำ `ลุยทริป` ให้เล็กและจางกว่า** ด้วยเหตุผลว่า *"สองชื่อขนาดเท่ากันจะอ่านเหมือน
               * สองแบรนด์"* — **ผู้ใช้เห็นแล้วและสั่งทับ · ข้อนั้นตายแล้ว ห้ามอ้างอิงและห้ามเอากลับมา**
               * 🎯 ***เขาไม่ได้อยากได้ "ชื่อกับคำอ่าน" — เขาอยากได้ชื่อเดียวที่เขียนได้สองภาษา***
               *    ซึ่งเป็นการตัดสินใจเรื่องแบรนด์ ไม่ใช่เรื่องลำดับชั้นทางสายตา **และเป็นของเขา**
               *
               * · ไม่มี `<span>` ซ้อนแล้ว — **ตัวอักษรเดียวกันต้องมาจากที่เดียวกัน ไม่ใช่สองที่ที่ตั้งค่าให้ตรงกัน**
               *   (ถ้าซ้อนไว้ วันที่มีคนแก้ขนาดข้างนอก ข้างในจะไม่ตาม แล้วมันจะเพี้ยนเงียบ ๆ)
               * · `truncate` อยู่ที่ตัวเดียวกันนี้ ⇒ จอแคบตัดท้ายสุด **ไม่ใช่ตัดชื่อหลักทิ้ง**
               */}
              <span className="block truncate text-base font-extrabold leading-tight">
                {COPY.brand} {COPY.brandTh}
              </span>
              {/**
               * 🔴 **คำโปรยกลับไปซ่อนบนมือถือแล้ว** — เดิมเอาขึ้นมาเพราะ *"มือถือคือที่ที่คนไทยเจอชื่อ
               * ครั้งแรกและไม่มีบริบทเลย"* · **เหตุผลนั้นหมดอายุแล้ว: ชื่อไทยขึ้นไปอยู่บรรทัดชื่อแล้ว**
               * 🎯 ***คำโปรยเคยทำหน้าที่ "บอกว่านี่คืออะไร" แทนชื่อไทย — พอชื่อไทยมาเอง มันเหลือแค่คำอธิบาย***
               * ⇒ ที่ 375px คืนความสูงให้แถบหัว โดยไม่มีใครเสียข้อมูลที่ตัวเองต้องใช้
               */}
              <span className="hidden text-2xs leading-tight text-cream/70 sm:block">
                {COPY.brandTagline}
              </span>
            </span>
          </Link>

          {/**
           * 🔴 **ช่องค้นหาอยู่ *แถวเดียวกับชื่อเว็บ*** (ผู้ใช้สั่งเอง 4 ก.ย. 2026 · ย้ายจากแถวที่สอง)
           *
           * ⚠️ **ฉบับก่อนหน้าแยกเป็นแถวที่สองโดยตั้งใจ** ด้วยเหตุผลว่าที่ 375px จะเหลือที่ไม่พอสำหรับ
           * ชื่อ+ค้นหา+ปุ่มบัญชีพร้อมกัน — **ผู้ใช้เห็นแล้วและสั่งย้าย · ข้อนั้นตายแล้ว**
           * ✅ ที่ทำให้มันอยู่ได้จริงคือ **ให้ทั้งสามอย่างยอมหดคนละแบบ ไม่ใช่แย่งที่กันแบบตายตัว**
           * ```
           * ชื่อเว็บ    min-w-0 + truncate   ยอมถูกตัดท้าย (ชื่อไทยหายก่อน ชื่อหลักอยู่)
           * ค้นหา      flex-1 + min-w-0     กินที่ที่เหลือ · `max-w-md` กันไม่ให้ยืดยาวบนจอ 27"
           * ปุ่มบัญชี   shrink-0             **ไม่ยอมหด** — เป็นทางออกจากหน้านี้ กดพลาดไม่ได้
           * ```
           *
           * ## 🔴 **ต่ำกว่า 430px มันตกไปเป็นแถวของตัวเอง — และนั่นไม่ใช่การถอยจากคำสั่งผู้ใช้**
           * วัดที่ 375px (iPhone SE) ตอนบังคับให้อยู่แถวเดียว: ช่องเหลือ **90px** ⇒ เห็นแค่ `"ค้"`
           * 🎯 ***ช่องค้นหาที่อ่านไม่ออกว่าเป็นช่องค้นหา ไม่ได้อยู่บนแถวนั้นจริง มันแค่กินที่อยู่***
           * ⇒ `flex-wrap` + `min-w-[11rem]` ⇒ **อยู่แถวเดียวทุกที่ที่มันพอดี · ตกลงมาเมื่อไม่พอ**
           * · `order-last` ตอนตกแถว ⇒ ลำดับเป็น ชื่อเว็บ → บัญชี → ค้นหา **ไม่ใช่แทรกกลาง**
           * · เกณฑ์ `430px` มาจากการวัด ไม่ใช่ breakpoint สำเร็จรูป: iPhone 14 Pro Max = 430 พอดี
           * · ขึ้นเฉพาะตอน**มีทริปให้ค้น** — ช่องค้นหาบนหน้าที่ไม่มีอะไรให้ค้น คือช่องที่พิมพ์แล้วไม่มีอะไรเกิดขึ้น
           *   🎯 และตอนไม่มีทริป **ชื่อเว็บจะได้ที่คืนทั้งแถบ** ⇒ ผู้ใช้ใหม่เห็นชื่อเต็มไม่ถูกตัด
           *
           * 🔴 **รูปช่องค้นหาตามภาพที่ผู้ใช้ส่งมา** (4 ก.ย. 2026): พื้นสว่าง · ขอบมน ·
           * **ปุ่มแว่นขยายเป็นบล็อกสีทึบชิดขวา** — ไม่ใช่ไอคอนจาง ๆ ลอยอยู่ข้างใน
           *
           * ## 🔴 ใช้ `<label>` ไม่ใช่ `<button
              type="button">` — และความต่างนี้ไม่ใช่เรื่องเทคนิค
           * การกรองเป็นแบบ **สดตามที่พิมพ์** ⇒ ไม่มี "การค้นหา" ให้กดสั่ง
           * ⇒ ทำเป็น `<button
              type="button">` จะได้ปุ่มที่ **กดแล้วไม่มีอะไรเกิดขึ้น** ซึ่งเป็นข้อที่เพิ่งแก้ไปที่การ์ดทริปแนะนำ
           * ✅ `<label htmlFor>` ทำให้กดตรงบล็อกสีแล้ว **เคอร์เซอร์ไปอยู่ในช่อง** — เป็นสิ่งที่คนคาดหวังจริง
           *    และเป็นพฤติกรรมมาตรฐานของเบราว์เซอร์ **ไม่ต้องเขียน `onClick` เลยสักบรรทัด**
           *
           * ⚠️ **สีบล็อกใช้ `maple-dark` ไม่ใช่น้ำเงินตามภาพ** — ภาพเป็นเว็บอื่น · น้ำเงินไม่มีในชุดสีเรา
           *    และวางบนแถบเขียวจะกลายเป็นสีที่สามที่ไม่เกี่ยวกับอะไรเลย · `maple-dark`/ขาว = **4.98 ผ่าน AA**
           */}
          {trips !== null && trips.length > 0 && (
            <label
              htmlFor="home-trip-search"
              className="group hidden min-w-0 flex-1 cursor-text items-center overflow-hidden rounded-xl bg-cream ring-1 ring-ink/10 sm:flex sm:max-w-md"
            >
              <input
                id="home-trip-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={COPY.searchPlaceholder}
                aria-label={COPY.searchPlaceholder}
                {...SEARCH_INPUT_QUIET}
                className="min-w-0 flex-1 bg-transparent py-2 pl-3.5 pr-2 text-sm text-content outline-none placeholder:text-content-soft focus-visible:outline-none"
              />
              {/**
               * 🔴 **แว่นขยายเป็น SVG ไม่ใช่อีโมจิ `🔍`** (ผู้ใช้สั่งเอง 4 ก.ย. 2026)
               * อีโมจิ **มีสีของตัวเอง ระบบปฏิบัติการเป็นคนวาด** ⇒ วางบนบล็อกสีแล้วได้แก้วแก้มฟ้า
               * ที่ไม่เกี่ยวกับชุดสีเรา · และ**หน้าตาต่างกันทุกเครื่อง** (macOS · Windows · Android คนละรูป)
               * ⇒ `stroke="currentColor"` ทำให้มันเป็น *สีของข้อความ* ⇒ **ตามธีมและตามพื้นหลังเสมอ**
               * · `strokeWidth 2.2` + `strokeLinecap round` ให้น้ำหนักใกล้เคียงตัวอักษรหนาข้าง ๆ
               */}
              <span className="mr-1 flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-maple-dark text-white transition group-focus-within:bg-maple">
                <SearchIcon />
              </span>
            </label>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {/**
             * 🔴 **จอโทรศัพท์ได้ *ไอคอน* ไม่ใช่ช่อง — กดแล้วเปิดโมดัล** (ผู้ใช้ออกแบบเอง 4 ก.ย. 2026)
             *
             * ## ทำไมทางนี้ชนะทั้งสองทางที่ลองมาก่อน
             * ```
             * ช่องเต็มในแถวเดียว   375px เหลือ 90px → เห็นแค่ "ค้"        ช่องที่อ่านไม่ออกว่าเป็นช่องค้นหา
             * ช่องตกลงมาแถวสอง     ได้ 343px แต่แถบหัวสูง 65 → 109px      กินที่เนื้อหาตลอดเวลา
             *                                                            **เพื่อของที่ใช้เป็นครั้งคราว**
             * ไอคอน + โมดัล        แถบหัวเตี้ยตลอด · ตอนค้นได้เต็มจอ      จ่ายเฉพาะตอนใช้
             * ```
             * 🎯 ***สองทางแรกพยายามหาที่ให้ช่องค้นหาอยู่ถาวร — ทางนี้ถามว่าทำไมมันต้องอยู่ถาวร***
             *
             * ## 🔴 ปุ่มต้องบอกได้ว่า **กำลังกรองอยู่** — ไม่ใช่แค่เปิดโมดัลได้
             * โมดัลปิดแล้วคำค้นมองไม่เห็น ⇒ ผู้ใช้จะเห็นรายการสั้นลง **โดยไม่มีอะไรอธิบายว่าทำไม**
             * ⇒ มีคำค้นค้าง: ปุ่มเปลี่ยนเป็นสีทึบ + จุดบอกสถานะ + `aria-label` บอกคำค้นจริง
             * ⚠️ **จุดอย่างเดียวไม่พอ** — คนที่ใช้โปรแกรมอ่านหน้าจอไม่เห็นจุด ⇒ ต้องอยู่ใน `aria-label` ด้วย
             */}
            {trips !== null && trips.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={query.trim() ? COPY.searchActive(query.trim()) : COPY.searchOpen}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition sm:hidden ${
                  query.trim() ? "bg-maple-dark text-white" : "bg-cream/10 text-cream hover:bg-cream/20"
                }`}
              >
                <SearchIcon className="h-[1.15rem] w-[1.15rem]" />
                {query.trim() && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-cream ring-2 ring-pine"
                  />
                )}
              </button>
            )}
            {user.status === "anon" ? (
              <Link
                href="/login"
                className="rounded-lg bg-cream/10 px-3 py-1.5 text-sm font-medium hover:bg-cream/20"
              >
                {COPY.login}
              </Link>
            ) : user.status === "ready" ? (
              /**
               * 🔴 **จอ `lg` ขึ้นไปเท่านั้น** — ต่ำกว่านั้น `SiteNav` มีปุ่ม "บัญชี" อยู่ที่ล่างจอแล้ว
               * (ผู้ใช้สั่งเอง 5 ก.ย. 2026 · เหตุผลเต็มอยู่ที่ `components/AccountMenu.tsx`)
               * ⚠️ `hidden lg:block` ต้องคู่กับ `lg:hidden` ของ `SiteNav` เสมอ — **ย้ายอันเดียวจะได้
               *    ช่วงจอที่ไม่มีทางเข้าหน้าบัญชีเลย หรือมีสองทางพร้อมกัน** และไม่มีอะไรฟ้อง
               */
              <div className="hidden lg:block">
                <AccountMenu displayName={user.displayName ?? "?"} />
              </div>
            ) : (
              <span className="hidden h-9 w-9 lg:block" aria-hidden />
            )}
          </div>
        </div>

      </header>

      <div className="mx-auto max-w-[110rem] px-4 pt-5">
        {state.status === "loading" ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-24 animate-pulse rounded-2xl bg-surface-soft" />
          </div>
        ) : state.status === "error" ? (
          // 🔴 ห้ามเหมารวมกับ "ยังไม่มีทริป" (trips.length===0) — ผู้ใช้ต้องแยกออกว่านี่คืออ่านไม่ได้
          // ไม่ใช่ทริปหาย และห้ามมี CreateTripForm ตรงนี้ (จะเสี่ยงให้สร้างทริปซ้ำทั้งที่ของเดิมยังอยู่
          // แค่โหลดไม่ได้) มีแต่ทางลองใหม่ (P1 ขอ E5, 27 ส.ค. 2026)
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-content-soft">{COPY.tripsUnreadable}</p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="rounded-lg bg-maple px-4 py-2 text-sm font-semibold text-white hover:bg-maple-dark"
            >
              {COPY.retry}
            </button>
          </div>
        ) : state.trips.length === 0 ? (
          /**
           * 🔴 **ผู้ใช้ใหม่ที่ยังไม่มีทริปสักใบ — เดิมเห็นหน้าเปล่า + ฟอร์มเปล่า**
           * เขาไม่รู้ว่าเว็บนี้ทำอะไรได้ และไม่รู้ว่าจะเริ่มยังไง · ***นี่คือคุณค่าหลักของงานนี้ ไม่ใช่ผลพลอยได้***
           * ⇒ ให้เมนู "เลือกปลายทาง" กินเต็มหน้าแทน · ฟอร์มเปล่ายังอยู่ใต้สุดสำหรับคนที่รู้อยู่แล้วว่าจะไปไหน
           */
          <div id="explore" className="py-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
              {E5_COPY.explorer.heading}
            </h1>
            <p className="mb-4 mt-1 text-sm text-content-soft">{E5_COPY.explorer.subheading}</p>
            <DestinationExplorer />
            <div className="mt-8 border-t border-line pt-6">
              <p className="mb-3 text-sm text-content-soft">{COPY.noTripsYet}</p>
              <div className="w-full max-w-xs">
                <CreateTripForm />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/**
             * 🔴 **หัวข้อของหน้าต้องใหญ่กว่าคำทักทาย** — ของเดิมกลับกัน (`text-sm uppercase` ใต้ `สวัสดี…` ตัวหนา)
             * คำทักทายไม่ใช่เนื้อหา มันคือบริบท ⇒ ลงมาเป็นบรรทัดรอง พร้อมจำนวนทริปซึ่ง **ตอบคำถามจริงกว่า**
             */}
            <div className="mb-4">
              <h1 className="text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
                {COPY.myTrips}
              </h1>
              <p className="mt-1 text-sm text-content-soft">
                {user.status === "ready" && user.displayName
                  ? `${COPY.greeting(user.displayName)} · ${COPY.tripCount(visibleTrips.length)}`
                  : COPY.tripCount(visibleTrips.length)}
              </p>
            </div>
            {/**
             * 🔴 **grid ไม่ใช่ `space-y`** — ของเดิมเป็นคอลัมน์เดียวใน `max-w-3xl` ⇒ บนจอ 1440px
             * ได้แถบแคบ ๆ กลางจอ และครีมเปล่าเกินครึ่ง · **หน้านี้ถูกออกแบบสำหรับมือถือแล้วยืดใส่ desktop**
             * 🎯 มือถือดูดีกว่า desktop ในภาพชุดเดียวกันที่ผู้ใช้ส่งมา — นั่นคืออาการของข้อนี้ ไม่ใช่ของ Header
             */}
            {/**
             * แท็บ + การเรียง — **คำนวณจากข้อมูลที่รายการทริปมีจริงเท่านั้น**
             * 🔴 **ไม่มีแท็บ "ยอดนิยม"** ที่เรฟเขียนไว้: ทริปเป็นของส่วนตัว **ไม่มีมิติความนิยมในระบบเลย**
             *    ⇒ ใส่ไปจะเป็นแท็บที่ว่างตลอดกาล และผู้ใช้จะอ่านว่าเว็บพัง ไม่ใช่ว่ายังไม่มีของ
             * 🔴 **ไม่มีเรียง "แก้ไขล่าสุด"** ด้วยเหตุผลเดียวกัน — `GET /api/engine/trips` ไม่คืน `updated_at`
             *    ⇒ ต้องขอ P1 เพิ่มก่อน · ทำตัวเลือกที่เรียงไม่ได้จริงคือการโกหกที่ดูเหมือนฟีเจอร์
             */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label={COPY.upcomingTrips} className="flex flex-wrap gap-1">
                {(
                  [
                    ["all", COPY.tabAll],
                    ["upcoming", COPY.tabUpcoming],
                    ["solo", COPY.tabSolo],
                    ["group", COPY.tabGroup],
                  ] as [TabKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    /**
                     * 🔴 **`role="tab"` ที่ไม่มี `aria-controls` เป็นสัญญาที่ผิด**
                     * โปรแกรมอ่านหน้าจอประกาศว่า *"แท็บ 1 จาก 4"* แล้วผู้ใช้จะกด `Ctrl+Alt+↓`
                     * เพื่อกระโดดเข้าเนื้อของแท็บ — **แล้วไม่มีอะไรให้กระโดดไป**
                     * ⇒ ชี้ไปที่กริดทริป ซึ่ง *เป็น* เนื้อของแท็บอยู่แล้วโดยพฤตินัย
                     */
                    aria-controls="trip-grid"
                    onClick={() => setTab(key)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      tab === key
                        ? "bg-pine text-cream"
                        : "bg-surface-soft text-content-soft hover:text-content"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {visibleTrips.length === 0 ? (
              /* 🔴 ว่างเพราะ *ตัวกรอง* — ห้ามใช้ข้อความเดียวกับ "ยังไม่มีทริป" ซึ่งแปลคนละอย่างสิ้นเชิง
                 (รูปเดียวกับที่ไฟล์นี้แยก "อ่านไม่ได้" ออกจาก "ไม่มีข้อมูล" ไว้แล้วข้างบน) */
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-content-soft">{COPY.noMatch}</p>
                <button
              type="button"
                  onClick={() => {
                    setQuery("");
                    setTab("all");
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-soft"
                >
                  {COPY.noMatchClear}
                </button>
              </div>
            ) : (
              /**
               * 🔴 **`auto-fill` + `minmax` แทน breakpoint ตายตัว** — รื้อ 4 ก.ย. 2026 (ผู้ใช้ส่งภาพจอ 27" มา:
               * *"ดูแคบ ๆ ไม่เต็มตา"*) · ผมวัดเองที่ 1780px: grid กว้าง **1120px = 63% ของจอ** ขอบว่างข้างละ 330px
               *
               * 🎯 ***ทางแก้ที่ผิดคือถอด `max-w` ทิ้งเฉย ๆ*** — การ์ดจะยืดเป็นแถบยาวบนจอ 27"
               *    แล้วสายตาต้องกวาดไกลจากรูปไปถึงข้อความ **ซึ่งเป็นปัญหาคนละใบที่แก้ยากกว่า** (P1 เตือน · ถูก)
               * ✅ ให้ ***จำนวนคอลัมน์*** โตตามจอ · การ์ดคงความกว้างที่อ่านสบาย (17rem–1fr)
               *
               * ⚠️ **ไม่ใช้ `sm:`/`xl:` เพราะจอผู้ใช้ไม่ได้อยู่ที่ค่ามาตรฐานของ Tailwind** —
               *    breakpoint ตายตัวจะพอดีเฉพาะจอที่เราบังเอิญทดสอบ · `auto-fill` ไล่ระดับเองทุกความกว้าง
               *    ซึ่งตรงกับที่ผู้ใช้ขอว่า *"ต้องทำเผื่อรองรับขนาดทุกหน้าจอ"*
               */
              <div id="trip-grid" role="tabpanel" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
                {visibleTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    viewerName={user.status === "ready" ? user.displayName ?? null : null}
                    viewerId={user.status === "ready" ? user.id : null}
                  />
                ))}
              </div>
            )}

            {/**
             * 🔴 **เมนูปลายทางอยู่ *ใต้* ทริปของฉัน เมื่อผู้ใช้มีทริปแล้ว**
             * คนที่มีทริปอยู่แล้วเปิดหน้านี้มาเพื่อ **เข้าทริปเดิม** ไม่ใช่เพื่อเริ่มทริปใหม่
             * ⇒ วางเมนูไว้บนจะดันของที่เขามาหาให้ต้องเลื่อน · **สลับลำดับเองเมื่อยังไม่มีทริป** (ดูกิ่งข้างบน)
             */}
            {/**
             * 🔴 **หัวข้อที่ 2 "ทริปแนะนำ" ยังไม่เรนเดอร์เลย — และนั่นคือการตัดสินใจ ไม่ใช่การลืม**
             * P1 กำลังทำ `list_trip_templates()` · **ช่วงแรกจะยังไม่มีแผนสักใบ** เพราะต้องมีคนนั่งจัดจริง
             * ⇒ ***หัวข้อเปล่าอ่านเหมือนเว็บพัง · ไม่มีหัวข้อเลยอ่านเหมือนยังไม่มีฟีเจอร์*** — อย่างหลังจริงกว่า
             * 📌 เสียบเมื่อ P1 ส่ง shape มา · **ผมจะไม่เดาชื่อฟิลด์ล่วงหน้า**
             */}
            {/* 🔴 กล่องนี้คือปลายทางของปุ่ม "+ สร้างทริปใหม่" — ครอบ *ทั้งสอง* ทางเลือกโดยตั้งใจ
                ผู้ใช้บอกว่าต้องการเห็น **ทริปแนะนำ หรือ เลือกจากไปไหนดี** ⇒ เลื่อนไปที่อันใดอันหนึ่ง
                จะซ่อนอีกอันไว้ใต้จอ · `tabIndex={-1}` ให้โฟกัสไปลงได้ แต่ไม่เพิ่มลำดับ Tab ให้คนอื่น */}
            <div>
              <RecommendedTrips />

              {/* 🔴 **ปลายทางของปุ่มคือหัวข้อนี้ ไม่ใช่ "ทริปแนะนำ"** (ผู้ใช้ย้ายเอง 4 ก.ย. 2026)
                  ฉบับก่อนหยุดที่กล่องครอบซึ่งเริ่มที่ *ทริปแนะนำ* · ผู้ใช้เลือก *ไปไหนดี?* แทน
                  📌 ทริปแนะนำยังอยู่เหนือขึ้นไป — เลื่อนขึ้นนิดเดียวก็เจอ **ไม่ได้หายไปไหน**
                  ⚠️ `scroll-mt-20` (80px) ไม่ใช่ค่าสุ่ม — **แถบหัวเป็น `sticky top-0` สูง 63px** (วัดจากหน้าจริง)
                     เผื่อน้อยกว่านั้นหัวข้อจะมุดใต้แถบ ⇒ เลื่อนถึงแล้วแต่อ่านไม่ออกว่าถึงอะไร
                     (ฉบับแรกใช้ 16px แล้วเหลือระยะแค่ 23px — ผู้ใช้ทักเอง) */}
              <section id="explore" className="mt-10 border-t border-line pt-6">
                <h2 className="text-lg font-bold text-content">{E5_COPY.explorer.heading}</h2>
                <p className="mb-3 mt-0.5 text-sm text-content-soft">{E5_COPY.explorer.subheading}</p>
                <DestinationExplorer />
              </section>
            </div>
          </>
        )}
      </div>

      {/* FAB มุมขวาล่าง — ผู้ใช้ขอมาตรงๆ ว่ากดด้วยมือเดียวได้ (ไม่ต้องเลื่อนไปหาลิงก์ในหัวข้อ) แสดงเฉพาะ
          ตอนมีทริปอยู่แล้ว (สถานะว่างมีฟอร์มเต็มบนหน้าอยู่แล้ว ไม่ต้องมีปุ่มลอยซ้อนอีกจุด) */}
      {trips !== null && trips.length > 0 && (
        <Link
          /**
           * 🔴 **เป็น `<Link>` ไปหน้า `/explore` แล้ว ไม่ใช่ปุ่มเลื่อนหน้า** (ผู้ใช้สั่งเอง 5 ก.ย. 2026)
           * > *"ถ้ากดปุ่มนี้ พาไปที่นี่ด้วย `/explore` **แต่ให้เลือกประเทศก่อน**"*
           * · เดิมเรียก `scrollToChoices()` เลื่อนไปที่หัวข้อ *"ไปไหนดี?"* ในหน้าเดียวกัน (งานของ P3)
           *   ⇒ ถอด `scrollToChoices` + `chooseRef` ออกพร้อมกัน **ไม่งั้นเหลือโค้ดที่ไม่มีใครเรียก**
           *   🎯 ***รูปเดียวกับกิ่งกริดเมืองที่เพิ่งตายไปเมื่อกี้ — ของที่ตายเพราะมีคนเปลี่ยนทางเข้า ไม่ใช่เพราะมันผิด***
           * · เป็นลิงก์จริง ⇒ **เปิดแท็บใหม่ · คลิกกลาง · คัดลอกที่อยู่ได้**
           *
           * ⚠️ **`readOnly` ใช้ `aria-disabled` ไม่ใช่ `disabled`** — `<a>` ไม่มี `disabled` ตามสเปก
           *   ⇒ ต้องกันการกดเองด้วย `onClick` · **ถ้าลืม จะได้ลิงก์ที่ดู "ปิดอยู่" แต่กดผ่านได้จริง**
           */
          href="/explore"
          aria-label={COPY.newTrip}
          aria-disabled={readOnly || undefined}
          onClick={(e) => {
            if (readOnly) e.preventDefault();
          }}
          title={readOnly ? COPY.readOnlyFab : undefined}
          className={`fixed bottom-20 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-maple-dark px-5 font-semibold text-white shadow-lg shadow-ink/20 transition hover:brightness-90 sm:right-8 lg:bottom-6 ${
            readOnly ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          {COPY.newTrip}
        </Link>
      )}

      {/* 🔴 ห้ามใส่ความสูงขั้นต่ำให้กล่องนี้ — เคยใส่ `min-h-[26rem]` แล้วถอนออก 28 ส.ค. 2026
          เหตุผลตอนใส่: ปฏิทินถูกตัดเมื่อที่ว่างใต้ช่องวันที่ไม่พอ จึงดันกล่องให้สูงเพื่อหาที่ให้มัน
          เป็นการแก้ที่อาการ · ต้นเหตุจริงถูกแก้ทีหลังใน `AnchoredPanel`: แผ่นที่เลื่อนไม่ได้ (ปฏิทิน)
          จะเลื่อนตัวเองขึ้นให้พอดีจอ ไม่ตัดเนื้อทิ้ง → ความสูงของกล่องไม่เกี่ยวอีกต่อไป
          สิ่งที่เหลืออยู่คือช่องว่างเปล่าใต้ปุ่ม ซึ่งผู้ใช้ทักเอง */}
      {/**
       * โมดัลค้นหาของ **จอโทรศัพท์** — เนื้อหาน้อยโดยตั้งใจ: ช่องพิมพ์ + จำนวนผล
       *
       * 🔴 **ไม่แสดงรายการผลในโมดัล** ทั้งที่ดูเหมือนควรมี — รายการจริงอยู่ข้างหลังและ
       * ถูกกรองอยู่แล้วตามที่พิมพ์ ⇒ วาดซ้ำในโมดัลคือ **การ์ดทริปสองชุดที่ต้องดูแลให้เหมือนกันตลอดไป**
       * 🎯 ***ปุ่มปิดจึงต้องบอกจำนวน*** — คนพิมพ์อยู่มองไม่เห็นรายการที่ถูกโมดัลบัง
       *    `ดูผลลัพธ์ 3 ทริป` ตอบว่า *"พิมพ์พอหรือยัง"* ซึ่งเป็นคำถามเดียวที่เขามีตอนนั้น
       * · `autoFocus` ⇒ แป้นพิมพ์ขึ้นทันที · ไม่ต้องแตะสองครั้ง
       * · ปิดโมดัล **ไม่ล้างคำค้น** — ตัวกรองยังทำงานต่อ และปุ่มในแถบหัวเปลี่ยนสถานะบอกไว้แล้ว
       */}
      {searchOpen && (
        <Modal
          onClose={() => setSearchOpen(false)}
          title={COPY.searchOpen}
          size="md"
          /**
           * 🔴 **`top` ไม่ใช่ `sheet`** — ปุ่มที่เปิดมันอยู่ *มุมบนขวาของแถบหัว*
           * กล่องที่โผล่ชิดขอบล่างสุดทำให้สายตาต้องกระโดดข้ามทั้งจอ (ผู้ใช้ทักเอง 4 ก.ย. 2026)
           * 🎯 ***กล่องที่โผล่ไกลจากสิ่งที่กด อ่านเหมือนของคนละชิ้น ไม่ใช่ผลของการกดนั้น***
           * · และช่องพิมพ์เดิมอยู่ที่ y=558 จาก 667 ⇒ **แป้นพิมพ์ขึ้นมาก็บังพอดี**
           */
          align="top"
          footer={
            <>
              <button
                type="button"
                onClick={() => setQuery("")}
                disabled={query.trim() === ""}
                className="rounded-lg px-3 py-2 text-sm text-content-soft disabled:opacity-40"
              >
                {COPY.searchClear}
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="ml-auto rounded-lg bg-maple-dark px-4 py-2 text-sm font-semibold text-white"
              >
                {COPY.searchShowResults(visibleTrips.length, query.trim() !== "")}
              </button>
            </>
          }
        >
          {/**
           * 🔴 **ช่องค้นหา *ไม่มี* วงโฟกัสเลย — ตั้งใจ และผู้ใช้สั่งสามรอบ** (4 ก.ย. 2026)
           *
           * ## ที่ลองมาแล้วและใช้ไม่ได้ ทั้งสองทาง
           * ```
           * focus-within:ring-maple          ส้มจัด · ซ้อนกับ :focus-visible ของ globals อีกชั้น = สองเส้น
           * has-[:focus-visible]:ring-…      คิดว่าจะขึ้นเฉพาะตอนกด Tab — **ผิด**
           * ```
           * 🔴 **`autoFocus` ทำให้เบราว์เซอร์ถือว่าเป็นโฟกัสแบบคีย์บอร์ด** ⇒ `:focus-visible` เป็นจริง
           *    **ตั้งแต่วินาทีที่กล่องเปิด** ต่อให้เปิดด้วยการแตะก็ตาม (ยิงลำดับ pointer จริงยืนยันแล้ว: `true`)
           * 🎯 ***`:focus-visible` ตอบว่า "เบราว์เซอร์คิดว่าควรโชว์ไหม" ไม่ได้ตอบว่า "ผู้ใช้ใช้คีย์บอร์ดไหม"***
           *    — สองอย่างนี้ต่างกันเมื่อโฟกัสถูกตั้งด้วยโค้ด ซึ่งเป็นสิ่งที่เราทำเองที่บรรทัด `autoFocus`
           *
           * ## a11y — ที่ยอมได้เพราะอะไร (ไม่ใช่เพราะผู้ใช้สั่ง)
           * ช่องข้อความมี **เคอร์เซอร์กะพริบ** เป็นตัวบอกโฟกัสของมันเองอยู่แล้ว · และช่องนี้ถูกโฟกัส
           * ตั้งแต่กล่องเปิด ⇒ **ไม่มีจังหวะที่ผู้ใช้ต้องเดาว่าโฟกัสอยู่ไหน**
           * ⚠️ **เหตุผลนี้ใช้ได้กับ *ช่องข้อความที่ autofocus ในกล่องที่มีช่องเดียว* เท่านั้น** —
           *    ห้ามยกไปใช้กับปุ่ม/ลิงก์/ฟอร์มหลายช่อง ซึ่งไม่มีเคอร์เซอร์ให้ดูและต้อง Tab ไล่
           */}
          <label
            htmlFor="home-trip-search-modal"
            className="flex cursor-text items-center gap-2 rounded-xl bg-surface-soft px-3 py-2 ring-1 ring-line"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-content-soft" />
            <input
              id="home-trip-search-modal"
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={COPY.searchPlaceholder}
              {...SEARCH_INPUT_QUIET}
              className="min-w-0 flex-1 bg-transparent text-base text-content outline-none placeholder:text-content-soft focus-visible:outline-none"
            />
          </label>
        </Modal>
      )}

      {createOpen && (
        <Modal
          onClose={() => {
            setCreateOpen(false);
            // 🔴 ล้างเมืองตั้งต้นตอนปิด — ไม่งั้นกดปุ่ม "+ สร้างทริปใหม่" รอบถัดไปจะได้เมืองของรอบก่อนติดมา
            //    โดยที่ผู้ใช้ไม่ได้เลือก **และไม่มีอะไรบอกว่ามันมาจากไหน**
            setSeedCities([]);
          }}
          title={COPY.newTrip}
          size="md"
        >
          <CreateTripForm initialDestinations={seedCities} />
        </Modal>
      )}
      {/**
       * 🔴 **แถบเมนูระดับเว็บ วางที่ *หน้า* ไม่ใช่ที่ `layout`** — หน้าทริปมี `BottomNav` ของตัวเองอยู่แล้ว
       * ถ้าวางที่ layout จะต้องมีเงื่อนไข *"ยกเว้นหน้าทริป"* ซึ่งลืมง่ายกว่า และพังแบบเงียบ (สองแถบซ้อนกัน)
       */}
      <SiteNav />
    </main>
  );
}
