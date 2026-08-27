"use client";

import { useEffect, useState } from "react";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.destinationPicker;

export type CountryOption = { id: string; name_th: string; name_en: string };

export type CityOption = {
  id: string;
  country_id: string;
  name_th: string;
  name_en: string;
  name_local: string | null;
  /** ฝังมากับ `GET /api/engine/cities` แล้ว (P1 28 ส.ค. 2026, `593c36d`) — ใช้โชว์ชื่อประเทศบน chip */
  catalog_countries?: CountryOption | null;
};

const MAX_CITIES = 20;
/** เพดานของ route เอง (`MAX_LIMIT`) — ขอเกินนี้ไม่ได้ ถ้าได้ครบ 50 พอดีแปลว่าอาจถูกตัด (ดู `maybeTruncated`) */
const CITY_LIMIT = 50;

type ListState<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

/**
 * เลือกจุดหมาย **ประเทศ → เมือง → กด +** (หลายคู่ เรียงตามลำดับที่เพิ่ม) — `E5` ข้อ 3
 *
 * ผู้ใช้สั่งรูปนี้เอง 28 ส.ค. 2026: *"ควรให้เลือกประเทศ และ เลือกเมือง และกด + เมือง/ประเทศได้ แต่ต้องอยู่ใน
 * ลิสของเรา — **เผื่อ ต่อเครื่อง หรือบินต่อ**"* · เหตุผลท้ายประโยคสำคัญกว่ารูปแบบ: ทริปจริงของเขาคือ
 * กรุงเทพฯ → ฮานอย (พักเครื่อง 11 ชม.) → ปูซาน — **จุดหมายหลายเมืองข้ามประเทศคือเคสปกติ ไม่ใช่ edge case**
 * เดิมเป็นช่องค้นข้อความช่องเดียวที่ไม่บอกด้วยซ้ำว่าเมืองไหนอยู่ประเทศอะไร
 *
 * 🔴 **ลำดับที่ผู้ใช้เพิ่มคือลำดับที่ส่ง** — ห้ามเรียงตามตัวอักษรหรือจัดใหม่ก่อนส่ง `cityIds`
 * (`POST /api/engine/trips` เก็บลำดับที่ส่งมาตามนั้น ไม่เรียงใหม่ให้)
 *
 * 🎯 **ทำไมถึงกรองด้วย `?country=` แทนที่จะค้นรวมแล้วจัดกลุ่มฝั่ง UI:** วัดจริงแล้ว (28 ส.ค. 2026)
 * การค้นแบบไม่กรองประเทศมี fixture ของชุดทดสอบปนอยู่ 1,694 จาก 1,736 แถว — แต่ `?country=kr` คืน 5 เมือง
 * จริงสะอาด ไม่มีขยะเลย · และ **`limit` ตัด*หลัง*เรียง** (P1 ชนมาเอง: `q="า" limit=12` → ญี่ปุ่น 12 เมือง
 * รวด ประเทศอื่นหายหมด) → **ยิงแยกต่อประเทศ ไม่ใช่ยิงรวมแล้วหั่น** ไม่งั้นประเทศที่เมืองเยอะกินโควตาคนอื่น
 */
