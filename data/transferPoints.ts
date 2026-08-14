import type { Place } from "@/data/places";

/**
 * สนามบิน/สถานีขนส่งของแถว "✈️ ไปสนามบิน/สถานี" (`trip_stops.kind = "transfer"`)
 * และเป็นลิสต์ตัวเลือกจุดขึ้น-ลงของแถวเดินทางข้ามเมือง (`kind = "intercity"`) ด้วย
 *
 * แยกจาก `PLACES` โดยตั้งใจ — สนามบิน/สถานีไม่ใช่ที่เที่ยว ไม่ควรโผล่ในคลังสถานที่ให้เลือกเพิ่มลงวัน
 * แต่ต้อง resolve เป็น `Place` ได้ (ดู `lib/resolvePlace.ts`) เพื่อให้ `computeSchedule` +
 * Routes API คำนวณเวลาเดินทางจริงจากจุดก่อนหน้าไปสนามบิน/สถานีให้เอง แทนที่จะให้กรอกตัวเลขเดาเอง
 *
 * `nameLocal`/`addressLocal` มาจากชื่อ/ที่อยู่ทางการของที่นั้น — ใช้ทั้งปุ่มนำทาง Naver/Kakao
 * และการ์ด "ยื่นให้คนขับดู" (เฟส 14) เหมือนสถานที่ปกติทุกอย่าง
 *
 * ⚠️ พิกัด/ชื่อทุกตัวในไฟล์นี้ดึงจาก Places API (New) ด้วย query ภาษาเกาหลี **ไม่ได้พิมพ์จากความจำ**
 * — สถานีบัสเกาหลีเมืองเดียวมีหลายแห่ง (고속 "ด่วน" กับ 시외 "ระหว่างเมือง" คนละที่กัน คนละสายที่วิ่ง)
 * ถ้าจะเพิ่มที่ใหม่ ให้ยิง Places API เอาพิกัดจริงมา อย่าเดา
 */
export type TransferPoint = Place & {
  /** แยกกลุ่มในลิสต์ให้เลือกง่าย — สนามบินกับสถานีใช้คนละสถานการณ์กัน
   *
   *  📌 ที่พักของเราเองที่กรุงเทพ (จุดออก 11 ต.ค. / จุดกลับ 21 ต.ค.) **จงใจไม่อยู่ในไฟล์นี้** —
   *  ไฟล์นี้ถูก commit ขึ้น git ส่วนนั่นเป็นที่อยู่จริงของเจ้าของทริป เก็บไว้ใน `custom_places`
   *  ของ Supabase แทน (id `home-base`) แล้วให้ `DayEvent.placeId` อ้างถึง */
  transferKind: "airport" | "station";
  /** true = ไม่ต้องโผล่ในลิสต์ให้เลือกของ modal "✈️ ไปสนามบิน/สถานี" — มีไว้ให้แถวตารางบิน
   *  (`DayEvent.placeId`) อ้างถึงเท่านั้น เช่นสนามบินต้นทาง/ต่อเครื่องนอกเกาหลี ซึ่งไม่มีวันไหน
   *  ในทริปนี้ต้องแทรกแถว "ไปสนามบิน" ไปหา */
  pickerHidden?: boolean;
};

