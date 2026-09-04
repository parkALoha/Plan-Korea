"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CreateTripForm } from "@/components/CreateTripForm";
import { InitialAvatar } from "@/components/InitialAvatar";
import { Modal } from "@/components/Modal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
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
      <div className="flex h-full w-24 items-center justify-center bg-gradient-to-br from-pine to-maple text-2xl text-cream sm:h-28 sm:w-full sm:text-4xl">
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
      className="h-full w-24 object-cover sm:h-28 sm:w-full"
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

  return (
    <span
      className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-2xs font-semibold shadow-sm shadow-ink/20 ${tone}`}
    >
      {label}
    </span>
  );
}

function TripCard({ trip }: { trip: TripListItem }) {
  const destinationLabel = trip.destinations.map((d) => d.nameTh).join(" · ");
  return (
    <Link
      href={`/trip/${trip.id}`}
      className="group relative flex overflow-hidden rounded-2xl border border-line bg-surface-raised transition hover:border-maple/40 hover:shadow-md hover:shadow-ink/5 sm:flex-col"
    >
      {/* 🔴 รูปปกขึ้นบนเต็มความกว้าง — ของเดิมเป็นแถบข้าง `w-20` ที่เล็กเกินกว่าจะอ่านออกว่าเป็นเมืองอะไร
          ⇒ มันกินพื้นที่โดยไม่ได้ทำงาน · ใน grid การ์ดมีความกว้างของตัวเอง รูปจึงได้ทำหน้าที่จริง */}
      {/**
       * 🔴 **มือถือ = แถบข้าง · `sm` ขึ้นไป = แบนเนอร์บน — ไม่ใช่รูปเดียวสองที่**
       * แบนเนอร์บนมือถือทำให้การ์ดสูงขึ้นเกือบเท่าตัว ⇒ เห็นจาก **~5 ใบเหลือ ~2.5 ใบ** ต่อจอ
       * 🎯 ***มือถือเป็นฝั่งที่ผู้ใช้พอใจอยู่แล้ว — การรื้อ desktop ต้องไม่จ่ายด้วยความแน่นของมือถือ***
       * (ผมทำแบนเนอร์ทั้งสองที่ก่อน แล้วเห็นตอนยิงจอ 375px จริง ไม่ใช่ตอนอ่านโค้ด)
       */}
      <div className="shrink-0 sm:shrink">
        <TripCoverImage destinations={trip.destinations} />
      </div>
      {/* 🔴 ป้ายเกาะ **การ์ด** ไม่ใช่เกาะรูป — บนมือถือรูปเป็นแถบกว้าง 96px ป้ายจะไปทับงานศิลป์
          และอ่านเหมือนสติกเกอร์แปะผิดที่ · เกาะการ์ด = ตำแหน่งเดียวใช้ได้ทั้งสองความกว้าง */}
      <TripCountdownBadge startDate={trip.start_date} endDate={trip.end_date} />
      <div className="min-w-0 flex-1 p-3">
        {/* กันชื่อยาววิ่งไปใต้ป้าย — บน `sm` ป้ายอยู่เหนือแบนเนอร์ ไม่ทับบรรทัดนี้ จึงไม่ต้องเผื่อ */}
        {/* 🔴 ผู้ใช้ขอเอง: *"ชื่อทริปใหญ่และเด่นขึ้น · วันที่/สถานที่สว่างขึ้นให้อ่านง่าย"*
            `text-content-soft` (#6b6058) → `text-content` สำหรับวันที่/สถานที่ **ซึ่งเป็นข้อมูลที่คนใช้เลือกทริป**
            เหลือ `soft` ไว้เฉพาะจำนวนสมาชิก ซึ่งเป็นข้อมูลรอง — ***ถ้าทุกบรรทัดเด่นเท่ากัน ก็ไม่มีบรรทัดไหนเด่น*** */}
        <h3 className="truncate pr-20 text-base font-bold leading-snug text-content sm:pr-0 sm:text-lg">
          {trip.title}
        </h3>
        <p className="mt-1 text-xs font-medium text-content sm:text-sm">
          {tripDateRangeLabel(trip.start_date, trip.end_date)}
        </p>
        {destinationLabel && (
          <p className="mt-0.5 truncate text-xs text-content sm:text-sm">📍 {destinationLabel}</p>
        )}
        <p className="mt-1.5 text-xs text-content-soft">
          {trip.memberCount > 0 ? (
            <>👥 {trip.memberCount}</>
          ) : (
            <span className="text-maple-dark" title={COPY.memberCountUnknown}>
              👥 ?
            </span>
          )}
        </p>
      </div>
    </Link>
  );
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
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [sort, setSort] = useState<SortKey>("date");
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
    return list.sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "th")
        : a.start_date.localeCompare(b.start_date)
    );
  }, [trips, query, tab, sort, todayIso]);

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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream/15 text-lg"
            >
              🧭
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-extrabold leading-tight">{COPY.brand}</span>
              {/* คำโปรยซ่อนบนมือถือ — ที่แคบ ชื่อสำคัญกว่า */}
              <span className="hidden text-2xs leading-tight text-cream/70 sm:block">
                {COPY.brandTagline}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
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
            <Link
              href="/account"
              aria-label={COPY.account}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cream/10 text-lg hover:bg-cream/20"
            >
              ⚙️
            </Link>
          </div>
        </div>

        {/**
         * 🔴 **ช่องค้นหาอยู่ในแถบหัวตามที่ผู้ใช้ขอ — แต่เป็น *แถวที่สอง* ไม่ใช่แทรกในแถวแรก**
         * แถวแรกมีชื่อเว็บ + ปุ่มบัญชี · ยัดช่องค้นหาเข้าไปด้วยบนจอ 375px จะเหลือที่ให้ทั้งสามอย่าง
         * ไม่พอ แล้วชื่อเว็บจะถูกบีบจนหาย ซึ่งเป็นสิ่งที่ใบก่อนหน้าเพิ่งเอากลับมา
         * · ขึ้นเฉพาะตอน**มีทริปให้ค้น** — ช่องค้นหาบนหน้าที่ไม่มีอะไรให้ค้น คือปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น
         */}
        {trips !== null && trips.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                🔍
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={COPY.searchPlaceholder}
                aria-label={COPY.searchPlaceholder}
                className="w-full rounded-xl bg-cream/15 py-2 pl-9 pr-3 text-sm text-cream placeholder:text-cream/60"
              />
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-5">
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
          // สถานะว่าง — พฤติกรรมเดิมของ TripStatusFallback ห้ามหาย (E5 ข้อ 3) แค่ย้ายมาอยู่ที่ Home
          // โดยตรงแทนที่จะรอ useActiveTripId() ตัดสินว่า "none" เพราะ Home ไม่ได้ resolve ทริปเดียวอีกแล้ว
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-content-soft">{COPY.noTripsYet}</p>
            {/* หน้าเปล่ากินเต็มความกว้างคอลัมน์ ฟอร์มจึงต้องถูกจำกัดตรงนี้ — ในโมดัลไม่ต้อง */}
            <div className="w-full max-w-xs">
              <CreateTripForm />
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
                {COPY.upcomingTrips}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
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
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} title={COPY.newTrip} size="md">
          <CreateTripForm />
        </Modal>
      )}
    </main>
  );
}
