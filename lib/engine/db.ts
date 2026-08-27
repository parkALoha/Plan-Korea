// 🔴 **ด่านโครงสร้าง ไม่ใช่คำเตือน** — `build` ล้มทันทีถ้า client component ลากไฟล์นี้เข้าไป
//    P4 ไล่กราฟ import จาก 78 ไฟล์ที่มี `"use client"` เมื่อ 26 ส.ค. 2026 แล้วพบเส้นทางจริง:
//      `hooks/useStops.ts` → `lib/engine/trip.ts` → **ไฟล์นี้**
//    (`trip.ts` import `tripsVisibleToMe` ที่หัวไฟล์ · hook import แค่ฟังก์ชันบริสุทธิ์ข้าง ๆ)
//    ⚠️ คีย์ไม่ได้รั่ว — ไฟล์นี้รับ `Db` เข้ามา ไม่ import client ตัวไหนเอง
//       **สิ่งที่จะรั่วคือตรรกะกับชื่อตารางลงบันเดิลเบราว์เซอร์ ถ้า tree-shaking ไม่ตัด**
//    🎯 และประเด็นจริงคือ **เส้นแบ่ง server/client ถูกค้ำด้วย tree-shaking ซึ่งไม่มีใครตรวจ**
//       — *"มองไม่เห็น = ปลอดภัย"* อีกรูปหนึ่ง (คำของ P4 · รับเต็ม ๆ)
import "server-only";

/**
 * ชั้นเดียวที่ได้รับอนุญาตให้เรียกชื่อตารางของแพลตฟอร์ม — `D81` ⑦.๕
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## ทำไมไฟล์นี้ถึงมีอยู่ (P6 เสนอรูป · P4 แก้รูปให้แคบไม่ได้)
 *
 * `D81` ③ · ③.๕ · ③.๖ ผูกกติกาไว้กับ **คิวรี** ไม่ใช่กับ **สคีมา** — และ DDL บังคับมันไม่ได้เลย:
 * ```
 * ถามว่า "แถวไหนกำหนดขอบของวัน"  →  ต้องมี  deleted_at is null  และ  order by rank, id
 * browse คลังสถานที่               →  ต้องมี  not picker_hidden
 * ```
 * 🔴 **ทั้งสามข้อ ลืมแล้วไม่แดง** — ผลลัพธ์หน้าตาถูกต้องทุกประการ:
 * · ลืม `order by`      → 2 เครื่องเลือกคนละแถว → timeline ตัดคนละที่
 * · ลืม `deleted_at`    → ทั้ง 2 เครื่องเลือก **แถวที่ผู้ใช้ลบไปแล้วและ UI ไม่แสดง** เหมือนกัน
 * · ลืม `picker_hidden` → Copilot ตอบ *"ปูซานมีที่ไหนน่าไปอีก"* ด้วยลิสต์ที่มี **สถานีบัส** ปนอยู่
 *
 * 🎯 **P6 ปฏิเสธด่านที่ถามว่า *"ทุกคิวรีจำ predicate ได้ไหม"*** — มันต้องเดาว่าคิวรีไหนเป็น
 * browse query ซึ่งเป็นหมวดหมู่**เชิงความหมาย** · ด่านที่ต้องเดา คือด่านที่จะเดาผิดสักวัน
 * > **ย้ายการบังคับจาก *"จำได้ไหม"* → *"เลี่ยงไม่ได้"***
 *
 * ## 🔴 สถานะวันนี้: 2 ใน 3 ขา — และผมเขียนไว้ตรงนี้แทนที่จะปล่อยให้เข้าใจว่าครบ
 * ```
 * ① DDL       ✅ 20260826010130_e2_d81_trip_stop_events.sql
 * ② helper    ✅ ไฟล์นี้
 * ③ ด่าน CI   ⏳ โซนของ P6 — ห้าม `.from(` นอกไฟล์นี้ (ยกเว้น Array.from / .storage.from)
 * ```
 * `D81` ⑦.๕ เขียนว่าทั้งสามต้องมาพร้อมกัน · **ขาที่ ③ อยู่คนละโซน ผมเขียนแทนไม่ได้**
 * · เหตุผลที่ยังลง ② ก่อน: **`catalog_places` มี `.from(` ในโค้ดที่เสิร์ฟผู้ใช้ = 0 จุด** (`P-61`)
 *   ช่องว่างระหว่าง ② กับ ③ จึงกว้างเท่ากับ *จำนวนจุดเรียกที่ถูกเขียนในระหว่างนั้น* — ซึ่งวันนี้คือศูนย์
 * · 🔴 **และผมจะไม่เขียนจุดเรียกใหม่จนกว่า ③ จะลง** — ไม่งั้นเหตุผลข้างบนหมดอายุด้วยมือผมเอง
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** ตารางของแพลตฟอร์มที่ชั้นนี้ดูแล — เพิ่มตารางใหม่ = เพิ่มฟังก์ชันในไฟล์นี้ ไม่ใช่เรียก `.from` ที่อื่น */
export type EngineTable =
  | "trips"
  | "catalog_countries"
  | "catalog_cities"
  | "catalog_places"
  | "catalog_place_names"
  | "catalog_country_contacts"
  | "catalog_place_access"
  | "trip_days"
  | "trip_destinations"
  | "trip_stops"
  | "custom_places"
  | "hidden_places"
  | "place_notes"
  | "trip_hotels"
  | "checklist_items"
  | "trip_day_plan_settings"
  | "bookings"
  | "trip_plans";

/**
 * 🔴 **ไคลเอนต์ถูก *ส่งเข้ามา* ไม่ใช่ import — และนี่คือทั้งหมดของ `E3`**
 *
 * ฉบับแรกผม `import { supabase }` จาก `lib/supabase` ตรง ๆ ซึ่งเป็น**ไคลเอนต์ฝั่งเบราว์เซอร์**
 * → ผูกชั้นข้อมูลไว้กับเบราว์เซอร์ถาวร **ทั้งที่ `E3-AC1` ต้องการให้คิวรีย้ายไปฝั่งเซิร์ฟเวอร์**
 *
 * 🎯 **รับเข้ามาเป็นพารามิเตอร์ = ฟังก์ชันเดียวใช้ได้ทั้งสองฝั่ง และ *ผู้เรียกเป็นคนตัดสินว่าเป็นใคร***
 * · ฝั่งเซิร์ฟเวอร์ส่ง `createServerSupabase()` ซึ่งผูก session ผู้ใช้จริง → **RLS ทำงานเหมือนเดิมทุกประการ**
 * · 🔴 **นี่คือ `D38` ในรูปโครงสร้าง ไม่ใช่ในรูปคำเตือน** — ย้ายไปเซิร์ฟเวอร์**ไม่ได้**แปลว่าได้สิทธิ์เพิ่ม
 *   เพราะไม่มีที่ไหนในไฟล์นี้ที่ *เลือก* ตัวตนได้เลย · ใครส่ง client อะไรมา ก็ได้สิทธิ์เท่านั้น
 * · ⚠️ **ห้ามใส่ค่าเริ่มต้นให้ `db`** — ค่าเริ่มต้นคือการเลือกตัวตนแทนผู้เรียก ซึ่งคือสิ่งที่ย่อหน้านี้ห้าม
 */
export type Db = SupabaseClient;

/**
 * 🔴 **จุดเดียวในแอปที่พิมพ์ชื่อตารางของแพลตฟอร์มได้**
 *
 * ตั้งใจไม่ `export` — ถ้ามันออกไปข้างนอกได้ ด่านของ P6 จะเห็นแค่ `engineTable(db, "x")`
 * ซึ่งเป็นสตริงเหมือนเดิม **แต่ predicate ไม่ถูกใส่ให้** = ได้ท่ากลับมาโดยไม่ได้อะไรเลย
 */
