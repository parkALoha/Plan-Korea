"use client";

import { useEffect, useState } from "react";
import type { City } from "@/data/itinerary";
import { EMERGENCY_BY_COUNTRY, countryOfCity } from "@/data/emergency";
import type { TripBooking, TripHotel } from "@/lib/supabase";
import { googleMapsDirectionsUrl } from "@/lib/mapLinks";

type Hospital = { name: string; lat: number | null; lng: number | null; address: string | null };

/**
 * การ์ดฉุกเฉิน (เฟส 17) — ทุกอย่างที่ต้องหาให้เจอภายใน 10 วินาทีตอนมีเรื่อง
 * ยุบไว้เป็นค่าเริ่มต้นเพราะปกติไม่ได้ใช้ แต่ต้องอยู่ในหน้าที่เปิดอยู่แล้ว ไม่ใช่หน้าที่ต้องไปหา
 *
 * โรงพยาบาลดึงสดจาก Places API รอบ **ที่พักคืนนั้น** (ไม่ใช่รอบตำแหน่งปัจจุบัน) เพราะที่พักคือจุดที่
 * กลับไปนอนแน่ๆ และรู้พิกัดล่วงหน้าได้โดยไม่ต้องขอสิทธิ์ location ของเบราว์เซอร์
 */
export function EmergencyCard({
  city,
  hotel,
  bookings,
}: {
  city: City;
  hotel: TripHotel | null;
  bookings: TripBooking[];
}) {
  const [open, setOpen] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[] | null>(null);
  const contacts = EMERGENCY_BY_COUNTRY[countryOfCity(city)];

  // ยิงหาโรงพยาบาลเฉพาะตอนกางการ์ดจริงๆ — ไม่มีเหตุผลให้เสียโควตา Places ทุกครั้งที่เปิดหน้า
  useEffect(() => {
    if (!open || !hotel || hospitals) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/place-nearby?kind=hospital&lat=${hotel.lat}&lng=${hotel.lng}`
        );
        const data = await res.json();
        if (cancelled) return;
        setHospitals(
          (data.results ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
            name: (r.name as string) ?? "",
            lat: (r.lat as number | null) ?? null,
            lng: (r.lng as number | null) ?? null,
            address: (r.formattedAddress as string | null) ?? null,
          }))
        );
      } catch {
        if (!cancelled) setHospitals([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, hotel, hospitals]);

  const withConfirmation = bookings.filter((b) => b.confirmation_number);

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-maple/40 bg-surface-raised">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-bold text-maple-dark">🆘 ฉุกเฉิน / เบอร์สำคัญ</span>
        <span className="text-xs text-content-soft">{open ? "▾ ซ่อน" : "▸ เปิด"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-3">
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
              โทรฉุกเฉิน
            </h3>
            <ul className="space-y-1.5">
              {contacts.map((c) => (
                <li key={c.label} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-content">
                      {c.icon} {c.label}
                    </span>
                    {c.local && (
                      <a
                        href={`tel:${c.local}`}
                        className="rounded-lg bg-maple px-2.5 py-1 text-xs font-bold text-cream"
                      >
                        📞 {c.local}
                      </a>
                    )}
                    {c.tel && (
                      <a
                        href={`tel:${c.tel}`}
                        className="rounded-lg bg-maple-soft px-2.5 py-1 text-xs font-semibold text-maple-dark"
                      >
                        {c.tel}
                      </a>
                    )}
                  </div>
                  {c.detail && <div className="text-xs text-content-soft">{c.detail}</div>}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-pine-dark underline"
                    >
                      เว็บไซต์ทางการ
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
              โรงพยาบาลใหญ่ใกล้ที่พักคืนนี้
            </h3>
            {!hotel ? (
              <p className="text-xs text-content-soft">ยังไม่ได้เลือกที่พักของคืนนี้</p>
            ) : hospitals == null ? (
              <p className="text-xs text-content-soft">กำลังค้นหา...</p>
            ) : hospitals.length === 0 ? (
              <p className="text-xs text-content-soft">ไม่พบโรงพยาบาลในรัศมี 8 กม.</p>
            ) : (
              <ul className="space-y-1.5">
                {hospitals.map((h) => (
                  <li key={h.name} className="text-sm">
                    <div className="font-medium text-content">🏥 {h.name}</div>
                    {h.address && <div className="text-xs text-content-soft">{h.address}</div>}
                    {h.lat != null && h.lng != null && (
                      <a
                        href={googleMapsDirectionsUrl(h.lat, h.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-pine-dark underline"
                      >
                        นำทางไปที่นี่
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {withConfirmation.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-soft">
                เลขที่จองทั้งหมด
              </h3>
              <ul className="space-y-0.5 text-xs text-content">
                {withConfirmation.map((b) => (
                  <li key={b.id}>
                    {b.title} — <span className="font-semibold tabular-nums">{b.confirmation_number}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 🔴 เดิมข้อความนี้ฝัง "119/112 (เกาหลี) และ 113/115 (เวียดนาม)" ตรงๆ ทั้งที่ contacts
              ด้านบนดึงจาก countryOfCity(city) ของทริปนี้แล้ว — คนอยู่ฮานอยเห็นเบอร์เวียดนามข้างบน
              แล้วอ่านเจอเบอร์เกาหลีในเชิงอรรถ ไม่ตรงกับทริปอื่นเลย (P1 ชี้ 27 ส.ค. 2026)
              แก้โดยไม่พูดถึงตัวเลขซ้ำ (ซึ่งต้องรู้ว่าเบอร์ไหน "มาตรฐาน" ของประเทศไหนอีกชั้นหนึ่ง)
              พูดถึง*หมวด*แทน — ใช้ได้กับทุกประเทศในทะเบียนโดยไม่ต้องเพิ่มข้อมูลใหม่ */}
          <p className="text-[10px] text-content-soft">
            เบอร์ตำรวจ/รถพยาบาลด้านบนเป็นเลขมาตรฐานของประเทศนี้ ไม่เปลี่ยน · เบอร์สถานทูตเปลี่ยนได้ —
            ตรวจซ้ำจากเว็บทางการก่อนเดินทาง
          </p>
        </div>
      )}
    </section>
  );
}
