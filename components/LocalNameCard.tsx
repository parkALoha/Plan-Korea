"use client";

import { useState } from "react";
import type { Place } from "@/data/places";
import { CITY_LOCALE } from "@/data/places";

/**
 * การ์ด "ให้คนขับแท็กซี่ดู" (เฟส 14) — ชื่อ + ที่อยู่ภาษาท้องถิ่นตัวใหญ่ กดคัดลอกได้
 *
 * เหตุผลที่มีการ์ดนี้ ทั้งที่มีปุ่มนำทาง 3 แอปอยู่แล้ว: ปัญหาหน้างานที่เจอบ่อยกว่าแอปเปิดไม่ติด
 * คือ**คนขับอ่านชื่อภาษาอังกฤษ/ไทยไม่ออก** ยื่นจอที่มี 감천문화마을 ให้ดูจบเร็วกว่าอธิบาย
 * ค่าทั้งหมดฝังมากับ data/places.ts แล้ว จึงขึ้นได้ทันทีแม้เน็ตหลุด (สำคัญมากตอนอยู่บนรถ)
 */
export function LocalNameCard({
  place,
  fallbackNameLocal,
  fallbackAddressLocal,
}: {
  place: Place;
  /** สำหรับสถานที่ที่ผู้ใช้เพิ่มเอง ซึ่งไม่มี nameLocal ฝังใน data/places.ts — มาจาก place_details_cache */
  fallbackNameLocal?: string | null;
  fallbackAddressLocal?: string | null;
}) {
  const [copied, setCopied] = useState<"name" | "address" | null>(null);

  const nameLocal = place.nameLocal || fallbackNameLocal || null;
  const addressLocal = place.addressLocal || fallbackAddressLocal || null;

  // ไม่มีชื่อท้องถิ่น = ไม่ต้องโชว์การ์ดเลย ดีกว่าโชว์การ์ดว่างๆ ให้เกะกะ
  if (!nameLocal && !addressLocal) return null;

  const locale = CITY_LOCALE[place.city];
  const localeLabel = { ko: "เกาหลี", vi: "เวียดนาม", th: "ไทย" }[locale];

  async function copy(text: string, which: "name" | "address") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // คัดลอกไม่ได้ (เบราว์เซอร์ไม่ให้สิทธิ์) — ไม่เป็นไร ผู้ใช้ยังอ่านจากจอให้คนขับดูได้อยู่ดี
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
        🚕 ยื่นให้คนขับดู (ภาษา{localeLabel})
      </div>

      {nameLocal && (
        <button
          onClick={() => copy(nameLocal, "name")}
          className="w-full rounded-lg bg-surface-raised/70 px-3 py-2 text-left hover:bg-surface-raised"
        >
          {/* ตัวใหญ่ตั้งใจ — ต้องอ่านออกจากระยะที่ยื่นจอข้ามเบาะหน้า */}
          <div className="text-2xl font-bold leading-snug text-content">{nameLocal}</div>
          <div className="mt-0.5 text-[11px] text-content-soft">
            {copied === "name" ? "✓ คัดลอกแล้ว" : "แตะเพื่อคัดลอก"}
          </div>
        </button>
      )}

      {addressLocal && (
        <button
          onClick={() => copy(addressLocal, "address")}
          className="mt-2 w-full rounded-lg bg-surface-raised/70 px-3 py-2 text-left hover:bg-surface-raised"
        >
          <div className="text-base font-medium leading-snug text-content">{addressLocal}</div>
          <div className="mt-0.5 text-[11px] text-content-soft">
            {copied === "address" ? "✓ คัดลอกแล้ว" : "แตะเพื่อคัดลอกที่อยู่"}
          </div>
        </button>
      )}
    </div>
  );
}
