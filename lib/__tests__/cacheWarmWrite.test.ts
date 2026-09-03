import { describe, expect, it } from "vitest";
import { warmCache, type WarmRow, type WarmDeps } from "@/lib/engine/cacheWarmWrite";
import type { WarmTarget } from "@/lib/engine/cacheWarmList";

/**
 * **`Q3` ก้าวที่ 2 · ตัวเขียนแคช — เคสหลักคือ *ตรวจบัญชีขาวซ้ำก่อนเขียน*** · P1 · 3 ก.ย. 2026
 *
 * 🔴 ตัวเขียนถือ `service_role` = **`BYPASSRLS`** ⇒ ไม่มี policy ใดขวางมันได้
 * **การตรวจในโค้ดจึงเป็นด่าน ไม่ใช่มารยาท** (ต่างจาก `route` ที่ RLS บังคับอยู่แล้ว)
 * 🎯 และรายการเป้าที่ได้มาจากคลัง **ไม่ใช่หลักฐานว่าคีย์ยังสาธารณะ ณ วินาทีที่เขียน** —
 *    ยิง Google 141 ครั้งกินเวลาเป็นนาที คลังแก้ได้ในช่วงนั้น
 */
const t = (key: string): WarmTarget => ({ key, placeId: `p:${key}`, priority: "catalog" });
const row = (key: string): WarmRow => ({
  maps_query: key,
  google_place_id: null,
  opening_hours: null,
  rating: null,
  user_rating_count: null,
  primary_type: null,
  reviews: null,
});

function deps(over: Partial<WarmDeps> = {}) {
  const written: WarmRow[][] = [];
  const base: WarmDeps = {
    fetchOne: async (k) => row(k),
    verifyPublic: async (keys) => new Set(keys),
    writeRows: async (rows) => {
      written.push(rows);
      return rows.length;
    },
    ...over,
  };
  return { deps: base, written };
}

describe("warmCache — ตรวจบัญชีขาวซ้ำก่อนเขียนเสมอ", () => {
  it("ทางปกติ: ดึงได้ · ยังสาธารณะ · เขียนครบ", async () => {
    const { deps: d, written } = deps();
    const r = await warmCache([t("A"), t("B")], d);
    expect(r).toMatchObject({ attempted: 2, written: 2, droppedNotPublic: 0, fetchFailed: 0, aborted: null });
    expect(written[0].map((x) => x.maps_query)).toEqual(["A", "B"]);
  });

  /** 🔴 เคสหัวใจ — คีย์หลุดบัญชีขาวระหว่างรอบ ต้อง **ไม่ถูกเขียน** */
  it("🔴 คีย์ที่หลุดบัญชีขาวตอนตรวจซ้ำ ต้องไม่ถูกเขียน", async () => {
    const { deps: d, written } = deps({ verifyPublic: async () => new Set(["A"]) });
    const r = await warmCache([t("A"), t("B")], d);
    expect(r.droppedNotPublic, "B หลุดบัญชีขาวแต่ไม่ถูกนับ").toBe(1);
    expect(written[0].map((x) => x.maps_query), "เขียน B ลงไปทั้งที่หลุดบัญชีขาว").toEqual(["A"]);
  });

  /** 🔴 ถามคลังไม่ได้ = ไม่รู้ว่าอะไรสาธารณะ ⇒ **ห้ามเขียนอะไรเลย** */
  it("🔴 ตรวจบัญชีขาวไม่ได้ → ไม่เขียนอะไรเลย (fail-closed)", async () => {
    const { deps: d, written } = deps({ verifyPublic: async () => null });
    const r = await warmCache([t("A")], d);
    expect(r.aborted).toBe("verify-failed");
    expect(r.written).toBe(0);
    expect(written, "เขียนทั้งที่ตรวจบัญชีขาวไม่ได้").toEqual([]);
  });

  /** ⚠️ ตัวควบคุม — ถ้าไม่มีเคสนี้ ตัวที่ *ไม่เคยเขียนเลย* จะผ่านเคสข้างบนทั้งหมด */
  it("ตัวควบคุม: ทางปกติต้องเรียก writeRows จริง", async () => {
    const { deps: d, written } = deps();
    await warmCache([t("A")], d);
    expect(written.length, "ไม่เคยเรียก writeRows เลย — เคส fail-closed ข้างบนจึงไม่ได้พิสูจน์อะไร").toBe(1);
  });

  it("Google ล้มที่คีย์เดียว → ข้ามคีย์นั้น ไม่ล้มทั้งรอบ", async () => {
    const { deps: d, written } = deps({ fetchOne: async (k) => (k === "B" ? null : row(k)) });
    const r = await warmCache([t("A"), t("B"), t("C")], d);
    expect(r.fetchFailed).toBe(1);
    expect(r.written).toBe(2);
    expect(written[0].map((x) => x.maps_query)).toEqual(["A", "C"]);
  });

  it("Google ล้มทุกคีย์ → ไม่เรียก verify และไม่เขียน", async () => {
    let verifyCalls = 0;
    const { deps: d, written } = deps({
      fetchOne: async () => null,
      verifyPublic: async (k) => {
        verifyCalls += 1;
        return new Set(k);
      },
    });
    const r = await warmCache([t("A")], d);
    expect(r).toMatchObject({ fetchFailed: 1, written: 0, aborted: null });
    expect(verifyCalls, "ถามคลังทั้งที่ไม่มีอะไรจะเขียน").toBe(0);
    expect(written).toEqual([]);
  });

  it("เขียนไม่ได้ → รายงาน write-failed ไม่ใช่เงียบ", async () => {
    const { deps: d } = deps({ writeRows: async () => null });
    const r = await warmCache([t("A")], d);
    expect(r.aborted).toBe("write-failed");
    expect(r.written).toBe(0);
  });

  it("เป้าว่าง → ไม่เรียกอะไรเลย", async () => {
    let calls = 0;
    const { deps: d } = deps({ fetchOne: async (k) => { calls += 1; return row(k); } });
    const r = await warmCache([], d);
    expect(r).toMatchObject({ attempted: 0, written: 0, aborted: null });
    expect(calls).toBe(0);
  });
});
