"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CATEGORY_EMOJI, CATEGORY_LABEL, Category, Place, cityCenter, placesByCity } from "@/data/places";
import { CITY_META, CITY_NAME_TH } from "@/data/itinerary";
import type { Day } from "@/data/itinerary";
import type { CustomPlace, TripHotel } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { PlaceCard } from "./PlaceCard";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { AddPlaceModal } from "./AddPlaceModal";
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

/** การ์ดในคลัง — ลากออกไปวางในแพลนทริปได้ (data.type "place" ให้ handleDragEnd ที่ app/page.tsx อ่านต่อ)
 *  หรือกดปุ่ม + บนการ์ดตรงๆ ก็เพิ่มเข้าวันที่โฟกัสอยู่ได้เลย ไม่ต้องเปิดโมดัลก่อน */
function DraggablePlaceCard({
  place,
  isCustom,
  distanceLabel,
  dayDate,
  onClick,
  onHide,
  onAdd,
}: {
  place: Place;
  isCustom?: boolean;
  distanceLabel?: string | null;
  dayDate?: string;
  onClick: () => void;
  onHide?: () => void;
  onAdd?: () => void;
}) {
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
      <PlaceCard
        place={place}
        isCustom={isCustom}
        distanceLabel={distanceLabel}
        dayDate={dayDate}
        onClick={onClick}
        onHide={onHide}
        onAdd={onAdd}
      />
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
  /** id ของสถานที่ที่ถูกเพิ่มลงวันไหนก็ได้ในเมืองนี้แล้ว (ไม่ต้องโชว์ให้เลือกซ้ำ) */
  selectedPlaceIdsForCity: (city: Day["city"]) => Set<string>;
  hiddenPlaceIds: Set<string>;
  onHidePlace: (placeId: string) => void;
  onUnhidePlace: (placeId: string) => void;
  /** เมือง/วันที่โฟกัสอยู่ตอนนี้ — คุมจาก app/page.tsx เพื่อให้ปุ่ม "+" ในแต่ละวันสั่งโฟกัสมาที่ sidebar ได้ */
  activeCity: Day["city"];
  onActiveCityChange: (city: Day["city"]) => void;
  focusedDayId: string;
  onFocusedDayIdChange: (dayId: string) => void;
};

