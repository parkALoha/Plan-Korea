"use client";

import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import type { Category, Place } from "@/data/places";
import type { PlaceSuggestion } from "@/lib/googlePlaces";
import { categoryFromGoogleType } from "@/lib/placeCategory";
import { PlaceDetailModal } from "./PlaceDetailModal";

type NearbyResult = {
  id: string | null;
  name: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
  rating: number | null;
  userRatingCount: number | null;
  /** ประเภทดิบจาก Google (เช่น museum, beach) ใช้เดาหมวดหมู่ตอนเพิ่มเข้าคลัง */
  googleType: string | null;
  /** ชื่อประเภทที่แปลแล้ว ใช้โชว์บนการ์ด */
  primaryType: string | null;
};

export type NearbyKind = "restaurant" | "attraction";

const KIND_CONFIG: Record<
  NearbyKind,
  { title: string; nearbyHeading: string; emptyText: string; searchPlaceholder: string }
> = {
  restaurant: {
    title: "🍽️ ร้านอาหารใกล้ๆ",
    nearbyHeading: "ร้านใกล้จุดล่าสุดของวันนี้",
    emptyText: "ไม่พบร้านอาหารใกล้จุดนี้",
    searchPlaceholder: "หรือค้นหาชื่อร้านที่รู้อยู่แล้ว...",
  },
  attraction: {
    title: "🎡 ที่เที่ยวในเมืองนี้",
    nearbyHeading: "ที่เที่ยวยอดนิยมแถวนี้ (เรียงตามความนิยม)",
    emptyText: "ไม่พบที่เที่ยวแถวนี้",
    searchPlaceholder: "หรือค้นหาชื่อที่เที่ยวที่รู้อยู่แล้ว...",
  },
};

function categoryFor(kind: NearbyKind, r: NearbyResult): Category {
  return kind === "restaurant" ? "restaurant" : categoryFromGoogleType(r.googleType);
}

function resultToPreviewPlace(
  r: NearbyResult,
  city: Place["city"],
  kind: NearbyKind,
): Place | null {
  if (r.lat == null || r.lng == null) return null;
  return {
    id: `preview-${r.id ?? r.name}`,
    nameTh: r.name,
    nameEn: r.name,
    city,
    category: categoryFor(kind, r),
    descriptionTh: r.formattedAddress ?? "",
    lat: r.lat,
    lng: r.lng,
    mapsQuery: r.name,
    youtubeQuery: r.name,
  };
}

