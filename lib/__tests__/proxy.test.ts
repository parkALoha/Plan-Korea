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

const ENV_KEYS = [
  "TRIP_PIN",
  "TRIP_PIN_SECRET",
  // 🔴 เพิ่มเมื่อ 24 ส.ค. 2026 (P4) — ต้องอยู่ในลิสต์นี้ **ถึงจะถูกล้างระหว่างเคส**
  //    ไม่งั้นเคสที่ตั้ง Supabase env จะทิ้งค่าค้างไว้ให้เคสถัดไปโดยไม่มีใครเห็น
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;
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

// 🔴 ค่าสมมติล้วน — repo เป็น public · ห้ามใช้ค่าจริงของ production เป็น fixture
// (ร่างแรกใช้ PIN จริง = ความพลาดที่ต้องหมุน PIN ทิ้ง ไม่ใช่แค่แก้ไฟล์ · security-review.md §9)
const PIN = "fixture-pin";
const SECRET = "test-secret";
const VALID_TOKEN = createHmac("sha256", SECRET).update(PIN).digest("hex");

function withPin() {
  setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: SECRET });
}
function withoutPin() {
  setEnv({ TRIP_PIN: undefined, TRIP_PIN_SECRET: undefined });
}

// โดเมน `.invalid` สงวนไว้ตาม RFC 2606 → **ไม่มีวัน resolve** ได้จริง
// เลือกแบบนี้เพื่อให้ `getUser()` ล้มที่ DNS ทันที ไม่ยิงออกเน็ตจริงและไม่แกว่งตามเครือข่าย
const FAKE_SUPABASE_URL = "https://fake-project.supabase.invalid";
const FAKE_SUPABASE_KEY = "sb_publishable_FakeKeyForProxyTests";

/** ตั้ง env ครบทั้ง 2 ชุด = สภาพที่เว็บจะเจอจริงหลังผู้ใช้ตั้งค่าเสร็จ */
function withPinAndSupabase() {
  setEnv({
    TRIP_PIN: PIN,
    TRIP_PIN_SECRET: SECRET,
    NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_KEY,
  });
}

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://plan.example.com${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

/**
 * แปลผลลัพธ์เป็น 3 แบบที่ `proxy()` คืนได้ — แยกจากกันด้วย status/location
 *
 * ⚠️ **เป็น async ตั้งแต่ E1** เพราะ `proxy()` ต้อง `await refreshSession()` เพื่อต่ออายุ session
 * ก่อนด่านใด ๆ · ทุกจุดที่เรียกต้อง `await` ไม่งั้นจะได้ `Promise` มาเทียบกับสตริง **แล้วเงียบ**
 */
async function outcome(res: ReturnType<typeof proxy>): Promise<"pass" | "redirect" | "json401"> {
  const r = await res;
  if (r.status === 401) return "json401";
  if (r.headers.get("location")) return "redirect";
  return "pass";
}

describe("ยังไม่ตั้ง env — fail-open โดยตั้งใจ (proxy.ts:38-45)", () => {
  it("ปล่อยผ่านทุกเส้นเมื่อไม่มี TRIP_PIN/TRIP_PIN_SECRET", async () => {
    withoutPin();
    for (const path of ["/", "/today", "/summary", "/api/place-details"]) {
      expect(await outcome(proxy(request(path)))).toBe("pass");
    }
  });

  it("ปล่อยผ่านแม้ตั้งมาแค่ TRIP_PIN (ขาด secret)", async () => {
    setEnv({ TRIP_PIN: PIN, TRIP_PIN_SECRET: undefined });
    expect(await outcome(proxy(request("/today")))).toBe("pass");
  });

  it("ปล่อยผ่านแม้ cookie มั่วมา — ไม่มี env = ไม่มีการตรวจ", async () => {
    withoutPin();
    expect(await outcome(proxy(request("/today", "trip_pin=garbage")))).toBe("pass");
  });
});
// ⚠️ 3 เทสต์ข้างบน **ยืนยันพฤติกรรมที่ตั้งใจไว้ ไม่ใช่พฤติกรรมที่ถูกต้องปลายทาง**
// `proxy.ts:40-42` อธิบายเหตุผลไว้ว่ากันเว็บตายตอนอยู่เกาหลี ซึ่งสมเหตุสมผลกับบริบทนี้
// แผนเลิก fail-open อยู่ที่ `docs/engine/security-review.md §4` — ตอนแก้ เทสต์ 3 ตัวนี้
// **ต้องแดง** และนั่นคือสัญญาณว่าแก้ถูกที่ ไม่ใช่สัญญาณว่าทำอะไรพัง

