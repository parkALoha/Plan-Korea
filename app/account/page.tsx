import Link from "next/link";
import { createServerSupabase, requireUser } from "@/lib/auth/server";
import { profileOf } from "@/lib/engine/db";
import { Card } from "@/components/ui/Card";
import { InitialAvatar } from "@/components/InitialAvatar";
import { SignOutButton } from "./SignOutButton";
import { CopyUserId } from "./CopyUserId";
import { DisplayNameField } from "./DisplayNameField";

/**
 * หน้าบัญชีของผู้ใช้ — เดิมเป็นหน้าเครื่องมือตรวจของ `E1` (เจ้าของเดิม: P1-Lead)
 * รื้อหน้าตาโดย P7 เมื่อ 4 ก.ย. 2026 ตามที่ผู้ใช้สั่ง
 *
 * 🔴 **ยังเป็น Server Component โดยตั้งใจ — ห้ามเปลี่ยนเป็น client เพื่อความสะดวก**
 * มันเรียก `requireUser()` ซึ่งอ่าน session จากคุกกี้ฝั่งเซิร์ฟเวอร์
 * **ถ้าหน้านี้แสดงผลได้ แปลว่าทั้งเส้นทางทำงานจริง** (คุกกี้ → proxy ต่ออายุ → server client →
 * `getUser()` ตรวจ JWT กับเซิร์ฟเวอร์) · ต้องการ interactivity ให้แยกเป็นลูกฝั่ง client
 * แบบที่ `SignOutButton` / `CopyUserId` ทำ
 *
 * ## 🔴 ทำไมข้อความ `E1-AC7` ถูกเอาออกจากจอ — และความรู้ของมันย้ายมาอยู่ตรงนี้แทน
 * `app/layout.tsx` + `HomeScreen` ผูกไอคอนบัญชีบนแถบหัวมาที่หน้านี้ ⇒ **ผู้ใช้จริงเดินเข้ามาเจอ**
 * คำเตือนที่เขียนไว้ว่า *"ไม่ใช่หน้าใช้งานจริง"* + ขั้นตอนตรวจของทีม + UUID ดิบ
 * 🎯 ***คำเตือนที่บอกว่า "หน้านี้ไม่ใช่หน้าจริง" เลิกเป็นคำเตือนตั้งแต่วินาทีที่มีคนลิงก์มาหามัน***
 *
 * **`D64` — ความรู้ที่แลกมาด้วยเหตุการณ์จริง ห้ามให้หายไปพร้อม markup:**
 * เดิมหน้านี้ตัดสิน "ผ่าน/ไม่ผ่าน" ของ `E1-AC7` เองด้วยการนับ `providers.length` แล้วรอให้ได้ 2
 * ข้อสมมตินั้น **ผิด**: Supabase แมตช์ที่ `auth.users.email` แล้วออก session ให้บัญชีเดิมทันที
 * ไม่สร้าง identity ใหม่ → magic link เข้าบัญชีที่มี Google อยู่แล้ว จะเห็น provider เดียวตลอดกาล
 * แม้ `AC7` ผ่านจริงแล้วก็ตาม · **ผู้ใช้จริงเกือบล็อกอินซ้ำเพราะเชื่อข้อความเดิม**
 *
 * ⚠️ **ห้ามให้หน้านี้ตัดสินสถานะบัญชีจากค่าที่ฝั่งไคลเอนต์เห็นอีก** — ไคลเอนต์เห็นได้แค่ session
 * ของตัวเอง ไม่มีทางรู้ว่า `auth.users` มีกี่แถวจริง ซึ่งเป็นครึ่งหนึ่งของเกณฑ์ (`AC7` ข้อ 2)
 * **หน้าที่ตัดสินโดยเห็นข้อมูลไม่ครบ อันตรายกว่าหน้าที่แค่รายงานค่าให้คนเทียบเอง**
 * ⇒ รายชื่อ provider ข้างล่างเป็น *ข้อมูลว่าเข้าได้ทางไหนบ้าง* **ไม่ใช่ตัวตัดสินอะไรทั้งสิ้น**
 *
 * 📌 `E1-AC1` ครึ่งหลัง (*session รอดข้ามการโหลดหน้า*) เคยเป็นข้อความบนจอสั่งให้กดรีเฟรช —
 * เอาออกเพราะเป็นคำสั่งถึงคนตรวจ ไม่ใช่ถึงผู้ใช้ · **วิธีวัดยังเหมือนเดิมทุกอย่าง**: โหลดหน้านี้ใหม่
 * ทั้งรอบแล้วยังเห็นอีเมลเดิม = ผ่าน · ไม่ต้องมีข้อความบนจอก็วัดได้
 */

/** ป้ายชื่อทางที่ใช้ล็อกอิน — `identities[].provider` เป็นสตริงของ Supabase ไม่ใช่ค่าที่เราตั้ง */
const PROVIDER_LABEL: Record<string, { icon: string; label: string }> = {
  google: { icon: "🇬", label: "บัญชี Google" },
  email: { icon: "✉️", label: "ลิงก์ทางอีเมล" },
};

