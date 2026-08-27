"use client";

import { useEffect, useState } from "react";

export type CityOption = {
  id: string;
  country_id: string;
  name_th: string;
  name_en: string;
  name_local: string | null;
};

/**
 * เลือกเมืองปลายทาง (หลายเมือง เรียงตามลำดับที่เลือก) — `E5` ข้อ 3, `POST /api/engine/trips`
 * รับ `cityIds` แล้ว (P1 27 ส.ค. 2026, `7230241`) ตัวนี้เป็นแค่ตัวป้อน `cityIds` ให้ `CreateTripForm`
 *
 * แยกออกมาเป็นไฟล์ของตัวเอง (ไม่ใช่ inline ใน `CreateTripForm`) เพื่อให้ปรับ/แทนที่ทีหลังได้โดยไม่ต้อง
 * แก้ตัวฟอร์มหลัก — เดียวกับเหตุผลที่แผนขอให้แยก `TripBasicsStep` ไว้เผื่อ `TripInviteStep` ในอนาคต
 *
 * 🔴 **ลำดับที่ผู้ใช้เลือกคือลำดับที่ส่ง** — ห้ามเรียงตามตัวอักษรหรือจัดเรียงใหม่ก่อนส่ง `cityIds`
 * (`POST` เก็บลำดับแรกที่พบของแต่ละ id ไว้ตามที่ส่งมา ไม่เรียงใหม่ให้)
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityOption[]>([]);
  const [open, setOpen] = useState(false);

  // ค้นแบบ debounce เหมือนช่องค้นสถานที่อื่นในเว็บนี้ (เช่น NearbyPlacesModal) — q ว่างได้ (คืนรายการตั้งต้น)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/engine/cities?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as CityOption[] | { error: string };
        if (Array.isArray(data)) setResults(data);
      } catch {
        // ยกเลิกจากการพิมพ์ต่อ (AbortError) ไม่ต้องทำอะไร
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectedIds = new Set(selected.map((c) => c.id));
  const MAX_CITIES = 20;

  function addCity(city: CityOption) {
    if (selectedIds.has(city.id) || selected.length >= MAX_CITIES) return;
    onChange([...selected, city]);
    setOpen(false);
  }

  function removeCity(id: string) {
    onChange(selected.filter((c) => c.id !== id));
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-content-soft">
        เมืองปลายทาง (ไม่บังคับ)
      </label>

      {selected.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((city) => (
            <span
              key={city.id}
              className="flex items-center gap-1 rounded-full bg-maple-soft py-1 pl-2.5 pr-1.5 text-xs font-medium text-maple-dark"
            >
              {city.name_th}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeCity(city.id)}
                  aria-label={`เอา ${city.name_th} ออก`}
                  className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-maple/30"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // เลือกเมืองแล้ว open ถูกปิดไว้ (addCity) — ถ้าพิมพ์ต่อโดยไม่เผลอ blur ก่อน onFocus จะไม่ยิงซ้ำ
            // (input โฟกัสค้างอยู่แล้ว) ต้องเปิดเองตรงนี้ด้วย ไม่งั้นผลค้นเมืองที่สองจะมาถึงแต่ไม่โชว์เลย
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="ค้นชื่อเมือง เช่น ปูซาน, Hanoi..."
          disabled={disabled || selected.length >= MAX_CITIES}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-surface-raised shadow-lg shadow-ink/10">
            {results
              .filter((c) => !selectedIds.has(c.id))
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // onMouseDown ไม่ใช่ onClick — ยิงก่อน onBlur ของ input จะได้เลือกได้ก่อนกล่องปิด
                      e.preventDefault();
                      addCity(c);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-soft"
                  >
                    <span className="text-content">{c.name_th}</span>
                    <span className="ml-1.5 text-xs text-content-soft">{c.name_en}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