function engineTable(db: Db, name: EngineTable) {
  return db.from(name);
}

// ───────────────────────────────────────────────────────────────────────────
// คลังสถานที่ — `D81` ③.๖
// ───────────────────────────────────────────────────────────────────────────

/**
 * **browse** คลัง = "มีที่ไหนน่าไปอีก" → ต้องไม่มีสนามบิน/สถานีปนมา
 *
 * `transferPoints.ts:28` เขียนเหตุผลไว้เองว่า *"สนามบิน/สถานี ไม่ใช่ที่เที่ยว
 * ไม่ควรโผล่ในคลังสถานที่ให้เลือกเพิ่มลงวัน"* — วันนี้กฎนั้นบังคับด้วย**การอยู่คนละไฟล์**
 * พอทั้งคู่เป็นแถวใน `catalog_places` ตารางเดียวกัน เหลือแค่คอลัมน์ธง
 */
export function browseCatalogPlaces(db: Db, opts: { cityId?: string; countryId?: string; limit?: number }) {
  let q = engineTable(db, "catalog_places").select("*").eq("picker_hidden", false);
  if (opts.cityId) q = q.eq("city_id", opts.cityId);
  if (opts.countryId) q = q.eq("country_id", opts.countryId);
  return q.limit(opts.limit ?? 50);
}

/**
 * **resolve** คลัง = "แถวนี้คือที่ไหน" → **ต้องไม่กรอง `picker_hidden`**
 *
 * 🔴 **ความต่างนี้คือทั้งหมดของ `picker_hidden` และมันกลับด้านกับ browse:**
 * จุดแวะที่ `kind='transfer'` ชี้ไปที่สนามบินจริง ๆ · ถ้า resolve กรองมันออกด้วย
 * **แถวสนามบินในแผนของผู้ใช้จะกลายเป็นแถวที่ "ไม่รู้จักสถานที่" ทั้งที่ข้อมูลอยู่ครบ**
 * · `picker_hidden` แปลว่า *"ไม่โผล่ในลิสต์ให้เลือก"* **ไม่ได้แปลว่า "ไม่มีอยู่"**
 */
export function catalogPlaceById(db: Db, id: string) {
  return engineTable(db, "catalog_places").select("*").eq("id", id).maybeSingle();
}

/**
 * ค้นเมืองในคลังด้วยคำที่ผู้ใช้พิมพ์ — ตัวป้อนของ autocomplete "เมืองปลายทาง" ในฟอร์มสร้างทริป (`E5`)
 *
 * ค้นทั้ง 3 ชื่อ (`name_th` · `name_en` · `name_local`) เพราะผู้ใช้พิมพ์ได้ทั้ง "ฮานอย" · "Hanoi" · "Hà Nội"
 * และ **ไม่มีชื่อไหนเป็นชื่อหลัก** — คลังเก็บทั้งสามเป็นข้อมูลเท่ากัน
 *
 * 🔴 **`q` ถูกล้างก่อนต่อเป็น filter ของ PostgREST เสมอ**
 * ไวยากรณ์ `.or()` แยกเงื่อนไขด้วย `,` และห่อด้วย `()` → คำค้นที่มีอักขระพวกนั้น
 * **ไม่ได้ทำให้คิวรีพัง มันทำให้คิวรีกลายเป็นคิวรีอื่น** ซึ่งอ่านผลเป็น "ไม่เจอ" ได้สนิท
 * · `%` และ `_` เป็น wildcard ของ `ilike` → ผู้ใช้พิมพ์ `%` แล้วได้ทั้งคลัง เป็นเรื่องคนละเรื่องกับที่เขาถาม
 * 🎯 กันที่นี่ ไม่ใช่ที่ route — ใครก็ตามที่เรียกฟังก์ชันนี้ในอนาคตได้การกันไปด้วยโดยไม่ต้องรู้
 */
export function searchCatalogCities(
  db: Db,
  opts: { q: string; countryId?: string; limit?: number },
) {
  const safe = opts.q.replace(/[,()%_*\\]/g, " ").trim();
  let query = engineTable(db, "catalog_cities").select("id, country_id, name_th, name_en, name_local");
  if (safe !== "") {
    query = query.or(
      `name_th.ilike.%${safe}%,name_en.ilike.%${safe}%,name_local.ilike.%${safe}%`,
    );
  }
  if (opts.countryId) query = query.eq("country_id", opts.countryId);
  return query.order("name_th").limit(opts.limit ?? 20);
}

// ───────────────────────────────────────────────────────────────────────────
// จุดแวะและเหตุการณ์ของวัน — `D81` ③ · ③.๕
// ───────────────────────────────────────────────────────────────────────────

/**
 * จุดแวะทั้งหมดของวันในแผนนี้ **ที่ยังไม่ถูกลบ** เรียงตาม `(rank, id)`
 *
 * `rank` ไม่ unique โดยตั้งใจ (`D6`) → **`id` คือ tie-break ที่ทำให้ 2 เครื่องได้ลำดับเดียวกัน**
 * ไม่ใช่รายละเอียดของ `order by` แต่เป็นเหตุผลที่ `order by` มีอยู่
 */
export function dayStops(db: Db, opts: { tripDayId: string; planId: string }) {
  return engineTable(db, "trip_stops")
    .select("*")
    .eq("trip_day_id", opts.tripDayId)
    .eq("plan_id", opts.planId)
    .is("deleted_at", null)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}

/**
 * แถวที่ **กำหนดขอบของวัน** — `schedule_bound = 'before' | 'after'`
 *
 * 🔴 **ห้ามมีทางเรียกที่ได้ผลลัพธ์นี้โดยไม่มี `deleted_at is null` + `order by rank, id`**
 * เพราะสองครึ่งนี้พังคนละแบบ และไม่มีครึ่งไหนส่งเสียง:
 * ```
 * ขาด order by   → 2 เครื่องเลือกคนละแถว
 * ขาด deleted_at → 2 เครื่องเลือกแถวที่ตายแล้ว เหมือนกันทั้งคู่ (แย่กว่า เพราะดู "สอดคล้อง")
 * ```
 * · `D81` ④ ห้าม unique *"หนึ่ง `before` ต่อวัน"* → **ที่นี่ต้องพร้อมรับหลายแถว**
 *
 * 🔴 **ฉบับแรกของคอมเมนต์นี้เขียนว่า *"ตัวแรกของลิสต์คือตัวที่ชนะ"* — ผิด และ P5 แก้ให้ (26 ส.ค. 2026)**
 * > **ขอบคือ *ข้อจำกัด* ขอบที่ซ้อนกันจึง *ตัดกัน*** — `after` เอา**น้อยที่สุด** · `before` เอา**มากที่สุด**
 * `rank` เรียงหน้าจอ และผม**จงใจไม่ผูกมันกับเวลา** → **เป็นได้แค่ tie-break**
 * · และเทียบต้องทำบน**นาทีจริง** (`day_offset * 1440 + HH:MM`) ไม่ใช่บนสตริง — ทริปนี้มีแถว 01:15 ที่ `day_offset=1`
 *
 * 📌 **กฎอยู่ที่ [`scheduleBounds.ts`](./scheduleBounds.ts) → `pickScheduleBounds()` ใช้ตัวนั้น อย่าเลือกเอง**
 */
export function dayScheduleBounds(db: Db, opts: { tripDayId: string; planId: string }) {
  return engineTable(db, "trip_stops")
    .select("*")
    .eq("trip_day_id", opts.tripDayId)
    .eq("plan_id", opts.planId)
    .eq("kind", "event")
    .not("schedule_bound", "is", null)
    .is("deleted_at", null)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}

