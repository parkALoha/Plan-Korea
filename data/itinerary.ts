/**
 * ⚠️ **ไม่มีโค้ดไหนอ่านค่านี้แล้ว** — ระบบ slot เดิม (เลือกที่เที่ยว 1 ที่ต่อช่วงเวลา) ถูกแทนด้วย
 * `trip_stops` ที่ลากจัดลำดับได้ตั้งแต่หลายเดือนก่อน และตัวโหลด/bootstrap ถูกลบทิ้งในเฟส 19
 * เก็บข้อมูลไว้เฉยๆ เพราะเป็นบันทึกว่า "ตอนวางแผนแรกคิดว่าวันไหนควรไปที่ไหนบ้าง" ซึ่งยังอ่านมีประโยชน์
 * ถ้าจะลบทิ้งจริงต้องเอา `Day.slots` ออกด้วยทั้งหมด
 */
export type Slot = {
  id: string;
  label: string;
  /** candidate place ids the couple can pick from for this slot */
  candidateIds: string[];
};

export type City = "hanoi" | "busan" | "sokcho" | "gangneung" | "seoul" | "suwon";

/** ชนิดของเหตุการณ์ในวันบิน — เฟส 15 เปลี่ยนจาก "ลิสต์ข้อความ" มาเป็นโมเดลจริง เพื่อให้ระบบรู้ว่า
 *  อันไหนคือตั๋วที่ล็อกแล้ว อันไหนเป็นแค่คำแนะนำที่ปรับได้ และคำนวณต่อได้ (เช่น "ควรออกกี่โมง") */
export type DayEventKind = "flight" | "layover" | "transfer" | "checkin" | "deadline";

/** เที่ยวบินที่จองมาแล้ว — แยกเป็นฟิลด์แทนที่จะฝังในข้อความ เพราะหน้า ตม./K-ETA (เฟส 16) ต้องใช้
 *  เลขเที่ยวบิน + ต้นทาง/ปลายทางเป็นภาษาอังกฤษ ดึงจากที่เดียวกับที่แสดงในตารางบิน */
export type FlightInfo = {
  /** เลขเที่ยวบิน เช่น "VN610" */
  no: string;
  /** รหัสสนามบิน IATA เช่น "BKK" / "HAN" */
  fromCode: string;
  toCode: string;
  /** ชื่อสนามบิน/เมืองภาษาอังกฤษ ใช้บนเอกสารที่ยื่นให้เจ้าหน้าที่ */
  fromEn: string;
  toEn: string;
};

/** ช่วงต่อเครื่อง — 4 อย่างนี้คือสิ่งที่ตัดสินว่า "ช่วงนี้ทำอะไรได้บ้าง" ซึ่งเดิมระบบไม่รู้เลย
 *  (ข้อมูลอยู่แค่ในข้อความ detail) ทำให้คำนวณเวลาเผื่อและออกไปเที่ยวระหว่างรอต่อเครื่องไม่ได้ */
export type Layover = {
  /** "through-checked" = กระเป๋าเช็คทะลุถึงปลายทางสุดท้ายแล้ว ไม่ต้องรับ · "reclaim" = ต้องรับแล้วเช็คใหม่ */
  baggage: "through-checked" | "reclaim";
  /** "none" = อยู่ในเขต transit ไม่ต้องผ่าน ตม. · "required-to-exit" = ต้องผ่าน ตม. ถึงจะออกจากสนามบินได้ */
  immigration: "none" | "required-to-exit";
  /** ออกไปนอกสนามบินระหว่างรอไหม (ตัดสินใจแล้วในแผน ไม่ใช่แค่ "ทำได้ไหม") */
  leavesAirport: boolean;
  /** ต้องเปลี่ยนอาคารผู้โดยสารระหว่างต่อเครื่องไหม */
  terminalChange: boolean;
};

/** เหตุการณ์เวลาตายตัวของวันนั้นที่ไม่ใช่จุดแวะเที่ยว — เที่ยวบิน, เวลาที่ต้องออกไปสนามบิน, เวลาต่อเครื่อง
 *  ตัวที่ `editable: false` คือตั๋วที่จองมาแล้วเปลี่ยนไม่ได้จริงๆ ที่เหลือเป็นคำแนะนำที่ปรับตามหน้างานได้ */
