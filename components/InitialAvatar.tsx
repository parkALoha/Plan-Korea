/** ตัวย่อชื่อในวงกลม — ไม่มีคอลัมน์รูปให้ avatar จริง (`profiles` มีแค่ `display_name`)
 *  ใช้ร่วมกันระหว่าง `HomeScreen`/`TripHeader` (แยกออกมาจาก `HomeScreen.tsx` เดิม 27 ส.ค. 2026
 *  ตอนที่ `TripHeader` ต้องใช้ตัวเดียวกันสำหรับแถวสมาชิก — เนื้อโค้ดเหมือนเดิมทุกบรรทัด)
 *
 * `label` ไม่ใส่ = ตกแต่งล้วน (`aria-hidden`, ใช้ตอนข้อความข้างๆ บอกชื่อซ้ำอยู่แล้วอย่างที่ Home ทำ)
 * ใส่ = มีความหมายเอง (`aria-label`, ใช้ตอนเป็นตัวแทนคนคนหนึ่งในแถวสมาชิกที่ไม่มีข้อความอื่นบอกชื่อ) */
export function InitialAvatar({
  name,
  label,
  className = "",
}: {
  name: string;
  label?: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      {...(label ? { "aria-label": label } : { "aria-hidden": true })}
      title={label}
      /* 🔴 คู่ `panel-maple` (พื้น+ตัวอักษร) ไม่ใช่ `maple-soft` + `maple-dark` — วัดในหน้าจริง 5 ก.ย. 2026
         คู่เดิมได้ **4.01 ตก WCAG AA** (วงกลมนี้ 12px ตัวหนา = ข้อความปกติ ต้อง 4.5)
         🎯 ***คู่ `panel-*` ถูกนิยามให้ใช้ *ด้วยกัน* จึงมีที่เดียวที่ต้องแก้เมื่อคอนทราสต์ตก —
            ส่วน `maple-soft`/`maple-dark` เป็นสีแบรนด์คนละตัว ที่บังเอิญมาอยู่คู่กัน*** */
      className={`flex shrink-0 items-center justify-center rounded-full bg-panel-maple font-bold text-panel-maple-ink ${className}`}
    >
      {initial}
    </span>
  );
}