/**
 * ⚠️ **จงใจคืน tombstone ด้วย** — ใช้กับกฎ merge ของ `E2-AC12` เท่านั้น
 *
 * เป็นฟังก์ชันแยกเพราะ *"อ่าน tombstone"* ต้องเป็นการ **เลือก** ที่มีชื่อ
 * ไม่ใช่สิ่งที่เกิดขึ้นเพราะใครลืมใส่ `.is("deleted_at", null)`
 */
export function dayStopsIncludingDeleted(db: Db, opts: { tripDayId: string; planId: string }) {
  return engineTable(db, "trip_stops")
    .select("*")
    .eq("trip_day_id", opts.tripDayId)
    .eq("plan_id", opts.planId)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}

// ───────────────────────────────────────────────────────────────────────────
// ค้นชื่อสถานที่ — `D56` · รูปพารามิเตอร์จาก `copilot-spec.md §25` (P5)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 🔴 **`intent` เป็น required และ TS ก็บังคับเหมือนที่ SQL บังคับ — จงใจซ้ำกันสองชั้น**
 *
 * P5: *ค่าเริ่มต้นใดก็ตาม **ถูกครึ่งหนึ่งของเวลา และเงียบอีกครึ่งหนึ่ง***
 * · default `discover` → ผู้ใช้ถามถึงจุดในแผนตัวเอง แล้วได้ *"ไม่เจอ"*
 * · default `identify` → ขอบเขตแคบเกิน แล้วได้ *"ไม่เจอ"* เหมือนกัน
 * **ทั้งสองพังด้วยข้อความเดียวกันเป๊ะ → แยกไม่ออกจาก log ว่าตั้ง default ผิดข้าง**
 *
 * | | `identify` — *"'ตลาดกลางคืน' คือจุดไหนในแผน"* | `discover` — *"หาที่แบบนี้ให้เพิ่ม"* |
 * |---|---|---|
 * | ขอบเขต | เฉพาะที่ทริปนี้อ้างถึงแล้ว (`trip_stops`) · **รวม `custom_places`** | `catalog_places` ของเมืองนั้น |
 * | `picker_hidden` | **ไม่กรอง** — สนามบินคือจุดแวะจริง | **กรอง** |
 * | ตัดของที่อยู่ในแผนแล้ว | **ไม่** — นั่นคือสิ่งที่กำลังหา | **ใช่** |
 */
export type PlaceSearchIntent = "identify" | "discover";

export type PlaceSearchHit = {
  source: "catalog" | "custom";
  place_id: string;
  city_id: string | null;
  matched_name: string;
  locale: string;
  score: number;
};

/**
 * 🔴 **RPC นี้เป็น `security invoker`** — RLS เป็นตัวจำกัดขอบเขตให้เอง
 * ไม่มีบรรทัดไหนในนั้นเช็คว่าใครเป็นเจ้าของทริป และนั่นคือเหตุผลที่มันจะยังถูกวันที่ policy เปลี่ยน (`D38`)
 */
