"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** แถบเมนูล่างของมือถือ — 3 หน้าหลักของทริปหนึ่งใบ กดถึงกันได้ตลอดโดยไม่ต้องเลื่อนขึ้นไปหาลิงก์บนหัวเว็บ
 *  จอใหญ่ซ่อนไว้ (lg:hidden) เพราะมีลิงก์อยู่บนหัวเว็บอยู่แล้วและไม่ต้องยืดนิ้วไปล่างจอ
 *
 * 🔴 เดิม tab แรกชี้ไป "/" ตรงๆ — ผิดตั้งแต่ "/" เปลี่ยนความหมายเป็นหน้า Home ลิสต์ทริป (27 ส.ค. 2026)
 * ใช้ `tripId` ที่ผู้เรียกมีอยู่แล้วทุกจุด (`TripPlanScreen`/`TodayPageContent`/`SummaryContent`) ชี้ไป
 * `/trip/[tripId]` ตรงๆ แทน — ใช้ทั้ง 3 tab ไม่ใช่แค่ tab แรก เพื่อไม่ให้กลับไปพึ่งการ resolve ทริปจาก
 * `useActiveTripId()` ซ้ำโดยไม่จำเป็นตอนรู้ tripId อยู่แล้ว */
function tabsFor(tripId: string) {
  return [
    { href: `/trip/${tripId}`, icon: "🗺️", label: "แผนทริป" },
    { href: `/trip/${tripId}/today`, icon: "📍", label: "วันนี้" },
    { href: `/trip/${tripId}/summary`, icon: "📋", label: "สรุปแผน" },
  ] as const;
}

export function BottomNav({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const tabs = tabsFor(tripId);

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-maple" : "text-content-soft"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
