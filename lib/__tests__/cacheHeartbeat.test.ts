import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testClient } from "./_testClient";
import { readEnvKey, requireLiveCreds } from "./_helpers";
import { catalogKeyRows, cachedDetailKeys, cachedPhotoKeys, type Db } from "@/lib/engine/db";
import { warmTargets } from "@/lib/engine/cacheWarmList";
import { parsePlaceIdKey } from "@/lib/placeQuery";

/**
 * 🔴 `??` เฉย ๆ ไม่พอ — GitHub Actions ตั้ง env จาก `workflow_dispatch` input ที่เว้นว่างไว้เป็น
 * **สตริงว่าง ไม่ใช่ `undefined`** → `Number("" ?? "141")` ได้ `0` ไม่ใช่ `141` (พิสูจน์แล้วก่อน commit)
 * เพดาน `0` ที่ไม่มีใครตั้งใจ = ด่านแดงทันทีโดยดูเหมือนเป็นบั๊กของโค้ด ไม่ใช่ของ config
 */
function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  return raw === "" ? fallback : Number(raw);
}

/**
 * 🔴 แก้ 4 ก.ย. 2026 (P4 เสนอ · P1 ยกให้ตัดสิน) — เพดานชั่วคราวที่ **หมดอายุเองในโค้ด** แทนการยกเว้น
 * ถาวรที่ต้องมีคนจำมาถอด · ที่มาของข้อเสนอ: schedule เพิ่งเปิดจริง (`d85648e`) แต่ backlog ยังมี
 * 719/720 คีย์ — จะแดง "ตามคาด" หลายวันติด ซึ่งเป็นแดงที่ถูกต้องแต่ทำให้คนเลิกอ่านผลของไฟล์นี้
 * (แดงค้างไม่มีกำหนดสิ้นสุด = คนชิน ⇒ แดงใหม่จากเหตุอื่นในช่วงเดียวกันจะไม่มีใครสังเกต)
 *
 * 🔴 **กับดักที่ต้องเลี่ยง (P1 ทัก):** ห้ามคำนวณวันหมดอายุจาก "วันนี้ + N" — นาฬิกาของ cron
 * ยังไม่เริ่มเดินจริง (`workflow_dispatch`/`schedule` อ่าน workflow จาก default branch (`main`)
 * เท่านั้น และ `main` ไม่มี `.github/` เลย — cron จึงยังไม่เคยรันสักครั้งไม่ว่า `schedule:` จะ
 * uncomment อยู่หรือไม่) ตั้งวันหมดอายุตอนนี้ = เดาวันที่นาฬิกาจะเริ่ม ซึ่งประเมินผิดได้ง่าย
 *
 * ✅ **ท่าที่เลี่ยงกับดักนั้น:** `CACHE_CEILING_GRACE_UNTIL` เป็นวันที่ที่ **มนุษย์ใส่เอง หลังยืนยัน
 * จากประวัติการรันจริงใน GitHub Actions แล้วเท่านั้น** (ไม่ใช่ตอนแก้ไฟล์นี้) — ว่า cron รันสำเร็จ
 * ไปแล้วกี่ครั้ง จึงตั้งวันหมดอายุจากจุดนั้น ไม่ใช่จากวันที่เขียนโค้ด
 * · **ไม่ตั้ง (ค่าเริ่มต้น) = ไม่มีผ่อนเลย** เพดานยังเป็น `CACHE_MAX_MISSING_*`/default ปกติ ตาม
 *   พฤติกรรมเดิมทุกประการ (คือสภาพตอนนี้ — ยังไม่มีใครยืนยันว่า cron รันจริงสักครั้ง)
 * · **ตั้งแล้วยังไม่หมดอายุ** = ใช้ `CACHE_MAX_MISSING_*` เป็นเพดานที่ผ่อนไว้ชั่วคราว
 * · **ตั้งแล้วหมดอายุแล้ว** = **กลับไปใช้ default ของไฟล์นี้ (0/1) เองอัตโนมัติ** ไม่ว่า
 *   `CACHE_MAX_MISSING_*` ใน `cache-warm.yml`/`cache-heartbeat.yml` จะยังตั้งเลขผ่อนค้างอยู่หรือไม่
 *   — **นี่คือส่วนที่ทำให้ไม่ต้องมีใครกลับมาถอดข้อยกเว้น** ตามที่ P4 ขอ
 *
 * ⚠️ **ข้อแลกที่ยอมรับไว้ตรงๆ (P1/P4 เห็นตรงกัน):** ระหว่างช่วงผ่อน ด่านนี้มองไม่เห็นปัญหาใหม่ที่
 * ยังต่ำกว่าเพดานที่ผ่อนไว้ — ยอมรับเพราะ "ความไวที่เสียมีขอบเขต (แค่ช่วงผ่อน) ส่วนความตาบอดจาก
 * ความชินกับแดงค้างไม่มีขอบเขต"
 */
