import { pinnedTripIdsOf, tripsVisibleToMe, type Db } from "./db";
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
  /**
   * 🔴 **พิกัดของเมืองเอง — `E2-AC16`/`D54`** · `catalog_cities.lat`/`lng` เป็น `not null` ในฐาน
   * ใช้โดย `cityCenterOf()` แทน `cityCenter()` เดิมที่เฉลี่ยจาก `PLACES` แล้วหาร 0 ได้
   *
   * ⚠️ **สองบรรทัดนี้ตกหล่นตอน `8991a02` — mapper ส่งออกมาแล้วแต่ชนิดไม่ประกาศ** (P3 เจอ · 2 ก.ย. 2026)
   * 🎯 **และคอมเมนต์เหนือชนิดนี้เตือนเรื่องนี้ไว้เองทุกตัวอักษร**
   *    (*"ชนิดที่แคบกว่าข้อมูล … ทำให้คนเชื่อว่าของที่มีอยู่ไม่มี และไม่มีอะไรฟ้อง"*)
   *    — ผมเพิ่มฟิลด์ที่ mapper แล้วไม่เพิ่มที่นี่ **ทั้งที่คำเตือนอยู่เหนือบรรทัดที่ผมกำลังแก้**
   * · 🔴 ผลที่ตามมาคือรูปที่ทีมไล่ปิดกันทั้งวัน: **mapper ส่ง → ชนิดกลางซ่อน → ผู้เรียกประกาศรูปเอง**
   *   = สองแหล่งความจริงของรูปเดียวกัน (`useTripCatalogCities` มี `TripRow` ของตัวเองไปแล้วหนึ่งใบ)
   */
  lat: number;
  lng: number;
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
   * 🔴 **ไม่มี `coverImageUrl` แล้ว — ถอนตามมติผู้ใช้ 27 ส.ค. 2026**
   * รูปปกไม่ได้มาจากการอัปโหลดอีกต่อไป · เป็นไฟล์สถิตย์ในระบบเรา แยกตามเมือง (fallback ประเทศ)
   * → **UI คำนวณเองจาก `destinations` ที่มีอยู่แล้วในคำตอบนี้** ไม่ต้องให้เซิร์ฟเวอร์บอก
   * 🎯 เหตุผลของผู้ใช้: *"เราจะตั้งรูปในระบบเราอยู่แล้ว ป้องกันข้อมูลภาพเยอะเกิน"*
   */
  destinations: TripDestination[];
  memberCount: number;
  /**
   * ผู้เรียก **คนนี้** ปักหมุดทริปนี้เมื่อไหร่ · `null` = ไม่ได้ปัก (P1-Lead · 4 ก.ย. 2026)
   *
   * 🔴 **เป็นมุมมองส่วนตัว ไม่ใช่คุณสมบัติของทริป** — Alice ปักแล้ว Bob ได้ `null`
   * เก็บที่ `trip_members.pinned_at` ของแต่ละคน (`20260904140000_e5_pin_trip.sql`)
   * · ⚠️ **ห้ามย้ายไป `trips`** เพราะ `trips_update` จำกัด `owner` ⇒ editor/viewer จะปักของตัวเองไม่ได้
   * · timestamp ไม่ใช่ boolean เพื่อให้ **ของที่ปักหลายใบมีลำดับระหว่างกัน** โดยไม่ต้องมีคอลัมน์ที่สอง
   */
  pinnedAt: string | null;
};

