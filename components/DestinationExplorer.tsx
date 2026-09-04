"use client";

import { useEffect, useState } from "react";
import type { CityOption, CountryOption } from "@/components/TripDestinationPicker";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.explorer;

/**
 * **เมนู "เลือกปลายทาง"** — กดธงประเทศ → เลือกเมือง → เปิดฟอร์มสร้างทริปโดยเติมปลายทางให้แล้ว
 * เจ้าของ: P2-UI/UX · 4 ก.ย. 2026 · ผู้ใช้สั่งเอง
 *
 * ## 🔴 เมนูนี้ **ไม่ตั้งจำนวนวันให้ผู้ใช้** — และนั่นคือสิ่งที่แยกมันออกจาก "ทริปแนะนำ"
 * ผู้ใช้แก้ข้อเสนอเดิมของ P1 ตรงจุดนี้เอง:
 * > *"เขาเลือก ประเทศ หรือเมือง **แต่ไม่ได้ระบุวันที่เพราะเขาจะกรอกเอง**"*
 * ⇒ กดเมืองแล้ว **ยังไม่สร้างทริป** · เปิดฟอร์มที่เติมปลายทางไว้ เหลือให้เขาใส่ชื่อ+วันที่
 * 🎯 ***ทริปที่วันที่มั่ว คือทริปที่เขาต้องลบทิ้ง — และวันนี้ลบไม่ได้ด้วย***
 *
 * ## ทำไมธงอีโมจิ ไม่ใช่ไฟล์รูปประเทศ
 * `public/covers/` มี `country-*.svg` แค่ **4 จาก 9 ประเทศ** (jp · kr · th · vn)
 * ⇒ ใช้ไฟล์รูป = ห้าประเทศได้กล่องเปล่า **ทั้งที่ผู้ใช้ขอ "กดที่ icon นั้น ๆ"**
 * 🔴 ธงคำนวณจาก `country_id` (ISO-3166-1 alpha-2) ได้ครบทุกประเทศ **โดยไม่ต้องรออาร์ตเวิร์ก**
 * · ⚠️ ข้อแลก: ธงเรนเดอร์ต่างกันตามระบบปฏิบัติการ (บาง Windows ได้ตัวอักษร `JP` แทนธง)
 *   **ยอมรับได้** เพราะชื่อประเทศอยู่ข้าง ๆ เสมอ — ไอคอนเป็นของเสริม ไม่ใช่ตัวบอกความหมายตัวเดียว
 */
