import { describe, expect, it } from "vitest";
import { buildUuidToDayKey, mapStopRows } from "@/hooks/dayKeyMaps";
import { buildDayBridge } from "@/lib/engine/dayBridge";

/**
 * `hooks/dayKeyMaps.ts` — **จุดเรียกจริงที่ `useStops`/`useBookings` ใช้** · เจ้าของ: P4-QA/Sec · 28 ส.ค. 2026
 *
 * ## 🔴 ไฟล์นี้มีเพราะช่องว่างที่วัดได้ ไม่ใช่เพราะอยากได้ coverage
 * จุดแวะทริปเกาหลี 12 จุดหลุดจากวันทั้งหมด **ขณะที่ชุด 1026 เคสเขียวทั้งชุด** (P2 เจอของจริง)
 * · ชุดเดิมมีเคสระดับ DAL · route · RLS · สะพาน — **แต่ไม่มีเคสไหนถามว่า
 *   "แถวที่อ่านมา ไปโผล่ที่วันถูกไหม"** เพราะชั้นนั้นเป็น closure ใน hook
 * 🎯 `dayBridge.test.ts` ปัก *สัญญา* · **ไฟล์นี้ปัก *คนใช้สัญญา*** — ถ้าจุดเรียกเปลี่ยนไปท่าผิด
 *   เคสที่สัญญาจะยังเขียว ช่องจึงอยู่ตรงนี้ ไม่ใช่ตรงนั้น
 *
 * ⚠️ **วันที่ในเคสต้องทับ `11–21 ต.ค. 2026`** — คีย์ซ้อน (`"d0"` กับ `uuid` ชี้ที่เดียวกัน)
 * เกิดได้เฉพาะวันที่ตรงกับ `ITINERARY` · **เลือกวันที่ห่างทั้งคู่ = เคสเขียวโดยไม่ได้ยิงอะไร**
 * (P4 เคยเลือก `2027-01-01` ทั้งคู่โดยบังเอิญมาแล้วรอบหนึ่ง)
 */
const L = (id: string, date: string) => ({ id, date });

/** ทริปผสม: `u0` ตรงกับ `ITINERARY` (คีย์ซ้อน) · `p9` เป็นวันที่เกิดบนแพลตฟอร์ม */
const legacy = [L("d0", "2026-10-11"), L("d1", "2026-10-12")];
const dbDays = [L("u0", "2026-10-11"), L("p9", "2027-01-01")];
const bridge = buildDayBridge(legacy, dbDays);

describe("buildUuidToDayKey", () => {
  it("🔴 วัน matched → คีย์ของไฟล์เดิม · วันแพลตฟอร์ม → uuid ตัวเอง — **ในแมปเดียวกัน**", () => {
    // 🎯 เคสที่ชุดเดิมไม่มี และเป็นตัวที่ปล่อยบั๊กผ่าน: ฝั่งเดียวเขียวทั้งคู่ ต้องมีสองฝั่งพร้อมกัน
    const m = buildUuidToDayKey(dbDays, bridge);
    expect(m.get("u0"), "วันที่ตรงกับไฟล์เดิมต้องได้ `d0` — ได้ uuid = จุดแวะหลุดจากวัน").toBe("d0");
    expect(m.get("p9"), "วันแพลตฟอร์มต้องได้ uuid ตัวเอง — UI ใช้ uuid เป็น Day.id").toBe("p9");
  });

  it("🔴 ต้องไม่ถูกเขียนด้วยการกลับด้าน `dayKeyToDbId`", () => {
    // ถ้าใครเปลี่ยนไปกลับด้าน ผลจะเท่ากับ `naive` ทุกประการ — เคสนี้คือตัวที่จับความต่างนั้น
    const naive = new Map([...bridge.dayKeyToDbId].map(([k, v]) => [v, k]));
    expect(naive.get("u0"), "ยืนยันว่าท่าผิดยังผิดอยู่ (ไม่งั้นเคสนี้ไม่ได้ยิงอะไร)").toBe("u0");
    expect(buildUuidToDayKey(dbDays, bridge)).not.toEqual(naive);
  });

  it("ฐานไม่มีวันเลย → แมปว่าง (ไม่ใช่โยน)", () => {
    expect(buildUuidToDayKey([], buildDayBridge(legacy, [])).size).toBe(0);
  });
});

describe("mapStopRows", () => {
  const uuidToDay = buildUuidToDayKey(dbDays, bridge);

  it("🔴 เติม `day_id` ถูกทั้งสองชนิดของวัน — matched ได้ `d0` · แพลตฟอร์มได้ uuid", () => {
    const out = mapStopRows(
      [{ trip_day_id: "u0", id: "s1" }, { trip_day_id: "p9", id: "s2" }],
      uuidToDay,
      "plan-1",
    );
    expect(out.map((r) => r.day_id)).toEqual(["d0", "p9"]);
    expect(out.every((r) => r.plan_id === "plan-1")).toBe(true);
    expect(out[0].id, "ฟิลด์เดิมต้องไม่หาย").toBe("s1");
  });

  it("🔴 ทิ้งแถวที่ **วันไม่มีในฐาน** — แต่ **ไม่ทิ้ง** วันแพลตฟอร์ม", () => {
    // ⚠️ สองอันนี้เคยถูกยุบเป็นเรื่องเดียวกัน (*"ไม่มีในไฟล์เดิม → ข้าม"*) ซึ่งถูกตอน `Day.id`
    //    เป็น `"d0"` เสมอ **และผิดตั้งแต่ `Day.id` เป็น `uuid` ได้** — เคสนี้แยกสองอันออกจากกัน
    const out = mapStopRows(
      [{ trip_day_id: "u0" }, { trip_day_id: "ไม่มีในฐาน" }, { trip_day_id: "p9" }],
      uuidToDay,
      "plan-1",
    );
    expect(out.map((r) => r.day_id), "ทิ้งเฉพาะวันที่ไม่มีในฐาน").toEqual(["d0", "p9"]);
  });

  it("แมปว่าง → ทิ้งทุกแถว (และไม่โยน) — สภาพตอน `E7` ยังไม่ย้าย", () => {
    expect(mapStopRows([{ trip_day_id: "u0" }], new Map(), "plan-1")).toEqual([]);
  });
});