function graceCeilingActive(): boolean {
  const raw = (process.env.CACHE_CEILING_GRACE_UNTIL ?? "").trim();
  if (raw === "") return false;
  const until = new Date(`${raw}T23:59:59Z`); // รวมทั้งวันนั้น (inclusive)
  if (Number.isNaN(until.getTime())) return false; // วันที่ผิดรูป = ไม่ยอมผ่อน (fail-closed)
  return Date.now() <= until.getTime();
}

/**
 * 🔴 แก้ 4 ก.ย. 2026 (P1 ยกให้ตัดสิน หลังคลังโต 202→921 ทำให้ขาด 719 พอดี) — heartbeat ต้องแยก
 * *"ตัวอุ่นปิดอยู่ตามที่ตั้งใจ (รอผู้ใช้อนุมัติ schedule)"* ออกจาก *"ตัวอุ่นพัง"* คนละข้อความ ไม่งั้น
 * ทีมจะอ่านของที่ถูกต้องว่าเป็นบั๊ก แล้ว (ตามที่จดกันไว้ทั้งวัน) ด่านที่แดงใส่คนที่ทำถูกจะถูกลบทั้งใบ
 *
 * ✅ **อ่านจาก `cache-warm.yml` เอง — ไม่สร้างทะเบียน/ธงที่สองให้ต้องซิงก์มือ** ถ้าวันหนึ่งมีคนเปิด
 * `schedule` แล้วลืมอัปเดตอะไรที่นี่ ข้อความจะกลับมาเป็น "ทำงานจริงแล้วยังพัง" เองอัตโนมัติ — ไฟล์เดียว
 * เป็นความจริงทั้งสองฝั่ง (จะเปิดจริงหรือยัง)
 *
 * 🔴 **ยังคง fail แน่นอน ไม่ทำให้เขียว** — schedule ปิดจริง = ตัวอุ่นไม่ทำงานจริง = ขาดจะโตต่อไปเรื่อยๆ
 * นั่นยังเป็นสภาพที่ไม่ควรอ่านว่า "ผ่าน" ได้ (P1 ปฏิเสธไปแล้วว่าจะไม่สร้าง assertion ที่ไม่มีวันแดง)
 * สิ่งที่เปลี่ยนคือ *ข้อความ* ไม่ใช่ *สถานะ* — คนอ่าน log ต้องรู้ทันทีว่านี่ไม่ใช่ regression ให้ไปตามหา
 */
function cronScheduleEnabled(): boolean {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), ".github/workflows/cache-warm.yml"), "utf8");
  } catch {
    return false; // อ่านไฟล์ไม่ได้ = ไม่รู้ว่าเปิดหรือยัง → fail-closed ไปทาง "ยังไม่พร้อม"
  }
  // `  schedule:` (ไม่มี `#` นำหน้า) ใต้ `on:` — คอมเมนต์ไว้คือ `  # schedule:` ซึ่งไม่ match รูปนี้
  return text.split("\n").some((line) => /^\s*schedule:\s*$/.test(line));
}

