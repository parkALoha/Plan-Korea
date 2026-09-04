import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { readEnvKey, requireLiveCreds, TEST_COUNTRY_CODES } from "./_helpers";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";
// 🔴 เรียก **DAL ตัวจริง** ไม่ใช่เขียนคิวรีเลียนแบบ — คิวรีที่เทสต์เขียนเองพิสูจน์ได้แค่ว่า
//    *เทสต์เขียนถูก* ไม่ได้พิสูจน์ว่า *ของที่ route เรียกใช้ถูก* (บทเรียน `trips.name` `fae94fe`)
import { tripDestinationsOf, type Db } from "@/lib/engine/db";
// 🔴 อ่านเพดานจาก **แหล่งเดียวกับที่ route บังคับใช้** — ห้าม hardcode เลขซ้ำในเทสต์
//    เทสต์ที่ปักเลขของตัวเอง จะยัง "ผ่าน" อยู่หลังมีคนเปลี่ยนเพดาน **แล้วเลิกวัดเพดานจริง**
//    (ไฟล์ `tripLimits.ts` เกิดมาจากการที่สองเส้นถือเลขคนละตัว — เทสต์เป็นเลขใบที่สามได้ง่ายที่สุด)
import { MAX_TRIP_DESTINATIONS } from "@/lib/engine/tripLimits";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * `E3-AC9` ② (runtime) — Server Action แทน A แตะทริป B ไม่ได้ · เจ้าของ: P4-QA/Sec (26 ส.ค. 2026)
 *
 * ## ทำไมต้องยิง route จริง ไม่ใช่แค่ทดสอบ db helper
 * `rlsMatrix.test.ts` วัด RLS ที่ **ชั้นตาราง** · แต่ route ประกอบหลายอย่างเข้าด้วยกัน
 * (getUser → createServerSupabase → db helper → RPC) และบั๊กอยู่ที่ *การประกอบ* ได้
 * · พิสูจน์แล้ววันแรกที่สร้าง harness นี้: `GET /api/engine/trips` **เคย**คืน 502 ทุกคน เพราะ
 *   `tripsVisibleToMe` select `trips.name` ที่ไม่มีจริง — **ไม่มีเทสต์ชั้นตารางจับได้**
 *   (P1 แก้แล้ว `fae94fe` · `db.ts:261` `name`→`title`) · เก็บไว้เป็นเหตุผลว่าทำไม probe ยิง route จริง
 *   🎯 **641 เคสเขียวทั้งวัน ขณะที่ endpoint นี้คืน 502 ให้ทุกคน:** `rlsMatrix` ยิง `.from("trips")`
 *      ด้วยชื่อคอลัมน์ *ของมันเอง* (เขียนถูก) แต่ **ไม่เคยเรียก `tripsForUser()`** → helper กับเทสต์
 *      เห็นสคีมาคนละใบ ไม่มีอะไรเทียบให้ · `P-76` ในรูปของ coverage (P1) — เขียวหลอกที่มีคำอธิบายฟังขึ้น
 *
 * ## harness: in-process ยิงในนาม B — **ไม่ต้องมีเซิร์ฟเวอร์ รันใน CI ได้**
 * mock `next/headers` ให้คืนคุกกี้ ssr ของ B ที่ capture มา → route เรียก `getUser()` ตรวจ JWT
 * ของ B กับ auth server จริง → `createServerSupabase()` ผูก RLS กับ B → db → RPC
 *
 * ## รูป probe (เหมือน `E2-AC1` outsider sweep แต่ผ่าน route)
 * ต่อ route: ① A ทำ write สำเร็จ (control — พิสูจน์ว่า route ไม่ได้พังทุกคน)
 *           ② B (นอกทริป A) ทำ write เดียวกันใส่ tripA → ต้องถูกปฏิเสธ
 *           ③ admin อ่านฐานยืนยัน: มีแค่แถวของ A · ของ B ไม่เกิดขึ้นจริงสักแถว (`P-72`)
 *
 * ## 🔴 แยก 502 ออกจาก 403 ให้ขาด (P1 · 27 ส.ค. 2026)
 * บั๊กชนิด "helper อ้างคอลัมน์ที่ไม่มี" (แบบ `trips.name`) เกิดได้กับ **ทุก helper** และโผล่เป็น `502`
 * → **`502` = บั๊กของเรา · `403`/`0-rows` = ด่านทำงาน** · สองอย่างนี้ห้ามนับรวมเป็น "ถูกปฏิเสธ"
 * `verdictFor()` แยกให้: `server-bug`(502/อื่น) แดงพร้อมป้าย "บั๊กเรา" · `leak`(2xx) แดง · `rejected` ผ่าน
 * → File 2 จับบั๊กคอลัมน์ของ **ทุกเส้น**ที่มัน probe ได้ฟรี โดยไม่ต้องเขียน pin ทีละเส้น
 *
 * ## 🔴 สถานะความครอบคลุม (เขียนตรง ๆ ไม่ให้เข้าใจว่าครบ)
 * ครอบแล้ว: **bookings · checklist** (POST) · **members** (GET · viewer เห็น/คนนอกไม่เห็น) + pin `GET /trips`=200
 *   · เหลืออีก 7 ใน 10 trip-scoped route: custom-places · hidden-places · stops (POST) · day-settings · days · hotels · place-notes (PUT/PATCH)
 * · `engineAttackSurface.test.ts` ค้ำว่าทั้ง 10 ถูกจำแนกไว้ · **ด่านบังคับ "ครบทั้ง 10"** จะเปิดเมื่อ probe ครบ
 * · 🔴 `cover` (route ที่ 11) **ถูกถอนทั้งชุด 27 ส.ค.** — ผู้ใช้เปลี่ยนสโคปเป็นรูปสถิตย์ ไม่ใช่เพราะ probe ผิด
 *   เคสที่ยังจริงถูก **ย้ายไป `booking-files`** ใน `rlsMatrix` (viewer อ่านได้/เขียนไม่ได้ · update · ไฟล์ราก · anon)
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && ANON && SERVICE);

const jar = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => jar.cookies,
    get: (n: string) => jar.cookies.find((c) => c.name === n),
    set: () => {},
  }),
}));

// import handler หลัง vi.mock (vitest hoist mock ให้)
import { POST as bookingsPOST } from "@/app/api/engine/trips/[tripId]/bookings/route";
import { POST as checklistPOST } from "@/app/api/engine/trips/[tripId]/checklist/route";
import { GET as tripsGET, POST as tripsPOST } from "@/app/api/engine/trips/route";
import { GET as placesGET } from "@/app/api/engine/places/route";
import { PATCH as daysPATCH } from "@/app/api/engine/trips/[tripId]/days/route";
import { PUT as daySettingsPUT } from "@/app/api/engine/trips/[tripId]/day-settings/route";
import { POST as stopsPOST, GET as stopsGET } from "@/app/api/engine/trips/[tripId]/stops/route";
import { PUT as hotelsPUT, GET as hotelsGET } from "@/app/api/engine/trips/[tripId]/hotels/route";
import { POST as customPlacesPOST, GET as customPlacesGET } from "@/app/api/engine/trips/[tripId]/custom-places/route";
import { POST as hiddenPlacesPOST } from "@/app/api/engine/trips/[tripId]/hidden-places/route";
import { PUT as placeNotesPUT, DELETE as placeNotesDELETE } from "@/app/api/engine/trips/[tripId]/place-notes/route";
import { GET as membersGET } from "@/app/api/engine/trips/[tripId]/members/route";
// 🔴 สองใบใหม่ 4 ก.ย. 2026 (P1) — `destinations` อยู่ในโฟลเดอร์ · `tripPATCH` อยู่ที่ **ราก** `[tripId]/`
//    ใบหลังคือใบแรกในประวัติที่อยู่ที่ราก และเป็นเหตุผลที่ตัวแจงจักรวาลข้างบนต้องเดินหา *ไฟล์*
import { PUT as destinationsPUT } from "@/app/api/engine/trips/[tripId]/destinations/route";
import { PATCH as tripPATCH } from "@/app/api/engine/trips/[tripId]/route";
import { PUT as pinPUT } from "@/app/api/engine/trips/[tripId]/pin/route";
import { GET as templatesGET } from "@/app/api/engine/trip-templates/route";

type Cookie = { name: string; value: string };
type Handler = (req: NextRequest, ctx: { params: Promise<{ tripId: string }> }) => Promise<Response>;

function noRealtime<T>(): T {
  return { transport: NO_REALTIME_TRANSPORT } as unknown as T;
}
function anonClient(): SupabaseClient {
  return createClient(URL_, ANON, { auth: { persistSession: false }, realtime: noRealtime() });
}

async function captureCookies(session: { access_token: string; refresh_token: string }): Promise<Cookie[]> {
  const out: Cookie[] = [];
  const c = createServerClient(URL_, ANON, {
    realtime: noRealtime(),
    cookies: {
      getAll: () => out.map((x) => ({ name: x.name, value: x.value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          const i = out.findIndex((x) => x.name === name);
          if (i >= 0) out[i] = { name, value };
          else out.push({ name, value });
        }
      },
    },
  });
  const { error } = await c.auth.setSession(session);
  if (error) throw new Error("setSession(capture): " + error.message);
  return out;
}

async function postAs(cookies: Cookie[], tripId: string, handler: Handler, body: unknown): Promise<Response> {
  jar.cookies = cookies;
  const req = new NextRequest(`http://localhost:3300/api/engine/trips/${tripId}/x`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve({ tripId }) });
}

// ยิง handler ด้วย method ใด ๆ (PATCH/PUT/DELETE) — สำหรับ probe แบบ modify
async function callAs(cookies: Cookie[], tripId: string, handler: Handler, method: string, body?: unknown): Promise<Response> {
  jar.cookies = cookies;
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new NextRequest(`http://localhost:3300/api/engine/trips/${tripId}/x`, init);
  return handler(req, { params: Promise.resolve({ tripId }) });
}

/**
 * แยกผลของ B ออกเป็น 3 ทาง — หัวใจของด่านนี้
 * · `rejected`  = 401/403 (RLS/auth) หรือ 404/409 (`0-rows`/stale) → **ด่านทำงาน**
 * · `leak`      = 2xx → **B เขียน/อ่านของ A สำเร็จ**
 * · `server-bug`= 502 หรืออื่น (400/500) → **บั๊กของเรา** (helper อ้างคอลัมน์ที่ไม่มี ฯลฯ) — แยกไปแก้ ไม่นับเป็นผ่าน
 */
/**
 * 🔴 **`rejectStatuses` — สมมติฐานว่า *"การปฏิเสธหน้าตาเป็นยังไง"* ต้องเขียนที่จุดเรียก ไม่ใช่ซ่อนในตัวช่วย**
 * (P4 โดนเอง 28 ส.ค. · P1 สำรวจต่อแล้วเจออีก 3 จุด)
 *
 * ค่าปริยาย `[401,403,404,409]` ถูกสำหรับ probe ส่วนใหญ่: *"B เขียนใส่ทริป A"* → RLS/auth ปฏิเสธ
 * และ **`400` แปลว่าเราส่ง args ผิด = probe พัง** ซึ่งเป็นเหตุผลที่ตัวช่วยนี้ถูกสร้างมา — **อย่าทำให้ 400
 * เป็น `rejected` โดยปริยาย มันจะฆ่าคุณค่านั้นทิ้ง**
 *
 * ⚠️ **แต่บาง endpoint แปล error ของ *ฐาน* เป็น `400` โดยตั้งใจ** → ตรงนั้น `400` คือ*การปฏิเสธที่ถูกต้อง*
 * ไล่แล้ววันนี้มี 4 จุด: `stops:176` · `custom-places:138` · `place-notes:112` (`23503`) · `trips:153` (`22023`)
 * · เคสที่ยิงเส้นพวกนั้นต้อง **ระบุเอง** ไม่งั้นตัวจำแนกจะรายงาน **ของที่ทำงานถูกว่าเป็นบั๊กของเรา**
 * 🎯 และแดงหลอกแบบนั้นแพงเป็นพิเศษ เพราะมันขึ้นป้าย *"บั๊กเรา"* บนเคสความปลอดภัย —
 *    **คนอ่านจะไปแก้ route ทั้งที่ควรไปแก้ตัววัด**
 */
async function verdictFor(
  res: Response,
  opts: { rejectStatuses?: readonly number[] } = {},
): Promise<{ verdict: "rejected" | "leak" | "server-bug"; detail: string }> {
  const reject = opts.rejectStatuses ?? [401, 403, 404, 409];
  const body = await res.clone().json().catch(() => null);
  const detail = `HTTP ${res.status} ${JSON.stringify(body)}`;
  const s = res.status;
  if (reject.includes(s)) return { verdict: "rejected", detail };
  if (s >= 200 && s < 300) return { verdict: "leak", detail };
  return { verdict: "server-bug", detail }; // 502 (คอลัมน์/ helper) · 400 ที่ไม่ได้ประกาศไว้ · อื่น
}

/**
 * endpoint ที่แปล error ของฐานเป็น `400` — **`400` ที่นี่คือการปฏิเสธ ไม่ใช่ args ผิด**
 * ⚠️ ยังไม่รวม `502` โดยตั้งใจ: FK ปฏิเสธจริงแต่ route แปลรหัสไม่ออก **ยังเป็นบั๊กของเรา**
 */
const DB_REJECT_STATUSES = [400, 401, 403, 404, 409] as const;

/**
 * trip-route ที่ "มี probe ยิงข้ามจริง" ในไฟล์นี้ — อัปเดตคู่กับ probe เสมอ
 * ชื่อ = พาธของโฟลเดอร์ใต้ `[tripId]/` · `"(root)"` = `route.ts` ที่อยู่ที่ราก (ดู `ROOT_ROUTE`)
 */
const COVERED = new Set(["bookings", "checklist", "days", "day-settings", "stops", "hotels", "custom-places", "hidden-places", "place-notes", "members", "destinations", "(root)", "pin"]);

/**
 * 🔴 **ชื่อแทน `route.ts` ที่อยู่ที่ราก `[tripId]/` — ไม่ใช่ในโฟลเดอร์ย่อย**
 * ต้องเป็นชื่อที่ **เป็นชื่อโฟลเดอร์ไม่ได้** ไม่งั้นวันหนึ่งจะชนกับ route จริงแล้วสองอันนับเป็นอันเดียว
 */
const ROOT_ROUTE = "(root)";

/**
 * trip-scoped route จากดิสก์ — denominator ที่เชื่อได้ ไม่ใช่เลข hardcode
 *
 * 🔴 **ฉบับก่อนหน้าเดินหา *ไดเรกทอรี* และมันมองไม่เห็น `[tripId]/route.ts`** (P4 · 4 ก.ย. 2026)
 * ```
 * engineAttackSurface.routeFiles()   เดินหา **ไฟล์** `route.ts`      → เห็น `[tripId]/route.ts`
 * ฉบับเก่าของฟังก์ชันนี้              เดินหา **ไดเรกทอรี** ย่อย        → มองไม่เห็นเลย
 * ```
 * ⇒ `PATCH /trips/[tripId]` (route ใบแรกในประวัติที่อยู่ที่ *ราก*) **ไม่มีวันโผล่ใน `remaining`**
 * 🎯 ***ด่าน "ต้องมี probe ครบทุกใบ" ข้างล่างจะเขียวได้ทั้งที่ route ใบนั้นไม่มี probe เลยสักตัว***
 * · ⚠️ **ไม่ใช่ความเลินเล่อของใคร — เป็นรูปที่จักรวาลของด่านมองไม่เห็นตามโครงสร้าง**
 *   ตอนเขียนฉบับแรก (26 ส.ค.) *ทุก* route อยู่ในโฟลเดอร์ย่อย ⇒ ไดเรกทอรีกับไฟล์ให้คำตอบเดียวกันเป๊ะ
 *   **ข้อสมมตินั้นเป็นเท็จวันที่มีคนวาง `route.ts` ที่ราก และไม่มีอะไรส่งเสียงตอนมันเป็นเท็จ**
 * · ✅ ฉบับนี้เดินหา **ไฟล์** เหมือน `engineAttackSurface` — จักรวาลใบเดียวกัน ไม่ใช่สองใบที่ต้องซิงก์กันเอง
 *   (`§3.5`: *สำเนาที่ต้องมีคนซิงก์ จะล้าเสมอ*) · มีเคสควบคุมบังคับข้อนี้อยู่ใน describe ข้างล่าง
 */
function tripScopedRouteNames(): string[] {
  const base = resolve(process.cwd(), "app/api/engine/trips/[tripId]");
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name);
      else if (e.name === "route.ts") out.push(prefix || ROOT_ROUTE);
    }
  };
  walk(base, "");
  return out.sort();
}

// 🔴 แบนเนอร์ความครอบคลุม — **รันเสมอ ไม่ต้องมี creds** เพื่อให้ตัวเลขโผล่ทุกครั้งที่รัน
//    ไม่ใช่แค่คอมเมนต์ (P1): กันคนเห็นไฟล์เขียวแล้วสรุปว่า cross-user ถูกทดสอบครบ
describe("E3-AC9 ② — ความครอบคลุม (ต้องเห็นตอนรัน)", () => {
  /**
   * 🔴 **เคสควบคุมของ *จักรวาล* ไม่ใช่ของผลลัพธ์** — บังคับสิ่งที่ฉบับไดเรกทอรีทำไม่ได้
   *
   * ถ้าใครย้อนตัวแจงกลับไปเดินหา *ไดเรกทอรี* (ซึ่งอ่านสั้นกว่าและดูสะอาดกว่า) เคสนี้แดงทันที
   * · **เคสตัวเลขข้างล่างจับไม่ได้** — คนที่ย้อนจะแก้ `.toBe(12)` เป็น `.toBe(11)` ให้เขียว
   *   แล้วทุกอย่างก็ดูปกติ **ในขณะที่ route ที่ราก `[tripId]/` หลุดออกจากด่านทั้งใบ**
   * 🎯 ***ตัวเลขบอกว่า "นับได้เท่าไหร่" · เคสนี้บอกว่า "นับจากจักรวาลที่ถูกไหม" — คนละคำถาม***
   */
  it("🔴 ควบคุมจักรวาล: ตัวแจงต้องเห็น `route.ts` ที่ *ราก* `[tripId]/` ไม่ใช่แค่ในโฟลเดอร์ย่อย", () => {
    const all = tripScopedRouteNames();
    expect(
      existsSync(resolve(process.cwd(), "app/api/engine/trips/[tripId]/route.ts")),
      "ไม่มี `[tripId]/route.ts` บนดิสก์แล้ว — ถ้าถูกลบจริง ให้ลบเคสนี้ทิ้งพร้อมกัน ไม่ใช่แก้ให้ผ่าน",
    ).toBe(true);
    expect(
      all,
      "ตัวแจงมองไม่เห็น route ที่ราก — มันกำลังเดินหา *ไดเรกทอรี* อยู่หรือเปล่า (ดูคอมเมนต์ของ tripScopedRouteNames)",
    ).toContain(ROOT_ROUTE);
    // ...และต้องยังเห็นของในโฟลเดอร์ย่อยด้วย — ไม่งั้น "แก้ฝั่งหนึ่งพังอีกฝั่ง" จะผ่านเงียบ
    expect(all, "ตัวแจงมองไม่เห็น route ในโฟลเดอร์ย่อย").toContain("bookings");
  });

  it("📊 coverage — เขียวไม่ได้แปลว่าครบทุกใบ · ตัวเลขต้องโผล่ตอนรัน", () => {
    const all = tripScopedRouteNames();
    // 🔴 **13 ตั้งแต่ 4 ก.ย. 2026 (บ่าย)** — `destinations` · `(root)` (`PATCH`) · `pin`
    //    ⚠️ รอบเช้าเลขขยับ 10 → 12 ไม่ใช่ 10 → 11: ฉบับก่อนของตัวแจงมองไม่เห็น `(root)` (ดูคอมเมนต์ข้างบน)
    expect(all.length, "อ่าน trip-route จากดิสก์ไม่ได้/จำนวนเปลี่ยน — denominator เชื่อไม่ได้").toBe(13);
    const covered = [...COVERED].sort();
    const stale = covered.filter((c) => !all.includes(c));
    expect(stale, `COVERED ชี้ route ที่ไม่มีบนดิสก์: ${stale.join(", ")}`).toEqual([]);
    const remaining = all.filter((r) => !COVERED.has(r));
    const banner =
      remaining.length === 0
        ? `\n✅ AC9② cross-user: ครอบครบ ${covered.length}/${all.length} trip-route\n`
        : `\n⚠️  AC9② cross-user: ครอบ ${covered.length}/${all.length} trip-route — เขียวไม่ได้แปลว่า cross-user ถูกทดสอบครบ\n` +
          `    เหลือ: ${remaining.join(" · ")}\n`;
    console.warn(banner);
    // 🔴 ด่านบังคับ "ครบทุกใบ" เปิดแล้ว (probe ครบ 27 ส.ค.) — route ใหม่ใต้ [tripId] ที่ไม่มี probe = แดงที่นี่
    expect(remaining, "มี trip-scoped route ที่ยังไม่มี probe ข้ามผู้ใช้ — เพิ่ม probe ใน describe นี้ก่อน").toEqual([]);
  });
});

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "E3-AC9 ② (engine cross-user)", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });
});

