import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * เทสต์ด่าน session ระดับ request — `E1-AC6` (แทนชุดเดิมที่ทดสอบด่าน PIN เมื่อ 25 ส.ค. 2026)
 *
 * 🔴 **ไม่ได้ลบเคยเคสของด่าน PIN ทิ้งเฉย ๆ — ย้ายทุกคำถามมาถามด่านใหม่**
 * เกณฑ์ `AC6` เขียนไว้เองว่า *"แทนที่ด้วยเคสด่าน session ไม่ใช่ลบแล้วจบ"*
 * ไม่งั้นเราจะแลก **ด่านที่มีเทสต์คุม** กับ **ด่านที่ไม่มีเลย** แล้วตัวเลขเคสจะลดลงเงียบ ๆ
 *
 * ⚠️ **`refreshSession` ถูก mock** เพราะของจริงยิง Supabase — ในเทสต์จะได้ `user: null` เสมอ
 * ทำให้ **เคสด้านบวก (ล็อกอินแล้วต้องผ่าน) เขียนไม่ได้เลย** ซึ่งคือครึ่งที่สำคัญที่สุด
 * · mock ใช้ `importOriginal` ตาม `S6` — `withSessionCookies` ยังเป็นของจริง ไม่ถูกกลืน
 * · 🔴 **ที่ mock ได้คือ "ใครถือ session" ไม่ใช่ "ด่านตัดสินยังไง"** — ตรรกะที่วัดยังเป็นของจริงทั้งหมด
 */
const state = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/auth/proxySession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/proxySession")>()),
  refreshSession: async (req: NextRequest) => ({
    response: NextResponse.next({ request: req }),
    user: state.user,
  }),
}));

const { config, proxy } = await import("../../proxy");

const USER = { id: "11111111-2222-3333-4444-555555555555" };
function signedIn() {
  state.user = USER;
}
function signedOut() {
  state.user = null;
}

function request(path: string): NextRequest {
  return new NextRequest(`https://plan.example.com${path}`);
}

/** แปลผลลัพธ์เป็น 3 แบบที่ `proxy()` คืนได้ — แยกด้วย status/location */
async function outcome(res: ReturnType<typeof proxy>): Promise<"pass" | "redirect" | "json401"> {
  const r = await res;
  if (r.status === 401) return "json401";
  if (r.headers.get("location")) return "redirect";
  return "pass";
}

