"use client";

import { useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import type { CatalogCity } from "@/hooks/useTripCatalogCities";
import { E5_COPY } from "@/lib/i18n";

/**
 * ตัวเลือกเมืองของ *วันหนึ่ง* บนหัวการ์ดวัน — `B6` เฟส 3
 *
 * ## ทำไมถึงมี
 * ตอนสร้างทริปบนแพลตฟอร์ม **ทุกวันเริ่มต้นด้วย "ยังไม่ระบุเมือง"** เพราะผู้ใช้สั่งเองเมื่อ 28 ส.ค. 2026:
 * *"ไม่ต้องเดาเลย ให้ว่างไว้แล้วผมเลือกเอง"* — หลังเห็นว่าสูตรเฉลี่ยทุกแบบยัดเมืองลงวันบินผิด
 * (ทริปจริงของเขามีวันบินเต็ม ๆ 2 วัน) · ตัวนี้คือทางที่เขาใช้เลือก
 *
 * ## 🔴 ค่าที่ส่งคือ `cityId` ไม่ใช่ชื่อเมือง
 * ชื่อเมืองซ้ำกันได้ในคลังหลายประเทศ · `PATCH …/days` รับ `cityId` (uuid) และตรวจกับคลังก่อนเขียน
 *
 * ## 🔴 ล้มแล้วต้องเห็น ไม่ใช่กลับไปเงียบ ๆ
 * `onChange` โยน `Error` เมื่อ API ไม่ ok → แสดงข้อความไว้ใต้ตัวเลือก **และคงค่าเดิมไว้บนจอ**
 * · เคยพลาดตระกูลนี้มาแล้ว: ถ้าจับ error แล้วเงียบ ผู้ใช้จะเห็นค่าที่ตัวเองเลือกค้างอยู่ แล้วเชื่อว่าบันทึกแล้ว
 *   ทั้งที่ฐานไม่ขยับ — **และไม่มีอะไรบอกจนกว่าเขาจะรีเฟรช**
 */
const CLEAR_VALUE = "__unset__";

export function DayCityPicker({
  dayId,
  dateLabel,
  currentCityId,
  currentCityTh,
  icon,
  options,
  onChange,
}: {
  dayId: string;
  /** ใช้ประกอบป้ายให้เครื่องอ่านหน้าจอ — "เมืองของวัน 3 ส.ค." ไม่ใช่ "เมือง" ลอย ๆ ทั้ง 31 อัน */
  dateLabel: string;
  currentCityId: string | null;
  currentCityTh: string;
  icon: string;
  options: CatalogCity[];
  onChange: (cityId: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: string) {
    const cityId = value === CLEAR_VALUE ? null : value;
    if (cityId === currentCityId) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(cityId);
    } catch (e) {
      setError(e instanceof Error ? e.message : E5_COPY.dayCityPicker.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  // ทริปแพลตฟอร์มที่ยังไม่ได้ตั้งจุดหมาย — บอกว่าต้องไปตั้งก่อน ไม่ใช่โชว์รายการว่างเปล่า
  if (options.length === 0) {
    return (
      <div className="text-lg font-bold">
        {icon} {currentCityTh}
        <span className="ml-2 align-middle text-xs font-normal opacity-80">
          {E5_COPY.dayCityPicker.noDestinations}
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* ไอคอนอยู่นอกตัวกด ไม่ใช่ในป้ายตัวเลือก — ป้ายในรายการต้องเป็นชื่อเมืองล้วน ๆ ให้ค้นด้วยตาได้
          และเครื่องอ่านหน้าจอไม่ต้องอ่านอิโมจิซ้ำ 31 รอบ */}
      <div className="flex min-w-0 items-center gap-1.5 text-lg font-bold">
        <span aria-hidden>{icon}</span>
        <Dropdown
          id={`day-city-${dayId}`}
          ariaLabel={`${E5_COPY.dayCityPicker.ariaLabel} ${dateLabel}`}
          variant="inline"
          value={currentCityId ?? CLEAR_VALUE}
          onChange={choose}
          disabled={saving}
          placeholder={E5_COPY.dayCityPicker.placeholder}
          options={[
            { value: CLEAR_VALUE, label: E5_COPY.dayCityPicker.unset },
            ...options.map((c) => ({ value: c.id, label: c.nameTh })),
          ]}
        />
      </div>
      {error && (
        // `role="alert"` เพื่อให้เครื่องอ่านหน้าจอพูดทันทีที่บันทึกล้ม — ไม่ต้องรอผู้ใช้ไปโฟกัสเจอเอง
        <p role="alert" className="mt-1 text-xs font-normal text-cream/90">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