export type DayEvent = {
  /** เวลาท้องถิ่นของจุดเริ่ม เช่น "11:55" */
  time: string;
  /** เวลาท้องถิ่นของจุดสิ้นสุด (ถ้ามี) เช่น "13:55" */
  endTime?: string;
  icon: string;
  title: string;
  detail?: string;
  /** true = เป็นข้อควรระวัง/เดดไลน์ที่พลาดไม่ได้ (เน้นสีต่างจากแถวปกติ) */
  alert?: boolean;
  /** เวลานี้ตายตัว แก้ไม่ได้ แต่เป็นจุดเปิด/ปิดของ "ช่วงว่าง" ที่แทรกจุดแวะเที่ยวได้ในวันเดียวกัน
   *  "before" = จุดแวะเริ่มนับเวลาต่อจากเหตุการณ์นี้ (เช่น ถึงสนามบินแล้วออกไปเที่ยว)
   *  "after"  = เดดไลน์ที่จุดแวะทั้งหมดของวันนี้ต้องจบก่อนเวลานี้ (เช่น ต้องกลับไปขึ้นเครื่อง) */
  anchor?: "before" | "after";
  /** ชนิดของเหตุการณ์ — ไม่ใส่ = เหตุการณ์ทั่วไป แสดงเป็นแถวข้อความเฉยๆ เหมือนก่อนเฟส 15 */
  kind?: DayEventKind;
  /** false/ไม่ใส่ = ตั๋วที่จองแล้ว ล็อกถาวร · true = เวลานี้เป็นคำแนะนำ ปรับตามสถานการณ์จริงได้
   *  (เช่น ผ่าน ตม. เร็วกว่าที่เผื่อไว้ ก็ถึงเมืองเก่าเร็วขึ้น) — ปรับได้ที่ช่อง "🕐 ออกเดินทาง" ของวันนั้น */
  editable?: boolean;
  /** ชื่อเหตุการณ์ภาษาอังกฤษ — ใส่เฉพาะเหตุการณ์ที่ต้องอ่านออกบนหน้า ตม./K-ETA (เฟส 16)
   *  จงใจไม่มี `detailEn`: detail เป็นโน้ตวางแผนของเราเอง ไม่ใช่ข้อมูลที่เจ้าหน้าที่ต้องอ่าน */
  titleEn?: string;
  /** เวลาของเหตุการณ์นี้เป็นของวันถัดไปจาก `Day.date` กี่วัน (ปกติ 0)
   *  เคสจริงคือ VN428 ที่ออกตี 1:15 = วันที่ 12 แต่แสดงอยู่ในการ์ดวันที่ 11 เพราะเป็นช่วงต่อเนื่องกัน
   *  — เอกสารที่ยื่นให้ ตม. ต้องขึ้นวันที่ให้ถูก ไม่งั้นวันบินเข้าประเทศคลาดไป 1 วัน */
  dayOffset?: number;
  /** มีค่าเมื่อ kind === "flight" */
  flight?: FlightInfo;
  /** มีค่าเมื่อ kind === "layover" */
  layover?: Layover;
};

