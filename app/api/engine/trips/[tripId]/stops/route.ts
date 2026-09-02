import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import {
  catalogPlaceIdBySlug, catalogPlacesByIds, insertStop, ranksInDay, softDeleteStop, stopRanksInDay,
  stopsOfPlan, updateStop, updateStopInDay,
} from "@/lib/engine/db";
import type { Db, InsertRow } from "@/lib/engine/db";
import { cardToPlace } from "@/lib/engine/catalogPlace";
import { catalogPlaceCards } from "@/lib/engine/trip";
import type { Place } from "@/data/places";
import { rankBetween, rankForInsert } from "@/lib/engine/rank";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * จุดแวะ — `E3` · `D6` · เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## 🔴 เซิร์ฟเวอร์เป็นเจ้าของ `rank` — ไคลเอนต์พูดเป็น *ตำแหน่ง*
 * `D6` เปลี่ยน `order_index` int → คีย์เรียงได้ · **แต่ UI ยังคิดเป็นตำแหน่ง**
 * → route รับ `atIndex` / ลำดับ id แล้ว **คำนวณ `rank` เอง**
 * 🎯 **ประโยชน์ที่ `D6` ต้องการอยู่ที่ฝั่งเขียน:** แทรกหนึ่งจุด = เขียน **แถวเดียว**
 *    ไม่ใช่เลื่อนเลขทั้งวัน · สองคนลากพร้อมกันจึงชนกันได้เฉพาะตอนแทรกที่เดียวกันเป๊ะ
 *
 * ## 🔴 `order_index` ที่คืนไปเป็น *ตำแหน่งที่คำนวณแล้ว* ไม่ใช่ค่าที่เก็บ
 * UI เดิมใช้มันแค่เรียงและหาตำแหน่ง · **ไม่มีใครเก็บมันกลับมา**
 * · ⚠️ เรียงด้วย `(rank, id)` เสมอ — `rank` ไม่ unique (`D6`) **`id` คือ tie-break ที่ทำให้ทุกเครื่องตรงกัน**
 */
const RATE_LIMIT_PER_MINUTE = 240;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string; trip_day_id: string; kind: string; rank: string;
  dwell_minutes: number | null; travel_mode: string | null; note: string | null;
  photo_path: string | null; intercity_from: string | null; intercity_to: string | null;
  intercity_mode: string | null; transfer_target_time: string | null;
  transfer_target_label: string | null; visited_at: string | null;
  legacy_added_by: string | null; updated_at: string;
  custom_place_id: string | null;
  /** uuid ของแถวคลัง — ใช้ประกอบ side-map `places` · ต่างจาก `place_id` ที่ส่งออกซึ่งเป็น slug */
  catalog_place_id: string | null;
  event_kind: string | null; schedule_bound: string | null;
  fixed_start_time: string | null; fixed_end_time: string | null; day_offset: number;
  title: string | null; title_en: string | null; icon: string | null;
  is_alert: boolean; time_is_flexible: boolean;
  flight_no: string | null; flight_from_code: string | null; flight_to_code: string | null;
  flight_from_en: string | null; flight_to_en: string | null;
  layover_baggage: string | null; layover_immigration: string | null;
  layover_leaves_airport: boolean | null; layover_terminal_change: boolean | null;
  place_ref: string | null;
  catalog_places: { legacy_slug: string | null } | null;
};

/** เนื้อของแถว `kind === 'event'` — **ฐานบังคับว่าคอลัมน์กลุ่มนี้เป็น `null` เสมอถ้าไม่ใช่ event**
 *  (`trip_stops_event_columns_only_on_events`) → แยกเป็นก้อนย่อยจึงตรงกับโครงฐาน ไม่ใช่แค่จัดระเบียบ
 *
 *  🔴 **ทำไมไม่แปะ 20 ฟิลด์ลง `StopDto` ตรง ๆ** (P3 เสนอ · P1 ตัดสิน · 30 ส.ค. 2026)
 *  ทริปนี้มี **71 แถวที่ไม่ใช่ event** → จะได้ `null` 20 ตัวต่อแถว ทุกคำขอ ตลอดไป
 *  · และทำให้ *ชนิดเดียว* ถือความหมายสองแบบ — รูปที่เราปฏิเสธไปแล้วตอน `read_only_selftest`
 *  · ✅ **มี `event` = เป็น event** · ไคลเอนต์ไม่ต้องเทียบสตริง `kind` ที่ไหนอีก และ `tsc` บังคับให้เช็คก่อนใช้
 *
 *  ⚠️ **`schedule_bound` เป็น *ตัวคั่น* ไม่ใช่ *ป้ายกำกับ*** — ใบที่เป็น `null` **ก่อนหน้า** ใบที่เป็น
 *  `'before'` ก็อยู่ฝั่งก่อนจุดแวะด้วย · ห้ามอ่านทีละแถวแล้วตัดสิน
 *  กฎเต็ม: `hooks/useDaySchedule.ts:138-142` บน `main` (แบ่งด้วย **ลำดับ** ไม่ใช่ **เวลา**) */