export function searchPlaceNames(db: Db, opts: {
  tripId: string;
  query: string;
  intent: PlaceSearchIntent;
  cityId?: string;
  limit?: number;
}) {
  return db.rpc("search_place_names", {
    p_trip_id: opts.tripId,
    p_query: opts.query,
    p_intent: opts.intent,
    p_city_id: opts.cityId ?? null,
    p_limit: opts.limit ?? 20,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ทริปของผู้ใช้ — `E3` · ตรรกะการเลือกอยู่ที่ [`trip.ts`](./trip.ts) ไม่ใช่ที่นี่
// ───────────────────────────────────────────────────────────────────────────

/**
 * โหมดของทั้งระบบ — `E3-AC7` · **`anon` เรียกได้โดยตั้งใจ**
 *
 * 🔴 คนที่กลับมาเปิดแอประหว่าง cutover **ต้องรู้ก่อนเริ่มพิมพ์ ไม่ใช่หลังจากพิมพ์โน้ตยาว ๆ
 * แล้วกดบันทึกไม่ได้** (P7 · ข้อที่เขาบอกว่าสำคัญที่สุดใน 4 ข้อ)
 * → ธงต้องอ่านได้ตั้งแต่ก่อนล็อกอิน · `P-50`: **ธงที่อ่านไม่ได้ ไม่ใช่ธง**
 *
 * ⚠️ คืนแค่ `read_only` + `reason` · **ไม่คืน `allow_maintenance_write`**
 *    เพราะไม่ใช่เรื่องของผู้ใช้ และเป็นครึ่งหนึ่งของด่าน
 */
export function systemMode(db: Db) {
  return db.rpc("system_mode");
}

/**
 * สร้างทริปใหม่ **พร้อมแผนเริ่มต้น** — `create_trip` (`20260825143958`)
 *
 * ## 🔴 ทำไมเพิ่งมี ทั้งที่ RPC อยู่ในฐานมาตั้งแต่ 25 ส.ค.
 * `grep -rn "create_trip" app/ components/ hooks/ lib/` → **ไม่มีอะไรเรียกมันเลยสักที่**
 * → **ไม่มีทางสร้างทริปจาก UI** → บัญชีใหม่ทุกบัญชีค้างอยู่ที่ *"ยังไม่มีทริป"* ตลอดกาล
 *
 * 🎯 **และนั่นคือเหตุผลที่ไม่มีใคร live-verify อะไรได้เลยทั้งวัน** — P2 รายงานว่าเปิดหน้าจริงไม่ได้
 * 4 รอบติดกัน (`TripHeader` · `NearbyPlacesModal` · โมดัล read-only · `ImmigrationSheet`)
 * **ทุกครั้งด้วยเหตุผลเดียวกัน และไม่มีใคร (รวมผม) ถามว่าทำไมบัญชีนั้นถึงไม่มีทริป**
 * · ครึ่งที่เหลือของ `E4-AC1` (เปิดหน้าทริปญี่ปุ่นจริง) ก็ติดข้อนี้เหมือนกัน
 *
 * ## ⚠️ `security definer` ตัวนี้ **ไม่ใช่สิทธิ์พิเศษ** (`D38`)
 * มันอ่าน `auth.uid()` ของ**ผู้เรียก** · เรียกผ่าน `createServerSupabase()` = session ของผู้ใช้จริง
 * **ไม่มี service role key เข้ามาเกี่ยวข้องเลย** · `authNoServiceRole.test.ts` ยังบังคับ `app/` เหมือนเดิม
 * · ที่มันต้องเป็น `definer` เพราะมันเขียน `trips` + `trip_plans` ในทรานแซกชันเดียว
 */
export function createTrip(
  db: Db,
  args: { title: string; startDate: string; endDate: string; baseTimezone?: string | null },
) {
  return db.rpc("create_trip", {
    p_title: args.title,
    p_start_date: args.startDate,
    p_end_date: args.endDate,
    p_base_timezone: args.baseTimezone ?? null,
  });
}


/**
 * ทริปทั้งหมดที่ผู้ใช้เห็นได้ **เรียงตามเวลาสร้าง**
 *
 * 🔴 **ไม่มี `where` เรื่องสิทธิ์ในนี้เลย — `trips_select` เป็นคนกรอง**
 * เขียน `.eq("owner", …)` เอง = แหล่งความจริงที่สองเรื่องสิทธิ์ ที่ต้องคอยให้ตรงกับ policy ตลอดไป (`P-15`)
 *
 * ⚠️ **`order` มีไว้ให้ผลคงที่ ไม่ได้มีไว้ให้ใครหยิบตัวแรก** — ดู `trip.ts` ว่าทำไมการหยิบตัวแรกถึงผิด
 */
export function tripsVisibleToMe(db: Db) {
  // 🔴 **`title` ไม่ใช่ `name`** — แก้ 27 ส.ค. 2026 (P4 เจอตอนสร้าง harness ยิง route จริง)
  //    คอลัมน์ชื่อ `title` มาตั้งแต่ `…043822_identity.sql:122` และ `create_trip` ก็ insert `title`
  //    ผมเขียน `name` ไว้ตั้งแต่แรก → **`GET /api/engine/trips` คืน `502` ให้ทุกผู้ใช้ ทุกครั้ง**
  //
  // 🎯 **ไม่มีเทสต์ไหนจับได้เลย และเหตุผลคือรูปของชุดทดสอบ ไม่ใช่ความประมาท**
  //    `rlsMatrix` ทดสอบสิทธิ์ที่ **ชั้นตาราง** — มันยิง `.from("trips")` เองด้วยชื่อคอลัมน์ของมันเอง
  //    **ไม่เคยเรียก `tripsForUser()`** · helper กับเทสต์จึงเห็นสคีมาคนละใบโดยไม่มีอะไรเทียบให้
  //    → นี่คือเหตุผลที่ `E3-AC9` ② ต้องยิง *route จริง* ไม่ใช่ทดสอบ db helper แยก
  // 🔴 **`start_date`/`end_date` เพิ่ม 27 ส.ค. 2026 — P2 flag ตอนทำ `TripHeader`**
  //    หัวหน้าจอเคยฝังช่วงวันที่ตายตัว (`"11–21 ต.ค. · เที่ยวเกาหลี 12–20"`) · P2 **ลบทิ้งแทนที่จะเดาใหม่**
  //    เพราะ helper นี้ไม่ได้ส่งวันที่มาให้ ทั้งที่ฐานมีคอลัมน์อยู่แล้ว — **ลบดีกว่าเดา**
  // ⚠️ `revoke` ที่ `20260825122247` ถอนแค่ `insert`/`update` · **`select` ระดับตารางยังอยู่** (ตรวจแล้ว)
  return engineTable(db, "trips").select("id, title, start_date, end_date").order("created_at");
}

/**
 * แถวคลังสถานที่ของทริป **พร้อมชื่อทุกภาษาและ slug ของเมือง ในคำขอเดียว**
 *
 * 🔴 **join ที่นี่ ไม่ใช่ยิงทีละใบจากชั้นบน** — คลังของทริปหนึ่งมีได้หลายสิบแถว
 * ยิงชื่อทีละแถวคือ N+1 ที่จะไม่มีใครสังเกตจนกว่าทริปจะใหญ่
 * · การแปลงรูปอยู่ที่ [`customPlaces.ts`](./customPlaces.ts) — ที่นี่มีแต่ *รูปคิวรี*
 */
export function customPlaceRowsOfTrip(db: Db, tripId: string) {
  return engineTable(db, "custom_places")
    .select(
      "id, city_id, category, lat, lng, maps_query, google_place_id," +
        " legacy_added_by, created_at," +
        // 🔴 `country_id` เพิ่ม 27 ส.ค. 2026 (`E4-AC3`/`AC4`) — **ประเทศผูกกับ *เมือง* ไม่ใช่ *ทริป***
        //    `trips` ไม่มีคอลัมน์ประเทศเลย (มี `base_timezone`) และนั่นถูก:
        //    ทริปปัจจุบันข้ามเวียดนาม→เกาหลีอยู่แล้ว · **ทริปเดียวมีได้หลายประเทศ**
        //    → UI ต้องเลือกปุ่มแผนที่จากเมืองของสถานที่นั้น ไม่ใช่จากทริป
                " catalog_cities(legacy_slug, country_id)," +
        " custom_place_names(locale, name, priority)," +
        " custom_place_descriptions(locale, description)"
    )
    .eq("trip_id", tripId)
    .order("created_at");
}

/**
 * สร้างสถานที่ในคลังของทริป — **หนึ่งคำขอ หนึ่งทรานแซกชัน**
 *
 * 🔴 หนึ่งสถานที่ = 1 แถวใน `custom_places` + N แถวใน `custom_place_names`
 * เขียนทีละคำสั่งแล้วล้มกลางคัน = **สถานที่ที่ไม่มีชื่อ ซึ่งไม่พังอะไรเลย มันแค่เป็นการ์ดเปล่า**
 * · RPC เป็น `security invoker` → **ไม่ได้ให้สิทธิ์ใครเพิ่ม ให้แค่ทรานแซกชัน** (`D38`)
 */
export function createCustomPlace(
  db: Db,
  input: {
    tripId: string;
    citySlug: string;
    category: string;
    lat: number;
    lng: number;
    mapsQuery: string;
    nameTh: string;
    nameEn?: string | null;
    nameKo?: string | null;
    description?: string | null;
    googlePlaceId?: string | null;
    legacyAddedBy?: string | null;
  }
) {
  return db.rpc("create_custom_place", {
    p_trip_id: input.tripId,
    p_city_slug: input.citySlug,
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_maps_query: input.mapsQuery,
    p_name_th: input.nameTh,
    p_name_en: input.nameEn ?? null,
    p_name_ko: input.nameKo ?? null,
    p_description: input.description ?? null,
    p_google_place_id: input.googlePlaceId ?? null,
    p_legacy_added_by: input.legacyAddedBy ?? null,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// วันของทริป — `E3` · `D80` (ความตั้งใจเรื่องที่นอนอยู่บน `trip_days`)
// ───────────────────────────────────────────────────────────────────────────

/**
 * วันทั้งหมดของทริป **พร้อม slug ของเมืองที่ตั้งใจนอน ในคำขอเดียว**
 *
 * 🔴 `order by date` ไม่ใช่เพื่อความสวยงาม — [`dayBridge.ts`](./dayBridge.ts) จับคู่ด้วย `date`
 * และผลที่ลำดับไม่แน่นอนทำให้ *ตัวไหนชนะตอนวันที่ซ้ำ* เปลี่ยนไปมาระหว่างเครื่อง
 */
export function tripDaysOfTrip(db: Db, tripId: string) {
  return engineTable(db, "trip_days")
    .select("id, date, overnight_kind, overnight_city_id, catalog_cities!trip_days_overnight_city_id_fkey(legacy_slug)")
    .eq("trip_id", tripId)
    .order("date");
}

/**
 * ตั้ง *ความตั้งใจ* เรื่องที่นอนของวันหนึ่ง — `D80`
 *
 * 🔴 **`overnight_kind` กับ `overnight_city_id` ต้องเขียนพร้อมกันเสมอ**
 * `trip_days_overnight_consistent` บังคับให้ทั้งคู่สอดคล้องกัน → เขียนทีละตัวจะชน `check`
 * · `null` = **ยังไม่ตัดสิน** ซึ่งต่างจาก `'none'` (ตั้งใจไม่นอนโรงแรม) — `D80` ห้ามยุบสองอันนี้
 */
export function setOvernightIntent(
  db: Db,
  dayId: string,
  intent: { kind: "city"; cityId: string } | { kind: "none" } | { kind: "undecided" }
) {
  const patch =
    intent.kind === "city"
      ? { overnight_kind: "city", overnight_city_id: intent.cityId }
      : intent.kind === "none"
        ? { overnight_kind: "none", overnight_city_id: null }
        : { overnight_kind: null, overnight_city_id: null };
  // `.select()` เพื่อให้ `writeGuard` เห็นว่าแตะกี่แถว — 0 แถว = RLS กรองออก ไม่ใช่สำเร็จ
  return engineTable(db, "trip_days").update(patch).eq("id", dayId).select("id");
}

/** หา `city_id` จาก slug เดิม — `null` = ไม่รู้จักเมืองนั้น
 *  🔴 รวม `country_id` มาด้วยเสมอ (`E5` — P1 ขอให้ P3 ส่ง `country` กลับหลังเขียนที่พัก) — เพิ่ม
 *  แบบ additive ล้วน ผู้เรียกเดิม 2 จุด (`hotels`/`days` route) ยังอ่านแค่ `.id` เหมือนเดิมได้ */
export function cityIdBySlug(db: Db, slug: string) {
  return engineTable(db, "catalog_cities").select("id, country_id").eq("legacy_slug", slug).maybeSingle();
}

// ───────────────────────────────────────────────────────────────────────────
// สถานที่ที่ซ่อนไว้ — `E3`
// ───────────────────────────────────────────────────────────────────────────

/**
 * สถานที่ที่ซ่อนของทริป **พร้อม slug เดิม** — UI อ้างสถานที่ด้วย slug ไม่ใช่ `uuid`
 *
 * 🔴 **การแปลง slug ⇄ uuid อยู่ *ฝั่งเซิร์ฟเวอร์* ไม่ใช่ฝั่งไคลเอนต์**
 * ต่างจากสะพานวัน (`dayBridge`) ที่ต้องอยู่ฝั่ง client เพราะ `"d0"` มีอยู่แต่ในไฟล์ TS
 * · **`legacy_slug` อยู่ในฐาน** → เซิร์ฟเวอร์แปลงได้เอง และไคลเอนต์ไม่ต้องรู้จัก `uuid` เลย
 * 🎯 **เลือกฝั่งตาม *ข้อมูลอยู่ที่ไหน* ไม่ใช่ตามความเคยชิน** — ผิดฝั่งแล้วต้องส่ง uuid ไปกลับโดยไม่มีเหตุผล
 */
export function hiddenPlacesOfTrip(db: Db, tripId: string) {
  return engineTable(db, "hidden_places")
    .select("hidden_at, legacy_hidden_by, catalog_places(legacy_slug)")
    .eq("trip_id", tripId);
}

/** ซ่อนสถานที่ — รับ slug แล้วให้ฐานหา `uuid` เอง ผ่านคิวรีซ้อน */
export function hidePlaceBySlug(db: Db, tripId: string, placeId: string, legacyHiddenBy: string | null) {
  return engineTable(db, "hidden_places")
    .insert({ trip_id: tripId, catalog_place_id: placeId, legacy_hidden_by: legacyHiddenBy })
    // `hidden_at` มาจาก `default now()` ฝั่งฐาน — ดึงกลับมาด้วย ไม่ให้ไคลเอนต์ปั้นเอง (`D7`)
    .select("catalog_place_id, hidden_at");
}

export function unhidePlace(db: Db, tripId: string, placeId: string) {
  return engineTable(db, "hidden_places")
    .delete()
    .eq("trip_id", tripId)
    .eq("catalog_place_id", placeId)
    .select("catalog_place_id");
}

/** `legacy_slug` → `catalog_places.id` · `null` = คลังไม่รู้จัก slug นั้น */
export function catalogPlaceIdBySlug(db: Db, slug: string) {
  return engineTable(db, "catalog_places").select("id").eq("legacy_slug", slug).maybeSingle();
}

// ───────────────────────────────────────────────────────────────────────────
// โน้ต/รูปที่ฝากไว้กับสถานที่ — `E3`
// ───────────────────────────────────────────────────────────────────────────

/**
 * โน้ตของแผนหนึ่ง **พร้อม slug ของสถานที่ทั้งสองชนิด**
 *
 * 🔴 `place_notes` ชี้สถานที่ได้**สองทาง** (`catalog_place_id` หรือ `custom_place_id`)
 * โดยมี `place_notes_one_place` บังคับว่าต้องมีทางเดียว
 * → ต้อง join **ทั้งสองฝั่ง** แล้วเลือกอันที่ไม่ใช่ `null` · **join ฝั่งเดียวจะทำให้โน้ตของ
 *   สถานที่ที่ผู้ใช้เพิ่มเองหายไปเงียบ ๆ** ซึ่งเป็นครึ่งหนึ่งของโน้ตทั้งหมดในทริปจริง
 */
export function placeNotesOfPlan(db: Db, tripId: string, planId: string) {
  return engineTable(db, "place_notes")
    .select("note, photo_path, updated_at, catalog_places(legacy_slug), custom_places(id)")
    .eq("trip_id", tripId)
    .eq("plan_id", planId)
    .is("deleted_at", null);
}

/** เขียนโน้ต — ผู้เรียกต้องระบุแล้วว่าเป็นสถานที่ชนิดไหน (คลังกลาง vs ของทริป) */
/**
 * 🔴 **ไม่ใช้ `.upsert()` — ตัวที่สองของวัน · คนละกลไกกับ `upsertDaySettings` แต่ตระกูลเดียวกัน** (P4 พบ)
 *
 * ## อาการ: **เจ้าของทริป PUT โน้ตของตัวเองก็ได้ `502`**
 * ```
 * 42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification
 * ```
 *
 * ## เหตุ
 * ดัชนีกันซ้ำของตารางนี้เป็น **partial** (`20260826132428`):
 * ```sql
 * create unique index place_notes_one_per_catalog_place
 *   on public.place_notes (plan_id, catalog_place_id)
 *   where catalog_place_id is not null;      -- ← predicate
 * ```
 * `ON CONFLICT (cols)` จะ match ดัชนี partial ได้ **ก็ต่อเมื่อมี `WHERE` ที่ตรงกันด้วย**
 * แต่ PostgREST `.upsert()` ส่งแค่**รายชื่อคอลัมน์** ไม่ส่ง predicate → planner หาไม่เจอ → **ล้มทุกคน**
 * · เป็นความล้มเหลวตอน *วางแผน* → ไม่เกี่ยวกับ RLS/fixture · **เจ้าของก็โดน**
 *
 * ## 🎯 ทางที่ **ไม่** เลือก: ทำให้ดัชนีเลิก partial
 * migration เขียนเหตุผลไว้เอง: *"**ไม่ partial ตาม `deleted_at`** — tombstone ต้องกันที่ของมันไว้
 * ไม่งั้นลบโน้ตแล้วเขียนใหม่จะได้สองแถว แล้ว `D76` จะทำให้มันค้างตลอดไป"*
 * · และ predicate `is not null` ก็จำเป็น เพราะแถวหนึ่งผูกกับ *คลัง* หรือ *สถานที่ของทริป* อย่างใดอย่างหนึ่ง
 * 🔴 **แก้ดัชนีให้เข้ากับ `.upsert()` = เปลี่ยนโครงข้อมูลเพื่อให้เข้ากับไลบรารี — กลับหัวกลับหาง**
 *
 * ## ทางที่เลือก: `update` → `insert` เฉพาะที่ยังไม่มี — **รูปเดียวกับ `upsertDaySettings`**
 * · `update` ส่งเฉพาะ `note`/`photo_path` ซึ่งเป็น **ทั้งหมดที่ `authenticated` มีสิทธิ์เขียน**
 * · ชน `23505` → แก้ทับ (อีกเครื่องสร้างแทรกระหว่างสองจังหวะ)
 *
 * ## 🔴 `.is("deleted_at", null)` — **แก้ 27 ส.ค. 2026 หลัง P4 วัดได้ `403` แล้วผมไล่ต่อ**
 *
 * ฉบับแรกของการแก้นี้ (`04b7171`) ผม `update` โดย**ไม่กรอง `deleted_at`** เพราะคิดว่า
 * *"พฤติกรรมเหมือน `.upsert()` เดิมทุกประการ"* · **ผิด และผลของมันคือเคสที่แย่ที่สุดชนิดหนึ่ง:**
 *
 * ```
 * ① update (ไม่กรอง) → policy `place_notes_update` ไม่มีเงื่อนไข deleted_at → **เขียนทับ tombstone สำเร็จ**
 * ② .select(...)      → policy `place_notes_select` มี `and deleted_at is null` → **คืน 0 แถว**
 * ③ เห็น 0 แถว → insert → ชนดัชนี (tombstone กินที่อยู่) → 23505
 * ④ retry update      → **เขียนอีกครั้ง** → คืน 0 แถวอีก
 * ⑤ route เห็น 0 แถว → 403 "ไม่มีสิทธิ์เขียนโน้ตในแผนนี้"
 * ```
 * 🔴 **ผู้ใช้ได้ `403` · แต่ข้อมูลถูกเขียนไปแล้วสองรอบ** — คำตอบว่า "ถูกปฏิเสธ" ที่มีการเขียนสำเร็จอยู่ข้างหลัง
 * 🎯 **และมันเป็นของใหม่ที่ *การแก้ของผมเอง* สร้างขึ้น** — ฉบับ `.upsert()` ล้มด้วย `42P10` ตั้งแต่ตอนวางแผน
 *    **ยังไม่ทันเขียนอะไรเลย** · ผมเขียนในคอมมิตก่อนว่า *"เหมือนเดิมทุกประการ"* โดยไม่ได้ไล่ policy ทั้งสองใบ
 *
 * **กรอง `deleted_at is null` แล้ว: ไม่มีการเขียนเกิดขึ้นเลยในเส้นทาง tombstone** — ยังได้ `403` เหมือนเดิม
 * แต่เป็น `403` ที่**ซื่อสัตย์** · อาการที่ผู้ใช้เห็นไม่เปลี่ยน **สิ่งที่เปลี่ยนคือฐานไม่ถูกแตะแล้ว**
 *
 * ⚠️ **บั๊กที่ยังเปิดอยู่ (ไม่ใช่ของใหม่): ลบโน้ตแล้วจดใหม่ที่เดิมไม่ได้เลย** — tombstone กินที่ในดัชนี
 * ต้องตัดสินก่อนว่า *"เขียนใหม่ควรปลุกแถวเดิมไหม"* และไคลเอนต์เขียน `deleted_at` ไม่ได้ตามการออกแบบ
 * · P4 มี xfail ตรึงไว้แล้ว (`449dc9e`) → **วันที่แก้ มันจะแดงเองและประกาศว่าแก้แล้ว**
 */
export async function upsertPlaceNote(
  db: Db,
  row: {
    tripId: string;
    planId: string;
    catalogPlaceId?: string | null;
    customPlaceId?: string | null;
    note: string | null;
    photoPath: string | null;
    legacyAddedBy?: string | null;
  }
) {
  const keyCol = row.catalogPlaceId ? "catalog_place_id" : "custom_place_id";
  const keyVal = row.catalogPlaceId ?? row.customPlaceId ?? null;
  const patch = { note: row.note, photo_path: row.photoPath };

  const upd = await engineTable(db, "place_notes")
    .update(patch)
    .eq("plan_id", row.planId)
    .eq(keyCol, keyVal)
    // 🔴 กันไม่ให้เขียนทับ tombstone — `place_notes_update` ไม่มีเงื่อนไขนี้ แต่ `place_notes_select` มี
    //    → ถ้าไม่กรอง จะ **เขียนสำเร็จแล้วคืน 0 แถว** ซึ่งกลายเป็น `403` ที่มีการเขียนอยู่ข้างหลัง
    .is("deleted_at", null)
    .select("id, updated_at");
  if (upd.error) return upd;
  if (upd.data && upd.data.length > 0) return upd;

  const ins = await engineTable(db, "place_notes")
    .insert({
      trip_id: row.tripId,
      plan_id: row.planId,
      catalog_place_id: row.catalogPlaceId ?? null,
      custom_place_id: row.customPlaceId ?? null,
      note: row.note,
      photo_path: row.photoPath,
      legacy_added_by: row.legacyAddedBy ?? null,
    })
    // 🔴 `updated_at` ต้องเดินทางกลับไปถึงไคลเอนต์ (`D7`) — ไม่งั้นฝั่งนั้นจะปั้นเวลาจากนาฬิกาตัวเอง
    .select("id, updated_at");
  if (!ins.error) return ins;
  if (ins.error.code !== "23505") return ins;

  return engineTable(db, "place_notes")
    .update(patch)
    .eq("plan_id", row.planId)
    .eq(keyCol, keyVal)
    .is("deleted_at", null)     // เหตุผลเดียวกับข้างบน
    .select("id, updated_at");
}

/**
 * ลบโน้ต — **ผ่าน RPC `soft_delete_place_note` เท่านั้น** (`E2-AC12`)
 *
 * 🔴 ไคลเอนต์ถูกถอด `update` สิทธิ์เขียน `deleted_at` ออกไปแล้ว → **ลบเองไม่ได้ตามการออกแบบ**
 * ต้องหา `id` ของโน้ตก่อน เพราะ RPC รับ `id` ไม่ใช่ `(plan_id, place_id)`
 */
export function placeNoteId(db: Db, tripId: string, planId: string, place: { catalogId?: string | null; customId?: string | null }) {
  let q = engineTable(db, "place_notes")
    .select("id")
    .eq("trip_id", tripId)
    .eq("plan_id", planId)
    .is("deleted_at", null);
  q = place.catalogId
    ? q.eq("catalog_place_id", place.catalogId)
    : q.eq("custom_place_id", place.customId ?? "");
  return q.maybeSingle();
}

export function softDeletePlaceNote(db: Db, id: string) {
  return db.rpc("soft_delete_place_note", { p_id: id });
}

// ───────────────────────────────────────────────────────────────────────────
// ที่พัก — `E3` · `D51` (ไม่มี `leg_id` · ใช้ช่วงวันที่ของตัวเอง)
// ───────────────────────────────────────────────────────────────────────────

/**
 * ที่พักของทริป **พร้อม slug ของเมือง**
 *
 * 🔴 **ไม่มี `leg_id` ในสคีมาใหม่ตามที่ `D51` ตัดสิน** — `leg` เป็น *ค่าคำนวณจาก `trip_days`*
 * ที่พักเก็บ `check_in`/`check_out` ของตัวเอง · *"คืนนี้นอนที่ไหน"* = แถวที่ `check_in <= วันนั้น < check_out`
 * · `trip_hotels_no_overlap` (exclusion ด้วย `gist`) บังคับว่าช่วงวันซ้อนกันไม่ได้ **ฐานจึงกันคำตอบกำกวมให้เอง**
 */
export function tripHotelsOfTrip(db: Db, tripId: string) {
  return engineTable(db, "trip_hotels")
    .select("id, city_id, hotel_name, formatted_address, name_local, address_local, name_en, address_en," +
            // `country_id` — ดูเหตุผลที่ `customPlaceRowsOfTrip` · ประเทศมาจากเมือง ไม่ใช่ทริป
            " phone, lat, lng, check_in, check_out, updated_at, catalog_cities(legacy_slug, country_id)")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("check_in");
}

/**
 * บันทึกที่พักของช่วงวันหนึ่ง
 *
 * 🔴 **`onConflict` ใช้ `(trip_id, check_in)` ไม่ได้ — ไม่มี unique ตัวนั้น**
 * ที่กันการซ้อนคือ **exclusion constraint** ซึ่ง `upsert` ใช้ไม่ได้
 * → ต้อง **ลบช่วงเดิมก่อนแล้วค่อยเขียนใหม่** ในคำสั่งของผู้เรียก · ที่นี่ทำแค่ `insert`
 */
export function insertTripHotel(db: Db, row: Record<string, unknown>) {
  // `updated_at` มาจาก trigger ฝั่งฐาน — ดึงกลับมาด้วย ไม่ให้ไคลเอนต์ปั้นเอง (`D7`)
  return engineTable(db, "trip_hotels").insert(row).select("id, updated_at");
}

/** หาแถวที่ครอบช่วงวันนั้นพอดี — `null` = ยังไม่มีที่พักของช่วงนี้ */
export function tripHotelByRange(db: Db, tripId: string, checkIn: string, checkOut: string) {
  return engineTable(db, "trip_hotels")
    .select("id")
    .eq("trip_id", tripId)
    .eq("check_in", checkIn)
    .eq("check_out", checkOut)
    .is("deleted_at", null)
    .maybeSingle();
}

export function softDeleteTripHotel(db: Db, id: string) {
  return db.rpc("soft_delete_trip_hotel", { p_id: id });
}

// ───────────────────────────────────────────────────────────────────────────
// ของที่ต้องเตรียม — `E3`
// ───────────────────────────────────────────────────────────────────────────

export function checklistOfTrip(db: Db, tripId: string) {
  return engineTable(db, "checklist_items")
    .select("id, text, category, is_checked, legacy_checked_by, legacy_added_by, created_at, updated_at")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("created_at");
}

/**
 * เพิ่มรายการ — 🔴 **`id` ไม่อยู่ใน grant** ฐานเป็นคนออกให้
 * · `legacy_checked_by` ก็ไม่ต้องส่ง — **trigger `stamp_checked_by` เป็นคนเขียน** (`P-56`)
 */
export function insertChecklistItem(db: Db, row: { tripId: string; text: string; category: string; legacyAddedBy: string | null }) {
  return engineTable(db, "checklist_items")
    .insert({ trip_id: row.tripId, text: row.text, category: row.category, legacy_added_by: row.legacyAddedBy })
    .select("id, text, category, is_checked, legacy_checked_by, legacy_added_by, created_at, updated_at")
    .single();
}

/** แก้รายการ — grant เปิดแค่ `text` · `category` · `is_checked` เท่านั้น */
export function updateChecklistItem(db: Db, id: string, patch: Record<string, unknown>) {
  // `updated_at` มาจาก trigger ฝั่งฐาน — ดึงกลับมาด้วย ไม่ให้ไคลเอนต์ปั้นเอง (`D7`)
  return engineTable(db, "checklist_items").update(patch).eq("id", id).select("id, updated_at");
}

export function softDeleteChecklistItem(db: Db, id: string) {
  return db.rpc("soft_delete_checklist_item", { p_id: id });
}

// ───────────────────────────────────────────────────────────────────────────
// ตั้งค่ารายวันของแผน — `E3` · `D69` (เป็นของ *วัน × แผน* ไม่ใช่ของวัน)
// ───────────────────────────────────────────────────────────────────────────

export function daySettingsOfPlan(db: Db, tripId: string, planId: string) {
  return engineTable(db, "trip_day_plan_settings")
    .select("trip_day_id, start_time, return_travel_mode, is_locked, note")
    .eq("trip_id", tripId)
    .eq("plan_id", planId);
}

/**
 * เขียนตั้งค่าของวัน × แผน
 *
 * 🔴 PK คือ `(plan_id, trip_day_id)` → `upsert` ใช้ได้จริง **ต่างจาก `trip_hotels`**
 * ที่กันด้วย exclusion constraint ซึ่ง `on conflict` ใช้ไม่ได้
 */
/**
 * 🔴 **ไม่ใช้ `.upsert()` — และเหตุผลไม่ใช่รสนิยม** (P1 · 27 ส.ค. 2026 · P4 probe จับได้)
 *
 * ## อาการ: **เจ้าของทริปแก้ตั้งค่าวันของตัวเองไม่ได้เลย** — `42501 permission denied`
 * เคส *ด้านบวก* ของ `engineCrossUser` แดง (A ควรได้ `200` แต่ได้ `403`)
 *
 * ## เหตุ
 * `.upsert(rows, { onConflict })` ให้ PostgREST สร้าง
 * `insert … on conflict (…) do update set <ทุกคอลัมน์ใน payload> = excluded.<col>`
 * → **`SET` รวม `trip_id` · `plan_id` · `trip_day_id`**
 *
 * แต่ `20260825125024_e2_narrow_key_grants` **ถอน `update` บนคอลัมน์คีย์ออกโดยตั้งใจ**:
 * > *"`grant update` ระดับตารางบน `trip_day_plan_settings` — **คือการให้ไคลเอนต์เขียนคีย์ของแถวตัวเอง**"*
 *
 * `authenticated` จึงมี `update` แค่ `start_time` · `return_travel_mode` · `is_locked` (+ `note` จาก `Q8`)
 * ⚠️ **Postgres ตรวจสิทธิ์ของ `DO UPDATE SET` ตอน *วางแผน* ไม่ใช่ตอนชน**
 * → **ล้มทุกครั้ง แม้แถวยังไม่มีอยู่เลย** · นั่นคือเหตุที่มันพังตั้งแต่การบันทึกครั้งแรก
 *
 * ## 🎯 ทางที่ **ไม่** เลือก: คืน `update` ให้คอลัมน์คีย์
 * นั่นคือการเปิดรูที่ migration นั้นตั้งใจปิด — **ไคลเอนต์จะย้ายแถวข้ามแผน/ข้ามวันได้ด้วยการเขียนคีย์ทับ**
 * · **อาการที่ง่ายที่สุดที่จะซ่อม คือการถอนด่านความปลอดภัย** — รูปเดียวกับที่ `S6` เตือนไว้
 *
 * ## ทางที่เลือก: `update` ก่อน แล้ว `insert` เฉพาะที่ยังไม่มี
 * `update` ส่ง **เฉพาะคอลัมน์ที่เขียนได้** · `insert` ส่งครบ (สิทธิ์ `insert` ครอบทั้ง 6 อยู่แล้ว)
 * · ไม่ต้องเพิ่ม RPC ใหม่ = **ไม่เพิ่มพื้นผิวที่ผู้ใช้เรียกได้** ซึ่งต้องรีวิวความปลอดภัยของตัวเอง
 * · 🔴 **แข่งกันเขียนจาก 2 เครื่อง:** `insert` อาจชน `23505` → **ตกไป `update` อีกรอบ ไม่ใช่โยนทิ้ง**
 *   (ผลที่ผู้ใช้ต้องการคือ "ค่าล่าสุดถูกบันทึก" ไม่ใช่ "ใครถึงก่อนได้ก่อน")
 */
const DAY_SETTING_KEYS = ["trip_id", "plan_id", "trip_day_id"] as const;

export async function upsertDaySettings(db: Db, rows: Record<string, unknown>[]) {
  const touched: string[] = [];

  for (const row of rows) {
    const dayId = row.trip_day_id as string;
    const planId = row.plan_id as string;
    const patch = Object.fromEntries(
      Object.entries(row).filter(([k]) => !(DAY_SETTING_KEYS as readonly string[]).includes(k)),
    );

    // ① ลองแก้ของที่มีอยู่ — ส่งเฉพาะคอลัมน์ที่ `authenticated` มีสิทธิ์ `update`
    if (Object.keys(patch).length > 0) {
      const upd = await engineTable(db, "trip_day_plan_settings")
        .update(patch).eq("plan_id", planId).eq("trip_day_id", dayId).select("trip_day_id");
      if (upd.error) return { data: null, error: upd.error };
      if (upd.data && upd.data.length > 0) { touched.push(dayId); continue; }
    }

    // ② ยังไม่มีแถว → สร้าง (สิทธิ์ `insert` ครอบคอลัมน์คีย์อยู่แล้ว)
    const ins = await engineTable(db, "trip_day_plan_settings").insert(row).select("trip_day_id");
    if (!ins.error) { touched.push(dayId); continue; }

    // ③ มีคนสร้างแทรกระหว่าง ① กับ ② → แก้ทับ ไม่ใช่ล้ม
    if (ins.error.code !== "23505") return { data: null, error: ins.error };
    const retry = await engineTable(db, "trip_day_plan_settings")
      .update(patch).eq("plan_id", planId).eq("trip_day_id", dayId).select("trip_day_id");
    if (retry.error) return { data: null, error: retry.error };
    if (retry.data && retry.data.length > 0) touched.push(dayId);
  }

  return { data: touched.map((trip_day_id) => ({ trip_day_id })), error: null };
}

// ───────────────────────────────────────────────────────────────────────────
// ตั๋ว/การจอง — `E3`
// ───────────────────────────────────────────────────────────────────────────

const BOOKING_COLS =
  "id, trip_day_id, category, title, date, time, confirmation_number, link, note," +
  " file_path, file_name, status, book_by_days_before, legacy_added_by, created_at, updated_at";

export function bookingsOfTrip(db: Db, tripId: string) {
  return engineTable(db, "bookings")
    .select(BOOKING_COLS)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("created_at");
}

export function insertBooking(db: Db, row: Record<string, unknown>) {
  return engineTable(db, "bookings").insert(row).select(BOOKING_COLS).single();
}

export function updateBooking(db: Db, id: string, patch: Record<string, unknown>) {
  return engineTable(db, "bookings").update(patch).eq("id", id).select("id");
}

export function softDeleteBooking(db: Db, id: string) {
  return db.rpc("soft_delete_booking", { p_id: id });
}

// ───────────────────────────────────────────────────────────────────────────
// แผน — `E3` · `D52` (ไม่มี `trips.active_plan_id` · ใช้ `trip_plans.is_active`)
// ───────────────────────────────────────────────────────────────────────────

export function plansOfTrip(db: Db, tripId: string) {
  return engineTable(db, "trip_plans")
    .select("id, name, is_active, created_at")
    .eq("trip_id", tripId)
    .order("created_at");
}

export function insertPlan(db: Db, tripId: string, name: string) {
  return engineTable(db, "trip_plans")
    .insert({ trip_id: tripId, name, is_active: false })
    .select("id, name, is_active, created_at")
    .single();
}

export function renamePlan(db: Db, id: string, name: string) {
  return engineTable(db, "trip_plans").update({ name }).eq("id", id).select("id");
}

export function deletePlan(db: Db, id: string) {
  return engineTable(db, "trip_plans").delete().eq("id", id).select("id");
}

/**
 * 🔴 สลับแผนผ่าน RPC เพราะ `trip_plans_one_active` เป็น **partial unique index** (`D52`)
 * ปลดของเก่าแล้วตั้งของใหม่ต้องอยู่ทรานแซกชันเดียว **ไม่งั้นชน index ระหว่างทาง**
 */
export function setActivePlan(db: Db, tripId: string, planId: string) {
  return db.rpc("set_active_plan", { p_trip_id: tripId, p_plan_id: planId });
}

/**
 * ก๊อปแผนทั้งใบ **ในทรานแซกชันเดียว** — `P-71`
 * ของเดิมเขียนทีละคำสั่งแล้วทิ้งผลลัพธ์ → **แผนที่ก๊อปมาไม่ครบโดยไม่มีใครรู้**
 */
export function duplicatePlan(db: Db, tripId: string, sourcePlanId: string, name: string) {
  return db.rpc("duplicate_trip_plan", {
    p_trip_id: tripId, p_source_plan_id: sourcePlanId, p_name: name,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// จุดแวะ — `E3` · `D6` (`rank` แทน `order_index`)
// ───────────────────────────────────────────────────────────────────────────

const STOP_COLS =
  "id, trip_day_id, kind, rank, dwell_minutes, travel_mode, note, photo_path," +
  " intercity_from, intercity_to, intercity_mode, transfer_target_time, transfer_target_label," +
  " visited_at, legacy_added_by, updated_at, custom_place_id," +
  " catalog_places(legacy_slug)";

/** จุดแวะของแผน **ที่ยังไม่ถูกลบ** เรียง `(rank, id)` — `D81` ③ */
export function stopsOfPlan(db: Db, tripId: string, planId: string) {
  return engineTable(db, "trip_stops")
    .select(STOP_COLS)
    .eq("trip_id", tripId)
    .eq("plan_id", planId)
    .is("deleted_at", null)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}

/** `rank` ของจุดแวะในวันหนึ่ง เรียงแล้ว — ใช้คำนวณตำแหน่งแทรก */
export function ranksInDay(db: Db, tripId: string, planId: string, tripDayId: string) {
  return engineTable(db, "trip_stops")
    .select("id, rank")
    .eq("trip_id", tripId)
    .eq("plan_id", planId)
    .eq("trip_day_id", tripDayId)
    .is("deleted_at", null)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}

export function insertStop(db: Db, row: Record<string, unknown>) {
  return engineTable(db, "trip_stops").insert(row).select(STOP_COLS).single();
}

export function updateStop(db: Db, id: string, patch: Record<string, unknown>) {
  return engineTable(db, "trip_stops").update(patch).eq("id", id).select("id");
}

/**
 * แก้จุดแวะ **โดยผูกกับวันที่ผู้เรียกอ้างว่ากำลังจัดลำดับอยู่**
 *
 * 🔴 P4 เจอ 26 ส.ค. 2026: `PUT` อ่าน rank ด้วย `ranksInDay()` ซึ่งมีขอบครบ (trip · plan · day)
 * แล้วเขียนกลับด้วย `updateStop()` ซึ่งมีแค่ `.eq("id")` — **อ่านมีขอบ เขียนไม่มีขอบ**
 * → `orderedIds` ที่ปน id ของ *วันอื่น* เขียนทับ `rank` ของวันนั้นได้จริง (ยิงผ่าน HTTP แล้ว)
 * · RLS ยังกันข้ามผู้ใช้ได้ครบ **แต่ผู้ใช้ทำลำดับวันอื่น *ของตัวเอง* พังได้จากคำขอเดียว**
 *
 * 🎯 route กันด้วยการตรวจก่อน (คืน `409`) อยู่แล้ว — **ตัวนี้คือชั้นที่ทำให้มันเกิดไม่ได้
 * ถึงแม้การตรวจนั้นจะถูกข้าม** · ขอบของการเขียนต้องเท่ากับขอบของการอ่านเสมอ ไม่ใช่เพราะจำได้
 */
export function updateStopInDay(
  db: Db,
  id: string,
  scope: { tripId: string; planId: string; tripDayId: string },
  patch: Record<string, unknown>
) {
  return engineTable(db, "trip_stops")
    .update(patch)
    .eq("id", id)
    .eq("trip_id", scope.tripId)
    .eq("plan_id", scope.planId)
    .eq("trip_day_id", scope.tripDayId)
    .select("id");
}

export function softDeleteStop(db: Db, id: string) {
  return db.rpc("soft_delete_trip_stop", { p_id: id });
}
