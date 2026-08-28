/**
 * 🔴 **payload ของทริปเกาหลีใบเดียว — ไม่ใช่ไฟล์ข้อมูลถาวรของแพลตฟอร์ม**
 * เจ้าของ: P3-FE/Perf · 28 ส.ค. 2026 (P1 อนุมัติ · "งานที่ 1" ของการตัด `data/*`)
 *
 * ไฟล์นี้ถือ `ITINERARY` = ทริปเกาหลี 11–21 ต.ค. 2026 **ทริปเดียวที่ยังไม่มีที่อยู่ในฐาน**
 * 🔴 **มันจะถูกลบทั้งไฟล์เมื่อ `E7` ย้ายทริปนี้เข้าฐานเสร็จ** — อย่าเพิ่มทริปที่สองลงที่นี่
 * ทริปอื่นทั้งหมดอยู่ในฐานแล้วและอ่านผ่าน `usePlatformItinerary` ไม่ใช่ผ่านไฟล์นี้
 *
 * ## ทำไมถึงแยกออกมา — **เรื่องน้ำหนักบันเดิล ไม่ใช่เรื่องระเบียบ**
 * `data/itinerary.ts` ถือของสองชนิดปนกัน: **payload ของทริปเดียว** (ก้อนนี้) กับ **ตารางค้นหาเล็ก ๆ**
 * (`CITY_NAME_TH` · `CITY_META` …) ที่ component ทั่วไปต้องใช้ · ตราบใดที่อยู่ไฟล์เดียวกัน
 * **ใครขอตารางเล็กก็ได้ payload ติดมาทั้งก้อน** — และ route `trip/[tripId]*` ของทริปแพลตฟอร์ม
 * ก็แบก `ITINERARY` ของทริปเกาหลีไปด้วยโดยไม่มีใครเห็น (`E6-AC10`)
 *
 * ⚠️ **การย้ายนี้ไม่แตะตรรกะสักบรรทัด** — ผู้เรียกทุกรายได้ค่าเดิมเป๊ะ เปลี่ยนแค่ path ที่ import
 * 📌 `PLACES` **ยังไม่ย้ายมาที่นี่** และตั้งใจ: `cityCenter()` ใน `data/places.ts` อ่าน `PLACES` อยู่
 *    → ย้ายมันมาข้าง ๆ กันก็ไม่ตัดสาย เพราะสายอยู่ที่ *ฟังก์ชันอ่าน payload* ไม่ใช่ที่ *ไฟล์ไหน*
 *    ทางที่ถูกคือให้ `cityCenter` เลิกอ่าน `PLACES` แล้วใช้ `catalog_cities.lat/lng` ตาม **`D54`**
 *    (P1 แยกเป็น "งานที่ 2" · P8 มินท์เป็น AC) — **ไม่ใช่งานของไฟล์นี้**
 */
import type { Day } from "./itinerary";

