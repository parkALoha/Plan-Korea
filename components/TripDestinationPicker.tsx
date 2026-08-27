"use client";

import { useEffect, useState } from "react";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.destinationPicker;

export type CountryOption = { id: string; name_th: string; name_en: string };

export type CityOption = {
  id: string;
  country_id: string;
  name_th: string;
  name_en: string;
  name_local: string | null;
  /** ฝังมากับ `GET /api/engine/cities` แล้ว (P1 28 ส.ค. 2026, `593c36d`) */
  catalog_countries?: CountryOption | null;
};

const MAX_CITIES = 20;
/** เพดานของ route เอง (`MAX_LIMIT`) — ขอเกินนี้ไม่ได้ ถ้าได้ครบ 50 พอดีแปลว่าอาจถูกตัด (ดู `maybeTruncated`) */
const CITY_LIMIT = 50;

type ListState<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

/**
 * ภาพประจำจุดหมาย — ใช้ cascade เดียวกับรูปปกการ์ดบนหน้า Home เพื่อไม่ให้มีระบบรูปสองระบบในเว็บเดียว
 *
 * 🔴 **วันนี้ทำได้แค่ระดับประเทศ** เพราะ `GET /api/engine/cities` ยังไม่คืน `legacy_slug` มาด้วย
 * (`tripsForUser()` คืน แต่เส้นนี้ไม่คืน) — ขอ P1 ไว้แล้ว · และวันนี้ยังไม่มีไฟล์ `city-*.svg` สักใบอยู่ดี
 * มีแต่ `country-{kr,vn,th}.svg` → **ต่อให้ต่อ slug วันนี้ก็จะตกมาที่รูปประเทศเหมือนกันทุกใบ**
 * พอ slug มา เติมชั้น `city-` ข้างหน้าได้เลยโดยไม่ต้องรื้ออย่างอื่น
 */
