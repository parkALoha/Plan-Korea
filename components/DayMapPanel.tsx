"use client";

import { useEffect, useMemo, useState } from "react";
import { CITY_META, CITY_NAME_TH } from "@/data/itinerary";
import {
  buildDayCitySegments,
  stopCountIn,
  type CitySegment,
  type DayPoint,
} from "@/lib/citySegments";
import { INTERCITY_MODE_ICON, type IntercityMode } from "./IntercityEditModal";
import {
  InfoWindow,
  Map,
  Marker,
  Polyline,
  useApiIsLoaded,
  useMap,
} from "@vis.gl/react-google-maps";
import {
  CATEGORY_COLOR,
  CATEGORY_COLOR_DARK,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  type Place,
} from "@/data/places";
import type { TripHotel } from "@/lib/supabase";
import { TRAVEL_MODE_EMOJI, type ScheduledStop, type TravelMode } from "@/lib/schedule";
import { googleMapsPlaceUrl } from "@/lib/mapLinks";
import { placeQueryKey } from "@/lib/placeQuery";
import { PlaceThumb } from "./PlaceThumb";
import { noteFirstLine } from "./NoteBody";

const PINE = "#33564a";

type ResolvedStop = ScheduledStop & { place: Place };

export type DayMapPanelProps = {
  schedule: ScheduledStop[];
  /** ที่พักที่ออกมาตอนเช้า (คืนก่อนหน้า) — null เมื่อเป็นวันแรกหรือยังไม่ได้กรอก */
  startHotel: TripHotel | null;
  /** ที่พักที่กลับไปนอนคืนนี้ */
  endHotel: TripHotel | null;
  /** โน้ตของแต่ละจุดแวะ ใช้โชว์ในป๊อปอัพบนแผนที่ */
  notesByStopId: Record<string, string | null>;
  /** จุดแวะที่เวลาที่วางไว้ตกนอกเวลาเปิดตาม Google */
  closedStopIds: Set<string>;
  activeStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
  onOpenDetail: (stopId: string) => void;
  /** โหมดเดินทางข้ามเมืองของแถว kind="intercity" ที่คั่นอยู่ก่อนจุดแวะนั้น — ใช้เป็นไอคอนคั่นชิปเมือง
   *  (🚌/🚄/🚗) · `ScheduledStop` ไม่มี `kind`/`intercity_*` จึงต้องส่งเข้ามาจาก DayStopsSection */
  intercityModeBeforeStopId?: Record<string, IntercityMode>;
  className?: string;
};

/** ไม่ให้ fit ซูมเข้าไปจนเห็นแต่ถนนเส้นเดียว — ช่วงที่มี 2 จุดห่างกัน 300 ม. fit ได้ถึง z17
 *  ค่าเดียวกับ branch "จุดเดียว" ด้านล่าง เพื่อให้ระดับซูมของทั้ง panel สม่ำเสมอ */
const MAX_FIT_ZOOM = 15;

/** ยังไม่ได้กดชิปเอง = ใช้ช่วงเริ่มต้นที่คำนวณให้ · resolve ตอนอ่าน ไม่ sync ด้วย effect
 *  (แบบเดียวกับ `collapsed` ใน DayStopsSection — พอจุดแวะเปลี่ยน ค่าจะถูกคิดใหม่เองทันที) */
type SegmentSelection = number | "all" | "auto";

