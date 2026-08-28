/**
 * ฟิลด์ที่ tool ของ Copilot คืนให้โมเดลได้ — **allowlist** · `E8-AC2` ฝั่งเข้า
 * เจ้าของ: P5-AI/Agent · 28 ส.ค. 2026 · **ไม่ import อะไรเลย**
 * ประกาศเป็นร้อยแก้วอยู่ที่ `docs/engine/copilot-spec.md §35`
 *
 * ## 🔴 สถานะวันนี้: **ประกาศแล้ว · ยังไม่มีอะไรบังคับ**
 * ยังไม่มีโค้ด tool สักตัว → ด่านที่เรียก `unknownFields()` วันนี้จะตรวจไฟล์นี้เทียบกับตัวมันเอง
 * ซึ่งเป็น `P-30` (ของที่ถูกตรวจสร้างเงื่อนไขของมันเอง)
 * ✅ **มันผูกจริงเมื่อ tool wrapper ตัวแรกส่ง response ของจริงเข้ามา** — ไม่ใช่ก่อนหน้านั้น
 *
 * ## 🔴 ทำไม allowlist ไม่ใช่ denylist ของคำว่าเงิน
 * `E8-AC2` ห้าม "งบประมาณ/ราคา/ค่าใช้จ่าย" · denylist (`price` `฿` `KRW`) กันได้เฉพาะคำที่นึกออกวันนี้
 * — **`amount` · `total` · `fee` เลี่ยงคำได้หมด และสกุลเงินใหม่/ภาษาใหม่ก็ผ่าน**
 * 🎯 **allowlist ทำให้ฟิลด์ที่ไม่มีใครตั้งใจใส่ ละเมิดโดยปริยาย** — และจับของที่หลุดเข้าบริบทโมเดล
 * **ทุกชนิด ไม่ใช่แค่ราคา** · ตัวอย่าง: `get_bookings` ตัด `confirmation_number`/`file_url` ออก
 * ไม่ใช่เพราะเป็นราคา **แต่เพราะไม่มีเคสไหนใน `copilot-spec §4` ต้องใช้มัน**
 */

/** ฟิลด์ระดับบน + ฟิลด์ของ object/array ที่ประกาศไว้ */
export type ToolShape = {
  readonly self: readonly string[];
  /**
   * 🔴 **รวม object กับ array ไว้คีย์เดียวกันโดยตั้งใจ** — ตัวตรวจสนใจแค่ *"ฟิลด์ชื่ออะไรบ้าง"*
   * ไม่ได้สนใจว่าห่ออยู่ในอะไร · แยกสองชนิดจะได้ตารางที่ยาวขึ้นโดยไม่ตอบคำถามเพิ่มสักข้อ
   */
  readonly nested?: Readonly<Record<string, readonly string[]>>;
};

const STOP_FIELDS = [
  "stopId", "placeRef", "name", "arrival", "departure",
  "arrivalMinutes", "departureMinutes", "resolvedDwellMinutes",
  "travelMinutesFromPrev", "source", "estimateReason", "kind",
] as const;

/** tool เขียนทั้ง 6 ตัวคืนรูปเดียวกัน (`copilot-spec §2.3`) */
const PROPOSAL_FIELDS = ["proposalId", "summary", "preview", "expiresAt"] as const;

