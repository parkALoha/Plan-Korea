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
 * · พิสูจน์แล้ววันแรกที่สร้าง harness นี้: `GET /api/engine/trips` คืน 502 ทุกคน เพราะ
 *   `tripsVisibleToMe` select `trips.name` ที่ไม่มีจริง (`db.ts:261`) — **ไม่มีเทสต์ชั้นตารางจับได้**
 *
 * ## harness: in-process ยิงในนาม B — **ไม่ต้องมีเซิร์ฟเวอร์ รันใน CI ได้**
 * mock `next/headers` ให้คืนคุกกี้ ssr ของ B ที่ capture มา → route เรียก `getUser()` ตรวจ JWT
 * ของ B กับ auth server จริง → `createServerSupabase()` ผูก RLS กับ B → db → RPC
 *
 * ## รูป probe (เหมือน `E2-AC1` outsider sweep แต่ผ่าน route)
 * ต่อ route: ① A ทำ write สำเร็จ (control — พิสูจน์ว่า route ไม่ได้พังทุกคน)
 *           ② B (นอกทริป A) ทำ write เดียวกันใส่ tripA → ต้องถูกปฏิเสธ (403/`42501`)
 *           ③ admin อ่านฐานยืนยัน: มีแค่แถวของ A · ของ B ไม่เกิดขึ้นจริงสักแถว
 * 🔴 ③ สำคัญ: ถ้าไม่อ่านฐาน เราจะเชื่อสถานะ HTTP ที่ route คืน — ซึ่ง *route เป็นคนพูด*
 *    การอ่านฐานด้วย admin คือ **checker ที่คนละเจ้าของกับสิ่งที่ถูก check** (`P-72`)
 *
 * ## 🔴 สถานะความครอบคลุม (เขียนตรง ๆ ไม่ให้เข้าใจว่าครบ)
 * ครอบแล้ว: **bookings** (POST) · เหลืออีก 8 ใน 9 trip-scoped route
 *   checklist · custom-places · hidden-places · stops (POST/PUT/PATCH/DELETE) ·
 *   day-settings · days · hotels · place-notes (PUT/PATCH — ต้อง seed child ของ A ก่อน)
 * · `engineAttackSurface.test.ts` ค้ำว่าทั้ง 9 ถูกจำแนกไว้ · **ด่านบังคับ "ครบทั้ง 9"**
 *   จะเปิดในไฟล์นี้เมื่อ probe ครบ — ยังไม่เปิดตอนนี้เพราะจะแดงทั้งที่ไม่ใช่ regression
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && ANON && SERVICE);

// คุกกี้ที่ mock ของ next/headers เสิร์ฟ — ตั้งต่อ probe (persona ที่กำลังยิง)
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

type Cookie = { name: string; value: string };

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

type Handler = (req: NextRequest, ctx: { params: Promise<{ tripId: string }> }) => Promise<Response>;

async function postAs(cookies: Cookie[], tripId: string, handler: Handler, body: unknown): Promise<Response> {
  jar.cookies = cookies;
  const req = new NextRequest(`http://localhost:3300/api/engine/trips/${tripId}/x`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve({ tripId }) });
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

  beforeAll(async () => {
    admin = createClient(URL_, SERVICE, { auth: { persistSession: false }, realtime: noRealtime() });
    const a = await makeUser("a");
    const b = await makeUser("b"); // B ไม่ได้เป็นสมาชิกทริป A — B มีทริปตัวเองไว้ให้ soleTrip ไม่พัง
    tripA = await mkTrip(a.client, "a");
    await mkTrip(b.client, "b");
    aCookies = await captureCookies(a.session);
    bCookies = await captureCookies(b.session);
  });

  afterAll(async () => {
    const userIds = Object.values(ids);
    // ลูกก่อนพ่อ: ลบ bookings ของทริปพวกนี้ก่อน เผื่อ FK ไม่ใช่ cascade (grant service_role ตามข้อยกเว้น #4)
    if (tripA) {
      const { error } = await admin.from("bookings").delete().eq("trip_id", tripA);
      if (error) console.warn(`cleanup bookings: ${error.message}`);
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

  it("bookings POST — A สร้างได้ · B (นอกทริป) สร้างในทริป A ไม่ได้ · ฐานยืนยัน", async () => {
    // ① control: A สร้างในทริปตัวเอง
    const aRes = await postAs(aCookies, tripA, bookingsPOST, { title: "xu-a", category: "hotel" });
    expect(aRes.status, `control A ควร 201 — ถ้าไม่ใช่ route พังก่อนถึงเคสจริง: ${aRes.status} ${await aRes.clone().text()}`).toBe(201);

    // ② attack: B สร้างในทริป A
    const bRes = await postAs(bCookies, tripA, bookingsPOST, { title: "xu-b", category: "hotel" });
    const bBody = await bRes.clone().json().catch(() => null);
    expect(
      [401, 403].includes(bRes.status),
      `🔴 B ควรถูกปฏิเสธ (403/42501) แต่ได้ ${bRes.status}: ${JSON.stringify(bBody)}\n` +
        "  ถ้าได้ 201 = ยิงข้ามผู้ใช้สำเร็จ (leak) · ถ้าได้ 502 = บั๊กอื่นใน route หรือ db helper — แยกไปดู อย่านับเป็นผ่าน",
    ).toBe(true);

    // ③ P-72: อ่านฐานด้วย admin (คนละเจ้าของกับ route) — มีแค่แถวของ A
    const { data, error } = await admin.from("bookings").select("id,title").eq("trip_id", tripA);
    if (error) throw new Error(`admin read bookings: ${error.message}`);
    expect(
      data?.map((r) => (r as { title: string }).title).sort(),
      `ในทริป A ต้องมีแค่ booking ของ A · ถ้ามี 'xu-b' = B เขียนเข้าทริป A สำเร็จ (leak)`,
    ).toEqual(["xu-a"]);
  });
});