export type Day = {
  id: string;
  date: string; // ISO date
  weekdayTh: string;
  /** ชื่อวันภาษาอังกฤษ — ฝังไว้แทนที่จะ derive จาก toLocaleDateString ให้ตรงกับ weekdayTh เป๊ะๆ
   *  และไม่ต้องพึ่งข้อมูล locale ของ runtime (เฟส 16 ใช้บนหน้า /summary?lang=en) */
  weekdayEn: string;
  city: City;
  cityTh: string;
  /** พาดหัวเมืองของวันนั้นภาษาอังกฤษ (บางวันเป็นวันย้ายเมือง เช่น "Gangneung → Seoul") */
  cityEn: string;
  note?: string;
  /** where we actually sleep that night, if different from `city` (which is "where today's activities are") */
  overnightCity?: City;
  /** วันนี้ไม่ได้นอนโรงแรม (นอนบนเครื่อง / บินกลับ) — ไม่ต้องนับเป็น leg ที่พัก */
  noHotel?: boolean;
  /** ถ้าคืนนี้ยังเลือกได้ว่าจะนอนเมืองไหน ใส่ตัวเลือกไว้ตรงนี้ (ตัวแรก = ค่าเริ่มต้น/ที่จองไว้จริง) */
  overnightOptions?: City[];
  /** เที่ยวบิน/เดดไลน์ของวันนั้น */
  events?: DayEvent[];
  /** ไม่มีใครอ่านแล้ว — ดูคำอธิบายที่ `Slot` ด้านบน */
  slots: Slot[];
};

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
        time: "08:55",
        icon: "🛫",
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
        title: "อาบน้ำพักผ่อนที่ Sông Hồng Premium Lounge",
        titleEn: "Shower & rest at Song Hong Premium Lounge",
        detail:
          "T2 Airside ชั้น 4 ใกล้ Gate 28-30 · ใช้สิทธิ์ LoungeKey ฟรีด้วยบัตร JCB Platinum/Ultimate + Boarding Pass — อาบน้ำอุ่น สระผม เปลี่ยนชุด ทานของว่าง/เครื่องดื่ม เอนหลังพักผ่อนรอขึ้นเครื่อง",
      },
      {
        time: "01:15",
        endTime: "07:05",
        icon: "✈️",
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
    note: "เช้าตามรอย BTS/Goblin ที่จูมุนจิน + กาแฟหาดอันมก (ฝากกระเป๋าตู้ล็อกเกอร์สถานีคังนึง) → KTX 13:30 เข้าโซล → เช็คอินเมียงดง เย็นช้อปปิ้ง + คัลกุกซู แล้วขึ้นนัมซานทาวเวอร์ดูวิวกลางคืน",
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
    note: "วันช้อปย่านวัยรุ่น: ฮงแด-ยอนนัมดงตอนสาย → ห้าง The Hyundai ยออีโด → นั่งชิลกินรามยอนริมแม่น้ำฮันดูพระอาทิตย์ตก → ปิดท้ายซองซูดงตอนค่ำ",
    slots: [
      {
        id: "d7-s1",
        label: "เช้า-บ่าย",
        candidateIds: ["seoul-hongdae", "seoul-yeonnamdong", "seoul-the-hyundai"],
      },
      {
        id: "d7-s2",
        label: "เย็น",
        candidateIds: ["seoul-yeouido-hangang", "seoul-seongsudong"],
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
    note: "วันเที่ยวเต็มวันสุดท้าย ไปเช้ากลับเย็น: กำแพงฮวาซ็อง → ตรอกไก่ทอด → แฮงลีดันกิล+วังแฮงกุง → Starfield แล้วขึ้นสาย 1 กลับจากสถานีฮวาซอ · คืนนี้เก็บของให้เรียบร้อย พรุ่งนี้ออกจากโรงแรมตั้งแต่เช้ามืด",
    overnightCity: "seoul",
    slots: [
      {
        id: "d9-s1",
        label: "เช้า-บ่าย (ซูวอน)",
        candidateIds: [
          "suwon-changnyongmun",
          "suwon-hwahongmun",
          "suwon-hwaseong",
          "suwon-tongdak-street",
        ],
      },
      {
        id: "d9-s2",
        label: "บ่าย-เย็น",
        candidateIds: ["suwon-haenglidan", "suwon-haenggung", "suwon-starfield-library"],
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
        title: "ถึง ICN — เช็คอิน VN409",
        titleEn: "Arrive ICN — check in VN409",
        detail: "เผื่อ 3 ชม. ก่อนบิน · เผื่อเวลาคืน T-money / ขอคืนภาษี (Tax refund) ก่อนเข้าเกต",
        kind: "checkin",
        editable: true,
      },
      {
        time: "10:35",
        endTime: "13:45",
        icon: "✈️",
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
        time: "16:50",
        endTime: "18:30",
        icon: "🛬",
        title: "VN607 โฮจิมินห์ → กรุงเทพ (สุวรรณภูมิ)",
        titleEn: "VN607 Ho Chi Minh City (SGN) → Bangkok (BKK)",
        detail: "1 ชม. 40 น. · ถึงไทย 18:30 — จบทริป",
        kind: "flight",
        flight: {
          no: "VN607",
          fromCode: "SGN",
          toCode: "BKK",
          fromEn: "Ho Chi Minh City (Tan Son Nhat)",
          toEn: "Bangkok (Suvarnabhumi)",
        },
      },
    ],
    slots: [],
  },
];

export const CITY_NAME_TH: Record<Day["city"], string> = {
  hanoi: "ฮานอย",
  busan: "ปูซาน",
  sokcho: "ซกโช",
  gangneung: "คังนึง",
  seoul: "โซล",
  suwon: "ซูวอน",
};

export const CITY_NAME_EN: Record<Day["city"], string> = {
  hanoi: "Hanoi",
  busan: "Busan",
  sokcho: "Sokcho",
  gangneung: "Gangneung",
  seoul: "Seoul",
  suwon: "Suwon",
};

export const CITY_META: Record<
  Day["city"],
  { icon: string; color: string; colorDark: string }
> = {
  hanoi: { icon: "🛫", color: "#a8552f", colorDark: "#843f21" },
  busan: { icon: "🌊", color: "#2f6690", colorDark: "#234d6e" },
  sokcho: { icon: "🍁", color: "#3f7d5c", colorDark: "#2e5d44" },
  gangneung: { icon: "☕", color: "#2e7d82", colorDark: "#215d61" },
  seoul: { icon: "🏯", color: "#6b4c7a", colorDark: "#523a5e" },
  suwon: { icon: "🏰", color: "#b8862e", colorDark: "#946b23" },
};
