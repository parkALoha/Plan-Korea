"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { MAX_TRIP_DAYS } from "@/lib/engine/tripLimits";

/**
 * โมดัลกรอกรายละเอียดทริปใหม่ — ขั้นสุดท้ายของ flow **ประเทศ → เมือง → รายละเอียด**
 * เจ้าของ: P5 · 4 ก.ย. 2026 · ผู้ใช้สั่ง flow นี้เอง
 *
 * ## ช่องที่มี — และเหตุผลที่ **ไม่มี** ช่องอื่น
 * ผู้ใช้เคาะเอง: **จำนวนวัน/วันที่ (บังคับ) · ชื่อทริป (ไม่บังคับ)** เท่านั้น
 * 🔴 **ห้ามเพิ่ม จำนวนคน · งบ · สไตล์การเที่ยว** — *"ฟังดูดีแต่เว็บเราไม่มีฟีเจอร์ไหนใช้มัน"*
 * 🎯 ***ช่องที่เก็บของที่ไม่มีใครอ่าน คือช่องที่ทำให้ผู้ใช้เสียเวลาแล้วไม่ได้อะไรกลับ***
 *
 * ## 🔴 `title` — API บังคับ แต่ผู้ใช้ไม่ต้องกรอก · เราเติมให้ที่นี่
 * `POST /api/engine/trips` ตรวจ `length(trim(title)) between 1 and 120` (`route.ts:79-81`)
 * ⇒ **ปล่อยว่างส่งไปจะได้ 400** · ที่นี่จึงสร้างชื่อให้เมื่อผู้ใช้เว้นว่าง (`"โตเกียว 5 วัน 4 คืน"`)
 * · ⚠️ **เติมที่นี่ ไม่ใช่ที่ route** — route เป็นโซน P1 และชื่ออัตโนมัติเป็นเรื่องของ *ประสบการณ์*
 *   ไม่ใช่ *สัญญาของ API* · ถ้าวันหนึ่งมีผู้เรียกอื่น มันควรถูกบังคับให้ตั้งชื่อเองเหมือนเดิม
 *
 * ## 🔴 วันที่ — ผู้ใช้เลือก "ไม่ต้องเลือกวันตอนแรก" (4 ก.ย. 2026) และฐานบังคับให้มีวันเสมอ
 * ```
 * ฐาน       trips.start_date / end_date  **not null** · ทุกทริปต้องมีช่วงวัน
 * ผู้ใช้     "ไม่ต้องเลือกวันตอนแรก เพราะแก้ไขได้ภายหลัง"
 * ```
 * ✅ ทางที่ใช้: **โหมด "จำนวนวัน" เป็นค่าตั้งต้น · วันเริ่ม = วันนี้ · และ *แสดงช่วงวันที่ได้จริงให้เห็น***
 * 🔴 **ไม่ใช่การซ่อนวันที่ — เป็นการ *ไม่บังคับให้เลือก* แต่ยัง *บอกว่าได้อะไร*** (P1 ตั้งเงื่อนไขข้อนี้ไว้)
 *    ⇒ ไม่มีวันไหนที่ผู้ใช้ไม่เคยเห็นก่อนกดสร้าง · แก้ทีหลังได้ด้วย `PATCH /api/engine/trips/[tripId]`
 * · ⚠️ **ปุ่ม "เพิ่มวัน" ที่ผู้ใช้เอ่ยถึงตอนตัดสินใจ ยังไม่มีอยู่จริงวันนี้** (`days/route.ts` มีแค่ `GET`+`PATCH`
 *   · `grep "เพิ่มวัน|addDay"` ได้ 0 จุด) — ทางแก้วันนี้คือแก้ *ช่วงวันที่* เท่านั้น · แจ้ง P1 แล้ว
 *   🎯 **จดไว้เพราะเหตุผลที่ผู้ใช้ใช้ตัดสินใจ ต้องตรวจได้เท่ากับตัวการตัดสินใจเอง**
 */

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` ตามเขตเวลา **ของเครื่องผู้ใช้** — ไม่ใช่ UTC
 *
 * 🔴 `toISOString()` แปลงเป็น UTC ก่อนเสมอ → ผู้ใช้ไทย (UTC+7) กดสร้างทริปตอน 3 ทุ่ม
 *    จะได้ `startDate` เป็น **เมื่อวาน** · เงียบสนิท และเห็นเฉพาะช่วงหัวค่ำถึงเที่ยงคืน
 */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(y, m - 1, d + n));
}

function daysBetween(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / DAY_MS) + 1;
}

/**
 * `"โตเกียว 5 วัน 4 คืน"` · หลายเมือง → `"โตเกียว +2 เมือง 5 วัน 4 คืน"`
 * · 1 วันไม่มีคืน จึงไม่เขียน `"0 คืน"`
 * 🔴 **ไม่ต่อชื่อเมืองทุกใบ** — 20 เมือง (เพดาน) จะได้ชื่อยาวเกิน 120 ตัวอักษรที่ `POST /trips` รับ
 *    (`route.ts:79-81` `length(trim(title)) between 1 and 120`) ⇒ **สร้างไม่ได้ และผู้ใช้จะไม่รู้ว่าทำไม**
 *    ⚠️ ผู้ใช้แก้ชื่อเองได้อยู่แล้ว · ชื่ออัตโนมัติมีหน้าที่ *ไม่ขวางทาง* ไม่ใช่ *ครบถ้วน*
 */
export function autoTripTitle(cityNames: string[], days: number): string {
  const head = cityNames[0] ?? "ทริป";
  const more = cityNames.length > 1 ? ` +${cityNames.length - 1} เมือง` : "";
  const nights = days - 1;
  return nights > 0 ? `${head}${more} ${days} วัน ${nights} คืน` : `${head}${more} 1 วัน`;
}

export function NewTripModal({
  cities,
  onClose,
  onCreated,
}: {
  /**
   * เมืองที่เลือก **เรียงตามลำดับที่จะไป** — ส่งต่อเป็น `cityIds` ตรง ๆ
   * 🔴 ลำดับใน array คือ `rank` ที่ฐานเก็บ (`…/destinations/route.ts`) **ห้ามเรียงใหม่ที่นี่**
   */
  cities: { id: string; name: string }[];
  onClose: () => void;
  /**
   * ได้ `tripId` แล้ว — ผู้เรียกเป็นคนพาไปหน้าทริป (โมดัลไม่รู้จัก router)
   * `warning` มีค่าเมื่อ **ทริปเกิดแล้วแต่บางส่วนไม่สำเร็จ** (วันนี้: บันทึกเมืองล้ม) — ต้องบอกผู้ใช้ ไม่ใช่กลืน
   */
  onCreated: (tripId: string, warning?: string) => void;
}) {
  const today = useMemo(() => isoLocal(new Date()), []);
  const [mode, setMode] = useState<"days" | "dates">("days");
  const [dayCount, setDayCount] = useState("3");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => addDays(today, 2));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayOptions: DropdownOption[] = useMemo(
    () =>
      Array.from({ length: MAX_TRIP_DAYS }, (_, i) => {
        const n = i + 1;
        return { value: String(n), label: n === 1 ? "1 วัน" : `${n} วัน ${n - 1} คืน` };
      }),
    [],
  );

  // ── ช่วงวันจริงที่จะถูกส่ง — **คำนวณจากโหมดที่เลือก และแสดงให้เห็นเสมอ** ──────────
  const range = useMemo(() => {
    if (mode === "days") {
      const n = Number(dayCount);
      return { start: today, end: addDays(today, n - 1), days: n };
    }
    return { start: startDate, end: endDate, days: daysBetween(startDate, endDate) };
  }, [mode, dayCount, startDate, endDate, today]);

  /** 🔴 เพดานเดียวกับ route — `import` มา ไม่ได้พิมพ์ `30` ซ้ำ (`tripLimits.ts` ห้ามไว้) */
  const rangeInvalid =
    range.days < 1 ? "วันสิ้นสุดมาก่อนวันเริ่มไม่ได้"
    : range.days > MAX_TRIP_DAYS ? `ทริปยาวได้สูงสุด ${MAX_TRIP_DAYS} วัน (ตอนนี้ ${range.days} วัน)`
    : null;

  const cityNames = cities.map((c) => c.name);
  const effectiveTitle = title.trim() || autoTripTitle(cityNames, range.days);

  async function submit() {
    if (rangeInvalid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/engine/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: effectiveTitle,
          startDate: range.start,
          endDate: range.end,
          cityIds: cities.map((c) => c.id),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { id?: string; error?: string; destinationsError?: string }
        | null;
      if (!res.ok) {
        // 🔴 แสดงข้อความของ route ตรง ๆ — มันเขียนมาให้ผู้ใช้อ่านอยู่แล้ว (`route.ts:58`)
        //    เขียนทับด้วยข้อความรวม ๆ ของเราเอง = ทิ้งข้อมูลที่ฝั่งเซิร์ฟเวอร์อุตส่าห์บอก
        setError(data?.error ?? `สร้างทริปไม่สำเร็จ (${res.status})`);
        return;
      }
      if (!data?.id) {
        setError("สร้างทริปแล้วแต่ไม่ได้รหัสทริปกลับมา — ลองเปิดหน้าทริปทั้งหมดดู");
        return;
      }
      /**
       * 🔴 **`201` ไม่ได้แปลว่าเมืองถูกบันทึก** — `POST /trips` เขียนจุดหมาย **นอกธุรกรรม**
       * ของการสร้างทริป และคืน `201` ต่อไปแม้ส่วนนั้นล้ม (`app/api/engine/trips/route.ts:165-183`)
       * P1 แนบ `destinationsError` มาให้ **เพื่อให้ UI พูดแทน** — เขาเขียนไว้ตรง ๆ ว่า
       * *"ห้ามคืน 201 เปล่า ๆ เหมือนไม่มีอะไรเกิดขึ้น — ผู้ใช้เลือกเมืองไว้แล้วมันหาย
       *   และเขาจะไม่มีทางรู้จนกว่าจะเปิดการ์ดมาดูแล้วสงสัยเอง"*
       *
       * 🎯 ***ทั้งเส้นทางนี้มีอยู่เพื่อให้ผู้ใช้เลือกเมือง — เมืองหายแล้วเงียบ คือความล้มเหลวของ flow
       *    ทั้งใบ ไม่ใช่รายละเอียดปลีกย่อย*** · แต่ทริป **เกิดแล้วจริง** จึงพาไปต่อ ไม่ใช่ค้างที่โมดัล
       * ⚠️ ฉบับแรกของไฟล์นี้ไม่ได้อ่านฟิลด์นี้เลย — เงียบสนิทตรงจุดที่ P1 อุตส่าห์ทำให้ไม่เงียบ
       */
      if (data.destinationsError) {
        onCreated(
          data.id,
          `สร้างทริปแล้ว แต่บันทึกเมือง${cities.length > 1 ? `ทั้ง ${cities.length} เมือง` : ` “${cityNames[0]}”`}ไม่สำเร็จ — เพิ่มเมืองได้ที่หน้าทริป`,
        );
        return;
      }
      onCreated(data.id);
    } catch {
      setError("ต่อเน็ตไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      eyebrow="ทริปใหม่"
      title={cities.length === 1 ? cityNames[0] : `${cityNames[0]} +${cities.length - 1} เมือง`}
      subtitle={
        cities.length > 1
          ? // 🔴 โชว์ลำดับจริงที่จะถูกบันทึก — ผู้ใช้ต้องเห็นก่อนกดสร้าง ไม่ใช่ไปเจอทีหลังบนหน้าทริป
            `จะไปตามลำดับ: ${cityNames.join(" → ")}`
          : "กรอกเท่าที่รู้ตอนนี้ก็ได้ — แก้ทีหลังได้ทั้งหมด"
      }
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || rangeInvalid !== null}
            className="rounded-xl bg-maple px-4 py-2.5 text-sm font-bold text-cream disabled:opacity-50"
          >
            {busy ? "กำลังสร้าง…" : "สร้างทริป"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* ── ชื่อทริป — ไม่บังคับ · โชว์ชื่อที่จะได้จริงเมื่อเว้นว่าง ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-trip-title" className="text-sm font-semibold">
            ชื่อทริป <span className="font-normal text-ink/50">(ไม่บังคับ)</span>
          </label>
          <input
            id="new-trip-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={autoTripTitle(cityNames, range.days)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
          />
          {/* 🔴 บอกชื่อที่จะได้จริง ไม่ใช่แค่ placeholder — placeholder หายทันทีที่พิมพ์ตัวแรกแล้วลบ */}
          {title.trim() === "" && (
            <p className="text-xs text-ink/60">เว้นว่างไว้จะตั้งชื่อให้ว่า “{autoTripTitle(cityNames, range.days)}”</p>
          )}
        </div>

        {/* ── โหมด: จำนวนวัน / วันที่ ── */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">ไปกี่วัน</span>
          <div className="flex gap-2" role="group" aria-label="วิธีระบุช่วงวัน">
            {([["days", "ระบุจำนวนวัน"], ["dates", "ระบุวันที่"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-medium transition " +
                  (mode === m ? "border-maple bg-maple/10 text-maple" : "border-line text-ink/70")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "days" ? (
            <Dropdown
              value={dayCount}
              onChange={setDayCount}
              options={dayOptions}
              placeholder="เลือกจำนวนวัน"
              ariaLabel="จำนวนวัน"
            />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-xs text-ink/70">
                เริ่ม
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // วันสิ้นสุดที่มาก่อนวันเริ่มเป็นสภาพที่ผู้ใช้ไม่ได้ตั้งใจเสมอ — ดันตามให้
                    if (e.target.value && endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-ink/70">
                สิ้นสุด
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            </div>
          )}

          {/* 🔴 ช่วงวันที่ได้จริง — **ต้องเห็นแม้อยู่โหมด "จำนวนวัน"**
              เงื่อนไขของ P1: ห้ามให้มีวันที่ที่ผู้ใช้ไม่เคยเห็นก่อนกดสร้าง */}
          {rangeInvalid === null && (
            <p className="text-xs text-ink/60">
              {mode === "days" ? "จะได้ช่วงวัน " : "รวม "}
              <span className="font-semibold text-ink/80">
                {range.start} ถึง {range.end}
              </span>
              {mode === "days" ? " (เริ่มวันนี้ — แก้ทีหลังได้)" : ` · ${range.days} วัน`}
            </p>
          )}
          {rangeInvalid && <p className="text-xs font-medium text-maple">{rangeInvalid}</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-maple/40 bg-maple/5 px-3 py-2 text-sm text-maple">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
