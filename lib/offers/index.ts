import "server-only";
import type { OfferProvider, OfferQuery, OfferResult } from "./types";

export type { Offer, OfferKind, OfferQuery, OfferResult, Money } from "./types";

/**
 * เลือกผู้ให้บริการราคาจาก env — **จุดเดียวที่ตัดสินว่าวันนี้มีราคาหรือไม่มี**
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## สภาพวันนี้: ไม่มีผู้ให้บริการสักเจ้า และนั่นถูกต้อง
 * ผู้ใช้เลือกเอง 4 ก.ย. 2026 ว่า **"ทำช่องไว้ก่อน ยังไม่ต่อจริง"**
 * เพราะการต่อจริงคือการ **สมัครบัญชีกับบริษัทภายนอกในนามเขา** ซึ่งเป็นการตัดสินใจของเขาคนเดียว
 * ⇒ ไฟล์นี้จึงคืน `unconfigured` เสมอจนกว่าจะมี `OFFERS_PROVIDER` + คีย์
 *
 * ## 🔴 `server-only` ไม่ใช่พิธีกรรม
 * คีย์ affiliate เป็นความลับเชิงพาณิชย์ (ใครถือก็เคลมค่าคอมของเราได้)
 * บรรทัดแรกทำให้ **`npm run build` แดง** ถ้ามีใครเผลอ import ไฟล์นี้จากคอมโพเนนต์ไคลเอนต์
 * · 🎯 ด่านนี้บังคับที่ `build` เท่านั้น — `vitest` กับ `tsc` ไม่จับ (`TEAM.md §3.3`)
 *
 * ## วันที่จะต่อจริง — สิ่งที่ต้องทำมีเท่านี้
 * ① เขียนไฟล์ `lib/offers/<ชื่อเจ้า>.ts` ที่ `implements OfferProvider`
 * ② เพิ่มหนึ่งบรรทัดใน `PROVIDERS`
 * ③ ตั้ง `OFFERS_PROVIDER=<ชื่อ>` + คีย์ใน env
 * **ไม่ต้องแตะ UI ไม่ต้องแตะ route** — นั่นคือเหตุผลที่ชั้นนี้มีอยู่ทั้งที่ยังไม่มีใครใช้
 * · 📌 ตัวเลือกที่ค้นไว้แล้ว (`~/.claude/plans/merry-orbiting-globe.md`): Travelpayouts (สมัครฟรี
 *   ไม่มีขั้นต่ำทราฟฟิก) · Agoda Partners (ค่าคอมสูงกว่า ต้องยื่น certification) · Booking.com
 */
const PROVIDERS: Record<string, () => OfferProvider> = {
  // ยังว่างโดยตั้งใจ — ดูหัวไฟล์
};

function selectProvider(): OfferProvider | null {
  const name = process.env.OFFERS_PROVIDER?.trim();
  if (!name) return null;
  const make = PROVIDERS[name];
  if (!make) {
    // 🔴 ตั้ง env ผิดชื่อ = **เงียบแล้วผู้ใช้ไม่เห็นราคาตลอดไป** โดยไม่มีอะไรบอกว่าทำไม
    //    เป็นตระกูลเดียวกับ `cacheGuard` ที่ดังครั้งเดียวต่อโปรเซสแล้วถูกมองข้ามทั้งวัน
    console.error(`[offers] ไม่รู้จัก OFFERS_PROVIDER="${name}" — รู้จัก: ${Object.keys(PROVIDERS).join(", ") || "(ยังไม่มีสักเจ้า)"}`);
    return null;
  }
  return make();
}

/**
 * ถามราคา — **ไม่โยน** · ทุกความล้มเหลวกลายเป็นสถานะที่ UI แสดงได้
 *
 * 🔴 ราคาเป็น *ของเสริม* ของหน้าวางแผน ไม่ใช่แกนของมัน
 * ผู้ให้บริการล่ม **ต้องไม่ทำให้ผู้ใช้เลือกที่พักไม่ได้** — เขายังพิมพ์ชื่อโรงแรมเองได้เสมอ
 * (ทางนั้นมีมาตั้งแต่ต้นที่ `components/HotelEditModal.tsx`) ⇒ ล้มแล้วต้องล้มเงียบ ๆ ในกล่องของตัวเอง
 */
export async function fetchOffers(q: OfferQuery): Promise<OfferResult> {
  const provider = selectProvider();
  if (!provider) return { state: "unconfigured" };

  try {
    const offers = await provider.search(q);
    if (offers.length === 0) return { state: "empty", provider: provider.name };

    // 🔴 ด่านสุดท้ายก่อนตัวเลขเงินถึงผู้ใช้ — ผู้ให้บริการที่คืนราคาพิกลต้องถูกตัดทิ้ง ไม่ใช่ส่งต่อ
    //    `NaN`/`Infinity` เรนเดอร์ออกมาเป็น "NaN บาท" ซึ่งอ่านเหมือนเว็บพัง · ค่าติดลบอ่านเหมือนส่วนลด
    //    ⚠️ ตัดเฉพาะ *ราคา* ไม่ตัดทั้งใบ — ที่พักที่ไม่มีราคายังมีประโยชน์ (ชื่อ · เรตติ้ง · พิกัด)
    const clean = offers.map((o) =>
      o.price && (!Number.isFinite(o.price.amount) || o.price.amount < 0)
        ? { ...o, price: null }
        : o,
    );
    return { state: "ok", offers: clean, provider: provider.name };
  } catch (e) {
    return {
      state: "error",
      message: e instanceof Error ? e.message : "ถามราคาไม่สำเร็จ",
      provider: provider.name,
    };
  }
}