// ค้นหาสถานที่รอบจุดอ้างอิงของวันนั้น (จุดแวะล่าสุด → ที่พัก → กลางเมือง) ด้วย Nearby Search (New)
// kind=restaurant → ร้านอาหารรัศมีแคบ เรียงตามใกล้ / kind=attraction → ที่เที่ยวทั้งเมือง เรียงตามความนิยม
// มีช่องค้นหาด้วยชื่อ (พร้อมเติมคำอัตโนมัติ) เผื่อรู้ชื่อเป๊ะๆ อยู่แล้ว — ทั้งคู่จำกัดผลลัพธ์ไว้ในเมืองนั้น
// กดที่การ์ดเพื่อดูรายละเอียด (เรทติ้ง/รีวิว/เวลาเปิด-ปิด/รูป) ก่อนตัดสินใจเพิ่มได้
export function NearbyPlacesModal({
  kind = "restaurant",
  city,
  center,
  addedBy,
  onClose,
  onAdded,
}: {
  kind?: NearbyKind;
  city: Place["city"];
  center: { lat: number; lng: number };
  addedBy?: string;
  onClose: () => void;
  onAdded: (placeId: string, coords: { lat: number; lng: number }) => void;
}) {
  const config = KIND_CONFIG[kind];
  useBodyScrollLock();
  const { addCustomPlace } = useCustomPlaces();

  const [fetched, setFetched] = useState<{
    key: string;
    results: NearbyResult[];
  } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<NearbyResult | null>(null);
  const centerKey = `${center.lat},${center.lng}`;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [searchResults, setSearchResults] = useState<NearbyResult[] | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipNextSuggest = useRef(false);

  // เติมคำ/คาดเดาชื่อร้านแบบ debounce 300ms เหมือนใน "เพิ่มสถานที่เอง"
  // bias ไปที่จุดศูนย์กลางที่ใช้หาร้านใกล้ๆ อยู่แล้ว ผลลัพธ์เลยเป็นร้านแถวนั้นก่อน
  useEffect(() => {
    if (skipNextSuggest.current) {
      skipNextSuggest.current = false;
      return;
    }
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/place-autocomplete?input=${encodeURIComponent(searchQuery)}&lat=${center.lat}&lng=${center.lng}`,
          { signal: controller.signal },
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
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place-nearby?lat=${center.lat}&lng=${center.lng}&kind=${kind}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled)
          setFetched({ key: centerKey, results: d.results ?? [] });
      })
      .catch(() => {
        if (!cancelled) setFetched({ key: centerKey, results: [] });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  const nearbyResults = fetched?.key === centerKey ? fetched.results : [];
  const nearbyStatus: "loading" | "idle" | "error" =
    fetched?.key !== centerKey
      ? "loading"
      : nearbyResults.length
        ? "idle"
        : "error";

  async function handleSearch(queryOverride?: string) {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setSuggestOpen(false);
    setSearchStatus("loading");
    try {
      // ส่งพิกัดไปด้วย = ล็อกผลลัพธ์ให้อยู่ในเมืองนี้เท่านั้น (พิมพ์ไทยแล้วไม่ได้ร้านในไทยขึ้นมา)
      const res = await fetch(
        `/api/place-search?query=${encodeURIComponent(q)}&lat=${center.lat}&lng=${center.lng}`,
      );
      const data = await res.json();
      setSearchResults(data.results ?? []);
      setSearchStatus(data.results?.length ? "idle" : "error");
    } catch {
      setSearchStatus("error");
    }
  }

  // เลือกจากลิสต์คำแนะนำ = ยิง text search ด้วยชื่อเต็มของร้านนั้น จะได้รูป/เรทติ้ง/รีวิวมาครบเหมือนผลค้นหาปกติ
  function handlePickSuggestion(suggestion: PlaceSuggestion) {
    skipNextSuggest.current = true;
    const label = suggestion.secondaryText
      ? `${suggestion.mainText}, ${suggestion.secondaryText}`
      : suggestion.mainText;
    setSearchQuery(label);
    setSuggestions([]);
    handleSearch(label);
  }

  async function handleAdd(result: NearbyResult) {
    if (result.lat == null || result.lng == null) return;
    setAddingId(result.id ?? result.name);
    const saved = await addCustomPlace({
      added_by: addedBy ?? null,
      city,
      name_th: result.name,
      name_en: null,
      category: categoryFor(kind, result),
      lat: result.lat,
      lng: result.lng,
      maps_query: result.name,
      description: result.formattedAddress,
    });
    // ส่งพิกัดกลับไปด้วยเลย ไม่ให้ผู้เรียกต้อง resolvePlace(saved.id, customPlaces) เอง
    // เพราะ customPlaces state ยังไม่ทันอัปเดตตอนนี้ (รอ realtime echo) จะได้ undefined
    onAdded(saved.id, { lat: result.lat, lng: result.lng });
    onClose();
  }

  function ResultRow({ r }: { r: NearbyResult }) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-cream-soft p-2">
        <button
          onClick={() => setPreviewResult(r)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream-soft">
            {r.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink hover:underline">
              {r.name}
            </div>
            {(r.rating != null || r.primaryType) && (
              <div className="truncate text-xs text-maple-dark">
                {r.rating != null && `⭐ ${r.rating.toFixed(1)}`}
                {r.userRatingCount != null && ` (${r.userRatingCount})`}
                {r.primaryType && ` · ${r.primaryType}`}
              </div>
            )}
            {r.formattedAddress && (
              <div className="truncate text-xs text-ink-soft">
                {r.formattedAddress}
              </div>
            )}
          </div>
        </button>
        <button
          onClick={() => handleAdd(r)}
          disabled={addingId != null}
          className="shrink-0 rounded-lg bg-maple px-3 py-1.5 text-xs font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
        >
          + เพิ่ม
        </button>
      </div>
    );
  }

  const previewPlace = previewResult
    ? resultToPreviewPlace(previewResult, city, kind)
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* หัว modal อยู่นิ่ง ลิสต์เลื่อนในกล่องข้างล่าง — ความสูง modal เลยคงที่ ไม่ยืดตามจำนวนผลลัพธ์ */}
          <div className="shrink-0 px-5 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">{config.title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-ink-soft hover:bg-cream-soft"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setSuggestOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder={config.searchPlaceholder}
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            <button
              onClick={() => handleSearch()}
              disabled={!searchQuery.trim() || searchStatus === "loading"}
              className="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-cream hover:bg-pine-dark disabled:opacity-40"
            >
              {searchStatus === "loading" ? "..." : "ค้นหา"}
            </button>
          </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {suggestOpen && suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
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

          {!suggestOpen && searchResults != null && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-ink-soft">
                  ผลค้นหา &quot;{searchQuery}&quot;
                </h3>
                <button
                  onClick={() => {
                    setSearchResults(null);
                    setSearchQuery("");
                    skipNextSuggest.current = true;
                    setSuggestions([]);
                    setSuggestOpen(false);
                  }}
                  className="text-xs text-ink-soft underline hover:text-ink"
                >
                  ← กลับไปดูลิสต์แนะนำ
                </button>
              </div>
              {searchStatus === "error" && (
                <p className="py-4 text-center text-sm text-ink-soft">
                  ไม่พบผลลัพธ์ ลองคำค้นอื่น
                </p>
              )}
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <ResultRow key={`${r.id ?? r.name}-${i}`} r={r} />
                ))}
              </div>
            </div>
          )}

          {!suggestOpen && searchResults == null && (
            <div className="mt-3">
              <h3 className="mb-1.5 text-xs font-semibold text-ink-soft">
                {config.nearbyHeading}
              </h3>
              {nearbyStatus === "loading" && (
                <p className="py-6 text-center text-sm text-ink-soft">
                  กำลังค้นหา...
                </p>
              )}
              {nearbyStatus === "error" && (
                <p className="py-6 text-center text-sm text-ink-soft">
                  {config.emptyText}
                </p>
              )}
              {nearbyStatus === "idle" && (
                <div className="space-y-2">
                  {nearbyResults.map((r, i) => (
                    <ResultRow key={`${r.id ?? r.name}-${i}`} r={r} />
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {previewPlace && (
        <PlaceDetailModal
          place={previewPlace}
          previousPlace={null}
          hotel={null}
          onClose={() => setPreviewResult(null)}
          onConfirm={() => {
            if (previewResult) handleAdd(previewResult);
          }}
        />
      )}
    </>
  );
}