export const ITINERARY: Day[] = [
  {
    id: "d0",
    date: "2026-10-11",
    weekdayTh: "อาทิตย์",
    weekdayEn: "Sunday",
    city: "hanoi",
    cityTh: "กรุงเทพ → ฮานอย (พักเครื่อง)",
    cityEn: "Bangkok → Hanoi (layover)",
    note: "บินออกจากสุวรรณภูมิ แล้วพักเครื่องที่ฮานอย 11 ชม. 20 นาที — ออกไปเที่ยวเมืองเก่าได้สบายๆ แล้วกลับมาบินต่อตี 1 (นอนบนเครื่อง ไม่ต้องจองโรงแรม)",
    noHotel: true,
    events: [
      {
        time: "07:30",
        icon: "🏠",
        placeId: "home-base",
        title: "ออกจากที่พัก ไปสุวรรณภูมิ",
        titleEn: "Leave home for Suvarnabhumi",
        detail:
          "เผื่อ ~1 ชม. 25 น. ให้ถึงสนามบิน 08:55 · เช้าวันอาทิตย์ถนนปกติโล่ง · วิธีเดินทางกับเวลาที่เผื่อไว้อยู่ในรายละเอียดของที่พัก (แตะแถวนี้) · เวลานี้เป็นคำแนะนำ ปรับเองได้",
        kind: "transfer",
        editable: true,
      },
      {
        time: "08:55",
        icon: "🛫",
        placeId: "airport-bkk",
        title: "ถึงสุวรรณภูมิ (เช็คอิน VN610)",
        titleEn: "Arrive Suvarnabhumi — check in VN610",
        detail: "เผื่อ 3 ชม. ก่อนบิน — บินระหว่างประเทศช่วงเที่ยงคนแน่น",
        kind: "checkin",
        editable: true,
      },
      {
        time: "11:55",
        endTime: "13:55",
        icon: "✈️",
        placeId: "airport-han",
        title: "VN610 กรุงเทพ (สุวรรณภูมิ) → ฮานอย",
        titleEn: "VN610 Bangkok (BKK) → Hanoi (HAN)",
        detail: "เวียดนามแอร์ไลน์ · 2 ชม. · เวลาไทย = เวลาเวียดนาม (ไม่ต้องปรับนาฬิกา)",
        kind: "flight",
        flight: {
          no: "VN610",
          fromCode: "BKK",
          toCode: "HAN",
          fromEn: "Bangkok (Suvarnabhumi)",
          toEn: "Hanoi (Noi Bai)",
        },
      },
      {
        time: "13:55",
        endTime: "01:15",
        icon: "⏳",
        placeId: "airport-han",
        title: "พักเครื่องที่ฮานอย 11 ชม. 20 น.",
        titleEn: "Layover in Hanoi — 11 h 20 m",
        detail: "ยาวพอออกไปเที่ยวเมืองเก่าได้สบายๆ แล้วกลับมาขึ้น VN428 ตี 1:15",
        kind: "layover",
        layover: {
          baggage: "through-checked",
          immigration: "required-to-exit",
          leavesAirport: true,
          terminalChange: false,
        },
      },
      {
        time: "15:30",
        icon: "🚕",
        placeId: "hanoi-st-joseph",
        title: "ถึงย่านเมืองเก่า — เริ่มจากโบสถ์เซนต์โจเซฟ",
        titleEn: "Arrive Hanoi Old Quarter — start at St. Joseph's Cathedral",
        detail:
          "ผ่าน ตม. (ไม่ต้องรับกระเป๋า เช็คทะลุถึงกิมแฮแล้ว) · Grab Car จากโหน่ยบ่าย ~40-50 นาที ลงรถแถวโบสถ์หิน — ลากที่เที่ยวฮานอยจากคลังมาแทรกด้านล่างได้เลย (โบสถ์เซนต์โจเซฟ → ตรอกทางรถไฟ → เฝอ 10/บุ๋นจ่า → ทะเลสาบฮว่านเกี๋ยม/ถนนคนเดิน → บั๋นหมี่ 25)",
        anchor: "before",
        kind: "transfer",
        editable: true,
      },
      {
        time: "21:00",
        icon: "🚕",
        placeId: "airport-han",
        title: "ออกจากถนนคนเดินกลับสนามบิน Noi Bai (T2)",
        titleEn: "Leave the Walking Street for Noi Bai Airport (T2)",
        detail:
          "นั่ง Grab กลับสนามบิน ~40-50 นาที ถึงราว 21:50 · เผื่อเวลาอาบน้ำที่ Sông Hồng Premium Lounge ก่อนขึ้นเครื่องตี 1:15 · อยากคุมเวลาแม่นกว่านี้ให้แทรกแถว “✈️ ไปสนามบิน” ท้ายวัน แล้วระบบจะคำนวณจากเวลาเดินทางจริงให้",
        alert: true,
        anchor: "after",
        kind: "deadline",
        editable: true,
      },
      {
        time: "21:50",
        endTime: "00:30",
        icon: "🚿",
        placeId: "airport-han",
        title: "อาบน้ำพักผ่อนที่ Sông Hồng Premium Lounge",
        titleEn: "Shower & rest at Song Hong Premium Lounge",
        detail:
          "T2 Airside ชั้น 4 ใกล้ Gate 28-30 · ใช้สิทธิ์ LoungeKey ฟรีด้วยบัตร JCB Platinum/Ultimate + Boarding Pass — อาบน้ำอุ่น สระผม เปลี่ยนชุด ทานของว่าง/เครื่องดื่ม เอนหลังพักผ่อนรอขึ้นเครื่อง",
      },
      {
        time: "01:15",
        endTime: "07:05",
        icon: "✈️",
        placeId: "airport-pus",
        title: "VN428 ฮานอย → กิมแฮ (ปูซาน) — ออกตี 1:15 ของวันที่ 12",
        titleEn: "VN428 Hanoi (HAN) → Busan (PUS) — departs 01:15 on 12 Oct",
        detail: "3 ชม. 50 น. · นอนบนเครื่อง · เกาหลีเร็วกว่าไทย 2 ชม. (07:05 ที่เกาหลี = 05:05 ไทย)",
        kind: "flight",
        dayOffset: 1,
        flight: {
          no: "VN428",
          fromCode: "HAN",
          toCode: "PUS",
          fromEn: "Hanoi (Noi Bai)",
          toEn: "Busan (Gimhae)",
        },
      },
    ],
    slots: [
      {
        id: "d0-s1",
        label: "บ่าย-ค่ำ (ฮานอย)",
        candidateIds: ["hanoi-hoan-kiem", "hanoi-old-quarter", "hanoi-ta-hien"],
      },
    ],
  },
  {
    id: "d1",
    date: "2026-10-12",
    weekdayTh: "จันทร์",
    weekdayEn: "Monday",
    city: "busan",
    cityTh: "ปูซาน",
    cityEn: "Busan",
    note: "ลงเครื่องเช้ามาก — วันนี้อย่าอัดแน่น เผื่อเวลาเช็คอิน/ฝากกระเป๋าที่โรงแรมก่อน",
    events: [
      {
        time: "07:05",
        icon: "🛬",
        placeId: "airport-pus",
        title: "VN428 ลงที่กิมแฮ (ปูซาน)",
        titleEn: "VN428 arrives Busan (PUS)",
        detail: "ผ่าน ตม. + รับกระเป๋า ~1 ชม. · เข้าเมืองด้วยสาย BGL/รถไฟฟ้าสาย 2 หรือลิมูซีน ~45-60 น.",
        kind: "flight",
        flight: {
          no: "VN428",
          fromCode: "HAN",
          toCode: "PUS",
          fromEn: "Hanoi (Noi Bai)",
          toEn: "Busan (Gimhae)",
        },
      },
      {
        time: "10:00",
        icon: "🚌",
        placeId: "busan-seomyeon",
        title: "ถึงย่านซอมยอน (โดยประมาณ)",
        titleEn: "Arrive Seomyeon, Busan (approx.)",
        detail:
          "ออกจากกิมแฮ ~08:30 หลังผ่าน ตม./รับกระเป๋า · Light Rail (BGL) ต่อรถไฟฟ้าสาย 2 หรือแท็กซี่ ~1 ชม. 30 น. รวมรอ · ปรับเวลานี้ได้ที่ช่อง “🕐 ออกเดินทาง” ถ้าผ่าน ตม. เร็ว/ช้ากว่าที่เผื่อไว้",
        anchor: "before",
        kind: "transfer",
        editable: true,
      },
    ],
    slots: [
      { id: "d1-s1", label: "สาย-บ่าย", candidateIds: ["busan-gamcheon"] },
      {
        id: "d1-s2",
        label: "เย็น",
        candidateIds: ["busan-jagalchi", "busan-bupyeong-biff"],
      },
    ],
  },
  {
    id: "d2",
    date: "2026-10-13",
    weekdayTh: "อังคาร",
    weekdayEn: "Tuesday",
    city: "busan",
    cityTh: "ปูซาน",
    cityEn: "Busan",
    note: "วันเกาะยองโด-เมืองเก่า: หมู่บ้านฮึนยอล → นัมโพดง → ขึ้นฮวังรยองซานดูพระอาทิตย์ตกและไฟเมือง",
    slots: [
      { id: "d2-s1", label: "เช้า-สาย", candidateIds: ["busan-haeundae-beach"] },
      {
        id: "d2-s2",
        label: "บ่าย",
        candidateIds: ["busan-blueline-mipo", "busan-cheongsapo"],
      },
      {
        id: "d2-s3",
        label: "เย็น-ค่ำ",
        candidateIds: ["busan-gwangalli", "busan-bay101"],
      },
    ],
  },
  {
    id: "d3",
    date: "2026-10-14",
    weekdayTh: "พุธ",
    weekdayEn: "Wednesday",
    city: "busan",
    cityTh: "ปูซาน",
    cityEn: "Busan",
    note: "วันชายฝั่งแฮอึนแด: สกายแคปซูล → วัดริมทะเลยงกุงซา → จบที่หาดควังอัลลี · คืนนี้เก็บของให้พร้อม พรุ่งนี้นั่งบัสยาวไปซกโช",
    slots: [
      { id: "d3-s1", label: "เช้า-บ่าย", candidateIds: ["busan-jeonpo"] },
      {
        id: "d3-s2",
        label: "เสริม (ถ้ามีเวลา)",
        candidateIds: ["busan-oryukdo"],
      },
    ],
  },
  {
    id: "d4",
    date: "2026-10-15",
    weekdayTh: "พฤหัสบดี",
    weekdayEn: "Thursday",
    city: "sokcho",
    cityTh: "ซกโช",
    cityEn: "Sokcho",
    note: "วันนั่งบัสยาว: ออกจากซอมยอน 06:45 → สถานีโนโพ → บัสด่วน 07:30 ถึงซกโช ~12:30 · บ่ายเดินหาดหน้าโรงแรม + ชิงช้าสวรรค์ เย็นตลาดปลา แล้วนั่งแพข้ามไปหมู่บ้านอาไบ",
    slots: [
      {
        id: "d4-s1",
        label: "เย็น",
        candidateIds: ["sokcho-eye", "sokcho-market"],
      },
    ],
  },
  {
    id: "d5",
    date: "2026-10-16",
    weekdayTh: "ศุกร์",
    weekdayEn: "Friday",
    city: "sokcho",
    cityTh: "ซอรัคซาน",
    cityEn: "Seoraksan",
    note: "ซอรัคซานเต็มอิ่มทั้งเช้า (ไปถึง 07:00 ต่อคิวกระเช้า) → กลับมาเก็บกระเป๋า → คาเฟ่ริมหาดส่งท้ายซกโช → บัสเข้าคังนึงบ่ายแก่ๆ เย็นเดินตลาดจุงอัง · คืนนี้เลือกได้ว่าจะนอนคังนึงต่อ (ที่จองไว้ตอนนี้) หรือค้างซกโชอีกคืน",
    overnightCity: "gangneung",
    overnightOptions: ["gangneung", "sokcho"],
    slots: [
      {
        id: "d5-s1",
        label: "เต็มวัน",
        candidateIds: ["sokcho-seoraksan", "sokcho-osaek"],
      },
    ],
  },
  {
    id: "d6",
    date: "2026-10-17",
    weekdayTh: "เสาร์",
    weekdayEn: "Saturday",
    city: "gangneung",
    cityTh: "คังนึง → โซล",
    cityEn: "Gangneung → Seoul",
    note: "เช้าตามรอย BTS/Goblin ที่จูมุนจิน + กาแฟหาดอันมก (ฝากกระเป๋าตู้ล็อกเกอร์สถานีคังนึง) → KTX 13:30 เข้าโซล → เช็คอินเมียงดง → หมูย่าง JD BBQ ที่อิแทวอนรอบร้านเปิด แล้วกลับมาเดินเมียงดงตอนค่ำ",
    overnightCity: "seoul",
    slots: [
      {
        id: "d6-s1",
        label: "บ่าย",
        candidateIds: [
          "gangneung-bts-bus-stop",
          "gangneung-jumunjin",
          "gangneung-anmok",
          "gangneung-gyeongpo",
          "gangneung-ojukheon",
        ],
      },
      {
        id: "d6-s2",
        label: "เย็น (โซล)",
        candidateIds: [
          "seoul-jd-bbq-itaewon",
          "seoul-myeongdong",
          "seoul-myeongdong-kyoja",
        ],
      },
    ],
  },
  {
    id: "d7",
    date: "2026-10-18",
    weekdayTh: "อาทิตย์",
    weekdayEn: "Sunday",
    city: "seoul",
    cityTh: "โซล",
    cityEn: "Seoul",
    note: "วันช้อปย่านวัยรุ่น เรียงตามสาย 2 (สีเขียว): ยอนนัมดงเช้า → ฮงแดสาย → ซองซูดงบ่ายยาวๆ → ห้าง The Hyundai ยออีโดเย็น → ปิดท้ายกินรามยอนริมแม่น้ำฮันยามค่ำ · ย้ายซองซูดงมาช่วงบ่ายเพราะป๊อปอัปสโตร์/แฟล็กชิปทยอยปิด 20:00",
    slots: [
      {
        id: "d7-s1",
        label: "เช้า-สาย",
        candidateIds: ["seoul-yeonnamdong", "seoul-hongdae", "seoul-saemaul-hongdae"],
      },
      {
        id: "d7-s2",
        label: "บ่าย",
        candidateIds: ["seoul-seongsudong"],
      },
      {
        id: "d7-s3",
        label: "เย็น-ค่ำ",
        candidateIds: ["seoul-the-hyundai", "seoul-yeouido-hangang"],
      },
    ],
  },
  {
    id: "d8",
    date: "2026-10-19",
    weekdayTh: "จันทร์",
    weekdayEn: "Monday",
    city: "seoul",
    cityTh: "โซล",
    cityEn: "Seoul",
    note: "วันฮันบก: เช่าชุดเช้า → เคียงบกกุง → ไก่ตุ๋นโสมโทโซกชน → คืนชุดแล้วเดินบุคชน-อินซาดง-อิกซอนดง → เย็นเก็บของฝาก/เครื่องสำอางที่เมียงดง · สลับมาจากวันที่ 20 เพราะเคียงบกกุงปิดทุกวันอังคาร",
    slots: [
      {
        id: "d8-s1",
        label: "เช้า-บ่าย (ฮันบก)",
        candidateIds: [
          "seoul-hanboknam",
          "seoul-gyeongbokgung",
          "seoul-tosokchon",
          "seoul-bukchon",
        ],
      },
      {
        id: "d8-s2",
        label: "บ่าย-เย็น",
        candidateIds: [
          "seoul-insadong",
          "seoul-ikseondong",
          "seoul-yoojung-sikdang",
          "seoul-olive-young-myeongdong",
        ],
      },
    ],
  },
  {
    id: "d9",
    date: "2026-10-20",
    weekdayTh: "อังคาร",
    weekdayEn: "Tuesday",
    city: "suwon",
    cityTh: "ซูวอน → โซล",
    cityEn: "Suwon → Seoul",
    note: "วันเที่ยวเต็มวันสุดท้าย ซูวอนฉบับฮิปสเตอร์ (ช้อปปิ้ง-คาเฟ่-สตรีทฟู้ด): ลงสถานีฮวาซอเข้า Starfield ตอนสาย → แฮงกุงดงยาวๆ ช่วงบ่าย → ไก่ทอดซอสคัลบีมื้อเย็นที่ตรอกไก่ทอด → เดินชมไฟกำแพงฮวาซ็อง แล้วขึ้นสาย 1 จากสถานีซูวอนกลับโซล · คืนนี้เก็บของให้เรียบร้อย พรุ่งนี้ออกจากโรงแรมตั้งแต่เช้ามืด",
    overnightCity: "seoul",
    slots: [
      {
        id: "d9-s1",
        label: "สาย-เที่ยง (ช้อปปิ้ง)",
        candidateIds: ["suwon-starfield-library"],
      },
      {
        id: "d9-s2",
        label: "บ่าย (คาเฟ่)",
        candidateIds: ["suwon-haenglidan", "suwon-haenggung"],
      },
      {
        id: "d9-s3",
        label: "เย็น-ค่ำ",
        candidateIds: ["suwon-tongdak-street", "suwon-hwaseong", "suwon-hwahongmun"],
      },
    ],
  },
  {
    id: "d10",
    date: "2026-10-21",
    weekdayTh: "พุธ",
    weekdayEn: "Wednesday",
    city: "seoul",
    cityTh: "โซล → กรุงเทพ (วันกลับ)",
    cityEn: "Seoul → Bangkok (return)",
    note: "บินออกจากอินชอน 10:35 — ต้องออกจากโรงแรมตั้งแต่ ~05:45 ไม่มีเวลาเที่ยวเช้า เช็คเอาต์แล้วตรงไปสนามบินเลย",
    noHotel: true,
    events: [
      {
        time: "05:45",
        icon: "🧳",
        placeId: "@hotel",
        title: "เช็คเอาต์ + ออกจากโรงแรมโซล",
        titleEn: "Check out and leave the Seoul hotel",
        detail:
          "เผื่อเวลาเดินไปสถานี/รอรถ — ถ้าโรงแรมอยู่ไกลสถานี AREX ให้ออกเร็วกว่านี้อีก 15-20 น. · แทรกแถว “✈️ ไปสนามบิน” ท้ายวันแล้วระบบจะคำนวณเวลาออกจริงจากพิกัดโรงแรมที่เลือกไว้ให้",
        alert: true,
        anchor: "before",
        kind: "deadline",
        editable: true,
      },
      {
        time: "06:15",
        endTime: "07:15",
        icon: "🚆",
        placeId: "station-seoul",
        title: "AREX โซล → อินชอน (ICN)",
        titleEn: "AREX Seoul → Incheon (ICN)",
        detail:
          "ด่วน (Express) จากสถานีโซล 43 น. รอบแรก ~05:20 · ธรรมดา (All-stop) ~59 น. ขึ้นได้จากฮงแด/ควังฮวามุนสายตรง · หรือลิมูซีนบัสหน้าโรงแรมถ้าใกล้กว่า · ⚠️ เช็คอิน/โหลดกระเป๋าที่สถานีโซล (City Airport Check-in) ใช้กับ VN409 ไม่ได้ — บริการนี้รับเฉพาะ KE/OZ/7C/TW/RS/BX/LJ/ZE/LH ต้องไปเช็คอินที่ ICN เหมือนปกติ",
        kind: "transfer",
        editable: true,
      },
      {
        time: "07:35",
        icon: "🛂",
        placeId: "airport-icn",
        title: "ถึง ICN — เช็คอิน VN409",
        titleEn: "Arrive ICN — check in VN409",
        detail: "เผื่อ 3 ชม. ก่อนบิน · เผื่อเวลาคืน T-money / ขอคืนภาษี (Tax refund) ก่อนเข้าเกต",
        // เดดไลน์ของวันนี้ — วันนี้ยังไม่มีจุดแวะสักจุด แถบเตือนจึงยังไม่มีอะไรให้เตือน แต่พอเติม
        // จุดแวะเมื่อไหร่ (เช่นแถว "✈️ ไปสนามบิน") จะได้เตือนทันทีถ้าตารางลากยาวเลยเวลาเช็คอิน
        // — ก่อนหน้านี้ทั้งวันไม่มี anchor "after" เลย ต่างจากวัน 11 ที่มีเดดไลน์ 21:00 คุมอยู่
        anchor: "after",
        kind: "checkin",
        editable: true,
      },
      {
        time: "10:35",
        endTime: "13:45",
        icon: "✈️",
        placeId: "airport-sgn",
        title: "VN409 อินชอน → โฮจิมินห์",
        titleEn: "VN409 Incheon (ICN) → Ho Chi Minh City (SGN)",
        detail: "5 ชม. 10 น. · เวียดนามช้ากว่าเกาหลี 2 ชม. (13:45 ที่เวียดนาม = 15:45 เกาหลี)",
        kind: "flight",
        flight: {
          no: "VN409",
          fromCode: "ICN",
          toCode: "SGN",
          fromEn: "Seoul (Incheon)",
          toEn: "Ho Chi Minh City (Tan Son Nhat)",
        },
      },
      {
        time: "13:45",
        endTime: "16:50",
        icon: "⏳",
        placeId: "airport-sgn",
        title: "ต่อเครื่องที่โฮจิมินห์ 3 ชม. 5 น.",
        titleEn: "Layover in Ho Chi Minh City — 3 h 5 m",
        detail: "อยู่ในเขต transit ของอาคารระหว่างประเทศ ไม่ต้องออกไปไหน · เผื่อเวลาตรวจความปลอดภัยรอบสอง",
        kind: "layover",
        layover: {
          baggage: "through-checked",
          immigration: "none",
          leavesAirport: false,
          terminalChange: false,
        },
      },
      {
        time: "14:00",
        endTime: "16:00",
        icon: "🛋️",
        placeId: "airport-sgn",
        title: "พักที่ Rose Business Lounge (SGN, Terminal 2)",
        titleEn: "Rest at Rose Business Lounge (SGN, Terminal 2)",
        detail:
          "อยู่ฝั่ง international airside ใกล้ Gate 8-9 · ใช้สิทธิ์ LoungeKey ฟรีด้วยบัตร JCB Platinum/Ultimate + Boarding Pass (โควตาเดียวกับที่ใช้ตอนขาไปที่ฮานอย) · บุฟเฟต์อาหารเวียดนาม/นานาชาติ + เก้าอี้นวด · ออกไปเกตราว 16:00-16:10 เผื่อเดินไกล",
      },
      {
        time: "16:50",
        endTime: "18:30",
        icon: "🛬",
        placeId: "airport-bkk",
        title: "VN607 โฮจิมินห์ → กรุงเทพ (สุวรรณภูมิ)",
        titleEn: "VN607 Ho Chi Minh City (SGN) → Bangkok (BKK)",
        detail: "1 ชม. 40 น. · ถึงไทย 18:30",
        kind: "flight",
        flight: {
          no: "VN607",
          fromCode: "SGN",
          toCode: "BKK",
          fromEn: "Ho Chi Minh City (Tan Son Nhat)",
          toEn: "Bangkok (Suvarnabhumi)",
        },
      },
      {
        time: "20:15",
        icon: "🏠",
        placeId: "home-base",
        title: "กลับถึงที่พัก — จบทริป",
        titleEn: "Home — end of trip",
        detail:
          "เผื่อ ~1 ชม. 45 น. จากล้อแตะ 18:30: ผ่าน ตม.ไทย + รอกระเป๋า ~45-60 น. แล้ว ARL/แท็กซี่เข้าเมืองอีก ~40-50 น. · เวลานี้เป็นคำแนะนำ ปรับเองได้",
        kind: "transfer",
        editable: true,
      },
    ],
    slots: [],
  },
];