/**
 * `Q3` ก้าวที่ 2 — cache-heartbeat: **จำนวนคีย์ที่ยังไม่ได้อุ่น ต้องไม่ค้าง** · เจ้าของ: P6-DevOps (3 ก.ย. 2026)
 *
 * ## ทำไมวัด "คีย์ที่ขาด" ไม่ใช่ "แถวสดแค่ไหน" (`fetched_at`)
 * ตั้งใจแรกคือเทียบ `fetched_at` กับ TTL — แต่ P1 ตรวจแล้วพบว่า **ไม่มี TTL อยู่จริง**
 * (route ไม่เคยอ่าน `fetched_at` เลย · ตัวอุ่นเขียนด้วย `ON CONFLICT DO NOTHING` ไม่เคยทับของเดิม)
 * → แถวที่เขียนแล้วถูกเสิร์ฟตลอดกาล **พออุ่นครบ ตัวอุ่นจะไม่เขียนอะไรอีกเลย** ถ้าวัดความสดจะ
 * **แดงถาวรทั้งที่ทุกอย่างทำงานถูก** — ตระกูล "ด่านที่แดงใส่คนที่ทำถูก จะถูกลบทั้งใบ" ที่ทีมนี้จดไว้แล้ว
 *
 * 🎯 **ทางที่ใช้ได้วันนี้โดยไม่ต้องรอผู้ใช้ตัดสิน TTL:** วัด `warmTargets().length` ตรงๆ —
 * ฟังก์ชันเดียวกับที่ตัวอุ่นใช้เลือกว่าคีย์ไหนต้องอุ่น (`lib/engine/cacheWarmList.ts`)
 * ```
 * ขาด = 0        →  สุขภาพดี (ไม่ว่าจะเพิ่งอุ่นเสร็จหรือไม่มีอะไรใหม่มานาน)
 * ขาด > 0 ค้าง   →  มีคลังใหม่เข้ามาแล้วตัวอุ่นไม่ทำงาน
 * ```
 * ⚠️ **ข้อจำกัดที่ยอมรับไว้ตรงๆ:** เช็คนี้จับ "cron ตายในวันที่ไม่มีคลังใหม่" ไม่ได้ — วันนั้น
 * ขาด=0 อยู่แล้วไม่ว่า cron จะรันหรือไม่ก็ตาม **แต่กรณีนั้น GitHub ส่งอีเมลแจ้งเองอยู่แล้วเมื่อ
 * `cache-warm.yml` (scheduled run) ล้ม — สองด่านนี้ครอบคนละกรณี ไม่ใช่ด่านเดียวที่ต้องครอบทุกทาง**
 *
 * 🔴 **สองตารางแคช วัดแยกกัน ไม่รวมเป็นตัวเลขเดียว** — รูปเดียวกับที่ P4 เคยชี้ไว้กับ `E3-AC9`②
 * (`place ตัวเดียว = 5 + trip ตัวเดียว = 0 รวมเป็น 5 ผ่านสบาย → ITINERARY หายทั้งใบเงียบ`)
 * ถ้ารวม `missingDetails + missingPhotos` เป็นก้อนเดียว ตารางใดตารางหนึ่งพังสนิทแต่อีกใบปกติ
 * ยังผ่านได้ถ้าผลรวมบังเอิญต่ำ — แยก assert สองบรรทัดจึงจำเป็น ไม่ใช่แค่สไตล์
 *
 * ## 🔴 แก้ 3 ก.ย. 2026 (P1 ทัก) — เดิมห่อด้วย `it.fails` แล้วพบว่ามันทำให้ heartbeat ไม่มีอำนาจ
 * `it.fails` รายงาน "ผ่าน" เสมอไม่ว่าจะขาดกี่คีย์ — heartbeat จึงตอบคำถาม *"ตัวอุ่นทำงานอยู่ไหม"*
 * ด้วย "ใช่" ตลอดกาล จนกว่าจะมีคนแปลงกลับเอง **ทั้งที่ตอนนี้คือตอนที่ heartbeat มีค่าที่สุด** —
 * ถ้าคลังโตขึ้นระหว่างที่ยังไม่มีตัวเขียน เราอยากรู้ แต่ `it.fails` จะเงียบ
 *
 * ✅ **ใช้เพดาน + ตัวเตือนว่าเพดานล้าแทน — ได้ทั้งด่านจริงตั้งแต่วันนี้ และการพลิกตัวเองเมื่อขาด→0:**
 * ```
 * ① ขาด > เพดาน        →  แดงทันที (ด่านทำงานจริง ไม่ต้องรอตัวเขียนเสร็จ)
 * ② เพดาน − ขาด ใกล้ 0  →  แดง "เพดานล้า ลดได้แล้ว" (พลิกเองเมื่อตัวอุ่นเริ่มทำงาน — หน้าที่เดียวกับ it.fails เดิม)
 * ```
 * ## 🔴 แก้ 3 ก.ย. 2026 (P1 จับ) — ค่าตั้งต้นในไฟล์นี้ล้าไปแล้วครั้งหนึ่งจริง ไม่ใช่แค่ในทางทฤษฎี
 * รอบแรก default `141` ทั้งคู่ (สภาพวันที่เขียนไฟล์ ตัวอุ่นยังไม่เคยรัน) — ผมตั้งเพดานที่ถูกไว้ใน
 * `cache-heartbeat.yml` (`CACHE_MAX_MISSING_DETAILS=0`) แต่ **ลืมย้ายค่าจริงเข้ามาเป็น default ที่นี่ด้วย**
 * → หัว branch แดงทันทีสำหรับ **ทุกคนที่รัน `npm test` ตรงๆ** (ชุดเต็มก่อน push · CI job `verify` ·
 * ทุกเครื่อง) เพราะพวกนั้นไม่ผ่าน `cache-heartbeat.yml` เลย จึงไม่เห็น override — เจอกับตัวจาก P1
 *
 * 🎯 **บทเรียน: default ในไฟล์ควรเป็น *เป้าหมายสภาพคงตัว* ไม่ใช่ *ค่าที่วัดได้วันที่เขียนไฟล์*** —
 * เพราะ cron มีหน้าที่รักษาให้ขาด≈0/1 ตลอดไป ค่าตั้งต้นที่ถูกจึงไม่ใช่ตัวเลขที่ต้องไล่ตามทุกครั้งที่
 * ตัวอุ่นทำงาน แต่คือเป้าที่ระบบควรอยู่ที่นั่นเสมอเมื่อทุกอย่างทำงานถูก
 * ```
 * CACHE_MAX_MISSING_DETAILS = 0   (place_details_cache — วัดจริง 3 ก.ย. 2026: 174/174 อุ่นครบ)
 * CACHE_MAX_MISSING_PHOTOS  = 9   (place_photo_cache — แก้ 5 ก.ย. 2026 ตามที่หัวไฟล์ข้อ 129 สั่งให้ทำ
 *                                   ไม่ใช่ขยับเพดานเฉยๆ)
 * ```
 * `CACHE_MAX_MISSING_DETAILS`/`CACHE_MAX_MISSING_PHOTOS` ยังปรับได้จาก env โดยไม่ต้องแก้ไฟล์นี้
 * (`cache-heartbeat.yml` ตั้งค่าเดียวกันซ้ำไว้อย่างชัดเจน ไม่ใช่พึ่ง default เงียบๆ — ตั้งใจให้เห็นในไฟล์ workflow)
 *
 * ## 🔴 แก้ 5 ก.ย. 2026 (P1 จับที่ heartbeat แดงหลัง `db:push` · P6 ไล่) — `1` → `9` ด้วยหลักฐานจริง ไม่ใช่เดา
 * คลังโต 202→2,396 ระหว่างวัน ทำให้ตัวอุ่นเจอสถานที่ไร้รูปเพิ่มอีก 8 แห่ง (จากเดิม 1) — **ยิง Google
 * Place Details ตรงด้วย field mask `photos` ทีละคีย์จริง ไม่ใช่ดูแค่ตัวเลขที่ heartbeat รายงาน:**
 * ```
 * place_id:ChIJh4WW2wTlYjUR5L4qhUEIDXs  → "Poko"                                    ไม่มี photos เลย
 * place_id:ChIJIZgbaZtV3jARv3JBmaitP7I  → ศูนย์พระเครื่องตลาดอาจารย์มนัสจังหวัดสุโขทัย   ไม่มี photos เลย
 * place_id:ChIJ68cOawDfbTURwsnlhQIFOBo  → "여수 버스터미널" (เยซู บัสเทอร์มินอล)            ไม่มี photos เลย
 * place_id:ChIJ3TOZnjvF7zYR4d4FpzQpw_I  → "Underground Shopping Mall"                ไม่มี photos เลย
 * place_id:ChIJ5ewgD7KvmzYR2nlrNnrW3DI  → "Zhangjiajie Commercial Building"          ไม่มี photos เลย
 * place_id:ChIJUzTWjHjG7zYR0K7Na9z18oI  → "Ziwei Restaurant"                        ไม่มี photos เลย
 * place_id:ChIJu7fpLU7G7zYRBkA0fwpK78I  → "Yuanli Hotpot"                           ไม่มี photos เลย
 * place_id:ChIJZ1R7ldGvmzYRABzVPeT6Yuw  → "Hetian Coffee"                           ไม่มี photos เลย
 * "Hanoi Train Street Hanoi" (searchText) → "Ngõ 224 Lê Duẩn"                       ไม่มี photos เลย
 * ```
 * · ทุกคีย์ **resolve เป็นสถานที่จริงสำเร็จ** (มีแถวใน `place_details_cache` ครบทั้ง 9 อยู่แล้ว) — ไม่ใช่
 *   คีย์ที่ตัวอุ่นยังไล่ไม่ทัน ยืนยันด้วยการรัน `cache-warm.yml` ซ้ำ (`limit=20`) หลังแก้ `testTimeout`
 *   (`b544333`) แล้ว: `เป้า 9 · เขียน 0 · ไม่มีรูป/ล้ม 9` — ตัวอุ่นพยายามแล้วจริง ไม่ใช่ข้ามไป
 * 🎯 **นี่คือกรณีที่หัวไฟล์ (บรรทัด 116-119) ตั้งใจไว้พอดี** — ค่าจริงของ "สภาพคงตัว" เปลี่ยนเพราะคลังโต
 *   ไม่ใช่เพราะตัวอุ่นพัง ⇒ แก้ที่ *default ในไฟล์นี้* ตรงๆ ไม่ใช่ผ่านช่อง `CACHE_CEILING_GRACE_UNTIL`
 *   (ช่องนั้นมีไว้สำหรับการค้าง**ชั่วคราว**ระหว่างไล่คลังทัน — เคสนี้เป็นเป้าหมายถาวรใหม่)
 *
 * ⚠️ **เลขทั้งสองยังต้องมีคนดูแล ไม่ใช่ค่าคงที่ตลอดกาล** — ถ้าเพิ่มคลังโดยตั้งใจ (เช่นเมืองใหม่)
 * ต้องขยับเพดานขึ้นชั่วคราวพร้อมกัน (ทั้งที่นี่และ `cache-heartbeat.yml`) ไม่งั้นด่านนี้จะแดงใส่คนที่ทำถูก
 * · ถ้า `_PHOTOS` ขึ้นเป็น `10` ให้เช็คว่าเป็น "คีย์ใหม่ที่ยังไม่ได้อุ่น" หรือ "สถานที่ไร้รูปเพิ่มอีกแห่ง"
 *   ด้วยการยิง Google Place Details ตรงต่อคีย์ที่ขึ้นใหม่ ไม่ใช่ดูแค่ตัวเลข (P1 เสนอ · P6 ทำตามรอบนี้แล้วยืนยันว่าใช้ได้จริง)
 * · **ช่วงเตือน (② ด้านบน) ตั้งไว้ที่ 20** — ค่าที่ P1 เลือกเอง ไม่ได้วัดจากอะไร ปรับได้ตามที่เห็นควร
 *
 * ## 🔴 แก้ 5 ก.ย. 2026 ต่อ (P1 อ่านโค้ดแล้วชี้ · P6 ตัดสินใจตาม) — ตัวเลขปิดช่อง P4 เตือนไว้ไม่ได้
 * เพดานตัวเลขเทียบแค่ *จำนวน* — ถ้าคีย์ 9 ตัวที่ยืนยันว่าไร้รูปหายไป 1 ตัว แล้ว**คีย์อื่น**ที่ควรมีรูป
 * (เช่นสถานที่ยอดนิยม) หลุดมาแทน จำนวนยังเท่าเดิม (9) ⇒ **เขียวทั้งที่ผิด** ตัวเตือนเพดานล้า (`< 20`)
 * ก็ไม่ช่วย เพราะมันจับแค่ "เพดานสูงเกินของจริง" ไม่ใช่ "คนละคีย์"
 *
 * ✅ **ทางที่ใช้: ตรึงคีย์ `place_id:` ทั้ง 8 ตัวแบบ exact-match แยกจากเพดานตัวเลข**
 * ```
 * missing ที่เป็น place_id:  ต้องอยู่ใน KNOWN_PHOTOLESS_PLACE_ID_KEYS ทุกตัว ไม่งั้นแดงทันที (ไม่สนจำนวน)
 * missing ที่เป็น searchText (ข้อความล้วน)  ยังคุมด้วยเพดานตัวเลขเดิม (`CACHE_MAX_MISSING_TEXT_PHOTOS`)
 * ```
 * 🔴 **ทำไมแยก `searchText` ออกจากการตรึง** — คีย์แบบนี้ผูกกับข้อความ `mapsQuery` ตรงๆ
 * (ต่างจาก `place_id:` ที่ผูกกับ Google Place ID ซึ่งไม่เปลี่ยนตามการแก้คลัง) ถ้ามีคนแก้ชื่อสถานที่ใน
 * คลังวันหลัง คีย์จะเปลี่ยนแล้วทำให้ exact-match แดงทั้งที่ไม่มีอะไรพัง — **เพดานตัวเลขทนต่อเรื่องนี้กว่า**
 * ⇒ ตอนนี้มีคีย์แบบ `searchText` ที่ไร้รูปอยู่ 1 ตัว ("Hanoi Train Street Hanoi") จึงปล่อยให้
 *   `CACHE_MAX_MISSING_TEXT_PHOTOS = 1` คุมแทน ไม่ตรึง
 * 🎯 **ข้อดีของ exact-match: มันเกษียณตัวเอง** — สถานที่ไหนได้รูปเพิ่มทีหลัง เซตหด ไม่มีอะไรพัง ·
 *   คีย์ `place_id:` ใหม่ที่ไร้รูปโผล่มา **แดงทันที** บังคับให้คนไปยิง Google ยืนยันแบบที่ทำรอบนี้ ทุกครั้ง
 *   ไม่ใช่แค่ครั้งนี้ครั้งเดียว — ปิดช่องที่ P4 เตือนไว้จริง สำหรับคีย์ที่ตรึงได้
 */

