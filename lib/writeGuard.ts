"use client";

import { showToast } from "./toast";

/**
 * ห่อทุกการเขียนลง Supabase ให้ "พังแล้วมีเสียง" (เฟส 20.2)
 *
 * เดิมทุก hook เขียนเป็น `await supabase.from(...).insert(...)` แล้วทิ้ง `{ error }` ไปเฉยๆ
 * ผลคือเซฟไม่ติดแล้วเงียบสนิท — บางกรณีกดปุ่มแล้วไม่มีอะไรเกิดขึ้น บางกรณี (ที่อัปเดต state
 * แบบ optimistic ไว้ก่อน) หน้าจอโชว์ว่าสำเร็จค้างไว้จนกว่าจะรีโหลดแล้วค่าเด้งกลับ
 *
 * คู่กับ `reload()` ของแต่ละ hook: เขียนไม่ผ่าน → บอกผู้ใช้ + ดึงของจริงจาก DB มาทับ state
 * ที่เดาไว้ ตรงไปตรงมากว่าการเขียน rollback รายฟิลด์ให้ครบทุก action และไม่มีทาง state ค้างเพี้ยน
 */

/** รูปร่างผลลัพธ์ร่วมของ query builder ทั้ง insert/update/delete/upsert ของ supabase-js */
type WriteResult = { error: unknown };

export async function writeGuard(
  /** สิ่งที่ผู้ใช้เพิ่งทำ ในภาษาที่เขาเข้าใจ เช่น "เพิ่มจุดแวะ" — ใช้ต่อท้ายข้อความ toast */
  label: string,
  /** รับได้ทั้งคำขอเดียวและ Promise.all หลายคำขอ (เช่น จัดลำดับใหม่ที่เขียนทีละแถวทั้งวัน)
   *  — พังแถวเดียวก็ถือว่าพังทั้งชุด เพราะลำดับที่เขียนไม่ครบคือลำดับที่ผิด */
  run: () => PromiseLike<WriteResult | WriteResult[]>
): Promise<boolean> {
  try {
    const result = await run();
    const failed = Array.isArray(result) ? result.some((r) => r.error) : result.error;
    if (!failed) return true;
    reportWriteFailure(label);
    return false;
  } catch {
    // คำขอไปไม่ถึงเซิร์ฟเวอร์เลย (เน็ตหลุดกลางคัน) — supabase-js โยน แทนที่จะคืน error
    reportWriteFailure(label);
    return false;
  }
}

function reportWriteFailure(label: string) {
  // จงใจ "บอกเสมอ" ไม่ปิดปากตอนออฟไลน์ — navigator.onLine เชื่อไม่ได้ (บนมือถือมันบอก true
  // ทั้งที่ต่อ Wi-Fi ที่ออกเน็ตไม่ได้) ถ้าเอามาใช้กรองจะกลืน error จริงทิ้ง เอาไว้แค่เลือกคำพูด
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  showToast(
    "error",
    offline
      ? `เน็ตหลุด — ${label} ยังไม่ถูกบันทึก`
      : `บันทึกไม่สำเร็จ — ${label} · ลองใหม่อีกครั้ง`
  );
}
