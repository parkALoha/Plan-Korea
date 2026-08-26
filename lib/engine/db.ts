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
 * ทริปทั้งหมดที่ผู้ใช้เห็นได้ **เรียงตามเวลาสร้าง**
 *
 * 🔴 **ไม่มี `where` เรื่องสิทธิ์ในนี้เลย — `trips_select` เป็นคนกรอง**
 * เขียน `.eq("owner", …)` เอง = แหล่งความจริงที่สองเรื่องสิทธิ์ ที่ต้องคอยให้ตรงกับ policy ตลอดไป (`P-15`)
 *
 * ⚠️ **`order` มีไว้ให้ผลคงที่ ไม่ได้มีไว้ให้ใครหยิบตัวแรก** — ดู `trip.ts` ว่าทำไมการหยิบตัวแรกถึงผิด
 */
export function tripsVisibleToMe(db: Db) {
  return engineTable(db, "trips").select("id, name").order("created_at");
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
        " catalog_cities(legacy_slug)," +
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

/** หา `city_id` จาก slug เดิม — `null` = ไม่รู้จักเมืองนั้น */
export function cityIdBySlug(db: Db, slug: string) {
  return engineTable(db, "catalog_cities").select("id").eq("legacy_slug", slug).maybeSingle();
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
    .select("catalog_place_id");
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
export function upsertPlaceNote(
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
  return engineTable(db, "place_notes")
    .upsert(
      {
        trip_id: row.tripId,
        plan_id: row.planId,
        catalog_place_id: row.catalogPlaceId ?? null,
        custom_place_id: row.customPlaceId ?? null,
        note: row.note,
        photo_path: row.photoPath,
        legacy_added_by: row.legacyAddedBy ?? null,
      },
      { onConflict: row.catalogPlaceId ? "plan_id,catalog_place_id" : "plan_id,custom_place_id" }
    )
    .select("id");
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
            " phone, lat, lng, check_in, check_out, updated_at, catalog_cities(legacy_slug)")
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
  return engineTable(db, "trip_hotels").insert(row).select("id");
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
  return engineTable(db, "checklist_items").update(patch).eq("id", id).select("id");
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
export function upsertDaySettings(db: Db, rows: Record<string, unknown>[]) {
  return engineTable(db, "trip_day_plan_settings")
    .upsert(rows, { onConflict: "plan_id,trip_day_id" })
    .select("trip_day_id");
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

export function softDeleteStop(db: Db, id: string) {
  return db.rpc("soft_delete_trip_stop", { p_id: id });
}