/** รูปดิบที่ PostgREST คืนจากการฝังสามชั้น — แยกไว้เพื่อให้การแบนข้างล่างอ่านออก */
type RawTripRow = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  trip_destinations: {
    rank: number;
    catalog_cities: {
      id: string;
      legacy_slug: string | null;
      name_th: string;
      name_en: string;
      /** 🔴 `not null` ในฐาน (`E2-AC16`/`D54`) — เมืองถือพิกัดของตัวเอง ไม่ได้เฉลี่ยจากสถานที่ลูก */
      lat: number;
      lng: number;
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
   * หมุดของ **ผู้เรียก** — คำขอที่สอง ไม่ได้ฝังมากับคำขอแรก และนั่นตั้งใจ
   *
   * 🔴 ฝัง `trip_members(pinned_at)` ในคิวรีแรกจะได้แถวของ **เพื่อนร่วมทริปทุกคน**
   * (`trip_members_select` ใช้ `can_read_trip`) ⇒ ต้องมากรอง `user_id` ฝั่ง JS อยู่ดี
   * และเปลืองแบนด์วิดท์ตามจำนวนสมาชิก · ถามตรงด้วย `.eq("user_id", …)` สั้นกว่าและตรงคำถามกว่า
   * · ⚠️ **ล้มแล้วไม่โยน** — หมุดเป็นของเสริมของหน้ารายการ **ไม่ใช่แกนของมัน**
   *   อ่านหมุดไม่ได้ต้องไม่ทำให้ผู้ใช้เปิดรายการทริปไม่ได้ (`pinnedAt: null` ทุกใบแทน)
   *
   * 🔴 **ฉบับแรกเช็คแค่ `pinErr` — ซึ่ง *ไม่ได้* ทำตามบรรทัดข้างบนเลย** (P4 จับ · 4 ก.ย. 2026)
   * `db.auth.getUser()` **โยนได้** และมันอยู่นอก `if` นั้น ⇒ `soleTrip.test.ts` แดง 3 เคสทันที
   * (fakeDb ของเทสต์ mock แค่ `from().select().order()` · ไม่มี `auth` ⇒ TypeError)
   * 🎯 ***คอมเมนต์ผมประกาศการรับประกันที่โค้ดผมไม่ได้ให้ — และมันอ่านเหมือนได้ให้แล้ว
   *    เพราะมีคำว่า "ล้มแล้วไม่โยน" เขียนอยู่ข้างบนบรรทัดที่โยน***
   * · ⇒ `try/catch` ครอบ **ทั้งก้อน** ไม่ใช่เช็ค error ของคำขอเดียว — การรับประกันต้องครอบทุกทางที่ล้มได้
   *   ไม่ใช่ทางที่เรานึกออกตอนเขียน
   */
  let pinnedAt = new Map<string, string>();
  try {
    const { data: me } = await db.auth.getUser();
    if (me?.user?.id) {
      const { data: pins, error: pinErr } = await pinnedTripIdsOf(db, me.user.id);
      if (!pinErr) {
        pinnedAt = new Map(
          ((pins ?? []) as unknown as { trip_id: string; pinned_at: string }[]).map((p) => [
            p.trip_id,
            p.pinned_at,
          ]),
        );
      }
    }
  } catch {
    // เจตนา: หมุดหายไปเงียบ ๆ · รายการทริปยังขึ้นครบ
    // 🔴 **ไม่ log ที่นี่** — ฟังก์ชันนี้ถูกเรียกทุกครั้งที่เปิดหน้ารายการ ⇒ log จะกลบสัญญาณอื่นทั้งหมด
    //    ตัวที่ควรดังคือ `PUT /pin` ซึ่งเป็นการกระทำที่ผู้ใช้ตั้งใจ ไม่ใช่การอ่านพื้นหลัง
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    start_date: r.start_date,
    end_date: r.end_date,
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
        lat: d.catalog_cities!.lat,
        lng: d.catalog_cities!.lng,
        // 🔴 ประเทศ **ไม่ได้เก็บซ้ำใน `trips`** โดยตั้งใจ — คลังบอกอยู่แล้ว เก็บซ้ำ = สองแหล่งความจริงที่ drift ได้
        //    `null` ที่นี่แปลว่า RLS ของ `catalog_countries` ปฏิเสธ ไม่ใช่ "เมืองไม่มีประเทศ" (FK บังคับอยู่)
        countryId: d.catalog_cities!.catalog_countries?.id ?? "",
        countryNameTh: d.catalog_cities!.catalog_countries?.name_th ?? "",
      })),
    // PostgREST คืน aggregate เป็น array ใบเดียว · `0` ที่นี่เป็นไปไม่ได้ในทางปฏิบัติ
    // (ทุกทริปมีเจ้าของ ≥1) → ถ้าเห็น 0 แปลว่าอ่าน `trip_members` ไม่ได้ ไม่ใช่ทริปไม่มีคน
    memberCount: r.trip_members?.[0]?.count ?? 0,
    pinnedAt: pinnedAt.get(r.id) ?? null,
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


// ───────────────────────────────────────────────────────────────────────────
// คลังสถานที่ → การ์ดในไซด์บาร์ (`B6`) — P1 · 28 ส.ค. 2026
// ───────────────────────────────────────────────────────────────────────────

