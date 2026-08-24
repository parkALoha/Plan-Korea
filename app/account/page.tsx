import { requireUser } from "@/lib/auth/server";
import { SignOutButton } from "./SignOutButton";

/**
 * หน้ายืนยันตัวตน — เจ้าของ: P1-Lead (E1)
 *
 * 🔴 **มีไว้เพื่อทำให้ `E1-AC1` และ `E1-AC7` *วัดได้ด้วยตา* ไม่ใช่แค่วัดใน DB**
 * ก่อนมีหน้านี้ ผู้ใช้ล็อกอินสำเร็จแล้ว **ไม่มีอะไรบนเว็บที่บอกว่าสำเร็จเลยสักอย่าง**
 * → พิสูจน์ไม่ได้ว่า session เกิดขึ้นจริง และพิสูจน์ไม่ได้ว่ามันรอดข้ามการรีเฟรช
 *
 * หน้านี้เป็น **Server Component** โดยตั้งใจ — มันเรียก `requireUser()` ซึ่งอ่าน session
 * จากคุกกี้ฝั่งเซิร์ฟเวอร์ · **ถ้าหน้านี้แสดงผลได้ แปลว่าทั้งเส้นทางทำงานจริง**
 * (คุกกี้ → proxy ต่ออายุ → server client → `getUser()` ตรวจ JWT กับเซิร์ฟเวอร์)
 * · ไม่ใช่หน้าสวย และไม่ต้องสวย — `E5` เป็นคนทำ UI จริง
 */

export default async function AccountPage() {
  // เด้งไป /login เองถ้ายังไม่ล็อกอิน — จึงไม่ต้องเช็ค null ข้างล่าง
  const user = await requireUser();

  // provider ที่ผูกกับบัญชีนี้ · `E1-AC7` ถามว่า Google + magic link ด้วยอีเมลเดียวกัน
  // ได้ **บัญชีเดียว** หรือ **2 บัญชี** — ถ้าเป็นบัญชีเดียว ที่นี่จะขึ้น 2 provider
  const providers = (user.identities ?? []).map((i) => i.provider);

  return (
    <main className="mx-auto max-w-xs px-4 py-10 text-content">
      <h1 className="text-xl">✅ ล็อกอินแล้ว</h1>
      <p className="mt-1 text-xs text-content-soft">
        หน้านี้มีไว้ตรวจว่าระบบล็อกอินทำงานจริง (E1) — ไม่ใช่หน้าใช้งานจริง
      </p>

      <dl className="mt-6 space-y-3 rounded-lg border border-line bg-surface-raised p-4 text-sm">
        <div>
          <dt className="text-xs text-content-soft">อีเมล</dt>
          <dd className="break-all">{user.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-content-soft">user id</dt>
          <dd className="break-all font-mono text-xs">{user.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-content-soft">
            ทางที่ใช้ล็อกอินได้ ({providers.length})
          </dt>
          <dd>{providers.length > 0 ? providers.join(" · ") : "—"}</dd>
        </div>
      </dl>

      {/* 🔴 E1-AC7 — ข้อความนี้อ่านผลจากของจริง ไม่ได้เดา และไม่สรุปแทนคนอ่าน */}
      <div className="mt-4 rounded-lg border border-line bg-surface-soft p-3 text-xs text-content-soft">
        {providers.length >= 2 ? (
          <>
            <strong className="text-content">E1-AC7 ผ่าน:</strong> อีเมลเดียวกัน ล็อกอินได้หลายทาง
            โดยเป็น <strong className="text-content">บัญชีเดียวกัน</strong> — user id ด้านบนคือตัวเดิม
          </>
        ) : (
          <>
            <strong className="text-content">E1-AC7 ยังวัดไม่ได้:</strong> เห็นแค่{" "}
            {providers.length} ทาง · ต้องออกจากระบบแล้วเข้าใหม่ด้วย
            <strong className="text-content"> อีกทางหนึ่ง โดยใช้อีเมลเดิม</strong> แล้วกลับมาดูหน้านี้
            <br />
            🔴 ถ้ากลับมาแล้ว <strong className="text-content">user id เปลี่ยน</strong> = ได้ 2 บัญชี
            = <strong className="text-content">ไม่ผ่าน</strong> ต้องหยุดแล้วบอกทีม
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-content-soft">
        🔄 <strong className="text-content">รีเฟรชหน้านี้</strong> แล้วยังเห็นข้อมูลเดิม = session
        รอดข้ามการโหลดหน้าจริง (ครึ่งหลังของ E1-AC1)
      </p>

      <SignOutButton />
    </main>
  );
}
