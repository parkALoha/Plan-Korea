import { NextRequest, NextResponse } from "next/server";
import { getUser, createServerSupabase } from "@/lib/auth/server";
import { BOOKING_FILES_BUCKET } from "@/lib/engine/storageKey";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * สตรีมไฟล์ใน bucket `booking-files` ผ่าน **origin ของแอปเอง** — `E2-AC13` ② · ③
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026 · **ดีไซน์มาจาก P3** (`devops`/`sw.js` เป็นโซนเขา)
 *
 * ## 🔴 ทำไมต้อง proxy ทั้งที่ signed URL เปิดตรงก็ได้ — เหตุผลของ P3 และผมรับเต็ม ๆ
 *
 * ผมเสนอให้ `sw.js` แคช signed URL ตรง ๆ โดยคีย์ด้วย `storageKeyOf()` · **P3 ปฏิเสธ และถูก:**
 * > `<img src>` / `<a href>` ชี้ตรงไป signed URL และ **ไม่มีจุดไหนในทรีตั้ง `crossOrigin` เลย**
 * > → browser ยิงเป็น `no-cors` → response เป็น **`opaque` เสมอ** → **อ่าน `status` ไม่ได้**
 * > 🔴 **แยกไม่ออกว่า 200 หรือ 403 → ความล้มเหลวชั่วคราวถูกแคชถาวรเหมือนความสำเร็จ**
 *
 * 🎯 **และประโยคที่ปิดเรื่อง: *"ต่อให้คีย์ถูกแล้วก็ยังพังจากข้อนี้อยู่ดี"***
 * — ผมเห็นสาเหตุหนึ่ง (คีย์เป็น URL ที่เปลี่ยนทุกครั้ง) แล้วอ่านว่ามันคือ *สาเหตุ*
 *
 * ✅ same-origin → `response.type === "basic"` → `isStorable()` ของ `sw.js` ทำงานถูกโดยไม่ต้องแก้
 * · และ **ไม่ต้องเจาะ cross-origin exception เข้า `sw.js:103`** ซึ่งวันนี้เป็นเส้นแบ่งที่อธิบายได้ในประโยคเดียว
 * · แพทเทิร์นเดียวกับ `/api/place-photo` ที่มีอยู่แล้ว — **ไม่ได้ประดิษฐ์ของใหม่**
 *
 * ## 🔴 ทำไมมันไม่ใช่ open proxy — สามชั้น ไม่ใช่ชั้นเดียว
 * 1. **ปลายทางไม่ได้มาจากผู้ใช้** — รับแค่ *path ใน bucket ของเรา* ไม่ใช่ URL · เรียกโฮสต์อื่นไม่ได้เลยตามโครง
 * 2. **ต้องล็อกอิน** — `getUser()` ยิงตรวจ JWT กับเซิร์ฟเวอร์จริง ไม่ใช่ `getSession()` ที่อ่านคุกกี้เฉย ๆ
 * 3. 🎯 **`createSignedUrl` วิ่งด้วย client ของ *ผู้ใช้คนนั้น* (anon key + JWT ของเขา)**
 *    → **policy ของ Storage เป็นคนตัดสิน ไม่ใช่โค้ดในไฟล์นี้** · `D38` — เซิร์ฟเวอร์ไม่ใช่สิทธิ์พิเศษ
 *    ⛔ **ห้ามแตะ `SUPABASE_SERVICE_ROLE_KEY` ที่นี่เด็ดขาด** (`authNoServiceRole.test.ts` บังคับทั้ง `app/`)
 *
 * ## ⚠️ ของที่ไฟล์นี้ **ไม่** ทำ
 * · **ไม่แคชฝั่งเซิร์ฟเวอร์** — ไฟล์ตั๋วเป็นของผู้ใช้รายคน `s-maxage` จะทำให้ edge เสิร์ฟข้ามคน
 * · **ไม่ตัดสินใจแทน `sw.js`** — การเก็บลง Cache Storage เป็นโซน P3 (`E3`)
 */

// ไฟล์ตั๋วต่อหน้าไม่เกินหลักสิบ · ต่ำกว่า `place-photo` (400) มาก เพราะแต่ละครั้งสตรีมไฟล์จริง
const RATE_LIMIT_PER_MINUTE = 120;

/** อายุ signed URL ที่ใช้ *ภายใน* คำขอนี้ — ผู้ใช้ไม่เคยเห็นมัน ใช้เสร็จทิ้งทันที (`ux-flows.md §12.2`) */
const INTERNAL_SIGN_SECONDS = 30;

// 📌 เขียน `params` เป็น `Promise<…>` ตรง ๆ แทน `RouteContext<"…">`
//    `RouteContext` อ้าง union `AppRouteHandlerRoutes` ที่ **สร้างตอน build** → route ใหม่ยังไม่อยู่ในนั้น
//    → `tsc --noEmit` แดงทั้งที่โค้ดถูก · เอกสารของ Next 16 แสดงทั้งสองรูปเป็นทางที่ใช้ได้
//    (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:87`)
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const limited = rateLimitGuard(req, "booking-file", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  // 🔴 401 ไม่ใช่ 404 — *"ยังไม่ได้ล็อกอิน"* กับ *"ไม่มีไฟล์นี้"* ผู้ใช้ทำต่างกันคนละเรื่อง
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { path } = await ctx.params;
  const key = (path ?? []).join("/");

  // 🔴 ปฏิเสธ path ที่ไม่ควรมีอยู่ **ก่อน** ส่งต่อ — segment ว่างและ `..` ไม่มีทางเป็นไฟล์ของเรา
  //    ไม่ได้กันช่องโหว่ (Storage ถือ key เป็นสตริงตรง ๆ) **แต่กันไม่ให้ error ที่ได้กลับมาอ่านไม่ออก**
  if (!key || (path ?? []).some((seg) => seg === "" || seg === "." || seg === "..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage
    .from(BOOKING_FILES_BUCKET)
    .createSignedUrl(key, INTERNAL_SIGN_SECONDS);

  // 🔴 **404 ทั้งกรณี "ไม่มีไฟล์" และ "ไม่มีสิทธิ์" โดยตั้งใจ**
  //    403 จะบอกคนนอกว่า *ไฟล์นี้มีอยู่จริง* ซึ่งเป็นข้อมูลที่เขาไม่ควรได้จากการเดา path
  //    · ต่างจาก 401 ข้างบนที่บอกได้ เพราะมันพูดถึง *ตัวผู้เรียก* ไม่ใช่ *ไฟล์*
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const upstream = await fetch(data.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Length": upstream.headers.get("Content-Length") ?? "",
      // 🔴 `private` ไม่ใช่ `public` — ไฟล์ตั๋วเป็นของผู้ใช้รายคน · ห้าม edge/CDN เสิร์ฟข้ามคน
      //    `max-age` สั้นเพราะสิทธิ์เปลี่ยนได้ (ถูกถอดออกจากทริป) และ HTTP cache ไม่รู้เรื่องนั้นเลย
      "Cache-Control": "private, max-age=60, must-revalidate",
      // กันไม่ให้ไฟล์ที่ผู้ใช้อัปโหลดถูกตีความเป็น HTML แล้วรันในโดเมนเรา
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
