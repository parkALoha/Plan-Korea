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

/**
 * รูปร่างผลลัพธ์ร่วมของ query builder ทั้ง insert/update/delete/upsert ของ supabase-js
 *
 * 🔴 **`data` ถูกเพิ่ม 25 ส.ค. 2026 (P2 รายงาน · P4 ออกแบบทางแก้ · P1 ลง)**
 *
 * ฉบับเดิมเป็น `{ error: unknown }` เท่านั้น — **มันไม่ได้ลืมเช็คจำนวนแถว มันไม่มีทางรู้จำนวนแถว**
 * และนั่นทำให้เคสที่ควรแดง เขียนไม่ได้เลยจนกว่ารูปข้อมูลจะเปลี่ยน
 *
 * ปัญหาที่มันเปิดไว้:
 * > **UPDATE/DELETE ที่ถูก RLS กรองออก คืน `200` · ไม่มี `error` · แตะ 0 แถว**
 * > ทุกชั้นเหนือขึ้นไปอ่านว่าสำเร็จ · หน้าจอโชว์ค่าที่เดาไว้ค้างจนกว่าจะรีโหลด
 *
 * 🎯 **นี่ไม่ใช่บั๊กของใครสักคน มันคือรูปร่างของ API ที่ทำให้ "ถูกปฏิเสธ" กับ "สำเร็จ" หน้าตาเหมือนกัน**
 * — และมันกัด P1 เองภายในชั่วโมงเดียวกับที่ P2 รายงานเข้ามา (เคสเทสต์ที่ให้ `editor` แก้ตารางของ
 * `owner` แล้ว assert `error` เป็น null → เขียว แล้วไปแดงบรรทัดถัดไปด้วยอาการที่อ่านเหมือน trigger พัง)
 * **คนที่รู้เรื่องนี้ดีที่สุดในทีมยังพลาด → ทางแก้ต้องอยู่ที่ contract ไม่ใช่ที่วินัย**
 */
type WriteResult = { error: unknown; data?: unknown[] | null };

/**
 * ผลลัพธ์นี้นับว่าล้มหรือไม่
 *
 * 🔴 **`data` ที่ไม่มีมา ≠ `data` ที่เป็น `[]`** — และความต่างนี้คือทั้งหมดของการแก้ครั้งนี้:
 *   · `{ error: null }` (ไม่ได้เรียก `.select()`) → **สำเร็จ** — 67 จุดที่มีอยู่วันนี้จึงไม่กระทบเลยสักจุด
 *   · `{ error: null, data: [] }` (เรียก `.select()` แล้วไม่ได้แถวกลับมา) → **ล้ม**
 * 🎯 จุดไหนเติม `.select()` ได้การป้องกันทันทีโดยไม่ต้องรอใคร · **`E3` กลายเป็นการเก็บกวาด ไม่ใช่เงื่อนไขเริ่มต้น**
 */
function isFailed(r: WriteResult, allowNoRows: boolean): boolean {
  if (r.error) return true;
  if (allowNoRows) return false;
  return Array.isArray(r.data) && r.data.length === 0;
}

/**
 * ชนิดของความล้มเหลว — **ไม่ใช่ระดับความรุนแรง แต่คือ *ผู้ใช้ควรทำอะไรต่อ***
 *
 * 🔴 **`denied` เกิดจาก `42501` หรือ "0 แถว" — และทั้งคู่ *ลองใหม่ไม่ได้ตลอดกาล***
 * RLS ปฏิเสธแล้วก็ปฏิเสธเหมือนเดิมทุกครั้ง · **บอกให้ "ลองใหม่" คือบอกให้ทำสิ่งที่จะล้มแน่นอน**
 * · ⚠️ และผู้ใช้ที่กดซ้ำแล้วล้มซ้ำ **จะสรุปว่าแอปพัง ไม่ใช่ว่าเขาไม่มีสิทธิ์**
 */
export type WriteFailure = "offline" | "denied" | "unknown";

/** `42501` = `insufficient_privilege` — RLS/`grant` ปฏิเสธ */
function classify(err: unknown): WriteFailure {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "42501") return "denied";
  return "unknown";
}

/**
 * หา error ตัวแรกที่มีจริงจากผลลัพธ์ — และแยก *"ถูกปฏิเสธ"* ออกจาก *"ไม่รู้"*
 *
 * 🔴 **`{ error: null, data: [] }` คือ RLS กรองออก ไม่ใช่ความสำเร็จที่ไม่มีแถว**
 * มันไม่มี `code` ให้ดู → ต้องจัดเป็น `denied` ด้วยตัวมันเอง **ไม่งั้นเคสที่ `P2` รายงานไว้
 * (UPDATE ที่ถูก RLS กรอง คืน 200 ไม่มี error) จะได้ข้อความ "ลองใหม่" เหมือนเดิม**
 */
