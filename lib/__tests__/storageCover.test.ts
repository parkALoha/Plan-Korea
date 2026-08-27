import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { testClient } from "./_testClient";
import { NO_REALTIME_TRANSPORT } from "@/lib/auth/noRealtime";

/**
 * `E5-AC8` — RLS ของบัคเก็ตรูปปก `trip-covers` (private) · เจ้าของ: P4 (27 ส.ค. 2026)
 *
 * policy (`20260827220000`): อ่าน = `can_read_trip(trip_cover_trip(name))` (viewer เห็นได้) · เขียน/ลบ = `can_write_trip`
 * · `trip_cover_trip(name)` = segment แรกของ path เป็น uuid → trip_id · **คืน null ถ้าไม่ใช่ uuid** (ไฟล์ราก/prefix มั่ว)
 * · `to authenticated` ทุกตัว → **`anon` ไม่มี policy = เข้าไม่ได้เลย** (`D12`/`0019`: บัคเก็ตเก่าเป็น public ใครถือคีย์ก็อ่าน)
 *
 * 🔴 **กับดักเซตว่าง (P1 · เจอเองรอบที่ 5 ของทีมวันนี้):** บัคเก็ตว่าง → `list`/`download` ที่ถูกกรอง
 *    กับ "ไม่มีไฟล์" ให้ผลเหมือนกันเป๊ะ · **ทุกเคสฝั่งลบต้องมีไฟล์อยู่จริงตอนยิง** — seed ด้วย service_role ก่อน
 *    · ด้านบวก (owner/viewer อ่านได้) เป็น precondition — ถ้าอ่านไม่ได้เลย เคสลบทั้งหมดเขียวเพราะไม่มีใครอ่านได้
 * 🎯 พิสูจน์ว่า policy *กันจริง* กับไฟล์ที่ *มีจริง* — ไม่ใช่เขียวเพราะบัคเก็ตว่าง
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && ANON && SERVICE);
const BUCKET = "trip-covers";

function anonKeyClient(): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    realtime: { transport: NO_REALTIME_TRANSPORT } as never,
  });
}

describe("การรันชุดนี้", () => {
  it("🔴 ถ้าบังคับไว้ ต้องมี creds ครบ — ไม่ใช่ข้ามเงียบ ๆ", () => {
    requireLiveCreds(hasCreds, "storage cover RLS", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });
});

describe.runIf(hasCreds)("E5-AC8 — storage cover RLS (bucket trip-covers)", () => {
  const stamp = String(Date.now());
  let admin: SupabaseClient;
  let A: SupabaseClient;
  let B: SupabaseClient;
  let C: SupabaseClient;
  const anon = anonKeyClient();
  const ids: Record<string, string> = {};
  let tripA = "";
  let tripB = "";
  const img = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // jpeg magic — พอให้ contentType image/jpeg ผ่าน bucket
  const pathA = () => `${tripA}/cover-${stamp}.jpg`;
  const pathB = () => `${tripB}/cover-${stamp}.jpg`;
  const rootPath = `root-${stamp}.jpg`; // ไม่มี prefix uuid → trip_cover_trip = null
  const viewerWritePath = () => `${tripA}/vw-${stamp}.jpg`;

  async function makeUser(tag: string): Promise<SupabaseClient> {
    const email = `cov-${tag}-${stamp}@example.test`;
    const password = `pw-${stamp}-${tag}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${tag}: ${error.message}`);
    ids[tag] = data.user!.id;
    const c = anonKeyClient();
    const s = await c.auth.signInWithPassword({ email, password });
    if (s.error) throw new Error(`signIn ${tag}: ${s.error.message}`);
    return c;
  }

  async function mkTrip(client: SupabaseClient, tag: string): Promise<string> {
    const { data, error } = await client.rpc("create_trip", {
      p_title: `cov-${tag}-${stamp}`,
      p_start_date: "2026-10-11",
      p_end_date: "2026-10-21",
    });
    if (error) throw new Error(`create_trip ${tag}: ${error.message}`);
    return data.id as string;
  }

  beforeAll(async () => {
    admin = testClient(SERVICE);
    A = await makeUser("a");
    B = await makeUser("b");
    C = await makeUser("c");
    tripA = await mkTrip(A, "a");
    tripB = await mkTrip(B, "b");
    const inv = await A.from("trip_members").insert({ trip_id: tripA, user_id: ids.c, role: "viewer" });
    if (inv.error) throw new Error(`invite C viewer: ${inv.error.message}`);
    // 🔴 seed ไฟล์จริงด้วย service_role ก่อน — ทุกเคสลบต้องมีไฟล์อยู่จริง (P1: กันกับดักเซตว่าง)
    for (const p of [pathA(), pathB(), rootPath]) {
      const up = await admin.storage.from(BUCKET).upload(p, img, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(`seed upload ${p}: ${up.error.message}`);
    }
  });

  afterAll(async () => {
    await admin.storage.from(BUCKET).remove([pathA(), pathB(), rootPath, viewerWritePath()]).catch(() => {});
    const uid = Object.values(ids);
    if (uid.length) await admin.from("trips").delete().in("created_by", uid);
    for (const id of uid) await admin.auth.admin.deleteUser(id).catch(() => {});
  });

  // ── ด้านบวก — precondition (ถ้าอ่านไม่ได้เลย เคสลบข้างล่างไม่พิสูจน์อะไร) ──
  it("🔴 owner อ่าน cover ของทริปตัวเองได้ (precondition)", async () => {
    const { data, error } = await A.storage.from(BUCKET).download(pathA());
    expect(error, `owner อ่าน cover ทริปตัวเองไม่ได้: ${error?.message}`).toBeNull();
    expect(data, "owner ได้ไฟล์ null").toBeTruthy();
  });

  it("🔴 viewer อ่าน cover ของทริปที่ถูกเชิญได้ (can_read_trip ครอบ viewer)", async () => {
    const { data, error } = await C.storage.from(BUCKET).download(pathA());
    expect(error, `viewer อ่าน cover ไม่ได้: ${error?.message} — คนถูกเชิญมาดูต้องเห็นรูปปก`).toBeNull();
    expect(data, "viewer ได้ไฟล์ null").toBeTruthy();
  });

  // ── ด้านลบ — ทุกเคสมีไฟล์อยู่จริงตอนยิง ──
  it("🔴 สมาชิก A อ่าน cover ของ 'ทริป B' ไม่ได้ — cross-tenant (ไฟล์ B มีอยู่จริง)", async () => {
    const { data, error } = await A.storage.from(BUCKET).download(pathB());
    expect(
      Boolean(error) || !data,
      "A อ่าน cover ของทริป B ได้ = รั่วข้ามผู้เช่า (ไฟล์ B มีอยู่จริง · ไม่ใช่ 'ไม่มีไฟล์')",
    ).toBe(true);
  });

  it("🔴 viewer เขียน cover ไม่ได้ — can_write_trip กัน viewer (คู่กับอ่านได้ด้านบน)", async () => {
    const { error } = await C.storage.from(BUCKET).upload(viewerWritePath(), img, { contentType: "image/jpeg" });
    expect(error, "viewer อัปโหลด cover ได้ = เขียนทะลุด้วยสิทธิ์อ่าน (viewer ≠ editor)").toBeTruthy();
  });

  it("🔴 anon เข้าไม่ได้เลย — ไม่มี policy สำหรับ anon (ไฟล์มีอยู่จริง · D12/0019)", async () => {
    const { data, error } = await anon.storage.from(BUCKET).download(pathA());
    expect(
      Boolean(error) || !data,
      "anon อ่าน cover ได้ = บัคเก็ตหลุด public แบบ 0019 ที่ D12 บันทึกไว้ (ไฟล์มีอยู่จริง)",
    ).toBe(true);
  });

  it("🔴 ไฟล์รากบัคเก็ต (path ไม่ใช่ <uuid>/… → trip_cover_trip=null) อ่านไม่ได้เลย", async () => {
    const { data, error } = await A.storage.from(BUCKET).download(rootPath);
    expect(
      Boolean(error) || !data,
      "ไฟล์รากอ่านได้ = trip_cover_trip ไม่คืน null → can_read_trip(null) ไม่ได้กัน (ไฟล์มีอยู่จริง)",
    ).toBe(true);
  });
});
