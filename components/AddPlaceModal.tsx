"use client";

import { useState } from "react";
import { CATEGORY_EMOJI, CATEGORY_LABEL, Category, Place } from "@/data/places";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";

type SearchResult = {
  id: string | null;
  name: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
};

const CATEGORIES: Category[] = [
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
  onAdded: (placeId: string) => void;
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

  async function handleSearch() {
    if (!query.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/place-search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setStatus(data.results?.length ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handlePick(result: SearchResult) {
    setPicked(result);
    setManualLat(result.lat != null ? String(result.lat) : "");
    setManualLng(result.lng != null ? String(result.lng) : "");
    if (result.lat == null || result.lng == null) setManualOpen(true);
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
    onAdded(saved.id);
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
            onChange={(e) => setQuery(e.target.value)}
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

        {status === "error" && (
          <p className="mt-2 text-xs text-maple-dark">ไม่พบผลลัพธ์ ลองคำค้นอื่น</p>
        )}

        {!picked && results.length > 0 && (
          <div className="mt-3 space-y-2">
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

        {picked && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-ink">{picked.name}</p>
            {picked.formattedAddress && (
              <p className="text-xs text-ink-soft">{picked.formattedAddress}</p>
            )}

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
  );
}