export const TRANSFER_POINTS: TransferPoint[] = [
  {
    id: "airport-bkk",
    transferKind: "airport",
    pickerHidden: true,
    nameTh: "สนามบินสุวรรณภูมิ (BKK)",
    nameEn: "Suvarnabhumi Airport",
    nameLocal: "ท่าอากาศยานสุวรรณภูมิ",
    addressLocal: "999 หมู่ที่ 1 หนองปรือ อำเภอบางพลี สมุทรปราการ 10540",
    city: "bangkok",
    category: "transport",
    descriptionTh: "จุดเริ่มทริป — เช็คอิน VN610 ที่เคาน์เตอร์เวียดนามแอร์ไลน์ · และเป็นปลายทางขากลับ VN607 (ถึง 18:30 วันที่ 21)",
    lat: 13.6818969,
    lng: 100.7468694,
    mapsQuery: "ท่าอากาศยานสุวรรณภูมิ",
    googlePlaceId: "ChIJTydCFXdnHTERB3oVT1UZDRI",
    youtubeQuery: "Suvarnabhumi airport international departure guide",
  },
  {
    id: "airport-sgn",
    transferKind: "airport",
    pickerHidden: true,
    nameTh: "สนามบินเตินเซินเญิ้ต (SGN)",
    nameEn: "Tan Son Nhat International Airport",
    nameLocal: "Cảng hàng không quốc tế Tân Sơn Nhất",
    addressLocal: "Trường Sơn, Tân Sơn Hòa, Hồ Chí Minh 705000",
    city: "hcmc",
    category: "transport",
    descriptionTh: "จุดต่อเครื่องขากลับ 21 ต.ค. (VN409 → VN607) — อยู่ในเขต transit ของอาคารระหว่างประเทศ T2 ไม่ต้องผ่าน ตม.",
    lat: 10.8169828,
    lng: 106.6565808,
    mapsQuery: "Cảng hàng không quốc tế Tân Sơn Nhất",
    googlePlaceId: "ChIJnZ-oGhEpdTER8ycbqsCc8Ng",
    youtubeQuery: "Tan Son Nhat international terminal transit guide",
  },
  {
    id: "airport-han",
    transferKind: "airport",
    nameTh: "สนามบินโหน่ยบ่าย (HAN)",
    nameEn: "Noi Bai International Airport",
    nameLocal: "Sân bay quốc tế Nội Bài",
    addressLocal: "Phú Minh, Sóc Sơn, Hà Nội, Việt Nam",
    city: "hanoi",
    category: "transport",
    descriptionTh: "สนามบินฮานอย — อาคารระหว่างประเทศคือ T2 (VN610 ลง / VN428 ขึ้น)",
    lat: 21.2212,
    lng: 105.8072,
    mapsQuery: "Noi Bai International Airport Terminal 2",
    youtubeQuery: "Noi Bai airport terminal 2 guide",
  },
  {
    id: "airport-pus",
    transferKind: "airport",
    nameTh: "สนามบินกิมแฮ (PUS)",
    nameEn: "Gimhae International Airport",
    nameLocal: "김해국제공항",
    addressLocal: "부산광역시 강서구 공항진입로 108",
    city: "busan",
    category: "transport",
    descriptionTh: "สนามบินปูซาน — เข้าเมืองด้วยสาย BGL ต่อรถไฟฟ้าสาย 2 หรือลิมูซีนบัส",
    lat: 35.1795,
    lng: 128.9382,
    mapsQuery: "Gimhae International Airport",
    youtubeQuery: "Gimhae airport to Busan city",
  },
  {
    id: "airport-icn",
    transferKind: "airport",
    nameTh: "สนามบินอินชอน (ICN)",
    nameEn: "Incheon International Airport",
    nameLocal: "인천국제공항",
    addressLocal: "인천광역시 중구 공항로 272",
    city: "seoul",
    category: "transport",
    descriptionTh: "สนามบินโซล — AREX จากสถานีโซลถึง T1 ก่อนแล้วต่อไป T2 (เช็คอาคารของ VN409 ก่อนเดินทาง)",
    lat: 37.4491,
    lng: 126.4506,
    mapsQuery: "Incheon International Airport Terminal 1",
    youtubeQuery: "Incheon airport AREX guide",
  },

  // ── สถานีขนส่ง/รถไฟ สำหรับช่วงข้ามเมือง 3 ช่วงของทริปนี้ ────────────────────────
  // 15 ต.ค. บัสปูซาน→ซกโช · 16 ต.ค. ซกโช→คังนึง · 17 ต.ค. KTX คังนึง→โซล
  {
    id: "station-busan-nopo-bus",
    transferKind: "station",
    nameTh: "สถานีขนส่งปูซาน (โนโพ)",
    nameEn: "Busan Central Bus Terminal",
    nameLocal: "부산종합버스터미널",
    addressLocal: "부산광역시 금정구 노포동 133",
    city: "busan",
    category: "transport",
    descriptionTh:
      "ต้นทางบัสด่วนปูซาน → ซกโช (~5-6 ชม.) · อยู่สุดสายรถไฟฟ้าสาย 1 สถานีโนโพ (노포) ห่างจากตัวเมืองมาก เผื่อเวลาเดินทางมาขึ้นรถ",
    lat: 35.2847494,
    lng: 129.0953841,
    mapsQuery: "부산종합버스터미널",
    youtubeQuery: "Busan Central Bus Terminal Nopo guide",
  },
  {
    id: "station-sokcho-express-bus",
    transferKind: "station",
    nameTh: "สถานีขนส่งด่วนซกโช",
    nameEn: "Sokcho Express Bus Terminal",
    nameLocal: "속초고속버스터미널",
    addressLocal: "강원특별자치도 속초시 동해대로 3988",
    city: "sokcho",
    category: "transport",
    descriptionTh: "ปลายทางบัสด่วนจากปูซาน · อยู่ติดหาดซกโชทางใต้ของเมือง เดินถึงที่พักโซนหาดได้",
    lat: 38.1905088,
    lng: 128.5987419,
    mapsQuery: "속초고속버스터미널",
    youtubeQuery: "Sokcho express bus terminal",
  },
  {
    id: "station-sokcho-intercity-bus",
    transferKind: "station",
    nameTh: "สถานีขนส่งระหว่างเมืองซกโช",
    nameEn: "Sokcho Intercity Bus Terminal",
    nameLocal: "속초시외버스터미널",
    addressLocal: "강원특별자치도 속초시 장안로 16",
    city: "sokcho",
    category: "transport",
    descriptionTh:
      "คนละที่กับสถานีขนส่งด่วน! อยู่เหนือเมืองใกล้ตลาดซกโช — บัสไปคังนึง/ซอรัคซานออกจากที่นี่",
    lat: 38.2109611,
    lng: 128.591111,
    mapsQuery: "속초시외버스터미널",
    youtubeQuery: "Sokcho intercity bus terminal",
  },
  {
    id: "station-gangneung-bus",
    transferKind: "station",
    nameTh: "สถานีขนส่งคังนึง",
    nameEn: "Gangneung Bus Terminal",
    nameLocal: "강릉고속버스터미널",
    addressLocal: "강원특별자치도 강릉시 하슬라로 15",
    city: "gangneung",
    category: "transport",
    descriptionTh: "ปลายทางบัสจากซกโช · ตึกเดียวกับสถานีขนส่งระหว่างเมือง (시외) อยู่คนละฝั่งอาคาร",
    lat: 37.754515,
    lng: 128.879615,
    mapsQuery: "강릉고속버스터미널",
    youtubeQuery: "Gangneung bus terminal guide",
  },
  {
    id: "station-gangneung",
    transferKind: "station",
    nameTh: "สถานีรถไฟคังนึง (KTX)",
    nameEn: "Gangneung Station",
    nameLocal: "강릉역",
    addressLocal: "강원특별자치도 강릉시 용지로 176",
    city: "gangneung",
    category: "transport",
    descriptionTh: "ต้นทาง KTX สายคยองกัง คังนึง → โซล (~2 ชม.) · จองล่วงหน้าผ่านแอป Korail ได้",
    lat: 37.7644776,
    lng: 128.8995536,
    // ต้องมีเลขที่อยู่ต่อท้าย — ค้นด้วย "강릉역" เฉยๆ Google คืนป้ายรถเมล์ชื่อเดียวกันหน้าสถานี (รีวิว 82)
    // แทนตัวสถานีจริง (รีวิว 405) แล้วเวลาเปิด-ปิด/เรทติ้งในแอปกลายเป็นของป้ายรถเมล์
    mapsQuery: "강릉역 용지로 176",
    youtubeQuery: "Gangneung KTX station to Seoul",
  },
  {
    id: "station-seoul",
    transferKind: "station",
    nameTh: "สถานีโซล (KTX)",
    nameEn: "Seoul Station",
    nameLocal: "서울역",
    addressLocal: "서울특별시 중구 소공동 세종대로18길 2",
    city: "seoul",
    category: "transport",
    descriptionTh:
      "ปลายทาง KTX จากคังนึง · ต่อ AREX ไปอินชอนได้จากสถานีเดียวกัน (วันกลับ 21 ต.ค. ใช้ที่นี่)",
    lat: 37.555946,
    lng: 126.9723117,
    mapsQuery: "서울역",
    youtubeQuery: "Seoul Station KTX AREX guide",
  },
  {
    id: "station-cheongnyangni",
    transferKind: "station",
    nameTh: "สถานีชองรยังนี",
    nameEn: "Cheongnyangni Station",
    nameLocal: "청량리역",
    addressLocal: "서울특별시 동대문구 왕산로 214",
    city: "seoul",
    category: "transport",
    descriptionTh:
      "KTX จากคังนึงจอดที่นี่ก่อนถึงสถานีโซล — ถ้าที่พักอยู่โซนตะวันออก/เหนือของโซล ลงที่นี่ใกล้กว่า",
    lat: 37.581381,
    lng: 127.048958,
    mapsQuery: "청량리역",
    youtubeQuery: "Cheongnyangni station guide",
  },
  // ── สถานีของวันเที่ยวซูวอนไปเช้า-กลับเย็น (20 ต.ค.) — ขาไปลงสถานีซูวอน ขากลับขึ้นที่ฮวาซอ
  // เพราะ Starfield ที่เป็นจุดสุดท้ายของวันอยู่ติดสถานีฮวาซอ ไม่ต้องย้อนกลับสถานีซูวอน
  {
    id: "station-suwon",
    transferKind: "station",
    nameTh: "สถานีซูวอน",
    nameEn: "Suwon Station",
    nameLocal: "수원역",
    addressLocal: "대한민국 경기도 수원시 팔달구 덕영대로 924",
    city: "suwon",
    category: "transport",
    descriptionTh:
      "สถานีหลักของซูวอน · จากสถานีโซลมาที่นี่ได้ 2 แบบ: Subway สาย 1 (แตะ T-money ขึ้นได้เลย ~60 น.) หรือรถไฟ ITX-Saemaeul/มูกุงฮวา (จองที่นั่งล่วงหน้า ~30 น.) · ต่อบัสไปกำแพงฮวาซ็องได้ที่หน้าสถานี",
    lat: 37.26644,
    lng: 126.999408,
    mapsQuery: "수원역",
    youtubeQuery: "Suwon station to Hwaseong Fortress bus",
  },
  {
    id: "station-hwaseo",
    transferKind: "station",
    nameTh: "สถานีฮวาซอ (ติด Starfield)",
    nameEn: "Hwaseo Station",
    nameLocal: "화서역",
    addressLocal: "대한민국 경기도 수원시 팔달구 화서동 460-14",
    city: "suwon",
    category: "transport",
    descriptionTh:
      "สถานี Subway สาย 1 ถัดจากสถานีซูวอนไปทางโซล 1 สถานี · ห้าง Starfield Suwon อยู่ห่างแค่ 400 ม. เดินถึง — ขากลับเข้าโซลขึ้นจากที่นี่ประหยัดกว่าย้อนไปสถานีซูวอน",
    lat: 37.28399,
    lng: 126.989581,
    mapsQuery: "화서역",
    youtubeQuery: "화서역 스타필드 수원 도보",
  },
  {
    id: "station-east-seoul-bus",
    transferKind: "station",
    nameTh: "สถานีขนส่งตงโซล",
    nameEn: "East Seoul Bus Terminal",
    nameLocal: "동서울종합터미널",
    addressLocal: "서울특별시 광진구 구의제3동 강변역로 50",
    city: "seoul",
    category: "transport",
    descriptionTh: "ปลายทางบัสจากคังว็อน (ซกโช/คังนึง) ถ้าเลือกนั่งบัสแทน KTX · ติดสถานีคังบยอน สาย 2",
    lat: 37.5333713,
    lng: 127.0933675,
    mapsQuery: "동서울종합터미널",
    youtubeQuery: "East Seoul bus terminal guide",
  },
];

export function findTransferPoint(id: string): Place | null {
  return TRANSFER_POINTS.find((p) => p.id === id) ?? null;
}

/** จุดขึ้น-ลงรถของเมืองนั้น — ใช้เป็นตัวเลือกด่วนใน modal เดินทางข้ามเมือง */
export function stationsForCity(city: Place["city"]): TransferPoint[] {
  return TRANSFER_POINTS.filter((p) => p.transferKind === "station" && p.city === city);
}
