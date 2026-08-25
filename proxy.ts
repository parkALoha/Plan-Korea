import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshSession, withSessionCookies } from "@/lib/auth/proxySession";

/**
 * ด่าน session ของทั้งเว็บ — `E1-AC6` (แทนที่ด่าน PIN ของเฟส 13.5 เมื่อ 25 ส.ค. 2026)
 *
 * 🔴 **`/unlock` กับโมดูล PIN เดิม ถูกลบทั้งหมดแล้ว** · สิทธิ์มาจาก `trip_members` ไม่ใช่ความลับร่วม
 * · PIN เป็นความลับ **ก้อนเดียวที่ทุกคนใช้ร่วมกัน** — แยกไม่ออกว่าใครเป็นใคร และถอนคืนทีละคนไม่ได้
 * · ⚠️ และมันไม่เคยกัน Supabase เลย (โมดูลนั้นเขียนขอบเขตตัวเองไว้ · พิสูจน์ด้วย curl 11 ส.ค. 2026)
 *   **ด่านจริงของข้อมูลคือ RLS** ซึ่งเมทริกซ์ 73 เคสยืนยันแล้ว · ด่านนี้เป็นชั้นหน้า ไม่ใช่ชั้นเดียว
 *
 * หมายเหตุเรื่องชื่อไฟล์: Next 16 **เลิกใช้ `middleware.ts` แล้ว** เปลี่ยนเป็น `proxy.ts` ที่ root
 * และ export ชื่อ `proxy` (ดู node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
 */

/**
 * เส้นทางที่ต้องเข้าได้เสมอ
 * - 🔴 `/login`, `/auth/callback` — **ไก่กับไข่**: ถ้าด่านดัก 2 เส้นนี้ จะล็อกอินไม่ได้เลยตลอดกาล
 *   เพราะทางเข้าถูกด่านที่รอทางเข้าปิดอยู่ (เหตุผลเดียวกับที่ `/unlock` เคยต้องอยู่ในลิสต์นี้)
 * - `/sw.js`, `/manifest.webmanifest` — เบราว์เซอร์ขอ 2 ไฟล์นี้แบบ **ไม่แนบคุกกี้**
 *   ถ้าโดนด่านดักจะได้ 307 ไปหน้า HTML แทนไฟล์จริง → ลงทะเบียน service worker ไม่ผ่าน
 *   และปุ่ม "เพิ่มลงหน้าจอโฮม" ไม่ขึ้น · ทั้งสองไฟล์ไม่มีข้อมูลผู้ใช้อยู่ข้างใน จึงเปิดสาธารณะได้
 * - `/api/keep-alive` — Vercel Cron ยิงมาโดยไม่มีคุกกี้ · route นั้นมีด่าน `CRON_SECRET` ของตัวเอง
 *   และไม่คืนข้อมูลออกมาเลย (ตอบแค่ ok/เวลา)
 */
