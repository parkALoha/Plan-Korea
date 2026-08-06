export type Slot = {
  id: string;
  label: string;
  /** candidate place ids the couple can pick from for this slot */
  candidateIds: string[];
};

export type City = "hanoi" | "busan" | "sokcho" | "gangneung" | "seoul" | "suwon";

/** เหตุการณ์เวลาตายตัวของวันนั้นที่ไม่ใช่จุดแวะเที่ยว — เที่ยวบิน, เวลาที่ต้องออกไปสนามบิน, เวลาต่อเครื่อง
 *  จองมาแล้วเปลี่ยนไม่ได้ เลยฝังไว้ในข้อมูลทริปแทนที่จะให้ผู้ใช้กรอกเอง */
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
};

export type Day = {
  id: string;
  date: string; // ISO date
  weekdayTh: string;
  city: City;
  cityTh: string;
  note?: string;
  /** where we actually sleep that night, if different from `city` (which is "where today's activities are") */
  overnightCity?: City;
  /** วันนี้ไม่ได้นอนโรงแรม (นอนบนเครื่อง / บินกลับ) — ไม่ต้องนับเป็น leg ที่พัก */
  noHotel?: boolean;
  /** ถ้าคืนนี้ยังเลือกได้ว่าจะนอนเมืองไหน ใส่ตัวเลือกไว้ตรงนี้ (ตัวแรก = ค่าเริ่มต้น/ที่จองไว้จริง) */
  overnightOptions?: City[];
  /** เที่ยวบิน/เดดไลน์ของวันนั้น */
  events?: DayEvent[];
  slots: Slot[];
};

