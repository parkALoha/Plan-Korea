import { describe, expect, it } from "vitest";
import { buildCitySegments, buildDayCitySegments, stopCountIn } from "@/lib/citySegments";
import type { City } from "@/data/itinerary";
import type { Place } from "@/data/places";

/** พิกัดจริงจาก data/transferPoints.ts และ data/places.ts — เกณฑ์ระยะจะได้ถูกทดสอบด้วยของจริง */
const AT = {
  busanNopo: { lat: 35.2847494, lng: 129.0953841 },
  sokchoExpress: { lat: 38.1905088, lng: 128.5987419 },
  sokchoIntercity: { lat: 38.2109611, lng: 128.591111 },
  gangneungBus: { lat: 37.754515, lng: 128.879615 },
  gangneungStation: { lat: 37.7644776, lng: 128.8995536 },
  seoulStation: { lat: 37.555946, lng: 126.9723117 },
  suwonStation: { lat: 37.26644, lng: 126.999408 },
  icn: { lat: 37.4491, lng: 126.4506 },
};

function stop(
  id: string,
  at: { lat: number; lng: number },
  city: Place["city"],
  placeId = id
): { id: string; place: Pick<Place, "id" | "lat" | "lng" | "city"> } {
  return { id, place: { id: placeId, lat: at.lat, lng: at.lng, city } };
}

function hotel(at: { lat: number; lng: number }, city: string) {
  return { lat: at.lat, lng: at.lng, city };
}

/**
 * เมืองของทริปพร้อมพิกัดที่ **เมืองถือเอง** — `catalog_cities.lat/lng` ของจริง (`E2-AC16`)
 *
 * 🔴 **ก่อน 4 ก.ย. 2026 เคสพวกนี้ไม่มีลิสต์นี้** — `citySegments` วนตาราง 6 เมืองใน
 * `CITY_NAME_TH` แล้วเรียก `cityCenter()` ซึ่งเฉลี่ยพิกัดจาก `PLACES`
 * ⇒ **เคสทั้งไฟล์พึ่งของสถิตที่มองไม่เห็นในตัวเคสเอง** · ตอนนี้จักรวาลอ้างอิงอยู่ในเคส อ่านออกจากบรรทัดที่รัน
 *
 * 📌 ค่าพวกนี้คือค่าที่ `/api/engine/trips` คืนจริงสำหรับทริปเกาหลี — ไม่ใช่ค่าที่ปั้นขึ้น
 */
const TRIP_CITIES = [
  { slug: "hanoi", lat: 21.0278, lng: 105.8342 },
  { slug: "busan", lat: 35.1796, lng: 129.0756 },
  { slug: "sokcho", lat: 38.207, lng: 128.5918 },
  { slug: "gangneung", lat: 37.7519, lng: 128.8761 },
  { slug: "seoul", lat: 37.5665, lng: 126.978 },
  { slug: "suwon", lat: 37.2636, lng: 127.0286 },
] as const;

/** ขยับพิกัดไปไม่กี่ร้อยเมตร — ใช้แทน "จุดแวะอีกที่ในเมืองเดียวกัน" */
function near(at: { lat: number; lng: number }, delta = 0.01) {
  return { lat: at.lat + delta, lng: at.lng + delta };
}

