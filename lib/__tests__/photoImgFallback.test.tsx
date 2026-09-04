// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { PhotoImg } from "@/components/PhotoImg";

/**
 * **รูปสถานที่ที่โหลดไม่ได้ ต้องกลายเป็นไทล์ ไม่ใช่ไอคอนรูปแตก** — เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## ที่มา — ผู้ใช้รายงานเอง ไม่ใช่เราไปเจอ
 * *"ภาพสถานที่ บางที่มันฉีกขาดไปแล้ว"* · ไล่แล้วพบว่า `PlaceThumb`/`PlaceCard`/`PhotoGallery`
 * มีทางลงครบสองทาง (กำลังโหลด · ไม่มีรูป) **แต่ไม่มีทางลงสำหรับ "มีรูปแต่โหลดไม่ได้"**
 * ⇒ `/api/place-photo` คืน JSON 502 ให้ `<img>` → เบราว์เซอร์วาดไอคอนรูปแตก
 *
 * 🔴 **เคส ③ คือใบที่ผมกลัวที่สุด และเป็นเหตุผลที่เก็บ `src` แทน `boolean`**
 * รายการสถานที่ใช้ตำแหน่ง DOM ซ้ำตอน re-render — ถ้าเก็บสถานะล้มเป็น `boolean`
 * **สถานที่ใบใหม่จะรับสถานะล้มของใบเก่ามา แล้วไม่มีวันลองโหลดเลย**
 * · อาการที่ผู้ใช้เห็น: *"เลื่อนแล้วบางรูปหายไปเฉย ๆ"* ซึ่งอ่านไม่ออกเลยว่ามาจากตรงนี้
 * · 🎯 **และมันจะไม่โผล่ในเคส ①② เพราะทั้งคู่ทดสอบ `src` เดียว** — บั๊กอยู่ที่การ *เปลี่ยน* `src`
 */
afterEach(cleanup);

const FALLBACK = <div data-testid="fallback">ไทล์สำรอง</div>;

