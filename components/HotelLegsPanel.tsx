"use client";

import { useState } from "react";
import { CITY_META, CITY_NAME_TH } from "@/data/itinerary";
import type { HotelLeg } from "@/lib/hotelLegs";
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
  onClear: (legId: string) => void;
}) {
  const [editingLegId, setEditingLegId] = useState<string | null>(null);
  const editingLeg = legs.find((l) => l.id === editingLegId) ?? null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        🏨 ที่พักของทริป
      </h2>
      {/* grid ไม่ใช่ flex-wrap — flex item จะกว้างตามเนื้อหาทำให้ชื่อโรงแรมยาวๆ ดันหน้าเว็บล้นจอมือถือ
          (truncate ข้างในไม่ช่วย เพราะตัวปุ่มเองไม่มีเพดานความกว้าง) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {legs.map((leg) => {
          const hotel = hotels[leg.id];
          const meta = CITY_META[leg.city];
          return (
            <button
              key={leg.id}
              onClick={() => setEditingLegId(leg.id)}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-cream-soft bg-white px-3 py-2 text-left shadow-sm shadow-ink/5 hover:border-maple/40"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                style={{ backgroundColor: `${meta.color}1a` }}
              >
                {meta.icon}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-ink-soft">
                  {CITY_NAME_TH[leg.city]} · {dateRangeLabel(leg)}
                </div>
                <div className="truncate text-sm font-medium text-ink">
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
          existing={hotels[editingLeg.id] ?? null}
          onClose={() => setEditingLegId(null)}
          onSave={(input) =>
            onSave({ ...input, legId: editingLeg.id, city: editingLeg.city })
          }
          onClear={() => onClear(editingLeg.id)}
        />
      )}
    </section>
  );
}
