/**
 * ⚠️ **ไม่มีโค้ดไหนอ่านค่านี้แล้ว** — ระบบ slot เดิม (เลือกที่เที่ยว 1 ที่ต่อช่วงเวลา) ถูกแทนด้วย
 * `trip_stops` ที่ลากจัดลำดับได้ตั้งแต่หลายเดือนก่อน และตัวโหลด/bootstrap ถูกลบทิ้งในเฟส 19
 * เก็บข้อมูลไว้เฉยๆ เพราะเป็นบันทึกว่า "ตอนวางแผนแรกคิดว่าวันไหนควรไปที่ไหนบ้าง" ซึ่งยังอ่านมีประโยชน์
 * ถ้าจะลบทิ้งจริงต้องเอา `Day.slots` ออกด้วยทั้งหมด
 */
import type { Place } from "@/data/places";

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
  /** สถานที่จริงของแถวนี้ — id ใน `PLACES`, `TRANSFER_POINTS` หรือ `custom_places` ของ Supabase
   *  (resolve ด้วย `lib/eventPlace.ts` ที่ส่ง customPlaces เข้าไปให้)
   *  ใส่แล้วแถวในตารางบินจะมีรูปย่อ + กดเปิดดูรายละเอียด/แผนที่/นำทางได้เหมือนแถวจุดแวะปกติ
   *  ค่าพิเศษ `"@hotel"` = ที่พักที่ตื่นมาจากคืนก่อนหน้า (พิกัดมาจาก `trip_hotels` ตอน render
   *  ไม่ใช่ค่าคงที่ในไฟล์นี้) ใช้กับแถวเช็คเอาต์ของวันกลับ
   *
   *  📌 `"home-base"` = ที่พักของเราเองที่กรุงเทพ อยู่ใน `custom_places` **ไม่ใช่ในโค้ด** เพราะเป็น
   *  ที่อยู่จริงของเจ้าของทริป · ชื่อ/พาดหัวในไฟล์นี้จึงเขียนกลางๆ ว่า "ที่พัก" ชื่อจริงมาจาก DB ตอน render
   *
   *  เที่ยวบินให้ผูกกับ**สนามบินปลายทาง** — คำถามที่ต้องการคำตอบตอนกดคือ "ลงที่ไหน ต่อยังไง" */
  placeId?: string;
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

/**
 * ชื่อไทยของ**ทุกเมืองที่สถานที่หนึ่งอาจอยู่ได้** — กว้างกว่า `CITY_NAME_TH` ที่เป็นเมืองของทริปเท่านั้น
 *
 * แยกกันสองตัวโดยตั้งใจ: `lib/citySegments.ts` ใช้ `Object.keys(CITY_NAME_TH)` เป็นรายชื่อเมือง
 * ของทริปไปหาว่าพิกัดหนึ่งอยู่เมืองไหน — เติมกรุงเทพ/โฮจิมินห์เข้าไปในนั้นจะทำให้ช่วงเมืองบนแผนที่
 * รายวันเพี้ยน ส่วนตัวนี้ใช้เฉพาะตอนต้องเอ่ยชื่อเมืองของ `Place` ที่อาจเป็นสนามบินนอกเกาหลี
 */
export const PLACE_CITY_NAME_TH: Record<Place["city"], string> = {
  ...CITY_NAME_TH,
  bangkok: "กรุงเทพ",
  hcmc: "โฮจิมินห์",
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
