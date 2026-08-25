"use client";

import { useEffect, useState } from "react";
import { signStoredFiles } from "@/lib/engine/files";

/**
 * ต่ออายุก่อนหมดเงียบๆ (ux-flows.md §12.2 / `P-65`) — `DEFAULT_TTL_SECONDS` ของ `signStoredFiles`
 * คือ 90 วินาที (สั้นโดยตั้งใจ เพราะ signed URL เป็น bearer credential) ถ้าไม่ต่ออายุ รูปที่ค้างอยู่บน
 * จอนานกว่านั้น (list เปิดค้างไว้/โมดัลเปิดนาน) จะกลายเป็นรูปแตก · เรียก sign ซ้ำเป็นระยะถูกและปลอดภัย
 * เพราะ `signStoredFiles` มีแคชในตัวอยู่แล้ว — ของที่ยังไม่ใกล้หมดอายุจะได้ค่าเดิมจากแคชทันที ไม่ยิงซ้ำจริง
 */
const RENEW_POLL_MS = 30_000;

/**
 * เซ็น signed URL ให้ไฟล์หลายรายการพร้อมกัน ครั้งเดียวต่อชุดค่า — ตามที่ P1 แนะนำใน `E2-AC13` ②
 * (เซ็นทีละใบตอน render = N request ต่อหน้า และหน้าที่มีลิสต์ยาวๆ เจอปัญหานี้ตรงๆ)
 *
 * คืน map ที่บอกสถานะได้ 3 แบบต่อค่า — เจตนาให้ตรงกับ `usePlacePhotos`/`PlaceThumb.tsx` ที่ใช้
 * `null` = loading อยู่แล้วในเว็บนี้ ไม่ใช้ string enum ใหม่:
 * - ไม่มีคีย์นั้นในผลลัพธ์ (`get` คืน `undefined`) = ยังเซ็นไม่เสร็จ
 * - `null` = เซ็นไม่สำเร็จ (ไฟล์หาย/ไม่มีสิทธิ์) — 🔴 ต้องแสดงว่า "เปิดไม่ได้" ไม่ใช่กลืนเงียบๆ
 *   (ของเดิมกลืน error แล้วโชว์รูปแตก อ่านไม่ออกว่าไฟล์หายหรือแค่ยังไม่ได้ล็อกอิน)
 * - string = signed URL ใช้แสดงผลได้
 */
export function useSignedFiles(
  storedValues: (string | null | undefined)[]
): Map<string, string | null> {
  const [resolved, setResolved] = useState<Map<string, string | null>>(new Map());
  const wanted = storedValues.filter((v): v is string => !!v);
  const depKey = wanted.join("|");

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;

    async function run() {
      const signed = await signStoredFiles(wanted);
      if (cancelled) return;
      setResolved((prev) => {
        const next = new Map(prev);
        for (const stored of wanted) next.set(stored, signed.get(stored) ?? null);
        return next;
      });
    }

    run();
    // ต่ออายุเป็นระยะขณะยังแสดงอยู่ — เคลียร์ทั้งตอน unmount และตอนชุดค่าที่ขอเปลี่ยน (คนละจังหวะกัน
    // เสมอ เช่นปิดโมดัลด้วย Esc vs สลับไปดูรายการอื่น) ผ่าน cleanup function เดียวกันของเอฟเฟกต์นี้
    const timer = setInterval(run, RENEW_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return resolved;
}
