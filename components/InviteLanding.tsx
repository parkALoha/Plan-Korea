"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.home;

type Peek = { tripTitle: string; inviterName: string | null; role: string; expired: boolean };

/**
 * **หน้ารับคำชวน `/invite/<token>`** — เจ้าของ: P2-UI/UX · 5 ก.ย. 2026
 *
 * ## 🔴 ต้องอ่านรู้เรื่อง **ตอนยังไม่ล็อกอิน** — และนั่นคือเส้นทางที่ยาวและพังเงียบที่สุด
 * `peek` เปิดให้ `anon` โดยตั้งใจ (P1) ⇒ คนที่ได้ลิงก์เห็น **ชื่อทริป · ใครชวน · จะได้สิทธิ์อะไร**
 * ก่อนตัดสินใจว่าจะสมัคร/ล็อกอินไหม
 * 🎯 ***ถ้าเด้งไปหน้าล็อกอินทันที เขาจะไม่มีทางรู้ว่ากำลังจะล็อกอินเพื่ออะไร*** — และคนส่วนใหญ่จะไม่ล็อกอิน
 * · ⚠️ `peek` **ไม่บอกว่าเขาเป็นสมาชิกอยู่แล้วหรือยัง** (มันไม่รู้ว่าเราเป็นใคร) — รู้ตอน `redeem` เท่านั้น
 *
 * ## 🔴 กดรับซ้ำไม่พัง — และห้ามเขียน UI ที่ทำเหมือนมันพัง
 * เป็นสมาชิกอยู่แล้วจะคืน `tripId` เฉย ๆ **ไม่ลดสิทธิ์** (P1 ยืนยัน) ⇒ พาเข้าทริปได้เลย ไม่ต้องเตือนอะไร
 *
 * ## ⚠️ ข้อความตอนใช้ไม่ได้ — **แสดงของจากฝั่งฐานตรง ๆ**
 * `redeem` ตอบ `404` พร้อมข้อความที่ใช้ได้จริง (หมดอายุ / ถูกยกเลิก / ใช้ครบ)
 * 🎯 ***ยุบสามอย่างนี้เป็น "ลิงก์ไม่ถูกต้อง" คำเดียว = ทำให้คนที่แก้ได้ (ขอลิงก์ใหม่) ไม่รู้ว่าแก้ได้***
 */
export function InviteLanding({ token }: { token: string }) {
  const [peek, setPeek] = useState<Peek | "dead" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/engine/invites/peek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as Peek;
        if (!cancelled) setPeek(body.expired ? "dead" : body);
      } catch {
        if (!cancelled) setPeek("dead");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/engine/invites/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await r.json()) as { tripId?: string; error?: string };
      if (r.status === 401) {
        /**
         * ยังไม่ล็อกอิน ⇒ พาไปล็อกอิน **แล้วกลับมาที่ลิงก์นี้** ไม่ใช่กลับหน้าแรก
         * 🔴 กลับหน้าแรก = เขาต้องไปหาลิงก์ในแชทมาเปิดใหม่เอง ซึ่งหลายคนจะไม่ทำ
         */
        const next = encodeURIComponent(`/invite/${token}`);
        router.push(`/login?next=${next}`);
        return;
      }
      if (!r.ok || !body.tripId) throw new Error(body.error ?? COPY.inviteLandingDead);
      /**
       * 🔴 `refresh()` ก่อน `push()` — **สมาชิกภาพเพิ่งเปลี่ยนที่ฝั่งเซิร์ฟเวอร์เมื่อวินาทีที่แล้ว**
       * ไม่ล้างแคชของ router ก่อน จะเข้าหน้าทริปด้วยข้อมูลชุดที่ยังไม่รู้ว่าเราเป็นสมาชิก
       * ⇒ **เห็นหน้าที่บอกว่าเข้าไม่ได้ ทั้งที่เพิ่งเข้าร่วมสำเร็จ**
       */
      router.refresh();
      router.push(`/trip/${body.tripId}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : COPY.inviteLandingDead);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10 text-content">
      <div className="rounded-2xl border border-edge bg-surface-raised p-5 shadow-raised">
        <h1 className="text-lg font-bold">{COPY.inviteLandingTitle}</h1>

        {peek === null ? (
          <p className="mt-3 text-sm text-content-soft">{COPY.inviteLandingChecking}</p>
        ) : peek === "dead" ? (
          <>
            <p className="mt-3 text-sm text-maple-dark">{COPY.inviteLandingDead}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg border border-edge px-4 py-2 text-sm font-medium"
            >
              {COPY.inviteLandingHome}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-content-soft">
              {COPY.inviteLandingBy(peek.inviterName ?? "เจ้าของทริป")}
            </p>
            <p className="mt-1 text-xl font-extrabold">{peek.tripTitle}</p>
            <p className="mt-1 text-sm text-content-soft">{COPY.inviteLandingRole(peek.role)}</p>
            {error && <p className="mt-3 text-sm text-maple-dark">{error}</p>}
            <button
              type="button"
              onClick={() => void accept()}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-pine px-4 py-3 text-sm font-semibold text-cream disabled:opacity-50"
            >
              {busy ? COPY.inviteLandingJoining : COPY.inviteLandingAccept}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