describe("PhotoImg — ทางลงเมื่อรูปโหลดไม่ได้", () => {
  /**
   * ✅ **ทิศบวกต้องมาก่อน** — ถ้ารูปไม่เคยถูกเรนเดอร์เลย เคส ② จะเขียวโดยไม่ได้พิสูจน์อะไร
   * (`TEAM.md` — *"การแก้ไม่เกิด" กับ "เคสไม่เคยถูกรัน" อ่านเหมือนกันเป๊ะ*)
   */
  it("① ทิศบวก — ปกติต้องเรนเดอร์ `<img>` จริง ไม่ใช่ไทล์", () => {
    const { container } = render(<PhotoImg src="/api/place-photo?name=a&w=160" fallback={FALLBACK} />);
    expect(container.querySelector("img"), "ไม่มี <img> เลย — เคส ② จะพิสูจน์อะไรไม่ได้").not.toBeNull();
    expect(screen.queryByTestId("fallback")).toBeNull();
  });

  it("🔴 ② ยิง error ใส่รูป → ต้องเหลือไทล์ และ `<img>` ต้องหายไป", () => {
    const { container } = render(<PhotoImg src="/api/place-photo?name=a&w=160" fallback={FALLBACK} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);

    expect(screen.queryByTestId("fallback"), "รูปล้มแล้วไม่มีไทล์ขึ้นมาแทน").not.toBeNull();
    // 🔴 ต้องเช็คว่า `<img>` **หายไป** ด้วย — ถ้ามันยังอยู่ ไอคอนรูปแตกก็ยังอยู่
    //    ไทล์ที่ขึ้นมา *ทับ* ไม่ได้แปลว่ารูปแตกหายไป
    expect(container.querySelector("img"), "ยังมี <img> ค้าง — ไอคอนรูปแตกจะยังโชว์อยู่").toBeNull();
  });

  it("🔴 ③ เปลี่ยน `src` หลังใบก่อนล้ม → ต้องกลับมาลองโหลดใหม่ ไม่ใช่ค้างเป็นไทล์", () => {
    const { container, rerender } = render(
      <PhotoImg src="/api/place-photo?name=เก่า&w=160" fallback={FALLBACK} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img"), "เตรียมเคส: ใบเก่าต้องล้มจริงก่อน").toBeNull();

    // ตำแหน่ง DOM เดิม แต่คนละสถานที่ — ไม่มี `key` ช่วย เพราะผู้เรียกไม่ต้องใส่
    rerender(<PhotoImg src="/api/place-photo?name=ใหม่&w=160" fallback={FALLBACK} />);

    const next = container.querySelector("img");
    expect(
      next,
      "🔴 สถานที่ใบใหม่รับสถานะล้มของใบเก่ามา — **จะไม่มีวันลองโหลดเลย** " +
        "(อาการ: เลื่อนรายการแล้วบางรูปหายเฉย ๆ) · เก็บ `src` ที่ล้ม อย่าเก็บ boolean",
    ).not.toBeNull();
    expect(next!.getAttribute("src")).toContain("ใหม่");
  });

  /**
   * 🔴 **เคสนี้ตรึงพฤติกรรมที่ผมเขียนผิดในรอบแรก — และเทสต์เป็นตัวจับ ไม่ใช่ผม**
   * ฉบับแรกผม assert ว่า *"กลับมาใบเดิมต้องลองโหลดใหม่"* โดยเขียนจากแบบจำลองในหัว
   * **ไม่ได้อ่านโค้ดที่ตัวเองเพิ่งเขียน** · ของจริง `failedSrc` เปลี่ยนเมื่อมี error ใบใหม่เท่านั้น
   * ⇒ กลับมาที่ `src` ที่เคยล้ม **ยังเป็นไทล์** จนกว่าคอมโพเนนต์จะถูก unmount
   *
   * 🎯 ***คำคาดหวังที่เขียนจากความจำว่าโค้ดทำอะไร กับที่เขียนจากการอ่านโค้ด หน้าตาเหมือนกันในไฟล์เทสต์***
   *    — และรอบนี้แดงเพราะโค้ดถูก ไม่ใช่เพราะโค้ดผิด
   *
   * ✅ **และพฤติกรรมจริงดีกว่าที่ผมคิดไว้**: ไม่ลองซ้ำใบที่รู้ว่าล้ม ⇒ ไม่มีลูปยิงคำขอเปล่า
   *    ผู้ใช้ได้ลองใหม่ตอนเปิดหน้าใหม่ (state รีเซ็ตตอน unmount) ซึ่งเป็นจังหวะที่เหตุชั่วคราวมักหายแล้ว
   * ⚠️ ถ้าวันหนึ่งเปลี่ยนไปลองซ้ำ **เคสนี้จะแดง แล้วต้องมาตัดสินใหม่ ไม่ใช่แก้ให้ผ่านเงียบ ๆ**
   */
  it("④ กลับมาที่ `src` ที่เคยล้ม → ยังเป็นไทล์ ไม่ยิงซ้ำ", () => {
    const { container, rerender } = render(<PhotoImg src="/x?a" fallback={FALLBACK} />);
    fireEvent.error(container.querySelector("img")!);

    rerender(<PhotoImg src="/x?b" fallback={FALLBACK} />);
    expect(container.querySelector("img"), "เตรียมเคส: `src` ใบใหม่ต้องได้ลองโหลด").not.toBeNull();

    rerender(<PhotoImg src="/x?a" fallback={FALLBACK} />);
    expect(
      container.querySelector("img"),
      "กลับมาใบที่เคยล้มแล้วยิงซ้ำ — พฤติกรรมเปลี่ยนไปจากที่ตรึงไว้ อ่านคอมเมนต์ก่อนแก้",
    ).toBeNull();
    expect(screen.queryByTestId("fallback")).not.toBeNull();
  });
});
