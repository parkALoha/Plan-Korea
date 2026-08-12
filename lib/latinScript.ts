/**
 * ข้อความนี้เขียนด้วยอักษรละตินล้วนไหม (เฟส 22)
 *
 * ใช้ที่หน้า ตม./K-ETA ซึ่งต้องเป็นอังกฤษล้วน — ชื่อสถานที่ที่ผู้ใช้เพิ่มเองระหว่างทางถูกเก็บเป็นชื่อ
 * ที่ Google คืนมาตอนขอด้วย `languageCode: "th"` จึงมีทั้งไทย ("ตลาดปลาจากัลชิ") เกาหลี ("머거방")
 * และเวียดนามปนกัน · ตัวที่ไม่ใช่ละตินต้องไปขอชื่ออังกฤษจาก Google มาแทน (ดู /api/place-name)
 *
 * เช็คเป็นราย "ตัวอักษร" ด้วย Unicode property escape ไม่ใช่ช่วงโค้ดพอยต์ที่ไล่เขียนเอง —
 * เวียดนามมีทั้ง Latin Extended Additional และวรรณยุกต์แบบ combining ("Phở Gia Truyền Bát Đàn")
 * ซึ่งไล่ช่วงเองแล้วพลาดง่าย · ตัวเลข/ช่องว่าง/เครื่องหมายวรรคตอนไม่นับเป็นตัวอักษร จึงผ่านเสมอ
 */
const IS_LETTER = /\p{L}/u;
const IS_LATIN_LETTER = /\p{Script=Latin}/u;

export function looksLatin(text: string): boolean {
  for (const char of text) {
    if (IS_LETTER.test(char) && !IS_LATIN_LETTER.test(char)) return false;
  }
  return true;
}
