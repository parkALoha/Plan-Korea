import { describe, expect, it } from "vitest";
import { matchesTripQuery, matchesTripTab } from "@/components/HomeScreen";

/**
 * เกณฑ์ของ **ตัวกรองหน้าแรก** — เจ้าของ: P2-UI/UX · 4 ก.ย. 2026
 *
 * ## ทำไมสองฟังก์ชันนี้ถูก `export` ออกมาจากคอมโพเนนต์
 * รีโปนี้ **ไม่มี `@testing-library/react`** ⇒ ตรรกะที่อยู่ใน closure ของคอมโพเนนต์
 * **ไม่มีเคสไหนไปถึงได้เลยถ้าไม่ render** (บทเรียนเดียวกับ `hooks/dayKeyMaps.ts` และ
 * `components/placeGrouping.ts` — ทั้งคู่ถูกแยกออกมาด้วยเหตุผลนี้เป๊ะ)
 * 🔴 **และการ export เฉย ๆ ไม่ได้แปลว่ามีเกณฑ์** — ไฟล์นี้คือครึ่งที่ทำให้การแยกนั้นมีความหมาย
 *
 * ## 🔴 ช่องที่ไฟล์นี้ปิดไม่ได้ และรู้ตัวว่าปิดไม่ได้
 * เกณฑ์ที่นี่ยืนยันว่า *ฟังก์ชันถูก* · **ไม่ได้ยืนยันว่า `HomeScreen` ยังเรียกมันอยู่**
 * ถ้าใครเปลี่ยนไปกรองอินไลน์ ไฟล์นี้จะยังเขียวทั้งใบ — เป็นของที่ *แลกไป* ตอนเลิกผูกกับซอร์ส
 * (ดูย่อหน้าเดียวกันที่ `lib/__tests__/placeGrouping.test.ts` · **ห้ามปิดด้วยการกลับไป `grep` ซอร์ส**)
 */
const trip = (title: string, cities: string[] = [], memberCount = 1, endDate = "2026-12-31") => ({
  title,
  end_date: endDate,
  memberCount,
  destinations: cities.map((c) => ({ nameTh: c, nameEn: c === "โตเกียว" ? "Tokyo" : c })),
});

describe("matchesTripQuery — ค้นชื่อทริป *และ* ชื่อจุดหมาย", () => {
  it("คำค้นว่าง = ผ่านทุกใบ (ไม่ใช่ไม่ผ่านสักใบ)", () => {
    expect(matchesTripQuery(trip("อะไรก็ได้"), "")).toBe(true);
    expect(matchesTripQuery(trip("อะไรก็ได้"), "   ")).toBe(true);
  });

  it("ตรงที่ชื่อทริป", () => {
    expect(matchesTripQuery(trip("เที่ยวเกาหลี"), "เกาหลี")).toBe(true);
  });

  it("🔴 ตรงที่ **ชื่อจุดหมาย** ทั้งที่ชื่อทริปไม่มีคำนั้นเลย — เคสที่คนใช้จริงที่สุด", () => {
    // คนไม่ได้จำชื่อที่ตัวเองตั้ง แต่จำว่า "ทริปไปโตเกียว"
    expect(matchesTripQuery(trip("E4-AC1 เที่ยวญี่ปุ่น", ["โตเกียว"]), "โตเกียว")).toBe(true);
  });

  it("ค้นด้วยชื่อภาษาอังกฤษของเมืองก็เจอ", () => {
    expect(matchesTripQuery(trip("ทริปหน้าร้อน", ["โตเกียว"]), "tokyo")).toBe(true);
    expect(matchesTripQuery(trip("ทริปหน้าร้อน", ["โตเกียว"]), "TOKYO")).toBe(true);
  });

  it("ตัดช่องว่างหัวท้าย — คนวางคำค้นจากที่อื่นแล้วติดเว้นวรรคมาเสมอ", () => {
    expect(matchesTripQuery(trip("เที่ยวเกาหลี"), "  เกาหลี  ")).toBe(true);
  });

  it("🔴 เคสควบคุม: คำที่ไม่ตรงอะไรเลย ต้อง **ไม่** ผ่าน — ไม่งั้นตัวกรองที่กว้างเกินจะดูเหมือนทำงาน", () => {
    expect(matchesTripQuery(trip("เที่ยวเกาหลี", ["ปูซาน"]), "zzzz")).toBe(false);
  });
});

describe("matchesTripTab — ตัดสินจากข้อมูลที่รายการทริปมีจริงเท่านั้น", () => {
  const TODAY = "2026-09-04";

  it("`all` ผ่านทุกใบ แม้ใบที่จบไปแล้ว", () => {
    expect(matchesTripTab(trip("เก่า", [], 1, "2020-01-01"), "all", TODAY)).toBe(true);
  });

  it("🔴 `upcoming` = **ยังไม่จบ** ไม่ใช่ **ยังไม่เริ่ม** — ทริปที่กำลังเที่ยวอยู่ต้องยังอยู่ในแท็บนี้", () => {
    expect(matchesTripTab(trip("กำลังเที่ยว", [], 1, "2026-09-10"), "upcoming", TODAY)).toBe(true);
    expect(matchesTripTab(trip("จบวันนี้พอดี", [], 1, TODAY), "upcoming", TODAY)).toBe(true);
    expect(matchesTripTab(trip("จบไปแล้ว", [], 1, "2026-09-03"), "upcoming", TODAY)).toBe(false);
  });

  it("`solo` = 1 คน · `group` = มากกว่า 1", () => {
    expect(matchesTripTab(trip("เดี่ยว", [], 1), "solo", TODAY)).toBe(true);
    expect(matchesTripTab(trip("เดี่ยว", [], 1), "group", TODAY)).toBe(false);
    expect(matchesTripTab(trip("กลุ่ม", [], 3), "group", TODAY)).toBe(true);
    expect(matchesTripTab(trip("กลุ่ม", [], 3), "solo", TODAY)).toBe(false);
  });

  it("🔴 `memberCount === 0` แปลว่า **อ่านไม่ได้** ไม่ใช่ **ไม่มีคน** — ต้องไม่ถูกจัดเข้าหมวดใดเลย", () => {
    // ทุกทริปมีเจ้าของอย่างน้อย 1 คนเสมอ · `0` = อ่าน `trip_members` ไม่ได้ (เขียนไว้ที่ `TripCard`)
    // จัดเข้า `solo` = เดาแทนผู้ใช้ · จัดเข้า `group` = เดาผิดทางตรงข้าม ⇒ ให้ตกอยู่ใน `all` อย่างเดียว
    const unknown = trip("อ่านสมาชิกไม่ได้", [], 0);
    expect(matchesTripTab(unknown, "solo", TODAY)).toBe(false);
    expect(matchesTripTab(unknown, "group", TODAY)).toBe(false);
    expect(matchesTripTab(unknown, "all", TODAY)).toBe(true);
  });

  it("🔴 `todayIso` ว่าง (ก่อน hydrate) — `upcoming` ต้องไม่กรองใครทิ้ง", () => {
    // หน้านี้ถูก prerender ⇒ เฟรมแรก `todayIso === ""` · `"" <= end_date` เป็นจริงเสมอ
    // ⇒ ผู้ใช้เห็นทริปครบก่อน แล้วค่อยกรองจริงหลัง hydrate — **ดีกว่าเห็นหน้าว่างแล้วของโผล่ทีหลัง**
    expect(matchesTripTab(trip("จบไปแล้ว", [], 1, "2020-01-01"), "upcoming", "")).toBe(true);
  });
});
