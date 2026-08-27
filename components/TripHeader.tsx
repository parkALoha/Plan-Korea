"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TripPlan } from "@/lib/supabase";
import { TripSettingsModal } from "./TripSettingsModal";
import { InitialAvatar } from "./InitialAvatar";
import { useMounted } from "@/hooks/useMounted";
import { useTripMembers } from "@/hooks/useTripMembers";
import { tripDateRangeLabel } from "@/lib/tripDateRange";

interface TripHeaderProps {
  /** ทริปที่กำลังดูอยู่ — ใช้ดึงชื่อทริปจริง (E5) แทนชื่อ/วันที่ที่เคยฮาร์ดโค้ดไว้ */
  tripId: string;
  who: string;
  onWhoChange: (value: string) => void;
  stopsCount: number;
  plans: TripPlan[];
  activePlanId: string | null;
  onSwitchPlan: (planId: string) => void;
  onNewPlan: () => void;
  onRenamePlan: () => void;
  onDeletePlan: () => void;
  /** จำนวนวันที่ล็อกไว้แล้ว / ทั้งหมด — ใช้บอกสถานะบนปุ่มล็อกรวม */
  lockedDayCount: number;
  totalDayCount: number;
  onToggleLockAll: () => void;
}

/**
 * หัวเว็บของหน้าแผน — บีบให้เตี้ยลงในเฟส 20.3
 *
 * เดิมยัด ช่องชื่อคุณ + ตัวเลือกแผน + ปุ่มสร้าง/เปลี่ยนชื่อ/ลบแผน + ปุ่มล็อกทุกวัน ไว้บนหัวหมด
 * รวมกับ padding pt-10/pb-8 แล้วกินพื้นที่เกือบเต็มจอมือถือก่อนเห็นเนื้อหาสักบรรทัด
 * ทั้งหมดนั้นเป็นของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก จึงย้ายไปอยู่หลังปุ่ม ⚙️ (TripSettingsModal)
 */