describe.runIf(hasCreds)("E3-AC9 ② — engine route ยิงข้ามผู้ใช้ไม่ได้", () => {
  const stamp = String(Date.now());
  // ตารางลูกที่ probe แตะ — เก็บกวาดลูกก่อนพ่อใน afterAll (grant service_role ตามข้อยกเว้น #4)
  const CHILD_TABLES = ["bookings", "checklist_items"];
  let admin: SupabaseClient;
  const ids: Record<string, string> = {};
  let tripA = "";
  let tripB = ""; // ทริปของ B — สำหรับ probe ชี้ custom place ข้ามทริป (D70)
  let aCookies: Cookie[] = [];
  let bCookies: Cookie[] = [];
  let cCookies: Cookie[] = []; // C = viewer *สมาชิก* ของทริป A (ต่างจาก B คนนอก) — สำหรับ probe members
  let dCookies: Cookie[] = []; // D = **editor** — เส้นที่แยก `can_write_trip` ออกจาก `owner` (บล็อก E5)
  let aDay = "";
  let aPlan = "";
  let aClient: SupabaseClient;
  let bClient: SupabaseClient; // B — ใช้ยิง RPC ในนามผู้ใช้ที่ **ไม่ได้เป็นสมาชิก** template (`E5-tpl` ข้อ ⑧)
  const CC = TEST_COUNTRY_CODES.engineCrossUser; // "xz" — country code จองในทะเบียน กันชนข้ามเซสชัน
  const citySlug = `ex-${stamp}`;
  const placeSlug = `exp-${stamp}`;
  const placeSlug2 = `exp2-${stamp}`;
  let place2Id = "";
  const placeSlug3 = `exp3-${stamp}`;
  let place3Id = "";
  const placeSlug4 = `exp4-${stamp}`;
  let place4Id = "";
  let cityId = ""; // เมืองคลังที่ seed ไว้ — ใช้เป็นจุดหมายของ tripA ในเคส GET /trips owner
  let cityId2 = ""; // เมืองที่ 2/3 — สำหรับเคส POST /trips cityIds (ลำดับ rank)
  let cityId3 = "";

  async function makeUser(tag: string) {
    const email = `xu-${tag}-${stamp}@example.test`;
    const password = `pw-${stamp}-${tag}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${tag}: ${error.message}`);
    ids[tag] = data.user!.id;
    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn ${tag}: ${signIn.error.message}`);
    return { client, session: signIn.data.session! };
  }

  async function mkTrip(client: SupabaseClient, owner: string) {
    const { data, error } = await client.rpc("create_trip", {
      p_title: `xu-${owner}-${stamp}`, p_start_date: "2026-10-11", p_end_date: "2026-10-21",
    });
    if (error) throw new Error(`create_trip ${owner}: ${error.message}`);
    if (data.created_by !== ids[owner]) throw new Error("trip owner mismatch");
    return data.id as string;
  }

  /** ① A create ได้ · ② B (นอกทริป) create ในทริป A ไม่ได้ · ③ ฐานมีแค่ของ A */
  async function createBlockedForB(opts: {
    label: string; handler: Handler; bodyA: unknown; bodyB: unknown;
    table: string; col: string; valueA: string; valueB: string;
  }) {
    const aRes = await postAs(aCookies, tripA, opts.handler, opts.bodyA);
    expect(
      aRes.status,
      `[${opts.label}] control A ควร 201 — ถ้าไม่ใช่ route พังก่อนถึงเคสจริง: ${aRes.status} ${await aRes.clone().text()}`,
    ).toBe(201);

    const bRes = await postAs(bCookies, tripA, opts.handler, opts.bodyB);
    const { verdict, detail } = await verdictFor(bRes);
    expect(
      verdict,
      `[${opts.label}] B (นอกทริป) → **${verdict}** (${detail})\n` +
        "  rejected = ด่านทำงาน · leak = B เขียนเข้าทริป A สำเร็จ · server-bug(502) = บั๊ก helper/คอลัมน์ของเรา แยกไปแก้ ไม่นับเป็นผ่าน",
    ).toBe("rejected");

    // 🔴 select("*") ไม่ใช่ `id,${opts.col}` — คอลัมน์ dynamic ทำให้ PostgREST type helper คืน ParserError → tsc TS2352
    //    (P1 · P3 เจอ · vitest ไม่ตรวจชนิด จึงเขียวขณะ tsc แดง) · ไม่ใช่ typo · แก้ที่ต้นเหตุ ไม่ใช่ as unknown ปิดตา
    const { data, error } = await admin.from(opts.table).select("*").eq("trip_id", tripA);
    if (error) throw new Error(`[${opts.label}] admin read ${opts.table}: ${error.message}`);
    const vals = (data ?? []).map((r) => (r as Record<string, string>)[opts.col]).sort();
    expect(
      vals,
      `[${opts.label}] ในทริป A ต้องมีแค่ของ A (${opts.valueA}) · ถ้าเจอ '${opts.valueB}' = B เขียนเข้าทริป A สำเร็จ (leak)`,
    ).toEqual([opts.valueA]);
  }

  async function purgeCatalog() {
    const cities = (await admin.from("catalog_cities").select("id").eq("country_id", CC)).data ?? [];
    const cityIds = cities.map((c) => (c as { id: string }).id);
    if (cityIds.length) {
      await admin.from("catalog_places").delete().in("city_id", cityIds);
      await admin.from("catalog_cities").delete().in("id", cityIds);
    }
    await admin.from("catalog_countries").delete().eq("id", CC);
  }

  async function seedCatalog() {
    await purgeCatalog(); // ลูกก่อนพ่อ · เรียกก่อน seed เผื่อรอบก่อนตายกลางคัน (รูป purgeCountry ของ P1)
    const co = await admin.from("catalog_countries").insert({ id: CC, name_th: "ทดสอบ", name_en: "Test" });
    if (co.error) throw new Error(`seed country: ${co.error.message}`);
    const ci = await admin.from("catalog_cities").insert({ country_id: CC, legacy_slug: citySlug, name_th: "เมืองทดสอบ", name_en: "TestCity", lat: 37.5, lng: 127.0, timezone: "Asia/Seoul" }).select("id").single();
    if (ci.error) throw new Error(`seed city: ${ci.error.message}`);
    cityId = ci.data.id as string; // ใช้เป็น city_id ของ trip_destinations (owner-sees-destinations case)
    const mkCity = async (n: number) => {
      const r = await admin.from("catalog_cities").insert({ country_id: CC, legacy_slug: `exc${n}-${stamp}`, name_th: `เมือง${n}`, name_en: `City${n}`, lat: 37.5 + n / 10, lng: 127.0 + n / 10, timezone: "Asia/Seoul" }).select("id").single();
      if (r.error) throw new Error(`seed city${n}: ${r.error.message}`);
      return r.data.id as string;
    };
    cityId2 = await mkCity(2);
    cityId3 = await mkCity(3);
    // ชื่ออยู่ catalog_place_names แยกตาราง · probe ต้องการแค่ให้ place *มีอยู่* (ค้นด้วย legacy_slug)
    const pl = await admin.from("catalog_places").insert({ city_id: ci.data.id, legacy_slug: placeSlug, category: "food", lat: 37.5, lng: 127.0 });
    if (pl.error) throw new Error(`seed place: ${pl.error.message}`);
    // place ที่ 2 สำหรับเคส deleted_at (แยกจาก place แรกที่ cross-user probe ใช้ ไม่ให้ชน)
    const pl2 = await admin.from("catalog_places").insert({ city_id: ci.data.id, legacy_slug: placeSlug2, category: "food", lat: 37.6, lng: 127.1 }).select("id").single();
    if (pl2.error) throw new Error(`seed place2: ${pl2.error.message}`);
    place2Id = pl2.data.id as string;
    // place ที่ 3 — สำหรับ positive control ของ deleted_at xfail (แยกไม่ให้ชน place2)
    const pl3 = await admin.from("catalog_places").insert({ city_id: ci.data.id, legacy_slug: placeSlug3, category: "food", lat: 37.7, lng: 127.2 }).select("id").single();
    if (pl3.error) throw new Error(`seed place3: ${pl3.error.message}`);
    place3Id = pl3.data.id as string;
    // place ที่ 4 — สำหรับยืนยันว่า fix 0027896 ไม่แตะ tombstone (แยกไม่ให้ชน place2/xfail)
    const pl4 = await admin.from("catalog_places").insert({ city_id: ci.data.id, legacy_slug: placeSlug4, category: "food", lat: 37.8, lng: 127.3 }).select("id").single();
    if (pl4.error) throw new Error(`seed place4: ${pl4.error.message}`);
    place4Id = pl4.data.id as string;
  }

  beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false }, realtime: noRealtime() });
    // 🔴 fixture lock ย้ายไป globalSetup (per-run · ①b (a)) — ห้ามเรียก acquireFixtureLock ที่นี่ (ด่าน source บังคับ)
    await seedCatalog();
    const a = await makeUser("a");
    aClient = a.client;
    const b = await makeUser("b"); // B ไม่เป็นสมาชิกทริป A — มีทริปตัวเองไว้ให้ soleTrip ไม่พัง
    bClient = b.client;
    tripA = await mkTrip(a.client, "a");
    tripB = await mkTrip(b.client, "b");
    // 🔴 forward-compat กับ migration `create_trip_makes_days` ที่จอด pending-review (P1/P3):
    //    หลัง migration ลง create_trip จะสร้าง trip_days ให้เอง → insert วันซ้ำจะชน `trip_days_unique_date`
    //    → อ่านวันที่มีอยู่ก่อน ถ้าไม่มีค่อย insert · robust ทั้งก่อน/หลัง migration ลง (ไม่ต้องแก้เทสต์ตอนมันลง)
    const existDay = await a.client.from("trip_days").select("id").eq("trip_id", tripA).order("date").limit(1).maybeSingle();
    if (existDay.error) throw new Error(`read day: ${existDay.error.message}`);
    if (existDay.data) {
      aDay = existDay.data.id as string;
    } else {
      // grant ราย column: id,trip_id,date,timezone,city_id — ห้ามส่งอื่น (created_at/updated_at เป็นของเซิร์ฟเวอร์)
      const dayIns = await a.client
        .from("trip_days")
        .insert({ trip_id: tripA, date: "2026-10-12", timezone: "Asia/Seoul" })
        .select("id")
        .single();
      if (dayIns.error) throw new Error(`mkDay: ${dayIns.error.message}`);
      aDay = dayIns.data.id as string;
    }
    // admin (service_role) ไม่มี grant บน trip_plans → อ่านด้วย client ของ A (เจ้าของ · ผ่าน RLS)
    const planRow = await aClient.from("trip_plans").select("id").eq("trip_id", tripA).single();
    if (planRow.error) throw new Error(`read plan: ${planRow.error.message}`);
    aPlan = planRow.data.id as string;
    aCookies = await captureCookies(a.session);
    bCookies = await captureCookies(b.session);
    // C = viewer สมาชิกของทริป A — owner (A) เชิญผ่าน RLS (trip_members_insert: trip_role='owner')
    // ต่างจาก B ที่ไม่เป็นสมาชิก → probe members ต้องพิสูจน์ทั้งสองกิ่ง: สมาชิกเห็น · คนนอกไม่เห็น
    const cUser = await makeUser("c");
    const cInv = await aClient.from("trip_members").insert({ trip_id: tripA, user_id: ids.c, role: "viewer" });
    if (cInv.error) throw new Error(`invite C viewer: ${cInv.error.message}`);
    cCookies = await captureCookies(cUser.session);
    // D = editor ของ tripA — เดิมเพิ่มมาเพื่อเคส cover (ถูกถอนแล้ว) · **เก็บไว้** เพราะ members probe
    // ใช้ยืนยันว่า viewer เห็นสมาชิกครบทั้ง 3 role ไม่ใช่แค่ owner+ตัวเอง
    // 🔴 **เก็บคุกกี้ของ D ตั้งแต่ 4 ก.ย. 2026** (เดิมทิ้ง เพราะเคสที่ใช้มันถูกถอนไป)
    //    บล็อก `E5` ท้ายไฟล์ต้องยิงในนาม *editor* — `trips_update` จำกัด `owner` ต่างจากตารางลูกทุกใบ
    //    ⇒ **โพรบด้วยคนนอกทริปอย่างเดียวจะเขียวโดยไม่ได้แตะเส้นที่ต่างกันจริง** (P1 กำชับข้อนี้)
    const dUser = await makeUser("d");
    dCookies = await captureCookies(dUser.session);
    const dInv = await aClient.from("trip_members").insert({ trip_id: tripA, user_id: ids.d, role: "editor" });
    if (dInv.error) throw new Error(`invite D editor: ${dInv.error.message}`);
    // จุดหมาย 1 ใบบน tripA — ให้เคส GET /trips มี destinations ให้ owner เห็น (A = owner → can_write_trip)
    const destIns = await aClient.from("trip_destinations").insert({ trip_id: tripA, city_id: cityId, rank: 1 });
    if (destIns.error) throw new Error(`seed destination: ${destIns.error.message}`);
  });

  afterAll(async () => {
    const userIds = Object.values(ids);
    if (tripA) {
      for (const t of CHILD_TABLES) {
        const { error } = await admin.from(t).delete().eq("trip_id", tripA);
        if (error) console.warn(`cleanup ${t}: ${error.message}`);
      }
    }
    if (userIds.length) {
      const { error } = await admin.from("trips").delete().in("created_by", userIds);
      if (error) console.warn(`cleanup trips: ${error.message}`);
    }
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup user ${id}: ${error.message}`);
    }
    await purgeCatalog();
  });

  it("pin: GET /api/engine/trips = 200 (กันถอย fae94fe — helper อ้างคอลัมน์ที่ไม่มี = 502)", async () => {
    jar.cookies = aCookies;
    const res = await tripsGET(new NextRequest("http://localhost:3300/api/engine/trips"));
    expect(
      res.status,
      `ควร 200 · 502 = helper อ้างคอลัมน์ที่ไม่มี (แบบ trips.name เดิม): ${await res.clone().text()}`,
    ).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body).includes(tripA), "A ควรเห็นทริปตัวเองในรายการ").toBe(true);
  });

  /**
   * GET /trips — owner เห็น destinations + memberCount ≥ 1 · **เส้นทางที่ service_role เดินไม่ได้** (P1 · `f6d74ee`)
   * helper ฝัง `trip_destinations` + `trip_members(count)` ที่ผูก grant ของ `authenticated` เท่านั้น →
   * `service_role` ยิงตรงเห็นรูปถูก แต่ **ไม่เคยมีใครเดินด้วย session ผู้ใช้จริง** · เคสนี้เดินเส้นนั้น
   * 🔴 เคสฝั่งบวก: ถ้า embed ฝั่งไหนกรอง/พังเงียบ owner จะได้ `destinations: []` / `memberCount: 0`
   *    ซึ่งอ่านเหมือน "ทริปว่าง" ไม่ใช่ "อ่านไม่ได้" — assert เนื้อจริง (มีจุดหมาย · สมาชิก ≥1)
   */
  it("🔴 GET /trips (session จริงของ A) — owner เห็น destinations + memberCount ≥ 1", async () => {
    jar.cookies = aCookies;
    const res = await tripsGET(new NextRequest("http://localhost:3300/api/engine/trips"));
    expect(res.status, `ควร 200: ${await res.clone().text()}`).toBe(200);
    const body = (await res.json()) as Array<{ id: string; destinations: unknown[]; memberCount: number }>;
    const mine = body.find((t) => t.id === tripA);
    expect(mine, "A ไม่เห็นทริปตัวเองใน GET /trips").toBeDefined();
    expect(
      mine!.destinations.length,
      "owner เห็น destinations ว่าง ทั้งที่เพิ่งเพิ่มจุดหมาย = อ่าน trip_destinations ไม่ได้ผ่านเส้นผู้ใช้จริง",
    ).toBeGreaterThan(0);
    expect(
      mine!.memberCount,
      "memberCount 0 เป็นไปไม่ได้จริง (ทุกทริปมีเจ้าของ ≥1) → 0 = อ่าน trip_members ไม่ได้ ไม่ใช่ทริปไม่มีคน",
    ).toBeGreaterThanOrEqual(1);
  });


  /**
   * `GET /api/engine/places` — **แยก "เมืองว่าง" ออกจาก "ไม่มีเมืองนี้"** (P1 ขอ · `3d5e88d`)
   *
   * ## ทำไมเคสนี้ต้องมี และทำไมมันต้องอยู่ที่นี่
   * P2 ไล่ยิงครบทั้ง **42 เมืองที่ `supported`** เพื่อหาคู่ควบคุม แล้วพบว่า **ทั้ง 42 มีสถานที่หมด**
   * → **เส้น "เมืองมีจริงแต่ยังไม่มีสถานที่" เข้าไม่ถึงเลยจากฝั่ง API** เพราะเมืองที่ว่างจริง
   *   อยู่ใต้รหัสประเทศสงวนซึ่ง `supported` กรองออกจาก `/cities` ไปแล้ว
   * 🎯 **หลักฐานของพฤติกรรมนี้จึงมีชั้นเดียว คือโค้ด** — เคสนี้คือชั้นที่สอง และเป็นทางเดียวที่เหลือ
   *
   * ## 🔴 ความเสี่ยงที่เป็นรูปธรรม (P1 ตั้งไว้ · ผมเห็นด้วย)
   * ถ้ามีคนแก้ `catalogCityExists()` ให้ join `catalog_places` ด้วยเหตุผลว่า *"รวมเป็นคิวรีเดียวประหยัดกว่า"*
   * → **เมืองจริงที่ยังไม่ได้ seed จะได้ `404` ทั้งที่ควรได้ `200 []`**
   * · และอาการจะโผล่ตอน **เพิ่มเมืองใหม่ก่อน seed สถานที่** — ซึ่งเป็นลำดับที่เกิดตามธรรมชาติ
   *   (P1 ทำแบบนั้นเองกับญี่ปุ่นวันนี้: ลงเมือง 22 ใบก่อน ลงสถานที่ทีหลัง)
   *
   * ## ⚠️ คู่ควบคุมในรอบเดียวกัน **จำเป็น ไม่ใช่ของแถม**
   * *"ได้ `200 []`"* แยกไม่ออกจาก *"เช็คไม่ทำงานเลย แล้วคืน `[]` ทุกกรณี"*
   * → ต้องมี `uuid` ที่ไม่มีจริงคู่กัน **ที่ได้ `404`** ถึงจะพิสูจน์ว่ากลไกแยกสองกรณีออกจริง
   * (กฎเดียวกับ `q="ทดสอบ"` — **ผลลัพธ์ที่คาดหวังเป็นศูนย์ ต้องมีคู่ที่พิสูจน์ว่ากลไกยังทำงาน**)
   *
   * 📌 เคสนี้ **ไม่ใช่เคสยิงข้ามผู้ใช้** — อยู่ไฟล์นี้เพราะ harness ยิง route จริง in-process
   *    และ fixture มีเมืองที่ไม่มีสถานที่อยู่แล้ว (`cityId2` จากบล็อก `cityIds`)
   */
  it("🔴 places: เมืองมีจริงแต่ไม่มีสถานที่ → 200 [] · uuid ที่ไม่มีจริง → 404 (คู่ควบคุมรอบเดียวกัน)", async () => {
    jar.cookies = aCookies;
    const call = (id: string) =>
      placesGET(new NextRequest(`http://localhost:3300/api/engine/places?cityId=${id}`));

    // ① เมืองที่ seed ไว้จริงแต่ไม่เคยใส่สถานที่ (cityId2 — บล็อก cityIds สร้างไว้ ไม่มี catalog_places)
    const empty = await call(cityId2);
    expect(empty.status, `เมืองว่างควร 200 · 404 = เช็คไปแตะ catalog_places แล้ว: ${await empty.clone().text()}`).toBe(200);
    expect(await empty.json(), "เมืองที่ไม่มีสถานที่ต้องได้ลิสต์ว่าง").toEqual([]);

    // ② คู่ควบคุม — ถ้าข้อนี้ได้ 200 [] ด้วย แปลว่าเช็ค "เมืองมีจริงไหม" ไม่ทำงานเลย
    //    และข้อ ① ข้างบนก็ไม่ได้พิสูจน์อะไร (เขียวเพราะคืน [] ทุกกรณี)
    const ghost = await call("00000000-0000-4000-8000-000000000000");
    expect(
      ghost.status,
      `uuid ที่ไม่มีจริงควร 404 · ถ้าได้ 200 [] = แยก "เมืองว่าง" กับ "ไม่มีเมือง" ไม่ออก: ${await ghost.clone().text()}`,
    ).toBe(404);
  });


  /**
   * 🔴 `D70` ผ่าน route — **ชี้ custom place ของทริปอื่นไม่ได้** · กิ่งที่ไม่มีเคยมีเคสไหนเดินเลย
   *
   * ## ช่องที่เคสนี้ปิด
   * `stops POST` (`route.ts:42-47`) รับ `placeId` เป็น uuid แล้ว **ใส่ลง `custom_place_id` ตรง ๆ
   * โดยไม่ตรวจว่ามันเป็นของทริปนี้ไหม** — และนั่น**ถูกต้องตาม `D38`** (ไม่ตรวจซ้ำสิ่งที่ฐานตรวจ)
   * → ตัวที่กันจริงคือ **composite FK** `trip_stops_custom_place_fk (trip_id, custom_place_id)`
   *   (`20260825140656:114`) · **ฐานคือด่านเดียวที่ยืนอยู่ตรงนี้**
   *
   * 🔴 **แต่ไม่มีเคยมีเคสไหนเดินกิ่งนี้เลย** — `rlsMatrix` เคส `D70` ครอบ *แผน+วัน* ข้ามทริป
   *    **ไม่ได้ครอบ `custom_place`** · และ `engineCrossUser` ก็ไม่เคยยิงเส้นนี้
   * → ถ้ามีคนเปลี่ยน FK ประกอบเป็น FK เดี่ยวบน `custom_place_id` ด้วยเหตุผลว่า *"ง่ายกว่า"*
   *   **การชี้ข้ามทริปจะสำเร็จเงียบ ๆ** และไม่มีอะไรจับได้
   *
   * ## 🎯 คู่ในเคสเดียว — ต่างกันแค่ *เจ้าของ* ของ placeId
   * ยิงคำสั่งเดียวกันสองครั้ง ต่างกันที่ uuid ที่ส่ง: **ของตัวเอง → 201 · ของทริปอื่น → ถูกปฏิเสธ**
   * ถ้าไม่มีข้อแรก *"ถูกปฏิเสธ"* อาจแปลว่า **route ปฏิเสธ placeId ทุกตัว** ซึ่งพิสูจน์คนละเรื่องกันเลย
   */
  it("🔴 D70 ผ่าน route — A ชี้ custom place ของทริป B ไม่ได้ (ของตัวเอง 201 · ของคนอื่นถูกปฏิเสธ)", async () => {
    // ① control: custom place ของ tripA เอง → เพิ่มเป็นจุดแวะได้
    const mine = await postAs(aCookies, tripA, customPlacesPOST, {
      city: citySlug, category: "food", maps_query: "q-own", name_th: `own-${stamp}`, lat: 37.5, lng: 127.0,
    });
    expect(mine.status, `สร้าง custom place ของ A ควร 201: ${await mine.clone().text()}`).toBe(201);
    const ownId = ((await mine.json()) as { id: string }).id;
    const okStop = await postAs(aCookies, tripA, stopsPOST, { planId: aPlan, tripDayId: aDay, placeId: ownId });
    expect(
      okStop.status,
      `ชี้ custom place ของทริปตัวเองควร 201 — ถ้าแดง เคส ② ข้างล่างไม่ได้พิสูจน์ว่ากันข้ามทริป: ${await okStop.clone().text()}`,
    ).toBe(201);

    // ② B สร้าง custom place ใน **ทริปของ B เอง** (ถูกต้องตามสิทธิ์ของ B)
    const theirs = await postAs(bCookies, tripB, customPlacesPOST, {
      city: citySlug, category: "food", maps_query: "q-b", name_th: `b-${stamp}`, lat: 37.6, lng: 127.1,
    });
    expect(theirs.status, `B สร้าง custom place ในทริปตัวเองควร 201: ${await theirs.clone().text()}`).toBe(201);
    const foreignId = ((await theirs.json()) as { id: string }).id;

    // 🔴 A ชี้ของ B ในทริปของ A — composite FK ต้องปฏิเสธ
    const bad = await postAs(aCookies, tripA, stopsPOST, { planId: aPlan, tripDayId: aDay, placeId: foreignId });
    const badBody = await bad.clone().text();
    // ⚠️ **ไม่ใช้ `verdictFor()` ที่นี่ และเหตุผลสำคัญกว่าตัวเคส** — ตัวนั้นแปล `400` เป็น `server-bug`
    //    ซึ่ง**ถูกสำหรับ probe ที่มันถูกสร้างมาเพื่อ** (B เขียนใส่ทริป A → การปฏิเสธหน้าตาเป็น 401/403/404
    //    ส่วน 400 แปลว่าเราส่ง args ผิด = บั๊กเรา) · **แต่ผิดสำหรับเส้นนี้**: route แปลง FK violation
    //    (`23503`) เป็น **`400` โดยตั้งใจ** (`stops/route.ts:77`) → `400` คือ*การปฏิเสธที่ถูกต้อง* ตรงนี้
    // 🎯 **ตัวจำแนกที่ใช้ร่วมกัน ฝังสมมติฐานว่า "การปฏิเสธหน้าตาเป็นยังไง" ไว้ข้างใน** — และสมมติฐานนั้น
    //    ไม่จริงกับทุก endpoint · ใช้ผิดที่แล้วมันจะรายงาน **ของที่ทำงานถูกว่าเป็นบั๊ก** (ผมโดนเองรอบแรก)
    expect(
      bad.status,
      `A ชี้ custom place ของทริป B ควรได้ 400 (FK 23503 → 400) · ได้ ${bad.status}: ${badBody}\n` +
        "  🔴 2xx = FK ประกอบ (trip_id, custom_place_id) ไม่ได้กัน — สถานที่ของทริปอื่นถูกอ้างเข้ามาในแผนได้\n" +
        "  🔴 502 = FK ปฏิเสธจริงแต่ route แปลรหัสไม่ออก — กันได้แต่ผู้ใช้ได้ข้อความที่อ่านไม่รู้เรื่อง",
    ).toBe(400);

    // ③ ยืนยันที่ฐาน: ไม่มีแถวไหนในทริป A ชี้ไปที่ custom place ของ B (ไม่เชื่อแค่ status)
    const { data, error } = await admin.from("trip_stops").select("id").eq("trip_id", tripA).eq("custom_place_id", foreignId);
    if (error) throw new Error(`admin อ่าน trip_stops: ${error.message}`);
    expect(data ?? [], "ถูกปฏิเสธแต่มีแถวเกิดขึ้นจริง = ปฏิเสธที่ผิวแต่เขียนลงไปแล้ว").toEqual([]);
  });

  /**
   * 🔴 **`E5-AC10` — เส้นทางที่สองของการเพิ่มจุดแวะ: *คลังสถิตย์* (slug)**
   * เจ้าของ: P1-Lead · 2 ก.ย. 2026
   *
   * เกณฑ์ของ `E5-AC10` เขียนไว้เองว่า **"ห้ามติ๊กผ่านทั้งข้อโดยวัดแค่ทางเดียว"**
   * · ไล่แล้ววันนี้: `stopsPOST` ถูกยิงในไฟล์นี้ **3 จุด และทั้งสามใช้ uuid ของ custom place**
   * 🎯 **ทางคลังไม่เคยถูกยิงผ่าน route เลยสักครั้ง** — ทั้งที่ fixture (`placeSlug`) มีอยู่แล้วในไฟล์นี้
   *
   * ## 🔴 สองกิ่งนี้แยกกันที่ `route.ts:263-266` และเลือกผิดกิ่งได้เงียบ
   * ```ts
   * const { data: cat } = await catalogPlaceIdBySlug(db, placeId);
   * if (cat) row.catalog_place_id = cat.id;
   * else if (UUID.test(placeId)) row.custom_place_id = placeId;
   * ```
   * · **ถ้าคลังหา slug ไม่เจอ** → ตกกิ่งสอง → `UUID.test("exp-123")` เป็นเท็จ → **ไม่มีคอลัมน์ไหนถูกตั้ง**
   *   → `check (num_nonnulls(catalog_place_id, custom_place_id) = 1)` ปฏิเสธ → `400 "ไม่รู้จักสถานที่"`
   * 🎯 **เคสนี้จึงพิสูจน์ทั้ง *สะพาน slug→id ทำงาน* และ *ลงคอลัมน์ถูกใบ*** — สองอย่างที่ทางuuid ตอบไม่ได้
   */
  it("🔴 E5-AC10 — เพิ่มจุดแวะด้วย slug ของคลัง ต้องลง `catalog_place_id` ไม่ใช่ `custom_place_id`", async () => {
    const res = await postAs(aCookies, tripA, stopsPOST, {
      planId: aPlan, tripDayId: aDay, placeId: placeSlug,
    });
    expect(
      res.status,
      `เพิ่มจุดแวะด้วย slug คลังควร 201 · 400 = สะพาน slug→catalog_place_id ไม่ทำงาน: ${await res.clone().text()}`,
    ).toBe(201);

    // 🔴 ยืนยันที่ฐาน ไม่เชื่อแค่ status — 201 บอกว่า "แถวเกิด" ไม่ได้บอกว่า "ลงคอลัมน์ถูกใบ"
    const stopId = ((await res.json()) as { id: string }).id;
    const { data, error } = await admin
      .from("trip_stops")
      .select("catalog_place_id, custom_place_id")
      .eq("id", stopId)
      .single();
    if (error) throw new Error(`admin อ่าน trip_stops: ${error.message}`);
    expect(data.catalog_place_id, "slug ของคลังไม่ได้ลง catalog_place_id").not.toBeNull();
    expect(
      data.custom_place_id,
      "🔴 slug ของคลังไปลง custom_place_id — กิ่งเลือกผิด และ FK จะไม่ฟ้องเพราะคอลัมน์นี้รับ uuid ใดก็ได้",
    ).toBeNull();
  });

  /**
   * ⚠️ **เคสควบคุมของเคสบน** — ถ้า route ตอบ `201` ให้ `placeId` ทุกตัว
   * เคสบนจะเขียวโดยไม่พิสูจน์ว่าสะพาน slug ทำงาน
   */
  it("slug ที่ไม่มีในคลังต้องถูกปฏิเสธ — ไม่ใช่ผ่านแล้วได้แถวเปล่า", async () => {
    const res = await postAs(aCookies, tripA, stopsPOST, {
      planId: aPlan, tripDayId: aDay, placeId: `ไม่มีสลักนี้-${stamp}`,
    });
    expect(res.status, "รับ slug ที่ไม่มีในคลัง = แถวที่ไม่มีใครรู้ว่าชี้ที่ไหน").not.toBe(201);
  });

  function postTrip(cookies: Cookie[], body: unknown): Promise<Response> {
    jar.cookies = cookies;
    const req = new NextRequest("http://localhost:3300/api/engine/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return tripsPOST(req);
  }
  const tripDates = { startDate: "2026-10-11", endDate: "2026-10-21" };

  /**
   * POST /trips + cityIds (P1 · `7230241`) — เส้นเขียน trip_destinations ที่ยังไม่มีใครยิง
   * 🔴 ทางบวก: rank ต้องเรียง **ตามลำดับที่ส่ง** (route ตัดซ้ำแต่รักษาลำดับแรก · เรียงใหม่ = บั๊ก · ผู้ใช้จัดเอง)
   */
  it("🔴 POST /trips + cityIds — จุดหมายครบ + rank เรียงตามลำดับที่ส่ง (ไม่เรียงใหม่)", async () => {
    // ส่งลำดับที่ *ไม่* เรียงตาม cityId → ถ้า GET คืนลำดับนี้ = รักษาลำดับส่ง · ถ้าคืนเรียง = บั๊ก
    const sorted = [cityId, cityId2, cityId3].sort();
    const sendOrder = [sorted[2], sorted[0], sorted[1]];
    const res = await postTrip(aCookies, { title: `dest-order-${stamp}`, ...tripDates, cityIds: sendOrder });
    expect(res.status, `POST ควร 201: ${await res.clone().text()}`).toBe(201);
    const created = (await res.json()) as { id: string; destinationsError?: string };
    expect(created.destinationsError, "เมืองจริงทั้งหมด ไม่ควรมี destinationsError").toBeUndefined();

    const getRes = await tripsGET(new NextRequest("http://localhost:3300/api/engine/trips"));
    const list = (await getRes.json()) as Array<{ id: string; destinations: { cityId: string }[] }>;
    const mine = list.find((t) => t.id === created.id);
    expect(mine, "ไม่เห็นทริปที่เพิ่งสร้างใน GET /trips").toBeDefined();
    expect(
      mine!.destinations.map((d) => d.cityId),
      "ลำดับ destinations ไม่ตรงกับที่ส่ง = rank ถูกเรียงใหม่ (บั๊ก — ผู้ใช้จัดลำดับเมืองเอง)",
    ).toEqual(sendOrder);
  });

  /**
   * 🔴 ทางที่ P1 ห่วงกว่า — **ความล้มเหลวครึ่งทาง**: จุดหมายเขียนนอกธุรกรรมของ create_trip
   * เขียนล้ม → ยังคืน 201 (ทริปเกิดจริง) + แนบ `destinationsError` · **เคสฝั่งบวกของความล้มเหลว**
   * ถ้าไม่ยิง เราไม่รู้เลยว่าสัญญาณถูกส่งจริงหรือถูกกลืน (อาการเดียวกับ "บันทึกแล้วไม่เปลี่ยน")
   */
  it("🔴 POST /trips + cityIds uuid ถูกรูปแต่ไม่มีในคลัง — 201 + destinationsError (FK) + ทริปยังใช้ได้", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000"; // uuid ถูกรูป ไม่มีในคลัง → FK ปฏิเสธ
    const res = await postTrip(aCookies, { title: `dest-fail-${stamp}`, ...tripDates, cityIds: [ghost] });
    expect(res.status, `ควร 201 (ทริปเกิดแม้จุดหมายล้ม): ${await res.clone().text()}`).toBe(201);
    const body = (await res.json()) as { id: string; destinationsError?: string };
    expect(
      body.destinationsError,
      "จุดหมายล้มแต่ไม่มี destinationsError = สัญญาณถูกกลืน · ผู้ใช้ไม่รู้ว่าเมืองที่เลือกหาย",
    ).toBeTruthy();

    const getRes = await tripsGET(new NextRequest("http://localhost:3300/api/engine/trips"));
    const list = (await getRes.json()) as Array<{ id: string; destinations: unknown[] }>;
    const mine = list.find((t) => t.id === body.id);
    expect(mine, "ทริปหายหลังจุดหมายล้ม = ครึ่งทางพัง (ทริปควรอยู่ใช้งานได้)").toBeDefined();
    expect(mine!.destinations, "จุดหมายล้ม → destinations ควรว่าง (ไม่ใช่บางส่วน)").toEqual([]);
  });

  /** uuid ถูกรูป n ใบ *ต่างกันทุกใบ* — route ตัดซ้ำก่อนนับ ส่งตัวเดียวกัน n ครั้งจะเหลือ 1 ไม่ทริกเกอร์เพดาน */
  const ghostUuids = (n: number) =>
    Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`);

  it("POST /trips รูป cityIds ผิด → 400 (ไม่ใช่ array · uuid ผิดรูป · เกินเพดาน)", async () => {
    expect((await postTrip(aCookies, { title: `bad1-${stamp}`, ...tripDates, cityIds: "notarray" })).status, "cityIds ไม่ใช่ array").toBe(400);
    expect((await postTrip(aCookies, { title: `bad2-${stamp}`, ...tripDates, cityIds: ["not-a-uuid"] })).status, "uuid ผิดรูป").toBe(400);
    const over = await postTrip(aCookies, {
      title: `bad3-${stamp}`, ...tripDates, cityIds: ghostUuids(MAX_TRIP_DESTINATIONS + 1),
    });
    expect(over.status, `เกินเพดาน ${MAX_TRIP_DESTINATIONS} เมือง ควร 400`).toBe(400);
  });

  /**
   * 🔴 **เคสควบคุมของเพดาน — *ขอบพอดี* ต้องผ่าน** (P4 · 4 ก.ย. 2026)
   *
   * เคสข้างบนยิงแค่ฝั่ง `เกิน → 400` · **ฝั่งเดียวนั้นเขียวได้กับเพดานทุกค่าที่เล็กกว่า `MAX+1`**
   * รวมถึงเพดานที่พังเป็น `1` ⇒ **เทสต์จะยังเขียว ขณะที่ผู้ใช้เลือกเมืองที่สองไม่ได้**
   * 🎯 ***"ปฏิเสธของที่ควรปฏิเสธ" พิสูจน์ไม่ได้ว่า "ไม่ปฏิเสธของที่ควรผ่าน" — ต้องมีคู่***
   * (`§3.4`: เคสควบคุมที่ป้อน *ตัวที่ถูกต้อง* แล้ว assert ว่า **ไม่** ถูกจับ)
   *
   * ⚠️ ใช้ uuid ที่ไม่มีในคลัง ⇒ จุดหมายจะล้มที่ FK **ซึ่งไม่เป็นไร**: `POST` คืน `201` + `destinationsError`
   *    (พฤติกรรมที่เคส `dest-fail` ข้างบนตรึงไว้แล้ว) · สิ่งที่เคสนี้วัดคือ **ด่านเพดานไม่ยิง** เท่านั้น
   */
  it("🔴 POST /trips — จำนวนเมือง *เท่ากับ* เพดานพอดี ต้องไม่ถูกปฏิเสธ (คู่ควบคุมของเคสบน)", async () => {
    const res = await postTrip(aCookies, {
      title: `edge-${stamp}`, ...tripDates, cityIds: ghostUuids(MAX_TRIP_DESTINATIONS),
    });
    const body = await res.clone().text();
    expect(
      res.status,
      `ส่ง ${MAX_TRIP_DESTINATIONS} เมือง (= เพดานพอดี) ควรผ่านด่านเพดาน · ได้ ${res.status}: ${body}\n` +
        "  🔴 400 ที่นี่ = เพดานแคบไปหนึ่ง (off-by-one) — เคส 'เกินเพดาน' ข้างบนจะเขียวอยู่ดี",
    ).toBe(201);
  });


  /**
   * members GET (route ตัวที่ 10) — **บวกสำคัญกว่าลบ** (P1/P4 · 27 ส.ค. 2026)
   * · ลบ: B (คนนอก) ยิง → ได้ `[]` ไม่ใช่รายชื่อ · leak = รู้ว่าใครอยู่ในทริปใคร (social graph)
   * · บวก: C (viewer สมาชิก) ยิง → **ต้องเห็น owner+ตัวเอง** · ถ้าเห็น [] ด้วย = RLS แคบเกินจนแถว avatar ตาย
   *   → กิ่งบวกคือกันไม่ให้ "ปลอดภัยเพราะบล็อกทุกคน" ผ่านเป็นสีเขียว (กับดักข้อ 3 ของ rlsMatrix รูปเดียวกัน)
   * · คนนอกได้ 200+[] ไม่ใช่ 403 โดยตั้งใจ (route: 403 = เครื่องมือถามว่าทริปมีอยู่ไหม) — ยืนยันรหัสด้วย
   */
  it("members GET — viewer(สมาชิก) เห็น owner+ตัวเอง · คนนอกได้ [] (ไม่ใช่ 403 · ไม่รั่ว social graph)", async () => {
    // กิ่งบวก: C = viewer สมาชิก → เห็นรายชื่อ
    const cRes = await callAs(cCookies, tripA, membersGET, "GET");
    expect(
      cRes.status,
      `viewer ควร 200 · 502 = helper บั๊ก (แบบ trips.name เดิม): ${await cRes.clone().text()}`,
    ).toBe(200);
    const cBody = (await cRes.json()) as { userId: string; role: string; displayName: string | null }[];
    const byId = new Map(cBody.map((m) => [m.userId, m]));
    expect(
      [...byId.keys()].sort(),
      "viewer ต้องเห็นสมาชิกครบ (owner+viewer+editor = 3 คน) — เห็นน้อยกว่านี้ = policy แคบเกินจนแถวสมาชิกตาย",
    ).toEqual([ids.a, ids.c, ids.d].sort());
    expect(byId.get(ids.a)?.role, "A ต้องเป็น owner").toBe("owner");
    expect(byId.get(ids.c)?.role, "C ต้องเป็น viewer").toBe("viewer");
    expect(byId.get(ids.d)?.role, "D ต้องเป็น editor").toBe("editor");
    // 🔴 displayName ต้องเป็น *ชื่อจริงของ A* ไม่ใช่ null — พิสูจน์ RLS **ชั้นที่สอง** (P1 · 27 ส.ค.)
    //    route พึ่งสองชั้นแยกกัน: trip_members_select (can_read_trip) คุมว่าเห็น *แถว* ไหน ·
    //    profiles_select (shares_trip_with) คุมว่าเห็น *ชื่อ* ไหน · ชั้นแรกผ่านชั้นสองไม่ผ่าน =
    //    ได้แถวแต่ displayName=null ซึ่งอ่านเหมือน "A ยังไม่ตั้งชื่อ" ไม่ใช่ "C อ่านชื่อ A ไม่ได้" (bug เงียบ)
    //    ชื่อ default = local-part ของ email (handle_new_user: split_part(email,'@',1)) → เดาได้แน่นอน
    expect(
      byId.get(ids.a)?.displayName,
      "C (viewer) ต้องเห็นชื่อจริงของ A ผ่าน shares_trip_with — null = ชั้นที่สองกันชื่อไว้ (ฟีเจอร์ตายเงียบ)",
    ).toBe(`xu-a-${stamp}`);
    expect(byId.get(ids.c)?.displayName, "C เห็นชื่อตัวเองผ่าน id=uid").toBe(`xu-c-${stamp}`);

    // กิ่งลบ: B = คนนอกทริป A → RLS สองชั้น (trip_members_select + profiles_select) กรอง → 200 + []
    const bRes = await callAs(bCookies, tripA, membersGET, "GET");
    expect(bRes.status, "คนนอกได้ 200+[] ไม่ใช่ 403 — 403 กลายเป็นเครื่องมือถามว่าทริปมีอยู่ไหม").toBe(200);
    const bBody = (await bRes.json()) as { userId: string }[];
    expect(
      bBody.map((m) => m.userId),
      "คนนอกเห็นสมาชิกแม้แต่คนเดียว = รั่ว social graph (ใครอยู่ในทริปใคร)",
    ).toEqual([]);
  });

  it("bookings POST — B สร้างในทริป A ไม่ได้", async () => {
    await createBlockedForB({
      label: "bookings", handler: bookingsPOST,
      bodyA: { title: "xu-a", category: "hotel" }, bodyB: { title: "xu-b", category: "hotel" },
      table: "bookings", col: "title", valueA: "xu-a", valueB: "xu-b",
    });
  });

  it("checklist POST — B สร้างในทริป A ไม่ได้", async () => {
    await createBlockedForB({
      label: "checklist", handler: checklistPOST,
      bodyA: { text: "xu-a", category: "todo" }, bodyB: { text: "xu-b", category: "todo" },
      table: "checklist_items", col: "text", valueA: "xu-a", valueB: "xu-b",
    });
  });

  it("days PATCH — B แก้ overnight ของวัน A ไม่ได้", async () => {
    // control: A แก้วันตัวเองได้ (พิสูจน์ route ไม่ได้พังทุกคน)
    const aRes = await callAs(aCookies, tripA, daysPATCH, "PATCH", { dayId: aDay, kind: "undecided" });
    expect(aRes.status, `control A ควร 200: ${aRes.status} ${await aRes.clone().text()}`).toBe(200);
    // snapshot แถว trip_day หลัง A แก้ (admin · P-72 — คนละเจ้าของกับ route)
    const before = await admin.from("trip_days").select("*").eq("id", aDay).single();
    if (before.error) throw new Error(`admin read trip_day: ${before.error.message}`);
    // attack: B แก้วันของ A
    const bRes = await callAs(bCookies, tripA, daysPATCH, "PATCH", { dayId: aDay, kind: "none" });
    const { verdict, detail } = await verdictFor(bRes);
    expect(verdict, `[days] B → **${verdict}** (${detail}) · rejected=ด่านทำงาน · leak=แก้ได้ · server-bug=บั๊กเรา`).toBe("rejected");
    // แถวต้องไม่เปลี่ยนจากตอน A แก้ — เปลี่ยน = B แก้วันของ A สำเร็จ (leak)
    const after = await admin.from("trip_days").select("*").eq("id", aDay).single();
    expect(after.data, "[days] B แก้ trip_day ของ A สำเร็จ (leak)").toEqual(before.data);
  });

  /**
   * 🔴 **confused deputy — `tripId` ใน URL อนุญาต · `dayId` ใน body เลือกแถว** (P4 · 28 ส.ค. 2026)
   *
   * เคส `B แก้วันของ A ไม่ได้` ข้างบนยิง **คนนอก** · เคสนี้ยิง **คนที่มีสิทธิ์จริง**:
   * A เป็น *เจ้าของ* `tripA` → `guard(req, tripA)` ผ่านสนิท **แล้วชี้ `dayId` ไปที่ `tripB`**
   * · ถ้าสองค่านี้ไม่ถูกผูกกัน A จะแก้ทริปของ B ได้ทั้งที่ทุกด่านสิทธิ์บอกว่าถูกต้อง
   *
   * ปัจจุบันมีสองชั้น — `.eq("trip_id", tripId)` (`6fc0c9e`) และ RLS · **เคสนี้ยิงผลรวม แยกชั้นไม่ได้**
   * (ถอดชั้นใดชั้นหนึ่งออกเพื่อพิสูจน์อีกชั้น = แก้โค้ดจริงเพื่อให้เทสต์พูดได้มากขึ้น — ไม่คุ้ม)
   * 🎯 `daysPatchRoute.test.ts` ครอบ *สายไฟ* (route ส่ง tripId ของ URL ต่อ) · **เคสนี้ครอบ *ผลจริงที่ฐาน***
   */
  it("🔴 days PATCH — A แก้วันของทริป B ไม่ได้ แม้ URL ชี้ทริปที่ A เป็นเจ้าของ", async () => {
    // admin มี select บน trip_days (ข้อยกเว้นที่ 4) — ใช้หาวันของ B โดยไม่ต้องมี client ของ B
    const bDayRow = await admin.from("trip_days").select("id").eq("trip_id", tripB).order("date").limit(1).maybeSingle();
    if (bDayRow.error) throw new Error(`admin read tripB day: ${bDayRow.error.message}`);
    // 🔴 ไม่มีวันของ B = เคสนี้พิสูจน์อะไรไม่ได้เลย — ต้องล้ม ไม่ใช่ผ่านเงียบ (กับดักเซตว่าง)
    expect(bDayRow.data, "tripB ต้องมีวันอย่างน้อยหนึ่ง — ไม่มี = เคสนี้ยิงไปที่ว่าง").toBeTruthy();
    const bDay = bDayRow.data!.id as string;
    // 🔴 ยืนยันว่าเป้าเป็นวันของ *B จริง* — ถ้าบังเอิญเป็นวันของ A เคสจะเขียวโดยไม่ได้ยิงอะไรข้ามทริปเลย
    expect(bDay, "เป้าต้องไม่ใช่วันของ A").not.toBe(aDay);
    const owner = await admin.from("trip_days").select("trip_id").eq("id", bDay).single();
    if (owner.error) throw new Error(`admin read bDay owner: ${owner.error.message}`);
    expect(owner.data.trip_id, "เป้าต้องอยู่ใต้ tripB").toBe(tripB);

    // control ฝั่งบวก — A แก้วัน *ของตัวเอง* ได้ (ถ้าอันนี้แดง เคสโจมตีข้างล่างไม่ได้พิสูจน์อะไร)
    const okRes = await callAs(aCookies, tripA, daysPATCH, "PATCH", { dayId: aDay, kind: "undecided" });
    expect(okRes.status, `control A ควร 200: ${okRes.status} ${await okRes.clone().text()}`).toBe(200);

    const before = await admin.from("trip_days").select("*").eq("id", bDay).single();
    if (before.error) throw new Error(`admin read bDay: ${before.error.message}`);

    for (const [label, body] of [
      ["overnight", { dayId: bDay, kind: "none" }],
      ["cityId", { dayId: bDay, cityId }],
      ["ล้าง cityId", { dayId: bDay, cityId: null }],
    ] as const) {
      const res = await callAs(aCookies, tripA, daysPATCH, "PATCH", body);
      const { verdict, detail } = await verdictFor(res);
      expect(
        verdict,
        `[days/${label}] A ยิงวันของ B ผ่าน URL ของ tripA → **${verdict}** (${detail})\n` +
          `  rejected=ผูก tripId↔dayId ทำงาน · leak=แก้ทริปคนอื่นได้ · server-bug=บั๊กเรา`,
      ).toBe("rejected");
    }

    // 🎯 สถานะต้องไม่ขยับ — `rejected` อย่างเดียวยังไม่พอ ถ้าแถวเปลี่ยนแปลว่าเขียนสำเร็จแล้วค่อยตอบ error
    const after = await admin.from("trip_days").select("*").eq("id", bDay).single();
    expect(after.data, "[days] แถวของ tripB เปลี่ยน = A เขียนข้ามทริปสำเร็จ (leak)").toEqual(before.data);
  });

  // จับบั๊กที่ owner แก้ไม่ได้ (P4 พบ · P1 แก้ e5e0a42: upsert → update-then-insert · ไม่คืน update บนคีย์)
  // 🔴 daySettingsWrite.test.ts (fake db) พิสูจน์แค่คอลัมน์ที่ *ส่งออก* · ฐานยอมรับจริงไหม probe สดนี้เท่านั้น
  it("day-settings PUT — A แก้ตั้งค่าวันตัวเองได้ · B แก้ของแผน A ไม่ได้", async () => {
    const body = (locked: boolean) => ({ planId: aPlan, rows: [{ tripDayId: aDay, isLocked: locked }] });
    const aRes = await callAs(aCookies, tripA, daySettingsPUT, "PUT", body(true));
    expect(aRes.status, `control A ควร 200 (บั๊กเดิม = 403 permission denied): ${aRes.status} ${await aRes.clone().text()}`).toBe(200);
    // admin ไม่มี grant บนตารางนี้ → A อ่านของตัวเอง (checker คนละคนกับ route caller B · เพียงพอต่อ P-72)
    const key = () => aClient.from("trip_day_plan_settings").select("*").eq("plan_id", aPlan).eq("trip_day_id", aDay).maybeSingle();
    const before = await key();
    if (before.error) throw new Error(`read settings: ${before.error.message}`);
    const bRes = await callAs(bCookies, tripA, daySettingsPUT, "PUT", body(false));
    const { verdict, detail } = await verdictFor(bRes);
    expect(verdict, `[day-settings] B → **${verdict}** (${detail})`).toBe("rejected");
    const after = await key();
    expect(after.data, "[day-settings] B แก้ตั้งค่าของ A สำเร็จ (leak)").toEqual(before.data);
  });

  it("stops POST — B สร้างจุดแวะในแผน/วันของ A ไม่ได้", async () => {
    // kind hotel/intercity = ไม่ต้องมีสถานที่ (trip_stops_place_by_kind) → fixture แค่ plan+day
    const body = { planId: aPlan, tripDayId: aDay, kind: "hotel" };
    const aRes = await postAs(aCookies, tripA, stopsPOST, body);
    expect(aRes.status, `control A ควร 201: ${aRes.status} ${await aRes.clone().text()}`).toBe(201);
    const count = async () => {
      const { data, error } = await admin.from("trip_stops").select("id").eq("trip_day_id", aDay);
      if (error) throw new Error(`admin count trip_stops: ${error.message}`);
      return data.length;
    };
    const n1 = await count();
    const bRes = await postAs(bCookies, tripA, stopsPOST, body);
    // `stops:176` แปลง `23503` → `400` → ที่นี่ `400` คือการปฏิเสธ ไม่ใช่ probe พัง
    const { verdict, detail } = await verdictFor(bRes, { rejectStatuses: DB_REJECT_STATUSES });
    expect(verdict, `[stops] B → **${verdict}** (${detail})`).toBe("rejected");
    const n2 = await count();
    expect(n2, "[stops] จำนวนจุดแวะในวัน A เพิ่มหลัง B ยิง = B สร้างในทริป A สำเร็จ (leak)").toBe(n1);
  });

  it("hotels PUT — A บันทึกที่พักได้ (GET คืน country ไม่ null) · B บันทึกในทริป A ไม่ได้", async () => {
    const body = (name: string) => ({ checkIn: "2026-10-12", checkOut: "2026-10-14", city: citySlug, hotelName: name, lat: 37.5, lng: 127.0 });
    const aRes = await callAs(aCookies, tripA, hotelsPUT, "PUT", body("H-a"));
    expect(aRes.status, `control A ควร 200: ${aRes.status} ${await aRes.clone().text()}`).toBe(200);
    // 🔴 P1 ฝาก: country ต้องไม่ null — แยก "ลืมแมป city→country join" ออกจาก "ค่าเป็น null จริง"
    const gRes = await callAs(aCookies, tripA, hotelsGET, "GET");
    const hotels = (await gRes.json()) as { country: string | null; hotel_name: string }[];
    const mine = hotels.find((h) => h.hotel_name === "H-a");
    expect(mine?.country, `country ควรเป็น '${CC}' ไม่ใช่ null (join city→country หลุด?)`).toBe(CC);
    const bRes = await callAs(bCookies, tripA, hotelsPUT, "PUT", body("H-b"));
    const { verdict, detail } = await verdictFor(bRes);
    expect(verdict, `[hotels] B → **${verdict}** (${detail})`).toBe("rejected");
    const cnt = async () => {
      const { data, error } = await admin.from("trip_hotels").select("id").eq("trip_id", tripA);
      if (error) throw new Error(`admin count trip_hotels: ${error.message}`);
      return data.length;
    };
    expect(await cnt(), "[hotels] B บันทึกที่พักในทริป A สำเร็จ (leak)").toBe(1);
  });


  /**
   * `E5-AC10` — **เส้นทาง custom place ครบวง**: สร้าง → เพิ่มเป็นจุดแวะ → อ่านกลับได้ชื่อจริง
   *
   * ## ทำไมเส้นนี้ต้องมีเคสของตัวเอง (P1 ชี้ว่ายังไม่มีใครวัด)
   * จุดแวะที่ชี้ **คลังกลาง** กับชี้ **สถานที่ของทริป** เดินคนละคอลัมน์
   * (`catalog_place_id` / `custom_place_id`) และ `stops POST` แยกทางที่ `route.ts:42-47`:
   * `placeId` ที่เป็น *slug* → คลังกลาง · ที่เป็น *uuid* → custom place · **กิ่ง uuid ไม่เคยถูกยิงเลย**
   * → เส้นคลังกลางพังไม่ได้เงียบ ๆ (P2 เปิดดูในเบราว์เซอร์แล้ว) **แต่เส้น custom ตกหล่นได้โดยไม่มีใครเห็น**
   *
   * ## 🔴 อาการที่เคสนี้จับ: **"แถวเปล่า"**
   * `toDto()` (`stops/route.ts:49`) คืน `place_id = catalog slug ?? custom_place_id ?? ""`
   * → ถ้าเส้น custom หลุด จะได้ **`""` = "สถานที่ที่ UI ไม่รู้จัก"** · จุดแวะยังอยู่ในแผนแต่ชี้ไปที่ว่าง
   * **ผู้ใช้เห็นแถวที่ไม่มีชื่อ ไม่ใช่ error** — อาการเดียวกับ "บันทึกแล้วไม่เปลี่ยน" ที่เราไล่กันทั้งวัน
   * · จึง assert **ค่าที่อ่านกลับมา** ไม่ใช่แค่ status 201
   */
  it("🔴 E5-AC10 — สร้าง custom place → เพิ่มเป็นจุดแวะ → อ่านกลับต้องได้ชื่อจริง ไม่ใช่แถวเปล่า", async () => {
    const nameTh = `เจ้าของร้าน-${stamp}`;
    const mk = await postAs(aCookies, tripA, customPlacesPOST, {
      city: citySlug, category: "food", maps_query: "q-ac10", name_th: nameTh, lat: 37.55, lng: 127.05,
    });
    expect(mk.status, `สร้าง custom place ควร 201: ${await mk.clone().text()}`).toBe(201);
    const created = (await mk.json()) as { id?: string };
    expect(created.id, "custom place ที่สร้างแล้วไม่มี id กลับมา").toBeTruthy();
    const customId = created.id!;

    // 🔴 กิ่ง uuid ของ stops POST — `placeId` ที่ไม่ใช่ slug ต้องถูกอ่านเป็น custom_place_id
    const addStop = await postAs(aCookies, tripA, stopsPOST, {
      planId: aPlan, tripDayId: aDay, placeId: customId,
    });
    expect(
      addStop.status,
      `เพิ่มจุดแวะที่ชี้ custom place ควร 201 · 400 = route ไม่รู้จัก uuid นี้ (กิ่ง custom หลุด): ${await addStop.clone().text()}`,
    ).toBe(201);

    // อ่านกลับผ่าน route จริง — ค่าที่ UI จะได้
    jar.cookies = aCookies;
    const list = await stopsGET(
      new NextRequest(`http://localhost:3300/api/engine/trips/${tripA}/stops?planId=${aPlan}`),
      { params: Promise.resolve({ tripId: tripA }) },
    );
    expect(list.status, `อ่านจุดแวะควร 200: ${await list.clone().text()}`).toBe(200);
    // 🔴 รูปคำตอบเปลี่ยนเป็น `{ stops, places }` เมื่อ 2 ก.ย. 2026 (`E6-AC13` · P1)
    //    เดิมเป็นอาเรย์เปล่า · **เคสนี้แดงทันทีตอนเปลี่ยน ไม่ได้ผ่านเงียบ** (`.filter is not a function`)
    const stops = ((await list.json()) as { stops: { place_id: string }[] }).stops;
    const mine = stops.filter((r) => r.place_id === customId);
    expect(
      mine.length,
      `ไม่เจอจุดแวะที่ชี้ custom place · place_id ที่เห็น: ${JSON.stringify(stops.map((r) => r.place_id))}\n` +
        '  🔴 ถ้าเห็น "" = แถวเปล่า: จุดแวะอยู่ในแผนแต่ UI ไม่รู้ว่ามันคือที่ไหน (toDto ตกทั้งสองทาง)',
    ).toBe(1);

    // ...และ id นั้นต้อง *แปลงกลับเป็นชื่อได้จริง* — ไม่งั้นผู้ใช้เห็น uuid เปล่า ๆ
    const cps = await customPlacesGET(
      new NextRequest(`http://localhost:3300/api/engine/trips/${tripA}/custom-places`),
      { params: Promise.resolve({ tripId: tripA }) },
    );
    expect(cps.status, `อ่าน custom-places ควร 200: ${await cps.clone().text()}`).toBe(200);
    const places = (await cps.json()) as { id: string; name_th?: string; nameTh?: string }[];
    const found = places.find((x) => x.id === customId);
    expect(found, "custom place ที่จุดแวะชี้อยู่ ไม่อยู่ในลิสต์ที่ไคลเอนต์ดึงไป resolve → ผู้ใช้เห็น uuid เปล่า").toBeTruthy();
    expect(
      found?.name_th ?? found?.nameTh,
      "resolve แล้วไม่ได้ชื่อที่เพิ่งตั้ง — เก็บได้แต่อ่านกลับไม่ครบ",
    ).toBe(nameTh);
  });

  it("custom-places POST — B สร้างสถานที่ของทริป A ไม่ได้", async () => {
    const body = (name: string) => ({ city: citySlug, category: "food", maps_query: "q", name_th: name, lat: 37.5, lng: 127.0 });
    const aRes = await postAs(aCookies, tripA, customPlacesPOST, body("cp-a"));
    expect(aRes.status, `control A ควร 201: ${aRes.status} ${await aRes.clone().text()}`).toBe(201);
    const cnt = async () => {
      // admin ไม่การันตีมี grant บน custom_places → A อ่านของตัวเอง (checker คนละคนกับ B)
      const { data, error } = await aClient.from("custom_places").select("id").eq("trip_id", tripA);
      if (error) throw new Error(`read custom_places: ${error.message}`);
      return data.length;
    };
    const n1 = await cnt();
    const bRes = await postAs(bCookies, tripA, customPlacesPOST, body("cp-b"));
    // 🔴 วันนี้ปฏิเสธด้วย RLS (`42501`→403) · **แต่ `custom-places:138` แปลง `23503`→`400` ด้วย**
    //    วันที่ policy ถูกผ่อนแล้วให้ FK เป็นด่านแทน probe จะได้ `400` — **ต้องยังอ่านว่า "ปฏิเสธ"**
    //    ไม่งั้นเคสความปลอดภัยจะขึ้นป้าย "บั๊กเรา" แล้วคนไปแก้ route ทั้งที่ด่านทำงานถูก (P1 ชี้)
    //    ⚠️ การ *เปลี่ยนกลไก* (RLS→FK) เป็นเรื่องของหมุด policy fingerprint ไม่ใช่ของ probe นี้ —
    //       probe นี้ยืนยัน *คุณสมบัติ* ("B สร้างในทริป A ไม่ได้") ซึ่งจริงทั้งสองกลไก
    const { verdict, detail } = await verdictFor(bRes, { rejectStatuses: DB_REJECT_STATUSES });
    expect(verdict, `[custom-places] B → **${verdict}** (${detail})`).toBe("rejected");
    expect(await cnt(), "[custom-places] จำนวนเพิ่มหลัง B ยิง = B สร้างในทริป A สำเร็จ (leak)").toBe(n1);
  });

  it("hidden-places POST — B ซ่อนสถานที่ในทริป A ไม่ได้", async () => {
    const aRes = await postAs(aCookies, tripA, hiddenPlacesPOST, { placeId: placeSlug });
    expect(aRes.status, `control A ควร 200: ${aRes.status} ${await aRes.clone().text()}`).toBe(200);
    const cnt = async () => {
      // admin มี select บน hidden_places (ข้อยกเว้น #4)
      const { data, error } = await admin.from("hidden_places").select("trip_id").eq("trip_id", tripA);
      if (error) throw new Error(`admin count hidden_places: ${error.message}`);
      return data.length;
    };
    const n1 = await cnt();
    const bRes = await postAs(bCookies, tripA, hiddenPlacesPOST, { placeId: placeSlug });
    const { verdict, detail } = await verdictFor(bRes);
    expect(verdict, `[hidden-places] B → **${verdict}** (${detail})`).toBe("rejected");
    expect(await cnt(), "[hidden-places] เพิ่มหลัง B = B ซ่อนในทริป A สำเร็จ (leak)").toBe(n1);
  });

  // จับบั๊กที่ owner เขียนไม่ได้ (42P10 · P4 พบ · P1 แก้ 04b7171: upsert partial-index → update-then-insert)
  it("place-notes PUT — A เขียนโน้ตได้ · B เขียนทับโน้ตในแผน A ไม่ได้ (ตรวจ *เนื้อโน้ต* ไม่ใช่จำนวน)", async () => {
    const aRes = await callAs(aCookies, tripA, placeNotesPUT, "PUT", { planId: aPlan, placeId: placeSlug, note: "n-a" });
    expect(aRes.status, `control A ควร 200 (บั๊กเดิม 42P10): ${aRes.status} ${await aRes.clone().text()}`).toBe(200);
    const notes = async () => {
      // admin มี select บน place_notes (ข้อยกเว้น #4) — ตรวจ *เนื้อ* เพราะ upsert เขียนทับได้ (จำนวนไม่ขยับ)
      const { data, error } = await admin.from("place_notes").select("note").eq("trip_id", tripA);
      if (error) throw new Error(`admin read place_notes: ${error.message}`);
      return (data ?? []).map((r) => (r as { note: string | null }).note).sort();
    };
    expect(await notes()).toEqual(["n-a"]);
    const bRes = await callAs(bCookies, tripA, placeNotesPUT, "PUT", { planId: aPlan, placeId: placeSlug, note: "n-b" });
    const { verdict, detail } = await verdictFor(bRes);
    expect(verdict, `[place-notes] B → **${verdict}** (${detail})`).toBe("rejected");
    expect(await notes(), "[place-notes] เจอ 'n-b' = B เขียนทับโน้ตของ A สำเร็จ (leak)").toEqual(["n-a"]);
  });

  // 🔴 positive control ของ xfail ข้างล่าง — **ไม่ห่อ it.fails** (P1 กำชับ)
  //    ถ้าเคสนี้แดง = กลไก write/read/place3 พัง → xfail ข้างล่างเขียว *เพราะกลไก* ไม่ใช่เพราะ bug เปิด
  //    it.fails ต้องการ positive control *มากกว่า* เทสต์ปกติ เพราะมันแปลงความล้มเหลวเป็นความสำเร็จ
  it("positive control (ไม่ห่อ it.fails): A เขียนโน้ต place3 แล้วเห็นจริง — พิสูจน์กลไก place-notes write/read", async () => {
    const r = await callAs(aCookies, tripA, placeNotesPUT, "PUT", { planId: aPlan, placeId: placeSlug3, note: "pc" });
    expect(r.status, `เขียนโน้ต place3 ควร 200: ${await r.clone().text()}`).toBe(200);
    const { data, error } = await admin.from("place_notes").select("note,deleted_at").eq("trip_id", tripA).eq("catalog_place_id", place3Id);
    if (error) throw new Error(`read place3 note: ${error.message}`);
    const active = (data ?? []).filter((x) => (x as { deleted_at: string | null }).deleted_at == null).map((x) => (x as { note: string | null }).note);
    expect(active, "เขียนแล้วต้องเห็น — ถ้าแดง = กลไกพัง → xfail ข้างล่างเขียวเพราะกลไก ไม่ใช่เพราะ bug").toEqual(["pc"]);
  });

  // 🔴 บั๊กติดกันที่ P1 *ยังไม่แก้* (จงใจ · ไม่ใช่ของใหม่จากการแก้ upsert): update-then-insert ไม่กรอง deleted_at
  //    **reproduce จริงเมื่อ 27 ส.ค. 2026:** ลบโน้ต → "เขียนใหม่" ได้ **403** (tombstone กันดัชนี partial ไว้ · insert ชน · ไม่มี active row ให้ update)
  //    → ผู้ใช้จดโน้ตซ้ำที่เดิมไม่ได้เลย · **แย่กว่า "เขียนทับเงียบ" ที่คุยกันไว้ตอนแรก**
  // 🎯 **`it.fails` = xfail:** วันนี้ body ล้ม (403) → เคสนี้ *เขียว* (document ว่า bug เปิด · หัว branch ไม่แดง ตาม D72)
  //    วินาทีที่ P1 แก้ deleted_at → body ผ่าน → `it.fails` *แดง* = "แก้แล้ว ถอด .fails ออกเป็นเทสต์จริง"
  //    ⚠️ ถ้าแดง เช็ค positive control ข้างบนก่อน: มันเขียว = แดงเพราะ fix ลงจริง · มันแดงด้วย = setup/กลไกพัง
  it.fails("place-notes deleted_at — ลบโน้ต → เขียนใหม่ → ต้องเห็นโน้ตใหม่ (xfail · bug เปิดอยู่ · พลิกแดงเมื่อ P1 แก้)", async () => {
    const put = (note: string) => callAs(aCookies, tripA, placeNotesPUT, "PUT", { planId: aPlan, placeId: placeSlug2, note });
    expect((await put("d1")).status, "setup: เขียนโน้ตแรกควร 200").toBe(200);
    jar.cookies = aCookies;
    const delRes = await placeNotesDELETE(
      new NextRequest(`http://localhost:3300/api/engine/trips/${tripA}/x?planId=${aPlan}&placeId=${placeSlug2}`, { method: "DELETE" }),
      { params: Promise.resolve({ tripId: tripA }) },
    );
    expect(delRes.status, "setup: ลบโน้ตควร 200").toBe(200);
    // เขียนใหม่หลังลบ — พฤติกรรมที่ผู้ใช้ต้องได้คือ 200 + เห็นโน้ตใหม่ · วันนี้ได้ 403 (นี่คือบั๊ก)
    const reRes = await put("d2");
    expect(reRes.status, `เขียนใหม่หลังลบควรได้ 200: ได้ ${reRes.status}`).toBe(200);
    const active = async () => {
      const { data, error } = await admin.from("place_notes").select("note,deleted_at").eq("trip_id", tripA).eq("catalog_place_id", place2Id);
      if (error) throw new Error(`read place_notes: ${error.message}`);
      return (data ?? []).filter((r) => (r as { deleted_at: string | null }).deleted_at == null).map((r) => (r as { note: string | null }).note);
    };
    expect(await active(), "ลบแล้วเขียนใหม่ ต้องเห็นโน้ตใหม่").toEqual(["d2"]);
  });

  // ✅ ยืนยัน fix 0027896 (P1): 403 เดิม *ซ่อน* ว่ามีการเขียนทับ tombstone จริง 2 รอบ · fix ใส่ .is(deleted_at,null) ทั้งสองจุด
  //    อาการผู้ใช้ (403) เหมือนเดิม · สิ่งที่เปลี่ยนคือ **ฐานไม่ถูกแตะในเส้นทาง tombstone** — ครึ่งที่ fake db พิสูจน์ไม่ได้
  //    ไม่ห่อ it.fails: นี่คือพฤติกรรมที่แก้แล้ว (ต้องเขียว) · ถอย fix = tombstone ได้ "d2" = แดง
  it("place-notes tombstone ไม่ถูกเขียนในเส้นทาง delete→rewrite (regression guard ของ 0027896)", async () => {
    const put = (note: string) => callAs(aCookies, tripA, placeNotesPUT, "PUT", { planId: aPlan, placeId: placeSlug4, note });
    expect((await put("t1")).status, "setup: เขียนโน้ตแรกควร 200").toBe(200);
    jar.cookies = aCookies;
    await placeNotesDELETE(
      new NextRequest(`http://localhost:3300/api/engine/trips/${tripA}/x?planId=${aPlan}&placeId=${placeSlug4}`, { method: "DELETE" }),
      { params: Promise.resolve({ tripId: tripA }) },
    );
    await put("t2"); // เขียนใหม่หลังลบ — วันนี้ได้ 403 · แต่ **ต้องไม่แตะ tombstone**
    const { data, error } = await admin.from("place_notes").select("note,deleted_at").eq("trip_id", tripA).eq("catalog_place_id", place4Id);
    if (error) throw new Error(`read tombstone: ${error.message}`);
    const tomb = (data ?? []).filter((r) => (r as { deleted_at: string | null }).deleted_at != null).map((r) => (r as { note: string | null }).note);
    expect(tomb, "🔴 tombstone ถูกเขียนเป็น 't2' = fix 0027896 ถอย (403 ซ่อนการเขียนไว้ข้างหลัง)").toEqual(["t1"]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 `E5` (4 ก.ย. 2026) — route ใหม่สองใบ · `PUT /destinations` · `PATCH /trips/[tripId]`
  // เจ้าของ probe: P4-QA/Sec · เจ้าของ route: P1-Lead — **คนเขียน route ≠ คนเขียน probe โดยตั้งใจ**
  //
  // ## 🔴 ทำไมบล็อกนี้สร้างทริปของตัวเอง (`tripE`) ไม่ใช้ `tripA`
  // `PATCH` **แก้ช่วงวันแล้วลบ `trip_days` ที่หลุดช่วง** · `trip_stops_day_fk … on delete cascade`
  // ⇒ ยิงใส่ `tripA` = ลบจุดแวะที่เคสข้างบนสร้างไว้ **แล้วลำดับการรันจะกลายเป็นส่วนหนึ่งของผล**
  //    ซึ่งเป็นวิธีที่เมทริกซ์เขียวหลอกได้เงียบที่สุด (ถ้อยคำจากบล็อก `trip_days` ของ `rlsMatrix`)
  //
  // ## 🔴 สิ่งที่ทำให้สองใบนี้ต่างจากอีก 10 ใบในไฟล์นี้ — และเป็นหัวใจของบล็อกทั้งบล็อก
  // ```
  // ตารางลูกทุกใบ (bookings · stops · days · …)   policy = app.can_write_trip(trip_id)   → editor เขียนได้
  // `PATCH /trips/[tripId]` แตะ **ตาราง `trips` เอง**  policy = trip_role(id) = 'owner'    → editor เขียน **ไม่ได้**
  // ```
  // ⇒ **โพรบด้วย "ผู้ใช้นอกทริป" อย่างเดียวจะเขียวโดยไม่ได้แตะเส้นที่ต่างกันจริง** — คนนอกถูกปฏิเสธ
  //    ด้วย `can_read_trip` ตั้งแต่ชั้นแรก **ไม่เคยเดินไปถึงเส้น `owner` เลย**
  // 🎯 ***เส้นที่ `owner` กันไว้ ยิงได้จากคนที่ *มีสิทธิ์เขียนทริปนั้นจริง* เท่านั้น — นั่นคือ `D`***
  // ═══════════════════════════════════════════════════════════════════════════
  describe("🔴 E5 — destinations PUT · trip PATCH (editor ≠ owner)", () => {
    let tripE = "";
    let ePlan = "";

    beforeAll(async () => {
      tripE = await mkTrip(aClient, "a"); // 2026-10-11 .. 2026-10-21 (create_trip เติมวันให้ 11 วัน)
      const inv = await aClient.from("trip_members").insert([
        { trip_id: tripE, user_id: ids.d, role: "editor" },
        { trip_id: tripE, user_id: ids.c, role: "viewer" },
      ]);
      if (inv.error) throw new Error(`เชิญสมาชิก tripE: ${inv.error.message}`);
      const plan = await aClient.from("trip_plans").select("id").eq("trip_id", tripE).single();
      if (plan.error) throw new Error(`อ่านแผนของ tripE: ${plan.error.message}`);
      ePlan = plan.data.id as string;
    });

    /** วันของ `tripE` เรียงแล้ว — admin มี `select on trip_days` (ทะเบียนข้อยกเว้นที่ 4) */
    const daysOf = async (): Promise<string[]> => {
      const { data, error } = await admin.from("trip_days").select("date").eq("trip_id", tripE);
      if (error) throw new Error(`admin อ่านวันของ tripE: ${error.message}`);
      return (data ?? []).map((r) => (r as { date: string }).date).sort();
    };
    const dayIdOf = async (date: string): Promise<string> => {
      const { data, error } = await admin.from("trip_days").select("id").eq("trip_id", tripE).eq("date", date).single();
      if (error) throw new Error(`admin หาวัน ${date} ของ tripE: ${error.message}`);
      return data.id as string;
    };
    /**
     * จุดหมายของ `tripE` เรียงตาม `rank` — คืน `city_id` ตามลำดับที่ผู้ใช้จะเห็น
     * ⚠️ อ่านด้วย client ของ **A** ไม่ใช่ admin: `service_role` ไม่มี grant บน `trip_destinations`
     *    (ทะเบียน `§3.5` ไม่มีข้อไหนให้) · A เป็นคนละตัวตนกับผู้เรียกในทุกเคสโจมตี จึงยังพอต่อ `P-72`
     * 🔴 tie-break ด้วย `city_id` ที่นี่ **โดยตั้งใจ** — `rank` ไม่ unique (`D6`) และถ้าไม่ตรึง
     *    เคสลำดับข้างล่างจะกะพริบเป็นครั้งคราวแทนที่จะแดงคงที่ (ซึ่งจะถูกโทษว่า "เน็ต")
     */
    const destsOf = async (): Promise<string[]> => {
      const { data, error } = await aClient
        .from("trip_destinations")
        .select("city_id, rank")
        .eq("trip_id", tripE)
        .order("rank")
        .order("city_id");
      if (error) throw new Error(`อ่านจุดหมายของ tripE: ${error.message}`);
      return (data ?? []).map((r) => (r as { city_id: string }).city_id);
    };

    // ── destinations PUT ────────────────────────────────────────────────────
    it("① owner เขียนทับรายการจุดหมายได้ · rank เรียงตามลำดับที่ส่ง (ไม่เรียงใหม่)", async () => {
      // ส่งลำดับที่ *ไม่* ตรงกับการเรียง uuid → ถ้าอ่านกลับได้ลำดับนี้ = rank มาจากตำแหน่งใน array จริง
      const send = [cityId2, cityId, cityId3];
      const res = await callAs(aCookies, tripE, destinationsPUT, "PUT", { cityIds: send });
      expect(res.status, `owner ควร 200: ${await res.clone().text()}`).toBe(200);
      expect(
        await destsOf(),
        "ลำดับจุดหมายไม่ตรงกับที่ส่ง = rank ถูกเรียงใหม่ (ผู้ใช้จัดลำดับเมืองเอง — เรียงใหม่คือบั๊ก)",
      ).toEqual(send);
    });

    /**
     * 🔴 **เคสฝั่งบวกของ `editor` — และมันคือ *ตัวแยก* ของทั้งบล็อก ไม่ใช่ของแถม**
     *
     * ถ้าไม่มีข้อนี้ เคส "editor ยิง `PATCH` ไม่ได้" ข้างล่างจะเขียวได้จากสาเหตุที่ผิดสนิท:
     * คุกกี้ของ D พัง · D ไม่ได้ถูกเชิญจริง · `captureCookies` คืนของว่าง — **ทุกทางให้ผลเหมือนกันเป๊ะ**
     * 🎯 ***"editor ถูกปฏิเสธเพราะ `owner`" กับ "editor ถูกปฏิเสธเพราะไม่มีตัวตน" อ่านเหมือนกันจากผลรัน***
     * · ข้อนี้พิสูจน์ว่า D **เขียนทริปนี้ได้จริงในเส้นทางที่ `can_write_trip` คุม** ⇒ การปฏิเสธข้างล่าง
     *   ชี้ไปที่ `owner` ได้อย่างเดียว
     */
    it("🔴 ② editor เขียนจุดหมายได้ (can_write_trip) — ตัวแยกของเคส editor ข้างล่างทั้งหมด", async () => {
      const send = [cityId3, cityId];
      const res = await callAs(dCookies, tripE, destinationsPUT, "PUT", { cityIds: send });
      expect(
        res.status,
        `editor ควรเขียนจุดหมายได้ (trip_destinations = can_write_trip): ${await res.clone().text()}\n` +
          "  🔴 ถ้าข้อนี้แดง **อย่าเชื่อเคส editor ข้างล่าง** — มันจะเขียวเพราะ D ไม่มีตัวตน ไม่ใช่เพราะ owner กัน",
      ).toBe(200);
      expect(await destsOf(), "editor เขียนสำเร็จแต่ฐานไม่ขยับ").toEqual(send);
    });

    it("③ viewer เขียนจุดหมายไม่ได้", async () => {
      const before = await destsOf();
      const res = await callAs(cCookies, tripE, destinationsPUT, "PUT", { cityIds: [cityId2] });
      const { verdict, detail } = await verdictFor(res);
      expect(verdict, `[destinations] viewer → **${verdict}** (${detail})`).toBe("rejected");
      expect(await destsOf(), "[destinations] viewer เขียนสำเร็จ (leak)").toEqual(before);
    });

    it("④ คนนอกทริปเขียนจุดหมายไม่ได้", async () => {
      const before = await destsOf();
      const res = await callAs(bCookies, tripE, destinationsPUT, "PUT", { cityIds: [cityId2] });
      const { verdict, detail } = await verdictFor(res);
      expect(verdict, `[destinations] คนนอก → **${verdict}** (${detail})`).toBe("rejected");
      expect(await destsOf(), "[destinations] คนนอกเขียนเข้าทริป A สำเร็จ (leak)").toEqual(before);
    });

    /**
     * 🔴 **กิ่งที่ไม่มีเคสไหนเดิน: คำขอที่ *มีแต่การลบ*** — `insert`/`update` ถูกข้ามทั้งคู่
     *
     * route ตรวจ `0 แถว = RLS กรอง` ไว้ **สองจุด** (`insertTripDestinations2` · `updateTripDates`)
     * **แต่ไม่ได้ตรวจที่ `deleteTripDestinationsExcept`** — และมีเส้นทางที่ *ทั้งคำขอ* เดินผ่านแค่จุดนั้น:
     * ```
     * สถานะ = [X, Y] · viewer ส่ง [X]   → toInsert = []  · toRerank = []  (X ยังอยู่อันดับ 0)
     *                                   → เหลือแต่ก้าว ③ delete → RLS กรอง → 0 แถว · **ไม่มี error**
     * ```
     * ⇒ ฐานไม่ขยับ (ปลอดภัย ✅) **แต่ผู้เรียกได้ `200 { ok: true }`**
     * 🎯 ***คำตอบบอกว่าบันทึกแล้ว ขณะที่ไม่มีอะไรถูกบันทึก — อาการ "บันทึกแล้วไม่เปลี่ยน" ที่ทีมไล่กันทั้งสัปดาห์***
     * · **สองข้อนี้แยกกันจริง ๆ และผมยืนยันแยกกัน**: ข้อความปลอดภัย (ฐาน) กับข้อความซื่อสัตย์ (คำตอบ)
     */
    it("🔴 ⑤ คำขอที่มีแต่การลบ — ฐานต้องไม่ขยับ **และ** ต้องไม่ตอบว่าบันทึกสำเร็จ", async () => {
      // ตั้งสถานะให้แน่นอนก่อน (ไม่พึ่งลำดับการรันของเคสข้างบน)
      const setup = await callAs(aCookies, tripE, destinationsPUT, "PUT", { cityIds: [cityId3, cityId] });
      expect(setup.status, `setup ควร 200: ${await setup.clone().text()}`).toBe(200);
      const before = await destsOf();
      expect(before, "setup ไม่ได้ผล — เคสนี้จะไม่ได้เดินกิ่ง delete-only").toEqual([cityId3, cityId]);

      // viewer ขอให้เหลือแค่ใบแรก = ก้าว ① ② ไม่มีอะไรทำ · เหลือแต่ ③
      const res = await callAs(cCookies, tripE, destinationsPUT, "PUT", { cityIds: [cityId3] });
      const body = await res.clone().json().catch(() => null);

      // ครึ่งที่หนึ่ง — **ความปลอดภัย**: RLS ต้องกันจริง
      expect(
        await destsOf(),
        "🔴 viewer ลบจุดหมายของทริปสำเร็จ (leak) — RLS ฝั่ง delete ไม่ได้กัน",
      ).toEqual(before);

      // ครึ่งที่สอง — **ความซื่อสัตย์ของคำตอบ**: 2xx แปลว่า "บันทึกแล้ว" ซึ่งเป็นเท็จ
      const { verdict, detail } = await verdictFor(res);
      expect(
        verdict,
        `[destinations/delete-only] viewer → **${verdict}** (${detail})\n` +
          `  🔴 leak ที่นี่ = **ตอบ ok:true ทั้งที่ฐานไม่ขยับ** (ยืนยันแล้วข้างบนว่าไม่ขยับ)\n` +
          "     route ตรวจ 0-แถว ที่ insert และ update แล้ว **แต่ไม่ได้ตรวจที่ delete** —\n" +
          `     body: ${JSON.stringify(body)}`,
      ).toBe("rejected");
    });

    /**
     * 🔴 **tie-break ของ `rank` — เคส ① ข้างบน *ไม่ได้* วัดมัน และผมเกือบปล่อยผ่าน** (P1 ทัก · P4 รับ)
     *
     * เคส ① ส่ง 3 เมือง ได้ `rank` `0·1·2` — **ไม่ซ้ำสักคู่**
     * ⇒ `.order("city_id")` ที่ P1 เพิ่งเติมเข้า `tripDestinationsOf` **ไม่เคยถูกเรียกใช้ตัดสินอะไรเลย**
     * 🎯 ***เคส ① จะเขียวเท่ากันเป๊ะไม่ว่าจะมี tie-break หรือไม่มี — คือนิยามของเคสที่ไม่ได้วัดสิ่งที่มันอ้าง***
     *
     * ## สภาพที่ต้องมี: สองเมืองถือ `rank` เดียวกัน
     * เกิดจริงเมื่อ **ก้าว ② ของ `PUT` ล้มกลางทาง** (จัดลำดับสำเร็จบางใบ) — สภาพนั้นสร้างผ่าน route ไม่ได้
     * ⇒ สร้างที่ฐานตรง ๆ ในนาม **owner** (A เขียน `trip_destinations` ผ่าน RLS ได้อยู่แล้ว)
     *   **ไม่ใช่การโกงเทสต์** — เรากำลังจำลอง *สภาพของข้อมูล* ที่เส้นทางจริงผลิตได้ แล้ววัด *ตัวอ่าน*
     *
     * ## ⚠️ ขอบเขตของหลักฐาน — เขียนไว้เพราะคนอ่านไม่มีทางรู้ถ้าไม่เขียน (`§3.4`)
     * เคสนี้พิสูจน์ว่า ***ลำดับที่ประกาศไว้เป็นลำดับที่ได้กลับมาจริง***
     * · 🔴 **มันไม่ได้พิสูจน์ว่า *ถอด `.order("city_id")` ออกแล้วพัง*** — Postgres คืนลำดับเดิม
     *   โดยบังเอิญได้ (ตารางเล็ก · ไม่มี parallel scan) ⇒ ทิศแดงของข้อนี้ **ยิงให้เชื่อถือได้ไม่ได้**
     *   และผมจะไม่แกล้งว่ายิงแล้ว · **นี่คือข้อจำกัดของสิ่งที่วัดได้ ไม่ใช่ของเคส**
     */
    it("🔴 ⑤ᐟ tie-break — `rank` ซ้ำแล้วลำดับต้องคงที่ (เคส ① ไม่ได้แตะเงื่อนไขนี้เลย)", async () => {
      const setup = await callAs(aCookies, tripE, destinationsPUT, "PUT", {
        cityIds: [cityId2, cityId, cityId3],
      });
      expect(setup.status, `setup ควร 200: ${await setup.clone().text()}`).toBe(200);

      // บังคับให้สองใบแรกถือ rank เดียวกัน — สภาพที่ก้าว ② ล้มกลางทางจะผลิตได้
      const dup = await aClient
        .from("trip_destinations").update({ rank: 0 }).eq("trip_id", tripE).eq("city_id", cityId);
      expect(dup.error, `setup: ตั้ง rank ซ้ำไม่ได้: ${dup.error?.message}`).toBeNull();
      // 🔴 ยืนยันว่า **สภาพที่เคสนี้ต้องการเกิดขึ้นจริง** — ไม่งั้นเคสเขียวโดยไม่เคยมี rank ซ้ำ
      const { data: raw, error: rawErr } = await aClient
        .from("trip_destinations").select("city_id, rank").eq("trip_id", tripE);
      if (rawErr) throw new Error(`อ่าน rank ดิบ: ${rawErr.message}`);
      const ranks = (raw ?? []).map((r) => (r as { rank: number }).rank);
      expect(
        ranks.length - new Set(ranks).size,
        `setup: ไม่มี rank ซ้ำเลย (${JSON.stringify(ranks)}) — เคสนี้จะไม่ได้แตะ tie-break`,
      ).toBeGreaterThan(0);

      // อ่านผ่าน **DAL ตัวจริงที่ route เรียก** ไม่ใช่คิวรีที่เทสต์เขียนเอง
      const { data, error } = await tripDestinationsOf(aClient as unknown as Db, tripE);
      if (error) throw new Error(`tripDestinationsOf: ${error.message}`);
      const got = (data ?? []).map((r) => (r as unknown as { city_id: string }).city_id);
      // rank 0 มีสองใบ → tie-break ต้องเรียงด้วย city_id ขึ้น · แล้วตามด้วย rank 1 (cityId3)
      const tied = [cityId2, cityId].sort();
      expect(
        got,
        "ลำดับที่ได้ไม่ตรงกับสัญญา `order by rank, city_id`\n" +
          "  🔴 ถ้าเห็นสองใบแรกสลับกัน = tie-break ไม่ได้ทำงาน ⇒ ผู้ใช้สองเครื่องเห็นลำดับเมืองต่างกัน",
      ).toEqual([...tied, cityId3]);
    });

    /**
     * 🔴 **เพดานของ `PUT` ต้องเป็นค่าเดียวกับ `POST` — และเคสนี้วัด *พฤติกรรม* ไม่ใช่ *การ import***
     * เจ้าของ: P4 (พบว่าสองเส้นถือคนละค่า) · P1 (รวมเป็น `MAX_TRIP_DESTINATIONS`) · 4 ก.ย. 2026
     *
     * `import` ค่าเดียวกันทำให้ค่า *ตรงกัน* แต่ไม่ได้พิสูจน์ว่า **route เอาไปใช้จริง** —
     * ใครลบบรรทัด `if (raw.length > MAX_TRIP_DESTINATIONS)` ทิ้ง `import` ยังอยู่ `tsc` ยังเขียว
     * 🎯 ***ค่าที่ถูก import แล้วไม่ถูกใช้ อ่านเหมือนค่าที่ถูกบังคับใช้ — จากทุกเครื่องมือที่ไม่ใช่การยิงจริง***
     *
     * ## คู่ควบคุมโดยไม่ต้อง seed เมืองจริง 20 ใบ — แยกด้วย *รูปของคำตอบ*
     * ```
     * MAX+1 ใบ → 400 + **ไม่มี** `unknownCityIds`  ← ตกที่ด่านเพดาน (ก่อนแตะคลัง)
     * MAX   ใบ → 400 + **มี**   `unknownCityIds`  ← ผ่านด่านเพดานแล้ว ไปตกที่ "ไม่รู้จักเมือง"
     * ```
     * ⇒ ทั้งคู่เป็น `400` เหมือนกัน **แต่คนละด่าน** · ถ้าเพดานพังเป็น `1` เคสล่างจะไม่มี `unknownCityIds`
     *   ⇒ **จับ off-by-one และเพดานที่แคบเกินได้ โดยไม่ต้องมีเมืองจริงในคลัง**
     */
    it("🔴 ⑤ᐢ PUT /destinations — เพดานเดียวกับ POST · ขอบพอดีต้องผ่านด่านเพดาน", async () => {
      const ghosts = (n: number) =>
        Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
      const before = await destsOf();

      const over = await callAs(aCookies, tripE, destinationsPUT, "PUT", { cityIds: ghosts(MAX_TRIP_DESTINATIONS + 1) });
      const overBody = (await over.json()) as { error?: string; unknownCityIds?: string[] };
      expect(over.status, `เกินเพดาน ${MAX_TRIP_DESTINATIONS} ควร 400`).toBe(400);
      expect(
        overBody.unknownCityIds,
        `เกินเพดานแล้วยังไปตรวจคลังต่อ — ด่านเพดานไม่ได้ยิง (ได้: ${JSON.stringify(overBody)})`,
      ).toBeUndefined();

      const edge = await callAs(aCookies, tripE, destinationsPUT, "PUT", { cityIds: ghosts(MAX_TRIP_DESTINATIONS) });
      const edgeBody = (await edge.json()) as { error?: string; unknownCityIds?: string[] };
      expect(
        edgeBody.unknownCityIds?.length,
        `ส่ง ${MAX_TRIP_DESTINATIONS} ใบ (= เพดานพอดี) แล้วไม่ถึงด่านคลัง ⇒ เพดานแคบไปหนึ่ง\n` +
          `  ได้: ${JSON.stringify(edgeBody)}`,
      ).toBe(MAX_TRIP_DESTINATIONS);

      // 🔴 ฐานต้องไม่ขยับจากคำขอที่ล้มทั้งสองใบ — ด่านทั้งคู่ต้องยิง *ก่อน* แตะฐาน
      //    เทียบกับ `before` ที่จับไว้ตอนต้นเคส · **ห้ามเทียบ `destsOf()` กับ `destsOf()`**
      //    ซึ่งเป็นจริงเสมอตามนิยาม (ผมเขียนแบบนั้นในฉบับแรกของเคสนี้ แล้วจับได้ตอนอ่านซ้ำ)
      expect(
        await destsOf(),
        "คำขอที่ถูกปฏิเสธด้วยเพดาน/คลัง ไปเขียนฐานแล้ว = ด่านยิงหลังเขียน",
      ).toEqual(before);
    });

    // ── PATCH /trips/[tripId] ───────────────────────────────────────────────
    it("⑥ owner แก้ช่วงวันได้ · ส่งค่าเดิมซ้ำ = 200 added:0 removed:0 (ไม่ใช่ 400)", async () => {
      const before = await daysOf();
      expect(before.length, "tripE ควรมี 11 วันจาก create_trip").toBe(11);
      const res = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-21",
      });
      expect(res.status, `ส่งค่าเดิมควร 200: ${await res.clone().text()}`).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, added: 0, removed: 0 });
      expect(await daysOf(), "ส่งค่าเดิมแล้ววันเปลี่ยน").toEqual(before);
    });

    it("⑦ owner ขยายช่วงวัน → วันใหม่ถูกเติมจริง", async () => {
      const res = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-23",
      });
      expect(res.status, `ขยายช่วงควร 200: ${await res.clone().text()}`).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, added: 2, removed: 0 });
      const days = await daysOf();
      expect(days.length, "ขยาย 2 วันแล้วจำนวนวันไม่ขยับ").toBe(13);
      expect(days.at(-1), "วันสุดท้ายต้องเป็นวันใหม่").toBe("2026-10-23");
    });

    /**
     * 🔴 **เส้นที่ `owner` กันไว้ และมีแค่ `editor` เท่านั้นที่ยิงถึง**
     * ส่ง **ช่วงวันเดิม** โดยตั้งใจ ⇒ `toAdd = 0` · `toRemove = 0` ⇒ route เดินกิ่งลัดที่เรียก
     * `updateTripDates` **ตัวเดียว ไม่แตะอะไรอื่นเลย** ⇒ ผลที่ได้พูดถึง `trips_update` ล้วน ๆ
     *
     * ⚠️ **กับดักที่ P1 เตือนไว้เอง: `409` อยู่ใน `DB_REJECT_STATUSES`**
     * `PATCH` มีกิ่ง `409 STOPS_WOULD_BE_LOST` ที่ยิง **ก่อนแตะฐาน** ⇒ ถ้าเคสนี้บังเอิญได้ `409`
     * `verdictFor` จะอ่านว่า *"ถูกปฏิเสธ"* ทั้งที่ **ยังไม่เคยเดินไปถึง RLS เลย**
     * 🎯 ***`rejected` ที่ถูกต้อง กับ `rejected` ที่มาจากด่านคนละใบ อ่านเหมือนกันเป๊ะจากผลรัน***
     * ⇒ ยืนยัน `code` ตรง ๆ ด้วย ไม่พึ่งตัวจำแนกอย่างเดียว
     */
    it("🔴 ⑧ editor แก้ช่วงวันไม่ได้ — `trips_update` จำกัด owner (และต้องไม่ใช่ 409 คนละด่าน)", async () => {
      // 🔴 precondition เดียวกับ ⑨ — "editor ถูกปฏิเสธ" เป็นจริงฟรีถ้า `PATCH` ปฏิเสธทุกคน
      const warm = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-23", force: true,
      });
      expect(
        warm.status,
        `precondition: owner ต้องแก้ช่วงวันได้ในรอบนี้ · ได้ ${warm.status}: ${await warm.clone().text()}\n` +
          "  🔴 ถ้าข้อนี้แดง เคส editor ข้างล่างไม่ได้พิสูจน์ว่า `owner` กัน — มันจะเขียวเพราะไม่มีใครผ่านเลย",
      ).toBe(200);

      const before = await daysOf();
      const res = await callAs(dCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-23", // เท่าเดิม → กิ่งลัด → แตะแค่ trips
      });
      const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
      expect(
        body?.code,
        `[trip PATCH] editor ได้ 409 STOPS_WOULD_BE_LOST — นั่นคือด่านข้อมูลหาย **ไม่ใช่ RLS**\n` +
          "  เคสนี้จะเขียวโดยไม่ได้พิสูจน์ว่า owner กันจริง (ส่งช่วงวันเดิมแล้วยังเข้ากิ่งนั้น = route เปลี่ยนรูป)",
      ).not.toBe("STOPS_WOULD_BE_LOST");
      const { verdict, detail } = await verdictFor(res);
      expect(
        verdict,
        `[trip PATCH] editor → **${verdict}** (${detail})\n` +
          "  🔴 leak = editor แก้ช่วงวันของทริปได้ ทั้งที่ `trips_update` เขียนว่า owner เท่านั้น\n" +
          "  ⚠️ เคส ② ข้างบนพิสูจน์แล้วว่า D เขียนทริปนี้ได้จริง ⇒ ปฏิเสธที่นี่ชี้ไปที่ `owner` ได้อย่างเดียว",
      ).toBe("rejected");
      expect(await daysOf(), "[trip PATCH] editor ถูกปฏิเสธแต่วันเปลี่ยน").toEqual(before);
    });

    /**
     * 🔴 **ผลข้างเคียงจากคำขอที่ถูกปฏิเสธ — `PATCH` คร่อมสองระดับสิทธิ์ในคำขอเดียว**
     * เจ้าของข้อ: P4 (อ่านโค้ดเจอ · ยิงยืนยันในเคสนี้) · 4 ก.ย. 2026
     *
     * ```
     * ① insertTripDays    trip_days_insert = can_write_trip   → **editor ผ่าน**
     * ② updateTripDates   trips_update     = owner            → **editor ไม่ผ่าน** → 403
     * ③ delete            ไม่ถูกเรียก (② return ไปแล้ว)
     * ```
     * ⇒ ผู้เรียกได้ `403 "ไม่มีสิทธิ์"` **ขณะที่วันใหม่ถูกเขียนลงฐานไปแล้วจริง**
     *   และมันค้างอยู่ **นอกช่วง `start_date`–`end_date` ของทริปตลอดไป** —
     *   ซึ่งเป็นสภาพที่ route ใบนี้เกิดมาเพื่อกำจัด
     *
     * 🎯 ***บล็อก "ล้มกลางทางแล้วเหลืออะไร" ของ route วิเคราะห์ครบทุกก้าวว่า *ก้าวนี้ล้ม* แล้วเหลืออะไร
     *    แต่ไม่มีบรรทัดไหนถาม *"ก้าวนี้สำเร็จ แล้วก้าวถัดไปปฏิเสธด้วยสิทธิ์คนละชุด"*** —
     *    เพราะไม่มี route ใบไหนก่อนหน้านี้คร่อมสองระดับสิทธิ์ จึงไม่มีบทเรียนเดิมให้ยืม
     *
     * ⚠️ **ไม่ใช่การยกระดับสิทธิ์** — editor เพิ่มวันเองผ่าน PostgREST ได้อยู่แล้ววันนี้
     *    สิ่งที่ผิดคือ *คำตอบที่เป็นเท็จบางส่วน* + *สภาพข้อมูลที่ขัดกับตัวมันเอง*
     * ✅ ทางแก้ที่เสนอ (P1 ตัดสิน): ย้าย `updateTripDates` ขึ้นเป็นก้าวแรก — มันเป็นก้าวเดียวที่
     *    ตอบได้ว่า *ผู้เรียกเป็น owner ไหม* และมันย้อนได้ ⇒ กฎ *"สิ่งที่ย้อนไม่ได้ไปทีหลัง"* ยังจริง
     */
    it("🔴 ⑨ editor ขยายช่วงวันแล้วถูกปฏิเสธ — ต้องไม่มีวันใหม่ค้างในฐาน", async () => {
      // 🔴 **precondition ในเคสเดียวกัน — ไม่พึ่งลำดับการรัน และมีเหตุผลที่หนักกว่าความสะอาด**
      //
      // เคสนี้ assert ว่า *ไม่มีอะไรเปลี่ยน* หลัง editor ถูกปฏิเสธ · **แต่ "ไม่มีอะไรเปลี่ยน"
      // เป็นจริงโดยอัตโนมัติถ้า `PATCH` ปฏิเสธ *ทุกคน*** — เช่นวันที่ migration
      // `20260904120000` ยังไม่ได้ลงฐาน (ไม่มี `grant update (start_date, end_date)`)
      // ⇒ **owner ก็แก้ไม่ได้ · editor ถูกปฏิเสธ · ฐานไม่ขยับ · เคสนี้เขียว**
      //
      // 🎯 ***และมันจะเขียวโดยตอบคำถามที่ผิด*** — คำถามคือ *"ก้าวที่ตรวจสิทธิ์เข้มสุดมาก่อนแล้วจริงไหม"*
      //    ไม่ใช่ *"มีอะไรเปลี่ยนไหม"* · เขียวแบบนั้นจะถูกอ่านว่า **การย้ายลำดับได้ผล** ทั้งที่ยังไม่เคยถูกทดสอบ
      // ⇒ พิสูจน์ก่อนว่า **owner เดินเส้นนี้ได้จริงในรอบนี้** แล้วผลของ editor ถึงมีความหมาย
      const warm = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-24", force: true,
      });
      expect(
        warm.status,
        `precondition: owner ต้องขยายช่วงวันได้ในรอบนี้ · ได้ ${warm.status}: ${await warm.clone().text()}\n` +
          "  🔴 403/502 ที่นี่ = เส้นทางแก้ช่วงวันใช้ไม่ได้กับ **ทุกคน** (migration ยังไม่ลงฐาน?)\n" +
          "     ⇒ ผลของ editor ข้างล่างจะเขียวโดยไม่ได้พิสูจน์เรื่องลำดับก้าวเลย — **หยุดที่นี่ดีกว่าเขียวหลอก**",
      ).toBe(200);

      const before = await daysOf();
      const res = await callAs(dCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-25", // ขยาย 2 วัน → เดินก้าว ① ก่อนโดน ② ปฏิเสธ
      });
      const { verdict, detail } = await verdictFor(res);
      expect(verdict, `[trip PATCH/ขยาย] editor → **${verdict}** (${detail})`).toBe("rejected");
      const after = await daysOf();
      expect(
        after,
        `🔴 คำขอถูกปฏิเสธ (${detail}) **แต่วันใหม่ถูกเขียนลงฐานแล้ว**\n` +
          `  ก่อน: ${before.length} วัน (ถึง ${before.at(-1)}) · หลัง: ${after.length} วัน (ถึง ${after.at(-1)})\n` +
          "  ⇒ ก้าว ① insertTripDays (can_write_trip) สำเร็จ ก่อนก้าว ② updateTripDates (owner) ปฏิเสธ\n" +
          "  ⇒ ทริปมีวันอยู่นอกช่วง start_date–end_date ค้างถาวร โดยผู้ใช้ได้คำตอบว่า 'ไม่มีสิทธิ์'",
      ).toEqual(before);
    });

    it("⑩ คนนอกทริปแก้ช่วงวันไม่ได้", async () => {
      const before = await daysOf();
      const res = await callAs(bCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-15",
      });
      const { verdict, detail } = await verdictFor(res);
      expect(verdict, `[trip PATCH] คนนอก → **${verdict}** (${detail})`).toBe("rejected");
      expect(await daysOf(), "[trip PATCH] คนนอกแก้ช่วงวันสำเร็จ (leak)").toEqual(before);
    });

    /**
     * 🔴 **`409 STOPS_WOULD_BE_LOST` — ด่านเดียวที่ยืนอยู่ระหว่าง "ย่อวัน" กับ "จุดแวะหายจริง"**
     *
     * `D73` (`rlsMatrix`) เลื่อนการตัดสินเรื่องนี้ไว้ พร้อมเขียนว่ายอมได้สองทาง: soft delete
     * **หรือ** *"ให้ตัวปรับช่วงวันปฏิเสธวันที่ยังมีจุดแวะ"* · migration `20260904120000` เลือกทางที่สอง
     * **แต่ทำเป็น "เตือนแล้วผ่านได้ด้วย `force`" ไม่ใช่ "ปฏิเสธ"** ⇒ เป็นการผ่อนจากถ้อยคำเดิม
     * ⇒ เคสนี้จึงต้องพิสูจน์ **ทั้งสองครึ่ง**: ด่านยิงจริงเมื่อมีของจะหาย · และ `force` เดินต่อได้จริง
     *
     * ⚠️ **ขอบเขตที่ต้องอ่านคู่กันเสมอ:** ด่านนี้อยู่ที่ *route* ไม่ใช่ที่ฐาน · `grant delete on trip_days`
     *    เปิดให้ **editor ยิง PostgREST ตรงแล้ว cascade ลบ `trip_stops` ได้โดยไม่ผ่านด่านนี้เลย**
     *    (`trip_stops_day_fk … on delete cascade` · `20260825140656:109-110`)
     *    🎯 ***`trip_stops` เป็น soft delete แต่ cascade เป็น hard delete*** — เคสสดของช่องนั้นอยู่ที่
     *    `rlsMatrix` บล็อก `trip_days` · **ที่นี่วัดเฉพาะด่านของ route**
     */
    /**
     * 🔴 **`409 STOPS_WOULD_BE_LOST` — การปฏิเสธ *ถาวร* ไม่มี `force`** (แก้ 4 ก.ย. 2026 หลังผมยิงเจอ)
     *
     * ## ฉบับแรกของเคสนี้ยืนยัน `force: true` แล้วมันแดง — **และแดงถูก**
     * ```
     * 409 → ส่ง force: true → **502 { code: "P0001" }** · partial: true
     * ```
     * `P0001` มาจาก trigger `app.assert_day_has_no_stops()` (`before delete on trip_days` ·
     * `20260825142639:94-105`) ⇒ ***route ถามผู้ใช้ว่า "ยืนยันจะทิ้งจุดแวะไหม" แล้วเดินต่อ
     * — แต่ฐานไม่เคยอนุญาตให้ทิ้ง มาตั้งแต่ 25 ส.ค.***
     * · และ `D73` เขียนถ้อยคำ *"ให้ตัวปรับช่วงวัน **ปฏิเสธ** วันที่ยังมีจุดแวะ"* ไว้ตั้งแต่ต้น
     *   ⇒ ฐานบังคับถ้อยคำเดิมอยู่แล้ว · ทางที่ route เขียนไว้ **ไม่เคยเปิด**
     *
     * ## ⚠️ เคสนี้ยืนยัน `nothingWritten` **ที่ฐาน ไม่ใช่จากคำตอบ**
     * `nothingWritten: true` เป็น *คำกล่าวอ้างในเพย์โหลด* — บั๊กฉบับแรกเขียน `start_date`/`end_date`
     * ไปแล้วก่อนล้ม ⇒ **ถ้าเชื่อเพย์โหลด เราจะพลาดรูปเดิมเป๊ะถ้ามันกลับมา**
     */
    it("🔴 ⑪ ย่อช่วงวันที่มีจุดแวะ → 409 ถาวร · ไม่มีอะไรถูกเขียน · `force` ไม่ใช่ทางลัดอีกต่อไป", async () => {
      // ตั้งสถานะให้แน่นอน — ไม่พึ่งผลของเคสก่อนหน้า (⑨ กำลังวัดว่ามีของรั่วไหม)
      const norm = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-23",
      });
      expect(norm.status, `setup: ตั้งช่วงวันควร 200: ${await norm.clone().text()}`).toBe(200);
      expect((await daysOf()).length, "setup: ควรได้ 13 วันพอดี").toBe(13);

      const lastDay = await dayIdOf("2026-10-23");
      const mk = await postAs(aCookies, tripE, stopsPOST, { planId: ePlan, tripDayId: lastDay, kind: "hotel" });
      expect(mk.status, `setup: สร้างจุดแวะควร 201: ${await mk.clone().text()}`).toBe(201);
      const stopId = ((await mk.json()) as { id: string }).id;

      /** ช่วงวันของตัวทริปเอง — `nothingWritten` ต้องจริงกับคอลัมน์พวกนี้ด้วย ไม่ใช่แค่จำนวนวัน */
      const rangeOf = async () => {
        const { data, error } = await admin.from("trips").select("start_date, end_date").eq("id", tripE).single();
        if (error) throw new Error(`admin อ่านช่วงวันของ tripE: ${error.message}`);
        return `${data.start_date}..${data.end_date}`;
      };
      const beforeRange = await rangeOf();
      const beforeDays = await daysOf();

      const shrink = (body: Record<string, unknown>) =>
        callAs(aCookies, tripE, tripPATCH, "PATCH", { startDate: "2026-10-11", endDate: "2026-10-21", ...body });

      const blocked = await shrink({});
      expect(blocked.status, `ย่อวันที่มีจุดแวะควร 409: ${await blocked.clone().text()}`).toBe(409);
      const body = (await blocked.json()) as {
        code?: string; losingStops?: number; losingDates?: string[]; nothingWritten?: boolean;
      };
      expect(body.code).toBe("STOPS_WOULD_BE_LOST");
      expect(body.losingStops, "จำนวนจุดแวะที่จะหายไม่ตรงกับที่สร้างไว้ 1 จุด").toBe(1);
      expect(body.losingDates?.sort(), "วันที่จะถูกถอนไม่ตรง").toEqual(["2026-10-22", "2026-10-23"]);
      expect(body.nothingWritten, "route ต้องประกาศว่าไม่ได้เขียนอะไร").toBe(true);

      // 🔴 ยืนยันคำกล่าวอ้างนั้น **ที่ฐาน** — ทั้งจำนวนวัน *และ* ช่วงวันของตัวทริป
      expect(await daysOf(), "409 แล้ววันเปลี่ยน").toEqual(beforeDays);
      expect(
        await rangeOf(),
        "🔴 `nothingWritten: true` แต่ `trips.start_date`/`end_date` ขยับแล้ว\n" +
          "  ⇒ นี่คือรูปของบั๊กเดิมเป๊ะ (แก้ช่วงวันสำเร็จ แล้วลบวันล้ม ⇒ ทริปค้างครึ่งทาง)",
      ).toBe(beforeRange);

      // 🔴 **regression guard: `force` ต้องไม่ใช่ทางลัดอีก** — ถ้ามีคนเติมกลับมา เคสนี้แดง
      //    (ทางนั้นเดินไม่ถึงปลายอยู่แล้ว เพราะ trigger กัน ⇒ เติมกลับ = คืนสภาพครึ่งทาง)
      const forced = await shrink({ force: true });
      expect(
        forced.status,
        `ส่ง force: true แล้วได้ ${forced.status}: ${await forced.clone().text()}\n` +
          "  🔴 200 = มีคนเปิดทางลัดกลับมา · 502 = ทางลัดเปิดแล้วไปตายที่ trigger (บั๊กเดิม)",
      ).toBe(409);
      expect(await rangeOf(), "force แล้วช่วงวันขยับ = ด่านยิงหลังเขียน").toBe(beforeRange);

      // ✅ ทางออกที่ `409` บอกให้ทำ ต้องใช้ได้จริง — ไม่งั้นข้อความนั้นเป็นทางตัน
      const del = await aClient.rpc("soft_delete_trip_stop", { p_id: stopId });
      expect(del.error, `ลบจุดแวะล้ม: ${del.error?.message}`).toBeNull();
      const after = await shrink({});
      expect(after.status, `เอาจุดแวะออกแล้วย่อวันควร 200: ${await after.clone().text()}`).toBe(200);
      expect((await daysOf()).length, "ย่อสำเร็จแล้ววันส่วนเกินยังอยู่").toBe(11);
    });

    /**
     * 🔴 **`409` ต้องนับเฉพาะจุดแวะที่ *ยังอยู่จริง* — `trip_stops` เป็น soft delete (`D76`)**
     * เจ้าของข้อ: P4 · 4 ก.ย. 2026 (ด่าน `stopOrderingContract` จับ `stopCountInDays` ได้ก่อน)
     *
     * ```
     * ผู้ใช้ลบจุดแวะของวันท้ายออกหมด  →  ย่อทริป
     * → 409 "จะเสียจุดแวะ N จุด"  ทั้งที่ **ไม่มีจุดแวะเหลืออยู่เลยสักจุด**
     * ```
     * 🎯 ***ด่านที่เกิดมาเพื่อกันข้อมูลหาย กลายเป็นด่านที่บล็อกการกระทำที่ไม่ทำให้อะไรหายเลย***
     * ⇒ ผู้ใช้เรียนรู้ว่าต้องกด `force` ทุกครั้ง **ซึ่งฆ่าค่าของด่านทั้งใบ** — แพงกว่าตัวเลขที่ผิด
     *
     * ⚠️ **เคส ⑪ ข้างบนคือ positive control ของเคสนี้** — มันพิสูจน์ว่า `409` ยิงเป็นเมื่อมีของจริง
     *    ไม่มีข้อนั้น "ไม่ได้ 409" ที่นี่จะแยกไม่ออกจาก *"ด่านไม่เคยทำงานเลย"*
     */
    it("🔴 ⑫ จุดแวะที่ถูก soft delete แล้ว ต้องไม่ถูกนับใน 409", async () => {
      // 🔴 **ตั้งสถานะเองให้ครบ ไม่พึ่งผลของ ⑪ เลย** — ⑪ กำลังจับบั๊กจริงอยู่ (`force` ใช้ไม่ได้)
      //    ⇒ มันจะทิ้งทริปไว้ในสภาพที่ไม่แน่นอน · ฉบับแรกของเคสนี้พึ่งสภาพนั้น แล้วล้มที่ `setup`
      //    ด้วยข้อความที่ชี้ไปที่ `409` **ทั้งที่ปัญหาคือเคสก่อนหน้าไม่ได้จบอย่างที่คิด**
      // 🎯 ***เคสที่ล้มเพราะเคสอื่นล้ม รายงานอาการของตัวเอง ไม่ใช่ของต้นเหตุ — และมันชี้คนไปผิดที่***
      // ① ล้างจุดแวะที่ยัง active ทั้งหมดของ tripE ก่อน (soft delete ผ่าน RPC ตาม `D76`)
      const { data: liveStops, error: lsErr } = await admin
        .from("trip_stops").select("id").eq("trip_id", tripE).is("deleted_at", null);
      if (lsErr) throw new Error(`admin อ่าน trip_stops ของ tripE: ${lsErr.message}`);
      for (const r of liveStops ?? []) {
        const del = await aClient.rpc("soft_delete_trip_stop", { p_id: (r as { id: string }).id });
        expect(del.error, `setup: ล้างจุดแวะเดิมล้ม: ${del.error?.message}`).toBeNull();
      }
      // ② ตั้งช่วงวันให้แน่นอน — ตอนนี้ไม่มีจุดแวะ active แล้ว จึงไม่ควรติด 409 และลบวันส่วนเกินได้
      const norm = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-21",
      });
      expect(norm.status, `setup: ตั้งช่วงวันควร 200: ${await norm.clone().text()}`).toBe(200);
      expect((await daysOf()).length, "setup: ควรเหลือ 11 วัน").toBe(11);

      const grow = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-22",
      });
      expect(grow.status, `setup: ขยายวันควร 200: ${await grow.clone().text()}`).toBe(200);
      const extra = await dayIdOf("2026-10-22");
      const mk = await postAs(aCookies, tripE, stopsPOST, { planId: ePlan, tripDayId: extra, kind: "hotel" });
      expect(mk.status, `setup: สร้างจุดแวะควร 201: ${await mk.clone().text()}`).toBe(201);
      const stopId = ((await mk.json()) as { id: string }).id;

      const del = await aClient.rpc("soft_delete_trip_stop", { p_id: stopId });
      expect(del.error, `setup: soft delete ล้ม: ${del.error?.message}`).toBeNull();
      // 🔴 ยืนยันว่ามัน soft ไม่ใช่ hard — ถ้าแถวหายจริง เคสนี้จะเขียวโดยไม่ได้ทดสอบอะไร
      const { data: row, error: rowErr } = await admin
        .from("trip_stops").select("deleted_at").eq("id", stopId).maybeSingle();
      if (rowErr) throw new Error(`admin อ่าน trip_stops: ${rowErr.message}`);
      expect(row, "setup: แถวหายจริง = ไม่ใช่ soft delete → เคสนี้ทดสอบอะไรไม่ได้").toBeTruthy();
      expect(row?.deleted_at, "setup: soft delete แล้วแต่ deleted_at ยังว่าง").not.toBeNull();

      const res = await callAs(aCookies, tripE, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-21",
      });
      const body = (await res.clone().json().catch(() => null)) as { code?: string; losingStops?: number } | null;
      expect(
        res.status,
        `🔴 ย่อวันที่มีแต่จุดแวะที่ถูกลบไปแล้ว ควร 200 · ได้ ${res.status}: ${JSON.stringify(body)}\n` +
          "  ⇒ `stopCountInDays` ไม่ได้กรอง `.is(\"deleted_at\", null)` → นับ tombstone เป็นของที่จะหาย\n" +
          "  ⇒ ด่าน 409 บล็อกการกระทำที่ไม่ทำให้อะไรหายเลย (เคส ⑪ พิสูจน์แล้วว่าด่านยิงเป็นเมื่อมีของจริง)",
      ).toBe(200);
      expect((await daysOf()).length, "ย่อสำเร็จแล้ววันส่วนเกินยังอยู่").toBe(11);
    });
    // ═══════════════════════════════════════════════════════════════════════
    // 🔴 `E5-pin` — `PUT /trips/[tripId]/pin` (route ที่ 13 · P1 · 4 ก.ย. 2026)
    //
    // ## 🔴 ใบนี้ **กลับด้าน** กับอีก 12 ใบ และ probe ต้องกลับด้านตาม
    // ```
    // 12 ใบก่อนหน้า   viewer ถูกปฏิเสธ = ด่านทำงาน   ·  viewer สำเร็จ = leak
    // pin             viewer **สำเร็จ** = ด่านทำงาน  ·  viewer ถูกปฏิเสธ = **ฟีเจอร์ตาย**
    // ```
    // หมุดเก็บที่ `trip_members.pinned_at` **ของผู้เรียกเอง** ⇒ เป็นมุมมองส่วนตัว ไม่ใช่การแก้ทริป
    // 🎯 ***ถ้าลอกรูป probe ของใบอื่นมาใช้ เคสจะเขียวตอนฟีเจอร์พัง*** — `viewer ถูกปฏิเสธ` คือ
    //    ผลที่ probe ใบอื่นเรียกว่า "ผ่าน" และที่นี่มันคืออาการที่ผู้ใช้เจอว่า "ปุ่มปักหมุดใช้ไม่ได้"
    //
    // ## ⚠️ คนนอกได้ `404` ไม่ใช่ `403` — โดยตั้งใจ (ไม่ยืนยันว่าทริปมีอยู่)
    // ทั้งสองอยู่ใน `rejectStatuses` ปริยายอยู่แล้ว ⇒ `verdictFor` แยกไม่ออก
    // **จึงยืนยันรหัสตรง ๆ ด้วย** ไม่พึ่งตัวจำแนกอย่างเดียว
    // ═══════════════════════════════════════════════════════════════════════
    describe("🔴 E5-pin — ปักหมุดเป็นมุมมองส่วนตัว (viewer ต้อง *ผ่าน*)", () => {
      /** `pinned_at` ของสมาชิกทุกคนในทริป — อ่านด้วย owner (`trip_members_select` = can_read_trip) */
      const pinsOf = async (): Promise<Record<string, boolean>> => {
        const { data, error } = await aClient
          .from("trip_members").select("user_id, pinned_at").eq("trip_id", tripE);
        if (error) throw new Error(`อ่าน trip_members: ${error.message}`);
        return Object.fromEntries(
          (data ?? []).map((r) => {
            const row = r as { user_id: string; pinned_at: string | null };
            return [row.user_id, row.pinned_at != null];
          }),
        );
      };

      it("① owner ปักหมุดได้ (เคสควบคุมฝั่งบวกของทั้งบล็อก)", async () => {
        const res = await callAs(aCookies, tripE, pinPUT, "PUT", { pinned: true });
        expect(res.status, `owner ปักหมุดควร 200: ${await res.clone().text()}`).toBe(200);
        expect((await pinsOf())[ids.a], "ตอบ 200 แต่ `pinned_at` ยังว่าง = RPC ไม่ได้เขียนอะไร").toBe(true);
      });

      /**
       * 🔴 **หัวใจของใบนี้ — และเป็นเคสเดียวในไฟล์ที่ `viewer สำเร็จ` คือผลที่ถูกต้อง**
       * ถ้าใครเผลอผูก RPC กับ `can_write_trip` (ซึ่งเป็นรูปที่ตารางลูกทุกใบใช้ และเป็นสิ่งที่มือจะพิมพ์เอง)
       * เคสนี้จะแดง · **ไม่มีเคสอื่นในสแตกนี้จับได้เลย** เพราะทุกใบอื่นคาดหวังตรงกันข้าม
       */
      it("🔴 ② viewer ปักหมุดได้ — ผูก `can_write_trip` เมื่อไหร่ ข้อนี้แดง (ไม่มีเคสอื่นจับ)", async () => {
        const res = await callAs(cCookies, tripE, pinPUT, "PUT", { pinned: true });
        expect(
          res.status,
          `viewer ปักหมุดควร 200 · ได้ ${res.status}: ${await res.clone().text()}\n` +
            "  🔴 403 = RPC ผูกกับสิทธิ์ *เขียนทริป* ทั้งที่หมุดเป็นมุมมองส่วนตัว ⇒ ปุ่มปักหมุดใช้ไม่ได้สำหรับ viewer\n" +
            "  ⚠️ ผลนี้คือสิ่งที่ probe ใบอื่นในไฟล์นี้เรียกว่า 'ด่านทำงาน' — ที่นี่มันคือฟีเจอร์ตาย",
        ).toBe(200);
        expect((await pinsOf())[ids.c], "viewer ได้ 200 แต่หมุดไม่ถูกเขียน").toBe(true);
      });

      /**
       * 🔴 **มุมมองส่วนตัวจริงไหม — วัด *สองชั้น* เพราะมันพังได้คนละแบบ**
       *
       * ```
       * ชั้นข้อมูล    `trip_members.pinned_at` ของแต่ละคนแยกกันไหม
       * ชั้นที่ผู้ใช้เห็น  `GET /trips` ของ *คนละคน* คืน `pinnedAt` ต่างกันไหม
       * ```
       * 🎯 ***ชั้นล่างถูกแล้ว ชั้นบนยังพังได้*** — ตัวรวมรายการอ่านหมุด **ของใครก็ได้** ของทริปนั้น
       *    แล้วแปะให้ทุกคนเหมือนกัน จะผ่านชั้นล่างสบาย ๆ · เคสที่ P1 ขอคือชั้นบนโดยเฉพาะ
       * · 🔴 **ไม่พึ่ง `pinsOf()` ในครึ่งหลัง** — มันอ่านด้วย client ของ A · ถ้าอ่านฝั่งผู้ใช้ผ่าน A
       *   คนเดียว เราจะไม่มีวันเห็นว่าคำตอบของ C ต่างไหม **ต้องยิงในนามคนที่สอง**
       */
      it("🔴 ③ หมุดเป็นมุมมองส่วนตัว — แยกกันทั้งชั้นข้อมูลและชั้นที่ผู้ใช้เห็น", async () => {
        // ── ชั้นข้อมูล
        const pins = await pinsOf();
        expect(pins[ids.a], "setup: A ควรปักไว้แล้วจากเคส ①").toBe(true);
        expect(
          pins[ids.d],
          "🔴 D (editor · ไม่เคยกดปัก) มี `pinned_at` = หมุดถูกเก็บเป็นคุณสมบัติของ *ทริป* ไม่ใช่ของ *คน*",
        ).toBe(false);

        // ── ชั้นที่ผู้ใช้เห็น — ยิง `GET /trips` **ในนามสองคน** แล้วเทียบทริปใบเดียวกัน
        const listAs = async (cookies: Cookie[]) => {
          jar.cookies = cookies;
          const res = await tripsGET(new NextRequest("http://localhost:3300/api/engine/trips"));
          expect(res.status, `GET /trips ควร 200: ${await res.clone().text()}`).toBe(200);
          const rows = (await res.json()) as Array<{ id: string; pinnedAt?: string | null }>;
          return rows.find((t) => t.id === tripE);
        };

        const mineA = await listAs(aCookies);
        expect(mineA, "A ไม่เห็น tripE ใน GET /trips").toBeDefined();
        expect(
          mineA?.pinnedAt,
          "🔴 A ปักไว้แล้วแต่ `GET /trips` คืน pinnedAt = null\n" +
            "  ⇒ เส้นทาง *เขียน* กับเส้นทาง *อ่าน* ไม่ได้ต่อกัน · ผู้ใช้กดปักแล้วหน้าจอไม่ขยับ",
        ).toBeTruthy();

        const mineD = await listAs(dCookies);
        expect(mineD, "D (สมาชิก) ไม่เห็น tripE ใน GET /trips").toBeDefined();
        expect(
          mineD?.pinnedAt,
          "🔴 D ไม่เคยกดปัก แต่ `GET /trips` ของ D คืนหมุดของ A มาให้\n" +
            "  ⇒ ตัวรวมรายการอ่านหมุด *ของทริป* ไม่ใช่ *ของผู้เรียก* — ชั้นข้อมูลถูก แต่ชั้นที่ผู้ใช้เห็นพัง",
        ).toBeNull();
      });

      it("🔴 ④ คนนอกทริปได้ `404` ไม่ใช่ `403` — ไม่ยืนยันว่าทริปนี้มีอยู่", async () => {
        const before = await pinsOf();
        const res = await callAs(bCookies, tripE, pinPUT, "PUT", { pinned: true });
        const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
        const { verdict, detail } = await verdictFor(res);
        expect(verdict, `[pin] คนนอก → **${verdict}** (${detail})`).toBe("rejected");
        // 🔴 `403` กับ `404` เป็น `rejected` ทั้งคู่ ⇒ ตัวจำแนกแยกไม่ออก · ยืนยันรหัสเอง
        expect(
          res.status,
          `[pin] คนนอกได้ ${res.status} · **403 = ยืนยันให้คนนอกรู้ว่าทริปนี้มีอยู่จริง**\n` +
            "  ⇒ กลายเป็นเครื่องมือถามว่า uuid ไหนเป็นทริปจริง (รูปเดียวกับที่ members route เลี่ยงไว้)",
        ).toBe(404);
        expect(body?.code).toBe("NOT_FOUND");
        expect(await pinsOf(), "[pin] คนนอกถูกปฏิเสธแต่แถวเปลี่ยน").toEqual(before);
      });

      it("⑤ ถอนหมุดได้ · และถอนของตัวเองเท่านั้น", async () => {
        const res = await callAs(cCookies, tripE, pinPUT, "PUT", { pinned: false });
        expect(res.status, `ถอนหมุดควร 200: ${await res.clone().text()}`).toBe(200);
        const pins = await pinsOf();
        expect(pins[ids.c], "C ถอนหมุดแล้วยังปักอยู่").toBe(false);
        // 🔴 คู่ควบคุม — ถอนของตัวเองต้องไม่ไปล้างของคนอื่น
        //    ไม่มีข้อนี้ RPC ที่เขียนว่า `where trip_id = …` (ลืม `user_id`) จะผ่านฉลุย
        expect(
          pins[ids.a],
          "🔴 C ถอนหมุดแล้วหมุดของ A หายไปด้วย = RPC ไม่ได้กรองด้วย `user_id` ของผู้เรียก",
        ).toBe(true);
      });

      it("⑥ `pinned` ต้องเป็น boolean แท้ — ไม่รับ `\"true\"` / `1` / ขาดฟิลด์", async () => {
        for (const bad of [{ pinned: "true" }, { pinned: 1 }, {}]) {
          const res = await callAs(aCookies, tripE, pinPUT, "PUT", bad);
          expect(res.status, `body ${JSON.stringify(bad)} ควร 400: ${await res.clone().text()}`).toBe(400);
        }
        // ค่าที่ถูกต้องต้องยังผ่าน — ไม่งั้นตัวตรวจแคบเกินแล้วเคสข้างบนเขียวฟรี
        const ok = await callAs(aCookies, tripE, pinPUT, "PUT", { pinned: true });
        expect(ok.status, "boolean แท้ต้องผ่าน (คู่ควบคุมของเคสข้างบน)").toBe(200);
      });
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 `E5-tpl` — ทริปแนะนำ (`20260904180000` · P1 · ลงฐาน 4 ก.ย. 2026)
  // เจ้าของ probe: P4 · **คนเขียน SQL ≠ คนเขียน probe** โดยตั้งใจ
  //
  // ## ⚠️ ขอบเขตที่ต้องอ่านคู่กับผลเสมอ — เขียนไว้ก่อนเคสแรก
  // 🔴 **`copy_trip_template` ยังไม่มี route** ⇒ เคสข้างล่างยิง **RPC ตรงในนามผู้ใช้**
  //    ⇒ ***วัด "ตัวฟังก์ชันถูกไหม" ไม่ได้วัด "เส้นทางที่ผู้ใช้จะเดินจริง"***
  //    วันที่ route มา **ต้องเพิ่มเคสผ่าน route** ไม่ใช่คิดว่าครอบแล้ว (รูปเดียวกับที่ `rlsMatrix`
  //    วัดชั้นตาราง แล้ว `GET /trips` ยังคืน 502 ให้ทุกคนอยู่สองวัน — `fae94fe`)
  //
  // ## 🔴 P1 รันใบนี้บนฐานทิ้งในเครื่องแล้ว **แต่ที่นั่นเป็น superuser ⇒ RLS ไม่ทำงาน**
  // ⇒ ***เคสสิทธิ์ทุกข้อผ่านฟรีที่นั่นตามนิยาม*** · โดยเฉพาะข้อ ⑧ (ผู้ใช้นอกทริปก๊อปได้)
  //    ซึ่งเขามีผลลัพธ์ที่ *อ่านเหมือนยืนยัน* อยู่แล้ว และมันไม่ได้ยืนยันอะไรเลย
  // ⇒ **บล็อกนี้คือที่เดียวที่ชั้นสิทธิ์ของฟีเจอร์นี้ถูกวัด**
  // ═══════════════════════════════════════════════════════════════════════════
  describe("🔴 E5-tpl — ทริปแนะนำ: ก๊อปได้ครบ · ติดธงเองไม่ได้ · ของที่ลบแล้วไม่ฟื้น", () => {
    let tplId = "";
    let tplPlan = "";
    let tplCustom = "";   // custom place ที่ยังใช้งานอยู่
    let tplDeleted = "";  // custom place ที่ถูก soft delete — ต้องไม่ตามไป

    beforeAll(async () => {
      // ── สร้าง "ทริปแนะนำ" ด้วยมือ: 3 วัน · 2 จุดแวะ · custom place 2 ใบ (ใบหนึ่งถูกลบ)
      tplId = await mkTrip(aClient, "a");
      const patch = await callAs(aCookies, tplId, tripPATCH, "PATCH", {
        startDate: "2026-10-11", endDate: "2026-10-13",
      });
      expect(patch.status, `setup: ตั้งช่วงวัน template: ${await patch.clone().text()}`).toBe(200);

      const plan = await aClient.from("trip_plans").select("id").eq("trip_id", tplId).single();
      if (plan.error) throw new Error(`setup: อ่านแผน template: ${plan.error.message}`);
      tplPlan = plan.data.id as string;

      const mkCustom = async (name: string) => {
        const r = await postAs(aCookies, tplId, customPlacesPOST, {
          city: citySlug, category: "food", maps_query: `q-${name}`, name_th: name, lat: 37.5, lng: 127.0,
        });
        expect(r.status, `setup: สร้าง custom place ${name}: ${await r.clone().text()}`).toBe(201);
        return ((await r.json()) as { id: string }).id;
      };
      tplCustom = await mkCustom(`tpl-live-${stamp}`);
      tplDeleted = await mkCustom(`tpl-dead-${stamp}`);

      const day1 = await aClient.from("trip_days").select("id").eq("trip_id", tplId).order("date").limit(1).single();
      if (day1.error) throw new Error(`setup: อ่านวันแรกของ template: ${day1.error.message}`);

      // จุดแวะ ① ชี้ custom place ที่ยังอยู่ · ② ชี้คลังกลาง (slug)
      for (const placeId of [tplCustom, placeSlug]) {
        const r = await postAs(aCookies, tplId, stopsPOST, {
          planId: tplPlan, tripDayId: day1.data.id, placeId,
        });
        expect(r.status, `setup: เพิ่มจุดแวะ (${placeId}): ${await r.clone().text()}`).toBe(201);
      }

      // 🔴 ลบ custom place ใบที่สอง — มันไม่ได้ถูกใช้เป็นจุดแวะ จึงลบได้ (trigger `custom_places_not_in_use`)
      const del = await aClient.rpc("soft_delete_custom_place", { p_id: tplDeleted });
      expect(del.error, `setup: soft delete custom place: ${del.error?.message}`).toBeNull();

      // ── ติดธง: `published_template_at` **ไม่มี column grant ให้ `authenticated`** ⇒ ต้องใช้ service_role
      //    🎯 นั่นคือคุณสมบัติที่เคส ⑤ ยืนยัน — ที่นี่เราใช้ทางที่ทีมใช้จริง (SQL ฝั่งเซิร์ฟเวอร์)
      const flag = await admin.from("trips").update({ published_template_at: new Date().toISOString() }).eq("id", tplId);
      if (flag.error) throw new Error(`setup: ติดธง template: ${flag.error.message}`);
    });

    /** สรุปทริปหนึ่งใบจากฐาน — ใช้เทียบต้นฉบับกับสำเนา */
    const shapeOf = async (tripId: string) => {
      const days = await admin.from("trip_days").select("id, date").eq("trip_id", tripId);
      if (days.error) throw new Error(`admin อ่านวัน: ${days.error.message}`);
      const stops = await admin.from("trip_stops").select("id, rank, catalog_place_id, custom_place_id, trip_day_id")
        .eq("trip_id", tripId).is("deleted_at", null);
      if (stops.error) throw new Error(`admin อ่านจุดแวะ: ${stops.error.message}`);
      return {
        dates: (days.data ?? []).map((d) => (d as { date: string }).date).sort(),
        stops: (stops.data ?? []) as unknown as {
          id: string; rank: string; catalog_place_id: string | null; custom_place_id: string | null;
        }[],
      };
    };
    /** custom_places ที่ **ยังไม่ถูกลบ** ของทริปหนึ่ง — อ่านด้วยเจ้าของ (service_role ไม่มี grant) */
    const customsOf = async (client: SupabaseClient, tripId: string) => {
      const { data, error } = await client.from("custom_places").select("id").eq("trip_id", tripId);
      if (error) throw new Error(`อ่าน custom_places: ${error.message}`);
      return (data ?? []).map((r) => (r as { id: string }).id);
    };

    it("① `GET /api/engine/trip-templates` — เห็น template ที่ติดธง พร้อม day/night count จากฐาน", async () => {
      jar.cookies = aCookies;
      const res = await templatesGET(new NextRequest("http://localhost:3300/api/engine/trip-templates"));
      expect(res.status, `ควร 200: ${await res.clone().text()}`).toBe(200);
      const body = (await res.json()) as { templates: { id: string; dayCount: number; nightCount: number }[] };
      const mine = body.templates.find((t) => t.id === tplId);
      expect(mine, "ติดธงแล้วแต่ไม่โผล่ในรายการ").toBeDefined();
      // 3 วัน (11–13 ต.ค.) ⇒ 3 วัน 2 คืน · **มาจากฐาน ไม่ใช่ UI คำนวณ**
      expect(mine!.dayCount, "dayCount ผิด").toBe(3);
      expect(mine!.nightCount, "nightCount ผิด — `5 วัน 4 คืน` ต้องมาจากที่เดียว").toBe(2);
    });

    it("🔴 ② ทริปที่ **ไม่ได้ติดธง** ต้องไม่โผล่ในรายการ (คู่ควบคุมของ ①)", async () => {
      jar.cookies = aCookies;
      const res = await templatesGET(new NextRequest("http://localhost:3300/api/engine/trip-templates"));
      const body = (await res.json()) as { templates: { id: string }[] };
      const ids = body.templates.map((t) => t.id);
      expect(
        ids.includes(tripA),
        "ทริปธรรมดาของ A โผล่ในรายการทริปแนะนำ = `published_template_at is not null` ไม่ได้กรอง\\n" +
          "  🔴 ถ้าข้อนี้แดง แปลว่า **ทริปส่วนตัวของทุกคนถูกประกาศเป็นสาธารณะ**",
      ).toBe(false);
    });

    it("🔴 ③ ก๊อป → วัน · จุดแวะ · ลำดับ ต้องเท่าต้นฉบับ · และวันเลื่อนทั้งชุดเท่ากัน", async () => {
      const src = await shapeOf(tplId);
      const { data, error } = await aClient.rpc("copy_trip_template", {
        p_template_id: tplId, p_start_date: "2026-12-01", p_title: null,
      });
      expect(error, `ก๊อปล้ม: ${error?.message}`).toBeNull();
      const copyId = (data as { id: string }).id;
      const dst = await shapeOf(copyId);

      expect(dst.dates.length, "จำนวนวันไม่เท่าต้นฉบับ").toBe(src.dates.length);
      expect(dst.dates, "วันไม่ได้เลื่อนทั้งชุดเป็นช่วงใหม่").toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
      expect(dst.stops.length, "จำนวนจุดแวะไม่เท่าต้นฉบับ").toBe(src.stops.length);
      expect(
        dst.stops.map((s) => s.rank).sort(),
        "ลำดับ (`rank`) ไม่ตรงกับต้นฉบับ",
      ).toEqual(src.stops.map((s) => s.rank).sort());
    });

    it("🔴 ④ ก๊อปทริปที่ **ไม่ได้ติดธง** → `P0002` ไม่ใช่ทริปเปล่า (ด่านเดียวของฟังก์ชัน)", async () => {
      const before = await shapeOf(tripA);
      const { error } = await aClient.rpc("copy_trip_template", {
        p_template_id: tripA, p_start_date: "2026-12-01", p_title: null,
      });
      expect(
        error?.code ?? error?.message ?? "",
        "ก๊อปทริปที่ไม่ได้ติดธงสำเร็จ = `published_template_at is not null` หายจาก `where`\\n" +
          "  🔴 definer ข้าม RLS ⇒ **บรรทัดนั้นคือด่านเดียวที่เหลือ** — หายเมื่อไหร่ = ก๊อปทริปของใครก็ได้",
      ).toMatch(/P0002|ไม่พบทริปแนะนำ/);
      expect((await shapeOf(tripA)).stops.length, "ถูกปฏิเสธแต่ต้นฉบับถูกแตะ").toBe(before.stops.length);
    });

    it("🔴 ⑤ ไคลเอนต์ติดธงเองไม่ได้ — `published_template_at` ไม่มี column grant", async () => {
      const { error } = await aClient.from("trips")
        .update({ published_template_at: new Date().toISOString() }).eq("id", tripA);
      expect(
        error?.code,
        "เจ้าของทริปตั้ง `published_template_at` เองได้ = ใครก็ประกาศทริปตัวเองเป็นทริปแนะนำได้",
      ).toBe("42501");
    });

    it("🔴 ⑥ custom place ต้องถูกก๊อป **และจุดแวะต้องชี้ใบใหม่** ไม่ใช่ของ template", async () => {
      const { data, error } = await aClient.rpc("copy_trip_template", {
        p_template_id: tplId, p_start_date: "2027-03-01", p_title: null,
      });
      expect(error, `ก๊อปล้ม: ${error?.message}`).toBeNull();
      const copyId = (data as { id: string }).id;

      const copies = await customsOf(aClient, copyId);
      expect(copies.length, "custom place ไม่ถูกก๊อปมาเลย").toBeGreaterThan(0);
      expect(
        copies.includes(tplCustom),
        "ทริปใหม่ถือ **id เดิม** ของ template ⇒ FK ประกอบ `(trip_id, custom_place_id)` ต้องระเบิดตั้งแต่แรก",
      ).toBe(false);

      const dst = await shapeOf(copyId);
      const pointing = dst.stops.filter((s) => s.custom_place_id != null);
      expect(pointing.length, "ไม่มีจุดแวะไหนชี้ custom place เลย — กิ่ง remap ไม่ถูกเดิน").toBe(1);
      expect(
        pointing[0].custom_place_id,
        "🔴 จุดแวะของทริปใหม่ยังชี้ custom place **ของ template** — remap ไม่ทำงาน",
      ).not.toBe(tplCustom);
      expect(copies, "จุดแวะชี้ไปที่ id ที่ไม่ได้อยู่ในทริปตัวเอง").toContain(pointing[0].custom_place_id);
    });

    it("🔴 ⑦ custom place ที่ถูก soft delete **ต้องไม่ฟื้น** ในทริปที่ก๊อป", async () => {
      const { data, error } = await aClient.rpc("copy_trip_template", {
        p_template_id: tplId, p_start_date: "2027-04-01", p_title: null,
      });
      expect(error, `ก๊อปล้ม: ${error?.message}`).toBeNull();
      const copyId = (data as { id: string }).id;

      // 🔴 ต้นฉบับมี custom place 2 ใบ · ใบหนึ่งถูกลบ ⇒ สำเนาต้องได้ **ใบเดียว**
      //    ⚠️ **ตรวจที่ตาราง `custom_places` ตรง ๆ ไม่ใช่ที่จุดแวะ** (P1 ชี้) —
      //       บั๊กเดิมทำให้แถวฟื้นเป็นของ *ที่ยังไม่ถูกลบ* **โดยไม่ผูกกับจุดแวะไหนเลย**
      //       ⇒ เคสที่ดูแค่ `trip_stops` จะเขียวทั้งที่ผู้ใช้เห็นสถานที่ขยะในคลังทริปตัวเอง
      expect(
        (await customsOf(aClient, copyId)).length,
        "🔴 ทริปที่ก๊อปมามี custom place เกินหนึ่งใบ = ใบที่ทีมลบทิ้งแล้ว **ฟื้นในทริปของผู้ใช้**",
      ).toBe(1);
    });

    /**
     * 🔴 **ข้อที่สนามซ้อมในเครื่องตอบไม่ได้ตามนิยาม** — ที่นั่นรันเป็น superuser ⇒ RLS ไม่ทำงาน
     * ⇒ *"ผู้ใช้นอกทริปก๊อปได้"* **ผ่านฟรีที่นั่นเสมอ** ไม่ว่าฟังก์ชันจะถูกหรือผิด
     * 🎯 ***ที่นี่คือที่เดียวที่คำถามนี้ถูกถามจริง***
     */
    it("🔴 ⑧ ผู้ใช้ที่ **ไม่ได้เป็นสมาชิก** template ต้องก๊อปได้ · และได้เป็น owner ของสำเนา", async () => {
      const { data, error } = await bClient.rpc("copy_trip_template", {
        p_template_id: tplId, p_start_date: "2027-05-01", p_title: `ของ B ${stamp}`,
      });
      expect(
        error,
        `B (ไม่ได้เป็นสมาชิก template) ก๊อปไม่ได้: ${error?.message}\\n` +
          "  🔴 ถ้าแดง = ฟีเจอร์ตาย — ทริปแนะนำมีไว้ให้คนที่ไม่ได้อยู่ในทริปเราก๊อป",
      ).toBeNull();
      const copyId = (data as { id: string }).id;

      const { data: row, error: rErr } = await admin.from("trips").select("created_by").eq("id", copyId).single();
      if (rErr) throw new Error(`admin อ่านทริปสำเนา: ${rErr.message}`);
      expect(
        row.created_by,
        "🔴 `created_by` เป็นเจ้าของ template ⇒ ผู้ใช้จะแก้ทริปตัวเองไม่ได้ (`trips_update` = owner)",
      ).toBe(ids.b);

      // และต้องแก้ได้จริง ไม่ใช่แค่ชื่อบนคอลัมน์
      const { data: upd, error: uErr } = await bClient.from("trips")
        .update({ title: `แก้แล้ว ${stamp}` }).eq("id", copyId).select("id");
      expect(uErr, `B แก้ทริปที่ตัวเองก๊อปมาไม่ได้: ${uErr?.message}`).toBeNull();
      expect((upd ?? []).length, "แก้แล้ว 0 แถว = RLS กรอง ⇒ B ไม่ใช่ owner จริง").toBe(1);
    });
  });

});
