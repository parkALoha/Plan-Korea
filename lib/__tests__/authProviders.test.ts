import { describe, expect, it } from "vitest";
import { readEnvKey } from "./_helpers";

/**
 * `E1-AC8` — เงื่อนไขความปลอดภัยของการผูกบัญชี · เจ้าของ: P4-QA/Sec (25 ส.ค. 2026)
 *
 * ## สิ่งที่ `AC8` เรียกร้อง
 * > *"link ได้เฉพาะเมื่ออีเมลถูกยืนยันแล้วทั้งสองฝั่ง — ถ้า provider ไหนคืนอีเมลที่ยังไม่ verified
 * > **ห้ามผูกเข้าบัญชีเดิมเด็ดขาด**"* · เหตุผล: auto-link บนอีเมลที่ไม่ verified =
 * > **ใครอ้างอีเมลของ A ได้ ก็เข้าบัญชี A ได้**
 *
 * ## 🔴 ปัญหาของ AC ข้อนี้ และเหตุผลที่ไฟล์นี้มีอยู่
 * **Supabase ไม่มีสวิตช์ชื่อ "link เฉพาะเมื่อ verified"** — กติกาการ link เป็นพฤติกรรมภายใน
 * ที่เราตั้งไม่ได้และมองไม่เห็น · ตอนวัด `AC7` **ไม่มีเหตุการณ์ link เกิดขึ้นให้สังเกตด้วยซ้ำ**
 * (Supabase แมตช์ที่ `auth.users.email` แล้วออก session — ไม่ได้สร้าง identity ที่สอง)
 *
 * 🎯 **แต่คุณสมบัติที่ `AC8` ต้องการ เป็นจริงวันนี้ด้วยเหตุผลที่ตรวจได้:**
 * provider ที่เปิดอยู่มีแค่ 2 ตัว และ **ทั้งคู่ยืนยันอีเมลโดยธรรมชาติ**
 *   · `google` — คืนอีเมลที่ verified เสมอ · และ *"Allow users without an email"* ปิดอยู่
 *   · `email` (magic link / OTP) — **การได้รับอีเมลคือการพิสูจน์ว่าคุมกล่องจดหมาย**
 *     และ `mailer_autoconfirm: false` = ยืนยันอีเมลก่อนถึงจะใช้บัญชีได้ **ไม่มีทางลัด**
 *
 * 🔴 **คุณสมบัตินี้จึงเป็นจริงเพราะ *provider ที่เปิดอยู่* ไม่ใช่เพราะ *กติกา***
 * → **มันเป็นความบังเอิญ ไม่ใช่หลักประกัน** · และ `AC8` เขียนไว้เองว่ามีไว้กัน
 *   **"ตอนเพิ่ม provider ที่ 3 ซึ่งเป็นตอนที่ไม่มีใครกลับมาอ่าน E1 แล้ว"**
 *
 * ## ไฟล์นี้เปลี่ยนความบังเอิญให้เป็นหลักประกัน
 * ตรึงรายการ provider ที่เปิดไว้ · **วินาทีที่มีคนเปิดตัวที่ 3 เคสนี้แดง**
 * และข้อความบอกให้กลับมาอ่าน `AC8` **ก่อน**ขึ้นลิสต์ ไม่ใช่ขึ้นลิสต์ให้ผ่าน
 * · เป็นแพทเทิร์นเดียวกับที่เราใช้ตรึง policy ใน `rlsMatrix.test.ts` (`D60`)
 */

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const ANON = readEnvKey("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const hasCreds = Boolean(URL_ && ANON);

/** provider ที่ยืนยันอีเมลโดยธรรมชาติ — **ขึ้นลิสต์นี้ได้ต่อเมื่อพิสูจน์ว่ามันยืนยันจริง** */
const EMAIL_VERIFYING_PROVIDERS = ["email", "google"] as const;

type Settings = {
  external: Record<string, boolean>;
  mailer_autoconfirm: boolean;
  saml_enabled: boolean;
  passkeys_enabled: boolean;
};

async function authSettings(): Promise<Settings> {
  const res = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
  if (!res.ok) throw new Error(`อ่าน /auth/v1/settings ไม่ได้: ${res.status}`);
  return (await res.json()) as Settings;
}

describe("การรันชุดนี้", () => {
  it("ไม่มี creds = ข้าม ไม่ใช่ผ่าน", () => {
    if (!hasCreds) {
      console.warn("\n⚠️  ข้าม E1-AC8 เพราะไม่มี SUPABASE URL/ANON — **นี่ไม่ใช่การผ่าน**\n");
    }
    expect(true).toBe(true);
  });
});

describe.runIf(hasCreds)("E1-AC8 — เงื่อนไขที่ทำให้การผูกบัญชีปลอดภัย", () => {
  it("🔴 provider ที่เปิดอยู่ ต้องเป็นตัวที่ยืนยันอีเมลทั้งหมด — เปิดตัวใหม่ต้องมาอ่าน AC8 ก่อน", async () => {
    const s = await authSettings();
    const enabled = Object.entries(s.external)
      .filter(([, on]) => on)
      .map(([k]) => k)
      .sort();

    expect(
      enabled,
      "มี provider ที่ไม่ได้อยู่ในลิสต์ที่พิสูจน์แล้วว่ายืนยันอีเมล\n" +
        "  🔴 AC8: provider ที่คืนอีเมลโดยไม่ verify → ใครอ้างอีเมลของ A ได้ ก็เข้าบัญชี A ได้\n" +
        "  → พิสูจน์ก่อนว่าตัวใหม่ยืนยันอีเมลจริง **แล้วค่อยขึ้นลิสต์** ไม่ใช่ขึ้นลิสต์ให้เคสนี้เขียว",
    ).toEqual([...EMAIL_VERIFYING_PROVIDERS].sort());
  });

  it("🔴 ต้องยืนยันอีเมลก่อนใช้บัญชีได้ — mailer_autoconfirm ต้องปิด", async () => {
    // เปิดเมื่อไหร่ = สมัครด้วยอีเมลของคนอื่นแล้วใช้ได้ทันทีโดยไม่ต้องคุมกล่องจดหมาย
    // ซึ่งทำให้ "อีเมลเดียวกัน = คนเดียวกัน" ที่ AC7 พึ่งอยู่ **เป็นเท็จทันที**
    const s = await authSettings();
    expect(s.mailer_autoconfirm, "เปิด autoconfirm = อีเมลไม่ได้ถูกยืนยันอีกต่อไป").toBe(false);
  });

  it("ทางเข้าที่ไม่ผูกกับอีเมล ต้องปิดอยู่ (anonymous · SAML · passkeys)", async () => {
    // ทางเข้าที่ไม่มีอีเมลเป็นตัวยึด จะทำให้คำถามของ AC7/AC8 เปลี่ยนรูปทั้งข้อ
    const s = await authSettings();
    expect(s.external.anonymous_users, "anonymous sign-in เปิดอยู่").toBe(false);
    expect(s.saml_enabled, "SAML เปิดอยู่").toBe(false);
    expect(s.passkeys_enabled, "passkeys เปิดอยู่").toBe(false);
  });
});