function PlaceSidebarContent({
  itinerary,
  customPlaces,
  who,
  lastStopPlaceForDay,
  hotelForDay,
  onAddStopToDay,
  selectedPlaceIdsForCity,
  hiddenPlaceIds,
  onHidePlace,
  onUnhidePlace,
  activeCity,
  onActiveCityChange,
  focusedDayId,
  onFocusedDayIdChange,
}: SidebarProps) {
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

  const allCardsForCity: { place: Place; isCustom: boolean }[] = [
    ...placesByCity(activeCity).map((p) => ({ place: p, isCustom: false })),
    ...customPlaces
      .filter((p) => p.city === activeCity)
      .map((p) => ({ place: customPlaceToPlace(p), isCustom: true })),
  ];

  const selectedIds = selectedPlaceIdsForCity(activeCity);
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
  const [addOpen, setAddOpen] = useState(false);
  const [nearbyKind, setNearbyKind] = useState<NearbyKind | null>(null);
  const focusedDayDate = itinerary.find((d) => d.id === focusedDayId)?.date;
  // ศูนย์กลางค้นหาร้านอาหารใกล้ๆ: จุดแวะล่าสุดของวันที่โฟกัส > ที่พัก > จุดกึ่งกลางเมือง
  const nearbyCenter = referencePlace ?? referenceHotel ?? cityCenter(activeCity);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-cream-soft p-3">
        {cities.map((city) => {
          const meta = CITY_META[city];
          const active = city === activeCity;
          return (
            <button
              key={city}
              onClick={() => selectCity(city)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                active ? "text-white" : "bg-cream-soft text-ink-soft hover:bg-maple-soft"
              }`}
              style={active ? { backgroundColor: meta.color } : undefined}
            >
              {meta.icon} {CITY_NAME_TH[city]}
            </button>
          );
        })}
      </div>

      {daysForCity.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-cream-soft px-3 py-2">
          {daysForCity.map((day) => (
            <button
              key={day.id}
              onClick={() => onFocusedDayIdChange(day.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                day.id === focusedDayId
                  ? "bg-pine text-cream"
                  : "bg-cream-soft text-ink-soft hover:bg-pine-soft"
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
            🎡 ที่เที่ยวยอดนิยมใน{CITY_NAME_TH[activeCity]}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="flex-1 rounded-xl border border-dashed border-ink-soft/30 py-2 text-sm text-ink-soft hover:border-maple hover:text-maple"
            >
              + เพิ่มสถานที่เอง
            </button>
            <button
              onClick={() => setNearbyKind("restaurant")}
              className="flex-1 rounded-xl border border-dashed border-ink-soft/30 py-2 text-sm text-ink-soft hover:border-maple hover:text-maple"
            >
              🍽️ ร้านใกล้ๆ
            </button>
          </div>
        </div>

        {visibleCards.length === 0 && (
          <div className="py-6 text-center text-xs text-ink-soft">
            เลือกครบทุกที่ในโซนนี้แล้ว 🎉
          </div>
        )}
        {groupedVisibleCards.map(({ category, cards }) => (
          <div key={category} className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold text-ink-soft">
              {CATEGORY_EMOJI[category]} {CATEGORY_LABEL[category]}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {cards.map(({ place, isCustom }) => (
                <DraggablePlaceCard
                  key={place.id}
                  place={place}
                  isCustom={isCustom}
                  distanceLabel={distanceLabelFor(place)}
                  dayDate={focusedDayDate}
                  onClick={() => setDetailPlace(place)}
                  onHide={() => onHidePlace(place.id)}
                  onAdd={() => onAddStopToDay(focusedDayId, place.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {hiddenCards.length > 0 && (
          <div className="mt-4 border-t border-cream-soft pt-3">
            <button
              onClick={() => setHiddenOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-ink-soft hover:text-ink"
            >
              <span>🙈 ซ่อนไว้ ({hiddenCards.length})</span>
              <span>{hiddenOpen ? "▲" : "▼"}</span>
            </button>
            {hiddenOpen && (
              <div className="mt-2 space-y-1.5">
                {hiddenCards.map(({ place }) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-cream-soft px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate text-ink-soft">{place.nameTh}</span>
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
          onClose={() => setDetailPlace(null)}
          onConfirm={() => {
            onAddStopToDay(focusedDayId, detailPlace.id);
            setDetailPlace(null);
          }}
        />
      )}

      {addOpen && (
        <AddPlaceModal
          city={activeCity}
          addedBy={who}
          onClose={() => setAddOpen(false)}
          onAdded={(placeId, coords) => onAddStopToDay(focusedDayId, placeId, coords)}
        />
      )}

      {nearbyKind && (
        <NearbyPlacesModal
          kind={nearbyKind}
          city={activeCity}
          // ที่เที่ยวมองทั้งเมือง เลยอิงกลางเมืองเสมอ ไม่ให้ผลลัพธ์เอียงไปตามจุดแวะล่าสุด
          // ส่วนร้านอาหารอิงจุดแวะล่าสุดของวันนั้นเหมือนเดิม เพราะต้องการร้านที่เดินต่อจากจุดนั้นได้
          center={nearbyKind === "attraction" ? cityCenter(activeCity) : nearbyCenter}
          addedBy={who}
          onClose={() => setNearbyKind(null)}
          onAdded={(placeId, coords) => onAddStopToDay(focusedDayId, placeId, coords)}
        />
      )}
    </div>
  );
}

function MobileOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white lg:hidden">
      <div className="flex items-center justify-between border-b border-cream-soft p-3">
        <h2 className="text-sm font-bold text-ink">สถานที่ในโซนนี้</h2>
        <button onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-soft">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

export function PlaceSidebar({
  mobileOpen,
  onMobileOpenChange,
  ...props
}: SidebarProps & { mobileOpen: boolean; onMobileOpenChange: (open: boolean) => void }) {
  return (
    <>
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-80 shrink-0 overflow-hidden rounded-2xl border border-cream-soft bg-white shadow-sm shadow-ink/5 lg:block">
        <PlaceSidebarContent {...props} />
      </aside>

      <button
        onClick={() => onMobileOpenChange(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 rounded-full bg-maple px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-ink/20 lg:hidden"
      >
        📍 สถานที่
      </button>
      {mobileOpen && (
        <MobileOverlay onClose={() => onMobileOpenChange(false)}>
          <PlaceSidebarContent {...props} />
        </MobileOverlay>
      )}
    </>
  );
}
