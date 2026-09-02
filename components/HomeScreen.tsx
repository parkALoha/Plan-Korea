"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateTripForm } from "@/components/CreateTripForm";
import { InitialAvatar } from "@/components/InitialAvatar";
import { Modal } from "@/components/Modal";
import { useCurrentUser } from "@/hooks/useCurrentUser";
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
      <div className="flex w-20 shrink-0 items-center justify-center bg-gradient-to-br from-pine to-maple text-2xl text-cream sm:w-28">
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
      className="h-auto w-20 shrink-0 object-cover sm:w-28"
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
function TripCard({ trip }: { trip: TripListItem }) {
  const destinationLabel = trip.destinations.map((d) => d.nameTh).join(" · ");
  return (
    <Link
      href={`/trip/${trip.id}`}
      className="flex overflow-hidden rounded-2xl border border-line bg-surface-raised hover:border-maple/40"
    >
      <TripCoverImage destinations={trip.destinations} />
      <div className="min-w-0 flex-1 p-3">
        <h3 className="truncate font-semibold text-content">{trip.title}</h3>
        <p className="mt-0.5 text-xs text-content-soft">
          {tripDateRangeLabel(trip.start_date, trip.end_date)}
        </p>
        {destinationLabel && (
          <p className="mt-0.5 truncate text-xs text-content-soft">📍 {destinationLabel}</p>
        )}
        <p className="mt-1 text-xs text-content-soft">
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

  return (
    <main className="min-h-full bg-surface pb-24 text-content">
      <header className="focus-ring-on-dark bg-pine px-4 pb-5 pt-6 text-cream">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {/* mockup ของผู้ใช้มีทั้งแถบทักทายและกล่องเข้าสู่ระบบพร้อมกัน — เกิดพร้อมกันไม่ได้ (P1 ชี้
              27 ส.ค. 2026) โชว์อย่างใดอย่างหนึ่งตามสถานะจริงแทน */}
          {user.status === "ready" ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <InitialAvatar name={user.displayName ?? "?"} className="h-9 w-9 text-sm" />
              <span className="truncate font-semibold">
                {COPY.greeting(user.displayName ?? "")}
              </span>
            </div>
          ) : user.status === "anon" ? (
            <Link
              href="/login"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
            >
              {COPY.login}
            </Link>
          ) : (
            <span className="h-9" aria-hidden />
          )}

          <Link
            href="/account"
            aria-label={COPY.account}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            ⚙️
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-5">
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
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-soft">
              {COPY.upcomingTrips}
            </h2>
            <div className="space-y-3">
              {state.trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
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
