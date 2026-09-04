import { InviteLanding } from "@/components/InviteLanding";

/**
 * `/invite/<token>` — **หน้าเดียวในเว็บที่ต้องเปิดได้ตอนยังไม่ล็อกอิน นอกจาก `/login`**
 * 🔴 **ห้ามใส่ `requireUser()`** — คนที่ได้ลิงก์มายังไม่มีบัญชีก็ได้
 *    เนื้อหาทั้งหมดมาจาก `peek` ซึ่ง P1 เปิดให้ `anon` โดยตั้งใจ (เห็นแค่ชื่อทริป · คนชวน · สิทธิ์)
 * 📌 ไฟล์นี้บางที่สุดเท่าที่ทำได้ — ตรรกะอยู่ที่ `components/InviteLanding.tsx` (โซน P2)
 *    เพราะ `app/` (routing) เป็นโซน P3 · **แจ้ง P1/P3 แล้วว่าผมวางไฟล์นี้**
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteLanding token={token} />;
}
