"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDarkTheme } from "@/hooks/useDarkTheme";

/**
 * พากลับไปหน้าที่ตั้งใจจะเข้าเท่านั้น — รับเฉพาะ path ภายในเว็บนี้ (เดิมจาก app/unlock/page.tsx)
 * กัน open redirect: "//evil.com" กับ "https://evil.com" ต้องไม่ผ่าน
 */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/**
 * ตรวจรูปแบบอีเมลแบบหยาบฝั่ง client เท่านั้น — ไม่ใช่แหล่งความจริง แค่กันพิมพ์ผิดชัดๆ ก่อนยิง request
 * ความถูกต้องจริงต้องตรวจฝั่งเซิร์ฟเวอร์เสมอ (ที่นี่คือ Supabase Auth เมื่อต่อจริงแล้ว)
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type GoogleResult = { ok: true } | { ok: false; error: string };
type MagicLinkResult = { ok: true } | { ok: false; error: "send-failed" };

/**
 * 🔴 ฟังก์ชันหลอกชั่วคราว — รอ P1 ส่ง signature จริงจาก `lib/auth/` (E1, กำลังทำ `requireUser()` +
 * server client อยู่) ห้ามเดา API เพิ่มเติมนอกเหนือจากนี้ ตอนต่อจริงแทนที่แค่ 2 ฟังก์ชันนี้
 * ส่วน UI/state ทั้งหมดด้านล่างออกแบบให้ไม่ต้องแก้โครงตอนสลับเข้าของจริง
 */
async function mockSignInWithGoogle(): Promise<GoogleResult> {
  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
}

async function mockSendMagicLink(email: string): Promise<MagicLinkResult> {
  await new Promise((r) => setTimeout(r, 500));
  void email; // เก็บ signature ให้ตรงของจริง — ยังไม่ได้ต่อ Supabase Auth จึงไม่ได้ใช้ค่าจริง
  return { ok: true };
}

/**
 * ยังไม่มีใครวัดว่า Google OAuth กับ magic link ที่ใช้อีเมลเดียวกันได้บัญชีเดียวหรือ 2 บัญชี
 * P4 กำลังวัดจริงบน `engine-dev` (E1-AC7) — ห้ามเปลี่ยนค่านี้จนกว่าจะมีผลวัดจริงส่งมา ไม่ใช่เดาเอง
 * "unknown" = ยังไม่พูดอะไรที่ยังพิสูจน์ไม่ได้ (ไม่โชว์ข้อความเลย ดีกว่าโชว์ข้อความที่อาจผิด)
 */
type AccountUnificationStatus = "unknown" | "unified" | "separate";
const ACCOUNT_UNIFICATION_STATUS: AccountUnificationStatus = "unknown";

function accountUnificationNote(status: AccountUnificationStatus): string | null {
  if (status === "unified") {
    return "ใช้อีเมลเดียวกันทั้งสองทางได้ — เป็นบัญชีเดียวกันเสมอ";
  }
  if (status === "separate") {
    return "⚠️ สองทางนี้เป็นคนละบัญชีแม้ใช้อีเมลเดียวกัน — เลือกทางไหนแล้วต้องเข้าด้วยทางนั้นตลอด";
  }
  return null;
}

type MagicLinkStatus = "idle" | "sending" | "sent" | "error";

