import { tripsVisibleToMe, type Db } from "./db";
import { chooseSoleTrip, type SoleTrip } from "./tripChoice";

// 🔴 re-export ให้ผู้เรียก *ฝั่งเซิร์ฟเวอร์* เท่านั้น — ฝั่ง client ต้อง import จาก `./tripChoice` ตรง ๆ
//    เพราะไฟล์นี้ลาก `db.ts` มาด้วยที่บรรทัดบน (P4 ไล่กราฟเจอ 26 ส.ค. 2026)
export { chooseSoleTrip, soleTripMessage, type SoleTrip } from "./tripChoice";

/**
 * *"ทริปไหน"* — คำถามที่แอปเดิมไม่เคยต้องถาม และตารางใหม่ทุกใบบังคับให้ตอบ
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · `E3`
 *
 * ## 🔴 ทำไมไฟล์นี้ถึงเกิดก่อน route `/trip/[tripId]` ของ `E5`
 *
 * เว็บทริปเดิมมีทริปเดียว **ทริปจึงเป็นค่าโดยปริยายที่ไม่มีชื่อ** — `grep tripId` ทั้งแอปได้ **0 บรรทัด**
 * แต่ `trips` · `trip_days` · `trip_stops` · `bookings` … **ทุกใบมี `trip_id` เป็น `not null`**
 * → `E3` ย้าย hook ไปฝั่งเซิร์ฟเวอร์ไม่ได้เลยจนกว่าจะมีคำตอบ **และ `E5-AC1` (route) อยู่หลัง `E3`**
 *
 * 🎯 **แยกสองอย่างที่ปนกันอยู่ออกจากกัน:**
 * ```
 * "คำขอนี้เป็นเรื่องของทริปไหน"   ← ไฟล์นี้ · E3 ต้องมี
 * "URL หน้าตายังไง"               ← E5-AC1 · คนละเรื่อง
 * ```
 * ไฟล์นี้จึงไม่ผูกกับ URL เลย · วันที่ `E5` มาถึง route แค่ส่ง `tripId` เข้ามาแทนการเดา
 *
 * ## 🔴 กติกาเหล็ก: **ห้ามเลือกทริปให้เงียบ ๆ**
 *
 * ท่าที่ง่ายที่สุดคือ *"เอาทริปแรกที่เจอ"* · **และมันคือบั๊กเดียวกับที่ P5 แก้ให้ผมเรื่องขอบของวัน**
 * · วันนี้ผู้ใช้มีทริปเดียว → *"ตัวแรก"* ถูกเสมอ **จนวันที่เขาสร้างทริปที่สอง**
 * · วันนั้นเขาจะแก้ทริปผิดใบ **โดยที่หน้าจอไม่มีอะไรผิดปกติเลยสักอย่าง**
 * 🎯 **`soleTrip()` จึงคืน *เหตุผล* เมื่อตอบไม่ได้ ไม่ใช่คืน `null` เปล่า ๆ**
 *    `null` เปล่าบังคับให้ผู้เรียกเดาว่า *"ไม่มีทริป"* หรือ *"มีหลายทริป"* ซึ่งต้องทำคนละอย่าง
 */

/**
 * ทริปทั้งหมดที่ผู้ใช้คนนี้เห็นได้ — **RLS เป็นคนกรอง ไม่ใช่ `where` ในนี้**
 *
 * 🔴 ถ้าเขียน `.eq("owner", userId)` เอง เราจะได้แหล่งความจริงที่สองเรื่องสิทธิ์
 * ซึ่งต้องคอยให้ตรงกับ policy ตลอดไป (`P-15`) · **`trips_select` ตอบคำถามนี้อยู่แล้ว**
 */