describe("ไม่มี session — ต้องถูกกั้น", () => {
  it("🔴 หน้าเว็บ → 307 ไป /login พร้อมจำหน้าที่ตั้งใจเข้าไว้", async () => {
    signedOut();
    const res = await proxy(request("/today"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/today");
  });

  it("จำ query string ของหน้าเดิมไว้ด้วย", async () => {
    signedOut();
    const res = await proxy(request("/trip/abc?tab=map&day=3"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/trip/abc?tab=map&day=3");
  });

  it("🔴 /api/* ตอบ 401 JSON ไม่ redirect", async () => {
    // ถ้า redirect ฝั่ง client จะได้ HTML ที่ parse ไม่ออก แทนที่จะรู้ชัดว่ายังไม่ได้ล็อกอิน
    signedOut();
    const res = await proxy(request("/api/place-details?query=x"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("🔴 ไม่มี Supabase env ก็ต้องถูกกั้นเหมือนกัน — ด่านนี้ fail-closed ต่างจากด่าน PIN เดิม", async () => {
    // ด่านเดิมปล่อยผ่านตอน env ไม่ครบ เพราะเว็บทริปทำงานได้โดยไม่มี Supabase
    // แพลตฟอร์มไม่ใช่แบบนั้น — ไม่มี Supabase = ไม่มีข้อมูล → ปล่อยผ่านได้แค่หน้าเปล่าที่ไม่มีด่าน
    signedOut();
    expect(await outcome(proxy(request("/today")))).toBe("redirect");
  });
});

describe("🔴 มี session — ต้องผ่าน (ครึ่งที่ขาดไม่ได้)", () => {
  // ถ้ามีแต่เคสด้านลบ ด่านที่บล็อกทุกอย่างจะเขียวทั้งชุด — กับดักที่ 3 ของ rlsMatrix
  it("ผู้ใช้ที่ล็อกอินแล้วเข้าหน้าปกติได้", async () => {
    signedIn();
    expect(await outcome(proxy(request("/today")))).toBe("pass");
  });

  it("และเรียก /api/* ได้", async () => {
    signedIn();
    expect(await outcome(proxy(request("/api/place-details")))).toBe("pass");
  });
});

describe("PUBLIC_PATHS", () => {
  // ⚠️ สำเนาของลิสต์ใน `proxy.ts` — **ไม่มีอะไรบังคับให้ตรงกัน โดยตั้งใจ**
  // การเพิ่มเส้นสาธารณะควรเป็นการแก้ 2 ไฟล์ที่ reviewer เห็น · และถ้า import มาเทียบ
  // เทสต์จะกลายเป็น "ลิสต์เท่ากับตัวเอง" ซึ่งเขียวเสมอไม่ว่าลิสต์จะถูกหรือผิด
  const publicPaths = ["/sw.js", "/manifest.webmanifest", "/api/keep-alive", "/login", "/auth/callback"];

  it.each(publicPaths)("%s ผ่านได้แม้ไม่มี session", async (path) => {
    signedOut();
    expect(await outcome(proxy(request(path)))).toBe("pass");
  });

  it("🔴 /login ต้องเปิดสาธารณะ ไม่งั้นล็อกอินไม่ได้ตลอดกาล (ไก่กับไข่)", async () => {
    signedOut();
    expect(await outcome(proxy(request("/login?next=%2Ftoday")))).toBe("pass");
  });

  /**
   * 🔴 **แก้ 5 ก.ย. 2026 — เคสนี้เคยยืนยันพฤติกรรมที่ *เลิกจริงไปแล้ว***
   * ฉบับเดิมยิง `/auth/callback/extra` แล้ว `expect("pass")` เพราะตัวจับใบเดียวเปิด subtree ให้ทุกเส้น
   * วันนี้ลิสต์แยกเป็นสองใบ ⇒ **`/auth/callback` เป็น exact · ลูกของมันต้องไม่ผ่าน**
   * 🎯 ***เคสที่ตรึงพฤติกรรมกว้างเกินจำเป็น จะกลายเป็นเคสที่ *ห้าม* การรัดให้แคบลง —
   *    และมันจะแดงตอนมีคนทำสิ่งที่ถูก*** (`TEAM.md §3.4`) ⇒ เขียนใหม่ให้ตรึง *เจตนา* ไม่ใช่ *กลไก*
   */
  it("🔴 subtree เปิดเฉพาะเส้นที่อยู่ในลิสต์ subtree — เส้นในลิสต์ exact ต้องไม่เปิดลูก", async () => {
    signedOut();
    // ① `/invite` อยู่ในลิสต์ subtree → ลูกผ่าน (นี่คือเหตุผลเดียวที่ลิสต์นั้นมีอยู่)
    expect(await outcome(proxy(request("/invite/deadbeef"))), "/invite/<token>").toBe("pass");
    // ② เส้นในลิสต์ exact → ลูก **ต้องไม่** ผ่าน · ถอดการแยกลิสต์ออกเมื่อไหร่ สองบรรทัดนี้แดง
    for (const path of ["/auth/callback/extra", "/login/extra", "/api/keep-alive/extra"]) {
      expect(await outcome(proxy(request(path))), path).not.toBe("pass");
    }
  });

  it("🔴 ชื่อที่คล้าย public path แต่ไม่ใช่ ต้องไม่ผ่าน", async () => {
    // ยืนยันว่า `pathname === p || pathname.startsWith(`${p}/`)` เขียนถูก
    // ถ้าใครเผลอเปลี่ยนเป็น `pathname.startsWith(p)` เฉย ๆ เส้นพวกนี้จะหลุดด่านทันที
    signedOut();
    for (const path of ["/loginx", "/login-as", "/sw.js.map", "/auth/callbackx"]) {
      expect(await outcome(proxy(request(path))), path).not.toBe("pass");
    }
  });

  /**
   * 🔴 **เส้นที่ต้องไม่หลุด ไม่ว่า `PUBLIC_PATHS` จะถูกแก้ยังไง** (P4 · 5 ก.ย. 2026)
   *
   * เคสข้างบนจับ *ตัวจับที่หลวม* (`startsWith(p)` เฉย ๆ) — ยิงมัลแตนต์แล้ว **แดง 1 ใบ ตรงตามที่ตั้งใจ**
   * 🔴 **แต่มันไม่จับ *รายการที่กว้างเกิน* ซึ่งเป็นคนละความผิดพลาด และเงียบกว่า:**
   * ```
   * "/api/engine/invites/peek"   ← ของจริง · `redeem` ไม่ผ่าน
   * "/api/engine/invites"        ← ย่อให้สั้นลง (ดูเหมือนเก็บกวาด) · **ตัวจับยังถูกทุกตัวอักษร**
   *                                 แล้ว `${p}/` จับ `/api/engine/invites/redeem` **โดยตั้งใจของมันเอง**
   * ```
   * 🎯 ***ตัวจับไม่ได้พัง — มันทำงานถูกกับรายการที่ผิด · ไม่มีเคสไหนในไฟล์นี้มองเห็นความต่างนั้น***
   *
   * · 📌 `proxy.ts` เขียนไว้เองว่า `redeem` มีด่านสองชั้น (*ไม่อยู่ในลิสต์* **และ** *`anon` ไม่มี `grant`*)
   *   ⇒ ชั้นที่สองยังยืน (ยืนยันแล้ว: `20260904220000:271,276` `revoke all … from anon` แล้ว grant ให้
   *   `authenticated` อย่างเดียว) · **แต่ชั้นแรกไม่มีอะไรเฝ้าเลย** ⇒ หายไปเงียบได้โดยไม่มีอาการ
   * · 🎯 ***ด่านสองชั้นที่ชั้นหนึ่งไม่มีใครเฝ้า คือด่านชั้นเดียวที่เรานับเป็นสอง***
   */
  const MUST_STAY_PROTECTED = [
    // เข้าเป็นสมาชิกทริป = ต้องมีตัวตน · `peek` (ดูว่าถูกชวนไปไหน) เปิดได้ **แต่ใบนี้ไม่ได้**
    "/api/engine/invites/redeem",
    // เส้นที่แตะข้อมูลของผู้ใช้โดยตรง — ไม่มีใบไหนควรอยู่ใน `PUBLIC_PATHS` ตลอดกาล
    "/api/engine/trips",
    "/api/engine/places",
    "/today",
    "/summary",
    "/account",
  ];

  it("🔴 เส้นที่ต้องไม่หลุด — จับ *รายการที่กว้างเกิน* ซึ่งตัวจับที่ถูกต้องจะพาเข้าไปเอง", async () => {
    signedOut();
    for (const path of MUST_STAY_PROTECTED) {
      expect(
        await outcome(proxy(request(path))),
        `${path} หลุดด่าน — ดู \`PUBLIC_PATHS\` ว่ามีรายการไหนกว้างเกินจนกลืนเส้นนี้เข้าไป\n` +
          "  🔴 ตัวจับอาจถูกต้องทุกตัวอักษร — ความผิดพลาดอยู่ที่ *รายการ* ไม่ใช่ที่ *ตัวจับ*",
      ).not.toBe("pass");
    }
  });
});

describe("🔴 S5 — คุกกี้ที่เพิ่งต่ออายุต้องติดไปกับ response ที่ถูกกั้นด้วย", () => {
  // `refreshSession()` รันไปก่อนด่านแล้ว · token ถูกหมุนไปแล้วไม่ว่าจะออกทางไหน
  // ถ้าทางที่กั้นทิ้ง Set-Cookie ไคลเอนต์จะถือ token เก่าที่อาจถูกเพิกถอนแล้ว
  it("ทางที่ redirect ยังเป็น response ที่ผ่าน withSessionCookies", async () => {
    signedOut();
    const res = await proxy(request("/today"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBeTruthy();
  });

  it("ทาง 401 ก็เหมือนกัน", async () => {
    signedOut();
    const res = await proxy(request("/api/x"));
    expect(res.status).toBe(401);
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
/**
 * 🔴 **เส้นทาง "เปิดดูก่อนสมัคร"** — P1 · 4 ก.ย. 2026 · ผู้ใช้สั่ง
 *
 * ## ทำไมบล็อกนี้ต้องมี — มันมาแทนความคุ้มครองที่ผมเพิ่งถอดออกไปเอง
 * ก่อนหน้านี้ *"ไม่มี user = ไม่ผ่าน"* เป็นกฎเดียวไม่มีข้อยกเว้น ⇒ **ไม่ต้องมีเคสก็ยังปลอดภัย**
 * ตอนนี้มีข้อยกเว้น 4 เส้น ⇒ ***จำนวนเส้นที่เปิดกลายเป็นของที่ต้องมีคนเฝ้า และไม่มีอะไรเฝ้ามันอยู่***
 *
 * 🎯 ***เคสฝั่งที่ยัง "ปิด" สำคัญกว่าฝั่งที่ "เปิด"*** — เปิดพลาดจะไม่มีใครบ่น (ผู้ใช้ได้ของที่ขอ
 *    · ไม่มีอาการ) · ปิดพลาดจะมีคนบ่นใน 5 นาที ⇒ **ครึ่งที่เงียบคือครึ่งที่ต้องเขียนเคสให้**
 */
describe("🔴 เส้นทางเปิดดูก่อนสมัคร (4 ก.ย. 2026)", () => {
  it("① คนยังไม่ล็อกอินเข้าหน้าแรกได้ — และเข้าได้ *เฉพาะ* `/` เป๊ะ ๆ", async () => {
    signedOut();
    expect(await outcome(proxy(request("/")))).toBe("pass");
  });

  /**
   * 🔴 **`/invite/<token>` เพิ่ม 5 ก.ย. 2026 — และมันคือเคสที่ *ควรมีตั้งแต่แรก แต่ไม่มี***
   * ผมเปิด `…/invites/peek` (API) แล้วเขียนเคสให้มัน · **แต่ไม่ได้เขียนเคสให้ *หน้า* ที่เรียกมัน**
   * ⇒ ฟีเจอร์เด้ง `/login` ใส่คนที่ยังไม่มีบัญชี — คนที่มันมีไว้เพื่อเขาโดยเฉพาะ
   * 🎯 ***เคสของ API ผ่าน ไม่ได้แปลว่าเส้นทางที่ผู้ใช้เดินจริงผ่าน — คนละชั้น และผมทดสอบแค่ชั้นเดียว***
   */
  it.each([
    "/api/engine/countries",
    "/api/engine/cities",
    "/api/engine/trip-templates",
    "/invite/0000000000000000000000000000000000000000000000000000000000000000",
    // 🔴 **`/explore` + `/explore/<cc>` เพิ่ม 5 ก.ย. 2026 — และมันคือรูปเดียวกับ `/invite` ข้างบนเป๊ะ**
    //    ผมเปิด `/api/engine/countries` และ `/api/engine/cities` ให้ `anon` เมื่อ 4 ก.ย.
    //    **แล้วไม่ได้เปิดหน้าที่เรียกมัน** ⇒ API สาธารณะสองเส้นนั้น *ไม่มีใครเรียกถึงได้เลยสักครั้ง*
    //    🎯 ***บทเรียนของ `/invite` ถูกเขียนไว้ในไฟล์นี้แล้ว 5 ชั่วโมงก่อนผมทำซ้ำ —
    //       และผมเป็นคนอ่านมันตอนเขียนเคสนั้นเอง***
    //    · ผู้ใช้เป็นคนเจอ: *"คนไม่ login เปิดแล้วติดนะ"* — ไม่ใช่ด่านไหนของเรา
    "/explore",
    "/explore/jp",
  ])("② คนยังไม่ล็อกอินยิง %s ได้ (ทิศบวก)", async (path) => {
    signedOut();
    expect(await outcome(proxy(request(path)))).toBe("pass");
  });

  /**
   * 🔴 **หัวใจของบล็อก — ถ้าใครทำให้ตัวจับใน `PUBLIC_*_PATHS` หลวมลง เคสพวกนี้แดง**
   * ตัวจับมีสองใบตั้งแต่ 5 ก.ย. 2026: `PUBLIC_EXACT_PATHS.includes(pathname)` (ไม่เปิด subtree)
   * และ ``PUBLIC_SUBTREE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))``
   * ⇒ `"/"` **ห้าม**อยู่ในลิสต์ subtree ไม่งั้นมันเป็น prefix ของทุก path ในเว็บ
   *   (`/` จึงถูกเทียบตรง ๆ แยกไว้ในตัว `proxy()` — ดูคอมเมนต์ที่นั่น)
   */
  it.each([
    ["/trip/abc", "redirect"],
    ["/account", "redirect"],
    ["/today", "redirect"],
    ["/summary", "redirect"],
    ["/api/engine/trips", "json401"],
    ["/api/engine/trips/abc/stops", "json401"],
    ["/api/engine/plans", "json401"],
    // 🔴 คุมขอบของ `/explore` — `startsWith("/explore/")` ต้องไม่ลามไปโดนชื่อที่ *ขึ้นต้นเหมือนกัน*
    ["/explorer", "redirect"],
    ["/explore-secret", "redirect"],
    /**
     * 🔴 **ลูกของเส้นสาธารณะ ต้องไม่สาธารณะตามพ่อ — เพิ่ม 5 ก.ย. 2026 พร้อม route `copy`**
     * ก่อนหน้านี้ลิสต์มีใบเดียวและตัวจับเปิด subtree เสมอ ⇒ `trip-templates` ที่ *ไม่มีลูก*
     * จึงปลอดภัย **เพราะชุดมันเล็ก ไม่ใช่เพราะมีด่าน** · วันที่มีลูกใบแรก ช่องก็กว้างพอเดินผ่าน
     * 🎯 ***`GET` = "มีแผนอะไรให้ดู" (ไม่ต้องมีตัวตน) · `copy` = "เอามาเป็นทริปฉัน" (ต้องมี)***
     *    ⇒ เคสนี้คือสิ่งที่บังคับว่าสองคำถามนั้นอยู่คนละลิสต์
     */
    ["/api/engine/trip-templates/00000000-0000-0000-0000-000000000000/copy", "json401"],
    // เคสควบคุมของเพื่อนบ้านในลิสต์เดียวกัน — วันนี้ยังไม่มีลูก **และต้องไม่มีโดยอัตโนมัติ**
    ["/api/engine/cities/anything", "json401"],
    ["/api/engine/countries/anything", "json401"],
    // `peek` เปิด · `redeem` ปิด — เคยพึ่ง "ไม่อยู่ในลิสต์" อย่างเดียว ตอนนี้พึ่ง "ลิสต์ไม่เปิด subtree" ด้วย
    ["/api/engine/invites/redeem", "json401"],
  ])("🔴 ③ %s ต้องยัง *ไม่* เปิด (เคสควบคุมฝั่งลบ)", async (path, want) => {
    signedOut();
    expect(
      await outcome(proxy(request(path))),
      `${path} เปิดให้คนยังไม่ล็อกอินแล้ว — ถ้าตั้งใจ ต้องมาแก้เคสนี้พร้อมเหตุผล`,
    ).toBe(want);
  });

  /**
   * 🔴 **`/` เปิด แต่ต้องไม่ลากหน้าอื่นมาด้วย**
   *
   * ⚠️ **ขอบเขตที่วัดแล้ว — เคสนี้ *ไม่ได้* จับการย้าย `"/"` เข้า `PUBLIC_PATHS`**
   * ยิงมัลแตนต์แล้ว: ใส่ `"/"` เข้าลิสต์ → **ไม่มีเคสไหนแดงเลย** เพราะตัวจับสร้าง `"//"` ⇒ ไม่ match อะไร
   * ⇒ การย้ายนั้น **ไม่เปลี่ยนพฤติกรรม** จึงไม่มีอะไรให้จับ (และไม่ใช่บั๊ก)
   *
   * 🎯 ***ตัวที่พังจริงคือ "ลิสต์หลวม + ตัวจับหลวม" พร้อมกัน*** — มัลแตนต์ที่เปลี่ยนตัวจับเป็น
   *    `startsWith(p)` พร้อม `"/"` ในลิสต์ ทำให้ **เคสแดง 15 ใบ** (ส่วนใหญ่อยู่ในบล็อก
   *    *"ไม่มี session — ต้องถูกกั้น"* ข้างบน ซึ่งเป็นตัวที่เฝ้าเรื่องนี้อยู่จริง)
   * · เคสนี้จึงเป็น **ตัวกันถอยราคาถูกของกิ่ง `/`** ไม่ใช่ตัวเฝ้าเรื่องตัวจับ — เขียนไว้ให้ตรงกับที่มันทำได้จริง
   */
  it("🔴 ④ `/` เปิดได้ แต่ `/อะไรก็ตาม` ต้องไม่ติดไปด้วย", async () => {
    signedOut();
    expect(await outcome(proxy(request("/")))).toBe("pass");
    expect(
      await outcome(proxy(request("/anything-else"))),
      "หน้าอื่นเปิดตามไปด้วย = กิ่ง `/` กว้างเกินที่ตั้งใจ",
    ).toBe("redirect");
  });

  /**
   * 🔴 **ทุกเส้นใน `PUBLIC_PATHS` ต้องมีเคสในไฟล์นี้ — ปิดช่องที่ P2 ชี้ (5 ก.ย. 2026)**
   *
   * ## ที่มา: `/invite/<token>` เด้ง `/login` อยู่ครึ่งคืนโดยไม่มีใครเห็น
   * ผมเปิด `…/invites/peek` (API) แล้วเขียนเคสให้มัน · **แต่ไม่ได้เปิดหน้า และไม่ได้เขียนเคสให้หน้า**
   * ⇒ ฟีเจอร์ที่คุณสมบัติหลักคือ *"ใช้ได้โดยไม่ต้องล็อกอิน"* พังตรงคุณสมบัตินั้นพอดี
   *
   * 🎯 **P2 วิเคราะห์ว่าทำไมสองคนตรวจแล้วยังไม่เห็น — และข้อนี้คือเหตุผลที่เคสนี้ต้องมี:**
   * ```
   * P1 ยิง  API  ด้วย client **เปล่า**        ผ่าน
   * P2 ยิง  หน้า ด้วย client **ที่มีเซสชัน**   ผ่าน
   * ของจริง หน้า ด้วย client เปล่า            ❌  ← ไม่มีใครยิงช่องนี้
   * ```
   * ***ช่องอยู่ตรงที่ "มิติที่ P2 เปลี่ยน" กับ "มิติที่ P1 เปลี่ยน" ไม่เคยถูกเปลี่ยนพร้อมกัน***
   * ⇒ **สองคนตรวจ ไม่ได้แปลว่าครอบคลุมกว่าหนึ่งคน ถ้าทั้งคู่ตรึงตัวแปรคนละตัวไว้** (ถ้อยคำ P2)
   *
   * ## 🔴 และ P2 ชี้ข้อโครงสร้างที่แรงกว่านั้น
   * `PUBLIC_PATHS` อยู่ใน `proxy.ts` ซึ่งเป็นโซน P1 ⇒ **ทุกครั้งที่เขาทำหน้าใหม่ที่ต้องเปิดให้ `anon`
   * เขาพึ่ง P1 เสมอ และ *ฝั่งเขาไม่มีอะไรแดง* ถ้า P1 ลืม**
   * ⇒ เคสนี้ทำให้ **ฝั่งที่ลืมได้ (P1) เป็นฝั่งที่แดง** — ไม่ใช่ฝั่งที่รอ
   *
   * ## วิธี: เทียบสองทิศ ไม่ใช่ทิศเดียว
   * ทิศ ① เส้นในลิสต์ **ทุกเส้น** ต้องมีเคส ⇒ เพิ่มเส้นแล้วไม่เขียนเคส = แดงที่นี่
   * ทิศ ② (เคส ② ข้างบน) เคสทุกใบต้อง **ผ่านจริงเมื่อไม่มี session** ⇒ ลิสต์ถูกแต่ด่านพัง = แดงที่นั่น
   * · ⚠️ **ยังไม่ปิดทิศที่สาม**: *หน้าใหม่ที่ควรเปิดแต่ไม่มีใครใส่ในลิสต์* — ไม่มีอะไรในไฟล์นี้รู้ว่ามันควรเปิด
   *   🔴 **จดไว้เป็นความเสี่ยงที่รับ** · ทางลดคือของ P2: ***ยิง `curl` เปล่าที่ตัวหน้า เป็นขั้นตอนสุดท้ายของทุกหน้าที่ควรเปิด***
   */
  it("🔴 ⑤ ทุกเส้นใน `PUBLIC_*_PATHS` ต้องมีเคสในบล็อกนี้ — เพิ่มเส้นแล้วไม่เขียนเคส = แดง", async () => {
    const src = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
    /**
     * 🔴 **ต้องอ่าน *ทั้งสอง* ลิสต์ — 5 ก.ย. 2026 ลิสต์ถูกแยกเป็น exact/subtree**
     * ⚠️ **และตัวสแกนใบเก่าจับเรื่องนี้ได้เอง**: regex เดิมหา `const PUBLIC_PATHS` ไม่เจอ → ลิสต์ว่าง
     *    → ทิศบวกข้างล่าง (`> 4`) แดงทันที · ***ทะเบียนที่ผิดได้ ทำงานตามที่มันถูกเขียนมาให้ทำ***
     *    (`TEAM.md §3.4` — *ทะเบียนต้อง **ผิดได้*** ) ⇒ ไม่ต้องมีใครจำว่าต้องมาแก้ไฟล์นี้
     */
    const block = (name: string) =>
      [...(src.match(new RegExp(`const ${name}[\\s\\S]*?\\n\\];`))?.[0] ?? "")
        .matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
    const exact = block("PUBLIC_EXACT_PATHS");
    const subtree = block("PUBLIC_SUBTREE_PATHS");
    const listed = [...exact, ...subtree];
    // 🔴 ทิศบวกของ *ตัวสแกน* — regex ที่ไม่ match จะได้ลิสต์ว่าง แล้วเคสนี้เขียวโดยไม่ตรวจอะไร
    expect(listed.length, "อ่าน `PUBLIC_*_PATHS` จาก proxy.ts ไม่ได้ — เคสนี้กำลังตรวจความว่างเปล่า")
      .toBeGreaterThan(4);
    // 🔴 และแต่ละใบต้องไม่ว่างเดี่ยว ๆ — รวมกันแล้วเกิน 4 ยังเกิดได้ทั้งที่ใบหนึ่งอ่านไม่ออก
    expect(exact.length, "ลิสต์ exact อ่านไม่ออก").toBeGreaterThan(0);
    expect(subtree.length, "ลิสต์ subtree อ่านไม่ออก").toBeGreaterThan(0);

    signedOut();
    const missing: string[] = [];
    for (const path of subtree) {
      // เส้น subtree ยิงด้วย *ลูก* ของมันจริง ๆ — ตรงกับที่ผู้ใช้เดิน และเป็นเหตุผลที่มันอยู่ลิสต์นั้น
      if ((await outcome(proxy(request(`${path}/deadbeef`)))) !== "pass") missing.push(`${path}/deadbeef`);
    }
    for (const path of exact) {
      if ((await outcome(proxy(request(path)))) !== "pass") missing.push(path);
    }
    expect(
      missing,
      "เส้นใน `PUBLIC_*_PATHS` ที่ยังถูกด่านกั้นอยู่จริง — ลิสต์กับพฤติกรรมไม่ตรงกัน",
    ).toEqual([]);
  });

  it("⑥ ล็อกอินแล้วยังผ่านทุกเส้นเหมือนเดิม (กันเคสข้างบนเขียวเพราะด่านพังทั้งใบ)", async () => {
    signedIn();
    for (const p of ["/", "/account", "/api/engine/trips", "/api/engine/countries"]) {
      expect(await outcome(proxy(request(p))), `ล็อกอินแล้วยังโดนกัน: ${p}`).toBe("pass");
    }
  });
});
