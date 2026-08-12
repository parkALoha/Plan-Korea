"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * แถบ "โหมดอ่านอย่างเดียว" ตอนเน็ตหลุด (เฟส 18)
 *
 * อยู่บนสุดของทุกหน้า ดันเนื้อหาลงแทนที่จะลอยทับ — ตอนเน็ตหลุดจริงผู้ใช้ต้องเห็นแน่ๆ ว่าที่เห็นอยู่
 * เป็นข้อมูลชุดล่าสุดที่โหลดไว้ ไม่ใช่ของสด · หน้าแผนจะล็อกทุกวันอัตโนมัติด้วย (ดู app/page.tsx)
 * เพราะการแก้ตอนออฟไลน์จะเงียบหายไปเฉยๆ (เว็บนี้เขียนตรงเข้า Supabase ไม่มีคิวรอส่ง)
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-maple-dark px-4 py-1.5 text-center text-xs font-medium text-cream print:hidden"
    >
      📴 เน็ตหลุด — โหมดอ่านอย่างเดียว (ข้อมูลที่เห็นคือชุดล่าสุดที่โหลดไว้)
    </div>
  );
}