/**
 * คีย์ `place_id:` 8 ตัวที่ยิง Google Place Details ตรงยืนยันแล้ว (5 ก.ย. 2026 · field mask `photos`)
 * ว่า resolve เป็นสถานที่จริงได้ (มีแถวใน `place_details_cache`) แต่ไม่มี field `photos` เลย
 * ⇒ **exact-match กับเซตนี้** ไม่ใช่แค่นับจำนวน — ปิดช่องที่คีย์อื่นหลุดมาแทนโดยจำนวนบังเอิญเท่าเดิม (P1 ชี้)
 * รายชื่อสถานที่/หลักฐานเต็มอยู่ที่หัวไฟล์ § แก้ 5 ก.ย. 2026 — เพิ่มคีย์ใหม่ที่นี่ได้ก็ต่อเมื่อยิง Google
 * ยืนยันแบบเดียวกันแล้วเท่านั้น ห้ามเพิ่มเพราะ heartbeat แดงเฉยๆ (นั่นคือการปิดปากตัววัด)
 */
const KNOWN_PHOTOLESS_PLACE_ID_KEYS = new Set([
  "place_id:ChIJh4WW2wTlYjUR5L4qhUEIDXs", // Poko
  "place_id:ChIJIZgbaZtV3jARv3JBmaitP7I", // ศูนย์พระเครื่องตลาดอาจารย์มนัสจังหวัดสุโขทัย
  "place_id:ChIJ68cOawDfbTURwsnlhQIFOBo", // 여수 버스터미널
  "place_id:ChIJ3TOZnjvF7zYR4d4FpzQpw_I", // Underground Shopping Mall
  "place_id:ChIJ5ewgD7KvmzYR2nlrNnrW3DI", // Zhangjiajie Commercial Building
  "place_id:ChIJUzTWjHjG7zYR0K7Na9z18oI", // Ziwei Restaurant
  "place_id:ChIJu7fpLU7G7zYRBkA0fwpK78I", // Yuanli Hotpot
  "place_id:ChIJZ1R7ldGvmzYRABzVPeT6Yuw", // Hetian Coffee
]);