export function DayMapPanel(props: DayMapPanelProps) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const resolvedStops = useMemo(
    () => props.schedule.filter((s): s is ResolvedStop => s.place != null),
    [props.schedule]
  );

  const [picked, setPicked] = useState<SegmentSelection>("auto");
  // กดชิปเดิมซ้ำ = จัดกรอบใหม่ (เป็น affordance "กลับไปดูภาพรวม" อันเดียวที่ panel นี้มี
  // เพราะ boundsKey อย่างเดียวจะนิ่งเมื่อจุดไม่เปลี่ยน แล้ว effect จะไม่ยิงหลังผู้ใช้ลากแผนที่ไปที่อื่น)
  const [fitNonce, setFitNonce] = useState(0);

  const segments = useMemo(
    () =>
      buildDayCitySegments({
        stops: resolvedStops.map((s) => ({ id: s.id, place: s.place })),
        startHotel: props.startHotel,
        endHotel: props.endHotel,
      }),
    [resolvedStops, props.startHotel, props.endHotel]
  );

  // ช่วงแรกที่ "มีจุดแวะจริง" ไม่ใช่ index 0 เฉยๆ — วันที่ช่วงแรกมีแต่หมุดโรงแรมออกเดินทาง
  // จะเปิดมาเจอโรงแรมเดี่ยวๆ ที่ zoom 15 แทนที่จะเห็นแผนของวัน
  const defaultIndex = Math.max(
    segments.findIndex((segment) => stopCountIn(segment) > 0),
    0
  );
  const selectedIndex = picked === "auto" ? defaultIndex : picked;
  // `?? null` กัน index ค้างหลังลบ/สลับจุดแวะ โดยไม่ต้องมี effect คอย sync
  const selectedSegment = selectedIndex === "all" ? null : segments[selectedIndex] ?? null;

  function selectSegment(next: number | "all") {
    setPicked(next);
    setFitNonce((n) => n + 1);
    // จุดที่ไฮไลต์ไว้อยู่คนละช่วง = ป๊อปอัพจะค้างอยู่นอกจอ และแถวในลิสต์ยังติด ring อยู่
    const stillVisible =
      next === "all" ||
      (props.activeStopId != null &&
        segments[next]?.items.some(
          (item) => item.kind === "stop" && item.stopId === props.activeStopId
        ));
    if (!stillVisible) props.onSelectStop(null);
  }

  if (!key) {
    return <MapPlaceholder className={props.className}>แผนที่ใช้งานไม่ได้ (ยังไม่ตั้งค่า API key)</MapPlaceholder>;
  }

  if (resolvedStops.length === 0) {
    return (
      <MapPlaceholder className={props.className}>ยังไม่มีจุดแวะที่มีพิกัดให้แสดงบนแผนที่</MapPlaceholder>
    );
  }

  return (
    <div className={`flex flex-col ${props.className ?? ""}`}>
      {segments.length >= 2 && (
        <SegmentChips
          segments={segments}
          selectedIndex={selectedIndex}
          onSelect={selectSegment}
          intercityModeBeforeStopId={props.intercityModeBeforeStopId}
        />
      )}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg">
        <Map
          defaultCenter={{ lat: resolvedStops[0].place.lat, lng: resolvedStops[0].place.lng }}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          // ช่องแผนที่ข้างลิสต์กว้างแค่ ~288px — ปุ่มเต็มจอของ Google ช่วยให้ดูเส้นทางทั้งวันได้จริงจัง
          fullscreenControl
          clickableIcons={false}
          onClick={() => props.onSelectStop(null)}
          style={{ width: "100%", height: "100%" }}
        >
          <DayMapContent
            {...props}
            resolvedStops={resolvedStops}
            segments={segments}
            selectedIndex={selectedIndex}
            selectedSegment={selectedSegment}
            fitNonce={fitNonce}
            onSelectSegment={selectSegment}
          />
        </Map>
      </div>
    </div>
  );
}

/**
 * ชิปสลับเมืองของวันข้ามเมือง — วางในโฟลว์เหนือแผนที่ ไม่ใช่ overlay ลอยทับ
 * เพราะช่องแผนที่กว้างแค่ ~288px บนจอคอม overlay จะบังพื้นที่ที่เรากำลังพยายามทำให้อ่านออกพอดี
 * และชนกับปุ่มซูม/เต็มจอของ Google ด้วย
 */
