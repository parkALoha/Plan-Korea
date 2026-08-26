import { describe, expect, it } from "vitest";
import { isImageAttachment, safeHttpUrl } from "@/lib/url";

/**
 * `lib/url.ts` — **ด่านความปลอดภัยที่ไม่มีเทสต์เลยจนถึง 27 ส.ค. 2026** (P1)
 *
 * คอมเมนต์ในไฟล์เขียนไว้เองว่า *"กัน `javascript:`/`data:` URL ที่แอบพิมพ์ลงช่อง 'ลิงก์'
 * (RLS เปิดสาธารณะ ใครก็เขียนลงได้) ไม่ให้ใช้เป็น href ตรง ๆ"*
 *
 * 🔴 **ด่านที่ไม่มีเทสต์ กับด่านที่ถูกถอดออกไปแล้ว แยกไม่ออกจากภายนอก**
 * ถ้าวันหนึ่งมีคน "ทำให้ง่ายขึ้น" เป็น `return url ?? null` **จะไม่มีอะไรดังเลย**
 * และค่าที่ผ่านเข้ามาจะกลายเป็น `href` ที่รันสคริปต์ในเบราว์เซอร์ของเจ้าของทริป
 */
describe("safeHttpUrl — ปล่อยเฉพาะ http/https", () => {
  it("ปล่อย http และ https", () => {
    expect(safeHttpUrl("https://naver.com/x")).toBe("https://naver.com/x");
    expect(safeHttpUrl("http://map.kakao.com/link/to/a,1,2")).toBe("http://map.kakao.com/link/to/a,1,2");
  });

  it("🔴 บล็อก `javascript:` ทุกรูปแบบที่เบราว์เซอร์ยังรัน", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",       // โปรโตคอลไม่สนตัวพิมพ์
      "JAVASCRIPT:alert(1)",
      "  javascript:alert(1)",     // `new URL` ตัดช่องว่างหน้าให้ — ถ้าเช็คด้วย startsWith จะหลุด
      "\tjavascript:alert(1)",
      "javascript:void(document.cookie)",
    ]) {
      expect(safeHttpUrl(bad), bad).toBeNull();
    }
  });

  it("🔴 บล็อก `data:` — ใช้ฝัง HTML ทั้งหน้าได้", () => {
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
  });

  it("บล็อกโปรโตคอลอื่นที่ไม่ใช่เว็บ", () => {
    for (const bad of [
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://x.com/abc",
      "ftp://x.com/a",
      "nmap://route/public?dlat=1",  // แม้แต่ของเราเองก็ไม่ใช่ href ที่ปลอดภัยจากข้อมูลผู้ใช้
    ]) {
      expect(safeHttpUrl(bad), bad).toBeNull();
    }
  });

  it("สตริงที่ไม่ใช่ URL → `null` ไม่ใช่โยน", () => {
    // ⚠️ ถ้าโยน หน้าจะพังทั้งหน้าเพราะข้อมูลเดียวที่พิมพ์มั่ว
    for (const bad of ["", "   ", "ไม่ใช่ลิงก์", "//evil.com", "://x", "http://"]) {
      expect(safeHttpUrl(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("`null`/`undefined` → `null`", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("isImageAttachment — ตั๋วรับทั้งรูปและ PDF ในช่องเดียว", () => {
  it("ดูชื่อไฟล์ก่อนเสมอ (ชื่อจริงจากเครื่องผู้ใช้)", () => {
    expect(isImageAttachment("ticket.jpg", null)).toBe(true);
    expect(isImageAttachment("ticket.PNG", null)).toBe(true);
    expect(isImageAttachment("ticket.pdf", null)).toBe(false);
    expect(isImageAttachment("ตั๋วเครื่องบิน.heic", null)).toBe(true);
  });

  it("🔴 ชื่อไฟล์มาก่อน URL — แม้ URL จะดูเหมือนรูป", () => {
    // ถ้าสลับลำดับ ไฟล์ PDF ที่ path มี `.jpg` อยู่ข้างใน จะถูก render เป็น <img> แล้วพัง
    expect(isImageAttachment("ticket.pdf", "https://x.co/a/photo.jpg")).toBe(false);
  });

  it("ไม่มีชื่อไฟล์ (แถวเก่า) → ตกไปดู path ของ URL", () => {
    expect(isImageAttachment(null, "https://x.co/storage/abc-ticket.jpeg")).toBe(true);
    expect(isImageAttachment(null, "https://x.co/storage/abc-ticket.pdf")).toBe(false);
  });

  it("🔴 query string ที่มี `.jpg` ต้องไม่ทำให้ PDF กลายเป็นรูป", () => {
    // ใช้ `new URL(...).pathname` โดยตั้งใจ — ไม่ใช่ทดสอบทั้งสตริง
    expect(isImageAttachment(null, "https://x.co/a/file.pdf?thumb=cover.jpg")).toBe(false);
    // และนามสกุลที่จบด้วย `?`/`#` บน path ยังนับเป็นรูป
    expect(isImageAttachment(null, "https://x.co/a/file.jpg?token=1")).toBe(true);
    expect(isImageAttachment(null, "https://x.co/a/file.webp#p1")).toBe(true);
  });

  it("URL พังหรือไม่มีเลย → `false` ไม่ใช่โยน", () => {
    expect(isImageAttachment(null, "ไม่ใช่ลิงก์")).toBe(false);
    expect(isImageAttachment(null, null)).toBe(false);
    expect(isImageAttachment(undefined, undefined)).toBe(false);
  });

  it("นามสกุลที่ *อยู่กลางชื่อ* ไม่นับ", () => {
    expect(isImageAttachment("my.jpg.pdf", null)).toBe(false);
    expect(isImageAttachment("report.png.txt", null)).toBe(false);
  });
});