export default async function AccountPage() {
  // เด้งไป /login เองถ้ายังไม่ล็อกอิน — จึงไม่ต้องเช็ค null ข้างล่าง
  const user = await requireUser();
  const providers = (user.identities ?? []).map((i) => i.provider);
  const email = user.email ?? "—";

  /* อ่านโปรไฟล์ **ฝั่งเซิร์ฟเวอร์ตรง ๆ** ไม่ยิง `GET /api/engine/profile` ของตัวเอง —
     หน้านี้เป็น Server Component อยู่แล้ว การยิง HTTP กลับมาหาตัวเองคือรอบเน็ตเวิร์กที่ไม่ต้องมี
     และทำให้ช่องกรอกว่างตอนโหลดแรกโดยไม่จำเป็น · `route.ts` ใช้ `profileOf` ตัวเดียวกันนี้
     🔴 `maybeSingle()` คืน `null` ได้จริง — บัญชีเก่าที่ไม่มีแถวใน `profiles` (P1 ยืนยันว่าเกิดได้)
        นั่นคือเหตุผลที่ `DisplayNameField` ต้องรับ `null` ได้ ไม่ใช่รับสตริงเปล่า */
  const db = await createServerSupabase();
  const { data: profile } = await profileOf(db, user.id);

  return (
    <main className="mx-auto max-w-md px-4 py-6 text-content sm:py-10">
      {/* 🔴 **ทางออก — วัดแล้วว่าหน้านี้ไม่มีเลยสักทาง** (P7 · 4 ก.ย. 2026)
          `document.querySelectorAll('a')` บนหน้านี้คืน **0 ตัว** และ root layout ไม่ให้ nav อะไรมาเลย
          (`BottomNav` อยู่ที่หน้าทริป ไม่ใช่ที่นี่) ⇒ ผู้ใช้ที่กดไอคอนบัญชีบนแถบหัวเข้ามา
          **ออกได้ทางเดียวคือปุ่ม back ของเบราว์เซอร์ หรือออกจากระบบ**
          🎯 ตอนหน้านี้เป็นเครื่องมือตรวจของทีม มันไม่ใช่ปัญหา — คนที่เปิดพิมพ์ URL เอง
          **มันกลายเป็นปัญหาตอนมีคนลิงก์มาหามัน** ซึ่งเป็นเรื่องเดียวกับที่ทำให้ต้องรื้อหน้านี้ทั้งใบ */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-2xs text-content-soft hover:text-content"
      >
        ← ทริปของฉัน
      </Link>
      <h1 className="mt-2 text-xl font-bold">บัญชีของฉัน</h1>

      <Card className="mt-4 flex items-center gap-3 p-4">
        {/* ชื่อยังไม่มีในฐาน (ดูช่อง "ชื่อที่แสดง" ข้างล่าง) — ตัวย่อจึงมาจากอีเมล
            `label` ไม่ใส่ = ตกแต่งล้วน เพราะอีเมลเต็มอยู่ข้าง ๆ อยู่แล้ว */}
        <InitialAvatar name={email} className="h-12 w-12 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="break-all font-semibold">{email}</p>
          <p className="mt-0.5 text-2xs text-content-soft">
            {providers.length > 0
              ? `เข้าได้ด้วย ${providers
                  .map((p) => PROVIDER_LABEL[p]?.label ?? p)
                  .join(" · ")}`
              : "ยังไม่มีข้อมูลว่าเข้าด้วยทางไหน"}
          </p>
        </div>
      </Card>

      {/* 🔴 สองช่องนี้ *จองที่* ไม่ใช่ฟีเจอร์ — P1 กำลังทำ route ของ "ชื่อที่แสดง" อยู่
          และแผนสมาชิกยังไม่ได้เริ่มอะไรเลย · เขียนให้อ่านออกว่า "ยังไม่มี" ไม่ใช่ "กดแล้วไม่ทำงาน" */}
      <Card className="mt-4 p-4">
        <DisplayNameField initialName={profile?.display_name ?? null} />
      </Card>

      {/* 🔴 การ์ดนี้ *จองที่* ไม่ใช่ฟีเจอร์ — ยังไม่ได้เริ่มอะไรเลย
          เขียนให้อ่านออกว่า "ยังไม่มี" ไม่ใช่ "กดแล้วไม่ทำงาน" */}
      <h2 className="mt-6 text-2xs font-semibold uppercase tracking-wide text-content-soft">
        ยังทำไม่เสร็จ
      </h2>
      <div className="mt-2">
        <PendingRow title="แผนสมาชิก">ยังไม่เปิดให้สมัคร</PendingRow>
      </div>

      <SignOutButton />

      <CopyUserId userId={user.id} />
    </main>
  );
}

/** แถวของสิ่งที่ยังไม่มี — ไม่ใช่ปุ่ม ไม่ใช่ลิงก์ กดไม่ได้โดยตั้งใจ */
function PendingRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-2xs text-content-soft">{children}</p>
      </div>
      <span className="shrink-0 rounded-pill bg-surface-soft px-2 py-0.5 text-2xs text-content-soft">
        เร็ว ๆ นี้
      </span>
    </Card>
  );
}