function SegmentChips({
  segments,
  selectedIndex,
  onSelect,
  intercityModeBeforeStopId,
}: {
  segments: CitySegment<DayPoint>[];
  selectedIndex: number | "all";
  onSelect: (next: number | "all") => void;
  intercityModeBeforeStopId?: Record<string, IntercityMode>;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1">
      {segments.map((segment, i) => {
        const meta = segment.city ? CITY_META[segment.city] : null;
        const name = segment.city ? CITY_NAME_TH[segment.city] : `ช่วงที่ ${i + 1}`;
        const stops = stopCountIn(segment);
        const active = selectedIndex === i;
        // ไอคอนพาหนะของ hop ที่พามาถึงช่วงนี้ — เอาจากจุดแวะแรกของช่วง ถ้าไม่มีแถวข้ามเมืองก็ใช้ →
        const firstStop = segment.items.find((item) => item.kind === "stop");
        const hopIcon =
          (firstStop?.kind === "stop"
            ? intercityModeBeforeStopId?.[firstStop.stopId]
            : undefined) ?? null;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-[11px] text-content-soft">
                {hopIcon ? INTERCITY_MODE_ICON[hopIcon] : "→"}
              </span>
            )}
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={active}
              // ห้าม leading-none — "คังนึง"/"ซกโช" มีสระบน (ั ึ โ) ที่จะโดนตัดหัว
              className={`rounded-full border px-2.5 py-1.5 text-[11px] leading-snug sm:py-1 ${
                active
                  ? "border-pine bg-pine-soft font-semibold text-pine-dark"
                  : "border-line text-content-soft hover:border-pine/40"
              }`}
            >
              {meta ? `${meta.icon} ` : "📍 "}
              {name} {stops > 0 ? stops : "🏨"}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onSelect("all")}
        aria-pressed={selectedIndex === "all"}
        className={`rounded-full border px-2.5 py-1.5 text-[11px] leading-snug sm:py-1 ${
          selectedIndex === "all"
            ? "border-pine bg-pine-soft font-semibold text-pine-dark"
            : "border-line text-content-soft hover:border-pine/40"
        }`}
      >
        ทั้งวัน
      </button>
    </div>
  );
}