export const ITINERARY: Day[] = [
  {
    id: "d0",
    date: "2026-10-11",
    weekdayTh: "อาทิตย์",
    city: "hanoi",
    cityTh: "กรุงเทพ → ฮานอย (พักเครื่อง)",
    note: "บินออกจากสุวรรณภูมิ แล้วพักเครื่องที่ฮานอย 11 ชม. 20 นาที — ออกไปเที่ยวเมืองเก่าได้สบายๆ แล้วกลับมาบินต่อตี 1 (นอนบนเครื่อง ไม่ต้องจองโรงแรม)",
    noHotel: true,
    events: [
      {
        time: "08:55",
        icon: "🛫",
        title: "ถึงสุวรรณภูมิ (เช็คอิน VN610)",
        detail: "เผื่อ 3 ชม. ก่อนบิน — บินระหว่างประเทศช่วงเที่ยงคนแน่น",
      },
      {
        time: "11:55",
        endTime: "13:55",
        icon: "✈️",
        title: "VN610 กรุงเทพ (สุวรรณภูมิ) → ฮานอย",
        detail: "เวียดนามแอร์ไลน์ · 2 ชม. · เวลาไทย = เวลาเวียดนาม (ไม่ต้องปรับนาฬิกา)",
      },
      {
        time: "15:30",
        icon: "🚕",
        title: "ถึงย่านเมืองเก่า (โดยประมาณ)",
        detail:
          "ผ่าน ตม. + รับกระเป๋า ~45 น. · แท็กซี่/Grab จากโหน่ยบ่าย ~35 กม. ราว 40 นาที · เที่ยวได้จริง ~6 ชม. ครึ่ง — ลากที่เที่ยวฮานอยจากคลังมาแทรกด้านล่างได้เลย",
        anchor: "before",
      },
      {
        time: "22:00",
        icon: "⏰",
        title: "ออกจากเมืองเก่ากลับสนามบิน",
        detail: "เผื่อรถติด + เช็คอิน — ต้องถึงโหน่ยบ่ายไม่เกิน 23:15",
        alert: true,
        anchor: "after",
      },
      {
        time: "01:15",
        endTime: "07:05",
        icon: "✈️",
        title: "VN428 ฮานอย → กิมแฮ (ปูซาน) — ออกตี 1:15 ของวันที่ 12",
        detail: "3 ชม. 50 น. · นอนบนเครื่อง · เกาหลีเร็วกว่าไทย 2 ชม. (07:05 ที่เกาหลี = 05:05 ไทย)",
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
    city: "busan",
    cityTh: "ปูซาน",
    note: "ลงเครื่องเช้ามาก — วันนี้อย่าอัดแน่น เผื่อเวลาเช็คอิน/ฝากกระเป๋าที่โรงแรมก่อน",
    events: [
      {
        time: "07:05",
        icon: "🛬",
        title: "VN428 ลงที่กิมแฮ (ปูซาน)",
        detail: "ผ่าน ตม. + รับกระเป๋า ~1 ชม. · เข้าเมืองด้วยสาย BGL/รถไฟฟ้าสาย 2 หรือลิมูซีน ~45-60 น.",
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
    city: "busan",
    cityTh: "ปูซาน",
    note: "วันชายฝั่งแฮอึนแด-กวังอัลลี",
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
    city: "busan",
    cityTh: "ปูซาน",
    note: "วันชิลก่อนเดินทางไกล",
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
    city: "sokcho",
    cityTh: "ซกโช",
    note: "เดินทางบัสปูซาน→ซกโช (~5-6 ชม.)",
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
    city: "sokcho",
    cityTh: "ซอรัคซาน",
    note: "ช่วงพีคใบไม้เปลี่ยนสี ควรไปแต่เช้า · คืนนี้เลือกได้ว่าจะนอนคังนึงต่อ (ที่จองไว้ตอนนี้) หรือค้างซกโชอีกคืน",
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
    city: "gangneung",
    cityTh: "คังนึง → โซล",
    note: "คืนก่อนพักที่คังนึงแล้ว วันนี้เที่ยวคังนึงต่อทั้งวัน แล้ว KTX เข้าโซลตอนเย็น",
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
    city: "seoul",
    cityTh: "โซล",
    slots: [
      {
        id: "d7-s1",
        label: "เช้า-บ่าย",
        candidateIds: ["seoul-gyeongbokgung", "seoul-bukchon", "seoul-insadong"],
      },
      {
        id: "d7-s2",
        label: "เย็น",
        candidateIds: ["seoul-myeongdong", "seoul-n-tower", "seoul-dongdaemun-ddp"],
      },
    ],
  },
  {
    id: "d8",
    date: "2026-10-19",
    weekdayTh: "จันทร์",
    city: "suwon",
    cityTh: "ซูวอน → โซล",
    note: "วันแน่นสุดในทริป จัดเวลาดีๆ · ไปเช้าเผื่อเวลาหลง/ผิดพลาด จะได้เดินทางกลับโรงแรมทัน",
    overnightCity: "seoul",
    slots: [
      {
        id: "d8-s1",
        label: "เช้า (ซูวอน)",
        candidateIds: [
          "suwon-hwaseong",
          "suwon-haenglidan",
          "suwon-starfield-library",
          "suwon-hwahongmun",
        ],
      },
      {
        id: "d8-s2",
        label: "บ่าย-เย็น (กลับโซล)",
        candidateIds: ["seoul-seongsudong", "seoul-n-tower", "seoul-ikseondong"],
      },
    ],
  },
  {
    id: "d9",
    date: "2026-10-20",
    weekdayTh: "อังคาร",
    city: "seoul",
    cityTh: "โซล",
    note: "วันเที่ยวเต็มวันสุดท้าย · คืนนี้เก็บของให้เรียบร้อย พรุ่งนี้ต้องออกจากโรงแรมตั้งแต่เช้ามืด",
    slots: [
      {
        id: "d9-s1",
        label: "บ่าย-ค่ำ",
        candidateIds: ["seoul-hongdae", "seoul-yeonnamdong"],
      },
    ],
  },
  {
    id: "d10",
    date: "2026-10-21",
    weekdayTh: "พุธ",
    city: "seoul",
    cityTh: "โซล → กรุงเทพ (วันกลับ)",
    note: "บินออกจากอินชอน 10:35 — ต้องออกจากโรงแรมตั้งแต่ ~05:45 ไม่มีเวลาเที่ยวเช้า เช็คเอาต์แล้วตรงไปสนามบินเลย",
    noHotel: true,
    events: [
      {
        time: "05:45",
        icon: "🧳",
        title: "เช็คเอาต์ + ออกจากโรงแรมโซล",
        detail: "เผื่อเวลาเดินไปสถานี/รอรถ — ถ้าโรงแรมอยู่ไกลสถานี AREX ให้ออกเร็วกว่านี้อีก 15-20 น.",
        alert: true,
      },
      {
        time: "06:15",
        endTime: "07:15",
        icon: "🚆",
        title: "AREX โซล → อินชอน (ICN)",
        detail:
          "ด่วน (Express) จากสถานีโซล 43 น. รอบแรก ~05:20 · ธรรมดา (All-stop) ~59 น. ขึ้นได้จากฮงแด/ควังฮวามุนสายตรง · หรือลิมูซีนบัสหน้าโรงแรมถ้าใกล้กว่า",
      },
      {
        time: "07:35",
        icon: "🛂",
        title: "ถึง ICN — เช็คอิน VN409",
        detail: "เผื่อ 3 ชม. ก่อนบิน · เผื่อเวลาคืน T-money / ขอคืนภาษี (Tax refund) ก่อนเข้าเกต",
      },
      {
        time: "10:35",
        endTime: "13:45",
        icon: "✈️",
        title: "VN409 อินชอน → โฮจิมินห์",
        detail: "5 ชม. 10 น. · เวียดนามช้ากว่าเกาหลี 2 ชม. (13:45 ที่เวียดนาม = 15:45 เกาหลี)",
      },
      {
        time: "13:45",
        endTime: "16:50",
        icon: "⏳",
        title: "ต่อเครื่องที่โฮจิมินห์ 3 ชม. 5 น.",
        detail: "อยู่ในสนามบิน ไม่ต้องออกไปไหน · เผื่อเวลาเดินเปลี่ยนอาคาร/ตรวจความปลอดภัยรอบสอง",
      },
      {
        time: "16:50",
        endTime: "18:30",
        icon: "🛬",
        title: "VN607 โฮจิมินห์ → กรุงเทพ (สุวรรณภูมิ)",
        detail: "1 ชม. 40 น. · ถึงไทย 18:30 — จบทริป",
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
