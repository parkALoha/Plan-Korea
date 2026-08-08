import { describe, expect, it } from "vitest";
import { routeDistanceKm, suggestOrder, type RoutePoint } from "@/lib/optimizeRoute";

describe("suggestOrder", () => {
  it("น้อยกว่า 3 จุด คืนลำดับเดิมเป๊ะๆ (ไม่คุ้มจัดใหม่)", () => {
    const points: RoutePoint[] = [
      { id: "a", lat: 35.0, lng: 129.0 },
      { id: "b", lat: 35.1, lng: 129.1 },
    ];
    expect(suggestOrder(points)).toBe(points);
  });

  it("จุดที่ pin ไว้อยู่ที่ตำแหน่งเดิมเสมอหลังจัดใหม่", () => {
    // จงใจเรียงจุดให้ไกลสลับกัน เพื่อบีบให้ suggestOrder อยากจัดใหม่จริงๆ
    const points: RoutePoint[] = [
      { id: "far", lat: 36.5, lng: 130.5 }, // จุด pin — อยู่ไกลโพ้นจากกลุ่มอื่น ถ้าไม่ pin จะถูกย้าย
      { id: "a", lat: 35.0, lng: 129.0 },
      { id: "b", lat: 35.05, lng: 129.05 },
      { id: "c", lat: 35.1, lng: 129.1 },
    ];
    const result = suggestOrder(points, { pinnedIndexes: new Set([0]) });
    expect(result[0]).toEqual(points[0]);
  });

  it("ไม่ดีขึ้นจริง (หรือดีขึ้นน้อยกว่า 100 ม.) คืนลำดับเดิม", () => {
    // 3 จุดเรียงเป็นเส้นตรงอยู่แล้ว — ไม่มีลำดับไหนสั้นกว่านี้
    const points: RoutePoint[] = [
      { id: "a", lat: 35.0, lng: 129.0 },
      { id: "b", lat: 35.05, lng: 129.0 },
      { id: "c", lat: 35.1, lng: 129.0 },
    ];
    expect(suggestOrder(points)).toEqual(points);
  });

  it("จัดลำดับใหม่ให้สั้นลงจริงเมื่อจุดเริ่มต้นสลับมั่ว", () => {
    // เริ่มจาก a (ซ้ายสุด) ข้ามไป c (ขวาสุด) แล้ววกกลับมา b (กลาง) — ระยะทางไกลกว่าเรียง a→b→c เยอะ
    const points: RoutePoint[] = [
      { id: "a", lat: 35.0, lng: 129.0 },
      { id: "c", lat: 35.0, lng: 129.2 },
      { id: "b", lat: 35.0, lng: 129.1 },
    ];
    const before = routeDistanceKm(points);
    const after = suggestOrder(points);
    expect(routeDistanceKm(after)).toBeLessThan(before);
  });
});

describe("routeDistanceKm", () => {
  it("ไม่มีจุดเลยคืน 0", () => {
    expect(routeDistanceKm([])).toBe(0);
  });

  it("รวมระยะช่วงที่พักหัว-ท้ายด้วยถ้ามี", () => {
    const points: RoutePoint[] = [{ id: "a", lat: 35.0, lng: 129.0 }];
    const start: RoutePoint = { id: "hotel", lat: 35.0, lng: 129.0 };
    const withStart = routeDistanceKm(points, start, null);
    const withoutStart = routeDistanceKm(points, null, null);
    expect(withStart).toBeGreaterThanOrEqual(withoutStart);
  });
});
