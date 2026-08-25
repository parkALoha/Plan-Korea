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

import { supabase } from "../supabase";

/** ตารางของแพลตฟอร์มที่ชั้นนี้ดูแล — เพิ่มตารางใหม่ = เพิ่มฟังก์ชันในไฟล์นี้ ไม่ใช่เรียก `.from` ที่อื่น */
export type EngineTable =
  | "catalog_countries"
  | "catalog_cities"
  | "catalog_places"
  | "catalog_place_names"
  | "catalog_country_contacts"
  | "catalog_place_access"
  | "trip_days"
  | "trip_stops";

/**
 * 🔴 **จุดเดียวในแอปที่พิมพ์ชื่อตารางของแพลตฟอร์มได้**
 *
 * ตั้งใจไม่ `export` — ถ้ามันออกไปข้างนอกได้ ด่านของ P6 จะเห็นแค่ `engineTable("x")`
 * ซึ่งเป็นสตริงเหมือนเดิม **แต่ predicate ไม่ถูกใส่ให้** = ได้ท่ากลับมาโดยไม่ได้อะไรเลย
 */
function engineTable(name: EngineTable) {
  return supabase.from(name);
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
export function browseCatalogPlaces(opts: { cityId?: string; countryId?: string; limit?: number }) {
  let q = engineTable("catalog_places").select("*").eq("picker_hidden", false);
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
export function catalogPlaceById(id: string) {
  return engineTable("catalog_places").select("*").eq("id", id).maybeSingle();
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
export function dayStops(opts: { tripDayId: string; planId: string }) {
  return engineTable("trip_stops")
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
 *   คนที่เรียกใช้จึงได้ *ลิสต์* ไม่ใช่ *แถวเดียว* — และเป็นคนตัดสินเองว่าตัวแรกคือตัวไหน
 *   (ตัวแรกของลิสต์นี้ = ตัวที่ `(rank, id)` น้อยที่สุด ซึ่งเท่ากันทุกเครื่องแล้ว)
 */
export function dayScheduleBounds(opts: { tripDayId: string; planId: string }) {
  return engineTable("trip_stops")
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
export function dayStopsIncludingDeleted(opts: { tripDayId: string; planId: string }) {
  return engineTable("trip_stops")
    .select("*")
    .eq("trip_day_id", opts.tripDayId)
    .eq("plan_id", opts.planId)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
}