/** รูปดิบที่ `browseCatalogPlaces()` คืน — ฝังชื่อ/คำบรรยายมาเป็นอาร์เรย์แยก locale */
type RawCatalogPlace = {
  id: string;
  legacy_slug: string | null;
  category: string;
  source: string;
  lat: number;
  lng: number;
  address_local: string | null;
  maps_query: string | null;
  google_place_id: string | null;
  youtube_query: string | null;
  weather_sensitivity: string | null;
  catalog_cities: { legacy_slug: string | null; country_id: string } | null;
  catalog_place_names: { locale: string; name: string; priority: number }[];
  catalog_place_descriptions: { locale: string; description: string }[];
};

export type CatalogPlaceCard = {
  id: string;
  slug: string | null;
  category: string;
  citySlug: string | null;
  countryId: string | null;
  lat: number;
  lng: number;
  nameTh: string | null;
  nameEn: string | null;
  nameLocal: string | null;
  description: string | null;
  addressLocal: string | null;
  mapsQuery: string | null;
  googlePlaceId: string | null;
  youtubeQuery: string | null;
  weatherSensitivity: string | null;
};

/**
 * แบนแถวคลังให้เป็นการ์ดที่ไซด์บาร์ใช้ได้ตรง ๆ
 *
 * 🔴 **`nameLocal` เลือกจาก "locale ที่ไม่ใช่ `th`/`en`" — ไม่ได้ map จากประเทศ**
 * ทางที่ปฏิเสธคือตารางแปล `kr→ko · jp→ja · vn→vi` ในโค้ด · มันจะ **ผิดทันทีที่มีประเทศที่ 5**
 * และไม่มีอะไรฟ้อง (`D48` — ห้าม allowlist ตามชื่อ) · วิธีนี้อ่านจากข้อมูลที่มีจริง
 * · 🎯 **ผลข้างเคียงที่ถูกต้อง: สถานที่ในไทยจะได้ `nameLocal = null`** เพราะภาษาท้องถิ่นของไทย
 *   *คือ*ภาษาไทย — ไม่ใช่ข้อมูลขาด · การ์ดไม่ต้องโชว์บรรทัดซ้ำ
 *
 * ⚠️ **`description` เป็น `null` ได้และเป็นสภาพปกติวันนี้** — เกาหลี 62/62 มี · ฮานอย 10/18
 * · **ญี่ปุ่น 0/57 · ไทย 0/37** (`20260828010000` seed เฉพาะ 72 แห่งเดิมที่มีแหล่งตรวจแล้ว)
 * 🔴 UI ต้องตัดสินใจว่าจะแสดงยังไงเมื่อไม่มี **อย่าปล่อยเป็นช่องว่างเปล่า** — ความไม่สม่ำเสมอ
 *   ระหว่างการ์ดเกาหลีกับการ์ดญี่ปุ่นเป็นสิ่งที่ผู้ใช้จะเห็นแน่นอน
 *
 * ⚠️ `priority` ต่ำ = สำคัญกว่า (ดู `catalog_place_names`) → เรียงแล้วหยิบตัวแรก
 */
export function catalogPlaceCards(rows: unknown[]): CatalogPlaceCard[] {
  return (rows as RawCatalogPlace[]).map((r) => {
    const names = [...(r.catalog_place_names ?? [])].sort((a, b) => a.priority - b.priority);
    const pick = (locale: string) => names.find((n) => n.locale === locale)?.name ?? null;
    const local = names.find((n) => n.locale !== "th" && n.locale !== "en")?.name ?? null;
    return {
      id: r.id,
      slug: r.legacy_slug,
      category: r.category,
      citySlug: r.catalog_cities?.legacy_slug ?? null,
      countryId: r.catalog_cities?.country_id ?? null,
      lat: r.lat,
      lng: r.lng,
      nameTh: pick("th"),
      nameEn: pick("en"),
      nameLocal: local,
      description: (r.catalog_place_descriptions ?? []).find((d) => d.locale === "th")?.description ?? null,
      addressLocal: r.address_local,
      mapsQuery: r.maps_query,
      googlePlaceId: r.google_place_id,
      youtubeQuery: r.youtube_query,
      weatherSensitivity: r.weather_sensitivity,
    };
  });
}