/**
 * ห่อด้วย Suspense เพราะ `useSearchParams()` บังคับให้ subtree เป็น client-render เท่านั้น
 * (รูปแบบเดียวกับ `useLang()` ใน lib/i18n.ts / app/summary/page.tsx)
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  useDarkTheme();
  const searchParams = useSearchParams();

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [magicLinkStatus, setMagicLinkStatus] = useState<MagicLinkStatus>("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  // ผู้ใช้กดปิดเองหลังอ่านแล้ว — ไม่ใช่ derive จาก effect จึงไม่ชน react-hooks/set-state-in-effect
  const [expiredNoteDismissed, setExpiredNoteDismissed] = useState(false);

  // ถ้าโดนเด้งกลับมาจากลิงก์ที่หมดอายุ/ใช้ไปแล้ว (query param ตามรูปแบบที่ Supabase Auth ใช้จริง
  // ตอนต่อของจริง) — คำนวณตรงจาก searchParams ที่ reactive อยู่แล้ว ไม่ต้องมี effect
  const errorCode = searchParams.get("error") ?? searchParams.get("error_code");
  const linkExpiredNote =
    !expiredNoteDismissed && (errorCode === "link_expired" || errorCode === "otp_expired")
      ? "ลิงก์เดิมหมดอายุหรือถูกใช้ไปแล้ว — ขอลิงก์ใหม่อีกครั้งได้ด้านล่าง"
      : null;

  async function handleGoogleSignIn() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const result = await mockSignInWithGoogle();
      if (result.ok) {
        const next = safeNextPath(searchParams.get("next"));
        // location.assign ไม่ใช่ router.push — ต้องให้เบราว์เซอร์ยิง request ใหม่ทั้งรอบเพื่อให้
        // proxy/server เห็น session cookie ที่เพิ่งถูกเซ็ต (แบบเดียวกับ app/unlock/page.tsx)
        window.location.assign(next);
        return;
      }
      setGoogleError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } catch {
      setGoogleError("เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (magicLinkStatus === "sending") return;

    const trimmed = email.trim();
    if (!looksLikeEmail(trimmed)) {
      setEmailError("อีเมลไม่ถูกต้อง — ตรวจรูปแบบอีเมลอีกครั้ง");
      return;
    }
    setEmailError(null);
    setMagicLinkError(null);
    setMagicLinkStatus("sending");
    setExpiredNoteDismissed(true);

    try {
      const result = await mockSendMagicLink(trimmed);
      if (result.ok) {
        setMagicLinkStatus("sent");
        return;
      }
      setMagicLinkStatus("error");
      setMagicLinkError("ส่งลิงก์ไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } catch {
      setMagicLinkStatus("error");
      setMagicLinkError("เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง");
    }
  }

  const accountNote = accountUnificationNote(ACCOUNT_UNIFICATION_STATUS);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-xs">
        <div className="mb-6 text-center">
          <div className="text-4xl">🧭</div>
          <h1 className="mt-2 text-xl font-extrabold text-content">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-content-soft">เข้าด้วย Google หรือลิงก์ทางอีเมล</p>
        </div>

        {linkExpiredNote && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-panel-maple px-3 py-2 text-center text-sm text-panel-maple-ink"
          >
            {linkExpiredNote}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleBusy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-raised py-3 text-base font-bold text-content hover:bg-surface-soft disabled:opacity-40"
        >
          <GoogleMark />
          {googleBusy ? "กำลังเข้าสู่ระบบ..." : "เข้าด้วย Google"}
        </button>

        {googleError && (
          <div role="alert" className="mt-2 rounded-xl bg-panel-maple px-3 py-2 text-center text-sm text-panel-maple-ink">
            {googleError}
          </div>
        )}

        <div className="my-5 flex items-center gap-3 text-xs text-content-soft">
          <div className="h-px flex-1 bg-line" />
          หรือ
          <div className="h-px flex-1 bg-line" />
        </div>

        {magicLinkStatus === "sent" ? (
          <div role="status" className="rounded-xl bg-panel-pine px-4 py-3 text-center text-sm text-panel-pine-ink">
            ส่งลิงก์ไปที่ {email.trim()} แล้ว — เปิดอีเมลนั้นเพื่อเข้าใช้งาน
            <button
              type="button"
              onClick={() => {
                setMagicLinkStatus("idle");
                setEmail("");
              }}
              className="mt-2 block w-full text-xs font-semibold text-panel-pine-ink underline"
            >
              ใช้อีเมลอื่น
            </button>
          </div>
        ) : (
          // noValidate: ปิด validation ในตัวเบราว์เซอร์ — ไม่งั้น browser สกัด submit ก่อน handler เราจะ
          // ทำงานถึงเลย ข้อความ error ที่อ่านออกที่ออกแบบไว้ (role="alert") จะไม่มีวันโผล่เลย เพราะ native
          // tooltip ของเบราว์เซอร์แต่ละตัวหน้าตา/ภาษาไม่เหมือนกันและ screen reader อ่านไม่แน่นอน — ให้
          // looksLikeEmail() เป็นแหล่งเดียวที่ตัดสินแทน
          <form onSubmit={handleMagicLinkSubmit} noValidate className="flex flex-col gap-3">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-content-soft">
                อีเมล
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="you@example.com"
                aria-invalid={emailError ? "true" : undefined}
                aria-describedby={emailError ? "login-email-error" : undefined}
                className="w-full rounded-xl border border-line bg-surface-raised px-4 py-3 text-content focus:border-maple focus:outline-none"
              />
              {emailError && (
                <p id="login-email-error" role="alert" className="mt-1 text-xs text-panel-maple-ink">
                  {emailError}
                </p>
              )}
            </div>

            {magicLinkError && (
              <div role="alert" className="rounded-xl bg-panel-maple px-3 py-2 text-center text-sm text-panel-maple-ink">
                {magicLinkError}
              </div>
            )}

            <button
              type="submit"
              disabled={magicLinkStatus === "sending" || !email}
              className="rounded-xl bg-pine py-3 text-base font-bold text-cream hover:bg-pine-dark disabled:opacity-40"
            >
              {magicLinkStatus === "sending" ? "กำลังส่งลิงก์..." : "ส่งลิงก์เข้าสู่ระบบ"}
            </button>
          </form>
        )}

        {accountNote && <p className="mt-5 text-center text-xs leading-relaxed text-content-soft">{accountNote}</p>}
      </div>
    </main>
  );
}

/** โลโก้ Google แบบย่อ (4 สี) — ไม่ผูก brand asset ภายนอก วาดเป็น SVG ตรงในไฟล์ */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
