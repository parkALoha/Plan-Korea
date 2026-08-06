"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_EMOJI, CATEGORY_LABEL, Category, Place, cityCenter } from "@/data/places";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import type { PlaceSuggestion } from "@/lib/googlePlaces";

type SearchResult = {
  id: string | null;
  name: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
};

const CATEGORIES: Category[] = [
  "restaurant",
  "culture",
  "nature",
  "beach",
  "market",
  "cafe",
  "nightlife",
  "viewpoint",
  "shopping",
];

export function AddPlaceModal({
  city,
  addedBy,
  onClose,
  onAdded,
}: {
  city: Place["city"];
  addedBy?: string;
  onClose: () => void;
  onAdded: (placeId: string, coords: { lat: number; lng: number }) => void;
}) {
  useBodyScrollLock();
  const { addCustomPlace } = useCustomPlaces();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipNextSuggest = useRef(false);
  const bias = cityCenter(city);

  // แนะนำสถานที่ตามที่พิมพ์แบบ debounce 300ms (เหมือน HotelEditModal) bias ผลลัพธ์ให้ใกล้เมืองที่กำลังเลือกอยู่
  useEffect(() => {
    if (skipNextSuggest.current) {
      skipNextSuggest.current = false;
      return;
    }
    if (!query.trim()) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/place-autocomplete?input=${encodeURIComponent(query)}&lat=${bias.lat}&lng=${bias.lng}`,
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
  }, [query]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSuggestOpen(false);
    setStatus("loading");
    try {
      // ส่งพิกัดเมืองไปด้วย = ล็อกผลลัพธ์ให้อยู่ในเมืองนี้ ไม่งั้นพิมพ์ภาษาไทยแล้วได้สถานที่ในไทยขึ้นมา
      const res = await fetch(
        `/api/place-search?query=${encodeURIComponent(query)}&lat=${bias.lat}&lng=${bias.lng}`
      );
      const data = await res.json();
      setResults(data.results ?? []);
      setStatus(data.results?.length ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handlePick(result: SearchResult) {
    setPicked(result);
    setSuggestOpen(false);
    setManualLat(result.lat != null ? String(result.lat) : "");
    setManualLng(result.lng != null ? String(result.lng) : "");
    if (result.lat == null || result.lng == null) setManualOpen(true);
  }

  async function handlePickSuggestion(suggestion: PlaceSuggestion) {
    skipNextSuggest.current = true;
    const label = suggestion.secondaryText
      ? `${suggestion.mainText}, ${suggestion.secondaryText}`
      : suggestion.mainText;
    setQuery(label);
    setSuggestOpen(false);
    setStatus("loading");
    try {
      const res = await fetch(`/api/geocode?placeId=${encodeURIComponent(suggestion.placeId)}`);
      const data = await res.json();
      if (data.lat == null || data.lng == null) {
        setStatus("error");
        return;
      }
      const result: SearchResult = {
        id: suggestion.placeId,
        name: suggestion.mainText,
        formattedAddress: data.formattedAddress ?? suggestion.secondaryText,
        lat: data.lat,
        lng: data.lng,
        photoUrl: null,
      };
      handlePick(result);
      setStatus("idle");
      // เอารูปมาโชว์ด้วยแบบ fire-and-forget ไม่บล็อกการเลือก
      fetch(`/api/place-photos?query=${encodeURIComponent(suggestion.mainText)}`)
        .then((r) => r.json())
        .then((d) => {
          const photoUrl = d.photos?.[0] ?? null;
          if (photoUrl) setPicked((prev) => (prev ? { ...prev, photoUrl } : prev));
        })
        .catch(() => {});
    } catch {
      setStatus("error");
    }
  }

  async function handleConfirm() {
    if (!picked || !category) return;
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const saved = await addCustomPlace({
      added_by: addedBy ?? null,
      city,
      name_th: picked.name,
      name_en: null,
      category,
      lat,
      lng,
      maps_query: picked.name,
      description: picked.formattedAddress,
    });
    // ส่งพิกัดกลับไปด้วยเลย ไม่ให้ผู้เรียกต้อง resolvePlace(saved.id, customPlaces) เอง
    // เพราะ customPlaces state ยังไม่ทันอัปเดตตอนนี้ (รอ realtime echo) จะได้ undefined
    onAdded(saved.id, { lat, lng });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">+ เพิ่มสถานที่เอง</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-ink-soft hover:bg-cream-soft"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
                if (!e.target.value.trim()) {
                  setSuggestions([]);
                  setSuggestOpen(false);
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) setSuggestOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="ค้นหาชื่อสถานที่..."
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || status === "loading"}
              className="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-cream hover:bg-pine-dark disabled:opacity-40"
            >
              {status === "loading" ? "..." : "ค้นหา"}
            </button>
          </div>
        </div>

        {/* ลิสต์ผลลัพธ์อยู่ในกล่อง scroll แยกจาก header — modal เลยสูงคงที่ ไม่ยืด-หดตามจำนวนผลลัพธ์
            และลิสต์คำแนะนำเป็น element ปกติ (ไม่ absolute) จะได้ไม่โดน overflow ของกล่องนี้ตัดหัวตัดท้าย */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          {status === "error" && (
            <p className="py-4 text-center text-sm text-ink-soft">ไม่พบผลลัพธ์ ลองคำค้นอื่น</p>
          )}

          {!picked && suggestOpen && suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-ink-soft">คำแนะนำ</h3>
              {suggestions.map((s) => (
                <button
                  key={s.placeId}
                  type="button"
                  onClick={() => handlePickSuggestion(s)}
                  className="flex w-full items-center gap-3 rounded-xl border border-cream-soft p-2 text-left hover:border-maple/40"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-cream-soft text-ink-soft">
                    📍
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{s.mainText}</div>
                    {s.secondaryText && (
                      <div className="truncate text-xs text-ink-soft">{s.secondaryText}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!picked && !suggestOpen && results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-ink-soft">ผลค้นหา</h3>
              {results.map((r, i) => (
                <button
                  key={`${r.id ?? r.name}-${i}`}
                  onClick={() => handlePick(r)}
                  className="flex w-full items-center gap-3 rounded-xl border border-cream-soft p-2 text-left hover:border-maple/40"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream-soft">
                    {r.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{r.name}</div>
                    {r.formattedAddress && (
                      <div className="truncate text-xs text-ink-soft">{r.formattedAddress}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!picked && status === "idle" && suggestions.length === 0 && results.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-soft">
              พิมพ์ชื่อสถานที่ แล้วเลือกจากลิสต์ที่แนะนำได้เลย
            </p>
          )}

          {picked && (
          <div>
            <button
              onClick={() => {
                setPicked(null);
                setCategory(null);
                if (suggestions.length > 0) setSuggestOpen(true);
              }}
              className="mb-2 text-xs text-ink-soft underline hover:text-ink"
            >
              ← กลับไปเลือกที่อื่น
            </button>
            <div className="flex items-center gap-3">
              {picked.photoUrl && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picked.photoUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{picked.name}</p>
                {picked.formattedAddress && (
                  <p className="truncate text-xs text-ink-soft">{picked.formattedAddress}</p>
                )}
              </div>
            </div>

            <label className="mb-1 mt-3 block text-xs font-medium text-ink-soft">หมวดหมู่</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    category === c
                      ? "bg-maple text-white"
                      : "bg-cream-soft text-ink-soft hover:bg-maple-soft"
                  }`}
                >
                  {CATEGORY_EMOJI[c]} {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>

            <button
              onClick={() => setManualOpen((v) => !v)}
              className="mt-3 text-xs text-ink-soft underline hover:text-ink"
            >
              {manualOpen ? "ซ่อนพิกัด" : "แก้พิกัดเอง (lat, lng)"}
            </button>
            {manualOpen && (
              <div className="mt-2 flex gap-2">
                <input
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="lat"
                  className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
                />
                <input
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="lng"
                  className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
                />
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!category || !manualLat || !manualLng}
              className="mt-5 w-full rounded-xl bg-maple py-3 font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
            >
              เพิ่มสถานที่นี้
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