export type EventDto = {
  /** 🔴 สามตัวนี้ **ไม่ใช่ `null`** เพราะ `trip_stops_event_needs_core` บังคับไว้ที่ฐาน
   *  → ถ้าใครถอด constraint นั้น ต้องกลับมาแก้ตรงนี้ด้วย ไม่ใช่แค่ที่ migration */
  fixed_start_time: string; title: string; icon: string;
  event_kind: string | null; schedule_bound: string | null; fixed_end_time: string | null;
  day_offset: number; title_en: string | null; is_alert: boolean; time_is_flexible: boolean;
  flight_no: string | null; flight_from_code: string | null; flight_to_code: string | null;
  flight_from_en: string | null; flight_to_en: string | null;
  layover_baggage: string | null; layover_immigration: string | null;
  layover_leaves_airport: boolean | null; layover_terminal_change: boolean | null;
  /** `'hotel'` = พิกัดมาจาก `trip_hotels` ตอน render ไม่ใช่ค่าคงที่ (ฝั่งเก่า: `lib/eventPlace.ts`) */
  place_ref: string | null;
};

export type StopDto = {
  id: string; trip_day_id: string; place_id: string; order_index: number;
  dwell_minutes: number | null; travel_mode: string | null; note: string | null;
  photo_url: string | null; added_by: string | null; updated_at: string;
  kind: string; intercity_from: string | null; intercity_to: string | null;
  intercity_mode: string | null; transfer_target_time: string | null;
  transfer_target_label: string | null; visited_at: string | null;
  event?: EventDto;
};

function toDto(r: Row, orderIndex: number): StopDto {
  const ev = toEventDto(r);
  return {
    id: r.id, trip_day_id: r.trip_day_id,
    // 🔴 คลังกลางใช้ slug · ของทริปใช้ id ตรง · `""` = สถานที่ที่ UI เดิมไม่รู้จัก
    place_id: r.catalog_places?.legacy_slug ?? r.custom_place_id ?? "",
    order_index: orderIndex,
    dwell_minutes: r.dwell_minutes, travel_mode: r.travel_mode, note: r.note,
    photo_url: r.photo_path, added_by: r.legacy_added_by, updated_at: r.updated_at,
    kind: r.kind, intercity_from: r.intercity_from, intercity_to: r.intercity_to,
    intercity_mode: r.intercity_mode, transfer_target_time: r.transfer_target_time,
    transfer_target_label: r.transfer_target_label, visited_at: r.visited_at,
    ...(ev ? { event: ev } : {}),
  };
}

/** 📌 คืน `undefined` ถ้าแกนหลักไม่ครบ — **เข้าไม่ถึงตราบใดที่ `trip_stops_event_needs_core` ยังอยู่**
 *  ไม่ทำให้ทั้งคำขอล้มเพราะแถวเดียว · ถ้าอยากให้ดัง ต้องเป็นเคสของ P4 ไม่ใช่ `throw` ที่นี่ */
function toEventDto(r: Row): EventDto | undefined {
  if (r.kind !== "event") return undefined;
  if (r.fixed_start_time === null || r.title === null || r.icon === null) return undefined;
  return {
    fixed_start_time: r.fixed_start_time, title: r.title, icon: r.icon,
    event_kind: r.event_kind, schedule_bound: r.schedule_bound, fixed_end_time: r.fixed_end_time,
    day_offset: r.day_offset, title_en: r.title_en,
    is_alert: r.is_alert, time_is_flexible: r.time_is_flexible,
    flight_no: r.flight_no, flight_from_code: r.flight_from_code, flight_to_code: r.flight_to_code,
    flight_from_en: r.flight_from_en, flight_to_en: r.flight_to_en,
    layover_baggage: r.layover_baggage, layover_immigration: r.layover_immigration,
    layover_leaves_airport: r.layover_leaves_airport,
    layover_terminal_change: r.layover_terminal_change,
    place_ref: r.place_ref,
  };
}

