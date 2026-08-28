/**
 * `hydrateThenFetch` — ลำดับ *อ่านจากเครื่อง → ยิงของสด → ทับ* ที่ทนการแข่งกัน · `E6-AC7`
 * เจ้าของ: P7-Mobile · 28 ส.ค. 2026
 *
 * ## 🔴 ทำไมต้องแยกออกมาเป็นฟังก์ชัน แทนที่จะอยู่ใน hook
 * **รีโปนี้ไม่มี `@testing-library/react`** — ตรรกะที่อยู่ในตัว hook ล้วน **พิสูจน์ไม่ได้เลย**
 * · P3 เจอข้อจำกัดเดียวกันแล้วแยก `classifyLegacyDayPlan()` ออกมาด้วยเหตุผลนี้เป๊ะ
 * · 🎯 **และการแข่งกันคือกิ่งที่ *เหตุผลถูกแล้วยังพลาดได้บ่อยที่สุด*** เพราะมันขึ้นกับจังหวะจริง ไม่ใช่ตรรกะ
 *   → ถ้าไม่แยก เราจะมีแต่ *คำอธิบายว่าทำไมมันถูก* ไม่มี *หลักฐานว่ามันถูก* (P1 ชี้)
 *
 * ## สิ่งที่มันบังคับ — และทำไม `localStorage` ไม่เคยต้องการมัน
 * `localStorage` อ่านแบบ sync → hydrate เสร็จ **ก่อน** ยิงเน็ตเสมอ · ลำดับมาฟรี
 * 🔴 **IndexedDB อ่าน async → ของสดมาถึงก่อนการอ่านแคชเสร็จได้** → เอาแคชทับทีหลัง = **ทับของใหม่ด้วยของเก่า**
 * · เครื่องที่เจอบ่อยที่สุดคือ **เน็ตเร็ว + ดิสก์ช้า** ซึ่งเป็นเครื่องปกติ ไม่ใช่เคสขอบ
 *
 * ## กติกา 3 ข้อ
 * ① **ยิงของสดทันที ไม่รอแคช** — รอแคชก่อนคือการเพิ่มเวลาให้ทุกคนเพื่อกันเคสของบางคน
 * ② **ใส่แคชก็ต่อเมื่อของสดยังไม่มา** (`fresh`)
 * ③ **ขึ้น error ก็ต่อเมื่อไม่มีของในเครื่องเลย** — มีแคชแล้วยิงล้ม = ผู้ใช้ควรได้เห็นของเก่า ไม่ใช่หน้าจอ error
 */
export type HydrateThenFetch<T> = {
  /** อ่านจากที่เก็บในเครื่อง · `null` = ไม่มี */
  readCache: () => Promise<T | null>;
  /** ยิงของสด · **โยนเมื่อล้ม** (รวมกรณี HTTP ไม่ 2xx) */
  fetchFresh: () => Promise<T>;
  /** เก็บของสดลงเครื่อง · คืน `false` = เขียนไม่ลง · เรียก **หลัง** `applyFresh` เพื่อไม่ให้การเขียนหน่วงจอ */
  writeCache?: (value: T) => Promise<boolean>;
  /** เขียนแคชไม่ลง — **ผู้เรียกต้องตัดสินใจ ไม่ใช่กลืนเงียบ** */
  onWriteFailed?: () => void;
  applyCache: (value: T) => void;
  applyFresh: (value: T) => void;
  applyError: () => void;
  /** effect ถูกยกเลิกแล้วหรือยัง — ตรวจก่อน `setState` ทุกครั้ง */
  isCancelled: () => boolean;
};

/** ผลลัพธ์ — มีไว้ให้เทสต์ยืนยันเส้นทางที่เดินจริง ไม่ใช่แค่ผลข้างเคียง */
export type HydrateOutcome = "fresh" | "cache-only" | "error" | "cancelled";

export async function hydrateThenFetch<T>(a: HydrateThenFetch<T>): Promise<HydrateOutcome> {
  let fresh = false;

  // ① ยิงทันที — ไม่ `await` ก่อนอ่านแคช
  const net: Promise<"ok" | "fail" | "cancelled"> = (async () => {
    try {
      const value = await a.fetchFresh();
      if (a.isCancelled()) return "cancelled";
      fresh = true;
      a.applyFresh(value);
      if (a.writeCache && !(await a.writeCache(value))) a.onWriteFailed?.();
      return "ok";
    } catch {
      return "fail";
    }
  })();

  const cached = await a.readCache().catch(() => null);
  // ② แคชทับได้เฉพาะตอนของสดยังไม่มา
  if (cached !== null && !a.isCancelled() && !fresh) a.applyCache(cached);

  const outcome = await net;
  if (outcome === "cancelled" || a.isCancelled()) return "cancelled";
  if (outcome === "ok") return "fresh";
  // ③ ล้มแล้วมีของในเครื่อง = ใช้ของนั้นต่อ ไม่ทับด้วยหน้าจอ error
  if (cached !== null) return "cache-only";
  a.applyError();
  return "error";
}
