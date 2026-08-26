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
  | "custom_places";

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
      "id, city_id, category, lat, lng, maps_query, description, google_place_id," +
        " legacy_added_by, created_at," +
        " catalog_cities(legacy_slug)," +
        " custom_place_names(locale, name, priority)"
    )
    .eq("trip_id", tripId)
    .order("created_at");
}
