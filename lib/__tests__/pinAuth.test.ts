import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  PIN_COOKIE,
  PIN_COOKIE_MAX_AGE,
  expectedPinToken,
  pinIsCorrect,
  pinTokenMatches,
} from "@/lib/pinAuth";

/**
 * เทสต์ด่าน PIN (เฟส 13.5) — ไฟล์นี้เป็นเทสต์ชุดแรกของ `lib/pinAuth.ts`
 *
 * ทำไมถึงคุ้มที่จะมี: `pinAuth` เป็น**มาตรการความปลอดภัยจริงด่านเดียว**ในเว็บนี้
 * (ด่านอื่นคุมค่าใช้จ่าย — `lib/rateLimit.ts:8` เขียนกำกับเอง) แต่เดิมไม่มีเทสต์เลยสักตัว
 * ทั้ง 3 ฟังก์ชันเป็น pure function ที่อ่าน `process.env` เท่านั้น จึงเทสต์ได้ด้วย
 * `environment: "node"` ที่ `vitest.config.ts` ตั้งไว้แล้ว ไม่ต้องเพิ่ม dependency ใดๆ
 *
 * สิ่งที่ตั้งใจล็อกไว้ไม่ให้ใครเผลอแก้ทีหลัง (ไม่ใช่แค่ "โค้ดทำงาน"):
 *   1. cookie ต้องขึ้นกับ **secret ฝั่งเซิร์ฟเวอร์** ไม่ใช่แค่แฮชของ PIN — ถ้าใครเปลี่ยนเป็น
 *      `sha256(pin)` เฉยๆ เทสต์ตัวที่เทียบ 2 secret ต้องแดงทันที (PIN 4 หลักมี 10,000 ค่า
 *      ทำตารางแฮชล่วงหน้าได้ในไม่กี่วินาที — เหตุผลเดียวกับที่ `pinAuth.ts:20-22` เขียนไว้)
 *   2. ความยาวไม่เท่ากันต้องคืน false **ไม่ใช่โยน** (`timingSafeEqual` โยนถ้าความยาวต่าง)
 *   3. env ไม่ครบต้องคืน null/false ให้ผู้เรียกตัดสินใจเอง ไม่ใช่ตัดสินแทน
 */

