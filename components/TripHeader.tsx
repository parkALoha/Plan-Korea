"use client";

import Link from "next/link";
import { useState } from "react";
import { TripSettingsModal } from "./TripSettingsModal";
import { InitialAvatar } from "./InitialAvatar";
import { useMounted } from "@/hooks/useMounted";
import { useTripMembers } from "@/hooks/useTripMembers";
import { useTripMeta } from "@/hooks/useTripMeta";
import { tripDateRangeLabel } from "@/lib/tripDateRange";

interface TripHeaderProps {
  /** ทริปที่กำลังดูอยู่ — ใช้ดึงชื่อทริปจริง (E5) แทนชื่อ/วันที่ที่เคยฮาร์ดโค้ดไว้ */
  tripId: string;
  who: string;
  /** ชื่อจากบัญชีที่ล็อกอิน — ใช้เป็น *ค่าตั้งต้น* และเป็น placeholder ตอนแก้ (`profiles.display_name`) */
  accountName: string;
  onWhoChange: (value: string) => void;
  stopsCount: number;
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
  accountName,
  onWhoChange,
  stopsCount,
  lockedDayCount,
  totalDayCount,
  onToggleLockAll,
}: TripHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mounted = useMounted();

  /* ชื่อ+วันที่ทริปจริง — ผ่าน `useTripMeta` ซึ่งอ่านแคชก่อนแล้วค่อยยิงของสด
     🔴 ของเดิมยิง `fetch("/api/engine/trips")` ตรง ๆ ในเอฟเฟกต์ **ไม่ผ่านชั้นแคชเลย**
     → ออฟไลน์หัวจอขึ้น "🍁 ทริปนี้" ทั้งที่ชื่อทริปถูกแคชไว้แล้วในเครื่อง (P7 เห็นกับตา 2 ก.ย. 2026)
     🎯 **"ทริปนี้" ไม่ใช่ความว่าง มันคือตัวแทนที่ดูเหมือนของจริง** — ผู้ใช้แยกไม่ออกว่าเปิดทริปไหนอยู่
        ต่างจากอวาตาร์ที่หายไปเฉย ๆ ซึ่งซื่อสัตย์ว่าไม่รู้ (`§15.15`)
     📌 ความหมายของค่าคงเดิมทุกตัว: `undefined` = ยังไม่รู้ (โชว์ "…") · `null` = ไม่เจอทริปนี้ในรายการ */
  const tripMeta = useTripMeta(tripId);
  const tripTitle = tripMeta ? tripMeta.title : undefined;
  const tripDateRange =
    tripMeta?.startDate && tripMeta.endDate
      ? tripDateRangeLabel(tripMeta.startDate, tripMeta.endDate)
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
        {/*
          🔴 **จัดใหม่ 4 ก.ย. 2026 — ผู้ใช้ถามว่า "ปุ่มบ้านคือปุ่มอะไร ทำไมไปลอยตรงนั้น"**

          ของเดิมวางแบบนี้:
          ```
          แถว 1  [วันที่]                                    ← ชิดขวา ห่างจากชื่อทริปที่มันอธิบาย
          แถว 2                          [📍 วันนี้] [📋 สรุปแผน]
          แถว 3  ชื่อทริป …          🏠            ⚙️        ← justify-between กับลูก 3 ตัว
          ```
          🎯 **`justify-between` แจกที่ว่างให้ *ช่องว่างระหว่างลูก* เท่ากัน** — บล็อกชื่อไม่มี `flex-1`
          จึงกว้างเท่าเนื้อหา → ที่ว่างที่เหลือถูกแบ่งครึ่ง **แล้ว 🏠 ไปจอดกลางจอ**
          · ไม่ใช่ปุ่มลอย มันคือปุ่มที่ *ถูกวางไว้ถูกต้องตามกฎที่เขียนไว้* และกฎนั้นผิด

          🔴 **และปัญหาที่ใหญ่กว่าตำแหน่ง: การกระทำ 4 อย่างถูกแยกเป็น 2 แถว 2 ภาษาภาพ**
          ป้ายมีข้อความสองอัน · ไอคอนกลม ๆ ไม่มีข้อความสองอัน · ไม่มีอะไรบอกว่าทำไมถึงแยกกัน
          → รวมเป็นกลุ่มเดียว ความสูงเดียว และ **ติดข้อความให้ไอคอนตอนจอกว้างพอ**
          (มือถือเหลือไอคอนล้วนเพราะที่ไม่พอ — แต่ `aria-label` มีครบทั้งสองขนาด)

          📌 วันที่ย้ายลงไปอยู่บรรทัดเดียวกับ "แผน A · N จุด" — **มันอธิบายทริป ไม่ใช่อธิบายหัวเว็บ**
          ควรอยู่ติดชื่อทริป ไม่ใช่ลอยอยู่มุมขวาบนคนละบรรทัด
        */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* 🔴 **ซ้ำกับ `BottomNav` ทุกตัวอักษรเมื่อจอเล็กกว่า `lg`** — สองลิงก์นี้ (`/today`, `/summary`)
              อยู่ในแถบล่างอยู่แล้ว · `BottomNav` เป็น `lg:hidden` และเขียนเหตุผลไว้เองว่า
              *"จอใหญ่ซ่อนไว้ เพราะมีลิงก์อยู่บนหัวเว็บอยู่แล้ว"* — **นี่คือด้านกลับของประโยคนั้น**
              ⇒ ต่ำกว่า `lg` หัวเว็บเหลือเฉพาะของที่แถบล่าง *ไม่มี* (🏠 ทริปทั้งหมด · ⚙️ ตั้งค่า)
              📌 ไม่ได้ลบทิ้ง — ที่ `lg` ขึ้นไปแถบล่างหายไป ลิงก์คู่นี้จึงต้องอยู่ */}
          <Link
            href={`/trip/${tripId}/today`}
            className="hidden h-9 items-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-cream hover:bg-white/20 lg:flex"
          >
            📍 วันนี้
          </Link>
          <Link
            href={`/trip/${tripId}/summary`}
            className="hidden h-9 items-center rounded-lg bg-white/10 px-2.5 text-xs font-medium text-cream hover:bg-white/20 lg:flex"
          >
            📋 สรุปแผน
          </Link>
          {/* ปุ่มกลับ Home — เพิ่มตอน "/" เปลี่ยนความหมายเป็นหน้าลิสต์ทริป (27 ส.ค. 2026, E5 ข้อ 6)
              ก่อนหน้านี้ไม่มีทางออกจากทริปหนึ่งไปดูทริปอื่นเลยนอกจากพิมพ์ URL เอง */}
          <Link
            href="/"
            aria-label="กลับไปหน้ารายการทริป"
            title="ทริปทั้งหมด"
            className="flex h-9 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-cream hover:bg-white/20"
          >
            🏠<span className="hidden sm:inline">ทริปทั้งหมด</span>
          </Link>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="ตั้งค่าทริป"
            title="ตั้งค่าทริป"
            className="relative flex h-9 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-cream hover:bg-white/20"
          >
            ⚙️<span className="hidden sm:inline">ตั้งค่า</span>
            {/* ยังไม่ได้ใส่ชื่อ = จุดแวะที่เพิ่มจะไม่มี "เลือกโดย …" ให้อีกคนดู — สะกิดไว้ตรงนี้
                เพราะช่องกรอกหลบเข้าไปอยู่ในโมดัลแล้ว ไม่ได้เห็นเองเหมือนตอนอยู่บนหัวเว็บ
                ต้องรอ mounted ด้วย: `who` อ่านจาก localStorage ตอนตั้งค่า state ตั้งต้น (components/TripPlanScreen.tsx)
                ซึ่งฝั่งเซิร์ฟเวอร์ได้ค่าว่างเสมอ — เครื่องที่เคยใส่ชื่อไว้จึงได้ HTML ที่มีจุดแดงมาจาก
                build แต่ client ไม่วาด = hydration mismatch (ดู hooks/useMounted.ts) */}
            {mounted && !who && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-maple ring-2 ring-pine"
              />
            )}
          </button>
        </div>

        <div className="mt-2 min-w-0">
          <h1 className="truncate text-2xl font-extrabold sm:text-3xl">
            🍁 {tripTitle === undefined ? "…" : (tripTitle ?? "ทริปนี้")}
          </h1>
          {/* ข้อความสอนใช้งาน อ่านรอบเดียวก็พอ — บนมือถือมันแย่งที่กับเนื้อหาจริงทุกครั้งที่เปิด */}
          <p className="mt-1 hidden text-sm text-pine-soft/80 sm:block">
            เลือกสถานที่ในแต่ละวัน — เลือกแล้วอีกคนเห็นทันที
          </p>
          {/* วันที่ · แผน · จำนวนจุด — สามอย่างที่อธิบาย *ทริปนี้* อยู่บรรทัดเดียวกัน
              `tripDateRange` เป็น null ระหว่างโหลด/หาไม่เจอ → หายไปเฉย ๆ ไม่ใช่โชว์ค่าผิด (P1 27 ส.ค. 2026) */}
          <p className="mt-1 truncate text-xs text-cream/80">
            {tripDateRange ? `${tripDateRange} · ` : ""}
            🗺️ {stopsCount} จุดในทริปนี้
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
      </div>

      {settingsOpen && (
        <TripSettingsModal
          who={who}
          accountName={accountName}
          onWhoChange={onWhoChange}
          lockedDayCount={lockedDayCount}
          totalDayCount={totalDayCount}
          onToggleLockAll={onToggleLockAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}