function MapPlaceholder({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex h-full min-h-40 items-center justify-center rounded-lg bg-surface-soft/60 px-4 text-center text-xs text-content-soft ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function DayMapContent({
  resolvedStops,
  startHotel,
  endHotel,
  notesByStopId,
  closedStopIds,
  activeStopId,
  onSelectStop,
  onOpenDetail,
  segments,
  selectedIndex,
  selectedSegment,
  fitNonce,
  onSelectSegment,
}: DayMapPanelProps & {
  resolvedStops: ResolvedStop[];
  segments: CitySegment<DayPoint>[];
  selectedIndex: number | "all";
  selectedSegment: CitySegment<DayPoint> | null;
  fitNonce: number;
  onSelectSegment: (next: number | "all") => void;
}) {
  const map = useMap();
  const apiLoaded = useApiIsLoaded();
  // ป๊อปอัพของหมุดที่พักแยกจาก activeStopId เพราะที่พักไม่ใช่จุดแวะในลิสต์
  const [openHotel, setOpenHotel] = useState<"start" | "end" | null>(null);

  const points = useMemo(
    () => resolvedStops.map((s) => ({ lat: s.place.lat, lng: s.place.lng })),
    [resolvedStops]
  );

  // ที่พักหัว-ท้ายมักเป็นที่เดียวกัน (คืนก่อนกับคืนนี้เมืองเดียวกัน) — วาดหมุดเดียวพอ
  const sameHotel =
    startHotel != null &&
    endHotel != null &&
    startHotel.lat === endHotel.lat &&
    startHotel.lng === endHotel.lng;

  // เฟรมแค่ช่วงที่เลือก — "ทั้งวัน" (selectedSegment = null) ได้ชุดจุดเดิมเป๊ะ คือจุดแวะ + ที่พักหัวท้าย
  // หมุดและเส้นยังวาดครบทั้งวันเสมอ เปลี่ยนแค่ viewport จุดของเมืองอื่นก็แค่อยู่นอกจอ
  const fitPoints = useMemo(
    () => (selectedSegment ? selectedSegment.items : segments.flatMap((s) => s.items)),
    [selectedSegment, segments]
  );

  const boundsKey = useMemo(
    () => fitPoints.map((p) => `${p.lat},${p.lng}`).join("|"),
    [fitPoints]
  );

  // ซูมให้พอดีทุกจุดใหม่ทุกครั้งที่จุดแวะ/ที่พัก/ช่วงที่เลือกเปลี่ยน
  // (ของเดิมใช้ defaultBounds จึงค้างที่ค่าครั้งแรก)
  useEffect(() => {
    if (!map || !apiLoaded || fitPoints.length === 0) return;
    if (fitPoints.length === 1) {
      map.setCenter({ lat: fitPoints[0].lat, lng: fitPoints[0].lng });
      map.setZoom(MAX_FIT_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    fitPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    // 40px ต่อด้านกินไป 28% ของช่องกว้าง 288px — แยกเป็นซ้าย-ขวาแคบกว่าบน-ล่าง
    map.fitBounds(bounds, { top: 28, right: 24, bottom: 28, left: 24 });
    // ห้ามใช้ prop `maxZoom` ที่ <Map> เพราะจะบล็อกการซูมด้วยมือของผู้ใช้ไปด้วย
    // ต้องคืน removeListener ไม่งั้น clamp ที่ค้างอยู่จะมายิงทับหลังผู้ใช้ซูมเอง
    const once = google.maps.event.addListenerOnce(map, "idle", () => {
      const zoom = map.getZoom();
      if (zoom != null && zoom > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
    });
    return () => google.maps.event.removeListener(once);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, apiLoaded, boundsKey, fitNonce]);

  // เลือกจุดจากลิสต์ฝั่งซ้าย → เลื่อนแผนที่ไปหาหมุดนั้นให้เห็นแน่ๆ
  // ถ้าจุดนั้นอยู่คนละช่วงกับที่กำลังดู ให้สลับช่วงแล้วปล่อยให้ fitBounds เฟรมให้ — ต้องรวมไว้ใน
  // effect เดียวกัน ไม่งั้น fitBounds ของการสลับช่วงจะมาทับ panTo ช้าไปหนึ่ง commit
  useEffect(() => {
    if (!map || !activeStopId) return;
    const target = resolvedStops.find((s) => s.id === activeStopId);
    if (!target) return;
    if (selectedIndex !== "all") {
      const owner = segments.findIndex((segment) =>
        segment.items.some((item) => item.kind === "stop" && item.stopId === activeStopId)
      );
      if (owner >= 0 && owner !== selectedIndex) {
        onSelectSegment(owner);
        return;
      }
    }
    map.panTo({ lat: target.place.lat, lng: target.place.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activeStopId, selectedIndex]);

  if (!apiLoaded) return null;

  const activeStop = resolvedStops.find((s) => s.id === activeStopId) ?? null;
  const activeIndex = activeStop ? resolvedStops.indexOf(activeStop) : -1;
  const first = points[0];
  const last = points[points.length - 1];

  // สร้างหลังเช็ก apiLoaded แล้วเท่านั้น — google.maps.SymbolPath ยังไม่มีตอน API ยังโหลดไม่เสร็จ
  const hotelIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 12,
    fillColor: PINE,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
  };

  // เส้นประ = ช่วงเดินทางที่พัก↔จุดแวะ (ขาออกตอนเช้า / ขากลับตอนค่ำ) แยกจากเส้นทึบระหว่างจุดแวะ
  const dotted = {
    strokeOpacity: 0,
    icons: [
      {
        icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, strokeWeight: 2, scale: 3 },
        offset: "0",
        repeat: "12px",
      },
    ],
  };

  // เส้นทางในเมืองวาดแยกทีละช่วง แล้วเชื่อมรอยต่อด้วยเส้นประ — ตอนดู "ทั้งวัน" จะได้อ่านออกว่า
  // ช่วง 326 กม. คือการนั่งรถข้ามเมือง ไม่ใช่เส้นทางที่เดินจริงเหมือนเส้นทึบช่วงอื่น
  function hotelVisible(role: "start" | "end") {
    if (selectedIndex === "all") return true;
    return segments[selectedIndex]?.items.some(
      (item) => item.kind === "hotel" && (sameHotel || item.role === role)
    );
  }

  const segmentStopPoints = segments.map((segment) =>
    segment.items
      .filter((item): item is Extract<DayPoint, { kind: "stop" }> => item.kind === "stop")
      .map((item) => ({ lat: item.lat, lng: item.lng }))
  );

  return (
    <>
      {segmentStopPoints.map((path, i) =>
        path.length >= 2 ? (
          <Polyline
            key={`route-${i}`}
            path={path}
            strokeColor={PINE}
            strokeOpacity={0.75}
            strokeWeight={3}
            icons={[
              {
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.6 },
                offset: "50%",
                repeat: "90px",
              },
            ]}
          />
        ) : null
      )}
      {segmentStopPoints.map((path, i) => {
        const next = segmentStopPoints[i + 1];
        // ช่วงที่ไม่มีจุดแวะเลย (เช่นช่วงที่มีแต่หมุดโรงแรมของวัน 16 ต.ค.) — เส้นประที่พักด้านล่าง
        // วาดเส้นเดียวกันนี้ให้อยู่แล้ว วาดซ้ำจะได้เส้นทับกันสองชั้น
        if (!next || path.length === 0 || next.length === 0) return null;
        const toCity = segments[i + 1].city;
        return (
          <Polyline
            key={`hop-${i}`}
            path={[path[path.length - 1], next[0]]}
            strokeColor={toCity ? CITY_META[toCity].colorDark : PINE}
            {...dotted}
          />
        );
      })}
      {startHotel && (
        <Polyline
          path={[{ lat: startHotel.lat, lng: startHotel.lng }, first]}
          strokeColor={PINE}
          {...dotted}
        />
      )}
      {endHotel && (
        <Polyline
          path={[last, { lat: endHotel.lat, lng: endHotel.lng }]}
          strokeColor={PINE}
          {...dotted}
        />
      )}

      {resolvedStops.map((s, i) => {
        const isActive = s.id === activeStopId;
        const color = CATEGORY_COLOR[s.place.category];
        return (
          <Marker
            key={s.id}
            position={{ lat: s.place.lat, lng: s.place.lng }}
            title={`${i + 1}. ${s.place.nameTh}`}
            onClick={() => {
              setOpenHotel(null);
              onSelectStop(s.id);
            }}
            zIndex={isActive ? 10 : 1}
            label={{ text: String(i + 1), color: "#fff", fontSize: "12px", fontWeight: "700" }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: isActive ? 15 : 11,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: isActive ? CATEGORY_COLOR_DARK[s.place.category] : "#fff",
              strokeWeight: isActive ? 4 : 2,
            }}
          />
        );
      })}

      {startHotel && (
        <Marker
          position={{ lat: startHotel.lat, lng: startHotel.lng }}
          title={startHotel.hotel_name}
          zIndex={5}
          onClick={() => {
            onSelectStop(null);
            setOpenHotel("start");
          }}
          label={{ text: "🏨", fontSize: "13px" }}
          icon={hotelIcon}
        />
      )}
      {endHotel && !sameHotel && (
        <Marker
          position={{ lat: endHotel.lat, lng: endHotel.lng }}
          title={endHotel.hotel_name}
          zIndex={5}
          onClick={() => {
            onSelectStop(null);
            setOpenHotel("end");
          }}
          label={{ text: "🏨", fontSize: "13px" }}
          icon={hotelIcon}
        />
      )}

      {activeStop && (
        <InfoWindow
          position={{ lat: activeStop.place.lat, lng: activeStop.place.lng }}
          pixelOffset={[0, -14]}
          headerDisabled
          onCloseClick={() => onSelectStop(null)}
        >
          <StopCard
            stop={activeStop}
            index={activeIndex}
            note={notesByStopId[activeStop.id] ?? null}
            isClosed={closedStopIds.has(activeStop.id)}
            onOpenDetail={() => onOpenDetail(activeStop.id)}
          />
        </InfoWindow>
      )}

      {/* สลับไปดูอีกเมืองแล้วป๊อปอัพที่พักของเมืองเดิมจะค้างอยู่นอกจอ — คิดจากช่วงที่เลือกเอาเลย
          ไม่ต้องมี effect คอยล้าง state (แถมได้ผลถูกต้องกว่าเวลาที่พักไปโผล่กลางช่วงอื่น) */}
      {openHotel && (startHotel || endHotel) && hotelVisible(openHotel) && (
        <HotelInfoWindow
          hotel={openHotel === "start" ? startHotel! : endHotel!}
          role={sameHotel ? "both" : openHotel}
          onClose={() => setOpenHotel(null)}
        />
      )}
    </>
  );
}

function HotelInfoWindow({
  hotel,
  role,
  onClose,
}: {
  hotel: TripHotel;
  role: "start" | "end" | "both";
  onClose: () => void;
}) {
  const label =
    role === "both"
      ? "จุดเริ่มและจุดจบของวัน"
      : role === "start"
        ? "จุดเริ่มของวัน (ที่พักคืนก่อน)"
        : "จุดจบของวัน (ที่พักคืนนี้)";
  return (
    <InfoWindow
      position={{ lat: hotel.lat, lng: hotel.lng }}
      pixelOffset={[0, -14]}
      headerDisabled
      onCloseClick={onClose}
    >
      <div className="w-44 text-content">
        <div className="text-[10px] text-content-soft">🏨 {label}</div>
        <div className="line-clamp-3 text-xs font-semibold leading-snug">{hotel.hotel_name}</div>
      </div>
    </InfoWindow>
  );
}

function StopCard({
  stop,
  index,
  note,
  isClosed,
  onOpenDetail,
}: {
  stop: ResolvedStop;
  index: number;
  note: string | null;
  isClosed: boolean;
  onOpenDetail: () => void;
}) {
  const place = stop.place;
  const mapsUrl = googleMapsPlaceUrl(place.mapsQuery, place.googlePlaceId);
  // การ์ดต้องแคบพอจะอยู่ในช่องแผนที่ข้างลิสต์ (~288px) โดยไม่ล้น — ตัวหนังสือเล็ก รูปเตี้ย
  return (
    <div className="w-44 text-content">
      <PlaceThumb query={placeQueryKey(place)} category={place.category} className="mb-1.5 h-14 w-full" />
      <div className="text-[10px] text-content-soft">
        จุดที่ {index + 1} · {CATEGORY_LABEL[place.category]}
      </div>
      <div className="text-xs font-semibold leading-snug">
        {CATEGORY_EMOJI[place.category]} {place.nameTh}
      </div>
      <div className="mt-0.5 text-[10px] text-content-soft">
        ⏰ {stop.arrival}–{stop.departure} · อยู่ {stop.resolvedDwellMinutes} น.
      </div>
      {stop.travelMinutesFromPrev != null && (
        <div className="text-[10px] text-content-soft">
          {TRAVEL_MODE_EMOJI[(stop.travelMode ?? "transit") as TravelMode]} จากจุดก่อนหน้า ~
          {stop.travelMinutesFromPrev} น.
        </div>
      )}
      {note && <div className="mt-0.5 line-clamp-2 text-[10px] italic text-content-soft">📝 {noteFirstLine(note)}</div>}
      {isClosed && (
        <div className="mt-1 rounded bg-maple-soft/70 px-1.5 py-0.5 text-[10px] text-maple-dark">
          ⚠️ ช่วงนี้อาจปิดแล้ว
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          onClick={onOpenDetail}
          className="rounded-lg bg-pine px-2 py-1 text-[10px] font-medium text-cream hover:bg-pine-dark"
        >
          ดูรายละเอียด
        </button>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-medium text-pine-dark underline"
        >
          เปิดใน Google Maps
        </a>
      </div>
    </div>
  );
}
