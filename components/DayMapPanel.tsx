"use client";

import { useEffect, useMemo, useState } from "react";
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
import { PlaceThumb } from "./PlaceThumb";

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
  className?: string;
};

export function DayMapPanel(props: DayMapPanelProps) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const resolvedStops = props.schedule.filter((s): s is ResolvedStop => s.place != null);

  if (!key) {
    return <MapPlaceholder className={props.className}>แผนที่ใช้งานไม่ได้ (ยังไม่ตั้งค่า API key)</MapPlaceholder>;
  }

  if (resolvedStops.length === 0) {
    return (
      <MapPlaceholder className={props.className}>ยังไม่มีจุดแวะที่มีพิกัดให้แสดงบนแผนที่</MapPlaceholder>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg ${props.className ?? ""}`}>
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
        <DayMapContent {...props} resolvedStops={resolvedStops} />
      </Map>
    </div>
  );
}

function MapPlaceholder({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex h-full min-h-40 items-center justify-center rounded-lg bg-cream-soft/60 px-4 text-center text-xs text-ink-soft ${className ?? ""}`}
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
}: DayMapPanelProps & { resolvedStops: ResolvedStop[] }) {
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

  const boundsKey = useMemo(
    () =>
      [
        ...points.map((p) => `${p.lat},${p.lng}`),
        startHotel ? `s${startHotel.lat},${startHotel.lng}` : "",
        endHotel ? `e${endHotel.lat},${endHotel.lng}` : "",
      ].join("|"),
    [points, startHotel, endHotel]
  );

  // ซูมให้พอดีทุกจุดใหม่ทุกครั้งที่จุดแวะ/ที่พักเปลี่ยน (ของเดิมใช้ defaultBounds จึงค้างที่ค่าครั้งแรก)
  useEffect(() => {
    if (!map || !apiLoaded) return;
    const all = [
      ...points,
      ...(startHotel ? [{ lat: startHotel.lat, lng: startHotel.lng }] : []),
      ...(endHotel ? [{ lat: endHotel.lat, lng: endHotel.lng }] : []),
    ];
    if (all.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    all.forEach((p) => bounds.extend(p));
    if (all.length === 1) {
      map.setCenter(all[0]);
      map.setZoom(15);
      return;
    }
    map.fitBounds(bounds, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, apiLoaded, boundsKey]);

  // เลือกจุดจากลิสต์ฝั่งซ้าย → เลื่อนแผนที่ไปหาหมุดนั้นให้เห็นแน่ๆ
  useEffect(() => {
    if (!map || !activeStopId) return;
    const target = resolvedStops.find((s) => s.id === activeStopId);
    if (target) map.panTo({ lat: target.place.lat, lng: target.place.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activeStopId]);

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

  return (
    <>
      <Polyline
        path={points}
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

      {openHotel && (startHotel || endHotel) && (
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
      <div className="w-44 text-ink">
        <div className="text-[10px] text-ink-soft">🏨 {label}</div>
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
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.mapsQuery)}`;
  // การ์ดต้องแคบพอจะอยู่ในช่องแผนที่ข้างลิสต์ (~288px) โดยไม่ล้น — ตัวหนังสือเล็ก รูปเตี้ย
  return (
    <div className="w-44 text-ink">
      <PlaceThumb query={place.mapsQuery} category={place.category} className="mb-1.5 h-14 w-full" />
      <div className="text-[10px] text-ink-soft">
        จุดที่ {index + 1} · {CATEGORY_LABEL[place.category]}
      </div>
      <div className="text-xs font-semibold leading-snug">
        {CATEGORY_EMOJI[place.category]} {place.nameTh}
      </div>
      <div className="mt-0.5 text-[10px] text-ink-soft">
        ⏰ {stop.arrival}–{stop.departure} · อยู่ {stop.resolvedDwellMinutes} น.
      </div>
      {stop.travelMinutesFromPrev != null && (
        <div className="text-[10px] text-ink-soft">
          {TRAVEL_MODE_EMOJI[(stop.travelMode ?? "transit") as TravelMode]} จากจุดก่อนหน้า ~
          {stop.travelMinutesFromPrev} น.
        </div>
      )}
      {note && <div className="mt-0.5 line-clamp-2 text-[10px] italic text-ink-soft">📝 {note}</div>}
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
