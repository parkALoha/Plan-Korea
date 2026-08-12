"use client";

import { useState } from "react";

/** พากลับไปหน้าที่ตั้งใจจะเข้าเท่านั้น — รับเฉพาะ path ภายในเว็บนี้
 *  กัน open redirect: "//evil.com" กับ "https://evil.com" ต้องไม่ผ่าน (เบราว์เซอร์อ่าน "//x" เป็นโดเมนอื่น) */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function UnlockPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pin) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        // ใช้ location.assign ไม่ใช่ router.push — ต้องให้เบราว์เซอร์ยิง request ใหม่ทั้งรอบ
        // เพื่อให้ proxy.ts เห็น cookie ที่เพิ่งถูกเซ็ต ถ้า navigate ฝั่ง client จะยังติดด่านเดิมอยู่
        const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
        window.location.assign(next);
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "too-many"
          ? "กรอกผิดหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่"
          : data.error === "not-configured"
            ? "ยังไม่ได้ตั้งค่า PIN บนเซิร์ฟเวอร์ (ตั้ง TRIP_PIN / TRIP_PIN_SECRET ก่อน)"
            : "PIN ไม่ถูกต้อง"
      );
      setPin("");
    } catch {
      setError("เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-xs">
        <div className="mb-6 text-center">
          <div className="text-4xl">🍁</div>
          <h1 className="mt-2 text-xl font-extrabold text-ink">แพลนเที่ยวเกาหลี</h1>
          <p className="mt-1 text-sm text-ink-soft">ใส่ PIN เพื่อเข้าใช้งาน</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            // inputMode="numeric" = มือถือเด้งแป้นตัวเลขขึ้นมาให้เลย ไม่ต้องสลับแป้นเอง
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            aria-label="PIN"
            className="w-full rounded-xl border border-cream-soft bg-white px-4 py-3 text-center text-2xl tracking-[0.4em] text-ink focus:border-maple focus:outline-none"
          />

          {error && (
            <div role="alert" className="rounded-xl bg-maple-soft px-3 py-2 text-center text-sm text-maple-dark">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !pin}
            className="rounded-xl bg-pine py-3 text-base font-bold text-cream hover:bg-pine-dark disabled:opacity-40"
          >
            {busy ? "กำลังตรวจสอบ..." : "เข้าใช้งาน"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-soft/70">
          กรอกครั้งเดียวแล้วเครื่องนี้จะจำไว้ 90 วัน
        </p>
      </div>
    </main>
  );
}
