"use client";

import { useEffect, useRef, useState } from "react";
import type { HotelLeg } from "@/lib/hotelLegs";
import { cityNameThOf } from "@/components/cityMeta";
import { cityCenter } from "@/data/places";
import { cityLocaleOf } from "@/components/placeCity";
import type { HotelLocalized, TripHotel } from "@/lib/supabase";
import type { PlaceSuggestion } from "@/lib/googlePlaces";
import { useSystemMode } from "@/hooks/useSystemMode";
import { Modal } from "./Modal";
import { GoogleMapEmbed } from "./GoogleMapEmbed";

function localizedFrom(data: Record<string, unknown>): HotelLocalized {
  return {
    nameLocal: (data.nameLocal as string | null) ?? null,
    addressLocal: (data.addressLocal as string | null) ?? null,
    nameEn: (data.nameEn as string | null) ?? null,
    addressEn: (data.addressEn as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
  };
}

export function HotelEditModal({
  leg,
  existing,
  onClose,
  onSave,
  onClear,
}: {
  leg: HotelLeg;
  existing: TripHotel | null;
  onClose: () => void;
  onSave: (input: {
    hotelName: string;
    lat: number;
    lng: number;
    formattedAddress: string | null;
    localized: HotelLocalized | null;
  }) => void;
  onClear: () => void;
}) {
  const [address, setAddress] = useState(existing?.hotel_name ?? "");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLat, setManualLat] = useState(existing ? String(existing.lat) : "");
  const [manualLng, setManualLng] = useState(existing ? String(existing.lng) : "");
  const [resolved, setResolved] = useState<{
    lat: number;
    lng: number;
    formattedAddress: string | null;
    localized: HotelLocalized | null;
  } | null>(
    existing
      ? {
          lat: existing.lat,
          lng: existing.lng,
          formattedAddress: existing.formatted_address,
          localized: {
            nameLocal: existing.name_local ?? null,
            addressLocal: existing.address_local ?? null,
            nameEn: existing.name_en ?? null,
            addressEn: existing.address_en ?? null,
            phone: existing.phone ?? null,
          },
        }
      : null
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipNextSuggest = useRef(false);
  // ปิดที่ทางเข้าตอนโมดัลเปิด ไม่ใช่แค่ปุ่มบันทึกตอนจบ — รูปแบบเดียวกับ BookingEditModal (E3-AC7 §9)
  const { mode: systemMode } = useSystemMode();
  const readOnly = systemMode.state === "ok" && systemMode.readOnly;
  /**
   * 🔴 **`cityCenter()` คืน `NaN` สำหรับเมืองที่ไม่มีใน `PLACES`** (`D54` · `E2-AC16` · P2 · 2 ก.ย. 2026)
   * มันเฉลี่ยพิกัดของสถานที่ในเมืองนั้น → เมืองที่มี 0 แห่ง = `0/0` · และ `leg.city` **มาจากฐานแล้ว**
   * บน branch นี้ (ดูคอมเมนต์ `locale` ข้างบน — เส้นทางเดียวกันเป๊ะ)
   *
   * 🎯 **ที่นี่พิกัดเป็นของ *ทางเลือก* ไม่ใช่ *จำเป็น*** — มันแค่ดึงผลลัพธ์ให้ใกล้เมือง
   * → ไม่มีพิกัด = **ตัดพารามิเตอร์ทิ้ง ค้นหาต่อได้ตามปกติ** ไม่ใช่ปิดฟีเจอร์
   * ⚠️ ต่างจาก `PlaceSidebar` ที่พิกัดเป็นของจำเป็น (ไม่มี = ไม่เสนอปุ่ม) — **`null` แปลไม่เหมือนกัน
   *    ในสองที่นี้ และนั่นคือการตัดสินใจ ไม่ใช่ความไม่สม่ำเสมอ**
   */
  const rawBias = cityCenter(leg.city);
  const bias =
    Number.isFinite(rawBias.lat) && Number.isFinite(rawBias.lng) ? rawBias : null;
  // ภาษาท้องถิ่นของเมืองที่พักอยู่ — ขอชื่อ/ที่อยู่ภาษานั้น + อังกฤษ + เบอร์โทรมาพร้อมพิกัดในคำขอเดียว
  //
  // 🔴 เดิมมี `as Place["city"]` ตรงนี้ — ลบแล้ว (P1 ชี้ 27 ส.ค. 2026) `leg.city: City` มาจาก
  /**
   * 🔴 **เงื่อนไขที่คอมเมนต์เดิมทำนายไว้ *มาถึงแล้ว* — และไม่มีใครกลับมา** (P2 ไล่เจอ 2 ก.ย. 2026)
   *
   * ของเดิมเขียนไว้ว่า *"ไม่มีเส้นทางไหนที่ `leg.city` มาจากฐานเลยตอนนี้ · ⚠️ ถ้าวันไหนเริ่มมาจากฐานจริง
   * ต้องกลับมาเช็ค `Object.hasOwn` ก่อนอินเด็กซ์"* — **ถูกต้องทุกตัวอักษร ทั้งข้อเท็จจริงและเงื่อนไข**
   * แล้วบน branch `platform` สายนี้เป็นจริงไปแล้ว:
   * ```
   * TripPlanScreen:137  usePlatformItinerary(...)   ← วันมาจากฐาน (คลัง 42 เมือง)
   * TripPlanScreen:281  useHotelSchedule(itinerary)
   * useHotelSchedule:9  deriveHotelLegs(itinerary)  → HotelLeg.city
   * ```
   * 🎯 **คอมเมนต์เขียนวันหมดอายุของตัวเองไว้ล่วงหน้า และมันยังไม่พอ** — เพราะไม่มีใครไล่หาคอมเมนต์
   * ที่รอเงื่อนไขอยู่ (`§3.34` — ของที่ควรมีคือ *assertion* ที่แดงเองวันที่เงื่อนไขเป็นจริง)
   *
   * ⚠️ **ผลกระทบวัดแล้ว ไม่ใช่เดา และไม่ใช่บั๊กร้ายแรง:** `app/api/geocode/route.ts:77` กรอง
   * `locale` ที่ไม่รู้จักทิ้งเป็น `null` อยู่แล้ว → เมืองนอก 6 ค่าได้ `EMPTY_LOCALIZED`
   * **ไม่พัง แค่ไม่ได้ชื่อ/ที่อยู่ภาษาท้องถิ่นกับเบอร์โทร** · ที่แก้คือให้โค้ดพูดความจริง
   * และเลิกยิงสตริง `"undefined"` ออกไปในคิวรี
   */
  const locale = cityLocaleOf(leg.city);

  // แนะนำสถานที่ตามที่พิมพ์แบบ debounce 300ms bias ผลลัพธ์ให้ใกล้เมืองของ leg นี้
  useEffect(() => {
    if (skipNextSuggest.current) {
      skipNextSuggest.current = false;
      return;
    }
    if (!address.trim()) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/place-autocomplete?input=${encodeURIComponent(address)}` +
            (bias ? `&lat=${bias.lat}&lng=${bias.lng}` : ""),
          { signal: controller.signal }
        );
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setSuggestOpen(true);
      } catch {
        // ยกเลิกจากการพิมพ์ต่อ (AbortError) ไม่ต้องทำอะไร
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function resolvePlaceId(placeId: string, label: string) {
    skipNextSuggest.current = true;
    setAddress(label);
    setSuggestOpen(false);
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/geocode?placeId=${encodeURIComponent(placeId)}${locale ? `&locale=${locale}` : ""}`
      );
      const data = await res.json();
      if (data.lat == null || data.lng == null) {
        setStatus("error");
        setManualOpen(true);
        return;
      }
      setResolved({
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress,
        localized: localizedFrom(data),
      });
      setStatus("idle");
    } catch {
      setStatus("error");
      setManualOpen(true);
    }
  }

  async function handleGeocode() {
    if (!address.trim()) return;
    setSuggestOpen(false);
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/geocode?query=${encodeURIComponent(address)}${locale ? `&locale=${locale}` : ""}`
      );
      const data = await res.json();
      if (data.lat == null || data.lng == null) {
        setStatus("error");
        setManualOpen(true);
        return;
      }
      setResolved({
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress,
        localized: localizedFrom(data),
      });
      setStatus("idle");
    } catch {
      setStatus("error");
      setManualOpen(true);
    }
  }

  function handleSaveManual() {
    if (readOnly) return;
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    // กรอกพิกัดเอง = ไม่ได้ผ่าน Google เลย จึงไม่มีชื่อหลายภาษาให้เก็บ
    setResolved({ lat, lng, formattedAddress: null, localized: null });
  }

  function handleConfirm() {
    if (!address.trim() || !resolved || readOnly) return;
    onSave({
      hotelName: address.trim(),
      lat: resolved.lat,
      lng: resolved.lng,
      formattedAddress: resolved.formattedAddress,
      localized: resolved.localized,
    });
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={`ที่พัก — ${cityNameThOf(leg.city)}`}
      footer={
        <>
          {existing && (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
              className="rounded-xl px-4 py-3 text-sm text-content-soft hover:bg-surface-soft"
            >
              ลบที่พัก
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!address.trim() || !resolved || readOnly}
            className="flex-1 rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
          >
            บันทึก
          </button>
        </>
      }
    >
    {readOnly && (
      <div
        role="status"
        className="mb-3 rounded-lg bg-panel-gold px-3 py-2 text-xs font-medium text-panel-gold-ink"
      >
        🔧 ระบบปิดรับการแก้ไขชั่วคราว — บันทึกที่พักตอนนี้ไม่ได้
        {systemMode.state === "ok" && systemMode.reason ? ` (${systemMode.reason})` : ""}
      </div>
    )}
    <label className="mb-1 block text-xs font-medium text-content-soft">
      ชื่อ/ที่อยู่โรงแรม
    </label>
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setResolved(null);
            if (!e.target.value.trim()) {
              setSuggestions([]);
              setSuggestOpen(false);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setSuggestOpen(true);
          }}
          onBlur={() => setSuggestOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleGeocode();
            }
          }}
          placeholder="เช่น Lotte Hotel Busan"
          disabled={readOnly}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={handleGeocode}
          disabled={!address.trim() || status === "loading" || readOnly}
          className="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-cream hover:bg-pine-dark disabled:opacity-40"
        >
          {status === "loading" ? "..." : "ค้นหา"}
        </button>
      </div>

      {suggestOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-raised shadow-lg shadow-ink/10">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown ไม่ใช่ onClick — ให้ยิงก่อน onBlur ของ input จะได้เลือกได้ก่อนกล่องปิด
                  e.preventDefault();
                  resolvePlaceId(
                    s.placeId,
                    s.secondaryText ? `${s.mainText}, ${s.secondaryText}` : s.mainText
                  );
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-soft"
              >
                <div className="text-content">{s.mainText}</div>
                {s.secondaryText && (
                  <div className="text-xs text-content-soft">{s.secondaryText}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>

    {status === "error" && (
      <p className="mt-2 text-xs text-maple-dark">
        หาพิกัดอัตโนมัติไม่ได้ ลองกรอกพิกัดเองด้านล่าง
      </p>
    )}

    {resolved && (
      <div className="mt-3">
        <p className="mb-2 text-xs text-pine">
          📍 {resolved.formattedAddress ?? `${resolved.lat}, ${resolved.lng}`}
        </p>
        {/* ชื่อ/ที่อยู่ภาษาท้องถิ่น = สิ่งที่ปุ่มนำทาง Naver/Kakao จะส่งจริง โชว์ให้เห็นก่อนบันทึก
            (เฟส 14 ทำให้จุดแวะไปแล้ว ที่พักเพิ่งได้ในเฟส 16) · เบอร์โทรไว้กรอกเอกสาร ตม. */}
        {(resolved.localized?.nameLocal || resolved.localized?.phone) && (
          <div className="mb-2 rounded-lg bg-surface-soft/60 px-2.5 py-1.5 text-xs text-content-soft">
            {resolved.localized.nameLocal && (
              <div>
                🗣️ <span className="font-medium text-content">{resolved.localized.nameLocal}</span>
                {resolved.localized.addressLocal ? ` · ${resolved.localized.addressLocal}` : ""}
              </div>
            )}
            {resolved.localized.phone && <div>☎️ {resolved.localized.phone}</div>}
          </div>
        )}
        <GoogleMapEmbed query={`${resolved.lat},${resolved.lng}`} />
      </div>
    )}

    <button
      onClick={() => setManualOpen((v) => !v)}
      disabled={readOnly}
      className="mt-3 text-xs text-content-soft underline hover:text-content disabled:opacity-40"
    >
      {manualOpen ? "ซ่อนช่องกรอกพิกัดเอง" : "กรอกพิกัดเอง (lat, lng)"}
    </button>

    {manualOpen && (
      <div className="mt-2 flex gap-2">
        <input
          value={manualLat}
          onChange={(e) => setManualLat(e.target.value)}
          placeholder="lat เช่น 35.1587"
          disabled={readOnly}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
        <input
          value={manualLng}
          onChange={(e) => setManualLng(e.target.value)}
          placeholder="lng เช่น 129.0603"
          disabled={readOnly}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={handleSaveManual}
          disabled={readOnly}
          className="shrink-0 rounded-lg bg-surface-soft px-3 py-2 text-sm text-content hover:bg-maple-soft disabled:opacity-40"
        >
          ใช้พิกัดนี้
        </button>
      </div>
    )}

    </Modal>
  );
}