describe("buildCitySegments", () => {
  it("input ว่างได้ลิสต์ว่าง", () => {
    expect(buildCitySegments([])).toEqual([]);
  });

  it("เมืองเดียวทั้งวันได้ช่วงเดียว", () => {
    const segments = buildCitySegments([
      { ...AT.seoulStation, city: "seoul" as City },
      { ...near(AT.seoulStation), city: "seoul" as City },
      { ...near(AT.seoulStation, 0.02), city: "seoul" as City },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].city).toBe("seoul");
    expect(segments[0].items).toHaveLength(3);
  });

  it("ปูซาน→ซกโช (326 กม.) ตัดเป็น 2 ช่วง", () => {
    const segments = buildCitySegments([
      { ...AT.busanNopo, city: "busan" as City },
      { ...AT.sokchoExpress, city: "sokcho" as City },
    ]);
    expect(segments.map((s) => s.city)).toEqual(["busan", "sokcho"]);
  });

  it("ซกโช→คังนึง (56.7 กม.) ตัด — เกิน 40 กม. และเมืองเปลี่ยน", () => {
    const segments = buildCitySegments([
      { ...AT.sokchoIntercity, city: "sokcho" as City },
      { ...AT.gangneungBus, city: "gangneung" as City },
    ]);
    expect(segments.map((s) => s.city)).toEqual(["sokcho", "gangneung"]);
  });

  it("โซล→ซูวอน (32.3 กม.) ไม่ตัด แม้เมืองจะเปลี่ยน — ใกล้เกินกว่าจะเป็นการข้ามเมืองจริง", () => {
    const segments = buildCitySegments([
      { ...AT.seoulStation, city: "seoul" as City },
      { ...AT.suwonStation, city: "suwon" as City },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].city).toBe("seoul");
  });

  it("โซล→ICN (47.5 กม.) ไม่ตัด เพราะเมืองเดียวกัน — กันวัน d10 แตกเป็นชิป 'โซล' สองอันซ้ำ", () => {
    const segments = buildCitySegments([
      { ...AT.seoulStation, city: "seoul" as City },
      { ...AT.icn, city: "seoul" as City },
    ]);
    expect(segments).toHaveLength(1);
  });

  it("171 กม. ตัดด้วยด่านแข็ง แม้ city tag จะผิดเหมือนกันทั้งสองฝั่ง", () => {
    // เคสจริง: ผู้ใช้ไม่ได้ใส่แถวสถานี KTX และจุดแรกในโซลเป็นสถานที่เพิ่มเองที่ tag เป็น "gangneung"
    const segments = buildCitySegments([
      { ...AT.gangneungStation, city: "gangneung" as City },
      { ...AT.seoulStation, city: "gangneung" as City },
    ]);
    expect(segments).toHaveLength(2);
  });

  it("จุดที่ tag เพี้ยนแต่อยู่ใกล้เพื่อนบ้าน ไม่ทำให้ตัดช่วง และไม่แย่ง label ของช่วง", () => {
    // ร้านแถวเมียงดงที่เพิ่มในวัน d6 ถูกเก็บเป็น city "gangneung" ทั้งที่อยู่โซล
    const segments = buildCitySegments([
      { ...AT.seoulStation, city: "seoul" as City },
      { ...near(AT.seoulStation), city: "gangneung" as City },
      { ...near(AT.seoulStation, 0.02), city: "seoul" as City },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].city).toBe("seoul");
  });

  it("วัน A→B→A ได้ 3 ช่วงเรียงตามเวลา ไม่ใช่ยุบเหลือ 2", () => {
    const segments = buildCitySegments([
      { ...AT.seoulStation, city: "seoul" as City },
      { ...AT.gangneungStation, city: "gangneung" as City },
      { ...AT.seoulStation, city: "seoul" as City },
    ]);
    expect(segments.map((s) => s.city)).toEqual(["seoul", "gangneung", "seoul"]);
  });
});

