"use client";

import { useEffect, useState } from "react";
import type { CityOption, CountryOption } from "@/components/TripDestinationPicker";
import { CoverCard } from "@/components/CoverCard";
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

/**
 * รูปปกประเทศ — ไฟล์ `country-<id>.svg` ถ้ามี · ไม่มีก็ **พื้นไล่สี + ธงใบใหญ่**
 * 🔴 มีไฟล์แค่ 4 จาก 9 ประเทศ ⇒ ห้าใบต้องมีอะไรที่ *ไม่ใช่กล่องเปล่า* และธงคือของที่มีความหมายที่สุดที่เรามี
 *    (ผู้ใช้ขอ "icon ประเทศ" ตั้งแต่แรก · ตอนนี้มันย้ายจาก*ตัวการ์ด*มาเป็น*ของในการ์ด* ตามที่เขาสั่งรอบสอง)
 */
function CountryThumb({ countryId }: { countryId: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    /**
     * 🔴 **พื้นไล่สีเปล่า ไม่ใส่ธงซ้ำ** — ธงอยู่ในบรรทัดชื่อแล้ว **ทุกใบ**
     * ยิงจริงตอนใส่ทั้งสองที่: ประเทศที่ไม่มีไฟล์รูปได้ `🇨🇳 🇨🇳จีน` **ธงซ้ำสองรอบ**
     * ส่วนสี่ประเทศที่มีไฟล์รูปได้ธงรอบเดียว ⇒ **การ์ดเก้าใบมีสองแบบโดยไม่ได้ตั้งใจ**
     * 🎯 ***ไอคอนต้องอยู่ที่เดียว "ที่มีเสมอ" ไม่ใช่สองที่ "ที่มีบ้างไม่มีบ้าง"***
     */
    return <div className="h-28 w-full bg-gradient-to-br from-pine to-maple" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง
    <img
      src={`/covers/country-${countryId}.svg`}
      alt=""
      className="h-28 w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

/** รูปปกเมือง — ไล่ `city-<slug>` → พื้นไล่สี · **ไม่ไล่ไปรูปประเทศ** เพราะที่นี่ทุกใบเป็นประเทศเดียวกัน
 *  ⇒ รูปประเทศจะทำให้ทุกเมืองหน้าตาเหมือนกันหมด ซึ่งแย่กว่าพื้นไล่สีที่อย่างน้อยไม่โกหกว่าเป็นเมืองนั้น */
function CityThumb({ slug }: { slug: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!slug || broken) {
    return <div className="h-28 w-full bg-gradient-to-br from-pine to-maple" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง
    <img
      src={`/covers/city-${slug}.svg`}
      alt=""
      className="h-28 w-full object-cover"
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
      {/**
       * ── การ์ดประเทศ ──────────────────────────────────────────────
       * 🔴 **ประเทศเป็น *การ์ด* ไม่ใช่ชิป/ปุ่มธง** — ผู้ใช้สั่งเอง (รอบสอง):
       * > *"จะโชว์ component เหมือนกับรูป trip ของตัวเอง **เป็นชื่อประเทศ กดเข้าไป ค่อยมีเมืองเด้งมาให้เลือกต่อ**"*
       * ⇒ ใช้ `CoverCard` ใบเดียวกับการ์ดทริป · ธงยังอยู่ **แต่ย้ายจาก *ตัวการ์ด* มาเป็น *ของในการ์ด***
       *
       * 🔴 **บรรทัด "N เมือง" และชื่อเมืองตัวอย่างยังว่าง — และตั้งใจว่างจริง ไม่ใช่ลืม**
       * `GET /api/engine/countries` คืนแค่ `id`/`name_th`/`name_en` · จะได้ตัวเลขต้องยิง `/cities`
       * ทีละประเทศ = **9 คำขอบนหน้าแรกเพื่อของประดับ** · ขอ P1 เพิ่มฟิลด์แล้ว (โซนเขา)
       * 🎯 ***ช่องถูกจองไว้ให้แถวสูงเท่ากัน แต่ไม่เติมของปลอมลงไป*** — รูปเดียวกับบรรทัด 📍 ของการ์ดทริป
       */}
      {countryId === "" && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
          {countries.status === "loading"
            ? Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-soft" />
              ))
            : countries.items.map((c) => (
                <CoverCard
                  key={c.id}
                  onClick={() => setCountryId(c.id)}
                  coverLayout="banner"
                  cover={<CountryThumb countryId={c.id} />}
                  title={
                    <>
                      <span aria-hidden className="mr-1.5">
                        {flagOf(c.id)}
                      </span>
                      {c.name_th}
                    </>
                  }
                  titleClassName="text-sm font-semibold"
                >
                  {/**
                   * 🔴 **ช่องที่เคยจองว่างไว้ ตอนนี้มีของจริงแล้ว** (`c8a0379`)
                   * · `cityCount` — `null` **ไม่ใช่** `0` ⇒ อ่านคลังไม่ได้ ต้องได้ช่องว่างเหมือนเดิม
                   *   ***"0 เมือง" ตอนที่เราแค่อ่านไม่ได้ คือการบอกสิ่งที่เราไม่รู้*** (P1 ชี้ · ตรงกับที่ผมปฏิเสธมาตลอด)
                   * · `sampleCities` เรียงตาม `created_at` — 🔴 **ห้ามเรียกว่า "ยอดนิยม"** เราไม่มีข้อมูลความนิยม
                   *   ⇒ ใช้ `📍` เฉย ๆ เหมือนบรรทัดจุดหมายของการ์ดทริป **ไม่ใส่คำที่อ้างการจัดอันดับ**
                   */}
                  <p className="mt-1 truncate text-xs font-medium text-content sm:text-sm">
                    {typeof c.cityCount === "number" ? COPY.cityCount(c.cityCount) : "\u00a0"}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-content sm:text-sm"
                    aria-hidden={c.sampleCities?.length ? undefined : true}
                  >
                    {c.sampleCities?.length ? `📍 ${c.sampleCities.join(" · ")}` : "\u00a0"}
                  </p>
                </CoverCard>
              ))}
        </div>
      )}

      {/* ── เมืองของประเทศที่เลือก ───────────────────────────────────── */}
      {countryId !== "" && (
        <div>
          {/* 🔴 การ์ดประเทศหายไปตอนเลือกแล้ว ⇒ **ต้องมีทางกลับที่มองเห็น**
              ไม่งั้นผู้ใช้ติดอยู่ในประเทศเดียวโดยไม่รู้ว่าออกยังไง (กดธงซ้ำเพื่อยกเลิกเป็นของที่มองไม่เห็น) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCountryId("")}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-soft"
            >
              {COPY.backToCountries}
            </button>
            <h3 className="text-sm font-semibold text-content">
              {COPY.citiesIn(countries.status === "ready" ? (countries.items.find((c) => c.id === countryId)?.name_th ?? "") : "")}
              {cityState.status === "ready" && cityState.items.length > 0 ? ` · ${COPY.cityCount(cityState.items.length)}` : ""}
            </h3>
          </div>
          {cityState.status === "loading" ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
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
            /**
             * 🔴 **ขนาดเท่าการ์ดทริปเป๊ะ (`17rem` · ปก `h-28`)** — ผู้ใช้สั่งเอง 4 ก.ย. 2026:
             * > *"ขนาดของทริปใหม่ เล็กไปหน่อย ทำให้มันเท่ากับทริปของฉันดีไหม"*
             *
             * ⚠️ **ราคาที่จ่าย และผมจดไว้เพราะมันจะกลับมา**: มือถือ 375px เหลือ **1 คอลัมน์**
             * (เดิม `9.5rem` ได้ 2) ⇒ ประเทศที่มี 23 เมือง = เลื่อนยาวมากบนมือถือ
             * 🎯 ***แต่ "การ์ดสองชนิดขนาดไม่เท่ากันในหน้าเดียว" คือสิ่งที่ผู้ใช้เห็นและทัก — ส่วนการเลื่อนยาว
             *    เขายังไม่เจอ*** · ถ้าเจอเมื่อไหร่ ทางแก้คือช่องค้นหาในลิสต์เมือง ไม่ใช่ย่อการ์ดกลับ
             */
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
              {cityState.items.map((city) => (
                /**
                 * 🔴 **การ์ดเมืองใช้เปลือกเดียวกับการ์ดทริป** — ผู้ใช้สั่งเอง (รอบที่สองของข้อเดิม):
                 * > *"รูปแบบ มันควรใช้ component เดียวกับพวกนี้นะ"*
                 * 🎯 ***เขาไม่ได้ขอให้หน้าตาคล้าย เขาขอให้เป็นตัวเดียวกัน*** — ก๊อป class จะกลับมารอบสาม
                 * · `coverLayout="banner"` เพราะกริดเมืองเป็น 2 คอลัมน์ตั้งแต่มือถือ (การ์ดกว้าง ~152px)
                 *   แถบข้างจะเหลือที่ให้รูปน้อยจนดูไม่ออกว่าเมืองอะไร — ต่างจากการ์ดทริปที่มือถือเป็นคอลัมน์เดียว
                 * · **ไม่มี `badge`** — การ์ดเมืองไม่มีอะไรที่มีความหมายให้ใส่ (ไม่มีวัน ไม่มีสมาชิก)
                 *   ⇒ ***ช่องที่มีที่ว่างแต่ว่างได้*** ไม่ใช่ช่องที่ต้องกรอกของปลอม
                 */
                <CoverCard
                  key={city.id}
                  onClick={() => onPickCity(city)}
                  coverLayout="banner"
                  cover={<CityThumb slug={city.legacy_slug} />}
                  title={city.name_th}
                  titleClassName="text-sm font-semibold"
                >
                  {/* ชื่ออังกฤษ/ท้องถิ่นเป็นบรรทัดรอง — **จองที่ไว้เสมอ** ให้ทุกใบสูงเท่ากัน
                      รูปเดียวกับบรรทัด 📍 ของการ์ดทริป: เมืองที่ไม่มีชื่อท้องถิ่นต้องไม่ทำให้แถวนั้นเตี้ยกว่าเพื่อน */}
                  <p
                    className="truncate text-xs text-content-soft"
                    aria-hidden={city.name_local || city.name_en ? undefined : true}
                  >
                    {city.name_local || city.name_en || "\u00a0"}
                  </p>
                </CoverCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