export function TripHeader({
  tripId,
  who,
  onWhoChange,
  stopsCount,
  plans,
  activePlanId,
  onSwitchPlan,
  onNewPlan,
  onRenamePlan,
  onDeletePlan,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
}: TripHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mounted = useMounted();
  const activePlan = plans.find((p) => p.id === activePlanId);

  // 🔴 ชื่อ+วันที่ทริปจริง (P1: /trip/[tripId] ลงแล้ว มีทริปที่สองแล้ว — เปิดทริปที่สองวันนี้หัวจอจะบอกชื่อ
  // ทริปแรก) — เดิม "🍁 แพลนเที่ยวเกาหลี" ฮาร์ดโค้ด ตามที่เขียนไว้เองใน ux-flows.md §2.1 ว่าต้องดึงเป็น
  // prop ก่อนถึงจะขยายได้ · ใช้ /api/engine/trips (รายการ) เดียวกับที่ useActiveTripId() เรียกอยู่แล้ว
  // เพราะยังไม่มี route ดึงทริปเดียวโดยตรง — เก็บคู่กับ tripId ที่ผลนั้นเป็นของ แล้ว derive ตอน render
  // (แพทเทิร์นเดียวกับ usePlacePhotos.ts) แทน setState ตรงๆ ในเอฟเฟกต์ กัน set-state-in-effect
  // 📌 start_date/end_date ถูกเพิ่มเข้า select ของ tripsForUser() แล้ว (27 ส.ค. 2026 f89ecd8) —
  // ดึงมาพร้อมชื่อในคำขอเดียวกันเลย ไม่ต้องยิงซ้ำ
  const [tripResult, setTripResult] = useState<{
    forTripId: string;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/trips")
      .then((r) => r.json())
      .then((rows: { id: string; title: string; start_date: string; end_date: string }[]) => {
        if (cancelled) return;
        const match = rows.find((r) => r.id === tripId);
        setTripResult({
          forTripId: tripId,
          title: match?.title ?? null,
          startDate: match?.start_date ?? null,
          endDate: match?.end_date ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setTripResult({ forTripId: tripId, title: null, startDate: null, endDate: null });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);
  const tripTitle = tripResult?.forTripId === tripId ? tripResult.title : undefined;
  const tripDateRange =
    tripResult?.forTripId === tripId && tripResult.startDate && tripResult.endDate
      ? tripDateRangeLabel(tripResult.startDate, tripResult.endDate)
      : null;

  // แถวสมาชิก (E5 ข้อ 6) — GET /api/engine/trips/[tripId]/members (P1 27 ส.ค. 2026, b81b42e)
  // 🔴 displayName: null ไม่ใช่ "ยังไม่ตั้งชื่อ" — แปลว่าอ่านชื่อไม่ได้ (สิทธิ์สองชั้นไม่ตรงกัน) ห้ามโชว์
  // เป็นวงกลมว่างเงียบๆ ใช้ "?" + title บอกสถานะตรงๆ แทน (ดู P1: "ถ้าเจอ null ในของจริง รายงานทันที" —
  // ยังไม่เจอในทริปทดสอบที่มีสมาชิกคนเดียว จะดูอีกทีตอนมีทริปที่มีสมาชิกหลายคนข้ามบัญชี)
  const { members } = useTripMembers(tripId);

  return (
    // focus-ring-on-dark: กรอบโฟกัสสีเมเปิลจมไปกับพื้นสีสน สลับเป็นสีทองเฉพาะในหัวนี้ (เฟส 20.1)
    <header className="focus-ring-on-dark bg-pine px-4 pb-4 pt-6 text-cream sm:pb-6">
      <div className="mx-auto max-w-2xl lg:max-w-7xl">
        {/* เดิมมีบรรทัดวันที่ตายตัว "11 – 21 ต.ค. 2026 · เที่ยวเกาหลี 12–20" ตรงนี้ — ลบไปตอนที่ยังดึง
            วันที่จริงไม่ได้ (P1 27 ส.ค. 2026) ตอนนี้ start_date/end_date มาจาก tripsForUser() แล้ว
            (f89ecd8) จึงใส่กลับมาด้วยข้อมูลจริงแทนวันที่ฝังตาย — ไม่โชว์อะไรถ้ายังไม่รู้ (tripDateRange
            เป็น null ระหว่างโหลด/หาไม่เจอ) โชว์ว่างดีกว่าโชว์ค่าผิดเหมือนเดิม */}
        {tripDateRange && (
          <p className="text-right text-xs text-cream/70">{tripDateRange}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          <div className="flex shrink-0 gap-1.5">
            <Link
              href={`/trip/${tripId}/today`}
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-cream hover:bg-white/20"
            >
              📍 วันนี้
            </Link>
            <Link
              href={`/trip/${tripId}/summary`}
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-cream hover:bg-white/20"
            >
              📋 สรุปแผน
            </Link>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold sm:text-3xl">
              🍁 {tripTitle === undefined ? "…" : (tripTitle ?? "ทริปนี้")}
            </h1>
            {/* ข้อความสอนใช้งาน อ่านรอบเดียวก็พอ — บนมือถือมันแย่งที่กับเนื้อหาจริงทุกครั้งที่เปิด */}
            <p className="mt-1 hidden text-sm text-pine-soft/80 sm:block">
              เลือกสถานที่ในแต่ละวัน — เลือกแล้วอีกคนเห็นทันที
            </p>
            <p className="mt-1 truncate text-xs text-cream/80">
              {activePlan ? `${activePlan.name} · ` : ""}🗺️ {stopsCount} จุดในแผนนี้
            </p>
            {members.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1">
                {members.map((m) => (
                  <InitialAvatar
                    key={m.userId}
                    name={m.displayName ?? "?"}
                    label={m.displayName ?? "อ่านชื่อสมาชิกคนนี้ไม่ได้"}
                    className={`h-6 w-6 text-[11px] ring-2 ring-pine ${
                      m.displayName ? "" : "bg-maple text-cream"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ปุ่มกลับ Home — เพิ่มตอน "/" เปลี่ยนความหมายเป็นหน้าลิสต์ทริป (27 ส.ค. 2026, E5 ข้อ 6)
              ก่อนหน้านี้ไม่มีทางออกจากทริปหนึ่งไปดูทริปอื่นเลยนอกจากพิมพ์ URL เอง */}
          <Link
            href="/"
            aria-label="กลับไปหน้ารายการทริป"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            🏠
          </Link>

          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="ตั้งค่าทริป"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            ⚙️
            {/* ยังไม่ได้ใส่ชื่อ = จุดแวะที่เพิ่มจะไม่มี "เลือกโดย …" ให้อีกคนดู — สะกิดไว้ตรงนี้
                เพราะช่องกรอกหลบเข้าไปอยู่ในโมดัลแล้ว ไม่ได้เห็นเองเหมือนตอนอยู่บนหัวเว็บ
                ต้องรอ mounted ด้วย: `who` อ่านจาก localStorage ตอนตั้งค่า state ตั้งต้น (components/TripPlanScreen.tsx)
                ซึ่งฝั่งเซิร์ฟเวอร์ได้ค่าว่างเสมอ — เครื่องที่เคยใส่ชื่อไว้จึงได้ HTML ที่มีจุดแดงมาจาก
                build แต่ client ไม่วาด = hydration mismatch (ดู hooks/useMounted.ts) */}
            {mounted && !who && (
              <span
                aria-hidden
                className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-maple ring-2 ring-pine"
              />
            )}
          </button>
        </div>
      </div>

      {settingsOpen && (
        <TripSettingsModal
          tripId={tripId}
          who={who}
          onWhoChange={onWhoChange}
          plans={plans}
          activePlanId={activePlanId}
          onSwitchPlan={onSwitchPlan}
          onNewPlan={() => {
            setSettingsOpen(false);
            onNewPlan();
          }}
          onRenamePlan={() => {
            setSettingsOpen(false);
            onRenamePlan();
          }}
          onDeletePlan={() => {
            setSettingsOpen(false);
            onDeletePlan();
          }}
          lockedDayCount={lockedDayCount}
          totalDayCount={totalDayCount}
          onToggleLockAll={onToggleLockAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}