export const TOOL_RESPONSE_FIELDS = {
  get_day_schedule: {
    self: ["stops", "departFrom", "arriveBackAt", "endOfDayMinutes", "unknownLegCount", "dayBounds"],
    nested: { stops: STOP_FIELDS, dayBounds: ["start", "end"] },
  },
  check_opening_hours: {
    self: ["perStop"],
    nested: { perStop: ["stopId", "isOpen", "minutesUntilClose", "hoursLabel", "asOf"] },
  },
  estimate_reorder: {
    self: ["suggestedOrder", "currentKm", "suggestedKm", "changed", "lockedStopIds"],
  },
  get_departure_advice: {
    self: ["mustArriveBy", "shouldLeaveBy", "plannedArrival", "lateByMinutes", "slackMinutes", "source"],
  },
  get_day_city_segments: {
    self: ["segments"],
    nested: { segments: ["city", "cityId", "stopCount", "items"] },
  },
  get_travel_time: {
    self: ["minutes", "distanceMeters", "source", "estimateReason", "asOf"],
  },
  find_places: {
    self: ["ok", "candidates", "reason"],
    nested: {
      candidates: ["placeId", "name", "address", "lat", "lng", "rating", "openingHours", "primaryType"],
    },
  },
  get_place_details: {
    self: ["ok", "name", "nameLocal", "addressLocal", "regularOpeningHours", "primaryType", "asOf", "reason"],
  },
  get_bookings: {
    self: ["bookings"],
    // 🔴 `TripBooking` จริงมี 15 ฟิลด์ · อนุญาต 6 · ดู doc comment หัวไฟล์
    nested: { bookings: ["title", "category", "status", "date", "time", "bookByDaysBefore"] },
  },
  get_capabilities: {
    self: ["status", "cityId", "countryCode", "realTravelModes", "mapProviders"],
  },
  get_now: {
    self: ["todayDayId", "todayStatus", "todayDate", "nowMinutes", "timeZone", "clockSuspect", "travelTimesUnavailable"],
  },
  propose_reorder_day: { self: PROPOSAL_FIELDS },
  propose_move_stop: { self: PROPOSAL_FIELDS },
  propose_add_stop: { self: PROPOSAL_FIELDS },
  propose_remove_stop: { self: PROPOSAL_FIELDS },
  propose_set_day_start: { self: PROPOSAL_FIELDS },
  propose_set_dwell: { self: PROPOSAL_FIELDS },
} as const satisfies Readonly<Record<string, ToolShape>>;

export type ToolName = keyof typeof TOOL_RESPONSE_FIELDS;

/**
 * 🔴 **ค้นด้วย `Object.hasOwn` ไม่ index ตรง ๆ** — บทเรียนของ `lib/engine/countries.ts:70`
 * `TOOL_RESPONSE_FIELDS["constructor"]` คืนฟังก์ชัน `Object` ซึ่ง truthy → `??` ไม่ช่วย
 */
function shapeOf(tool: string): ToolShape | null {
  return Object.hasOwn(TOOL_RESPONSE_FIELDS, tool)
    ? (TOOL_RESPONSE_FIELDS as Readonly<Record<string, ToolShape>>)[tool]
    : null;
}

/**
 * ฟิลด์ใน `value` ที่ไม่ได้ประกาศไว้ — คืน path แบบ `stops[].rating`
 * **ว่าง = ผ่าน** · ไม่ว่าง = มีของหลุดเข้าบริบทโมเดล
 *
 * ## 🔴 ชื่อ tool ที่ไม่รู้จัก = **โยน** ไม่ใช่คืนค่าปลอดภัย
 * ต่างจาก `capabilitiesOf()` ใน `countries.ts` ที่คืน `UNKNOWN_COUNTRY` แทนการโยน — **โดยตั้งใจ**
 * · รหัสประเทศมาจาก **ข้อมูล** (แถวใน `catalog_cities`) → ค่าที่ไม่รู้จักเป็นสภาพปกติที่ต้องรับมือ
 * · ชื่อ tool มาจาก **โค้ดของเรา** → ค่าที่ไม่รู้จักคือบั๊ก **และการคืน `[]` จะอ่านว่า "ผ่าน"**
 * 🎯 **ด่านที่คืน "ผ่าน" ให้ของที่มันไม่รู้จัก คือด่านที่ปิดตัวเองเงียบ ๆ**
 */
export function unknownFields(tool: string, value: unknown): string[] {
  const shape = shapeOf(tool);
  if (!shape) throw new Error(`unknownFields: ไม่รู้จัก tool "${tool}" — ต้องประกาศใน TOOL_RESPONSE_FIELDS ก่อน`);
  if (value === null || typeof value !== "object") return [];

  const found: string[] = [];
  const allowed = new Set<string>(shape.self);

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      found.push(key);
      continue;
    }
    const nestedAllowed = shape.nested && Object.hasOwn(shape.nested, key) ? shape.nested[key] : null;
    if (!nestedAllowed) continue;

    const nestedSet = new Set<string>(nestedAllowed);
    const raw = (value as Record<string, unknown>)[key];
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (item === null || typeof item !== "object") continue;
      for (const k of Object.keys(item as Record<string, unknown>)) {
        if (!nestedSet.has(k)) found.push(`${key}[].${k}`);
      }
    }
  }
  return found;
}
