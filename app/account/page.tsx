import { BackHomeLink } from "@/components/BackHomeLink";
import { SiteNav } from "@/components/SiteNav";
import { requireUser } from "@/lib/auth/server";
import { Card } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { InitialAvatar } from "@/components/InitialAvatar";
import { SignOutButton } from "./SignOutButton";
import { CopyUserId } from "./CopyUserId";
import { DisplayNameField } from "./DisplayNameField";
import { TripsSummary } from "./TripsSummary";

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

/**
 * ชื่อแท็บของหน้านี้ — เดิมทุกหน้าขึ้นชื่อเว็บเหมือนกันหมด แยกไม่ออกตอนเปิดหลายแท็บ
 *
 * 🔴 **กติกา: หน้าย่อยตั้งแค่ชื่อของตัวเอง ห้ามต่อชื่อแบรนด์เข้าไปเอง**
 * `root layout` มี `title.template` ให้แล้ว ⇒ ต่อเองเมื่อไหร่จะได้ชื่อแบรนด์ซ้ำสองรอบ
 * และเป็นการ **วางสำเนาของชื่อแบรนด์ไว้อีกที่** ซึ่ง ***สำเนาที่ต้องมีคนซิงก์ จะล้าเสมอ***
 * · คนที่เปลี่ยนชื่อแบรนด์รอบหน้าจะไม่เปิดไฟล์นี้ (ชื่อเพิ่งเปลี่ยนมาแล้วครั้งหนึ่งวันเดียวกัน)
 *
 * 📌 **ฉบับก่อนของคอมเมนต์นี้บรรยายว่า *"root ไม่มี `template`"* — เท็จไปแล้ว** (P3 วาง `e8792e5`
 * หลังจากนั้นไม่กี่ชั่วโมง · P3 ชี้เอง โดยไม่ได้แตะไฟล์นี้)
 * 🎯 ***มันบรรยายสภาพของ *ไฟล์อื่น* — คนที่ทำให้มันเท็จไม่เคยเปิดไฟล์นี้เลย ⇒ ไม่มีเส้นทางไหน
 * ตามโครงสร้างที่จะทำให้มันถูกอัปเดต*** (`§3.4`) · ฉบับนี้จึงเขียนเป็น **กติกา** ไม่ใช่ **สภาพ** —
 * ถ้าวันหนึ่ง `template` ถูกถอด กติกานี้จะผิดพร้อมกับที่โค้ดผิด ไม่ใช่ผิดอยู่เงียบ ๆ คนเดียว
 */
export const metadata = { title: "บัญชีของฉัน" };

/** ป้ายชื่อทางที่ใช้ล็อกอิน — `identities[].provider` เป็นสตริงของ Supabase ไม่ใช่ค่าที่เราตั้ง */
/* 🔴 **`mark` เป็นตัวอักษร ไม่ใช่อีโมจิ — ฉบับแรกใช้ `🇬` แล้วมันเรนเดอร์ผิด**
   `🇬` คือ *regional indicator* ตัวเดียว ซึ่งไม่ใช่ธงและไม่ใช่โลโก้ ⇒ เบราว์เซอร์วาดเป็นกล่องตัวอักษร
   (เห็นกับตาบนหน้าจริงตอนตรวจ) · Google ไม่มีอีโมจิของตัวเอง และเราวาดโลโก้แบรนด์เองไม่ได้
   ⇒ ใช้ตัวอักษรในวงกลม — อ่านออกทุกแพลตฟอร์ม ไม่พึ่งชุดอีโมจิของเครื่อง */
const PROVIDER_LABEL: Record<string, { mark: string; label: string }> = {
  google: { mark: "G", label: "บัญชี Google" },
  email: { mark: "@", label: "ลิงก์ทางอีเมล" },
};

/**
 * วันที่แบบไทย — **ปักโซนเวลาไว้ ไม่ปล่อยให้ตามเครื่องที่เรนเดอร์**
 *
 * 🔴 หน้านี้เป็น Server Component ⇒ วันที่ถูกจัดรูปบน **เซิร์ฟเวอร์** · ถ้าไม่ปัก `timeZone`
 * ผลจะเปลี่ยนตามโซนเวลาของเครื่องที่รัน (dev เครื่องเรา vs. Vercel ที่เป็น UTC)
 * ⇒ วันเดียวกันอาจแสดงคนละวัน · `lib/localDate.ts` เขียนกับดักตระกูลเดียวกันนี้ไว้แล้ว
 * ⚠️ ปัก `Asia/Bangkok` = **ข้อสมมติว่าผู้ใช้อยู่ไทย** — จริงวันนี้ (แอปเป็นไทยล้วน `th-TH` ทั้งเว็บ)
 *    วันที่มีผู้ใช้ต่างโซนจริง ต้องอ่านจากโปรไฟล์ ไม่ใช่แก้ค่าคงที่ตรงนี้
 */
function thaiDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

/** หัวข้อของบล็อก — ตัวเล็ก จาง ไม่แข่งกับ h1 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-content-soft">
      {children}
    </h2>
  );
}

/** แถวข้อมูลอ่านอย่างเดียว — ป้ายซ้าย ค่าขวา */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-2xs text-content-soft">{label}</span>
      <span className="min-w-0 text-right text-sm">{value}</span>
    </div>
  );
}

export default async function AccountPage() {
  // เด้งไป /login เองถ้ายังไม่ล็อกอิน — จึงไม่ต้องเช็ค null ข้างล่าง
  const user = await requireUser();
  const providers = (user.identities ?? []).map((i) => i.provider);
  const email = user.email ?? "—";

  const lastSignIn = thaiDate(user.last_sign_in_at);
  const createdAt = thaiDate(user.created_at);

  /* 🔴 **เคยมี `SiteHeader` เหนือ `<main>` นี้อยู่ 1 ชั่วโมง — ผู้ใช้สั่งถอดเอง** (*"เอาออก มันรก"*)
     เขาเห็นทั้งแบบมีและไม่มีแล้ว **ห้ามเอากลับมาโดยไม่มีคำสั่งใหม่** */
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6 text-content sm:py-10 lg:pb-6">
      {/* 🔴 **ทางออก — วัดแล้วว่าหน้านี้ไม่มีเลยสักทาง** (P7 · 4 ก.ย. 2026)
          `document.querySelectorAll('a')` บนหน้านี้คืน **0 ตัว** และ root layout ไม่ให้ nav อะไรมาเลย
          (`BottomNav` อยู่ที่หน้าทริป ไม่ใช่ที่นี่) ⇒ ผู้ใช้ที่กดไอคอนบัญชีบนแถบหัวเข้ามา
          **ออกได้ทางเดียวคือปุ่ม back ของเบราว์เซอร์ หรือออกจากระบบ**
          🎯 ตอนหน้านี้เป็นเครื่องมือตรวจของทีม มันไม่ใช่ปัญหา — คนที่เปิดพิมพ์ URL เอง
          **มันกลายเป็นปัญหาตอนมีคนลิงก์มาหามัน** ซึ่งเป็นเรื่องเดียวกับที่ทำให้ต้องรื้อหน้านี้ทั้งใบ */}
      {/* 🔴 **ฉบับแรกของลิงก์นี้เป็นข้อความ `text-2xs` เปล่า ๆ — ผู้ใช้ให้ออกแบบใหม่ และมันตกเกณฑ์จริง**
          · เป้าแตะสูง ~16px · เกณฑ์ของเฟส D1 คือ **44px** (`6787a95` — ตอนนั้นวัดได้ว่าตก 500 จาก 903 จุด)
          · และมันอ่านเหมือน *ข้อความ* ไม่ใช่ *ปุ่ม* — ไม่มีขอบ ไม่มีพื้น เล็กกว่าตัวอักษรรอบตัว
          ⇒ ทำเป็นชิปที่มีขอบ+พื้นแบบเดียวกับการ์ดในหน้านี้ ให้มันประกาศตัวว่ากดได้

          🔴 **`before:-inset-[7px]` ขยายเป้าแตะ 37px → 50px โดยกล่องที่มองเห็นเท่าเดิม**
          (วัดด้วย `elementFromPoint` ไล่ทีละพิกเซลบนหน้าจริง ไม่ใช่คำนวณจาก padding —
           ฉบับแรกของบรรทัดนี้เขียน "~34 → ~48" ซึ่งเป็นเลขที่ผมบวกในหัว และคลาดจริง)
          (แพทเทิร์นของ P2 ที่ `ChecklistPanel.tsx:140` — ใช้ padding จริงจะดันหัวเรื่องลงไปด้วย)

          📌 ใช้ `←` เป็นตัวอักษร ไม่ใช่ไอคอน เพราะ **`components/ui/Icon.tsx` ไม่มีลูกศรย้อนกลับ**
          และเป็นโซน P2 ⇒ วาด SVG เองที่นี่ = ไอคอนนอกระบบไอคอน · ทั้งเว็บใช้ `←` อยู่แล้ว 3 ที่
          (`app/today` · `NearbyPlacesModal` · `MoveStopMenu`) — **ตามของที่มี ไม่เปิดระบบที่สอง** */}
      {/* ปุ่มกลับหน้าแรกใบเดียวของทั้งเว็บ — เหตุผลและถ้อยคำอยู่ที่ `components/BackHomeLink.tsx` */}
      <BackHomeLink />
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">บัญชีของฉัน</h1>
        {/* 🔴 **ปุ่มสลับธีมของ P2 ถูกสร้างไว้แล้วแต่ยังไม่มีใครเรียกใช้เลยสักที่** (grep แล้ว 0 hit
            นอกไฟล์ตัวเอง) · หน้าบัญชีคือบ้านตามธรรมชาติของการตั้งค่าที่ผูกกับ *คน* ไม่ใช่ *ทริป*
            📌 `useDarkTheme` เก็บค่าไว้ที่ `localStorage` และตั้ง `data-theme` บน `<html>`
               ⇒ แค่เรนเดอร์ปุ่มนี้ หน้านี้ก็รองรับธีมมืดครบ ไม่ต้องเรียก hook เองซ้ำ */}
        <ThemeToggle />
      </div>

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

      <SectionTitle>โปรไฟล์</SectionTitle>
      <Card className="p-4">
        <DisplayNameField />
      </Card>

      <SectionTitle>การเข้าสู่ระบบ</SectionTitle>
      <Card className="p-4">
        <ul className="space-y-2">
          {providers.length > 0 ? (
            providers.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-2xs font-semibold text-content-soft"
                >
                  {PROVIDER_LABEL[p]?.mark ?? "?"}
                </span>
                <span className="min-w-0 flex-1">{PROVIDER_LABEL[p]?.label ?? p}</span>
                <span className="shrink-0 text-2xs text-pine">เชื่อมแล้ว</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-content-soft">ยังไม่มีข้อมูลว่าเข้าด้วยทางไหน</li>
          )}
        </ul>

        {/* 🔴 **ห้ามขึ้นว่าทางที่ไม่อยู่ในลิสต์ "ยังไม่ได้ใช้" — นั่นคือ `D64` ซ้ำรอยเดิมเป๊ะ**
            Supabase แมตช์ที่อีเมลแล้วออก session ให้บัญชีเดิม **โดยไม่สร้าง identity ใหม่**
            ⇒ คนที่เคยเข้าด้วย magic link จริง ๆ ก็ยังเห็นแค่ `google` อยู่ดี
            การเขียนว่า "ยังไม่ได้ใช้" จึงเป็นการ **ตัดสินจากข้อมูลที่ไม่ครบ** ซึ่งเคยทำให้ผู้ใช้จริง
            เกือบล็อกอินซ้ำมาแล้ว · ประโยคข้างล่างพูดเฉพาะสิ่งที่จริงเสมอ ไม่อ้างสถานะของทางที่ไม่เห็น */}
        <p className="mt-3 border-t border-line pt-3 text-2xs leading-relaxed text-content-soft">
          ล็อกอินด้วยอีเมลเดียวกันทางอื่น จะเข้าบัญชีนี้เหมือนกัน — ไม่ได้สร้างบัญชีใหม่
        </p>

        <div className="mt-2 border-t border-line pt-1">
          {lastSignIn && <InfoRow label="เข้าใช้ล่าสุด" value={lastSignIn} />}
          {createdAt && <InfoRow label="เปิดบัญชีเมื่อ" value={createdAt} />}
        </div>
      </Card>

      <SectionTitle>ทริปของฉัน</SectionTitle>
      <Card className="p-4">
        <TripsSummary />
      </Card>

      {/* 🔴 การ์ดนี้ *จองที่* ไม่ใช่ฟีเจอร์ — ยังไม่ได้เริ่มอะไรเลย
          เขียนให้อ่านออกว่า "ยังไม่มี" ไม่ใช่ "กดแล้วไม่ทำงาน" */}
      <SectionTitle>ยังทำไม่เสร็จ</SectionTitle>
      <PendingRow title="แผนสมาชิก">ยังไม่เปิดให้สมัคร</PendingRow>

      <SignOutButton />

      <CopyUserId userId={user.id} />
      {/* แถบเมนูระดับเว็บ — หน้านี้อยู่นอกทริป จึงไม่มี `BottomNav` (เหตุผลเต็มอยู่ที่ `SiteNav.tsx`) */}
      <SiteNav />
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