const URL_ = readEnvKey("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE = readEnvKey("SUPABASE_SERVICE_ROLE_KEY");
const hasCreds = Boolean(URL_ && SERVICE);

describe("Q3 ก้าวที่ 2 — cache-heartbeat", () => {
  it("ต้องมี creds จริงถึงจะวัดได้", () => {
    requireLiveCreds(hasCreds, "cache-heartbeat", ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  });

  describe.runIf(hasCreds)("จำนวนคีย์ที่ยังไม่ได้อุ่น", () => {
    // ✅ เคสควบคุมฝั่งบวก — พิสูจน์ว่า harness เชื่อมฐานได้จริง ไม่ได้ผ่านเพราะอ่านอะไรไม่ได้เลย
    it("อ่านคลังและตารางแคชได้ (ไม่ใช่ทุกอย่างคืน null)", async () => {
      const admin = testClient(SERVICE) as Db;
      const catalog = await catalogKeyRows(admin);
      const detailKeys = await cachedDetailKeys(admin);
      const photoKeys = await cachedPhotoKeys(admin);

      // 🔴 `null` = อ่านฐานไม่ได้ (ฐานล่ม/สิทธิ์หาย) ต้องแยกจาก "อ่านได้แต่ว่าง" เสมอ
      //    ผู้เรียกทุกตัว (db.ts) คืน null เมื่อล้ม ไม่ใช่ [] — ถ้าปนกัน วันที่ฐานล่มจะรายงานว่า "ขาด 0"
      expect(catalog, "อ่าน catalog_places ไม่ได้ — ฐานอาจล่ม ไม่ใช่คลังว่าง").not.toBeNull();
      expect(detailKeys, "อ่าน place_details_cache ไม่ได้").not.toBeNull();
      expect(photoKeys, "อ่าน place_photo_cache ไม่ได้").not.toBeNull();
    });

    it("ขาดไม่เกินเพดาน — ทั้ง place_details_cache และ place_photo_cache แยกกัน", async () => {
      const admin = testClient(SERVICE) as Db;
      const catalog = await catalogKeyRows(admin);
      const detailKeys = await cachedDetailKeys(admin);
      const photoKeys = await cachedPhotoKeys(admin);
      if (!catalog || !detailKeys || !photoKeys) {
        throw new Error("อ่านฐานไม่ได้ — ดูเคสควบคุมฝั่งบวกด้านบนว่าทำไม");
      }

      // 🔴 `catalogKeyRows()` คืนคอลัมน์ตามชื่อจริงในฐาน (snake_case) · `warmTargets()` รับ
      //    `CatalogKeyRow` (camelCase) — แปลงตรงนี้เพื่อไม่ให้สองฝั่งต้องรู้จักรูปของกันและกัน
      const rows = catalog.map((r) => ({
        id: r.id,
        mapsQuery: r.maps_query,
        googlePlaceId: r.google_place_id,
      }));

      const missingDetails = warmTargets({ catalog: rows, cachedKeys: detailKeys });
      const missingPhotos = warmTargets({ catalog: rows, cachedKeys: photoKeys });
      // 🔴 แยกคีย์ `place_id:` (ตรึงแบบ exact-match ได้ — ผูกกับ Google Place ID ไม่เปลี่ยนตามคลัง)
      //    ออกจากคีย์ `searchText` (ผูกกับ mapsQuery ดิบ เปราะกว่า — ยังคุมด้วยเพดานตัวเลข) ดูหัวไฟล์
      const missingPhotoPlaceIdKeys = missingPhotos.filter((t) => parsePlaceIdKey(t.key) !== null);
      const missingPhotoTextKeys = missingPhotos.filter((t) => parsePlaceIdKey(t.key) === null);
      const unexpectedPhotolessPlaceIds = missingPhotoPlaceIdKeys.filter(
        (t) => !KNOWN_PHOTOLESS_PLACE_ID_KEYS.has(t.key),
      );

      // 🔴 ผ่อนได้เฉพาะตอนอยู่ในช่วง grace (ตั้งโดยมนุษย์ที่ยืนยันแล้วว่า cron รันจริง) —
      //    หมดอายุแล้ว = เมิน CACHE_MAX_MISSING_* ทั้งสอง กลับไปใช้ default (0/1) เสมอ ไม่ต้องมีคนถอด
      const grace = graceCeilingActive();
      const maxDetails = grace ? envInt("CACHE_MAX_MISSING_DETAILS", 0) : 0;
      // 🔴 คุมเฉพาะคีย์ `searchText` แล้ว (ไม่ใช่ทั้งก้อนเหมือนเดิม) — `place_id:` ตรึงด้วย exact-match ด้านล่าง
      const maxTextPhotos = grace ? envInt("CACHE_MAX_MISSING_TEXT_PHOTOS", 1) : 1;

      // 🔴 ถ้า schedule ยังปิดอยู่ (รอผู้ใช้อนุมัติ) และเกินเพดาน — ตัวอุ่นไม่มีทางไล่ทันอยู่แล้ว
      //    ตามนิยาม พูดตรงๆ ว่าทำไม แทนปล่อยให้ข้อความเพดานข้างล่างอ่านเหมือนบั๊กโค้ด (ดูหัวไฟล์)
      const scheduleOn = cronScheduleEnabled();
      const overDetails = missingDetails.length > maxDetails;
      const overTextPhotos = missingPhotoTextKeys.length > maxTextPhotos;
      const overUnknownPlaceIds = unexpectedPhotolessPlaceIds.length > 0;
      if (!scheduleOn && (overDetails || overTextPhotos || overUnknownPlaceIds)) {
        const detail = [
          overDetails && `place_details_cache ขาด ${missingDetails.length} (เพดาน ${maxDetails})`,
          overTextPhotos && `place_photo_cache (searchText) ขาด ${missingPhotoTextKeys.length} (เพดาน ${maxTextPhotos})`,
          overUnknownPlaceIds && `place_photo_cache (place_id ที่ไม่รู้จัก) ${unexpectedPhotolessPlaceIds.length} ตัว`,
        ].filter(Boolean).join(" · ");
        expect(
          scheduleOn,
          `🟡 ตัวอุ่นปิดอยู่ตามที่ตั้งใจ (schedule ใน cache-warm.yml ยังไม่เปิด — รอผู้ใช้อนุมัติ) ` +
            `ไม่ใช่ตัวอุ่นพัง\n   เกินเพดานตอนนี้เพราะเหตุนี้: ${detail}\n   ` +
            `เพดานใช้ไม่ได้จนกว่า schedule จะเปิดจริง — อย่าไล่หาบั๊กในโค้ดตัวอุ่น/ตัวเลือกคีย์`,
        ).toBe(true);
        return;
      }

      expect(
        missingDetails.length,
        `${missingDetails.length} คีย์ยังไม่มีแถวใน place_details_cache (เพดาน ${maxDetails}) — ` +
          `ตัวอุ่นอาจไม่ได้ทำงาน หรือมีคลังใหม่เข้ามาเกินที่คาด (ถ้าเพิ่มคลังโดยตั้งใจ ขยับ ` +
          `CACHE_MAX_MISSING_DETAILS ขึ้นพร้อมกัน) ตัวอย่างคีย์: ${missingDetails.slice(0, 5).map((t) => t.key).join(", ")}`,
      ).toBeLessThanOrEqual(maxDetails);

      // 🔴 exact-match — จำนวนไม่เกี่ยว คีย์ `place_id:` ที่ไม่อยู่ใน KNOWN_PHOTOLESS_PLACE_ID_KEYS
      //    ต้องเป็น [] เสมอ ไม่ว่าจำนวนรวมจะเท่าเดิมหรือไม่ (ปิดช่องที่ P4 เตือน — P1 ชี้จุดที่โค้ดไม่ครอบ)
      expect(
        unexpectedPhotolessPlaceIds.map((t) => t.key),
        `พบคีย์ place_id: ที่ไม่มีรูป **นอกเหนือจาก ${KNOWN_PHOTOLESS_PLACE_ID_KEYS.size} ตัวที่ยืนยันแล้ว** — ` +
          `ต้องยิง Google Place Details ตรงยืนยันก่อนเพิ่มเข้า KNOWN_PHOTOLESS_PLACE_ID_KEYS ` +
          `(ห้ามเพิ่มเพราะ heartbeat แดงเฉยๆ)`,
      ).toEqual([]);

      expect(
        missingPhotoTextKeys.length,
        `${missingPhotoTextKeys.length} คีย์ (searchText) ยังไม่มีแถวใน place_photo_cache (เพดาน ${maxTextPhotos}) — ` +
          `ตัวอุ่นอาจไม่ได้ทำงาน หรือมีคลังใหม่เข้ามาเกินที่คาด (ถ้าเพิ่มคลังโดยตั้งใจ ขยับ ` +
          `CACHE_MAX_MISSING_TEXT_PHOTOS ขึ้นพร้อมกัน) ตัวอย่างคีย์: ${missingPhotoTextKeys.slice(0, 5).map((t) => t.key).join(", ")}`,
      ).toBeLessThanOrEqual(maxTextPhotos);

      // 🔴 ตัวเตือนว่าเพดานล้า — พลิกเองเมื่อขาดลดลงมาก (ตัวอุ่นเริ่มทำงาน) หน้าที่เดียวกับ `it.fails` เดิม
      //    ช่วง 20 เป็นค่าที่เลือกเอง ไม่ได้วัด — ปรับได้ ดูหัวไฟล์ · ไม่มีตัวเตือนคู่สำหรับ exact-match
      //    เพราะมันไม่มีแนวคิด "เพดานล้า" — มีแค่ "ตรงที่ยืนยันแล้ว" กับ "ไม่รู้จัก"
      expect(
        maxDetails - missingDetails.length,
        `เพดาน place_details_cache (${maxDetails}) ห่างจากของจริง (${missingDetails.length}) เกิน 20 — ` +
          `ตัวอุ่นน่าจะเริ่มทำงานแล้ว ลดเพดานลงได้ (แก้ CACHE_MAX_MISSING_DETAILS ใน cache-heartbeat.yml)`,
      ).toBeLessThan(20);
      expect(
        maxTextPhotos - missingPhotoTextKeys.length,
        `เพดาน place_photo_cache searchText (${maxTextPhotos}) ห่างจากของจริง (${missingPhotoTextKeys.length}) เกิน 20 — ` +
          `ตัวอุ่นน่าจะเริ่มทำงานแล้ว ลดเพดานลงได้ (แก้ CACHE_MAX_MISSING_TEXT_PHOTOS ใน cache-heartbeat.yml)`,
      ).toBeLessThan(20);
    });
  });
});
