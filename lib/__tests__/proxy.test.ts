import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { config, proxy } from "../../proxy";

/**
 * เทสต์ด่าน PIN ระดับ request — ไฟล์นี้เป็นเทสต์ชุดแรกของ `proxy.ts`
 *
 * `proxy.ts` เป็นด่านหน้าของทั้งเว็บแต่เดิมไม่มีเทสต์เลย · เทสต์ได้ด้วย `environment: "node"`
 * ที่มีอยู่แล้ว เพราะ `NextRequest` สร้างขึ้นมาเองได้ตรงๆ ไม่ต้องมีเซิร์ฟเวอร์หรือเบราว์เซอร์
 *
 * 🔴 ขอบเขตที่เทสต์ไฟล์นี้ครอบและไม่ครอบ — ต้องอ่านก่อนเชื่อผลเขียว:
 *   ครอบ   = ตรรกะข้างใน `proxy()` (ปล่อยผ่าน / 307 / 401) และ **รูปแบบของ `config.matcher`**
 *   ไม่ครอบ = การที่ Next เอา `config.matcher` ไปตัดสินว่าจะเรียก `proxy()` หรือไม่
 *            ตรงนั้นเป็นของ runtime ของ Next ต้องพิสูจน์ด้วย e2e (Playwright) เท่านั้น
 *            → ดู `docs/engine/security-review.md §2.5` และเคส F3
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

const PIN = "2539";
const SECRET = "test-secret";
const VALID_TOKEN = createHmac("sha256", SECRET).update(PIN).digest("hex");

function withPin() {
  setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
}
function withoutPin() {
  setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: undefined });
}

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://plan.example.com${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** แปลผลลัพธ์เป็น 3 แบบที่ `proxy()` คืนได้ — แยกจากกันด้วย status/location */
function outcome(res: ReturnType<typeof proxy>): "pass" | "redirect" | "json401" {
  if (res.status === 401) return "json401";
  if (res.headers.get("location")) return "redirect";
  return "pass";
}

describe("ยังไม่ตั้ง env — fail-open โดยตั้งใจ (proxy.ts:38-45)", () => {
  it("ปล่อยผ่านทุกเส้นเมื่อไม่มี TRIP_PIN/TRIP_PIN_SECRET", () => {
    withoutPin();
    for (const path of ["/", "/today", "/summary", "/api/place-details"]) {
      expect(outcome(proxy(request(path)))).toBe("pass");
    }
  });

  it("ปล่อยผ่านแม้ตั้งมาแค่ TRIP_PIN (ขาด secret)", () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: undefined });
    expect(outcome(proxy(request("/today")))).toBe("pass");
  });

  it("ปล่อยผ่านแม้ cookie มั่วมา — ไม่มี env = ไม่มีการตรวจ", () => {
    withoutPin();
    expect(outcome(proxy(request("/today", "trip_pin=garbage")))).toBe("pass");
  });
});
// ⚠️ 3 เทสต์ข้างบน **ยืนยันพฤติกรรมที่ตั้งใจไว้ ไม่ใช่พฤติกรรมที่ถูกต้องปลายทาง**
// `proxy.ts:40-42` อธิบายเหตุผลไว้ว่ากันเว็บตายตอนอยู่เกาหลี ซึ่งสมเหตุสมผลกับบริบทนี้
// แผนเลิก fail-open อยู่ที่ `docs/engine/security-review.md §4` — ตอนแก้ เทสต์ 3 ตัวนี้
// **ต้องแดง** และนั่นคือสัญญาณว่าแก้ถูกที่ ไม่ใช่สัญญาณว่าทำอะไรพัง

