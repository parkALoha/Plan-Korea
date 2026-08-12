"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useCustomPlaces } from "@/hooks/useCustomPlaces";
import type { Category, Place } from "@/data/places";
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

export type NearbyKind = "restaurant" | "attraction" | "place";

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
  place: {
    title: "📍 สถานที่ท่องเที่ยว",
    nearbyHeading: "สถานที่แนะนำแถวนี้",
    emptyText: "ไม่พบสถานที่แถวนี้",
    searchPlaceholder: "ค้นหาชื่อสถานที่...",
  },
};

function categoryFor(kind: NearbyKind, r: NearbyResult): Category {
  return kind === "restaurant" ? "restaurant" : categoryFromGoogleType(r.googleType);
}

function resultKey(r: NearbyResult): string {
  return r.id ?? r.name;
}

function resultToPreviewPlace(
  r: NearbyResult,
  city: Place["city"],
  kind: NearbyKind,
): Place | null {
  if (r.lat == null || r.lng == null) return null;
  return {
    id: `preview-${resultKey(r)}`,
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
// kind=restaurant → ร้านอาหารรัศมีแคบ เรียงตามใกล้ / attraction → ที่เที่ยวทั้งเมือง / place → คละทุกประเภทแถวนั้น
// พิมพ์ในช่องค้นหา = ยิง Text Search แบบ debounce ซึ่งคืนข้อมูลชุดเดียวกับลิสต์ใกล้ๆ เป๊ะ
// (รูป/เรทติ้ง/พิกัด/ประเภท) เลยเรนเดอร์ด้วย ResultRow ตัวเดียวกันได้ ทั้งคู่จำกัดผลลัพธ์ไว้ในเมืองนั้น
// กดที่การ์ดเพื่อดูรายละเอียด (เรทติ้ง/รีวิว/เวลาเปิด-ปิด/รูป) ก่อนตัดสินใจเพิ่มได้
export function NearbyPlacesModal({
  kind = "restaurant",
  city,
  center,
  addedBy,
  onClose,
  onAdded,
  onAddedToLibrary,
}: {
  kind?: NearbyKind;
  city: Place["city"];
  center: { lat: number; lng: number };
  addedBy?: string;
  onClose: () => void;
  onAdded: (placeId: string, coords: { lat: number; lng: number }) => void;
  /** ไม่ส่งมา = ซ่อนปุ่ม "ลงคลัง" (เช่น flow แทรกจุดแวะในตาราง ที่ต้องการลงแผนตรงตำแหน่งเท่านั้น) */
  onAddedToLibrary?: () => void;
}) {
  const config = KIND_CONFIG[kind];
  const { addCustomPlace } = useCustomPlaces();

  const [fetched, setFetched] = useState<{
    key: string;
    results: NearbyResult[];
  } | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  // modal ไม่ปิดตอนกด "ลงคลัง" (ให้เพิ่มหลายที่รวดได้) เลยต้องจำว่าแถวไหนเพิ่มไปแล้ว
  // sidebar เห็นการ์ดใหม่ผ่าน realtime echo อีกทาง ซึ่งช้ากว่าที่ผู้ใช้จะกดซ้ำ
  const [libraryKeys, setLibraryKeys] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<NearbyResult | null>(null);
  const centerKey = `${center.lat},${center.lng}`;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchResults, setSearchResults] = useState<NearbyResult[] | null>(null);

  // พิมพ์แล้วค้นเลยแบบ debounce 400ms — ไม่ใช้ Autocomplete API เพราะมันคืนแค่ชื่อ (ไม่มีรูป/เรทติ้ง/พิกัด)
  // ทำให้ลิสต์หน้าตาไม่เหมือนลิสต์ใกล้ๆ แถมยังแมตช์ชื่อจังหวัด/แม่น้ำปนมาด้วย ส่วน Text Search
  // คืน shape เดียวกับ /api/place-nearby และมี cache 30 วันอยู่แล้ว
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchStatus("loading");
      try {
        // ส่งพิกัดไปด้วย = ล็อกผลลัพธ์ให้อยู่ในเมืองนี้เท่านั้น (พิมพ์ไทยแล้วไม่ได้ร้านในไทยขึ้นมา)
        const res = await fetch(
          `/api/place-search?query=${encodeURIComponent(q)}&lat=${center.lat}&lng=${center.lng}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        setSearchResults(data.results ?? []);
        setSearchStatus(data.results?.length ? "idle" : "error");
      } catch {
        // ยกเลิกจากการพิมพ์ต่อ (AbortError) ไม่ต้องทำอะไร
      }
    }, 400);
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

  function clearSearch() {
    setSearchQuery("");
    setSearchResults(null);
    setSearchStatus("idle");
  }

  // บันทึกเข้าคลังก่อนเสมอ (ทั้ง 2 ปุ่มต้องมีสถานที่นี้ในคลัง) แล้วคืน id + พิกัดให้ผู้เรียกตัดสินใจต่อ
  async function saveToLibrary(result: NearbyResult) {
    if (result.lat == null || result.lng == null) return null;
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
    return { id: saved.id, coords: { lat: result.lat, lng: result.lng } };
  }

  async function handleAddToPlan(result: NearbyResult) {
    setAddingKey(resultKey(result));
    const saved = await saveToLibrary(result);
    if (!saved) return;
    // ส่งพิกัดกลับไปด้วยเลย ไม่ให้ผู้เรียกต้อง resolvePlace(saved.id, customPlaces) เอง
    // เพราะ customPlaces state ยังไม่ทันอัปเดตตอนนี้ (รอ realtime echo) จะได้ undefined
    onAdded(saved.id, saved.coords);
    onClose();
  }

  async function handleAddToLibrary(result: NearbyResult) {
    const key = resultKey(result);
    setAddingKey(key);
    const saved = await saveToLibrary(result);
    setAddingKey(null);
    if (!saved) return;
    setLibraryKeys((prev) => new Set(prev).add(key));
    onAddedToLibrary?.();
  }

  function ResultRow({ r }: { r: NearbyResult }) {
    const key = resultKey(r);
    const inLibrary = libraryKeys.has(key);
    const busy = addingKey === key;
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
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={() => handleAddToPlan(r)}
            disabled={addingKey != null}
            className="rounded-lg bg-maple px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-maple-dark disabled:opacity-40"
          >
            + ลงแผน
          </button>
          {onAddedToLibrary && (
            <button
              onClick={() => handleAddToLibrary(r)}
              disabled={addingKey != null || inLibrary}
              className="rounded-lg border border-maple/40 px-2.5 py-1 text-[11px] font-semibold text-maple-dark hover:bg-maple-soft disabled:opacity-40"
            >
              {inLibrary ? "✓ เพิ่มแล้ว" : busy ? "..." : "+ ลงคลัง"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const previewPlace = previewResult
    ? resultToPreviewPlace(previewResult, city, kind)
    : null;

  return (
    <>
      {/* หัว modal อยู่นิ่ง ลิสต์เลื่อนในกล่องข้างล่าง — ความสูง modal เลยคงที่ ไม่ยืดตามจำนวนผลลัพธ์ */}
      <Modal
        onClose={onClose}
        title={config.title}
        bodyClassName="pb-5"
        headerExtra={
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) {
                  setSearchResults(null);
                  setSearchStatus("idle");
                }
              }}
              placeholder={config.searchPlaceholder}
              className="w-full rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
            />
            {searchQuery.trim() && (
              <button
                onClick={clearSearch}
                aria-label="ล้างคำค้นหา"
                className="shrink-0 rounded-lg bg-cream-soft px-3 py-2 text-sm font-medium text-ink-soft hover:bg-maple-soft hover:text-maple-dark"
              >
                ✕
              </button>
            )}
          </div>
        }
      >
      {searchResults != null && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink-soft">
              ผลค้นหา &quot;{searchQuery}&quot;
            </h3>
            <button
              onClick={clearSearch}
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
              <ResultRow key={`${resultKey(r)}-${i}`} r={r} />
            ))}
          </div>
        </div>
      )}

      {searchResults == null && (
        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold text-ink-soft">
            {searchStatus === "loading" ? "กำลังค้นหา..." : config.nearbyHeading}
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
                <ResultRow key={`${resultKey(r)}-${i}`} r={r} />
              ))}
            </div>
          )}
        </div>
      )}
      </Modal>

      {previewPlace && (
        <PlaceDetailModal
          place={previewPlace}
          previousPlace={null}
          hotel={null}
          onClose={() => setPreviewResult(null)}
          onConfirm={() => {
            if (previewResult) handleAddToPlan(previewResult);
          }}
        />
      )}
    </>
  );
}
