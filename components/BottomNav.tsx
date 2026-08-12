"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** แถบเมนูล่างของมือถือ — 3 หน้าหลักของเว็บนี้ กดถึงกันได้ตลอดโดยไม่ต้องเลื่อนขึ้นไปหาลิงก์บนหัวเว็บ
 *  จอใหญ่ซ่อนไว้ (lg:hidden) เพราะมีลิงก์อยู่บนหัวเว็บอยู่แล้วและไม่ต้องยืดนิ้วไปล่างจอ */
const TABS = [
  { href: "/", icon: "🗺️", label: "แผนทริป" },
  { href: "/today", icon: "📍", label: "วันนี้" },
  { href: "/summary", icon: "📋", label: "สรุปแผน" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
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
