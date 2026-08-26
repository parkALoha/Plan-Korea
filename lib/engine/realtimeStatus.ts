/**
 * 🔴 Realtime **ไม่ทำงานจริง** บนแพลตฟอร์มนี้วันนี้ — จุดเดียวที่พูดความจริงข้อนี้ (`E5`, 27 ส.ค. 2026)
 *
 * ไม่มีตารางไหนอยู่ใน publication ของ Supabase Realtime เลยสักตาราง (`E3-AC3` ปักหมุดไว้) —
 * `supabase.channel(...).on("postgres_changes", ...).subscribe()` ที่เห็นอยู่ใน 8 จุดของ `hooks/`
 * (ทุกตัวยกเว้น `useOvernightOverrides`) **subscribe สำเร็จแต่ไม่เคยได้รับ event เลยสักตัว** — ไม่มี error
 * ไม่มีอะไรฟ้อง เพราะฝั่งเบราว์เซอร์ subscribe ผ่านได้ปกติ แค่ไม่มีอะไรส่งมาให้
 *
 * 🎯 **ทำไมข้อนี้ต้องเขียนไว้ที่เดียวแทนที่จะปล่อยให้อ่านโค้ดแล้วเดา:**
 * `PLAN.md`/`D6` เคยเขียนว่า *"เว็บนี้ให้ 2 คนแก้พร้อมกันผ่าน Realtime อยู่แล้ว"* — **เป็นเท็จบนแพลตฟอร์ม**
 * แต่ไม่มีอะไรในโค้ดฟ้องความเท็จนั้น เพราะโค้ด subscribe อยู่จริงและรันไม่มี error — คนอ่านโค้ดต่อ (รวม P1
 * ที่เขียน `D6` เอง) จะสรุปแบบเดียวกันว่า "มันทำงานอยู่" ได้ง่ายมาก
 *
 * ## ทำไมไม่ถอด subscription ออก
 * P7 ยืนยันว่า 2–4 คนต่อทริป ใช้ **refetch-on-focus** ก็พอสำหรับตอนนี้ (สิ่งที่เปลี่ยนคือหน้าต่างความเก่า
 * ไม่ใช่ความถูกต้อง — เขียนพร้อมกัน 2 คน ฐานยังได้สถานะสุดท้ายเหมือนกันไม่ว่าใครได้รับแจ้งหรือไม่) — เปิด
 * Realtime จริงทำได้ทีหลังไม่มีปัญหา **ถอดตอนนี้แล้วต้องใส่กลับตอนเปิดจริง = งานเปล่า**
 *
 * ## เปิดจริงเมื่อไหร่ ต้องตอบคำถามนี้ก่อน (ยังไม่มีคำตอบ)
 * RLS บน WebSocket ของ Supabase Realtime คนละกลไกกับ RLS บน PostgREST ที่ route ทุกเส้นใช้อยู่ —
 * ต้องตรวจว่า publication ที่จะเปิดบังคับ RLS ถูกต้องจริง ไม่ใช่แค่เปิด publication แล้วเชื่อว่า RLS ครอบ
 * เหมือนเส้นทางอื่น
 *
 * เรียก `noteRealtimeSubscribed(table)` ทันทีหลัง `.subscribe()` ทุกจุด — ไม่ได้ทำอะไรตอน production
 * แค่ทำให้คนอ่าน dev console เห็นความจริงข้อนี้ตอน mount แทนที่จะต้องมาเปิดไฟล์นี้เจอเอง
 */
export function noteRealtimeSubscribed(table: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.debug(
    `[realtime] subscribed to "${table}" — no-op today, publication empty (E3-AC3). ` +
      "See lib/engine/realtimeStatus.ts before assuming this delivers events."
  );
}