/**
 * 🔴 **ชนิดเคยแคบกว่าข้อมูลที่ไหลมาจริง — และความแคบนั้นบล็อกงานคนอื่นอยู่เงียบ ๆ** (P1 · 27 ส.ค. 2026)
 *
 * `tripsVisibleToMe()` `select("id, title, start_date, end_date")` มาตั้งแต่ 27 ส.ค. เช้า
 * **แต่ชนิดที่ประกาศตรงนี้เขียนไว้แค่ `{ id, title }`** → `GET /api/engine/trips` คืน 4 ฟิลด์จริง
 * แต่ผู้เรียกฝั่ง TS **มองไม่เห็นสองฟิลด์นั้นเลย**
 *
 * 🎯 P2 รายงานว่า *"ยังไม่มีวันที่จริงให้ดึง"* แล้วเลือก **ไม่แสดงบรรทัดวันที่** (ถูกต้องที่สุดในสถานการณ์นั้น
 * — ว่างดีกว่าผิด) · **ของจริงคือมันมีอยู่แล้ว แค่ชนิดปิดตาไว้**
 * 🔴 **ชนิดที่แคบกว่าข้อมูล ไม่ทำให้อะไรพัง — มันทำให้คนเชื่อว่าของที่มีอยู่ไม่มี** และไม่มีอะไรฟ้อง
 *   · ต่างจากชนิดที่*กว้าง*กว่าข้อมูล ซึ่งพังตอนรันและมีคนเห็น
 */
/** จุดหมายหนึ่งใบบนการ์ด — แบนแล้วจากโครงฝังสามชั้น เพื่อให้ UI ไม่ต้องรู้รูปของ PostgREST */
export type TripDestination = {
  cityId: string;
  slug: string | null;
  nameTh: string;
  nameEn: string;
  countryId: string;
  countryNameTh: string;
};

export type TripListItem = {
  // 🔴 4 คีย์นี้เป็น snake_case เพราะ **มีผู้เรียกอยู่แล้ว** (`HomeScreen` · `TripHeader` · `useActiveTripId`)
  //    เปลี่ยนเป็น camelCase = แก้ 3 ที่พร้อมกันเพื่อความสวยงามล้วน ๆ · ของใหม่ใช้ camelCase
  //    ⚠️ ปนกันโดยรู้ตัว ไม่ใช่โดยเผลอ — **อย่า "ทำให้สม่ำเสมอ" โดยไม่ไล่ผู้เรียกก่อน**
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  /**
   * 🔴 **URL ที่เซ็นแล้วและหมดอายุ ไม่ใช่ค่าที่เก็บในฐาน** — ฐานเก็บ `cover_image_path`
   * ชื่อฟิลด์ต่างจากชื่อคอลัมน์เพราะ **ของต่างกัน** ไม่ใช่เพราะไม่สม่ำเสมอ
   * · `null` = ไม่มีรูปปก **หรือ** เซ็นไม่ผ่าน — UI แสดงพื้นไล่สีทั้งสองกรณี
   */
  coverImageUrl: string | null;
  destinations: TripDestination[];
  memberCount: number;
};

/** รูปดิบที่ PostgREST คืนจากการฝังสามชั้น — แยกไว้เพื่อให้การแบนข้างล่างอ่านออก */
type RawTripRow = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  cover_image_url: string | null;
  trip_destinations: {
    rank: number;
    catalog_cities: {
      id: string;
      legacy_slug: string | null;
      name_th: string;
      name_en: string;
      catalog_countries: { id: string; name_th: string; name_en: string } | null;
    } | null;
  }[] | null;
  trip_members: { count: number }[] | null;
};

