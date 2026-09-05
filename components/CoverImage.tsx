"use client";

import { useState } from "react";

/**
 * **รูปปกใบกลางของทั้งเว็บ** — ไล่ชั้น `ภาพเมือง → ภาพประเทศ → พื้นไล่สี` · 5 ก.ย. 2026
 *
 * ## 🔴 ทำไมถึงมี — **ตรรกะเดียวกันถูกเขียนซ้ำ 4 ที่ และสามในสี่ที่ชี้ไปที่คลังเก่า** (P1 วัด)
 * ```
 * HomeScreen `TripCoverImage`        /covers/city-<slug>.svg      ← การ์ดทริปในหน้าแรก
 * TripDestinationPicker              /covers/city-<slug>.svg
 * DestinationExplorer `CountryThumb`  ภาพจริง → svg → ไล่สี        ← แก้ไปแล้ว
 * CityPickerScreen `CityThumb`        ภาพจริง → svg → ไล่สี        ← แก้ไปแล้ว
 * ```
 * `public/covers/` มี **10 ไฟล์** · `public/catalog/` มี **175 ไฟล์**
 * ⇒ **เมือง 74 จาก 78 ตกไปพื้นไล่สีทุกใบ ทั้งที่ภาพมีอยู่บนดิสก์**
 * 🎯 ***และมันอ่านเหมือน "รูปพัง" ไม่ใช่ "ยังไม่มีรูป"*** — สองอย่างนี้ผู้ใช้แยกไม่ออก แต่เราต้องแยก
 *
 * ## 🔴 ไม่มีชั้น `/covers/*.svg` อีกแล้ว — **ตั้งใจ ไม่ใช่ลืม**
 * ภาพจริงในคลังครอบเมืองและประเทศเดียวกันกับที่ SVG เคยครอบ **และเป็นภาพถ่ายจริงซึ่งดีกว่าทุกใบ**
 * ⇒ ชั้น SVG กลายเป็นชั้นที่ *ไม่มีวันถูกเรียก* ยกเว้นตอนภาพจริงหาย — ซึ่งตอนนั้น **พื้นไล่สีก็ตอบเท่ากัน**
 * · ⚠️ `CityPickerScreen` ยังมีชั้น svg อยู่ (ไฟล์ P5) — **ไม่ใช่ความไม่สอดคล้องที่ต้องรีบแก้** แต่ถ้าเขาถอด ก็ตรงกันพอดี
 *
 * ## 📌 กติกาชื่อไฟล์ที่ทำให้ไม่ต้องมีตารางแปลง
 * `<countryId>/<slug>.jpg` สำหรับเมือง · `<countryId>/<countryId>.jpg` สำหรับประเทศ
 * 🎯 ***แก้ที่กติกาการตั้งชื่อ ถูกกว่าแก้ที่ตัวแปลชื่อ — ตัวแปลต้องมีคนซิงก์ กติกาไม่ต้อง***
 */
export function CoverImage({
  countryId,
  slug,
  sizes,
  className = "aspect-video w-full object-cover",
  gradientClassName = "aspect-video w-full bg-gradient-to-br from-pine to-maple",
  emoji,
}: {
  countryId: string | null | undefined;
  /** ชื่อไฟล์เมืองในคลัง — ไม่มีก็ข้ามไปชั้นประเทศเลย */
  slug?: string | null;
  /**
   * 🔴 **ต้องวัดจากกริดของหน้าที่ใช้ ห้ามลอกข้ามหน้า** — กริดแต่ละหน้ามีจุดพลิกคนละที่
   * (วัดมาแล้วสองหน้า: การ์ด *ใหญ่ที่สุด* ตอนจอ 768 ไม่ใช่ตอนจอ 1440 เพราะจำนวนคอลัมน์
   *  เปลี่ยนก่อนความกว้างสูงสุดจะตัน)
   * · ✅ **เลือกไม่ลงให้ *ขอเกิน*** — ขอเกิน = เปลืองไบต์ · ขอขาด = ภาพนุ่ม
   *   🎯 *พลาดไปทางที่แก้ได้ด้วยเงิน ไม่ใช่ทางที่ผู้ใช้เห็น* (ถ้อยคำ P5)
   */
  sizes: string;
  className?: string;
  gradientClassName?: string;
  /** อีโมจิกลางพื้นไล่สี — ใส่เฉพาะที่ที่การ์ดใหญ่พอจะไม่ดูรก */
  emoji?: string;
}) {
  /** 🔴 `stage` ไม่ใช่บูลีน — ต้องรู้ว่าตกมาถึงชั้นไหนแล้ว ไม่ใช่แค่ "พังหรือยัง" */
  const [stage, setStage] = useState<"city" | "country" | "gradient">(
    slug ? "city" : countryId ? "country" : "gradient",
  );

  if (stage === "gradient" || !countryId) {
    return (
      <div className={`${gradientClassName} ${emoji ? "flex items-center justify-center text-4xl text-cream" : ""}`}>
        {emoji}
      </div>
    );
  }

  const name = stage === "city" && slug ? slug : countryId;
  const base = `/catalog/${countryId}/${name}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/catalog/ ที่ทีมวางเอง
    <img
      key={`${stage}-${base}`}
      src={`${base}.jpg`}
      srcSet={`${base}-sm.jpg 400w, ${base}.jpg 800w`}
      sizes={sizes}
      alt=""
      className={className}
      onError={() => setStage((s) => (s === "city" ? "country" : "gradient"))}
    />
  );
}
