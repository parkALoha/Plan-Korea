/**
 * ตรวจชนิดฟิลด์ใน body ก่อนส่งลงฐาน — `E5` · เจ้าของ: P1-Lead · 28 ส.ค. 2026
 *
 * ## 🔴 ปัญหาที่มีไว้แก้
 * route อ่าน body เป็น `(await req.json()) as Record<string, unknown>` แล้วส่งต่อให้ชั้น DAL
 * ซึ่งเคยรับ `Record<string, unknown>` เหมือนกัน → **พิมพ์ชื่อคอลัมน์ผิดกี่ตัวก็ผ่านคอมไพล์**
 * แล้วไปตายที่ฐานเป็น `400`/`PGRST204` · **ตระกูลเดียวกับที่ทำเว็บ 502 เมื่อ 27 ส.ค.**
 *
 * ## 🎯 และการตรวจเดิม *ครึ่ง ๆ* ซึ่งแย่กว่าไม่ตรวจเลยตรงที่มันดูเหมือนตรวจแล้ว
 * ```
 * if (!b.city || !b.hotelName || typeof b.lat !== "number" || typeof b.lng !== "number")
 *        ↑ แค่ไม่ว่าง   ↑ แค่ไม่ว่าง        ↑ ตรวจชนิดจริง      ↑ ตรวจชนิดจริง
 * ```
 * `hotelName: { a: 1 }` **ผ่านด่านนั้นไปลงฐานได้** ส่วน `lat: "abc"` ถูกปฏิเสธ — **ไม่มีเหตุผลรองรับ**
 *
 * ## ทำไมคืน "รายชื่อฟิลด์ที่ผิด" ไม่ใช่ `boolean`
 * 🔴 **`400` ที่ไม่บอกว่าฟิลด์ไหนผิด บังคับให้คนเดา** — และเดาผิดจะไปแก้ฟิลด์ที่ไม่ได้ผิด
 * · รูปเดียวกับข้อที่ทีมเจอวันนี้: *ข้อความที่ชี้ผิดที่ แพงกว่าความเงียบ*
 */

/** ผลของการตรวจ — `ok: false` มาพร้อม **ชื่อฟิลด์ที่ผิด** เสมอ ไม่ใช่แค่ "ไม่ผ่าน" */
export type FieldCheck<K extends string> =
  | { ok: true; values: Record<K, string | null> }
  | { ok: false; bad: K[] };

/**
 * ตรวจว่าฟิลด์ที่ควรเป็น **สตริง (หรือไม่ส่งมา)** เป็นสตริงจริง
 *
 * · ไม่ส่งมา / `null` → `null` (ฐานรับได้ ถ้าคอลัมน์ nullable — ปล่อยให้ชนิดจากสคีมาเป็นคนตัดสิน)
 * · สตริง → ค่านั้น **หลัง `trim()`** · สตริงว่างหลัง trim → `null` (ไม่ใช่ `""` ลงฐาน)
 * · ชนิดอื่นทั้งหมด (`number` `boolean` `object` `array`) → **ผิด**
 *
 * ⚠️ **ไม่ทำ coercion โดยตั้งใจ** — `String(123)` จะได้ `"123"` ลงฐานเงียบ ๆ
 *    **การแปลงชนิดให้อัตโนมัติคือการกลืนความผิดพลาดของไคลเอนต์** ซึ่งเป็นสิ่งที่ข้อนี้มีไว้แก้
 */
export function stringFields<K extends string>(
  src: Record<string, unknown>,
  keys: readonly K[]
): FieldCheck<K> {
  const values = {} as Record<K, string | null>;
  const bad: K[] = [];
  for (const k of keys) {
    const v = src[k];
    if (v === undefined || v === null) {
      values[k] = null;
      continue;
    }
    if (typeof v !== "string") {
      bad.push(k);
      continue;
    }
    const t = v.trim();
    values[k] = t === "" ? null : t;
  }
  return bad.length > 0 ? { ok: false, bad } : { ok: true, values };
}

/** ข้อความ `400` ที่บอกชื่อฟิลด์ — ใช้คู่กับ `stringFields` เพื่อไม่ให้แต่ละ route เขียนเอง */
export function badFieldsMessage(bad: readonly string[]): string {
  return `ฟิลด์เหล่านี้ต้องเป็นข้อความ: ${bad.join(", ")}`;
}