const ENV_KEYS = ["TRIP_PIN", "TRIP_PIN_SECRET"] as const;
const saved = new Map<string, string | undefined>();

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    const next = values[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

/**
 * 🔴 ค่าสมมติล้วน **ห้ามใช้ค่าจริงของ production เป็น fixture เด็ดขาด**
 * repo นี้เป็น public → ค่าที่ commit ลงไปคือค่าที่เผยแพร่แล้ว และลบออกทีหลังไม่ได้
 * (ร่างแรกของไฟล์นี้ใช้ PIN จริงเพราะเป็นค่าที่อยู่ในบันทึกของโปรเจกต์ — เป็นความพลาด
 *  ที่ต้องหมุน PIN ทิ้ง ไม่ใช่แค่แก้ไฟล์ · ดู security-review.md §9)
 * ค่าที่ยาวไม่เท่ากันทุกตัวข้างล่าง **คำนวณจาก PIN** ไม่ฝังตัวเลขไว้ กันค่าที่ดูเหมือน PIN จริงหลุดกลับมา
 */
const PIN = "fixture-pin";
const SECRET = "fixture-secret";

/** คำนวณค่าที่ควรอยู่ใน cookie ขึ้นมาใหม่เอง ไม่เรียกโค้ดที่กำลังเทสต์ */
function hmac(secret: string, pin: string): string {
  return createHmac("sha256", secret).update(pin).digest("hex");
}

describe("ค่าคงที่ของ cookie", () => {
  it("ชื่อ cookie คงที่ — proxy.ts กับ /api/unlock ต้องอ้างตัวเดียวกัน", () => {
    expect(PIN_COOKIE).toBe("trip_pin");
  });

  it("อายุ cookie ยาวพอใช้จนจบทริป (90 วัน) — ไม่ต้องกรอกซ้ำตอนยืนอยู่กลางถนนที่โซล", () => {
    expect(PIN_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 90);
  });
});

describe("expectedPinToken()", () => {
  it("คืน null เมื่อไม่ได้ตั้ง env เลย — ผู้เรียกเป็นคนตัดสินว่าจะปล่อยผ่านหรือบล็อก", () => {
    setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: undefined });
    expect(expectedPinToken()).toBeNull();
  });

  it("คืน null เมื่อตั้งมาแค่ TRIP_PIN — ขาด secret ห้ามเดาว่าไม่ต้องใช้", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: undefined });
    expect(expectedPinToken()).toBeNull();
  });

  it("คืน null เมื่อตั้งมาแค่ TRIP_PIN_SECRET", () => {
    setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: SECRET });
    expect(expectedPinToken()).toBeNull();
  });

  it("คืน HMAC-SHA256 เป็น hex 64 ตัวเมื่อ env ครบ", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    const token = expectedPinToken();
    expect(token).toBe(hmac(SECRET, PIN));
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ค่าเดิมเสมอสำหรับ env ชุดเดิม — ไม่งั้น cookie ที่เคยออกให้จะใช้ต่อไม่ได้", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(expectedPinToken()).toBe(expectedPinToken());
  });

  it("🔴 secret เปลี่ยน → token เปลี่ยน ทั้งที่ PIN เดิม", () => {
    // นี่คือเทสต์ที่กัน "ใครเผลอเปลี่ยนไปใช้ sha256(pin) เฉยๆ" ซึ่งจะทำให้ PIN 4 หลัก
    // ถูกไล่ทำตารางแฮชล่วงหน้าได้ทั้ง 10,000 ค่า · ถ้า secret ไม่ถูกผสม ค่า 2 ตัวนี้จะเท่ากัน
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: "secret-a" });
    const a = expectedPinToken();
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: "secret-b" });
    const b = expectedPinToken();
    expect(a).not.toBe(b);
  });

  it("token ต้องไม่ใช่ตัว PIN เอง และไม่มี PIN ฝังอยู่ข้างใน", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    const token = expectedPinToken();
    expect(token).not.toBe(PIN);
    expect(token).not.toContain(PIN);
  });

  it("PIN ยาวเท่าไหร่ก็ได้ ไม่ได้บังคับความยาวใดๆ", () => {
    // สำคัญกับข้อเสนอใน docs/engine/security-review.md §5.1.1(ง): เพิ่มความยาว PIN
    // เป็นการเปลี่ยน env ล้วน ไม่ต้องแก้โค้ด — เทสต์นี้ยืนยันว่าเป็นจริง
    const longPin = "fixture-pin-that-is-much-longer";
    setEnv({ TRIP_PIN: longPin, TRIP_PIN_SECRET: SECRET });
    expect(expectedPinToken()).toBe(hmac(SECRET, longPin));
  });
});

