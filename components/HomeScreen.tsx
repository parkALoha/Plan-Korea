"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardBadge, CoverCard } from "@/components/CoverCard";
import { CreateTripForm } from "@/components/CreateTripForm";
import { DestinationExplorer } from "@/components/DestinationExplorer";
import type { CityOption } from "@/components/TripDestinationPicker";
import { InitialAvatar } from "@/components/InitialAvatar";
import { Modal } from "@/components/Modal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMounted } from "@/hooks/useMounted";
import { useSystemMode } from "@/hooks/useSystemMode";
import { tripDateRangeLabel } from "@/lib/tripDateRange";
import { E5_COPY } from "@/lib/i18n";
import { readCache, writeCache } from "@/lib/localCache";
import { showToast } from "@/lib/toast";
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
type SortKey = "date" | "name";

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
 * ปุ่มปักหมุด — **ปุ่มจริง อยู่ *นอก* `CoverCard`** (P2 · 4 ก.ย. 2026 · P1 อนุมัติ)
 *
 * ## 🔴 ทำไมไม่ได้อยู่ข้างในการ์ด
 * `CoverCard` เรนเดอร์เป็น `<Link>` เมื่อมี `href` ⇒ ***`<button>` ซ้อนใน `<a>` เป็น HTML ที่ผิด***
 * เบราว์เซอร์จะ *ยกปุ่มออกมานอกลิงก์เอง* ตอน parse ⇒ ตำแหน่งเพี้ยนแบบที่ไม่มีอะไรฟ้อง
 * ✅ จึงห่อ `relative` แล้ววางปุ่มเป็นพี่น้องของการ์ด — **ไม่ต้องเติมช่องใหม่ให้เปลือกที่ใช้ร่วมกันสามที่**
 *
 * ## 🔴 อยู่ **มุมล่างขวาของเนื้อ** ไม่ใช่มุมบนบนรูปปก — เหตุผลเดียวกับป้ายนับถอยหลัง
 * บนรูปปกคอนทราสต์เดาไม่ได้ (สีต่างกันทุกใบ) · **บนพื้นเนื้อการ์ดวัดได้** และไม่ชนป้ายที่มุมขวาบน
 *
 * ## 🔴 ถ้อยคำเป็น *การกระทำของคุณ* ไม่ใช่ *สถานะของทริป*
 * `pinned_at` อยู่บน `trip_members` ของผู้เรียก ⇒ **Alice ปักแล้ว Bob ไม่เห็น**
 * ⇒ `aria-label` เป็นคำสั่งที่จะเกิดเมื่อกด · สถานะปัจจุบันสื่อด้วย `aria-pressed` ซึ่งเป็นช่องของมันเอง
 */
