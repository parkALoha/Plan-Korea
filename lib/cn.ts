/**
 * ต่อคลาสแบบมีเงื่อนไข — ตัวเดียวที่ทั้งเว็บใช้ (เฟส A1 · 4 ก.ย. 2026)
 *
 * ก่อนหน้านี้ไม่มีตัวช่วยแบบนี้เลย (`grep "cn(|clsx|tailwind-merge|cva"` = 0) ทุกที่จึงต่อ
 * คลาสด้วย template literal + ternary ดิบๆ ซึ่งอ่านยากและกินช่องว่างเกินเวลาเงื่อนไขเป็นเท็จ
 *
 * 🔴 **ตัวนี้ไม่ใช่ `tailwind-merge` และจงใจไม่เป็น** — มันต่อคลาสให้ ไม่ได้ *ตัดคลาสที่ชนกัน* ทิ้ง
 *   `cn("px-3", "px-4")` ได้ `"px-3 px-4"` แล้วผลลัพธ์ขึ้นกับลำดับใน *สตริงเชท* ไม่ใช่ลำดับในสตริงนี้
 *   ⇒ **`className` ที่ส่งเข้า primitive ใช้ *เพิ่ม* ได้ ใช้ *ทับ* ไม่ได้**
 *      ✅ เพิ่มเรื่องตำแหน่ง/ขนาดในเลย์เอาต์: `flex-1` `w-full` `mt-2` `shrink-0` `sm:hidden`
 *      ❌ ทับคุณสมบัติของ primitive เอง: padding · สี · รัศมี · ขนาดตัวอักษร
 *         → ถ้าต้องเปลี่ยนพวกนี้ ให้เพิ่ม *prop* ให้ primitive แทน (variant / size / tone)
 *   เหตุผลที่ไม่ใส่ `tailwind-merge`: โปรเจกต์นี้มี dependency 8 ตัวโดยตั้งใจ และ call site
 *   ของ primitive ทุกจุดอยู่ในมือคนคนเดียว (โซน P2) — วินัยพอ ไม่ต้องซื้อประกัน
 *   ⚠️ ถ้าวันหนึ่งกฎข้างบนถูกละเมิดจนกัดจริง ให้เพิ่ม `tailwind-merge` แล้ว **ลบคอมเมนต์ย่อหน้านี้ทิ้ง**
 *   ไม่ใช่ปล่อยไว้ให้คนอ่านเชื่อว่ายังจริงอยู่
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  let out = "";
  for (const v of values) {
    if (!v) continue;
    out = out ? `${out} ${v}` : v;
  }
  return out;
}