function DestinationThumb({ countryId }: { countryId: string }) {
  const [failed, setFailed] = useState(false);
  const base = "h-10 w-10 shrink-0 overflow-hidden rounded-lg";

  if (failed) {
    return (
      <div
        aria-hidden
        className={`${base} flex items-center justify-center bg-gradient-to-br from-pine to-maple text-sm text-cream`}
      >
        🗺️
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง
    <img
      src={`/covers/country-${countryId}.svg`}
      alt=""
      className={`${base} object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * เลือกจุดหมาย **ประเทศ → เมือง → กด +** (หลายคู่ เรียงตามลำดับที่เพิ่ม) — `E5` ข้อ 3
 *
 * ผู้ใช้สั่งรูปนี้เอง 28 ส.ค. 2026: *"ควรให้เลือกประเทศ และ เลือกเมือง และกด + เมือง/ประเทศได้ แต่ต้องอยู่ใน
 * ลิสของเรา — **เผื่อ ต่อเครื่อง หรือบินต่อ**"* · เหตุผลท้ายประโยคสำคัญกว่ารูปแบบ: ทริปจริงของเขาคือ
 * กรุงเทพฯ → ฮานอย (พักเครื่อง 11 ชม.) → ปูซาน — **จุดหมายหลายเมืองข้ามประเทศคือเคสปกติ ไม่ใช่ edge case**
 *
 * 🔴 **ลำดับที่ผู้ใช้เพิ่มคือลำดับที่ส่ง** — ห้ามเรียงตามตัวอักษรหรือจัดใหม่ก่อนส่ง `cityIds`
 * (`POST /api/engine/trips` เก็บลำดับที่ส่งมาตามนั้น ไม่เรียงใหม่ให้) · **และนั่นคือเหตุผลที่ต้องมีปุ่มสลับ
 * ลำดับ** — ผู้ใช้สั่งเพิ่ม 28 ส.ค.: *"บอกแค่ ชื่อเมือง และภาพพอ และสลับตำแหน่งได้"* · ลำดับ = ลำดับเดินทางจริง
 * (ต่อเครื่องฮานอยก่อนไปปูซาน ≠ ไปปูซานก่อนแล้วแวะฮานอย) เพิ่มผิดลำดับแล้วต้องลบทิ้งหมดเพื่อเรียงใหม่คือ UX ที่แย่
 *
 * 📌 **ทำไมเป็นปุ่ม ↑↓ ไม่ใช่ลากวาง:** ห้องนี้มี `@dnd-kit` อยู่แล้วก็จริง แต่ **ผมยืนยันผลการลากด้วย
 * เครื่องมือทดสอบไม่ได้** (`dnd-kit` อ่าน `movementX/Y` ที่เบราว์เซอร์ใส่ให้เฉพาะ event ที่เชื่อถือได้ —
 * เคย `E5-AC4` ต้องส่งให้คนลากมือถึงจะยืนยันได้) · **ปุ่มพิสูจน์ได้ว่าใช้งานได้จริงก่อนส่งมอบ** และบนมือถือ
 * การลากชิปเล็ก ๆ ก็ยากกว่ากดปุ่มอยู่แล้ว · ถ้าจะเพิ่มลากวางทีหลัง ให้เพิ่ม*ทับ*ปุ่ม ไม่ใช่แทนที่
 *
 * 🎯 **ทำไมกรองด้วย `?country=` แทนที่จะค้นรวมแล้วจัดกลุ่มฝั่ง UI:** **`limit` ตัด*หลัง*เรียง**
 * (P1 ชนมาเอง: `q="า" limit=12` → ญี่ปุ่น 12 เมืองรวด ประเทศอื่นหายหมด) → **ยิงแยกต่อประเทศ ไม่ใช่ยิงรวม
 * แล้วหั่น** ไม่งั้นประเทศที่เมืองเยอะกินโควตาประเทศอื่นจนหายไปเงียบ ๆ
 *
 * 📌 **ทำไมไม่มีช่อง "ค้นชื่อเมืองข้ามประเทศ" (ของเดิมมี — ตัดทิ้งตั้งใจ):**
 * ตอนตัดครั้งแรกมีเหตุผลสองข้อ · **ข้อหนึ่งหมดอายุไปแล้ว ข้อที่เหลือยังอยู่ — อย่าสับสนสองข้อนี้**
 * · ~~ข้อที่หมดอายุ:~~ ตอนนั้นการค้นข้ามประเทศมี fixture ปน 1,694/1,736 แถว · **P1 ปิดไปแล้ว
 *   (`968ced0`, `supported` กรองในฐาน) — วัดซ้ำเองแล้ว `q="เมือง"`/`q="ทดสอบ"` คืน 0 แถว** เหตุผลนี้ใช้ไม่ได้อีก
 * · **ข้อที่ยังอยู่:** ผู้ใช้สั่งรูป *ประเทศ → เมือง → กด +* มาตรง ๆ · วันนี้คลังมี **4 ประเทศ** ที่คนไทย
 *   รู้อยู่แล้วว่าเมืองไหนอยู่ประเทศไหน (ฮานอย→เวียดนาม · โตเกียว→ญี่ปุ่น) → ช่องค้นเพิ่มทางเข้าที่สอง
 *   สำหรับงานเดียวกัน แลกกับความสูงบนโมดัลที่มือถือ 375px แน่นอยู่แล้ว **ยังไม่คุ้ม**
 * 🔴 **เงื่อนไขที่ควรกลับมาคิดใหม่ (ไม่ใช่ "ห้ามทำตลอดกาล"):** คลังโตเกิน ~10 ประเทศ **หรือ** มีเมืองที่
 *   คนเดาประเทศไม่ออก — ตอนนั้นการบังคับให้รู้ประเทศก่อนจะกลายเป็นอุปสรรคจริง ไม่ใช่การลดทางเลือก
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
    setCityId("");
  }

  function removeCity(id: string) {
    onChange(selected.filter((c) => c.id !== id));
  }

  /** สลับกับเพื่อนบ้าน — ไม่ใช่ย้ายไปท้าย/หัว เพื่อให้กดหลายทีแล้วเดาผลได้ตรง ๆ */
  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  const countryOptions: DropdownOption[] =
    countries.status === "ready"
      ? countries.items.map((c) => ({ value: c.id, label: c.name_th }))
      : [];

  const cityOptions: DropdownOption[] = cityItems.map((c) => ({
    value: c.id,
    label: c.name_th,
    hint: selectedIds.has(c.id) ? `(${COPY.alreadyAdded})` : undefined,
    disabled: selectedIds.has(c.id),
  }));

  const cityPlaceholder = !countryId
    ? COPY.cityNeedsCountry
    : cityState.status === "loading"
      ? COPY.cityLoading
      : COPY.cityPlaceholder;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-content-soft">{COPY.label}</label>

      {selected.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {selected.map((city, i) => (
            <li
              key={city.id}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-soft/60 p-1.5"
            >
              <DestinationThumb countryId={city.country_id} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                {city.name_th}
              </span>
              {!disabled && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={COPY.moveEarlier(city.name_th)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-content-soft hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selected.length - 1}
                    aria-label={COPY.moveLater(city.name_th)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-content-soft hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCity(city.id)}
                    aria-label={COPY.remove(city.name_th)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-content-soft hover:bg-maple-soft hover:text-maple-dark"
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {countries.status === "error" ? (
        <p className="text-xs text-maple-dark">{COPY.countriesError}</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <span id="dest-country-label" className="mb-0.5 block text-[11px] font-medium text-content-soft">
                {COPY.countryLabel}
              </span>
              <Dropdown
                id="dest-country"
                ariaLabel={COPY.countryLabel}
                value={countryId}
                onChange={(v) => {
                  setCountryId(v);
                  // เปลี่ยนประเทศแล้วเมืองเดิมใช้ไม่ได้อีก — ล้างทันที ไม่ปล่อยให้ค้างแล้วกด + ได้เมืองผิดประเทศ
                  setCityId("");
                }}
                options={countryOptions}
                placeholder={COPY.countryPlaceholder}
                disabled={disabled || atMax || countries.status === "loading"}
              />
            </div>

            <div className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[11px] font-medium text-content-soft">{COPY.cityLabel}</span>
              <Dropdown
                id="dest-city"
                ariaLabel={COPY.cityLabel}
                value={cityId}
                onChange={setCityId}
                options={cityOptions}
                placeholder={cityPlaceholder}
                disabled={disabled || atMax || !countryId || cityState.status !== "ready"}
              />
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
