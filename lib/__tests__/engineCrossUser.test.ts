import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { readEnvKey, requireLiveCreds, TEST_COUNTRY_CODES } from "./_helpers";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";
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
 * ครอบแล้ว: **bookings · checklist** (POST) + pin `GET /trips`=200 · เหลืออีก 7 ใน 9 trip-scoped route
 *   custom-places · hidden-places · stops (POST) · day-settings · days · hotels · place-notes (PUT/PATCH)
 * · `engineAttackSurface.test.ts` ค้ำว่าทั้ง 9 ถูกจำแนกไว้ · **ด่านบังคับ "ครบทั้ง 9"** จะเปิดเมื่อ probe ครบ
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
import { GET as tripsGET } from "@/app/api/engine/trips/route";
import { PATCH as daysPATCH } from "@/app/api/engine/trips/[tripId]/days/route";
import { PUT as daySettingsPUT } from "@/app/api/engine/trips/[tripId]/day-settings/route";
import { POST as stopsPOST } from "@/app/api/engine/trips/[tripId]/stops/route";
import { PUT as hotelsPUT, GET as hotelsGET } from "@/app/api/engine/trips/[tripId]/hotels/route";
import { POST as customPlacesPOST } from "@/app/api/engine/trips/[tripId]/custom-places/route";
import { POST as hiddenPlacesPOST } from "@/app/api/engine/trips/[tripId]/hidden-places/route";
import { PUT as placeNotesPUT, DELETE as placeNotesDELETE } from "@/app/api/engine/trips/[tripId]/place-notes/route";

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
async function verdictFor(res: Response): Promise<{ verdict: "rejected" | "leak" | "server-bug"; detail: string }> {
  const body = await res.clone().json().catch(() => null);
  const detail = `HTTP ${res.status} ${JSON.stringify(body)}`;
  const s = res.status;
  if (s === 401 || s === 403 || s === 404 || s === 409) return { verdict: "rejected", detail };
  if (s >= 200 && s < 300) return { verdict: "leak", detail };
  return { verdict: "server-bug", detail }; // 502 (คอลัมน์/ helper) · 400 (body ผิด = probe พัง) · อื่น
}

/** trip-route ที่ "มี probe ยิงข้ามจริง" ในไฟล์นี้ — อัปเดตคู่กับ probe เสมอ (ชื่อ = ชื่อโฟลเดอร์ route) */
const COVERED = new Set(["bookings", "checklist", "days", "day-settings", "stops", "hotels", "custom-places", "hidden-places", "place-notes"]);

/** 9 trip-scoped route จากดิสก์ — denominator ที่เชื่อได้ ไม่ใช่เลข hardcode */
function tripScopedRouteNames(): string[] {
  const base = resolve(process.cwd(), "app/api/engine/trips/[tripId]");
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(base, e.name, "route.ts")))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

// 🔴 แบนเนอร์ความครอบคลุม — **รันเสมอ ไม่ต้องมี creds** เพื่อให้ตัวเลขโผล่ทุกครั้งที่รัน
//    ไม่ใช่แค่คอมเมนต์ (P1): กันคนเห็นไฟล์เขียวแล้วสรุปว่า cross-user ถูกทดสอบครบ
describe("E3-AC9 ② — ความครอบคลุม (ต้องเห็นตอนรัน)", () => {
  it("📊 coverage — เขียวไม่ได้แปลว่าครบ 9 · ตัวเลขต้องโผล่ตอนรัน", () => {
    const all = tripScopedRouteNames();
    expect(all.length, "อ่าน trip-route จากดิสก์ไม่ได้/จำนวนเปลี่ยน — denominator เชื่อไม่ได้").toBe(9);
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
    // 🔴 ด่านบังคับ "ครบ 9" เปิดแล้ว (probe ครบ 27 ส.ค.) — route ตัวที่ 10 ใต้ [tripId] ที่ไม่มี probe = แดงที่นี่
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
  let aCookies: Cookie[] = [];
  let bCookies: Cookie[] = [];
  let aDay = "";
  let aPlan = "";
  let aClient: SupabaseClient;
  const CC = TEST_COUNTRY_CODES.engineCrossUser; // "xz" — country code จองในทะเบียน กันชนข้ามเซสชัน
  const citySlug = `ex-${stamp}`;
  const placeSlug = `exp-${stamp}`;
  const placeSlug2 = `exp2-${stamp}`;
  let place2Id = "";
  const placeSlug3 = `exp3-${stamp}`;
  let place3Id = "";
  const placeSlug4 = `exp4-${stamp}`;
  let place4Id = "";

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
    tripA = await mkTrip(a.client, "a");
    await mkTrip(b.client, "b");
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
    const { verdict, detail } = await verdictFor(bRes);
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
    const { verdict, detail } = await verdictFor(bRes);
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

});
