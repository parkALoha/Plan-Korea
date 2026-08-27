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

type TripListItem = { id: string; title: string; start_date: string; end_date: string };

// 🔴 เดิมมีก้อน COPY ท้องถิ่นแยกไว้ในไฟล์นี้เอง (เหตุผลตอนนั้น: lib/i18n.ts เขียนขอบเขตตัวเองไว้ว่า
// "ของหน้า /summary เท่านั้น") — ย้ายเข้า E5_COPY.home ใน lib/i18n.ts แล้ว (P1 27 ส.ค. 2026 ตัดสิน:
// ผ่าน lib/i18n.ts จริงตามที่ E5-AC7 สั่ง แต่เป็น namespace ที่สอง ไม่ปนกับ DICT ของ /summary — ดูหัวไฟล์
// นั้น) ยังไม่มี EN เหมือนเดิม เพิ่มตอน M2
const COPY = E5_COPY.home;

/** การ์ดทริปหนึ่งใบบน Home — รูปปก/จุดหมาย/จำนวนสมาชิกรอ API จาก P1 (`E5` ข้อ 2/3) ยังใช้ fallback ไปก่อน */
function TripCard({ trip }: { trip: TripListItem }) {
  return (
    <Link
      href={`/trip/${trip.id}`}
      className="flex overflow-hidden rounded-2xl border border-line bg-surface-raised hover:border-maple/40"
    >
      {/* fallback ของรูปปก — ยังไม่มี cover_image_url ในฐาน (รอ migration ของ P1) ไล่สีตามโทนแบรนด์
          แทนที่จะปล่อยว่างเปล่า อย่างน้อยรู้ว่าเป็น "การ์ดทริป" ตั้งแต่มองครั้งแรก */}
      <div className="flex w-20 shrink-0 items-center justify-center bg-gradient-to-br from-pine to-maple text-2xl text-cream sm:w-28">
        🗺️
      </div>
      <div className="min-w-0 flex-1 p-3">
        <h3 className="truncate font-semibold text-content">{trip.title}</h3>
        <p className="mt-0.5 text-xs text-content-soft">
          {tripDateRangeLabel(trip.start_date, trip.end_date)}
        </p>
      </div>
    </Link>
  );
}

export function HomeScreen() {
  const user = useCurrentUser();
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;

  const [trips, setTrips] = useState<TripListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/trips")
      .then((r) => r.json())
      .then((rows: TripListItem[]) => {
        if (cancelled) return;
        setTrips([...rows].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      })
      .catch(() => {
        if (!cancelled) setTrips([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        {trips === null ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-2xl bg-surface-soft" />
            <div className="h-24 animate-pulse rounded-2xl bg-surface-soft" />
          </div>
        ) : trips.length === 0 ? (
          // สถานะว่าง — พฤติกรรมเดิมของ TripStatusFallback ห้ามหาย (E5 ข้อ 3) แค่ย้ายมาอยู่ที่ Home
          // โดยตรงแทนที่จะรอ useActiveTripId() ตัดสินว่า "none" เพราะ Home ไม่ได้ resolve ทริปเดียวอีกแล้ว
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-content-soft">{COPY.noTripsYet}</p>
            <CreateTripForm />
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-soft">
              {COPY.upcomingTrips}
            </h2>
            <div className="space-y-3">
              {trips.map((trip) => (
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

      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)} title={COPY.newTrip} size="md">
          <CreateTripForm />
        </Modal>
      )}
    </main>
  );
}
