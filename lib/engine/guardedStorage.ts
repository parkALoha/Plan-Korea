"use client";

import { supabase } from "@/lib/supabase";
import { BOOKING_FILES_BUCKET } from "@/lib/engine/storageKey";
import { writeGuard } from "@/lib/writeGuard";

/**
 * **ที่เดียวในโปรเจกต์ที่เรียก `supabase.storage.*` เพื่อ *เขียน* ได้** — `E3-AC4` · `D15`
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026 · P2 ชี้ช่องที่ทำให้ไฟล์นี้จำเป็น
 *
 * ## 🔴 ทำไมไฟล์นี้ต้องมี ทั้งที่ทั้งสองฝั่งห่อ `writeGuard` ครบแล้ว
 * ด่าน `bookingFileStorageGate.test.ts` ของ P2 บังคับว่าการเขียน Storage อยู่ได้แค่ในไฟล์ที่อนุญาต
 * **แต่มันบังคับ *ที่ไหน* ไม่ได้บังคับ *ห่อหรือไม่ห่อ***
 * ```js
 * /\.storage\.from\([^)]*\)\s*\.\s*(upload|remove|…)\s*\(/   // match ไม่ว่าจะอยู่ใน writeGuard หรือไม่
 * ```
 * → ใครเพิ่ม `.upload()` ดิบ ๆ **ในไฟล์ที่อนุญาตเอง** ด่านยังเขียว · P2 เห็นช่องนี้เองและยอมรับ
 *
 * 🎯 **ไฟล์นี้ทำให้สองคำถามกลายเป็นคำถามเดียว:**
 * **ที่เดียวที่อนุญาตให้เขียน = ที่ที่ห่อเสมอ** → ด่าน "อยู่ที่ไหน" กลายเป็นด่าน "ห่อหรือไม่" ไปด้วย
 * · รูปเดียวกับ `lib/engine/db.ts` ที่เป็นไฟล์เดียวที่พิมพ์ชื่อตารางได้ — **เราแก้ปัญหารูปนี้ไปแล้วรอบหนึ่ง**
 *
 * ## 🔴 **ห้ามใส่ `import "server-only"` ที่นี่** — ต่างจาก `db.ts` (P2 เตือนก่อนผมลงมือ)
 * `db.ts` เป็นของฝั่งเซิร์ฟเวอร์ล้วน · **ไฟล์นี้ตรงกันข้าม**: ผู้ใช้ของมันคือ `hooks/useBookingFile.ts`
 * และ `lib/stopPhoto.ts` ซึ่งรันบนเบราว์เซอร์ · ใส่ `server-only` = `next build` พังทันที
 * ⚠️ **นี่คือจุดที่การคัดลอกรูปจาก `db.ts` จะพาไปผิด** — รูปที่เหมือนกัน เหตุผลคนละข้าง
 *
 * ## ⚠️ ขอบเขต: **การเขียนเท่านั้น**
 * `createSignedUrl` / `createSignedUrls` (อ่าน) ยังอยู่ที่ `lib/engine/files.ts` ตามเดิม
 * — การอ่านที่ล้มไม่ได้ทำให้ข้อมูลเสีย และมันมีเส้นทาง fallback ของตัวเองอยู่แล้ว (`E2-AC13` ③)
 */

/**
 * อัปโหลดไฟล์ขึ้น bucket — คืน `true` เมื่อสำเร็จ
 *
 * 🔴 **`allowNoRows` ไม่มีผลกับรูปนี้ และนั่นถูกต้อง** — `.upload()` คืน `data` เป็น *object*
 * (`{ path, id, fullPath }`) ไม่ใช่ array → `Array.isArray(data)` เป็น `false` เสมอ
 * → ข้อ "0 แถว" ของ `writeGuard` ไม่ทำงานกับมันเลย · **ถูกโดยธรรมชาติของ API ไม่ใช่ช่องที่พลาด**
 *
 * 🎯 **และ `tsc` พูดข้อนี้เองก่อนที่ผมกับ P2 จะเขียนคอมเมนต์เสร็จ:** `WriteResult.data`
 * เป็น `unknown[] | null` → มันปฏิเสธผลของ `.upload()` ทันที
 * · ทางที่ง่ายคือขยายชนิดให้รับ object — **ซึ่งจะทำให้ชนิดเลิกบอกว่า "data คือแถว"**
 *   ที่ทั้ง `writeGuard.ts` ตั้งอยู่บนมัน · **เลือกทิ้ง `data` แทน ให้ความไม่เข้ากันอยู่ที่จุดเรียก**
 * · P2 กับผมเลือกทางเดียวกันโดยไม่ได้ตกลงกัน **แต่ผมอ่านของเขาก่อนเขียน จึงไม่ใช่หลักฐานอิสระ**
 */
export async function guardedUpload(label: string, path: string, file: File): Promise<boolean> {
  return writeGuard(label, async () => {
    const { error } = await supabase.storage.from(BOOKING_FILES_BUCKET).upload(path, file);
    return { error };
  });
}

/**
 * ลบไฟล์ออกจาก bucket
 *
 * 🔴 **`allowNoRows` ต้องระบุทุกครั้ง ไม่มีค่าตั้งต้น** — ตามกติกาที่ `writeGuard.ts` เขียนไว้เอง
 * (*"ถ้าเป็นค่าตั้งต้น ช่องที่เพิ่งปิดจะเปิดกลับทันที และเปิดกลับแบบที่ไม่มีใครเห็น"*)
 * · `true` ใช้กับไฟล์ที่แถวจริงถืออยู่ — อีกเครื่องลบไปก่อนได้ · **"ไม่มีให้ลบ" = ผลที่ผู้ใช้ต้องการ**
 * · `false` ใช้กับไฟล์ที่เซสชันนี้เพิ่งสร้างเอง — ไม่มีใครอื่นรู้จัก · 0 แถว = ผิดปกติจริง
 */
export async function guardedRemove(
  label: string,
  paths: string[],
  options: { allowNoRows: boolean }
): Promise<boolean> {
  if (paths.length === 0) return true;
  return writeGuard(
    label,
    () => supabase.storage.from(BOOKING_FILES_BUCKET).remove(paths),
    { allowNoRows: options.allowNoRows }
  );
}
