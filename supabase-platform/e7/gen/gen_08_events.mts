/**
 * E7 ก้อน 8 — สร้าง `08_events.sql` จาก `data/itinerary.ts`
 *
 * 🔴 **อ่านโมดูลจริง ไม่ parse ด้วย regex** — รอบแรกผมนับด้วย `grep 'kind:'` ได้ 16
 *    ของจริง 18 เพราะ **2 เหตุการณ์ไม่มีฟิลด์ `kind` เลย** (`column-map.md:410` เขียนไว้เองว่า null ได้)
 *    เป็นชนิดเดียวกับ "แพตเทิร์นแคบกว่าคลาส" ที่ทีมเจอวันนี้ 3 รอบ
 *
 * รัน (จากที่ไหนก็ได้ที่มี node_modules ของโปรเจกต์):
 *   npx tsx supabase-platform/e7/gen/gen_08_events.mts > supabase-platform/e7/08_events.sql
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// 🔴 **อ่านจากทรี `main` เสมอ ไม่ใช่จากทรีที่ไฟล์นี้อยู่**
//    `data/itinerary.ts` มีอยู่ *ทั้งสองทรี* และ blob ไม่เท่ากัน — ทริปจริงอยู่บน `main`
//    ถ้า import แบบ relative ไฟล์นี้จะอ่านสำเนาของทรี platform โดยไม่มีอะไรเตือน
const MAIN = "/Users/park/plan-korea";
if (!existsSync(`${MAIN}/data/itinerary.ts`)) {
  throw new Error(`ไม่พบ ${MAIN}/data/itinerary.ts — E7 ต้องอ่านทริปจริงจากทรี main`);
}
const onBranch = execSync(`git -C ${MAIN} branch --show-current`, { encoding: "utf8" }).trim();
if (onBranch !== "main") {
  throw new Error(`${MAIN} อยู่บน branch '${onBranch}' ไม่ใช่ 'main' — หยุดก่อน`);
}
const { ITINERARY } = (await import(`${MAIN}/data/itinerary.ts`)) as { ITINERARY: any[] };

const q = (v: unknown) =>
  v === undefined || v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const b = (v: unknown) => (v ? "true" : "false");

const rows = ITINERARY.flatMap((d: any) =>
  (d.events ?? []).map((e: any, i: number) => ({ dayId: d.id, idx: i, ...e }))
);

const blob = execSync(`git -C ${MAIN} hash-object data/itinerary.ts`, { encoding: "utf8" }).trim();
// 🔴 **ต้องบอกด้วยว่าเป็น `data/itinerary.ts` ของ *ทรีไหน*** — ไฟล์นี้มีอยู่ทั้งสองทรี
//    และ blob ต่างกันจริง (ต่างกัน 2 บรรทัดว่าง · เนื้อหาเหมือนกัน แต่ hash ไม่เท่า)
//    → หมุดที่ไม่ระบุทรี **อ่านจากทรีผิดแล้วดูเหมือนล้าสมัย** ทั้งที่ไม่ได้ล้า (false red)
//    ฉบับแรกของไฟล์นี้ไม่ระบุ และผมหลงเองภายในห้านาที
const root = MAIN;
const branch = onBranch;
const kinds = new Map<string, number>();
rows.forEach((r: any) => kinds.set(String(r.kind), (kinds.get(String(r.kind)) ?? 0) + 1));

const tuples = rows
  .map((r: any) => {
    const f = r.flight ?? {};
    const l = r.layover ?? {};
    return `  (${q(r.dayId)}, ${r.idx}, ${q(r.kind === "transfer" ? "move" : r.kind)}, ` +
      `${q(r.time)}, ${q(r.endTime)}, ${q(r.anchor)}, ${r.dayOffset ?? 0}, ` +
      `${q(r.title)}, ${q(r.titleEn)}, ${q(r.icon)}, ${q(r.detail)}, ` +
      `${b(r.alert)}, ${b(r.editable)}, ${q(r.placeId)}, ` +
      `${q(f.no)}, ${q(f.fromCode)}, ${q(f.toCode)}, ${q(f.fromEn)}, ${q(f.toEn)}, ` +
      `${q(l.baggage)}, ${q(l.immigration)}, ` +
      `${r.layover ? b(l.leavesAirport) : "null"}, ${r.layover ? b(l.terminalChange) : "null"})`;
  })
  .join(",\n");

process.stdout.write(`-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E7 · ก้อนที่ 8: day.events ${rows.length} → trip_stops kind='event' × 2 แผน = ${rows.length * 2} แถว    │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- 🔴 **ไฟล์นี้ถูกสร้างด้วยเครื่อง ห้ามแก้ด้วยมือ** — แก้ที่ \`supabase-platform/e7/gen/gen_08_events.mts\` แล้วสร้างใหม่
--    ต้นทาง: \`${root}/data/itinerary.ts\` (branch \`${branch}\`)
--    **git blob \`${blob}\`**
--    ตรวจ: \`git -C ${root} hash-object data/itinerary.ts\` ต้องได้ค่าเดียวกัน
--    🔴 **ต้องใส่ \`-C\` ให้ตรงทรี** — ไฟล์ชื่อเดียวกันมีอยู่ทั้งสองทรีและ blob ไม่เท่ากัน
--    🎯 หมุดนี้ทำให้ *"SQL ที่ generate แล้วล้าสมัย"* ตรวจได้ด้วยคำสั่งเดียว แทนที่จะต้องเชื่อ
--
-- ต้องรัน \`01\` (วัน+แผน) และ \`02\` (custom_places — \`home-base\`) ก่อน
--
-- ── เหตุการณ์ ${rows.length} รายการ · แยกตาม kind ──
${[...kinds.entries()].sort().map(([k, n]) => `--   ${k === "undefined" ? "(ไม่มี kind)" : k.padEnd(12)} ${n}`).join("\n")}
--   🔴 \`transfer\` → \`move\` (\`column-map.md:410\` — ชนกับ \`trip_stops.kind='transfer'\`)
--   🔴 2 แถวไม่มี \`kind\` เลย → \`event_kind is null\` ซึ่ง \`column-map.md:410\` รับรองว่าเกิดจริง
--
-- ── 🔴 การตัดสินที่ต้องมีคนเห็น: events ลง **ทั้งสองแผน** ────────────────────
--   \`trip_stops.plan_id\` เป็น **not null** → เหตุการณ์ต้องสังกัดแผน
--   แต่ \`DayEvent\` ในระบบเก่าอยู่บน \`Day\` **ไม่ได้อยู่บนแผน** — เที่ยวบินเป็นข้อเท็จจริงของทริป
--   → ลงแผนเดียว = สลับแผนแล้ว **ตารางบินหายทั้งวัน** ซึ่งผิดแน่ ๆ
--   → ลงทั้งสองแผน = ซ้ำ 2 ชุด · แก้ชุดหนึ่งอีกชุดไม่ตาม
--   **เลือกอย่างหลัง** เพราะเป็นแบบเดียวกับ \`trip_day_plan_settings\` ที่ \`D69\` รับไปแล้ว
--   (\`usePlans.ts:104\` ก๊อปตั้งค่ารายวันต่อแผนจริงในโค้ดวันนี้)
--   ⚠️ **ยังไม่มี D number** — ส่ง P5/P8 ให้ตัดสินว่าควรมีไหม · ถ้าตัดสินเป็นอย่างอื่น
--      แก้ที่ generator แล้วสร้างใหม่ **ไม่ต้องไล่แก้ SQL ทีละแถว**
--
-- rank = \`'E' || lpad(idx,4,'0') || 'V'\` → \`E0000V\`…
--   · ผ่าน \`trip_stops_rank_shape\` (\`^[0-9A-Za-z]+$\` · ไม่ลงท้าย \`0\`)
--   · ไม่ชนกับ rank ของจุดแวะ (\`0000V\`…) และเรียงต่อท้ายเสมอ
--   · **ไม่ผูกกับเวลาโดยตั้งใจ** (\`D81\` ③.๒) — คิวรีที่หาขอบใช้ min/max ของเวลา ไม่ใช่ rank

begin;

create or replace function pg_temp.lid(kind text, id text) returns uuid
  language sql immutable as $$ select md5(kind || ':' || id)::uuid $$;

do $e7$
declare
  v_owner uuid;                              -- อ่านจาก trips.created_by (ก้อน 01 เป็นคนตั้ง)
  v_trip  uuid := pg_temp.lid('trip', 'korea-2026-10');
  n int; n_plans int; expected int;
begin
  -- 🔴 **เจ้าของอ่านจากฐาน ไม่ใช่จากตัวแปรเซสชัน** — ก้อน 01 เป็นที่เดียวที่รับค่าจากคน
  --    เหตุ ①: SQL editor ของ Supabase ใช้คอนเนกชันแบบพูล → คำสั่ง set อาจไม่อยู่ข้ามการกด Run
  --            ถ้าทุกก้อนพึ่ง GUC ผู้ใช้จะเจอ 'ต้องตั้ง e7.owner_uuid' ซ้ำ 7 รอบ
  --    เหตุ ② **สำคัญกว่า**: ตั้ง uuid ผิดในก้อนหลัง → แถวจะมีเจ้าของคนละคนกับก้อน 01
  --            **โดยไม่มี error ใด ๆ** · อ่านจากฐานทำให้ค่านั้นเป็นค่าเดียวเสมอตามนิยาม
  select t.created_by into v_owner from public.trips t where t.id = v_trip;
  if v_owner is null then
    raise exception 'ยังไม่มีทริป (หรือทริปไม่มีเจ้าของ) — รัน 01_trip_skeleton.sql ก่อน';
  end if;

  select count(*) into n_plans from public.trip_plans where trip_id = v_trip;
  if n_plans = 0 then raise exception 'ยังไม่มีแผน — รัน 01 ก่อน'; end if;

  with ev(day_key, idx, event_kind, t_start, t_end, bound, offs,
          title, title_en, icon, detail, alert, editable, place_id,
          f_no, f_from, f_to, f_from_en, f_to_en,
          l_bag, l_imm, l_leaves, l_term) as (values
${tuples}
  )
  insert into public.trip_stops (
    id, trip_id, plan_id, trip_day_id, rank, kind,
    catalog_place_id, custom_place_id, place_ref,
    event_kind, schedule_bound, fixed_start_time, fixed_end_time, day_offset,
    title, title_en, icon, note, is_alert, time_is_flexible,
    flight_no, flight_from_code, flight_to_code, flight_from_en, flight_to_en,
    layover_baggage, layover_immigration, layover_leaves_airport, layover_terminal_change,
    added_by_user, updated_at
  )
  select
    pg_temp.lid('event', p.id::text || ':' || e.day_key || '#' || e.idx),
    v_trip, p.id, pg_temp.lid('day', e.day_key),
    'E' || lpad(e.idx::text, 4, '0') || 'V', 'event',
    -- \`@hotel\` → place_ref · ที่เหลือแยกด้วย *สมาชิกภาพ* ไม่ใช่ prefix (ดูก้อน 03)
    case when e.place_id <> '@hotel'
          and not exists (select 1 from legacy.custom_places cp where cp.id = e.place_id)
         then (select c.id from public.catalog_places c where c.legacy_slug = e.place_id) end,
    case when e.place_id <> '@hotel'
          and exists (select 1 from legacy.custom_places cp where cp.id = e.place_id)
         then pg_temp.lid('custom_place', e.place_id) end,
    case when e.place_id = '@hotel' then 'hotel' end,
    e.event_kind, e.bound, e.t_start, e.t_end, e.offs,
    e.title, e.title_en, e.icon, e.detail, e.alert, e.editable,
    e.f_no, e.f_from, e.f_to, e.f_from_en, e.f_to_en,
    e.l_bag, e.l_imm, e.l_leaves, e.l_term,
    v_owner, now()
  from ev e cross join public.trip_plans p
  where p.trip_id = v_trip;

  -- ── ตรวจ ────────────────────────────────────────────────────────────────
  expected := ${rows.length} * n_plans;
  select count(*) into n from public.trip_stops where trip_id = v_trip and kind = 'event';
  if n <> expected then raise exception 'events ต้องได้ % แถว (${rows.length} × % แผน) ได้ %', expected, n_plans, n; end if;

  -- 🔴 ทุกแถวต้องหาที่ลงได้ — คลัง · custom · หรือ place_ref · **ห้ามเป็น 0 ทั้งสามช่อง**
  --    \`place_by_kind\` ยอมให้ event มี 0 ช่องได้ → **แถวที่หาไม่เจอจะผ่าน constraint เงียบ ๆ**
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind = 'event'
     and catalog_place_id is null and custom_place_id is null and place_ref is null;
  if n > 0 then raise exception '% แถว event ไม่มีที่ลงเลยสักช่อง — placeId หาไม่เจอ', n; end if;

  -- \`home-base\` ต้องลงฝั่ง custom จริง (2 แถวต่อแผน) — เคสที่กันการกลับไปเทียบ prefix
  select count(*) into n from public.trip_stops
   where trip_id = v_trip and kind = 'event' and custom_place_id is not null;
  if n <> 2 * n_plans then
    raise exception 'event ที่ชี้ custom place ต้องได้ % แถว ได้ % — home-base หลุดไปฝั่งคลัง?', 2 * n_plans, n;
  end if;

  -- ทุกแผนต้องได้ครบเท่ากัน — ไม่ใช่ยอดรวมตรงแต่กระจุกที่แผนเดียว
  select count(*) into n from (
    select plan_id from public.trip_stops where trip_id = v_trip and kind = 'event'
     group by plan_id having count(*) <> ${rows.length}
  ) x;
  if n > 0 then raise exception '% แผนได้ events ไม่ครบ ${rows.length} แถว', n; end if;

  raise notice 'E7 · events % แถว (${rows.length} × % แผน) · custom % · place_ref %',
    expected, n_plans,
    (select count(*) from public.trip_stops where trip_id=v_trip and kind='event' and custom_place_id is not null),
    (select count(*) from public.trip_stops where trip_id=v_trip and kind='event' and place_ref is not null);
end $e7$;

commit;
`);