function failureKind(result: WriteResult | WriteResult[], allowNoRows: boolean): WriteFailure {
  const rows = Array.isArray(result) ? result : [result];
  for (const r of rows) {
    if (r.error) {
      const kind = classify(r.error);
      if (kind !== "unknown") return kind;
    }
  }
  if (!allowNoRows && rows.some((r) => Array.isArray(r.data) && r.data.length === 0)) {
    return typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "denied";
  }
  return classify(null);
}

export async function writeGuard(
  /** สิ่งที่ผู้ใช้เพิ่งทำ ในภาษาที่เขาเข้าใจ เช่น "เพิ่มจุดแวะ" — ใช้ต่อท้ายข้อความ toast */
  label: string,
  /** รับได้ทั้งคำขอเดียวและ Promise.all หลายคำขอ (เช่น จัดลำดับใหม่ที่เขียนทีละแถวทั้งวัน)
   *  — พังแถวเดียวก็ถือว่าพังทั้งชุด เพราะลำดับที่เขียนไม่ครบคือลำดับที่ผิด */
  run: () => PromiseLike<WriteResult | WriteResult[]>,
  /**
   * ⚠️ **"0 แถวคือเรื่องปกติสำหรับการกระทำนี้"** — ใช้กับการลบที่ไม่มีก็ไม่เป็นไร
   * (เช่น ลบแถวที่อาจถูกลบไปแล้วโดยอีกเครื่องหนึ่ง)
   *
   * 🔴 **ต้องระบุที่จุดเรียก ไม่ใช่ค่าตั้งต้น** — ถ้าเป็นค่าตั้งต้น ช่องที่เพิ่งปิดจะเปิดกลับทันที
   * และเปิดกลับแบบที่ไม่มีใครเห็น เพราะไม่มีใครต้องพิมพ์อะไรเพิ่มเลย
   */
  options?: { allowNoRows?: boolean }
): Promise<boolean> {
  const allowNoRows = options?.allowNoRows === true;
  try {
    const result = await run();
    const failed = Array.isArray(result)
      ? result.some((r) => isFailed(r, allowNoRows))
      : isFailed(result, allowNoRows);
    if (!failed) return true;
    reportWriteFailure(label, failureKind(result, allowNoRows));
    return false;
  } catch {
    // คำขอไปไม่ถึงเซิร์ฟเวอร์เลย (เน็ตหลุดกลางคัน) — supabase-js โยน แทนที่จะคืน error
    // 🔴 ที่นี่ **ไม่มีทางเป็น `denied`** — ถูกปฏิเสธแปลว่าไปถึงแล้ว
    reportWriteFailure(label, classify(null) === "offline" ? "offline" : "unknown");
    return false;
  }
}

function reportWriteFailure(label: string, kind: WriteFailure) {
  // จงใจ "บอกเสมอ" ไม่ปิดปากตอนออฟไลน์ — navigator.onLine เชื่อไม่ได้ (บนมือถือมันบอก true
  // ทั้งที่ต่อ Wi-Fi ที่ออกเน็ตไม่ได้) ถ้าเอามาใช้กรองจะกลืน error จริงทิ้ง เอาไว้แค่เลือกคำพูด
  //
  // 🔴 **แยก `denied` ออกมา 26 ส.ค. 2026 (P7 ชี้ · P1 ยืนยัน+ลง)**
  //    ฉบับเดิมพูด *"ลองใหม่อีกครั้ง"* กับความล้มเหลว **ทุกชนิด** ซึ่งผิดอยู่แล้ววันนี้:
  //    `42501` ลองใหม่กี่ครั้งก็ถูกปฏิเสธเหมือนเดิม **ผู้ใช้จะกดซ้ำจนสรุปว่าแอปพัง**
  //    🎯 และเคส `E7` cutover **ตกลงมาฟรี** — ฐานคืน `42501` ตอนนั้นพอดี ข้อความจึงไม่ชวนกดซ้ำอยู่แล้ว
  //       **ไม่มีโค้ดไหนนั่งรอสวิตช์ที่ยังไม่เกิด** ซึ่งคือสิ่งที่ทำให้มันไม่ใช่ `D73`
  const message =
    kind === "offline"
      ? `เน็ตหลุด — ${label} ยังไม่ถูกบันทึก`
      : kind === "denied"
        ? `ไม่มีสิทธิ์${label} — ถ้าคิดว่าผิด ลองเปิดหน้านี้ใหม่`
        : `บันทึกไม่สำเร็จ — ${label} · ลองใหม่อีกครั้ง`;
  showToast("error", message);
}