describe("ตั้ง env แล้ว ไม่มี cookie", () => {
  it("หน้าเว็บ → 307 ไป /unlock พร้อมจำหน้าที่ตั้งใจเข้าไว้", () => {
    withPin();
    const res = proxy(request("/today"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/unlock");
    expect(location.searchParams.get("next")).toBe("/today");
  });

  it("จำ query string ของหน้าเดิมไว้ด้วย", () => {
    withPin();
    const res = proxy(request("/summary?lang=en&for=immigration"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/summary?lang=en&for=immigration");
  });

  it("🔴 /api/* ตอบ 401 JSON ไม่ redirect (proxy.ts:51-55)", async () => {
    // ถ้า redirect ฝั่ง client จะได้ HTML ที่ parse ไม่ออกแทนที่จะรู้ชัดว่าโดนล็อก
    withPin();
    const res = proxy(request("/api/place-details?query=x"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "locked" });
  });
});

describe("ตั้ง env แล้ว มี cookie", () => {
  it("cookie ถูก → ผ่าน", () => {
    withPin();
    expect(outcome(proxy(request("/today", `trip_pin=${VALID_TOKEN}`)))).toBe("pass");
  });

  it("cookie ผิดแต่ยาวเท่ากัน → ไม่ผ่าน", () => {
    withPin();
    const flipped = (VALID_TOKEN[0] === "a" ? "b" : "a") + VALID_TOKEN.slice(1);
    expect(outcome(proxy(request("/today", `trip_pin=${flipped}`)))).toBe("redirect");
  });

  it("cookie ยาวไม่เท่ากันต้องไม่ทำให้ throw (timingSafeEqual จะโยน)", () => {
    // ค่าต้องเป็น ASCII: header เป็น ByteString ตามสเปก จึงใส่อักษรไทยดิบไม่ได้เลย
    // (เบราว์เซอร์จริงก็ส่งไม่ได้ ต้อง percent-encode ก่อน) — เคสอักษรไทยไปทดสอบที่
    // ระดับฟังก์ชันใน pinAuth.test.ts แทน ซึ่งเป็นที่ที่ข้อจำกัดของ header ไม่เกี่ยว
    withPin();
    for (const value of ["short", "a".repeat(500)]) {
      expect(() => proxy(request("/today", `trip_pin=${value}`))).not.toThrow();
      expect(outcome(proxy(request("/today", `trip_pin=${value}`)))).toBe("redirect");
    }
  });

  it("cookie เป็นธงปลอม (authed=1) ไม่ผ่าน", () => {
    withPin();
    expect(outcome(proxy(request("/today", "trip_pin=1")))).toBe("redirect");
  });

  it("cookie ชื่ออื่นไม่นับ", () => {
    withPin();
    expect(outcome(proxy(request("/today", `other_cookie=${VALID_TOKEN}`)))).toBe("redirect");
  });
});

describe("PUBLIC_PATHS (proxy.ts:23-34)", () => {
  const publicPaths = ["/unlock", "/api/unlock", "/sw.js", "/manifest.webmanifest", "/api/keep-alive"];

  it.each(publicPaths)("%s ผ่านได้แม้ไม่มี cookie", (path) => {
    withPin();
    expect(outcome(proxy(request(path)))).toBe("pass");
  });

  it("path ที่มี prefix เป็น public path ก็ผ่าน (เงื่อนไข startsWith)", () => {
    withPin();
    expect(outcome(proxy(request("/unlock/extra")))).toBe("pass");
    expect(outcome(proxy(request("/api/keep-alive/sub")))).toBe("pass");
  });

  it("🔴 ชื่อที่คล้าย public path แต่ไม่ใช่ ต้องไม่ผ่าน", () => {
    // ยืนยันว่า `pathname === p || pathname.startsWith(`${p}/`)` เขียนถูก
    // ถ้าใครเผลอเปลี่ยนเป็น `pathname.startsWith(p)` เฉยๆ เส้นพวกนี้จะหลุดด่านทันที
    withPin();
    for (const path of ["/unlockme", "/unlock-all", "/sw.js.map", "/api/unlockme"]) {
      expect(outcome(proxy(request(path)))).not.toBe("pass");
    }
  });
});

/**
 * รูปแบบของ `config.matcher` — เทสต์ pattern ไม่ได้เทสต์ตัว Next
 *
 * สร้าง RegExp จาก `config.matcher[0]` เองแบบ anchored ซึ่งเป็น **การประมาณ**
 * วิธีที่ Next คอมไพล์ matcher ไม่ใช่ของจริง · จุดประสงค์คือ **ตรึงรูปแบบไว้**
 * ให้การแก้ pattern เป็นการตัดสินใจที่มีเทสต์แดงมาเตือน ไม่ใช่การแก้เงียบๆ
 */
describe("config.matcher", () => {
  const matched = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("เส้นทางของหน้าและ API เข้าด่าน", () => {
    for (const path of ["/", "/today", "/summary", "/api/place-details", "/api/travel-time"]) {
      expect(matched(path)).toBe(true);
    }
  });

  it("_next ถูกตัดออกทั้งก้อน — รวม /_next/hmr ที่เคยทำ HMR พัง (proxy.ts:65-69)", () => {
    for (const path of ["/_next/static/chunk.js", "/_next/image", "/_next/hmr"]) {
      expect(matched(path)).toBe(false);
    }
  });

  it("favicon.ico ถูกตัดออก", () => {
    expect(matched("/favicon.ico")).toBe(false);
  });

  it("ไฟล์รูป/ฟอนต์ใน public/ ถูกตัดออก", () => {
    for (const path of ["/icon-192.png", "/logo.svg", "/font.woff2"]) {
      expect(matched(path)).toBe(false);
    }
  });

  it("🔴 F3 — เส้นทางใดก็ตามที่ลงท้ายด้วยนามสกุลไฟล์ หลุดด่านทั้งเส้น", () => {
    // นี่คือ **การบันทึกช่องที่รู้อยู่** ไม่ใช่การรับรองว่าถูก — ดู security-review.md F3
    // วันนี้ยังไม่มีรูรั่วจริงเพราะทุก route ในแอปไม่มีนามสกุล แต่แพลตฟอร์มจะมี
    // dynamic route (`/trip/[tripId]/...`) และหน้า export ไฟล์ → เส้นแบบนี้เกิดขึ้นได้
    //
    // ⚠️ เทสต์นี้ตั้งใจให้ **แดงเมื่อมีคนแก้ matcher ให้แคบลง** ตอนนั้นให้ลบเทสต์นี้ทิ้ง
    // แล้วเขียนเทสต์ที่ยืนยันว่าเส้นพวกนี้ **เข้า** ด่านแทน — อย่า "แก้ให้ผ่าน" โดยไม่แก้ matcher
    for (const path of ["/api/secret.png", "/trip/abc/export.png", "/today/photo.jpg"]) {
      expect(matched(path)).toBe(false);
    }
  });

  it("matcher มีเส้นเดียว — ถ้าเพิ่มเส้นที่ 2 ต้องมาทบทวนเทสต์ชุดนี้", () => {
    expect(config.matcher).toHaveLength(1);
  });
});