describe("pinTokenMatches()", () => {
  it("false เมื่อยังไม่ได้ตั้ง env (ไม่มีอะไรให้เทียบ)", () => {
    setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: undefined });
    expect(pinTokenMatches("อะไรก็ตาม")).toBe(false);
  });

  it("false เมื่อไม่มี cookie ติดมา", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinTokenMatches(undefined)).toBe(false);
  });

  it("false เมื่อ cookie เป็นค่าว่าง", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinTokenMatches("")).toBe(false);
  });

  it("true เมื่อ cookie ตรงกับ HMAC ที่คำนวณเองแยกจากโค้ดที่เทสต์", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinTokenMatches(hmac(SECRET, PIN))).toBe(true);
  });

  it("false เมื่อ cookie เป็นธงปลอมที่ตั้งเองในเบราว์เซอร์", () => {
    // `pinAuth.ts:20` เขียนไว้ว่าห้ามเก็บ cookie เป็นแค่ `authed=1` — เทสต์นี้ยืนยันว่าไม่ได้ทำ
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinTokenMatches("1")).toBe(false);
    expect(pinTokenMatches("true")).toBe(false);
    expect(pinTokenMatches("authed=1")).toBe(false);
  });

  it("false เมื่อ cookie มาจาก secret อื่น (เช่นหมุน secret แล้ว)", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: "secret-ใหม่" });
    expect(pinTokenMatches(hmac("secret-เก่า", PIN))).toBe(false);
  });

  it("🔴 ความยาวไม่เท่ากันต้องคืน false ไม่ใช่โยน error", () => {
    // `timingSafeEqual` โยน RangeError ถ้าความยาวต่างกัน · `pinAuth.ts:41` กันไว้แล้ว
    // ถ้าใครเผลอถอดบรรทัดนั้นออก ด่าน PIN จะกลายเป็น 500 ทุก request ที่มี cookie ผิดขนาด
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(() => pinTokenMatches("สั้น")).not.toThrow();
    expect(pinTokenMatches("สั้น")).toBe(false);
    expect(() => pinTokenMatches("a".repeat(500))).not.toThrow();
    expect(pinTokenMatches("a".repeat(500))).toBe(false);
  });

  it("false เมื่อ cookie ยาวถูกต้องแต่ผิด 1 ตัวอักษร", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    const token = hmac(SECRET, PIN);
    const flipped = (token[0] === "a" ? "b" : "a") + token.slice(1);
    expect(flipped).toHaveLength(token.length);
    expect(pinTokenMatches(flipped)).toBe(false);
  });
});

describe("pinIsCorrect()", () => {
  it("false เมื่อไม่ได้ตั้ง TRIP_PIN — ห้ามปล่อยผ่านตอนไม่มีอะไรให้เทียบ", () => {
    setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: SECRET });
    expect(pinIsCorrect(PIN)).toBe(false);
    expect(pinIsCorrect("")).toBe(false);
  });

  it("true เมื่อ PIN ตรงเป๊ะ", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinIsCorrect(PIN)).toBe(true);
  });

  it("false เมื่อ PIN ผิดแต่ยาวเท่ากัน", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    // ผิดแต่ยาวเท่ากัน — คำนวณจาก PIN ไม่ฝังค่าไว้
    const sameLengthWrong = `x${PIN.slice(1)}`;
    expect(sameLengthWrong).toHaveLength(PIN.length);
    expect(pinIsCorrect(sameLengthWrong)).toBe(false);
  });

  it("🔴 PIN ยาวไม่เท่ากันต้องคืน false ไม่ใช่โยน", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    const wrongLengths = ["", PIN.slice(0, 1), PIN.slice(0, -1), `${PIN}x`, PIN.repeat(50)];
    for (const input of wrongLengths) {
      expect(() => pinIsCorrect(input)).not.toThrow();
      expect(pinIsCorrect(input)).toBe(false);
    }
  });

  it("ไม่ตัดช่องว่างให้ — PIN ที่มีช่องว่างนำ/ตามไม่ใช่ PIN เดียวกัน", () => {
    // จดพฤติกรรมไว้ตรงๆ: ถ้าวันหลังอยากให้ trim ต้องเป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
    expect(pinIsCorrect(` ${PIN}`)).toBe(false);
    expect(pinIsCorrect(`${PIN} `)).toBe(false);
  });

  it("รับ PIN ที่ไม่ใช่ตัวเลขได้ ถ้า env ตั้งไว้แบบนั้น", () => {
    setEnv({ TRIP_PIN: "korea-2026-oct", TRIP_PIN_SECRET: SECRET });
    expect(pinIsCorrect("korea-2026-oct")).toBe(true);
    expect(pinIsCorrect("korea-2026-nov")).toBe(false);
  });
});