function flagOf(countryId: string): string {
  const code = countryId.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

type ListState<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

/** รูปปกเมือง — ไล่ `city-<slug>` → พื้นไล่สี · **ไม่ไล่ไปรูปประเทศ** เพราะที่นี่ทุกใบเป็นประเทศเดียวกัน
 *  ⇒ รูปประเทศจะทำให้ทุกเมืองหน้าตาเหมือนกันหมด ซึ่งแย่กว่าพื้นไล่สีที่อย่างน้อยไม่โกหกว่าเป็นเมืองนั้น */
function CityThumb({ slug }: { slug: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!slug || broken) {
    return <div className="h-20 w-full bg-gradient-to-br from-pine to-maple" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง
    <img
      src={`/covers/city-${slug}.svg`}
      alt=""
      className="h-20 w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

export function DestinationExplorer({ onPickCity }: { onPickCity: (city: CityOption) => void }) {
  const [countries, setCountries] = useState<ListState<CountryOption>>({ status: "loading" });
  const [countryId, setCountryId] = useState("");
  /**
   * เก็บผลคู่กับประเทศที่ผลนั้นเป็นของ แล้ว derive ตอน render — **แพทเทิร์นเดียวกับ `TripDestinationPicker`**
   * (กัน `react-hooks/set-state-in-effect` และกันเมืองของประเทศเก่าโผล่เป็นของประเทศใหม่ระหว่างรอโหลด)
   */
  const [cityResult, setCityResult] = useState<{
    forCountryId: string;
    state: ListState<CityOption>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/countries")
      .then((r) => {
        if (!r.ok) throw new Error(`countries ${r.status}`);
        return r.json() as Promise<CountryOption[]>;
      })
      .then((rows) => {
        if (!cancelled) setCountries({ status: "ready", items: rows });
      })
      // 🔴 ล้มเหลว = "อ่านไม่ได้" ไม่ใช่ "ไม่มีประเทศ" — โชว์ลิสต์ว่างเงียบ ๆ คือการโกหก
      .catch(() => {
        if (!cancelled) setCountries({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!countryId) return;
    let cancelled = false;
    fetch(`/api/engine/cities?country=${encodeURIComponent(countryId)}&limit=60`)
      .then((r) => {
        if (!r.ok) throw new Error(`cities ${r.status}`);
        return r.json() as Promise<CityOption[]>;
      })
      .then((rows) => {
        if (!cancelled) setCityResult({ forCountryId: countryId, state: { status: "ready", items: rows } });
      })
      .catch(() => {
        if (!cancelled) setCityResult({ forCountryId: countryId, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [countryId]);

  const cityState: ListState<CityOption> = !countryId
    ? { status: "ready", items: [] }
    : cityResult?.forCountryId === countryId
      ? cityResult.state
      : { status: "loading" };

  if (countries.status === "error") {
    return <p className="py-6 text-center text-sm text-content-soft">{COPY.countriesError}</p>;
  }

  return (
    <div>
      {/* ── แถวธงประเทศ ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {countries.status === "loading"
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 w-28 animate-pulse rounded-xl bg-surface-soft" />
            ))
          : countries.items.map((c) => {
              const active = c.id === countryId;
              return (
                <button
                  key={c.id}
                  onClick={() => setCountryId(active ? "" : c.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "border-maple bg-maple-soft/60 text-content"
                      : "border-line bg-surface-raised text-content-soft hover:border-maple/40 hover:text-content"
                  }`}
                >
                  <span aria-hidden className="text-xl leading-none">
                    {flagOf(c.id)}
                  </span>
                  {c.name_th}
                </button>
              );
            })}
      </div>

      {/* ── เมืองของประเทศที่เลือก ───────────────────────────────────── */}
      {countryId !== "" && (
        <div className="mt-3">
          {cityState.status === "loading" ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-soft" />
              ))}
            </div>
          ) : cityState.status === "error" ? (
            <p className="py-4 text-sm text-content-soft">{COPY.citiesError}</p>
          ) : cityState.items.length === 0 ? (
            /* 🔴 ประเทศที่ยังไม่มีเมืองในคลัง — **ไม่ใช่ error และไม่ใช่หน้าว่างเงียบ ๆ**
               (มาเก๊า · สิงคโปร์ · ฮ่องกง มีเมืองละ 1 วันนี้ · วันหน้าอาจมีประเทศที่ยังไม่มีเลย) */
            <p className="py-4 text-sm text-content-soft">{COPY.noCities}</p>
          ) : (
            /* 🔴 การ์ดเมืองเล็กกว่าการ์ดทริปได้ — มันมีแค่รูป+ชื่อ ไม่มีวันที่/สมาชิก/ป้ายให้อ่าน
               `9.5rem` ทำให้**มือถือ 375px ได้ 2 คอลัมน์** (11rem ได้คอลัมน์เดียว ซึ่งดูโหรงเหรง
               และต้องเลื่อนยาวมากเมื่อประเทศมี 23 เมือง) */
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]">
              {cityState.items.map((city) => (
                <button
                  key={city.id}
                  onClick={() => onPickCity(city)}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface-raised text-left transition hover:border-maple/40 hover:shadow-md hover:shadow-ink/5"
                >
                  <CityThumb slug={city.legacy_slug} />
                  <div className="p-2.5">
                    <div className="truncate text-sm font-semibold text-content">{city.name_th}</div>
                    {/* ชื่ออังกฤษ/ท้องถิ่นเป็นบรรทัดรอง — **จองที่ไว้เสมอ** ให้ทุกใบสูงเท่ากัน
                        ไม่งั้นเมืองที่ไม่มีชื่อท้องถิ่นจะทำให้แถวนั้นเตี้ยกว่าเพื่อน */}
                    <div className="truncate text-xs text-content-soft">
                      {city.name_local || city.name_en || " "}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
