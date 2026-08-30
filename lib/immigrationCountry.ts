import { COUNTRY_NAME_EN, COUNTRY_NAME_TH, countryOfCitySlug, type CountryCode } from "@/data/emergency";

/**
 * ประเทศที่เอกสาร ตม. (`ImmigrationSheet`) เป็นของ — **ฟังก์ชันบริสุทธิ์ แยกออกจากหน้าเพื่อให้ทดสอบได้**
 * (รูปเดียวกับ `lib/engine/legacyDayPlan.ts` — ตรรกะที่อยู่ในไฟล์หน้าเว็บ ยิงเคสไม่ได้จริง)
 *
 * ## เกณฑ์: ประเทศที่มีจำนวนวันมากที่สุดในทริป
 * เอกสารใบเดียวเป็นของประเทศเดียว (P1 · 27 ส.ค. 2026) · ชีตเขียนชื่อประเทศที่เลือกไว้บนหัวเอง
 * เจ้าหน้าที่จึงไม่มีทางอ่านผิดประเทศแบบไม่รู้ตัว — **มติเดิม ไม่เปลี่ยน**
 *
 * ## 🔴 สามผลลัพธ์ ไม่ใช่สอง — และตัวที่สามคือของที่เพิ่งเพิ่ม
 * · `ok`   เลือกได้ → แสดงชีต
 * · `none` **ไม่รู้จักประเทศของวันไหนเลย** → ไม่แสดง (เดิมค่าเริ่มต้นเป็น `"kr"` ซึ่งปลอดภัย
 *          เฉพาะตอนต้นทางเป็นไฟล์ทริปเกาหลี · หลัง `B6` ต้นทางเป็นทริปอะไรก็ได้)
 * · `tie`  🔴 **เสมอกัน** → ไม่แสดง **แต่ต้องบอกผู้ใช้ว่าทำไม** (P1 · 30 ส.ค. 2026)
 *
 * 🎯 **ทำไม `tie` ต้องแยกจาก `none`: ถ้ายุบเป็น `null` เหมือนกัน เราจะเปลี่ยน *เดาผิด 50%*
 *    เป็น *หายเงียบ 100%*** ซึ่งเป็นการแลกที่ต้องตั้งใจ ไม่ใช่ผลข้างเคียง (P3 เสนอ · P1 รับ)
 * · ⚠️ เดิมโค้ดใช้ `days > winnerDays` → **เสมอแล้วตัวแรกใน `Map` ชนะ = ลำดับวันแรกชนะ** เงียบ ๆ
 *   ทริป 5 วันเกาหลี / 5 วันญี่ปุ่น จะได้ชีตของประเทศที่วันแรกอยู่ โดยไม่มีอะไรฟ้อง (P1 จับได้)
 */
export type ImmigrationPick =
  | { kind: "ok"; code: CountryCode; nameEn: string; nameTh: string }
  | { kind: "none" }
  | { kind: "tie" };

export function immigrationCountryOf(days: readonly { city: string | null | undefined }[]): ImmigrationPick {
  const dayCountByCountry = new Map<CountryCode, number>();
  for (const day of days) {
    // 🔴 `countryOfCitySlug` คืน `null` เมื่อไม่รู้จัก — ข้ามวันนั้น แทนที่จะนับ `undefined` เป็นประเทศหนึ่ง
    const country = countryOfCitySlug(day.city);
    if (!country) continue;
    dayCountByCountry.set(country, (dayCountByCountry.get(country) ?? 0) + 1);
  }
  if (dayCountByCountry.size === 0) return { kind: "none" };

  let winner: CountryCode | null = null;
  let winnerDays = -1;
  let tied = false;
  for (const [country, days] of dayCountByCountry) {
    if (days > winnerDays) {
      winner = country;
      winnerDays = days;
      tied = false;
    } else if (days === winnerDays) {
      // 🔴 เสมอกับผู้นำปัจจุบัน — ไม่ล้างธงจนกว่าจะมีใครแซงจริง
      tied = true;
    }
  }
  if (!winner) return { kind: "none" };
  if (tied) return { kind: "tie" };
  return { kind: "ok", code: winner, nameEn: COUNTRY_NAME_EN[winner], nameTh: COUNTRY_NAME_TH[winner] };
}