/** 🔴 ค่าต้องเป็น **ชื่อคอลัมน์จริง** ของ `trip_stops` — พิมพ์ผิดจะแดงตอนคอมไพล์
 *  (เดิม `Record<string, string>` → ชื่อคอลัมน์ผิดผ่านไปตายที่ฐาน · ตระกูลเดียวกับ 502 เมื่อ 27 ส.ค.) */
const WRITABLE: Record<string, keyof InsertRow<"trip_stops">> = {
  dwellMinutes: "dwell_minutes", travelMode: "travel_mode", note: "note",
  photoUrl: "photo_path", visitedAt: "visited_at", kind: "kind",
  intercityFrom: "intercity_from", intercityTo: "intercity_to", intercityMode: "intercity_mode",
  transferTargetTime: "transfer_target_time", transferTargetLabel: "transfer_target_label",
};

async function guard(req: NextRequest, tripId: string) {
  const limited = rateLimitGuard(req, "engine-stops", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  return null;
}

/**
 * side-map `slug → Place` ของสถานที่ที่จุดแวะชุดนี้อ้างถึง — `E6-AC13` · P1 · 2 ก.ย. 2026
 *
 * ## 🔴 ทำไมเป็นคิวรีที่สอง ไม่ใช่ขยาย `STOP_COLS`
 * `STOP_COLS` **ป้อนขาเขียนด้วย** (`db.ts:1184` — `insert(row).select(STOP_COLS)`)
 * → ขยาย embed = **การเพิ่มจุดแวะทุกครั้งลากคลังเต็มใบกลับมาด้วย ตลอดไป** เพื่อฟีเจอร์ฝั่งอ่าน
 * · 🎯 ผมเกือบเลือกทางนั้นเพราะมองมันเป็น *"คอลัมน์ของ GET"* ซึ่งเป็นบทบาทที่ใช้ล่าสุด **ไม่ใช่บทบาททั้งหมด**
 * · ⚠️ *"คิวรีที่สองแพงเพราะเพิ่ม round trip"* เป็นเหตุผลที่**วางผิดชั้น** — ทั้งสองยิงจากเซิร์ฟเวอร์
 *   ข้าง ๆ ฐาน · นั่นคือราคาของ เซิร์ฟเวอร์↔ฐาน ไม่ใช่ เบราว์เซอร์↔เซิร์ฟเวอร์
 *
 * ## 🔴 คิวรีล้ม → `{}` ไม่ใช่ 502 — และมันไม่ใช่การกลืน error เงียบ ๆ
 * จุดแวะคือเนื้อของคำขอ · side-map คือ *ส่วนเสริม* ที่ไคลเอนต์ออกแบบมาให้ขาดได้อยู่แล้ว
 * (`parseStopsPayload` → `places: {}` → ชื่อตกไปทาง resolve เดิม)
 * · **ทำให้ทั้งคำขอล้มเพราะส่วนเสริมล้ม = เปลี่ยนการเสื่อมบางส่วน ให้กลายเป็นล่มทั้งหน้า**
 * · 🔴 **แต่ต้องดังที่ log** ไม่งั้นมันคือ *"เขียวที่ไม่ได้แปลว่าใช้ได้"* อีกใบ
 *
 * ## 🔴 แถวที่ไม่มี slug ไม่ถูกใส่ลงแมป — `cardToPlace` คืน `null` ให้ (เหตุผลอยู่ที่นั่น)
 * โดยย่อ: `legacy_slug` nullable → คีย์ `""` จะทำให้สถานที่ที่ไม่มี slug **ทุกใบทับกันที่คีย์เดียว**
 */
async function placesOfStops(db: Db, rows: Row[]): Promise<Record<string, Place>> {
  const ids = [...new Set(rows.map((r) => r.catalog_place_id).filter((v): v is string => v !== null))];
  if (ids.length === 0) return {};

  const { data, error } = await catalogPlacesByIds(db, ids as [string, ...string[]]);
  if (error) {
    console.error("[stops] อ่านคลังสำหรับ side-map ไม่ได้ — คืน places ว่าง", error.message);
    return {};
  }

  const out: Record<string, Place> = {};
  // ตัวเลือกชื่อตาม `locale`/`priority` อยู่ใน `catalogPlaceCards` ใบเดียว — ที่นี่แค่ *ประกอบ*
  for (const card of catalogPlaceCards(data ?? [])) {
    const place = cardToPlace(card);
    if (place) out[place.id] = place;
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId || !UUID.test(planId)) {
    return NextResponse.json({ error: "planId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data, error } = await stopsOfPlan(db, tripId, planId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // 🔴 `order_index` คำนวณจากตำแหน่ง **ในวันนั้น** ไม่ใช่ทั้งแผน — UI เรียงต่อวัน
  const rows = (data ?? []) as unknown as Row[];
  const perDay = new Map<string, number>();
  const stops = rows.map((r) => {
    const n = perDay.get(r.trip_day_id) ?? 0;
    perDay.set(r.trip_day_id, n + 1);
    return toDto(r, n);
  });

  return NextResponse.json(
    { stops, places: await placesOfStops(db, rows) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** เพิ่มจุดแวะ — `{ planId, tripDayId, placeId?, atIndex?, kind?, ... }` */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  const planId = String(b.planId ?? "");
  const tripDayId = String(b.tripDayId ?? "");
  if (!UUID.test(planId) || !UUID.test(tripDayId)) {
    return NextResponse.json({ error: "planId/tripDayId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();

  // ตำแหน่งแทรก → `rank` · **อ่าน rank ปัจจุบันของวันนั้นก่อนเสมอ**
  // 🔴 `stopRanksInDay` ไม่ใช่ `ranksInDay` — `atIndex` มาจากลิสต์ที่ไม่มี event (ดูเหตุผลที่ `db.ts`)
  const { data: existing, error: rankErr } = await stopRanksInDay(db, tripId, planId, tripDayId);
  if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 502 });
  const ranks = ((existing ?? []) as { rank: string }[]).map((r) => r.rank);
  const at = typeof b.atIndex === "number" ? b.atIndex : ranks.length;

  let rank: string;
  try {
    rank = rankForInsert(ranks, at);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "คำนวณลำดับไม่ได้" }, { status: 409 });
  }

  const kind = typeof b.kind === "string" ? b.kind : "place";
  const row: InsertRow<"trip_stops"> = {
    trip_id: tripId, plan_id: planId, trip_day_id: tripDayId, kind, rank,
    legacy_added_by: typeof b.addedBy === "string" ? b.addedBy : null,
  };
  // ⚠️ คัดลอกแบบไดนามิก: **ชื่อคอลัมน์**ถูกตรวจด้วยชนิดของ `WRITABLE` แล้ว
  //    ส่วน **ค่า** มาจาก body จึงเป็น `unknown` → ตรวจชนิดตรงนี้ **ไม่ใช่ปล่อยไปให้ฐานตัดสิน**
  for (const [k, col] of Object.entries(WRITABLE)) {
    if (!(k in b)) continue;
    const v = b[k];
    if (v !== null && typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      return NextResponse.json(
        { error: `ฟิลด์ ${k} ต้องเป็นข้อความ ตัวเลข หรือ true/false` },
        { status: 400 },
      );
    }
    (row as Record<string, unknown>)[col] = v;
  }

  // สถานที่: คลังกลาง (slug) หรือของทริป (id) — **ถามฐาน ไม่เดาจากรูปแบบสตริง**
  const placeId = typeof b.placeId === "string" ? b.placeId : null;
  if (placeId) {
    const { data: cat, error: lookErr } = await catalogPlaceIdBySlug(db, placeId);
    if (lookErr) return NextResponse.json({ error: lookErr.message }, { status: 502 });
    if (cat) row.catalog_place_id = cat.id;
    else if (UUID.test(placeId)) row.custom_place_id = placeId;
    else {
      /**
       * 🔴 **ไม่เจอในคลัง และไม่ใช่ uuid = ไม่ใช่ทั้งสองอย่าง** — เดิมกิ่งนี้ยัดค่าลง
       * `custom_place_id` ซึ่งเป็นคอลัมน์ `uuid` → Postgres โยน `22P02` → เราตอบ **502**
       *
       * 🎯 **502 แปลว่า "เซิร์ฟเวอร์เรามีปัญหา" ซึ่งผิด และมันพาคนไปหาบั๊กผิดที่**
       * P2 เจอ 502 นี้ตอน 27 ส.ค. แล้วสรุปว่า *"ไม่มีสะพาน slug → uuid เลยในโปรเจกต์"*
       * — สะพานมีอยู่และทำงานถูก (`catalogPlaceIdBySlug` บรรทัดบน) · **ของที่ไม่มีคือ *ข้อมูล* ในคลัง**
       * `catalog_places` **ยังไม่มี migration ไหน seed มันเลยสักแถว** (งานของ `E7`)
       * → slug ทุกตัวจาก `data/places.ts` จะไม่เจอ และเดินมาถึงกิ่งนี้ทั้งหมด
       *
       * ⚠️ **การเช็ครูปสตริงตรงนี้ไม่ได้ขัดกับคอมเมนต์ข้างบน** — คอมเมนต์นั้นห้าม*เดาว่าจะลงคอลัมน์ไหน*
       * จากรูปสตริง ซึ่งยังไม่เดาเหมือนเดิม (ฐานเป็นคนตอบ) · ตัวนี้แค่ปฏิเสธค่าที่ **เป็นไปไม่ได้ทั้งสองทาง**
       * ก่อนส่งให้ฐานโยน error ที่ผู้ใช้อ่านไม่รู้เรื่อง
       */
      return NextResponse.json(
        {
          error:
            `ไม่รู้จักสถานที่ "${placeId}" — ไม่มีใน catalog_places และไม่ใช่ id ของสถานที่ในทริป ` +
            `(ถ้ามาจากคลังสถิตย์ใน data/places.ts: คลังในฐานยังไม่ถูก seed — E7)`,
          code: "PLACE_NOT_IN_CATALOG",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await insertStop(db, row);
  if (error) {
    if (error.code === "23503") return NextResponse.json({ error: `ไม่รู้จักสถานที่ ${placeId}` }, { status: 400 });
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json(toDto(data as unknown as Row, at), { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

/** แก้ฟิลด์ หรือ ย้ายวัน — `{ id, ...fields, tripDayId?, atIndex? }` */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const db = await createServerSupabase();
  const patch: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(WRITABLE)) if (k in b) patch[col] = b[k];

  // ย้ายวัน/ย้ายตำแหน่ง → คำนวณ `rank` ใหม่ในวันปลายทาง
  if (typeof b.tripDayId === "string" && UUID.test(b.tripDayId)) {
    const planId = String(b.planId ?? "");
    if (!UUID.test(planId)) return NextResponse.json({ error: "ต้องมี planId เมื่อย้ายวัน" }, { status: 400 });
    // 🔴 `stopRanksInDay` เช่นกัน — `atIndex` ของการย้ายก็มาจากลิสต์ที่ไม่มี event
    const { data: existing, error: rankErr } = await stopRanksInDay(db, tripId, planId, b.tripDayId);
    if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 502 });
    const ranks = ((existing ?? []) as { id: string; rank: string }[]).filter((r) => r.id !== id).map((r) => r.rank);
    patch.trip_day_id = b.tripDayId;
    try {
      patch.rank = rankForInsert(ranks, typeof b.atIndex === "number" ? b.atIndex : ranks.length);
    } catch (e) {
      // 🔴 `rankBetween` โยนเมื่อ *ไม่มีคีย์ไหนอยู่ระหว่างนั้นได้จริง ๆ* หรือคีย์ในฐานผิดรูป
      //    ทั้งสองกรณีแปลว่ามีคนเขียน `rank` เข้าฐานโดยไม่ผ่านที่นี่ — **ดังดีกว่า 500 เปล่า ๆ**
      return NextResponse.json({ error: e instanceof Error ? e.message : "คำนวณลำดับไม่ได้" }, { status: 409 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  }

  const { data, error } = await updateStop(db, id, patch);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้จุดแวะนี้", code: "42501" }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * จัดลำดับใหม่ทั้งวัน — `{ planId, tripDayId, orderedIds }`
 *
 * 🔴 **เขียนเฉพาะแถวที่ `rank` เปลี่ยนจริง** — นั่นคือทั้งหมดที่ `D6` ซื้อมา
 * ลากหนึ่งจุดมักเปลี่ยนแถวเดียว · เขียนทั้งวันทุกครั้งคือกลับไปเป็น `order_index` แบบเดิม
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  let b: { planId?: string; tripDayId?: string; orderedIds?: string[] };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (!b.planId || !UUID.test(b.planId) || !b.tripDayId || !UUID.test(b.tripDayId) || !Array.isArray(b.orderedIds)) {
    return NextResponse.json({ error: "planId/tripDayId/orderedIds ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: existing, error } = await ranksInDay(db, tripId, b.planId, b.tripDayId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const current = new Map(((existing ?? []) as { id: string; rank: string }[]).map((r) => [r.id, r.rank]));

  // ── ตรวจ `orderedIds` ก่อนเขียนแถวแรก (P4 ยิงเจอทั้งสองแบบ 26 ส.ค. 2026) ────
  // 🔴 id ที่ไม่ได้อยู่ในวันนี้ = **ไคลเอนต์เห็นภาพคนละอันกับฐาน** ไม่ใช่คำขอที่ข้ามได้เงียบ ๆ
  //    ของเดิมปล่อยให้ไหลไป `updateStop` แล้ว **เขียนทับ `rank` ของวันอื่นจริง**
  //    · ย้ายจุดแวะ *เข้า* วันนี้ทำผ่าน `PATCH` (`tripDayId`) ไม่ใช่ผ่านที่นี่ → ไม่มีเคสถูกต้องที่ id หลุดชุด
  const unknown = b.orderedIds.filter((id) => !current.has(id));
  // 🔴 id ซ้ำ = ลิสต์ที่ขัดแย้งกับตัวเอง · ของเดิมเขียนแถวเดิมสองรอบด้วย rank คนละตัว
  const seen = new Set<string>();
  const duplicated = [...new Set(b.orderedIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false))))];
  if (unknown.length > 0 || duplicated.length > 0) {
    return NextResponse.json(
      {
        error:
          unknown.length > 0
            ? "orderedIds มีจุดแวะที่ไม่ได้อยู่ในวันนี้ — หน้าจอกับฐานไม่ตรงกัน ลองโหลดใหม่"
            : "orderedIds มี id ซ้ำ",
        code: "stale_order",
        unknown,
        duplicated,
      },
      { status: 409 }
    );
  }

  // ตัวที่เล็กที่สุด *ของวันนั้น* — คิดครั้งเดียวจากภาพก่อนเขียน ไม่ใช่คิดใหม่ทุกรอบ
  const minRank = [...current.values()].sort()[0];
  let prev: string | null = null;
  const writes: { id: string; rank: string }[] = [];
  for (const id of b.orderedIds) {
    const cur = current.get(id) as string;
    if (prev !== null && cur > prev) {
      prev = cur; // อยู่ถูกที่แล้ว — ไม่ต้องเขียน
      continue;
    }
    if (prev === null && cur === minRank) {
      prev = cur;
      continue;
    }
    let next: string;
    try {
      next = rankBetween(prev, null);
    } catch (e) {
      // ขอบบนเป็น `null` เสมอตรงนี้ → โยนได้ทางเดียวคือ `prev` ที่อ่านมาจากฐาน**ผิดรูป**
      // 🔴 เขียนต่อไปจะได้ลำดับที่ไม่มีใครตั้งใจ · หยุดก่อนเขียนแถวแรก ดีกว่าหยุดกลางทาง
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "คำนวณลำดับไม่ได้", code: "rank_shape" },
        { status: 409 }
      );
    }
    writes.push({ id, rank: next });
    // 🔴 อัปเดตภาพในมือด้วย — รอบถัดไปต้องเทียบกับค่าใหม่ ไม่ใช่ค่าที่เพิ่งถูกแทนที่ไป
    current.set(id, next);
    prev = next;
  }

  // 🔴 `written` เคยนับ *ความตั้งใจ* ไม่ใช่ *ผลจริง* (P4 · 26 ส.ค. 2026)
  //    id ที่ไม่มีอยู่จริงก็ได้ `{"ok":true,"written":1}` → **หน้าจอจะแสดงลำดับที่ฐานไม่มี**
  //    และมันปิดตาชุดทดสอบด้วย: เคสที่ต้องถามว่า "เขียนไปกี่แถว" ถามไม่ได้เลย
  let written = 0;
  for (const w of writes) {
    const { data: rows, error: e } = await updateStopInDay(
      db,
      w.id,
      { tripId, planId: b.planId, tripDayId: b.tripDayId },
      { rank: w.rank }
    );
    if (e) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "42501" ? 403 : 502 });
    }
    // 0 แถว = RLS กรองออก หรือแถวย้ายวันไประหว่างนั้น — **ไม่ใช่สำเร็จ**
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "จัดลำดับไม่สำเร็จ — จุดแวะบางตัวไม่อยู่ในวันนี้แล้ว ลองโหลดใหม่", code: "stale_order", written },
        { status: 409 }
      );
    }
    written += rows.length;
  }
  return NextResponse.json({ ok: true, written }, { headers: { "Cache-Control": "private, no-store" } });
}

/** ลบ — soft delete ผ่าน RPC (`E2-AC12`) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const stop = await guard(req, tripId);
  if (stop) return stop;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const db = await createServerSupabase();
  const { error } = await softDeleteStop(db, id);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : 502 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
