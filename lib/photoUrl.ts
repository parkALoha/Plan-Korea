/**
 * ขอรูปเดิมในขนาดที่เล็กลง (เฟส 19)
 *
 * `usePlacePhotos` คืน URL รูปแบบ `/api/place-photo?name=...` ซึ่งเดิมคืนรูปกว้าง 800px เสมอ
 * — รูปย่อในแถวจุดแวะกว้างจริงแค่ 40px แต่โหลดไฟล์ 800px มาเต็มๆ ทุกใบ (วัดได้ 12.4 MB ต่อการเปิดหน้า)
 *
 * ขนาดต้องตรงกับ allowlist ฝั่ง route ไม่งั้นจะตกไปใช้ค่าเริ่มต้น 800 เงียบๆ
 */
export function photoUrlAtWidth(url: string, width: 160 | 400 | 800): string {
  return `${url}&w=${width}`;
}