describe("ตั้ง env แล้ว ไม่มี cookie", () => {
  it("หน้าเว็บ → 307 ไป /unlock พร้อมจำหน้าที่ตั้งใจเข้าไว้", async () => {
    withPin();
    const res = await proxy(request("/today"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/unlock");
    expect(location.searchParams.get("next")).toBe("/today");
  });

  it("จำ query string ของหน้าเดิมไว้ด้วย", async () => {
    withPin();
    const res = await proxy(request("/summary?lang=en&for=immigration"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/summary?lang=en&for=immigration");
  });

  it("🔴 /api/* ตอบ 401 JSON ไม่ redirect (proxy.ts:51-55)", async () => {
    // ถ้า redirect ฝั่ง client จะได้ HTML ที่ parse ไม่ออกแทนที่จะรู้ชัดว่าโดนล็อก
    withPin();
    const res = await proxy(request("/api/place-details?query=x"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "locked" });
  });
});

describe("ตั้ง env แล้ว มี cookie", () => {
  it("cookie ถูก → ผ่าน", async () => {
    withPin();
    expect(await outcome(proxy(request("/today", `trip_pin=${VALID_TOKEN}`)))).toBe("pass");
  });

  it("cookie ผิดแต่ยาวเท่ากัน → ไม่ผ่าน", async () => {
    withPin();
    const flipped = (VALID_TOKEN[0] === "a" ? "b" : "a") + VALID_TOKEN.slice(1);
    expect(await outcome(proxy(request("/today", `trip_pin=${flipped}`)))).toBe("redirect");
  });

  it("cookie ยาวไม่เท่ากันต้องไม่ทำให้ throw (timingSafeEqual จะโยน)", async () => {
    // ค่าต้องเป็น ASCII: header เป็น ByteString ตามสเปก จึงใส่อักษรไทยดิบไม่ได้เลย
    // (เบราว์เซอร์จริงก็ส่งไม่ได้ ต้อง percent-encode ก่อน) — เคสอักษรไทยไปทดสอบที่
    // ระดับฟังก์ชันใน pinAuth.test.ts แทน ซึ่งเป็นที่ที่ข้อจำกัดของ header ไม่เกี่ยว
    withPin();
    for (const value of ["short", "a".repeat(500)]) {
      // proxy เป็น async แล้ว — การโยนจะกลายเป็น rejected promise ไม่ใช่ throw ตรง ๆ
      await expect(proxy(request("/today", `trip_pin=${value}`))).resolves.toBeDefined();
      expect(await outcome(proxy(request("/today", `trip_pin=${value}`)))).toBe("redirect");
    }
  });

  it("cookie เป็นธงปลอม (authed=1) ไม่ผ่าน", async () => {
    withPin();
    expect(await outcome(proxy(request("/today", "trip_pin=1")))).toBe("redirect");
  });

  it("cookie ชื่ออื่นไม่นับ", async () => {
    withPin();
    expect(await outcome(proxy(request("/today", `other_cookie=${VALID_TOKEN}`)))).toBe("redirect");
  });
});

describe("PUBLIC_PATHS (proxy.ts:23-34)", () => {
  // ⚠️ สำเนาของ `PUBLIC_PATHS` ใน `proxy.ts` — **สองรายการนี้ไม่มีอะไรบังคับให้ตรงกัน**
  // ตั้งใจให้เป็นสำเนา เพราะการเพิ่มเส้นทางสาธารณะควรต้องแก้ 2 ที่ = มีคนเห็นตอนรีวิว
  // 🔴 แต่ผลข้างเคียงคือ **เส้นที่ลืมใส่ที่นี่จะไม่มีเทสต์ และไม่มีอะไรฟ้อง**
  const publicPaths = [
    "/unlock",
    "/api/unlock",
    "/sw.js",
    "/manifest.webmanifest",
    "/api/keep-alive",
    "/login",
    "/auth/callback",
  ];

  it.each(publicPaths)("%s ผ่านได้แม้ไม่มี cookie", async (path) => {
    withPin();
    expect(await outcome(proxy(request(path)))).toBe("pass");
  });

  it("path ที่มี prefix เป็น public path ก็ผ่าน (เงื่อนไข startsWith)", async () => {
    withPin();
    expect(await outcome(proxy(request("/unlock/extra")))).toBe("pass");
    expect(await outcome(proxy(request("/api/keep-alive/sub")))).toBe("pass");
  });

  it("🔴 ชื่อที่คล้าย public path แต่ไม่ใช่ ต้องไม่ผ่าน", async () => {
    // ยืนยันว่า `pathname === p || pathname.startsWith(`${p}/`)` เขียนถูก
    // ถ้าใครเผลอเปลี่ยนเป็น `pathname.startsWith(p)` เฉยๆ เส้นพวกนี้จะหลุดด่านทันที
    withPin();
    for (const path of ["/unlockme", "/unlock-all", "/sw.js.map", "/api/unlockme"]) {
      expect(await outcome(proxy(request(path)))).not.toBe("pass");
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

  it("เส้นทางของหน้าและ API เข้าด่าน", async () => {
    for (const path of ["/", "/today", "/summary", "/api/place-details", "/api/travel-time"]) {
      expect(matched(path)).toBe(true);
    }
  });

  it("_next ถูกตัดออกทั้งก้อน — รวม /_next/hmr ที่เคยทำ HMR พัง (proxy.ts:65-69)", async () => {
    for (const path of ["/_next/static/chunk.js", "/_next/image", "/_next/hmr"]) {
      expect(matched(path)).toBe(false);
    }
  });

  it("favicon.ico ถูกตัดออก", async () => {
    expect(matched("/favicon.ico")).toBe(false);
  });

  it("ไฟล์รูป/ฟอนต์ใน public/ ถูกตัดออก", async () => {
    for (const path of ["/icon-192.png", "/logo.svg", "/font.woff2"]) {
      expect(matched(path)).toBe(false);
    }
  });

  it("🔴 F3 — เส้นทางใดก็ตามที่ลงท้ายด้วยนามสกุลไฟล์ หลุดด่านทั้งเส้น", async () => {
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

  it("matcher มีเส้นเดียว — ถ้าเพิ่มเส้นที่ 2 ต้องมาทบทวนเทสต์ชุดนี้", async () => {
    expect(config.matcher).toHaveLength(1);
  });
});

/**
 * ด่าน PIN ทำงานเมื่อ **Supabase env ถูกตั้งด้วย** — เจ้าของ: P4-QA/Sec (24 ส.ค. 2026)
 *
 * 🔴 **ช่องที่ชุดนี้ปิด และเหตุผลที่มันเปิดอยู่ได้นานขนาดนี้:**
 * ทุกเคสข้างบนรันโดย `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` **ว่าง**
 * → `refreshSession()` ออกที่ `if (!url || !key)` **ทุกครั้ง ไม่เคยไปถึง `createServerClient()` เลย**
 * → เคสทั้ง 26 ข้างบน **ไม่เคยรัน `proxy()` ในสภาพที่เว็บจะเจอจริงสักครั้งเดียว**
 *
 * นี่คือรูปเดียวกับ `S1` เป๊ะ: `authRuntime.test.ts` ทดสอบ `refreshSession` เดี่ยว ๆ ·
 * ไฟล์นี้ทดสอบด่าน PIN เดี่ยว ๆ · **ไม่มีใครทดสอบสองอย่างต่อกัน** ซึ่งเป็นสิ่งเดียวที่รันจริงบนเว็บ
 *
 * > เทสต์ 2 ชุดที่เขียวทั้งคู่ ไม่ได้แปลว่าทางที่วิ่งผ่านทั้งสองชุดจะเขียว
 *
 * ⚠️ `getUser()` ที่นี่จะล้มที่ DNS เสมอ (โดเมน `.invalid`) → `user` เป็น `null` ตลอด
 *    ชุดนี้จึงพิสูจน์ **ว่าด่านยังทำงานเมื่อชั้น session ถูกต่อเข้ามา** ไม่ได้พิสูจน์ตรรกะ session
 *    · การพิสูจน์ session จริงต้องใช้ `engine-dev` และยังติด credentials ของผู้ใช้
 */
describe("PIN + Supabase env ตั้งพร้อมกัน — สภาพจริงหลังผู้ใช้ตั้งค่าเสร็จ", () => {
  it("🔴 public path ยังผ่านได้ เมื่อ refreshSession ทำงานเต็มเส้นทาง", async () => {
    // ถ้า `createServerClient` โยน (เช่น S1 กลับมา) เคสนี้แดงก่อนใครเพื่อน
    // และแดงที่ `/login` ซึ่งเป็นเส้นที่ผู้ใช้ต้องใช้เพื่อกลับเข้าเว็บ
    withPinAndSupabase();
    for (const path of ["/login", "/auth/callback", "/unlock"]) {
      expect(await outcome(proxy(request(path))), `${path} ต้องผ่าน`).toBe("pass");
    }
  });

  it("🔴 หน้าเว็บที่ไม่ใช่ public path ยังถูกบล็อก — ด่านไม่ได้หลุดเพราะ session เข้ามา", async () => {
    // เคสด้านลบคู่กับข้างบน (P1 ขอ) — ถ้าไม่มี เคสบวกจะเขียวได้ทั้งที่ด่านพังทั้งด่าน
    withPinAndSupabase();
    const res = await proxy(request("/today"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/unlock");
  });

  it("/api/* ยังตอบ 401 JSON", async () => {
    withPinAndSupabase();
    const res = await proxy(request("/api/place-details?query=x"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "locked" });
  });

  it("cookie ที่ถูกต้องยังผ่านได้", async () => {
    withPinAndSupabase();
    expect(await outcome(proxy(request("/today", `trip_pin=${VALID_TOKEN}`)))).toBe("pass");
  });

  it("🔴 ไม่มี TRIP_PIN แต่มี Supabase env → ยัง fail-open เหมือนเดิม", async () => {
    // สภาพของ Vercel วันที่ตั้ง Supabase เสร็จแต่ยังไม่ได้ตั้ง PIN
    // ต้องไม่กลายเป็น "บล็อกทั้งเว็บ" เพราะ fail-open เป็นการตัดสินใจที่ตั้งใจ (proxy.ts:52-56)
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_KEY,
    });
    expect(await outcome(proxy(request("/today")))).toBe("pass");
  });
});
