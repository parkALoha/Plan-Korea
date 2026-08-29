"use client";

import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, CATEGORY_LABEL, Category, Place, cityCenter, placesByCity } from "@/data/places";
import { cityMetaOf, cityNameThOf } from "@/components/cityMeta";
import type { Day } from "@/data/itinerary";
import type { CustomPlace, PlaceNote, TripHotel } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCatalogPlaces } from "@/hooks/useCatalogPlaces";
import type { CatalogCity } from "@/hooks/useTripCatalogCities";
import { useDismissable } from "@/hooks/useDismissable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PlaceCard } from "./PlaceCard";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { NearbyPlacesModal, type NearbyKind } from "./NearbyPlacesModal";

const CATEGORY_ORDER: Category[] = [
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

type PlaceCardProps = {
  place: Place;
  isCustom?: boolean;
  distanceLabel?: string | null;
  dayDate?: string;
  stashedNote?: PlaceNote | null;
  onClick: () => void;
  onHide?: () => void;
  onAdd?: () => void;
};

/** การ์ดในคลัง — ลากออกไปวางในแพลนทริปได้ (data.type "place" ให้ handleDragEnd ที่ app/page.tsx อ่านต่อ)
 *  หรือกดปุ่ม + บนการ์ดตรงๆ ก็เพิ่มเข้าวันที่โฟกัสอยู่ได้เลย ไม่ต้องเปิดโมดัลก่อน */
function DraggablePlaceCard({ place, ...cardProps }: PlaceCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib-${place.id}`,
    data: { type: "place", placeId: place.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="touch-none"
    >
      <PlaceCard place={place} {...cardProps} />
    </div>
  );
}

function customPlaceToPlace(cp: CustomPlace): Place {
  return {
    id: cp.id,
    nameTh: cp.name_th,
    nameEn: cp.name_en ?? cp.name_th,
    city: cp.city as Place["city"],
    category: cp.category as Place["category"],
    descriptionTh: cp.description ?? "",
    lat: cp.lat,
    lng: cp.lng,
    mapsQuery: cp.maps_query,
    googlePlaceId: cp.google_place_id ?? null,
    youtubeQuery: cp.name_th,
  };
}

type SidebarProps = {
  itinerary: Day[];
  customPlaces: CustomPlace[];
  who?: string;
  lastStopPlaceForDay: (dayId: string) => Place | null;
  hotelForDay: (dayId: string) => TripHotel | null;
  /** coords ส่งมาเฉพาะตอนเพิ่มสถานที่ที่เพิ่งสร้างใหม่ (custom place) — เอาไว้เดาโหมดเดินทางเริ่มต้นได้ทันที
   *  โดยไม่ต้อง resolvePlace(placeId, customPlaces) เอง ซึ่ง state ยังไม่ทันอัปเดตตอนนั้น (รอ realtime echo) */
  onAddStopToDay: (dayId: string, placeId: string, coords?: { lat: number; lng: number }) => void;
  /** โน้ต/รูปที่ฝากไว้กับสถานที่ในคลัง คีย์ด้วย place id (เฟส 22) — ว่างเปล่าเมื่อยังไม่ได้รัน migration 0028 */
  placeNotes: Record<string, PlaceNote>;
  /** id ของสถานที่ที่ถูกเพิ่มลงวันไหนก็ได้ในเมืองนี้แล้ว (ไม่ต้องโชว์ให้เลือกซ้ำ) */
  selectedPlaceIdsForCity: (city: Day["city"]) => Set<string>;
  /** เวอร์ชันคีย์ด้วย `catalog_cities.id` — ใช้เฉพาะโหมดคลัง · เหตุผลอยู่ที่ตัวสร้างใน `TripPlanScreen` */
  selectedPlaceIdsForCatalogCity?: (cityId: string) => Set<string>;
  hiddenPlaceIds: Set<string>;
  onHidePlace: (placeId: string) => void;
  onUnhidePlace: (placeId: string) => void;
  /**
   * เมืองปลายทางของทริปจากคลังในฐาน (`trip_destinations`) — `B6` เฟส 1
   *
   * 🔴 **ไม่ส่ง/ว่าง = ทริปเกาหลีเดิม → เดินทางเดิมทุกบรรทัด ไม่มีอะไรเปลี่ยน**
   * มีค่า = ทริปที่สร้างบนแพลตฟอร์ม → แท็บเมืองและคลังสถานที่มาจากฐาน ไม่ใช่ `data/places.ts`
   * · แยกด้วย *ข้อมูลของทริปเอง* ไม่ใช่เทียบวันที่กับไฟล์เดิม (เหตุผลอยู่ใน `useTripCatalogCities`)
   */
  catalogCities?: CatalogCity[];
  /** เมือง/วันที่โฟกัสอยู่ตอนนี้ — คุมจาก app/page.tsx เพื่อให้ปุ่ม "+" ในแต่ละวันสั่งโฟกัสมาที่ sidebar ได้ */
  activeCity: Day["city"];
  onActiveCityChange: (city: Day["city"]) => void;
  focusedDayId: string;
  onFocusedDayIdChange: (dayId: string) => void;
};

/** draggable=false = คลังบนมือถือ (bottom sheet) — การ์ดลากไม่ได้ เพราะ dnd-kit ต้องใส่ touch-action:none
 *  บนการ์ดทุกใบ ทำให้เลื่อนดูคลังด้วยนิ้วไม่ได้เลย (นิ้วโดนตีความเป็น "เริ่มลาก") มือถือมีปุ่ม "+ เพิ่มลงวันนี้"
 *  บนการ์ดอยู่แล้ว เลยไม่เสียฟีเจอร์อะไร ส่วนจอใหญ่ยังลากได้ตามเดิม */
function PlaceSidebarContent({
  draggable,
  itinerary,
  customPlaces,
  who,
  lastStopPlaceForDay,
  hotelForDay,
  onAddStopToDay,
  placeNotes,
  selectedPlaceIdsForCity,
  selectedPlaceIdsForCatalogCity,
  hiddenPlaceIds,
  onHidePlace,
  onUnhidePlace,
  catalogCities,
  activeCity,
  onActiveCityChange,
  focusedDayId,
  onFocusedDayIdChange,
}: SidebarProps & { draggable: boolean }) {
  const cities = useMemo(() => {
    const seen = new Set<Day["city"]>();
    const list: Day["city"][] = [];
    for (const day of itinerary) {
      if (!seen.has(day.city)) {
        seen.add(day.city);
        list.push(day.city);
      }
    }
    return list;
  }, [itinerary]);

  const daysForCity = useMemo(
    () => itinerary.filter((d) => d.city === activeCity),
    [itinerary, activeCity]
  );
  const [hiddenOpen, setHiddenOpen] = useState(false);

  function selectCity(city: Day["city"]) {
    onActiveCityChange(city);
    const firstDay = itinerary.find((d) => d.city === city);
    if (firstDay) onFocusedDayIdChange(firstDay.id);
  }

  // ── `B6` เฟส 1 · โหมดคลังจากฐาน (เฉพาะทริปที่มีเมืองปลายทาง) ─────────────────────────
  // 🔴 โหมดนี้ **ไม่แตะ state เดิมของทริปเกาหลีเลย** — เก็บเมืองที่เลือกไว้ใน state ของตัวเอง
  //    เพราะ `activeCity` ข้างนอกเป็น union 6 ค่า ใส่ uuid ของเมืองในคลังลงไปไม่ได้
  const catalogMode = (catalogCities?.length ?? 0) > 0;
  const [activeCatalogCityId, setActiveCatalogCityId] = useState<string | null>(null);
  const currentCatalogCityId = catalogMode
    ? (activeCatalogCityId ?? catalogCities![0].id)
    : null;
  const catalogPlaces = useCatalogPlaces(currentCatalogCityId);
  /** ชื่อเมืองที่กำลังดูอยู่ — ต้องผ่านตัวนี้เสมอ ไม่ใช่ `CITY_NAME_TH[activeCity]` ตรง ๆ
   *  ไม่งั้นโหมดคลังจะโชว์ชื่อเมืองเกาหลีค้างอยู่ ทั้งที่การ์ดข้างล่างเป็นของอีกเมือง */
  const displayCityNameTh = catalogMode
    ? (catalogCities!.find((c) => c.id === currentCatalogCityId)?.nameTh ?? "")
    : cityNameThOf(activeCity);

  // ห่อ useMemo เพราะค่ากลายเป็นเงื่อนไข — ถ้าปล่อยเป็นนิพจน์ลอย React Compiler จะรักษา memo ของ
  // `groupedVisibleCards` ที่ต่อจากมันไม่ได้ แล้วทั้งคอมโพเนนต์จะหลุดการ optimize (eslint จับให้)
  const allCardsForCity: { place: Place; isCustom: boolean }[] = useMemo(
    () =>
      catalogMode
        ? catalogPlaces.status === "ready"
          ? catalogPlaces.places.map((p) => ({ place: p, isCustom: false }))
          : []
        : [
            ...placesByCity(activeCity).map((p) => ({ place: p, isCustom: false })),
            ...customPlaces
              .filter((p) => p.city === activeCity)
              .map((p) => ({ place: customPlaceToPlace(p), isCustom: true })),
          ],
    [catalogMode, catalogPlaces, activeCity, customPlaces]
  );

  // 🔴 โหมดคลังต้องถามด้วย **id ของเมืองในคลัง** ไม่ใช่ `activeCity` ซึ่งยังเป็นเมืองเกาหลีค้างอยู่เสมอ
  //    (ถามผิดใบ = สถานที่ที่เพิ่มไปแล้วยังโผล่ให้เลือกซ้ำ โดยไม่มีอะไรฟ้อง)
  const selectedIds =
    catalogMode && currentCatalogCityId && selectedPlaceIdsForCatalogCity
      ? selectedPlaceIdsForCatalogCity(currentCatalogCityId)
      : selectedPlaceIdsForCity(activeCity);
  const visibleCards = allCardsForCity.filter(
    ({ place }) => !selectedIds.has(place.id) && !hiddenPlaceIds.has(place.id)
  );
  const hiddenCards = allCardsForCity.filter(({ place }) => hiddenPlaceIds.has(place.id));

  // จัดคลังเป็นหมวดๆ (วัฒนธรรม/ธรรมชาติ/ตลาด-ของกิน ฯลฯ) แทนที่จะโชว์รวมกันเป็น grid เดียว
  const groupedVisibleCards = useMemo(() => {
    const byCategory = new Map<Category, { place: Place; isCustom: boolean }[]>();
    for (const card of visibleCards) {
      const list = byCategory.get(card.place.category) ?? [];
      list.push(card);
      byCategory.set(card.place.category, list);
    }
    return CATEGORY_ORDER.map((category) => ({
      category,
      cards: byCategory.get(category) ?? [],
    })).filter((group) => group.cards.length > 0);
  }, [visibleCards]);

  // droppable ของคลังทั้งก้อน — ลากจุดแวะจากแพลนทริปมาปล่อยตรงนี้ = คืนสถานที่นั้นกลับคลัง (เอาออกจากวัน)
  const { setNodeRef: setLibraryDroppableRef, isOver: isLibraryOver } = useDroppable({
    id: "library",
    data: { type: "library" },
  });

  // ระยะห่างบนการ์ด: อ้างอิงจากจุดสุดท้ายที่เลือกไว้ในวันที่โฟกัสอยู่ ถ้ายังไม่มีจุดไหนเลยก็อ้างอิงจากที่พักแทน
  const referencePlace = lastStopPlaceForDay(focusedDayId);
  const referenceHotel = referencePlace ? null : hotelForDay(focusedDayId);

  function distanceLabelFor(place: Place): string | null {
    if (referencePlace) {
      return `${haversineKm(referencePlace.lat, referencePlace.lng, place.lat, place.lng).toFixed(1)} กม. จากจุดก่อนหน้า`;
    }
    if (referenceHotel) {
      return `${haversineKm(referenceHotel.lat, referenceHotel.lng, place.lat, place.lng).toFixed(1)} กม. จากที่พัก`;
    }
    return null;
  }

  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [nearbyKind, setNearbyKind] = useState<NearbyKind | null>(null);
  const focusedDayDate = itinerary.find((d) => d.id === focusedDayId)?.date;
  // ศูนย์กลางค้นหาร้านอาหารใกล้ๆ: จุดแวะล่าสุดของวันที่โฟกัส > ที่พัก > จุดกึ่งกลางเมือง
  const nearbyCenter = referencePlace ?? referenceHotel ?? cityCenter(activeCity);

  return (
    // min-h-0 + flex-1 สำคัญ: ในชีตมือถือความสูงมาจาก flex ไม่ใช่ค่าตายตัว h-full เลยคำนวณไม่ได้
    // ก้อนนี้จะสูงตามเนื้อหา (3000px+) ทะลุออกนอกชีตแล้วโดน overflow-hidden ตัดทิ้ง = เลื่อนดูไม่ได้
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line p-3">
        {/* 🔴 โหมดคลังจากฐาน: ไม่มี CITY_META/CITY_NAME_TH ให้ใช้ (ตารางพวกนั้นคีย์ด้วย union 6 ค่า)
            → ใช้ชื่อไทยจากฐานตรง ๆ + สีแบรนด์กลาง แทนสีประจำเมืองที่ยังไม่มีในคลัง */}
        {catalogMode
          ? catalogCities!.map((c) => {
              const active = c.id === currentCatalogCityId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCatalogCityId(c.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-maple text-white" : "bg-surface-soft text-content-soft hover:bg-maple-soft"
                  }`}
                >
                  {c.nameTh}
                </button>
              );
            })
          : cities.map((city) => {
          const meta = cityMetaOf(city);
          const active = city === activeCity;
          return (
            <button
              key={city}
              onClick={() => selectCity(city)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                active ? "text-white" : "bg-surface-soft text-content-soft hover:bg-maple-soft"
              }`}
              style={active ? { backgroundColor: meta.color } : undefined}
            >
              {meta.icon} {cityNameThOf(city)}
            </button>
          );
        })}
      </div>

      {daysForCity.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
          {daysForCity.map((day) => (
            <button
              key={day.id}
              onClick={() => onFocusedDayIdChange(day.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                day.id === focusedDayId
                  ? "bg-pine text-cream"
                  : "bg-surface-soft text-content-soft hover:bg-pine-soft"
              }`}
            >
              {new Date(day.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
            </button>
          ))}
        </div>
      )}

      <div
        ref={setLibraryDroppableRef}
        className={`flex-1 overflow-y-auto p-3 transition-colors ${
          isLibraryOver ? "bg-pine-soft/50 ring-2 ring-inset ring-pine" : ""
        }`}
      >
        <div className="mb-3 space-y-2">
          <button
            onClick={() => setNearbyKind("attraction")}
            className="w-full rounded-xl border border-dashed border-maple/50 py-2 text-sm font-medium text-maple hover:bg-maple-soft/40"
          >
            🎡 ที่เที่ยวยอดนิยมใน{displayCityNameTh}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setNearbyKind("place")}
              className="flex-1 rounded-xl border border-dashed border-content-soft/30 py-2 text-sm text-content-soft hover:border-maple hover:text-maple"
            >
              สถานที่ท่องเที่ยว
            </button>
            <button
              onClick={() => setNearbyKind("restaurant")}
              className="flex-1 rounded-xl border border-dashed border-content-soft/30 py-2 text-sm text-content-soft hover:border-maple hover:text-maple"
            >
              🍽️ ร้านใกล้ๆ
            </button>
          </div>
        </div>

        {visibleCards.length === 0 && (
          <div className="py-6 text-center text-xs text-content-soft">
            เลือกครบทุกที่ในโซนนี้แล้ว 🎉
          </div>
        )}
        {groupedVisibleCards.map(({ category, cards }) => (
          <div key={category} className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold text-content-soft">
              {CATEGORY_EMOJI[category]} {CATEGORY_LABEL[category]}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {cards.map(({ place, isCustom }) => {
                const Card = draggable ? DraggablePlaceCard : PlaceCard;
                return (
                  <Card
                    key={place.id}
                    place={place}
                    isCustom={isCustom}
                    distanceLabel={distanceLabelFor(place)}
                    dayDate={focusedDayDate}
                    stashedNote={placeNotes[place.id] ?? null}
                    onClick={() => setDetailPlace(place)}
                    onHide={() => onHidePlace(place.id)}
                    onAdd={() => onAddStopToDay(focusedDayId, place.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {hiddenCards.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <button
              onClick={() => setHiddenOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-content-soft hover:text-content"
            >
              <span>🙈 ซ่อนไว้ ({hiddenCards.length})</span>
              <span>{hiddenOpen ? "▲" : "▼"}</span>
            </button>
            {hiddenOpen && (
              <div className="mt-2 space-y-1.5">
                {hiddenCards.map(({ place }) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate text-content-soft">{place.nameTh}</span>
                    <button
                      onClick={() => onUnhidePlace(place.id)}
                      className="shrink-0 font-medium text-pine-dark hover:underline"
                    >
                      กู้คืน
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {detailPlace && (
        <PlaceDetailModal
          place={detailPlace}
          previousPlace={lastStopPlaceForDay(focusedDayId)}
          hotel={hotelForDay(focusedDayId)}
          userNote={placeNotes[detailPlace.id]?.note}
          userPhotoUrl={placeNotes[detailPlace.id]?.photo_url}
          onClose={() => setDetailPlace(null)}
          onConfirm={() => {
            onAddStopToDay(focusedDayId, detailPlace.id);
            setDetailPlace(null);
          }}
        />
      )}

      {nearbyKind && (
        <NearbyPlacesModal
          kind={nearbyKind}
          city={activeCity}
          // ที่เที่ยวมองทั้งเมือง เลยอิงกลางเมืองเสมอ ไม่ให้ผลลัพธ์เอียงไปตามจุดแวะล่าสุด
          // ส่วนร้านอาหาร/สถานที่แนะนำอิงจุดแวะล่าสุดของวันนั้น เพราะต้องการที่ที่เดินต่อจากจุดนั้นได้
          center={nearbyKind === "attraction" ? cityCenter(activeCity) : nearbyCenter}
          addedBy={who}
          onClose={() => setNearbyKind(null)}
          onAdded={(placeId, coords) => onAddStopToDay(focusedDayId, placeId, coords)}
          // เพิ่มเข้าคลังเฉยๆ ไม่ลงตาราง — การ์ดโผล่ในคลังเองผ่าน realtime echo ของ customPlaces
          onAddedToLibrary={() => {}}
        />
      )}
    </div>
  );
}

/** คลังสถานที่บนมือถือ — bottom sheet เลื่อนขึ้นจากขอบล่าง (ไม่คลุมทั้งจอเหมือน overlay เดิม)
 *  หัวชีตโชว์เมือง+วันที่กำลังโฟกัสอยู่ตลอด กันหลงว่ากำลังเพิ่มสถานที่ให้วันไหน
 *  แตะฉากหลัง (backdrop) เพื่อปิดได้ */
function BottomSheet({
  children,
  onClose,
  title,
  subtitle,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  subtitle?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBodyScrollLock();
  // Esc ปิด / โฟกัสวนอยู่ในชีต / คืนโฟกัสให้ปุ่ม "📍 สถานที่" ตอนปิด — ชุดเดียวกับที่ Modal ใช้ (เฟส 20.1)
  useDismissable(sheetRef, onClose);
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="animate-sheet-backdrop absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet-up absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface-raised shadow-2xl shadow-ink/30 outline-none"
      >
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-10 rounded-full bg-surface-soft" />
        </div>
        <div className="flex items-center justify-between border-b border-line px-4 pb-3 pt-2">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-bold text-content">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-content-soft">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดคลังสถานที่"
            className="shrink-0 rounded-full p-2 text-content-soft hover:bg-surface-soft"
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export function PlaceSidebar({
  mobileOpen,
  onMobileOpenChange,
  ...props
}: SidebarProps & { mobileOpen: boolean; onMobileOpenChange: (open: boolean) => void }) {
  const focusedDay = props.itinerary.find((d) => d.id === props.focusedDayId);
  const cityMeta = cityMetaOf(props.activeCity);
  // โหมดคลังจากฐาน: หัวชีตมือถือใช้ชื่อเมืองแรกของทริป — ไม่ใช่ `activeCity` ซึ่งยังเป็นเมืองเกาหลีเสมอ
  // (เมืองที่กำลังดูจริงอยู่ใน state ข้างใน `PlaceSidebarContent` ซึ่งชั้นนี้มองไม่เห็น — ยอมรับความหยาบ
  //  ตรงนี้ในเฟส 1 ดีกว่าดันสถานะขึ้นมาข้างบนแล้วไปแตะทางเดินของทริปเกาหลี)
  const sheetTitle =
    (props.catalogCities?.length ?? 0) > 0
      ? props.catalogCities![0].nameTh
      : `${cityMeta.icon} ${cityNameThOf(props.activeCity)}`;
  const sheetSubtitle = focusedDay
    ? `กำลังเพิ่มให้วันที่ ${new Date(focusedDay.date).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
      })}`
    : undefined;

  // เดิม <aside> ฝั่งคอมซ่อนด้วย CSS (hidden lg:block) เฉยๆ ไม่เคย unmount — ทำให้ PlaceSidebarContent
  // (การ์ดทุกใบในคลัง + useDroppable({id:"library"})) ทำงานซ้ำสองชุดตลอดเวลาแม้อยู่บนมือถือที่มองไม่เห็น
  // ฝั่งคอมเลย (บั๊ก 9.3) — เปลี่ยนมาเรนเดอร์ชุดเดียวจริงๆ ตามขนาดจอผ่าน useMediaQuery (useSyncExternalStore)
  // แทน ค่าเริ่มต้นฝั่ง server/ก่อน hydrate เป็น false (มือถือ) เสมอ — React sync ให้ตรงกับจอจริงทันทีหลัง mount
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <>
      {isDesktop && (
        <aside className="sticky top-4 h-[calc(100vh-2rem)] w-80 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm shadow-ink/5">
          <PlaceSidebarContent {...props} draggable />
        </aside>
      )}

      {!isDesktop && (
        <>
          {/* ยกให้พ้นแถบเมนูล่าง (BottomNav) ที่สูง ~3.5rem ไม่งั้นทับกัน */}
          <button
            onClick={() => onMobileOpenChange(true)}
            className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-5 z-30 rounded-full bg-maple px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-ink/20"
          >
            📍 สถานที่
          </button>
          {mobileOpen && (
            <BottomSheet onClose={() => onMobileOpenChange(false)} title={sheetTitle} subtitle={sheetSubtitle}>
              <PlaceSidebarContent {...props} draggable={false} />
            </BottomSheet>
          )}
        </>
      )}
    </>
  );
}
