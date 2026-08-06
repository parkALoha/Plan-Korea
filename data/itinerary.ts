export type Slot = {
  id: string;
  label: string;
  /** candidate place ids the couple can pick from for this slot */
  candidateIds: string[];
};

export type Day = {
  id: string;
  date: string; // ISO date
  weekdayTh: string;
  city: "busan" | "sokcho" | "gangneung" | "seoul" | "suwon";
  cityTh: string;
  note?: string;
  /** where we actually sleep that night, if different from `city` (which is "where today's activities are") */
  overnightCity?: "busan" | "sokcho" | "gangneung" | "seoul" | "suwon";
  slots: Slot[];
};

export const ITINERARY: Day[] = [
  {
    id: "d1",
    date: "2026-10-12",
    weekdayTh: "จันทร์",
    city: "busan",
    cityTh: "ปูซาน",
    note: "ถึง Gimhae 07:05",
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
    note: "ช่วงพีคใบไม้เปลี่ยนสี ควรไปแต่เช้า · เที่ยวเสร็จเดินทางไปเช็คอินโรงแรมที่คังนึงต่อเลย (ไม่พักค้างซกโช)",
    overnightCity: "gangneung",
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
    slots: [
      {
        id: "d9-s1",
        label: "บ่าย-ค่ำ",
        candidateIds: ["seoul-hongdae", "seoul-yeonnamdong"],
      },
    ],
  },
];

export const CITY_NAME_TH: Record<Day["city"], string> = {
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
  busan: { icon: "🌊", color: "#2f6690", colorDark: "#234d6e" },
  sokcho: { icon: "🍁", color: "#3f7d5c", colorDark: "#2e5d44" },
  gangneung: { icon: "☕", color: "#2e7d82", colorDark: "#215d61" },
  seoul: { icon: "🏯", color: "#6b4c7a", colorDark: "#523a5e" },
  suwon: { icon: "🏰", color: "#b8862e", colorDark: "#946b23" },
};
