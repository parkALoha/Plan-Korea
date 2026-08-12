import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PIN_COOKIE, expectedPinToken, pinTokenMatches } from "@/lib/pinAuth";

/**
 * ด่าน PIN ของทั้งเว็บ (เฟส 13.5)
 *
 * หมายเหตุเรื่องชื่อไฟล์: Next 16 **เลิกใช้ `middleware.ts` แล้ว** เปลี่ยนเป็น `proxy.ts` ที่ root
 * และ export ชื่อ `proxy` (ดู node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
 * ไฟล์นี้รันบน Node.js runtime เป็นค่าเริ่มต้น จึงใช้ `node:crypto` ใน lib/pinAuth.ts ได้ตรงๆ
 */

/**
 * เส้นทางที่ต้องเข้าได้เสมอ
 * - `/unlock`, `/api/unlock` — ไม่งั้นจะกรอก PIN ไม่ได้เลย (ไก่กับไข่)
 * - `/sw.js`, `/manifest.webmanifest` (เฟส 18) — เบราว์เซอร์ขอ 2 ไฟล์นี้แบบ **ไม่แนบคุกกี้**
 *   ถ้าโดนด่านดักจะได้ 307 ไปหน้า HTML แทนไฟล์จริง → ลงทะเบียน service worker ไม่ผ่าน
 *   และปุ่ม "เพิ่มลงหน้าจอโฮม" ไม่ขึ้น · ทั้งสองไฟล์ไม่มีข้อมูลทริปอยู่ข้างใน จึงเปิดสาธารณะได้
 * - `/api/keep-alive` (เฟส 25) — Vercel Cron ยิงมาโดยไม่มีคุกกี้ PIN ถ้าโดนดักจะได้ 401
 *   **ก่อนแตะ Supabase** = cron เขียวทุกวันแต่ DB ยังหลับ · route นั้นมีด่าน CRON_SECRET ของตัวเอง
 *   และไม่คืนข้อมูลทริปออกมาเลย (ตอบแค่ ok/เวลา)
 */
const PUBLIC_PATHS = [
  "/unlock",
  "/api/unlock",
  "/sw.js",
  "/manifest.webmanifest",
  "/api/keep-alive",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // ยังไม่ได้ตั้ง TRIP_PIN/TRIP_PIN_SECRET → ปล่อยผ่านทั้งหมด (เว็บทำงานเหมือนก่อนมีเฟส 13.5)
  //
  // จงใจเลือก "ปล่อยผ่าน" ไม่ใช่ "บล็อก" เพราะถ้าบล็อกแล้วลืมตั้ง env บน Vercel เว็บจะตายทั้งเว็บ
  // ซึ่งอันตรายกว่ามากตอนอยู่เกาหลีจริงแล้วเปิดหน้า /today ไม่ได้
  // ⚠️ แลกมาด้วยว่า **ถ้าไม่ตั้ง env บน Vercel production จะไม่มี PIN ป้องกันเลย** ต้องไปตั้งเอง
  if (!expectedPinToken()) {
    return NextResponse.next();
  }

  if (pinTokenMatches(req.cookies.get(PIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // API ตอบ 401 เป็น JSON ไม่ redirect — ฝั่ง client เป็น fetch/`<img>` การ redirect ไปหน้า HTML
  // จะทำให้ได้ response ที่ parse ไม่ออกแทนที่จะรู้ชัดๆ ว่าโดนล็อกอยู่
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  // จำหน้าที่ตั้งใจจะเข้าไว้ เพื่อพากลับไปหลังปลดล็อก (เช่นเปิดลิงก์ /today มาตรงๆ)
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // ต้องตัด `_next` ออก **ทั้งก้อน** ไม่ใช่แค่ _next/static กับ _next/image
  // (เคยเขียนแบบนั้นแล้วเจอของจริง: `/_next/hmr` โดนด่านนี้ดักไปด้วย → HMR ตอน dev พัง →
  //  React ไม่ hydrate → ฟอร์มกรอก PIN ตกไปเป็น native submit กดแล้วรีโหลดเฉยๆ ไม่มีอะไรเกิดขึ้น)
  // ตัด `_next` ทิ้งได้อย่างปลอดภัยเพราะข้อมูลของหน้าที่ต้องหวงเดินทางผ่าน URL ของหน้านั้นเอง
  // (RSC ยิงไปที่ path เดิมพ่วง `?_rsc=` ซึ่งยังเข้าด่านนี้อยู่) — ยืนยันแล้วว่า /today ยังเด้ง 307 ปกติ
  // ส่วนไฟล์รูป/ไอคอนใน public/ ตัดออกด้วย เผื่อ manifest กับไอคอน PWA ในเฟส 18
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
