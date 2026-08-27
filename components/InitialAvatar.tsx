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
      className={`flex shrink-0 items-center justify-center rounded-full bg-maple-soft font-bold text-maple-dark ${className}`}
    >
      {initial}
    </span>
  );
}
