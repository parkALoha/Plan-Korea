import { describe, expect, it } from "vitest";
import { upsertDaySettings, type Db } from "@/lib/engine/db";

/**
 * `upsertDaySettings` — **บั๊กจริงที่ probe ของ P4 จับได้ 27 ส.ค. 2026**
 * เจ้าของทริปแก้ตั้งค่าวันของตัวเองไม่ได้เลย · `42501 permission denied`
 *
 * ## เหตุ
 * `.upsert(rows, { onConflict })` → PostgREST สร้าง `on conflict … do update set <ทุกคอลัมน์ใน payload>`
 * → **`SET` รวม `trip_id`/`plan_id`/`trip_day_id`** · แต่ `e2_narrow_key_grants` **ถอน `update`
 * บนคอลัมน์คีย์ออกโดยตั้งใจ** (ไม่ให้ไคลเอนต์ย้ายแถวข้ามแผนด้วยการเขียนคีย์ทับ)
 * ⚠️ Postgres ตรวจสิทธิ์ของ `DO UPDATE SET` ตอน **วางแผน** → **ล้มแม้แถวยังไม่มีอยู่**
 *
 * ## 🔴 เทสต์นี้พิสูจน์ *ครึ่งที่ผมคุมได้* — **คอลัมน์ที่ถูกส่งออกไป**
 * อีกครึ่ง (ฐานยอมรับจริงไหม) พิสูจน์ได้ด้วย probe สดของ P4 เท่านั้น — **แจ้งให้เขาใส่กลับแล้ว**
 * 🎯 เขียนแยกไว้ เพราะ **"เทสต์เขียว" ที่นี่ไม่ได้แปลว่าผู้ใช้บันทึกได้**
 */
type Call = { op: string; table: string; payload?: unknown; eq: [string, string][] };

function fakeDb(insertErrors: (null | { code: string; message: string })[] = [], existing = new Set<string>()) {
  const calls: Call[] = [];
  let insertN = 0;
  const db = {
    from(table: string) {
      const eq: [string, string][] = [];
      const chain = {
        update(payload: unknown) { calls.push({ op: "update", table, payload, eq }); return chain; },
        insert(payload: unknown) { calls.push({ op: "insert", table, payload, eq }); return chain; },
        eq(col: string, val: string) { eq.push([col, val]); return chain; },
        select() {
          const last = calls[calls.length - 1];
          if (last.op === "insert") {
            const err = insertErrors[insertN++] ?? null;
            return Promise.resolve(err ? { data: null, error: err } : { data: [{ trip_day_id: "d" }], error: null });
          }
          const key = eq.map(([, v]) => v).join("/");
          return Promise.resolve({ data: existing.has(key) ? [{ trip_day_id: "d" }] : [], error: null });
        },
      };
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

const ROW = {
  trip_id: "T", plan_id: "P", trip_day_id: "D",
  start_time: "09:00", is_locked: true,
};

describe("upsertDaySettings — คอลัมน์คีย์ต้องไม่เคยอยู่ใน `update`", () => {
  it("🔴 `update` ส่งเฉพาะคอลัมน์ที่เขียนได้ — ไม่มี `trip_id`/`plan_id`/`trip_day_id`", async () => {
    const { db, calls } = fakeDb([], new Set(["P/D"]));
    await upsertDaySettings(db, [{ ...ROW }]);
    const upd = calls.find((c) => c.op === "update");
    expect(upd).toBeTruthy();
    expect(upd!.payload).toEqual({ start_time: "09:00", is_locked: true });
    // 🎯 เคสนี้คือทั้งหมดที่บั๊กนี้เกี่ยวข้อง — ถ้าคีย์กลับเข้ามาใน SET วันไหน มันจะแดง
    for (const k of ["trip_id", "plan_id", "trip_day_id"]) {
      expect(Object.keys(upd!.payload as object), k).not.toContain(k);
    }
    // และต้องเจาะจงแถวด้วยคีย์ ไม่ใช่แก้ทั้งตาราง
    expect(upd!.eq).toEqual([["plan_id", "P"], ["trip_day_id", "D"]]);
  });

  it("แถวที่ยังไม่มี → `insert` ส่งคีย์ครบ (สิทธิ์ `insert` ครอบอยู่แล้ว)", async () => {
    const { db, calls } = fakeDb();
    await upsertDaySettings(db, [{ ...ROW }]);
    const ins = calls.find((c) => c.op === "insert");
    expect(ins!.payload).toEqual(ROW);
  });

  it("🔴 ชน `23505` (อีกเครื่องสร้างแทรก) → **แก้ทับ ไม่ใช่ล้ม**", async () => {
    // ผลที่ผู้ใช้ต้องการคือ "ค่าล่าสุดถูกบันทึก" ไม่ใช่ "ใครถึงก่อนได้ก่อน"
    const { db, calls } = fakeDb([{ code: "23505", message: "duplicate key" }]);
    const r = await upsertDaySettings(db, [{ ...ROW }]);
    expect(r.error).toBeNull();
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2); // ลองแก้ → insert ชน → แก้อีกรอบ
  });

  it("error อื่นของ `insert` ต้องคืนออกไป ไม่ใช่กลืน", async () => {
    const { db } = fakeDb([{ code: "42501", message: "permission denied" }]);
    const r = await upsertDaySettings(db, [{ ...ROW }]);
    expect(r.error).toEqual({ code: "42501", message: "permission denied" });
    expect(r.data).toBeNull();
  });

  it("หลายแถวในคำขอเดียว — ทำครบทุกแถว", async () => {
    const { db, calls } = fakeDb([], new Set(["P/D1"]));
    const r = await upsertDaySettings(db, [
      { ...ROW, trip_day_id: "D1" },
      { ...ROW, trip_day_id: "D2" },
    ]);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ trip_day_id: "D1" }, { trip_day_id: "D2" }]);
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1); // D1 มีอยู่แล้ว · D2 ต้องสร้าง
  });

  it("ไม่มีคอลัมน์ให้แก้เลย (ส่งมาแต่คีย์) → ข้าม `update` ไป `insert` ตรง ๆ", async () => {
    const { db, calls } = fakeDb();
    await upsertDaySettings(db, [{ trip_id: "T", plan_id: "P", trip_day_id: "D" }]);
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1);
  });
});