export function TripDestinationPicker({
  selected,
  onChange,
  disabled = false,
}: {
  selected: CityOption[];
  onChange: (next: CityOption[]) => void;
  disabled?: boolean;
}) {
  const [countries, setCountries] = useState<ListState<CountryOption>>({ status: "loading" });
  const [countryId, setCountryId] = useState("");
  const [cityId, setCityId] = useState("");
  // เก็บผลคู่กับประเทศที่ผลนั้นเป็นของ แล้ว derive ตอน render (แพทเทิร์นเดียวกับ `useTripMembers`) แทน
  // setState แยกก้อนสำหรับ "loading" ตรง ๆ ในเอฟเฟกต์ — กัน react-hooks/set-state-in-effect และผลข้างเคียง
  // คือถูกอยู่แล้ว: เมืองของประเทศเก่าไม่ควรโผล่เป็น "เมืองของประเทศใหม่" ระหว่างรอโหลด
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
      .catch(() => {
        // 🔴 ล้มเหลว = "อ่านไม่ได้" ไม่ใช่ "ไม่มีประเทศ" — ต้องบอกตรง ๆ ไม่ใช่โชว์ลิสต์ว่างเงียบ ๆ
        // (รูปเดียวกับที่ `HomeScreen` แยก "อ่านไม่ได้" ออกจาก "ไม่มีข้อมูล")
        if (!cancelled) setCountries({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!countryId) return;
    let cancelled = false;
    fetch(`/api/engine/cities?country=${encodeURIComponent(countryId)}&limit=${CITY_LIMIT}`)
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

  const selectedIds = new Set(selected.map((c) => c.id));
  const atMax = selected.length >= MAX_CITIES;
  const cityItems = cityState.status === "ready" ? cityState.items : [];
  const canAdd = !disabled && !atMax && cityId !== "" && !selectedIds.has(cityId);

  function addSelected() {
    if (!canAdd) return;
    const city = cityItems.find((c) => c.id === cityId);
    if (!city) return;
    onChange([...selected, city]);
    // ล้างเฉพาะเมือง **เก็บประเทศไว้** — ผู้ใช้ที่เพิ่งเพิ่ม "โซล" มักจะเพิ่ม "ปูซาน" ต่อในประเทศเดิม
    // การรีเซ็ตประเทศด้วยจะบังคับให้เลือกซ้ำทุกครั้งโดยไม่ได้อะไรกลับมา
    setCityId("");
  }

  function removeCity(id: string) {
    onChange(selected.filter((c) => c.id !== id));
  }

  const controlClass =
    "w-full rounded-lg border border-line bg-surface-raised px-2.5 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60";

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-content-soft">{COPY.label}</label>

      {selected.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((city) => {
            // ชื่อประเทศมาจาก embed — ถ้าอ่านไม่ได้ตกไปใช้รหัส (`kr`) ดีกว่าโชว์ชื่อเมืองลอยไม่บอกประเทศ
            const countryName = city.catalog_countries?.name_th ?? city.country_id.toUpperCase();
            return (
              <li
                key={city.id}
                className="flex items-center gap-1 rounded-full bg-maple-soft py-1 pl-2.5 pr-1.5 text-xs font-medium text-maple-dark"
              >
                <span className="opacity-70">{countryName}</span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span>{city.name_th}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeCity(city.id)}
                    aria-label={COPY.remove(`${countryName} ${city.name_th}`)}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-maple/30"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {countries.status === "error" ? (
        <p className="text-xs text-maple-dark">{COPY.countriesError}</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="dest-country"
                className="mb-0.5 block text-[11px] font-medium text-content-soft"
              >
                {COPY.countryLabel}
              </label>
              <select
                id="dest-country"
                value={countryId}
                onChange={(e) => {
                  setCountryId(e.target.value);
                  // เปลี่ยนประเทศแล้วเมืองเดิมใช้ไม่ได้อีก — ล้างทันที ไม่ปล่อยให้ค้างแล้วกด + ได้เมืองผิดประเทศ
                  setCityId("");
                }}
                disabled={disabled || atMax || countries.status === "loading"}
                className={controlClass}
              >
                <option value="">{COPY.countryPlaceholder}</option>
                {countries.status === "ready" &&
                  countries.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_th}
                    </option>
                  ))}
              </select>
            </div>

            <div className="min-w-0 flex-1">
              <label
                htmlFor="dest-city"
                className="mb-0.5 block text-[11px] font-medium text-content-soft"
              >
                {COPY.cityLabel}
              </label>
              <select
                id="dest-city"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                disabled={disabled || atMax || !countryId || cityState.status !== "ready"}
                className={controlClass}
              >
                <option value="">
                  {!countryId
                    ? COPY.cityNeedsCountry
                    : cityState.status === "loading"
                      ? COPY.cityLoading
                      : COPY.cityPlaceholder}
                </option>
                {cityItems.map((c) => (
                  <option key={c.id} value={c.id} disabled={selectedIds.has(c.id)}>
                    {c.name_th}
                    {selectedIds.has(c.id) ? ` (${COPY.alreadyAdded})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={addSelected}
              disabled={!canAdd}
              className="shrink-0 rounded-lg bg-maple px-3 py-2 text-sm font-semibold text-white hover:bg-maple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {COPY.add}
            </button>
          </div>

          <p className="mt-1 text-[11px] text-content-soft">
            {atMax
              ? COPY.atMax
              : cityState.status === "error"
                ? COPY.citiesError
                : countryId && cityState.status === "ready" && cityItems.length === 0
                  ? COPY.noCities
                  : cityItems.length === CITY_LIMIT
                    ? COPY.maybeTruncated
                    : COPY.hint}
          </p>
        </>
      )}
    </div>
  );
}