const PUBLIC_PATHS = ["/sw.js", "/manifest.webmanifest", "/api/keep-alive", "/login", "/auth/callback"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔴 ต่ออายุ session **ก่อนด่านใด ๆ และก่อนการคืนค่าทุกทาง** (E1)
  // ถ้าวางไว้หลังด่าน PIN เส้นทางที่ปล่อยผ่านตั้งแต่ต้น (เช่น `/login`) จะไม่ถูกต่ออายุเลย
  // → ผู้ใช้ที่ค้างอยู่หน้านั้นนาน ๆ จะหลุดทั้งที่ไม่ได้ทำอะไรผิด
  // ⚠️ ต้องคืน `session.response` เสมอเมื่อจะปล่อยผ่าน **ห้ามสร้าง `NextResponse.next()` ใหม่**
  //    ไม่งั้นคุกกี้ที่เพิ่งต่ออายุจะหายไปเงียบ ๆ และอาการจะโผล่ตอน token เดิมหมดอายุเท่านั้น
  const session = await refreshSession(req);

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return session.response;
  }

  // 🔴 **กลับทิศจากด่าน PIN โดยตั้งใจ — ด่านเดิม fail-open ด่านนี้ fail-closed**
  //
  // ด่าน PIN เลือกปล่อยผ่านตอน env ไม่ครบ เพราะ *"ลืมตั้ง env บน Vercel แล้วเว็บตายทั้งเว็บ
  // อันตรายกว่า ตอนอยู่เกาหลีจริงแล้วเปิด /today ไม่ได้"* — **เหตุผลนั้นถูกสำหรับเว็บทริป**
  // เพราะข้อมูลทริปอยู่ในโค้ดและ IndexedDB แอปยังทำงานได้โดยไม่มี Supabase
  //
  // ⚠️ **แพลตฟอร์มไม่ใช่แบบนั้น**: ตาราง · RLS · ตัวตน อยู่ใน Supabase ทั้งหมด
  // ไม่มี Supabase = **ไม่มีข้อมูลให้แสดงอยู่แล้ว** → ปล่อยผ่านไม่ได้อะไรกลับมาเลย
  // ได้แค่หน้าเปล่าที่ไม่มีด่าน ซึ่งเป็นสภาพที่คนตั้งค่าผิดจะไม่มีทางสังเกตเห็น
  // → **ไม่มี user = ไม่ผ่าน** ทั้งกรณี "ยังไม่ล็อกอิน" และกรณี "ยังไม่ได้ตั้งค่า"
  //   สองกรณีนี้จบที่หน้า `/login` เหมือนกัน ซึ่งบอกความจริงกับผู้ใช้มากกว่าหน้าเปล่า
  if (session.user) {
    return session.response;
  }

  // API ตอบ 401 เป็น JSON ไม่ redirect — ฝั่ง client เป็น fetch การ redirect ไปหน้า HTML
  // จะทำให้ได้ response ที่ parse ไม่ออกแทนที่จะรู้ชัดๆ ว่ายังไม่ได้ล็อกอิน
  // 🔴 `S5`: ถูกบล็อกไม่ได้แปลว่าทิ้งคุกกี้ที่หมุนไปแล้ว — `refreshSession()` รันไปก่อนแล้ว
  //    ถ้าไม่ก็อปมา ไคลเอนต์จะถือ token เก่าที่อาจถูกเพิกถอนแล้ว (เหตุผลเต็มใน proxySession.ts)
  if (pathname.startsWith("/api/")) {
    return withSessionCookies(
      session.response,
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // จำหน้าที่ตั้งใจจะเข้าไว้ เพื่อพากลับไปหลังล็อกอิน (เช่นเปิดลิงก์ที่ถูกแชร์มาตรงๆ)
  // `safeNextPath` ฝั่ง callback เป็นคนตรวจค่านี้ก่อนใช้ — ที่นี่เป็นฝั่งเขียน ไม่ใช่ฝั่งเชื่อ
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return withSessionCookies(session.response, NextResponse.redirect(url));
}

export const config = {
  // ต้องตัด `_next` ออก **ทั้งก้อน** ไม่ใช่แค่ _next/static กับ _next/image
  // (เคยเขียนแบบนั้นแล้วเจอของจริง: `/_next/hmr` โดนด่านนี้ดักไปด้วย → HMR ตอน dev พัง →
  //  React ไม่ hydrate → ฟอร์มล็อกอินตกไปเป็น native submit กดแล้วรีโหลดเฉยๆ ไม่มีอะไรเกิดขึ้น)
  // ตัด `_next` ทิ้งได้อย่างปลอดภัยเพราะข้อมูลของหน้าที่ต้องหวงเดินทางผ่าน URL ของหน้านั้นเอง
  // (RSC ยิงไปที่ path เดิมพ่วง `?_rsc=` ซึ่งยังเข้าด่านนี้อยู่) — ยืนยันแล้วว่า /today ยังเด้ง 307 ปกติ
  // ส่วนไฟล์รูป/ไอคอนใน public/ ตัดออกด้วย เผื่อ manifest กับไอคอน PWA ในเฟส 18
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
