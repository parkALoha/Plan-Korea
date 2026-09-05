"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackHomeLink } from "@/components/BackHomeLink";
import { CoverImage } from "@/components/CoverImage";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.home;

/**
 * **หน้าพรีวิว "ทริปแนะนำ" ทั้งใบ** — ผู้ใช้สั่งเอง 5 ก.ย. 2026 (ผ่าน P1 · ยกคำมาตรง ๆ)
 * > *"ทริปแนะนำ เราจะมีวันที่บอกอยู่แล้ว ว่ามันสำหรับกี่วัน · **เมื่อกดจะบอกรายละเอียดของทริปทั้งหมด
 * >  แต่ละวันไปไหนบ้าง** และมีปุ่มให้กด **สร้างทริป** หลังจากนั้นก็จะพาไปหน้าที่เป็นการจัดลำดับของทริป"*
 *
 * ## 🔴 ทำไม URL เป็น `/templates/<id>` ไม่ใช่ `/explore/templates/<id>` — **P3 ตัดสิน ด้วยเหตุผลที่หักข้อเสนอเดิมของ P2**
 * P2 เสนอให้อยู่ใต้ `/explore` โดยยกข้อดีว่า *"ได้ `SiteNav` ฟรี"*
 * 🔴 **`proxy.ts:176` ปล่อยผ่านทุกอย่างที่ขึ้นต้นด้วย `/explore/` ⇒ สิ่งที่ "แถมฟรี" คือ *ความสาธารณะ*
 *    และมันแถมโดยไม่มี diff ให้ใครรีวิว**
 * 🎯 ***"ควรสาธารณะ" กับ "กลายเป็นสาธารณะเพราะไฟล์ไปวางตรงนั้น" เป็นคนละเรื่อง —
 *    และเรื่องที่สองคือสิ่งที่ทำให้หน้าถัดไปที่ *ไม่ควร* สาธารณะ กลายเป็นสาธารณะโดยไม่มีใครตัดสิน*** (ถ้อยคำ P3)
 *
 * ## 🔴 หน้านี้ยังเด้งไป `/login` จนกว่า `proxy.ts` จะเปิดให้ — **ไม่ใช่บั๊กของหน้านี้**
 * ยิงจริงตอนไฟล์ยังไม่มีด้วยซ้ำ: `GET /templates/abc` → **307 → `/login?next=%2Ftemplates%2Fabc`**
 * ⇒ ***proxy ตัดสินก่อน routing — หน้าที่ยังไม่มีอยู่ก็โดน redirect*** · `proxy.ts` เป็นโซน P4 · P3 แจ้งแล้ว
 * · ⚠️ **API เปิดสาธารณะแล้ว แต่หน้ายังไม่เปิด** — รูปเดียวกับ `/invite` เป๊ะ (P1 ชี้เอง)
 */
type Stop = {
  nameTh: string | null;
  nameEn: string | null;
  slug: string;
  category: string | null;
  dwellMinutes: number | null;
};
type Day = {
  dayNumber: number;
  citySlug: string | null;
  cityNameTh: string | null;
  countryId: string | null;
  overnightCityNameTh: string | null;
  stops: Stop[];
};
type Template = { id: string; title: string; dayCount: number; nightCount: number; days: Day[] };

type State =
  | { status: "loading" }
  | { status: "ready"; template: Template }
  | { status: "notFound" }
  | { status: "error" };

/** คีย์เก็บวันที่ระหว่างเด้งไปล็อกอิน — ตระกูลเดียวกับ `luitrip.newTrip.cities` ของ `CityPickerScreen` */
const DATE_KEY = "luitrip.template.startDate";

/**
 * 🔴 **ชื่อจุดแวะ: `nameTh` เป็น null ได้ และ P1 *จงใจ* ไม่ fallback ให้ในฐาน**
 * เพื่อให้ฝั่งหน้าเว็บแยก *"ไม่มีชื่อไทย"* ออกจาก *"ชื่อไทยคือสลัก"* ได้เอง
 * ⇒ ที่นี่เลือก `ไทย → อังกฤษ → สลัก` **เพราะหน้านี้ต้องมีอะไรให้อ่านเสมอ** — สลักอ่านออกกว่าช่องว่าง
 * · 📌 template ญี่ปุ่นวันนี้มีชื่อไทยครบ · **เวียดนามในอนาคตจะไม่ครบ** (P1 บอกไว้) ⇒ ชั้นนี้จะได้ใช้จริง
 */