describe("buildDayCitySegments", () => {
  it("d5 (16 ต.ค.) — จุดแวะซกโชล้วน + โรงแรมคังนึง ต้องได้ 2 ช่วง", () => {
    // เคสสำคัญที่สุด: ถ้าที่พักไม่ถูกนับเป็นจุด จะได้ช่วงเดียวและบั๊กไม่ถูกแก้เลย
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [
        stop("s1", AT.sokchoExpress, "sokcho"),
        stop("s2", near(AT.sokchoExpress), "sokcho"),
        stop("s3", AT.sokchoIntercity, "sokcho"),
      ],
      startHotel: hotel(near(AT.sokchoExpress, 0.005), "sokcho"),
      endHotel: hotel(AT.gangneungBus, "gangneung"),
    });
    expect(segments.map((s) => s.city)).toEqual(["sokcho", "gangneung"]);
    expect(stopCountIn(segments[0])).toBe(3);
    expect(stopCountIn(segments[1])).toBe(0);
    // toEqual ไม่ใช่ toMatchObject — ชั้นแปลง: ช่องใหม่ที่ไม่รู้จักต้องแดง ไม่ใช่เงียบ (P1 · 27 ส.ค.)
    expect(segments[1].items[0]).toEqual({
      kind: "hotel",
      role: "end",
      lat: AT.gangneungBus.lat,
      lng: AT.gangneungBus.lng,
      city: "gangneung",
    });
  });

  it("แถว 'แวะที่พัก' ที่ resolvePlace ตั้ง city เป็น seoul ไว้ ต้องไม่เปิดช่วงโซลผีกลางวัน", () => {
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [
        stop("s1", AT.busanNopo, "busan"),
        // แถว kind="hotel" ที่ซกโช — resolvePlace คืน city "seoul" เสมอ
        stop("s2", AT.sokchoExpress, "seoul", "hotel@38.19051,128.59874"),
        stop("s3", near(AT.sokchoExpress), "sokcho"),
      ],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.map((s) => s.city)).toEqual(["busan", "sokcho"]);
    expect(stopCountIn(segments[1])).toBe(2);
  });

  it("d5 ของจริง — รอยต่อข้ามเมืองตกบนแถว 'แวะที่พัก' พอดี ต้องยังตัดช่วงได้", () => {
    // เคสถดถอยจริงที่เจอตอนเอาข้อมูลทริปจริงมารัน: ลำดับแถวคือ
    // ท่ารถซกโช → [แถวข้ามเมือง ไม่มีพิกัด] → แวะที่พักคังนึง → ตลาดคังนึง
    // ถ้าให้ city ของแถว hotel@ เป็น null ทั้งวันจะยุบเหลือช่วงเดียว เพราะ hop 56.7 กม.
    // ไม่ถูกนับว่า "เมืองเปลี่ยน" และยังไม่ถึงด่านแข็ง 100 กม. ส่วน hop ถัดไปก็แค่ ~1 กม.
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [
        stop("s1", { lat: 38.1730998, lng: 128.4890543 }, "sokcho"), // ซอรัคซาน
        stop("s2", { lat: 38.18993, lng: 128.60091 }, "seoul", "hotel@38.18993,128.60091"),
        stop("s3", { lat: 38.1905823, lng: 128.603541 }, "sokcho"), // หาดซกโช
        stop("s4", AT.sokchoIntercity, "sokcho"),
        stop("s5", { lat: 37.76183, lng: 128.90269 }, "seoul", "hotel@37.76183,128.90269"),
        stop("s6", { lat: 37.7539833, lng: 128.8985663 }, "gangneung"), // ตลาดจุงอัง
      ],
      startHotel: hotel({ lat: 38.18993, lng: 128.60091 }, "sokcho"),
      endHotel: hotel({ lat: 37.76183, lng: 128.90269 }, "gangneung"),
    });
    expect(segments.map((s) => s.city)).toEqual(["sokcho", "gangneung"]);
    expect(stopCountIn(segments[0])).toBe(4);
    expect(stopCountIn(segments[1])).toBe(2);
  });

  it("ที่พักหัว-ท้ายที่เดียวกันนับหมุดเดียว ไม่งอกช่วงที่สาม", () => {
    const sameHotel = hotel(AT.seoulStation, "seoul");
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [stop("s1", AT.suwonStation, "suwon")],
      startHotel: sameHotel,
      endHotel: { ...sameHotel },
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].items).toHaveLength(2);
  });

  it("d9 (20 ต.ค.) — จุดแวะซูวอน + โรงแรมโซล ยังเป็นช่วงเดียว (30-32 กม. ไม่ถึงเกณฑ์)", () => {
    const seoulHotel = hotel(AT.seoulStation, "seoul");
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [stop("s1", AT.suwonStation, "suwon"), stop("s2", near(AT.suwonStation), "suwon")],
      startHotel: seoulHotel,
      endHotel: { ...seoulHotel },
    });
    expect(segments).toHaveLength(1);
  });

  it("วันที่ไม่มีที่พัก (d0 พักเครื่องฮานอย) ใช้แค่จุดแวะ", () => {
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [stop("s1", { lat: 21.0288, lng: 105.8542 }, "hanoi")],
      startHotel: null,
      endHotel: null,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].city).toBe("hanoi");
  });

  it("city ของ TripHotel ที่ไม่ใช่ City id ที่รู้จัก ถูกมองเป็น null ไม่พังและไม่ตัดช่วงมั่ว", () => {
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [stop("s1", AT.seoulStation, "seoul")],
      startHotel: hotel(near(AT.seoulStation), "เมืองที่ไม่มีในระบบ"),
      endHotel: null,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].city).toBe("seoul");
  });
});

/**
 * `D54` ต่อ — **เดาเมืองจากพิกัดต้องมีเพดานระยะ** (P2 ไล่ปลายทาง · P1 วัดแล้วลง · 2 ก.ย. 2026)
 *
 * เดิม `cityFromCoords` คืน "เมืองที่ใกล้ที่สุด" **เสมอ ไม่มีเพดาน** → พิกัดต่างประเทศได้ป้ายเมืองเกาหลี
 * 🎯 **ค่าที่ไม่ `NaN` แต่ผิด — อันตรายกว่าค่าที่พัง** เพราะชิปบนแผนที่อ่านเหมือนถูกต้อง
 *
 * **ตัวเลขที่รองรับเพดาน 100 (วัดจริง ไม่ใช่อนุมาน):**
 * ในเมืองไกลสุด 14.2 กม. (ซกโช) · ระหว่างเมืองใกล้สุด 30.1 (โซล–ซูวอน) · โตเกียว→ปูซาน 957
 */
