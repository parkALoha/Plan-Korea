"use client";

import { cityMetaOf, cityNameThOf } from "@/components/cityMeta";
import { useState } from "react";
import { hotelRangeKey, type HotelLeg } from "@/lib/hotelLegs";
import type { TripHotel } from "@/lib/supabase";
import type { HotelInput } from "@/hooks/useHotels";
import { HotelEditModal } from "./HotelEditModal";

function dateRangeLabel(leg: HotelLeg) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  const first = leg.nights[0];
  const last = leg.nights[leg.nights.length - 1];
  return first === last ? fmt(first) : `${fmt(first)} - ${fmt(last)}`;
}

export function HotelLegsPanel({
  legs,
  hotels,
  onSave,
  onClear,
}: {
  legs: HotelLeg[];
  hotels: Record<string, TripHotel>;
  onSave: (input: HotelInput) => void;
  // D51: clearHotel ต้องได้คีย์ช่วงวันที่ ไม่ใช่ legId เพียวๆ — ส่ง range มาด้วยเสมอ (เหมือน onSave)
  onClear: (legId: string, range: { startDate: string; endDate: string }) => void;
}) {
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const editingLeg = legs.find((l) => l.id === editingLegId) ?? null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-soft">
        🏨 ที่พักของทริป
      </h2>
      {/* grid ไม่ใช่ flex-wrap — flex item จะกว้างตามเนื้อหาทำให้ชื่อโรงแรมยาวๆ ดันหน้าเว็บล้นจอมือถือ
          (truncate ข้างในไม่ช่วย เพราะตัวปุ่มเองไม่มีเพดานความกว้าง) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {legs.map((leg) => {
          // D51: ไม่มี leg_id ในฐานแล้ว คีย์ด้วยช่วงวันที่แทน (hotelRangeKey — ฟังก์ชันเดียวใช้ทั้ง
          // ฝั่งอ่าน/เขียน กันเขียนคีย์เองสองที่แล้วต่างกันสักวัน)
          const hotel = hotels[hotelRangeKey(leg)];
          const meta = cityMetaOf(leg.city);
          return (
            <button
              key={leg.id}
              onClick={() => setEditingLegId(leg.id)}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2 text-left shadow-sm shadow-ink/5 hover:border-maple/40"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ backgroundColor: `${meta.color}1a` }}
              >
                {meta.icon}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-content-soft">
                  {cityNameThOf(leg.city)} · {dateRangeLabel(leg)}
                </div>
                <div className="truncate text-sm font-medium text-content">
                  {hotel ? hotel.hotel_name : "ยังไม่ได้ตั้ง"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {editingLeg && (
        <HotelEditModal
          leg={editingLeg}
          existing={hotels[hotelRangeKey(editingLeg)] ?? null}
          onClose={() => setEditingLegId(null)}
          onSave={(input) =>
            onSave({
              ...input,
              legId: editingLeg.id,
              city: editingLeg.city,
              checkIn: editingLeg.startDate,
              checkOut: editingLeg.endDate,
            })
          }
          onClear={() =>
            onClear(editingLeg.id, {
              startDate: editingLeg.startDate,
              endDate: editingLeg.endDate,
            })
          }
        />
      )}
    </section>
  );
}