function stopLabel(s: Stop): string {
  return s.nameTh || s.nameEn || s.slug;
}

/**
 * คืนวันที่ที่เลือกไว้ก่อนถูกเด้งไปล็อกอิน — **อ่านตอนตั้งค่าเริ่มต้นของ state ไม่ใช่ใน `useEffect`**
 *
 * 🔴 `react-hooks/set-state-in-effect` แดงถ้าอ่านใน effect แล้ว `set` (ด่าน `npm run lint` จับให้ · ฉบับแรกของผมโดนเต็ม ๆ)
 * และมัน **ไม่จำเป็นด้วย**: การกู้ค่าครั้งเดียวตอน mount ไม่ต้องใช้ effect ตั้งแต่แรก
 * 🎯 *กฎนี้ชี้ไปที่ state ที่ซ้ำซ้อน ไม่ใช่แค่สไตล์การเขียน* — แพทเทิร์นเดียวกับ `CityPickerScreen.readPickedCities`
 *
 * 🔴 `typeof window` จำเป็น ไม่ใช่ของเผื่อ — ไฟล์เป็น `"use client"` **แต่ Next ยัง prerender บนเซิร์ฟเวอร์อยู่ดี**
 */
function readSavedDate(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(DATE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function TemplatePreviewPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [startDate, setStartDate] = useState(readSavedDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engine/trip-templates/${encodeURIComponent(params.templateId)}`)
      .then(async (r) => {
        if (r.status === 404) return { status: "notFound" as const };
        if (!r.ok) throw new Error(`template ${r.status}`);
        const body = (await r.json()) as { template: Template };
        return { status: "ready" as const, template: body.template };
      })
      // 🔴 ล้มเหลว = "อ่านไม่ได้" ไม่ใช่ "ไม่มีทริปนี้" — แยกสองอย่างนี้ให้ผู้ใช้เห็น
      .catch(() => ({ status: "error" as const }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [params.templateId]);

  async function createTrip() {
    if (!startDate || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/engine/trip-templates/${encodeURIComponent(params.templateId)}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate }),
      });
      if (res.status === 401) {
        /**
         * 🔴 **เก็บวันที่ก่อนเด้ง — ไม่งั้นผู้ใช้เสียของที่เพิ่งเลือกไป**
         * P4 วัดเจอรูปนี้เมื่อเช้าที่ flow สร้างทริป: *เมืองรอด (อยู่ใน `sessionStorage`) · **ชื่อที่พิมพ์หายหมด***
         * 🎯 ***สิ่งที่หายคือสิ่งที่ผู้ใช้เพิ่งลงแรง — ไม่ใช่สิ่งที่ระบบเลือกให้***
         * · `next=` ชี้กลับมาที่ **หน้านี้ใบเดิม** ไม่ใช่หน้าแรก (`copy` คืน `401 JSON` ไม่ redirect เอง — P1 ยืนยัน)
         */
        try {
          window.sessionStorage.setItem(DATE_KEY, startDate);
        } catch {
          /* เก็บไม่ได้ก็ยังต้องพาไปล็อกอิน — เสียวันที่ ดีกว่าค้างอยู่เฉย ๆ */
        }
        router.push(`/login?next=${encodeURIComponent(`/templates/${params.templateId}`)}`);
        return;
      }
      if (res.status === 503) {
        setError("ระบบกำลังอยู่ในโหมดอ่านอย่างเดียว — ลองใหม่อีกครั้งในภายหลัง");
        return;
      }
      if (!res.ok) {
        setError("สร้างทริปไม่สำเร็จ — ลองใหม่อีกครั้ง");
        return;
      }
      const body = (await res.json()) as { trip: { id: string } };
      try {
        window.sessionStorage.removeItem(DATE_KEY);
      } catch {
        /* ล้างไม่ได้ก็ไม่เป็นไร — ค่าจะถูกทับรอบหน้า */
      }
      router.push(`/trip/${body.trip.id}`);
    } catch {
      setError("เชื่อมต่อไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <BackHomeLink />
        <div className="mt-4 h-7 w-2/3 animate-pulse rounded bg-surface-soft" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-soft" />
          ))}
        </div>
      </main>
    );
  }

  if (state.status !== "ready") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-content">
          {state.status === "notFound"
            ? "ไม่พบทริปแนะนำนี้ — อาจถูกเอาออกไปแล้ว หรือลิงก์ผิด"
            : "โหลดทริปแนะนำไม่ได้ — ลองรีเฟรชหน้านี้อีกครั้ง"}
        </p>
        <BackHomeLink className="mt-3" />
      </main>
    );
  }

  const t = state.template;
  const firstDay = t.days[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-32 sm:py-10">
      <BackHomeLink />

      <div className="mt-3 overflow-hidden rounded-2xl border border-edge bg-surface-raised shadow-raised">
        <CoverImage
          countryId={firstDay?.countryId}
          slug={firstDay?.citySlug}
          sizes="(max-width: 767px) 92vw, 704px"
          emoji="🗺️"
        />
        <div className="px-4 py-4">
          <h1 className="text-xl font-extrabold text-content sm:text-2xl">{t.title}</h1>
          <p className="mt-1 text-sm text-content-soft">{COPY.tripLength(t.dayCount, t.nightCount)}</p>
        </div>
      </div>

      {/**
       * 🔴 **แสดงทุกวัน รวมวันที่ไม่มีจุดแวะ** — P1 จงใจไม่กรองวันว่างทิ้งฝั่งฐาน
       * 🎯 ***จำนวนวันบนหน้านี้ต้องตรงกับที่การ์ดบอกไว้ ("5 วัน 4 คืน") — วันที่หายไปหนึ่งวัน
       *    ทำให้ผู้ใช้นับแล้วไม่ตรง และเขาจะไม่รู้ว่าอะไรผิด***
       */}
      <ol className="mt-6 space-y-3">
        {t.days.map((d) => (
          <li key={d.dayNumber} className="rounded-2xl border border-edge bg-surface-raised p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-bold text-content">วันที่ {d.dayNumber}</span>
              {d.cityNameTh && <span className="text-sm text-content">· {d.cityNameTh}</span>}
              {d.overnightCityNameTh && (
                <span className="text-xs text-content-soft">🌙 นอน{d.overnightCityNameTh}</span>
              )}
            </div>
            {d.stops.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {d.stops.map((s) => (
                  <li key={s.slug} className="flex items-baseline gap-2 text-sm text-content">
                    <span aria-hidden className="text-content-soft">
                      •
                    </span>
                    <span className="min-w-0">{stopLabel(s)}</span>
                    {s.dwellMinutes ? (
                      <span className="shrink-0 text-xs text-content-soft">{s.dwellMinutes} นาที</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-content-soft">ยังไม่ได้วางแผนวันนี้ — เติมเองได้หลังสร้างทริป</p>
            )}
          </li>
        ))}
      </ol>

      {/**
       * 🔴 **ช่องวันที่อยู่ *ติดกับปุ่ม* ไม่ใช่ขั้นตอนแยก** — ผู้ใช้บอกเองว่า
       * *"มีปุ่มให้กดสร้างทริป **หลังจากนั้นก็จะพาไปหน้าที่เป็นการจัดลำดับ**"*
       * 🎯 ***ในหัวเขาไม่มีขั้นกลาง — อะไรที่แทรกระหว่าง "กดปุ่ม" กับ "ไปหน้าทริป" จะรู้สึกเหมือนระบบขัดขา***
       * · ⚠️ `p_start_date` **ไม่มีค่าเริ่มต้นในฐาน** (ไม่ส่ง = `22023`) ⇒ ปุ่มปิดจนกว่าจะเลือก
       *   🔴 **และต้องบอกว่าทำไมมันปิด** — ปุ่มเทาที่ไม่อธิบายตัวเอง คือปุ่มที่ผู้ใช้คิดว่าเว็บพัง
       */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-end gap-3">
          <label className="min-w-[9rem] flex-1 text-sm">
            <span className="mb-1 block font-medium text-content">วันเริ่มทริป</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-action-outline bg-surface px-3 py-2 text-content"
            />
          </label>
          <button
            type="button"
            onClick={createTrip}
            disabled={!startDate || submitting}
            className="h-11 shrink-0 rounded-pill bg-maple-dark px-5 font-semibold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "กำลังสร้าง…" : "สร้างทริป"}
          </button>
        </div>
        {(!startDate || error) && (
          <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-content-soft">
            {error || "เลือกวันเริ่มทริปก่อน แล้วระบบจะเลื่อนตารางทั้งชุดให้ตามวันที่เลือก"}
          </p>
        )}
      </div>
    </main>
  );
}
