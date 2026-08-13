"use client";

import { useMemo, useState } from "react";
import { CITY_NAME_EN, ITINERARY, type Day, type DayEvent } from "@/data/itinerary";
import type { Place } from "@/data/places";
import type { HotelLeg } from "@/lib/hotelLegs";
import type { TripHotel, TripStop } from "@/lib/supabase";
import { resolvePlace } from "@/lib/resolvePlace";
import { looksLatin } from "@/lib/latinScript";
import { placeQueryKey } from "@/lib/placeQuery";
import { usePlaceNamesEn } from "@/hooks/usePlaceNamesEn";
import type { CustomPlace } from "@/lib/supabase";

const NAMES_STORAGE_KEY = "trip-passport-names";

/** วันที่แบบอังกฤษสั้นๆ ที่เจ้าหน้าที่อ่านออกทันที ("11 Oct 2026") — ไม่ใช้ toLocaleDateString
 *  เพื่อไม่ให้ผลลัพธ์เปลี่ยนตามข้อมูล locale ของเครื่อง/เบราว์เซอร์ที่เปิดเอกสารนี้ */
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDateEn(iso: string, plusDays = 0): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + plusDays));
  return `${date.getUTCDate()} ${MONTHS_EN[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

type FlightRow = { day: Day; event: DayEvent };

/** เที่ยวบินทั้งทริปเรียงตามเวลาจริง — ตัดตัวซ้ำ (VN428 ปรากฏทั้งวันออกและวันถึง) ด้วยเลขเที่ยวบิน */
function allFlights(): FlightRow[] {
  const seen = new Set<string>();
  const rows: FlightRow[] = [];
  for (const day of ITINERARY) {
    for (const event of day.events ?? []) {
      if (event.kind !== "flight" || !event.flight) continue;
      if (seen.has(event.flight.no)) continue;
      seen.add(event.flight.no);
      rows.push({ day, event });
    }
  }
  return rows;
}

/**
 * เอกสารสำหรับยื่น ตม./กรอก K-ETA — ภาษาอังกฤษล้วน ขาวดำ พิมพ์ลง A4 ได้พอดี
 *
 * ต่างจากหน้าสรุปปกติตรงที่ตัดทุกอย่างที่เจ้าหน้าที่ไม่ได้ถามออกหมด (โน้ต, เวลาเดินทาง, ระยะทาง,
 * checklist) เหลือแค่ 3 อย่างที่ถูกถามจริง: **บินเข้า-ออกวันไหนเที่ยวบินอะไร · นอนที่ไหนคืนไหน ·
 * แต่ละวันอยู่เมืองไหน**
 *
 * ชื่อตามพาสปอร์ตเก็บใน localStorage ของเครื่องนี้เท่านั้น **จงใจไม่เก็บลง Supabase** เพราะ RLS
 * ของโปรเจกต์นี้เปิดสาธารณะทุกตารางและ anon key อยู่ในบันเดิลฝั่ง browser (ดูขอบเขตที่เฟส 13.5)
 * — ใครได้ key ไปก็อ่านได้หมด ชื่อ-นามสกุลตามพาสปอร์ตไม่ควรอยู่ในนั้น
 */
export function ImmigrationSheet({
  hotelLegs,
  hotels,
  stopsByDay,
  customPlaces,
}: {
  hotelLegs: HotelLeg[];
  hotels: Record<string, TripHotel>;
  stopsByDay: Record<string, TripStop[]>;
  customPlaces: CustomPlace[];
}) {
  // อ่าน localStorage ตอน initial state ได้ตรงๆ เพราะคอมโพเนนต์นี้อยู่ใต้ Suspense ของ /summary
  // ที่ใช้ useSearchParams = subtree ทั้งก้อนเรนเดอร์ฝั่ง client ล้วน ไม่มี HTML จากเซิร์ฟเวอร์ให้ mismatch
  const [names, setNames] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(NAMES_STORAGE_KEY) ?? ""
  );
  const [editingNames, setEditingNames] = useState(false);

  function saveNames(value: string) {
    setNames(value);
    window.localStorage.setItem(NAMES_STORAGE_KEY, value);
  }

  const flights = allFlights();
  const nameLines = names.split("\n").map((n) => n.trim()).filter(Boolean);

  // สถานที่ทั้งทริปเรียงตามวัน — คำนวณครั้งเดียวแล้วใช้ทั้งการหาชื่ออังกฤษและตาราง Daily outline
  const placesByDay = useMemo(() => {
    const map: Record<string, Place[]> = {};
    for (const day of ITINERARY) {
      map[day.id] = (stopsByDay[day.id] ?? [])
        .filter((s) => s.kind !== "intercity")
        .map((s) => resolvePlace(s.place_id, customPlaces))
        .filter((p): p is Place => p != null);
    }
    return map;
  }, [stopsByDay, customPlaces]);

  // สถานที่ที่เพิ่มเองระหว่างทางเก็บชื่อที่ Google คืนมาเป็นภาษาไทย (custom_places.name_en เป็น null
  // ดู NearbyPlacesModal) — เอกสารที่ยื่นเจ้าหน้าที่เลยมี "ตลาดปลาจากัลชิ" ปนอยู่ · ขอชื่ออังกฤษของ
  // ที่เดียวกันจาก Google มาแทนเฉพาะตัวที่ชื่อไม่ใช่อักษรละติน (ที่คัดไว้เองใน PLACES มี nameEn ครบอยู่แล้ว)
  const nonLatinQueries = useMemo(() => {
    const queries = new Set<string>();
    for (const places of Object.values(placesByDay)) {
      for (const place of places) {
        if (!looksLatin(place.nameEn)) queries.add(placeQueryKey(place));
      }
    }
    return Array.from(queries);
  }, [placesByDay]);
  const namesEn = usePlaceNamesEn(nonLatinQueries);

  /** ชื่อที่จะพิมพ์ลงเอกสาร — อังกฤษที่มีอยู่แล้วมาก่อน ไม่งั้นใช้ที่เพิ่งขอจาก Google
   *  ขอไม่ได้ (ออฟไลน์/Google ไม่มีให้) ก็ยอมใช้ชื่อเดิม ดีกว่าเว้นว่างจนเจ้าหน้าที่อ่านไม่ออกว่าไปไหน */
  function documentName(place: Place): string {
    if (looksLatin(place.nameEn)) return place.nameEn;
    return namesEn[placeQueryKey(place)] ?? place.nameEn;
  }

  return (
    <div className="mx-auto max-w-3xl bg-surface-raised px-4 py-5 text-content print:px-0 print:py-0">
      {/* border-content ไม่ใช่ border-line — เส้นคาดหัวเอกสารกับเส้นใต้หัวตารางในหน้านี้ตั้งใจให้เข้ม
          เท่าตัวหนังสือ (`--line` เป็นครีมอ่อน #f7ead6 ไว้คั่นแถวในการ์ด พอมาอยู่บนกระดาษขาวจะหายไปเลย)
          หน้านี้พิมพ์ยื่นเจ้าหน้าที่ ตม. จริง เส้นที่หายคือเส้นที่แบ่งส่วนของเอกสารให้อ่านออก */}
      <header className="border-b-2 border-content pb-2">
        <h1 className="text-xl font-bold">Travel Itinerary — Republic of Korea</h1>
        <p className="text-sm text-content-soft">
          {formatDateEn(ITINERARY[0].date)} – {formatDateEn(ITINERARY[ITINERARY.length - 1].date)} ·
          Tourism · Round trip from Bangkok, Thailand
        </p>
      </header>

      <Section title="Travellers">
        {editingNames ? (
          <div className="print:hidden">
            <textarea
              autoFocus
              value={names}
              onChange={(e) => saveNames(e.target.value)}
              rows={3}
              placeholder={"Full name as printed in passport\nOne name per line"}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-maple focus:outline-none"
            />
            <button
              onClick={() => setEditingNames(false)}
              className="mt-1 rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-cream hover:bg-pine-dark"
            >
              Done
            </button>
          </div>
        ) : nameLines.length > 0 ? (
          <div className="flex items-start justify-between gap-3">
            <ul className="text-sm">
              {nameLines.map((n) => (
                <li key={n} className="font-medium uppercase tracking-wide">
                  {n}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setEditingNames(true)}
              className="shrink-0 text-xs text-content-soft underline print:hidden"
            >
              edit
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingNames(true)}
            className="text-sm text-maple underline print:hidden"
          >
            + Add names as printed in passport
          </button>
        )}
        <p className="mt-1 text-[10px] text-content-soft print:hidden">
          เก็บไว้ในเครื่องนี้เท่านั้น (localStorage) ไม่ได้ส่งขึ้นฐานข้อมูล — อีกเครื่องต้องกรอกเอง
        </p>
      </Section>

      <Section title="Flights">
        <Table head={["Date", "Flight", "Route", "Dep", "Arr"]}>
          {flights.map(({ day, event }) => (
            <tr key={event.flight!.no} className="border-b border-line last:border-0">
              <Td>{formatDateEn(day.date, event.dayOffset ?? 0)}</Td>
              <Td className="font-semibold">{event.flight!.no}</Td>
              <Td>
                {event.flight!.fromEn} → {event.flight!.toEn}
              </Td>
              <Td className="tabular-nums">{event.time}</Td>
              <Td className="tabular-nums">{event.endTime ?? "—"}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-1 text-[10px] text-content-soft">
          All times are local to the departure/arrival airport.
        </p>
      </Section>

      <Section title="Accommodation in Korea">
        <Table head={["Dates", "Nights", "Hotel", "Address", "Phone"]}>
          {hotelLegs.map((leg) => {
            const hotel = hotels[leg.id];
            return (
              <tr key={leg.id} className="border-b border-line last:border-0">
                <Td className="whitespace-nowrap">
                  {formatDateEn(leg.startDate)} – {formatDateEn(leg.endDate)}
                </Td>
                <Td className="tabular-nums">{leg.nights.length}</Td>
                <Td>
                  <span className="font-medium">
                    {hotel?.name_en || hotel?.hotel_name || "— not booked —"}
                  </span>
                  <span className="block text-[11px] text-content-soft">{CITY_NAME_EN[leg.city]}</span>
                </Td>
                <Td className="text-[11px]">
                  {hotel?.address_en || hotel?.formatted_address || "—"}
                  {hotel?.address_local && (
                    <span className="block text-content-soft">{hotel.address_local}</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-[11px]">{hotel?.phone || "—"}</Td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-1 text-[10px] text-content-soft">
          Blank English name/address/phone means the hotel was saved before this field existed —
          re-save it on the planner page to fill it in.
        </p>
      </Section>

      <Section title="Daily outline">
        <Table head={["Date", "Day", "City", "Places"]}>
          {ITINERARY.map((day) => {
            const places = placesByDay[day.id].map(documentName);
            return (
              <tr key={day.id} className="border-b border-line last:border-0">
                <Td className="whitespace-nowrap">{formatDateEn(day.date)}</Td>
                <Td className="text-[11px]">{day.weekdayEn}</Td>
                <Td className="whitespace-nowrap font-medium">{day.cityEn}</Td>
                <Td className="text-[11px]">{places.length > 0 ? places.join(", ") : "—"}</Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 print:break-inside-avoid">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-content-soft">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-content text-left text-[11px] uppercase text-content-soft">
            {head.map((h) => (
              <th key={h} className="py-1 pr-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-1 pr-3 align-top ${className}`}>{children}</td>;
}
