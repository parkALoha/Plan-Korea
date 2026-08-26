/**
 * คีย์ลำดับที่แทรกระหว่างกันได้ — `D6` · `E2-AC8`
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · **ไม่ import อะไรเลย**
 *
 * ## 🔴 ทำไมไม่ใช้ `order_index` เป็น int อีกต่อไป
 * `D6`: เว็บนี้ให้ 2 คนแก้พร้อมกันผ่าน Realtime อยู่แล้ว
 * · int ทำให้การลากจุดแวะ 1 จุด **ต้องเขียนใหม่ทั้งวัน** เพื่อเลื่อนเลขให้ว่าง
 * · สองคนลากพร้อมกัน = เขียนทับกันทั้งชุด **แล้วลำดับที่ได้ไม่ใช่ของใครเลย**
 * 🎯 **คีย์เรียงได้: แทรกระหว่างสองตัว = เขียน *แถวเดียว*** — ชนกันได้เฉพาะตอนแทรกที่เดียวกันเป๊ะ
 *
 * ## 🔴 ตัวอักษรต้องเรียงตรงกับ `COLLATE "C"` ของฐาน
 * คอลัมน์ประกาศเป็น `rank text collate "C"` เพื่อให้ **PG เรียงตรงกับ JS**
 * ตัวอักษรที่ใช้จึงเรียงตาม ASCII: `0-9` < `A-Z` < `a-z`
 * ⚠️ **เพิ่มตัวอักษรนอกชุดนี้เมื่อไหร่ ลำดับสองฝั่งจะต่างกันเงียบ ๆ**
 */

const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MIN = 0;
const MAX = ALPHA.length - 1;

const idx = (c: string) => ALPHA.indexOf(c);

/**
 * คีย์ที่อยู่ระหว่าง `a` กับ `b` — `null` = ไม่มีขอบด้านนั้น
 *
 * 🔴 **ห้ามคืนคีย์ที่ลงท้ายด้วยตัวอักษรต่ำสุด (`"0"`)**
 * ถ้าคืน `"…0"` แล้ววันหนึ่งมีคนแทรก *ก่อน* มัน จะไม่มีสตริงไหนน้อยกว่าได้เลย
 * (ทุกสตริงที่ขึ้นต้นด้วย `"…0"` ยาวกว่า = มากกว่า) → **แทรกหัวไม่ได้ตลอดกาล**
 * · เจอตอนไล่เคสด้วยมือก่อนเขียนโค้ด ไม่ใช่ตอนรัน
 */
export function rankBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`rankBetween: a ต้องน้อยกว่า b (ได้ a=${a} b=${b})`);
  }

  let out = "";
  let i = 0;
  for (;;) {
    const ca = a !== null && i < a.length ? idx(a[i]) : MIN - 1;
    const cb = b !== null && i < b.length ? idx(b[i]) : MAX + 1;

    if (cb - ca > 1) {
      const mid = Math.floor((ca + cb) / 2);
      // 🔴 ตัวท้ายห้ามเป็นตัวต่ำสุด — ดูเหตุผลข้างบน · ลงลึกอีกชั้นแทน
      if (mid === MIN) {
        out += ALPHA[MIN];
        i++;
        continue;
      }
      return out + ALPHA[mid];
    }

    // ตัวอักษรตำแหน่งนี้เท่ากันหรือชิดกัน — ยกของ `a` มาแล้วลงลึกอีกชั้น
    out += a !== null && i < a.length ? a[i] : ALPHA[MIN];
    i++;
  }
}

/** คีย์แรกของลิสต์ว่าง — อยู่กลางช่วงเพื่อให้แทรกได้ทั้งสองด้าน */
export function firstRank(): string {
  return ALPHA[Math.floor(MAX / 2)];
}

/**
 * คีย์สำหรับแทรกที่ตำแหน่ง `at` ของลิสต์ที่เรียงแล้ว
 *
 * ⚠️ **ต้องส่งลิสต์ที่เรียงด้วย `(rank, id)` มาแล้ว** — ฟังก์ชันนี้ไม่เรียงซ้ำ
 * เพราะการเรียงเป็นหน้าที่ของฐาน (มี index) และ **เรียงสองที่คือโอกาสให้มันต่างกัน**
 */
export function rankForInsert(sortedRanks: readonly string[], at: number): string {
  if (sortedRanks.length === 0) return firstRank();
  const i = Math.max(0, Math.min(at, sortedRanks.length));
  return rankBetween(i > 0 ? sortedRanks[i - 1] : null, i < sortedRanks.length ? sortedRanks[i] : null);
}