describe("เดาเมืองจากพิกัด — เพดานระยะ", () => {
  /** ⚠️ เคสควบคุม — ถ้าเพดานแคบเกินจนกินของจริง เคสนี้แดงก่อน ไม่ใช่รู้ตอนผู้ใช้เจอ */
  it("แถวแวะที่พักในเมืองจริง ต้องยังได้เมืองนั้น — เพดานต้องไม่กินของที่ถูก", () => {
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [
        stop("s1", AT.busanNopo, "busan"),
        stop("s2", AT.sokchoExpress, "seoul", "hotel@38.19051,128.59874"),
        stop("s3", near(AT.sokchoExpress), "sokcho"),
      ],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.map((s) => s.city)).toEqual(["busan", "sokcho"]);
  });

  /**
   * 🔴 **เคสที่เป็นเหตุผลของเพดาน** — โตเกียว (35.6762, 139.6503) ห่างปูซาน 957 กม.
   * ก่อนใส่เพดาน แถวนี้ถูกติดป้ายว่า `busan` · **ค่าที่อ่านเหมือนถูกต้องบนชิปแผนที่**
   */
  it("🔴 แถวแวะที่พักพิกัดโตเกียว ต้องไม่ถูกติดป้ายเป็นเมืองเกาหลี", () => {
    const segments = buildDayCitySegments({
      cities: TRIP_CITIES,
      stops: [stop("s1", { lat: 35.6762, lng: 139.6503 }, "seoul", "hotel@35.6762,139.6503")],
      startHotel: null,
      endHotel: null,
    });
    expect(
      segments.map((s) => s.city),
      "ติดป้ายเมืองเกาหลีให้พิกัดโตเกียว — เพดานไม่ทำงาน",
    ).not.toContain("busan");
  });
});

/**
 * 🔴 **`E2-AC16` — จักรวาลอ้างอิงเป็นเมืองของ *ทริปนี้* ไม่ใช่ 6 เมืองเกาหลีที่ฝังในไฟล์**
 * เจ้าของ: P2-UI/UX · 4 ก.ย. 2026
 *
 * ก่อนหน้านี้ `citySegments` วน `CITY_NAME_TH` (6 เมืองเกาหลี) แล้วเรียก `cityCenter()`
 * ⇒ **ทริปญี่ปุ่นไม่มีชิปเมืองสักอัน และแผนที่ไม่เคยแบ่งช่วง** · ไม่พัง จึงไม่มีใครเห็น
 */
describe("E2-AC16 — เมืองมาจากคลังของทริป", () => {
  const JP_CITIES = [
    { slug: "tokyo", lat: 35.6762, lng: 139.6503 },
    { slug: "osaka", lat: 34.6937, lng: 135.5023 },
  ] as const;

  it("แถวแวะที่พักในโตเกียว ได้เมือง 'tokyo' เมื่อโตเกียวอยู่ในคลังของทริป", () => {
    /* เคสเดียวกับ "ต้องไม่ถูกติดป้ายเป็นเมืองเกาหลี" ข้างบนเป๊ะ — ต่างกันแค่ *คลังของทริป*
       🎯 คู่นี้จึงพิสูจน์ว่าเพดานไม่ได้กินของถูก มันกินของที่อยู่นอกจักรวาลจริง ๆ */
    const segments = buildDayCitySegments({
      cities: JP_CITIES,
      stops: [stop("s1", { lat: 35.6762, lng: 139.6503 }, "seoul", "hotel@35.6762,139.6503")],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.map((s) => s.city)).toEqual(["tokyo"]);
  });

  it("โตเกียว→โอซากา (403 กม.) ตัดเป็น 2 ช่วง — เดิมทั้งวันยุบเป็นช่วงเดียว", () => {
    const segments = buildDayCitySegments({
      cities: JP_CITIES,
      stops: [
        stop("s1", { lat: 35.6762, lng: 139.6503 }, "tokyo"),
        stop("s2", { lat: 34.6937, lng: 135.5023 }, "osaka"),
      ],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.map((s) => s.city)).toEqual(["tokyo", "osaka"]);
  });

  it("เมืองที่อยู่ *นอก* คลังของทริป ยังถูกมองเป็น null — หน้าที่เดิมของ isCity ไม่หาย", () => {
    /* สนามบินกรุงเทพใน TRANSFER_POINTS ไม่ควรกลายเป็นชื่อช่วงบนแผนที่ */
    const segments = buildDayCitySegments({
      cities: JP_CITIES,
      stops: [stop("s1", { lat: 35.6762, lng: 139.6503 }, "bangkok" as Place["city"])],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.map((s) => s.city)).toEqual([null]);
  });

  it("🔴 คลังว่าง = ไม่รู้จักเมืองไหนเลย → null ทุกจุด ไม่ใช่เดาเมืองมั่ว", () => {
    const segments = buildDayCitySegments({
      cities: [],
      stops: [
        stop("s1", AT.busanNopo, "busan"),
        stop("s2", AT.sokchoExpress, "seoul", "hotel@38.19051,128.59874"),
      ],
      startHotel: null,
      endHotel: null,
    });
    expect(segments.every((s) => s.city === null)).toBe(true);
  });
});