function PinButton({ pinned, busy, onToggle }: { pinned: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={pinned}
      aria-label={pinned ? COPY.pinRemove : COPY.pinAdd}
      title={pinned ? COPY.pinRemove : COPY.pinAdd}
      className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-sm transition disabled:opacity-50 ${
        pinned
          ? "bg-maple-dark text-white shadow-sm shadow-ink/20"
          : "bg-surface text-content-soft ring-1 ring-line hover:text-content"
      }`}
    >
      {/* 🔴 ไอคอนไม่ใช่ข้อความ — ใส่ `aria-hidden` ไม่งั้นโปรแกรมอ่านหน้าจอจะอ่านชื่ออีโมจิต่อท้าย label */}
      <span aria-hidden>📌</span>
    </button>
  );
}

/**
 * แว่นขยาย — **SVG ไม่ใช่อีโมจิ** (ผู้ใช้สั่ง 4 ก.ย. 2026)
 * อีโมจิมีสีของตัวเองและ OS เป็นคนวาด ⇒ หน้าตาต่างกันทุกเครื่อง และไม่เกี่ยวกับชุดสีเรา
 * `stroke="currentColor"` ⇒ เป็นสีของข้อความ ตามพื้นหลังและตามธีมเสมอ
 * 📌 อยู่ที่เดียว เพราะถูกใช้สองที่: บล็อกท้ายช่องค้นหา (จอใหญ่) · ปุ่มเปิดโมดัล (จอโทรศัพท์)
 */
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

function TripCard({
  trip,
  busy,
  onTogglePin,
  viewerName,
}: {
  trip: TripListItem;
  busy: boolean;
  onTogglePin: (trip: TripListItem) => void;
  /** ชื่อผู้ใช้ที่ล็อกอินอยู่ — `null` ตอนยังอ่านไม่เสร็จ · ใช้วาดวงกลมของ *เขาเอง* เท่านั้น */
  viewerName: string | null;
}) {
  const destinationLabel = trip.destinations.map((d) => d.nameTh).join(" · ");
  return (
    <div className="relative">
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
      <p
        className="mt-0.5 truncate text-xs text-content sm:text-sm"
        aria-hidden={destinationLabel ? undefined : true}
      >
        {destinationLabel ? `📍 ${destinationLabel}` : "\u00a0"}
      </p>
      {/**
       * 🔴 **แถวสมาชิกเป็น *รูปโปรไฟล์* แบบเดียวกับบัญชีบนแถบหัว ไม่ใช่อีโมจิ 👥** (ผู้ใช้สั่งเอง 4 ก.ย. 2026)
       * ⇒ ใช้ `InitialAvatar` ตัวเดียวกับที่แถบหัวใช้ · **คอมโพเนนต์เดียวกัน ไม่ใช่หน้าตาคล้ายกัน**
       *   (รูปเดียวกับที่เขาสั่งเรื่องการ์ด: *"รูปแบบ มันควรใช้ component เดียวกับพวกนี้นะ"*)
       *
       * ## 🔴 รูปที่ขึ้นคือ **ของผู้ใช้เอง** — และนั่นเป็นข้อเท็จจริง ไม่ใช่ตัวยืน
       * `GET /api/engine/trips` คืนแต่ `memberCount` (ตัวเลข) **ไม่มีชื่อสมาชิกคนอื่นเลย**
       * ⇒ วาดวงกลมให้ครบจำนวนโดยเดาตัวอักษร = **สร้างคนที่ไม่มีอยู่** · เราจึงวาดเฉพาะคนที่เรารู้จริง
       * · ผู้ใช้เป็นสมาชิกของทุกใบในรายการนี้เสมอ (ไม่งั้นมันจะไม่อยู่ในรายการ) ⇒ รูปนี้ถูกเสมอ
       * · ที่เหลือบอกเป็น `+n` ซึ่งเป็น **จำนวน ไม่ใช่ตัวตน** — พูดเท่าที่รู้
       * 🎯 ***`+2` อ่านว่า "อีกสองคน" · วงกลมสองวงที่เดาตัวอักษรมา อ่านว่า "สองคนนี้" — อย่างหลังเป็นคำโกหก***
       * 📌 ขอ P1 เพิ่มชื่อย่อสมาชิกใน route แล้ว · วันที่มันมา ที่นี่จะวาดคนจริงได้ครบ
       *
       * ⚠️ **`memberCount === 0` = อ่านไม่ได้ ไม่ใช่ไม่มีคน** — คงรูปเดิม (`?` สีเตือน) ไว้
       *    ทริปทุกใบมีเจ้าของอย่างน้อยหนึ่งคนเสมอ ⇒ `0` เป็นค่าที่เป็นไปไม่ได้ แปลว่าอ่าน `trip_members` ไม่สำเร็จ
       */}
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-content-soft">
        {trip.memberCount > 0 ? (
          <>
            <InitialAvatar name={viewerName ?? "?"} className="h-6 w-6 text-2xs" />
            {trip.memberCount > 1 && <span>+{trip.memberCount - 1}</span>}
          </>
        ) : (
          <span className="text-maple-dark" title={COPY.memberCountUnknown}>
            👥 ?
          </span>
        )}
      </div>
    </CoverCard>
      <PinButton
        pinned={Boolean(trip.pinnedAt)}
        busy={busy}
        onToggle={() => onTogglePin(trip)}
      />
    </div>
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
    <section className="mt-10 border-t border-line pt-6">
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
  const [sort, setSort] = useState<SortKey>("date");
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
     * 🔴 **หมุดขึ้นก่อนเสมอ · แต่ *ข้างใน* แต่ละกลุ่มยังเรียงตามที่ผู้ใช้เลือก** (P2 · 4 ก.ย. 2026)
     *
     * ทางที่ปฏิเสธ: เรียงกลุ่มหมุดตาม `pinnedAt` (ปักล่าสุดขึ้นก่อน)
     * ⇒ **ตัวเลือก "เรียงตาม" จะไม่มีผลกับกลุ่มบน** ซึ่งอ่านเหมือนตัวเลือกนั้นพัง
     * 🎯 ***หมุดตอบว่า "ใบไหนสำคัญ" · ตัวเลือกเรียงตอบว่า "เรียงยังไง" — คนละคำถาม ไม่ควรมาทับกัน***
     * · `pinnedAt` จึงถูกใช้เป็น **ตัวแบ่งกลุ่ม** อย่างเดียว ไม่ได้ใช้เป็นลำดับ
     *   (คอลัมน์เป็น timestamp ไม่ใช่ boolean เพราะฝั่งฐานอยากให้ *เลือกได้* ว่าจะใช้ลำดับ — ที่นี่เลือกไม่ใช้)
     */
    const byChoice = (a: TripListItem, b: TripListItem) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "th")
        : a.start_date.localeCompare(b.start_date);
    return list.sort((a, b) => {
      const pa = a.pinnedAt ? 0 : 1;
      const pb = b.pinnedAt ? 0 : 1;
      return pa !== pb ? pa - pb : byChoice(a, b);
    });
  }, [trips, query, tab, sort, todayIso]);

  /**
   * ปัก/ถอนหมุด — **มองเห็นทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์** · ล้ม = เด้งกลับ + บอกให้รู้
   *
   * 🔴 **เด้งกลับด้วยการ *ยิงค่าที่รู้ว่าถูก* ไม่ใช่ `!pinned` ซ้ำ** — ระหว่างรอ ผู้ใช้กดใบอื่นได้
   * และ `setState` แบบ functional เห็นสถานะล่าสุดเสมอ · การกลับด้านซ้ำจะพลาดถ้ามีอะไรมาแก้คั่น
   * ⚠️ `busyId` กันกดรัวใบ *เดิม* ⇒ ไม่มีคำขอสองใบแข่งกันบนทริปเดียว · ใบอื่นยังกดได้ตามปกติ
   *
   * 🔴 **เขียนแคชด้วย** — ไม่งั้นเปิดหน้าใหม่ตอนออฟไลน์จะเห็นหมุดชุดเก่า **ซึ่งอ่านเหมือนกดไม่ติด**
   * (แคชคือสิ่งที่ผู้ใช้เห็นก่อนของสดมาเสมอ ตามที่เขียนไว้ในเอฟเฟกต์โหลด)
   */
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const applyPin = useCallback((tripId: string, value: string | null) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const trips = prev.trips.map((t) => (t.id === tripId ? { ...t, pinnedAt: value } : t));
      writeCache(TRIP_LIST_CACHE_KEY, {
        ownerId: readCache<CachedTripList>(TRIP_LIST_CACHE_KEY)?.ownerId ?? null,
        trips,
      } satisfies CachedTripList);
      return { status: "ready", trips };
    });
  }, []);

  const togglePin = useCallback(
    async (trip: TripListItem) => {
      const previous = trip.pinnedAt ?? null;
      const next = previous === null;
      setPinBusyId(trip.id);
      // ค่าที่วางชั่วคราว: เวลาเครื่อง — **ใช้เป็นแค่ "ไม่ null"** เพราะลำดับไม่ได้มาจากค่านี้ (ดูตัวเรียงข้างบน)
      applyPin(trip.id, next ? new Date().toISOString() : null);
      try {
        const r = await fetch(`/api/engine/trips/${trip.id}/pin`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: next }),
        });
        if (!r.ok) throw new Error(String(r.status));
      } catch {
        applyPin(trip.id, previous);
        showToast("error", COPY.pinFailed);
      } finally {
        setPinBusyId(null);
      }
    },
    [applyPin],
  );

  return (
    <main className="min-h-full bg-surface pb-24 text-content">
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
           * ## 🔴 ใช้ `<label>` ไม่ใช่ `<button>` — และความต่างนี้ไม่ใช่เรื่องเทคนิค
           * การกรองเป็นแบบ **สดตามที่พิมพ์** ⇒ ไม่มี "การค้นหา" ให้กดสั่ง
           * ⇒ ทำเป็น `<button>` จะได้ปุ่มที่ **กดแล้วไม่มีอะไรเกิดขึ้น** ซึ่งเป็นข้อที่เพิ่งแก้ไปที่การ์ดทริปแนะนำ
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
              /* avatar เป็น *ทางไปบัญชี* ไม่ใช่ป้ายชื่อ — จึงอยู่คู่กับ ⚙️ และเล็กลง */
              <Link href="/account" aria-label={COPY.account} className="rounded-full">
                <InitialAvatar name={user.displayName ?? "?"} className="h-9 w-9 text-sm" />
              </Link>
            ) : (
              <span className="h-9 w-9" aria-hidden />
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
          <div className="py-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-content sm:text-3xl">
              {E5_COPY.explorer.heading}
            </h1>
            <p className="mb-4 mt-1 text-sm text-content-soft">{E5_COPY.explorer.subheading}</p>
            <DestinationExplorer
              onPickCity={(city) => {
                setSeedCities([city]);
                setCreateOpen(true);
              }}
            />
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
                    role="tab"
                    aria-selected={tab === key}
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
              <label className="ml-auto flex items-center gap-1.5 text-xs text-content-soft">
                {COPY.sortLabel}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-lg border border-line bg-surface-raised px-2 py-1 text-xs text-content"
                >
                  <option value="date">{COPY.sortByDate}</option>
                  <option value="name">{COPY.sortByName}</option>
                </select>
              </label>
            </div>

            {visibleTrips.length === 0 ? (
              /* 🔴 ว่างเพราะ *ตัวกรอง* — ห้ามใช้ข้อความเดียวกับ "ยังไม่มีทริป" ซึ่งแปลคนละอย่างสิ้นเชิง
                 (รูปเดียวกับที่ไฟล์นี้แยก "อ่านไม่ได้" ออกจาก "ไม่มีข้อมูล" ไว้แล้วข้างบน) */
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-content-soft">{COPY.noMatch}</p>
                <button
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
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
                {visibleTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    busy={pinBusyId === trip.id}
                    onTogglePin={(t) => void togglePin(t)}
                    viewerName={user.status === "ready" ? user.displayName ?? null : null}
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
            <RecommendedTrips />

            <section className="mt-10 border-t border-line pt-6">
              <h2 className="text-lg font-bold text-content">{E5_COPY.explorer.heading}</h2>
              <p className="mb-3 mt-0.5 text-sm text-content-soft">{E5_COPY.explorer.subheading}</p>
              <DestinationExplorer
                onPickCity={(city) => {
                  setSeedCities([city]);
                  setCreateOpen(true);
                }}
              />
            </section>
          </>
        )}
      </div>

      {/* FAB มุมขวาล่าง — ผู้ใช้ขอมาตรงๆ ว่ากดด้วยมือเดียวได้ (ไม่ต้องเลื่อนไปหาลิงก์ในหัวข้อ) แสดงเฉพาะ
          ตอนมีทริปอยู่แล้ว (สถานะว่างมีฟอร์มเต็มบนหน้าอยู่แล้ว ไม่ต้องมีปุ่มลอยซ้อนอีกจุด) */}
      {trips !== null && trips.length > 0 && (
        <button
          onClick={() => setCreateOpen(true)}
          disabled={readOnly}
          aria-label={COPY.newTrip}
          title={readOnly ? COPY.readOnlyFab : undefined}
          className="fixed bottom-6 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-maple px-5 font-semibold text-white shadow-lg shadow-ink/20 hover:bg-maple-dark disabled:cursor-not-allowed disabled:opacity-40 sm:right-8"
        >
          {COPY.newTrip}
        </button>
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
    </main>
  );
}
