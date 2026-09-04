"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * สรุปทริปของผู้ใช้บนหน้าบัญชี — จำนวน + ทริปถัดไป · เจ้าของ: P7 (4 ก.ย. 2026)
 *
 * 🔴 **ดึงผ่าน `GET /api/engine/trips` ฝั่งไคลเอนต์ ไม่ใช่ `tripsVisibleToMe()` ฝั่งเซิร์ฟเวอร์**
 * ฉบับแรกอ่าน DAL ตรง ๆ ใน `page.tsx` แล้ว `serverDataReach.test.ts` แดง — **ด่านนั้นถูก**
 * มันค้ำสมมติฐานของ `docs/engine/offline-auth-gate.md`: ประตูจะปล่อยผ่านตอนติดต่อ auth ไม่ได้
 * ซึ่งปลอดภัยได้ข้อเดียว — **หน้าเว็บไม่เรนเดอร์ข้อมูลจากเซิร์ฟเวอร์** (ได้แค่ shell · `/api/*` ยัง `401`)
 * · เหตุผลเดียวกับที่ `DisplayNameField` โหลดค่าของตัวเอง — อ่านคำอธิบายเต็มที่นั่น
 *
 * ⚠️ **บล็อกนี้เป็นของเสริมของหน้าบัญชี ไม่ใช่แกนของมัน** — อ่านไม่ได้ก็แค่ไม่โชว์ตัวเลข
 * **ห้ามทำให้ทั้งหน้าพัง** (แพทเทิร์นเดียวกับที่ `tripsForUser` เขียนไว้เรื่องหมุด)
 *
 * 📌 `start_date`/`end_date` เป็น snake_case จริงตาม `TripListItem` — **ไม่ใช่ความเลินเล่อ**
 * ไฟล์นั้นเขียนไว้เองว่าปนกันโดยรู้ตัว เพราะมีผู้เรียกอยู่แล้ว 3 ที่ · อย่า "ทำให้สม่ำเสมอ" ที่นี่
 */

type Trip = { id: string; title: string; start_date: string; end_date: string };

type State =
  | { status: "loading" }
  | { status: "ready"; trips: Trip[] }
  /** อ่านไม่ได้ — **คนละเรื่องกับ "ไม่มีทริป"** · ห้ามขึ้นว่า "ยังไม่มีทริป" ตอนแค่เน็ตสะดุด */
  | { status: "error" };

/** วันที่แบบไทย — ฝั่งไคลเอนต์ใช้โซนเวลาของเครื่องผู้ใช้เอง ซึ่งถูกแล้วสำหรับของที่เขาอ่าน */
function thaiDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function TripsSummary() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/engine/trips");
        if (!alive) return;
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const json = (await res.json()) as Trip[] | { trips?: Trip[] };
        if (!alive) return;
        setState({ status: "ready", trips: Array.isArray(json) ? json : (json.trips ?? []) });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const trips = state.status === "ready" ? state.trips : [];
  // ทริปถัดไป = ใบที่ยังไม่จบ เรียงตามวันเริ่ม · เทียบเป็นสตริง `YYYY-MM-DD` ได้ตรง ๆ
  const today = new Date().toLocaleDateString("sv-SE"); // sv-SE = ISO `YYYY-MM-DD` ตามเวลาเครื่อง
  const upcoming = trips
    .filter((t) => (t.end_date || t.start_date || "") >= today)
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))[0];

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {state.status === "ready" ? (
            <>
              <strong className="text-base">{trips.length}</strong> ทริป
            </>
          ) : state.status === "loading" ? (
            <span className="text-content-soft">กำลังโหลด…</span>
          ) : (
            <span className="text-content-soft">ดูจำนวนทริปไม่ได้ตอนนี้</span>
          )}
        </span>
        <Link
          href="/"
          className="relative shrink-0 text-2xs font-medium text-pine before:absolute before:-inset-3 before:content-[''] hover:underline"
        >
          ดูทั้งหมด →
        </Link>
      </div>

      {state.status === "ready" && (
        <p className="mt-2 border-t border-line pt-2 text-2xs text-content-soft">
          {upcoming ? (
            <>
              ถัดไป ·{" "}
              <strong className="text-sm font-medium text-content">{upcoming.title}</strong>
              {thaiDate(upcoming.start_date) ? ` — ${thaiDate(upcoming.start_date)}` : ""}
            </>
          ) : trips.length > 0 ? (
            "ทริปทั้งหมดผ่านไปแล้ว"
          ) : (
            "ยังไม่มีทริป — สร้างใบแรกได้ที่หน้าทริป"
          )}
        </p>
      )}
    </>
  );
}
