import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";

/**
 * `E3-AC9` ② (runtime) — Server Action แทน A แตะทริป B ไม่ได้ · เจ้าของ: P4-QA/Sec (26 ส.ค. 2026)
 *
 * ## ทำไมต้องยิง route จริง ไม่ใช่แค่ทดสอบ db helper
 * `rlsMatrix.test.ts` วัด RLS ที่ **ชั้นตาราง** · แต่ route ประกอบหลายอย่างเข้าด้วยกัน
 * (getUser → createServerSupabase → db helper → RPC) และบั๊กอยู่ที่ *การประกอบ* ได้
 * · พิสูจน์แล้ววันแรกที่สร้าง harness นี้: `GET /api/engine/trips` **เคย**คืน 502 ทุกคน เพราะ
 *   `tripsVisibleToMe` select `trips.name` ที่ไม่มีจริง — **ไม่มีเทสต์ชั้นตารางจับได้**
 *   (P1 แก้แล้ว `fae94fe` · `db.ts:261` `name`→`title`) · เก็บไว้เป็นเหตุผลว่าทำไม probe ยิง route จริง
 *   🎯 `rlsMatrix` ยิง `.from("trips")` ด้วยชื่อคอลัมน์ *ของมันเอง* (ถูก) แต่ **ไม่เคยเรียก `tripsForUser()`**
 *      → helper กับเทสต์เห็นสคีมาคนละใบ ไม่มีอะไรเทียบให้ · `P-76` ในรูปของ coverage (P1)
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

    const { data, error } = await admin.from(opts.table).select(`id,${opts.col}`).eq("trip_id", tripA);
    if (error) throw new Error(`[${opts.label}] admin read ${opts.table}: ${error.message}`);
    const vals = (data ?? []).map((r) => (r as Record<string, string>)[opts.col]).sort();
    expect(
      vals,
      `[${opts.label}] ในทริป A ต้องมีแค่ของ A (${opts.valueA}) · ถ้าเจอ '${opts.valueB}' = B เขียนเข้าทริป A สำเร็จ (leak)`,
    ).toEqual([opts.valueA]);
  }

  beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false }, realtime: noRealtime() });
    const a = await makeUser("a");
    const b = await makeUser("b"); // B ไม่เป็นสมาชิกทริป A — มีทริปตัวเองไว้ให้ soleTrip ไม่พัง
    tripA = await mkTrip(a.client, "a");
    await mkTrip(b.client, "b");
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
});
