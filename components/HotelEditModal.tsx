"use client";

import { useEffect, useRef, useState } from "react";
import type { HotelLeg } from "@/lib/hotelLegs";
import { CITY_NAME_TH } from "@/data/itinerary";
import { cityCenter } from "@/data/places";
import type { TripHotel } from "@/lib/supabase";
import type { PlaceSuggestion } from "@/lib/googlePlaces";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { GoogleMapEmbed } from "./GoogleMapEmbed";

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
  onSave: (hotelName: string, lat: number, lng: number, formattedAddress: string | null) => void;
  onClear: () => void;
}) {
  useBodyScrollLock();
  const [address, setAddress] = useState(existing?.hotel_name ?? "");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLat, setManualLat] = useState(existing ? String(existing.lat) : "");
  const [manualLng, setManualLng] = useState(existing ? String(existing.lng) : "");
  const [resolved, setResolved] = useState<{
    lat: number;
    lng: number;
    formattedAddress: string | null;
  } | null>(
    existing
      ? { lat: existing.lat, lng: existing.lng, formattedAddress: existing.formatted_address }
      : null
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipNextSuggest = useRef(false);
  const bias = cityCenter(leg.city);

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
          `/api/place-autocomplete?input=${encodeURIComponent(address)}&lat=${bias.lat}&lng=${bias.lng}`,
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
      const res = await fetch(`/api/geocode?placeId=${encodeURIComponent(placeId)}`);
      const data = await res.json();
      if (data.lat == null || data.lng == null) {
        setStatus("error");
        setManualOpen(true);
        return;
      }
      setResolved({ lat: data.lat, lng: data.lng, formattedAddress: data.formattedAddress });
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
      const res = await fetch(`/api/geocode?query=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.lat == null || data.lng == null) {
        setStatus("error");
        setManualOpen(true);
        return;
      }
      setResolved({ lat: data.lat, lng: data.lng, formattedAddress: data.formattedAddress });
      setStatus("idle");
    } catch {
      setStatus("error");
      setManualOpen(true);
    }
  }

  function handleSaveManual() {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setResolved({ lat, lng, formattedAddress: null });
  }

  function handleConfirm() {
    if (!address.trim() || !resolved) return;
    onSave(address.trim(), resolved.lat, resolved.lng, resolved.formattedAddress);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg font-bold text-ink">
            ที่พัก — {CITY_NAME_TH[leg.city]}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-soft hover:bg-cream-soft"
          >
            ✕
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-soft">
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
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            <button
              onClick={handleGeocode}
              disabled={!address.trim() || status === "loading"}
              className="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-cream hover:bg-pine-dark disabled:opacity-40"
            >
              {status === "loading" ? "..." : "ค้นหา"}
            </button>
          </div>

          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-cream-soft bg-white shadow-lg shadow-ink/10">
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
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-cream-soft"
                  >
                    <div className="text-ink">{s.mainText}</div>
                    {s.secondaryText && (
                      <div className="text-xs text-ink-soft">{s.secondaryText}</div>
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
            <GoogleMapEmbed query={`${resolved.lat},${resolved.lng}`} />
          </div>
        )}

        <button
          onClick={() => setManualOpen((v) => !v)}
          className="mt-3 text-xs text-ink-soft underline hover:text-ink"
        >
          {manualOpen ? "ซ่อนช่องกรอกพิกัดเอง" : "กรอกพิกัดเอง (lat, lng)"}
        </button>

        {manualOpen && (
          <div className="mt-2 flex gap-2">
            <input
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="lat เช่น 35.1587"
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            <input
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="lng เช่น 129.0603"
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            <button
              onClick={handleSaveManual}
              className="shrink-0 rounded-lg bg-cream-soft px-3 py-2 text-sm text-ink hover:bg-maple-soft"
            >
              ใช้พิกัดนี้
            </button>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {existing && (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
              className="rounded-xl px-4 py-3 text-sm text-ink-soft hover:bg-cream-soft"
            >
              ลบที่พัก
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!address.trim() || !resolved}
            className="flex-1 rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