export async function tripsForUser(db: Db): Promise<TripListItem[]> {
  // 🔴 ชื่อตารางอยู่ใน `db.ts` ไฟล์เดียวตามกติกาของ `D81` ⑦.๕ — ที่นี่มีแต่ *ตรรกะการเลือก*
  //    ด่าน `dynamic-from` ของ P6 ยอมให้พิมพ์ `.from("trips")` ตรงนี้ได้ (เป็นสตริง)
  //    **แต่ยอมไม่ได้แปลว่าถูก** — แยกไว้เพราะวันที่ `trips` ต้องพก predicate มันจะมีที่ให้ใส่ที่เดียว
  const { data, error } = await tripsVisibleToMe(db);
  if (error) throw new Error(`อ่านรายการทริปไม่ได้: ${error.message}`);
  const rows = (data ?? []) as unknown as RawTripRow[];
  /**
   * 🔴 **ยังอ่าน `cover_image_url` (ชื่อเดิม) และยังไม่เซ็น — โดยตั้งใจ จนกว่า `20260827220000` จะลงฐาน**
   *
   * ผม (P1) เปลี่ยนชื่อคอลัมน์ใน migration แล้วแก้โค้ดให้ตามทันที **ทั้งที่ฐานยังไม่ถูก rename**
   * → `GET /api/engine/trips` คืน **502 `column trips.cover_image_path does not exist`** ให้ทุกผู้ใช้
   *   และหน้า Home แสดง "ยังไม่มีทริป" ทั้งที่มีทริปอยู่ (P2 เจอ 27 ส.ค.)
   *
   * 🎯 **นี่คือความผิดพลาดเดียวกับที่ `5ab0abe` ของผมเองเขียนบทเรียนไว้เมื่อเช้าวันเดียวกัน:**
   *    *"ลำดับที่ถูกคือ migration ลงฐานก่อน แล้วโค้ดตามไป — ผม commit สลับลำดับเอง"*
   *    ครั้งนั้นผลคือ **เทสต์แดง** · ครั้งนี้ผลคือ **แอปพังกับผู้ใช้จริง** — รากเดียวกัน ราคาต่างกันมาก
   * ⚠️ **และผมมองไม่เห็นเพราะคิดถึงแต่ทิศเดียว** — ผมเตือน P4 ว่าเทสต์เขาจะแดง *หลัง* migration ลง
   *    แต่ไม่ได้คิดว่าโค้ดของผมเอง **พังทันทีที่ commit ก่อน** migration ลง
   *
   * 📌 คืนเป็น `cover_image_path` + เซ็น URL **พร้อมกันในคอมมิตเดียวหลัง migration ลงฐาน**
   */
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    start_date: r.start_date,
    end_date: r.end_date,
    coverImageUrl: r.cover_image_url,
    // เรียงด้วย `(rank, cityId)` — `rank` ไม่ unique โดยตั้งใจ (เหตุผลเดียวกับ `trip_stops.rank`)
    // `cityId` คือ tie-break ที่ทำให้ทุกเครื่องได้ลำดับเดียวกัน
    destinations: (r.trip_destinations ?? [])
      .filter((d) => d.catalog_cities !== null)
      .sort((a, b) => a.rank - b.rank || (a.catalog_cities!.id < b.catalog_cities!.id ? -1 : 1))
      .map((d) => ({
        cityId: d.catalog_cities!.id,
        slug: d.catalog_cities!.legacy_slug,
        nameTh: d.catalog_cities!.name_th,
        nameEn: d.catalog_cities!.name_en,
        // 🔴 ประเทศ **ไม่ได้เก็บซ้ำใน `trips`** โดยตั้งใจ — คลังบอกอยู่แล้ว เก็บซ้ำ = สองแหล่งความจริงที่ drift ได้
        //    `null` ที่นี่แปลว่า RLS ของ `catalog_countries` ปฏิเสธ ไม่ใช่ "เมืองไม่มีประเทศ" (FK บังคับอยู่)
        countryId: d.catalog_cities!.catalog_countries?.id ?? "",
        countryNameTh: d.catalog_cities!.catalog_countries?.name_th ?? "",
      })),
    // PostgREST คืน aggregate เป็น array ใบเดียว · `0` ที่นี่เป็นไปไม่ได้ในทางปฏิบัติ
    // (ทุกทริปมีเจ้าของ ≥1) → ถ้าเห็น 0 แปลว่าอ่าน `trip_members` ไม่ได้ ไม่ใช่ทริปไม่มีคน
    memberCount: r.trip_members?.[0]?.count ?? 0,
  }));
}

/**
 * ทริปเดียวของผู้ใช้ — ใช้ระหว่างที่ยังไม่มี route `/trip/[tripId]` (`E5-AC1`)
 *
 * ⚠️ **นี่คือของชั่วคราวโดยประกาศ ไม่ใช่โดยบังเอิญ** — และมันจะบอกเองเมื่อหมดอายุ:
 * วินาทีที่ผู้ใช้มีทริปที่สอง มันคืน `ambiguous` **แทนที่จะเดา** → มีคนต้องมาต่อ `E5`
 * 🎯 **ข้อยกเว้นที่ประกาศวันหมดอายุของตัวเองไว้ ไม่ใช่ `D73`**
 */
export async function soleTrip(db: Db): Promise<SoleTrip> {
  try {
    return chooseSoleTrip(await tripsForUser(db));
  } catch (e) {
    // 🔴 อ่านไม่ได้ **ไม่ใช่** ไม่มีทริป — สองอย่างนี้ผู้ใช้ต้องทำคนละเรื่อง
    //    (ยังไม่ล็อกอิน vs ยังไม่มีทริป) · `?? []` ตรงนี้คือบั๊กที่ P4 เดินเข้าไปเองเมื่อวาน
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

