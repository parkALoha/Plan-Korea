import type { WarmTarget } from "./cacheWarmList";

/**
 * **`Q3` ก้าวที่ 2 — ตัวเขียนแคช** · P1 · 3 ก.ย. 2026
 *
 * ## 🔴 กติกาข้อเดียวที่สำคัญที่สุดในไฟล์นี้
 * ***ตรวจบัญชีขาวซ้ำ ณ จังหวะก่อนเขียน — ห้ามเชื่อว่ารายการที่ได้มาจากคลังแล้วปลอดภัย***
 * · ตัวเขียนถือ `service_role` ซึ่งมี **`BYPASSRLS`** ⇒ **ไม่มี policy ใดขวางมันได้เลย**
 *   `grant` คือด่านสุดท้ายที่เหลือของตารางนั้น · **การตรวจในโค้ดนี้จึงเป็นด่าน ไม่ใช่มารยาท**
 * · ⚠️ **ต่างจาก `route`** ที่รันด้วยตัวตนผู้ใช้ (RLS บังคับอยู่แล้ว) — ที่นั่นการตรวจเป็นมารยาท ที่นี่ไม่ใช่
 * 🎯 **และรายการที่ได้มาจากคลัง *ไม่ใช่* หลักฐานว่าคีย์ยังสาธารณะอยู่ ณ วินาทีที่เขียน** —
 *    ระหว่างที่ยิง Google 141 ครั้ง (กินเวลาเป็นนาที) คลังอาจถูกแก้ · **ช่องกว้างพอที่จะเป็นช่องจริง**
 *
 * ## กติกาที่เหลือ
 * · Google ล้มที่คีย์หนึ่ง → **ข้ามคีย์นั้น ไม่ล้มทั้งรอบ** (ไม่งั้นคีย์เสียหนึ่งตัวบล็อกการอุ่นตลอดกาล)
 * · ตรวจบัญชีขาวล้ม (ฐานมีปัญหา) → **ไม่เขียนอะไรเลย** fail-closed
 * · **ไม่เขียนทับของเดิม** — `warmTargets()` คัดเฉพาะคีย์ที่ยังไม่มีแถวอยู่แล้ว
 *   🔴 การรีเฟรชของเก่าเป็นคนละเรื่องและ **ยังไม่มีมติ** (ต้องมี TTL ก่อน · ดู `README § Q3`)
 */
export type WarmRow = {
  maps_query: string;
  google_place_id: string | null;
  opening_hours: unknown;
  rating: number | null;
  user_rating_count: number | null;
  primary_type: string | null;
  reviews: unknown;
};

export type WarmDeps = {
  /** ดึงของสดจาก Google · คืน `null` เมื่อดึงไม่ได้ — ผู้เรียกเป็นคนใส่ `lookupPlace` */
  fetchOne: (key: string) => Promise<WarmRow | null>;
  /** ถามคลังว่าคีย์ไหน "ยังสาธารณะอยู่" — ผู้เรียกใส่ `catalogPublicMapsQueries` · คืน `null` = ถามไม่ได้ */
  verifyPublic: (keys: string[]) => Promise<Set<string> | null>;
  /** เขียนลงตารางแคช · คืนจำนวนที่เขียนสำเร็จ หรือ `null` เมื่อเขียนไม่ได้ */
  writeRows: (rows: WarmRow[]) => Promise<number | null>;
};

export type WarmReport = {
  attempted: number;
  written: number;
  /** คีย์ที่หลุดบัญชีขาวตอนตรวจซ้ำ — **ตัวเลขนี้ควรเป็น 0 เสมอ ถ้าไม่ใช่ มีคนแก้คลังระหว่างรอบ** */
  droppedNotPublic: number;
  /** Google ดึงไม่ได้ */
  fetchFailed: number;
  /** ตรวจบัญชีขาวไม่ได้ หรือเขียนไม่ได้ → ไม่เขียนอะไรเลย */
  aborted: null | "verify-failed" | "write-failed";
};

export async function warmCache(
  targets: readonly WarmTarget[],
  deps: WarmDeps,
): Promise<WarmReport> {
  const report: WarmReport = {
    attempted: targets.length,
    written: 0,
    droppedNotPublic: 0,
    fetchFailed: 0,
    aborted: null,
  };
  if (targets.length === 0) return report;

  const fetched: WarmRow[] = [];
  for (const t of targets) {
    const row = await deps.fetchOne(t.key);
    if (!row) {
      report.fetchFailed += 1;
      continue;                       // คีย์เดียวเสีย ไม่ล้มทั้งรอบ
    }
    fetched.push(row);
  }
  if (fetched.length === 0) return report;

  // 🔴 **ตรวจบัญชีขาวซ้ำที่นี่ ไม่ใช่ตอนเลือกเป้า** — ดูเหตุผลในหัวไฟล์
  const stillPublic = await deps.verifyPublic(fetched.map((r) => r.maps_query));
  if (stillPublic === null) {
    report.aborted = "verify-failed";
    return report;                    // fail-closed: ถามคลังไม่ได้ = ไม่เขียน
  }

  const allowed = fetched.filter((r) => stillPublic.has(r.maps_query));
  report.droppedNotPublic = fetched.length - allowed.length;
  if (allowed.length === 0) return report;

  const n = await deps.writeRows(allowed);
  if (n === null) {
    report.aborted = "write-failed";
    return report;
  }
  report.written = n;
  return report;
}
