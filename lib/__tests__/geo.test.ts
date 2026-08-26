import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo";

/**
 * `lib/geo.ts` — **ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * 🔴 **ฟังก์ชันนี้ป้อน *ทุกนาที* ที่ผู้ใช้เห็นเป็น "(ประมาณการ)"**
 * ในเกาหลี Google ไม่คืนเส้นทาง `drive`/`walk` เลย (`E4-AC3`) → **ค่าที่ผู้ใช้เห็น
 * สำหรับสองโหมดนั้นมาจากบรรทัดพวกนี้ล้วน ๆ** ไม่มีอะไรมาทาบทานเลยสักตัว
 * 🎯 **ผิดที่นี่จะไม่มีอะไรฟ้อง — มันจะแค่ *ดูสมเหตุสมผล* แล้วผิด**
 */
describe("haversineKm", () => {
  const SEOUL = { lat: 37.5665, lng: 126.978 };
  const BUSAN = { lat: 35.1796, lng: 129.0756 };

  it("จุดเดียวกัน = 0", () => {
    expect(haversineKm(SEOUL.lat, SEOUL.lng, SEOUL.lat, SEOUL.lng)).toBe(0);
  });

  it("โซล→ปูซาน ≈ 325 กม. (ระยะที่ตรวจสอบได้จากภายนอก)", () => {
    const d = haversineKm(SEOUL.lat, SEOUL.lng, BUSAN.lat, BUSAN.lng);
    expect(d).toBeGreaterThan(320);
    expect(d).toBeLessThan(330);
  });

  it("สลับต้นทาง/ปลายทางได้ค่าเท่ากัน", () => {
    expect(haversineKm(SEOUL.lat, SEOUL.lng, BUSAN.lat, BUSAN.lng)).toBeCloseTo(
      haversineKm(BUSAN.lat, BUSAN.lng, SEOUL.lat, SEOUL.lng), 9
    );
  });

  it("1 องศาละติจูด ≈ 111.19 กม. ทุกที่บนโลก", () => {
    // ⚠️ ค่านี้เป็นค่าคงที่ทางเรขาคณิต ไม่ขึ้นกับลองจิจูดหรือซีกโลก
    //    ถ้าเคสนี้แดง แปลว่าสูตรผิดที่ *แกน* ไม่ใช่ที่ตัวเลขปัดเศษ
    for (const lng of [0, 90, -120, 179]) {
      expect(haversineKm(0, lng, 1, lng)).toBeCloseTo(111.19, 1);
      expect(haversineKm(45, lng, 46, lng)).toBeCloseTo(111.19, 1);
    }
  });

  it("1 องศาลองจิจูดหดลงตามละติจูด (ไม่ใช่ค่าคงที่)", () => {
    const atEquator = haversineKm(0, 0, 0, 1);
    const at60 = haversineKm(60, 0, 60, 1);
    expect(atEquator).toBeCloseTo(111.19, 1);
    // cos(60°) = 0.5 → ครึ่งเดียว · ถ้าเท่ากันแปลว่าลืมคูณ cos(lat)
    expect(at60).toBeCloseTo(atEquator / 2, 0);
  });

  it("🔴 ข้ามเส้นแบ่งวัน (±180°) ต้องได้ระยะสั้น ไม่ใช่รอบโลก", () => {
    // (0,179) → (0,-179) ห่างกันแค่ 2 องศา ≈ 222 กม.
    // 🎯 สูตรที่ลบลองจิจูดตรง ๆ โดยไม่ผ่าน `sin(Δ/2)` จะได้ ~39,700 กม.
    //    วันนี้ทริปไม่แตะเส้นนี้ **แต่แพลตฟอร์มรับทุกประเทศ** — ฟิจิ นิวซีแลนด์ อยู่คร่อมมันพอดี
    expect(haversineKm(0, 179, 0, -179)).toBeCloseTo(222.39, 0);
  });

  it("ซีกโลกใต้และพิกัดติดลบ", () => {
    // ซิดนีย์ → โอ๊คแลนด์ ≈ 2,155 กม.
    const d = haversineKm(-33.8688, 151.2093, -36.8485, 174.7633);
    expect(d).toBeGreaterThan(2100);
    expect(d).toBeLessThan(2200);
  });

  it("ขั้วโลกเหนือ→ใต้ = ครึ่งเส้นรอบโลก ≈ 20,015 กม.", () => {
    expect(haversineKm(90, 0, -90, 0)).toBeCloseTo(20015.09, 0);
  });

  it("ระยะสั้นมาก (จุดแวะติดกันในย่านเดียว) ไม่กลายเป็น 0", () => {
    // จุดแวะจริงในทริปห่างกันหลักร้อยเมตร — ถ้าปัดเป็น 0 เวลาเดินทางจะหายไปทั้งช่วง
    const d = haversineKm(35.0966, 129.0306, 35.0975, 129.0318);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.2);
  });
});
