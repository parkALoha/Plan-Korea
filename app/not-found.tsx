import Link from "next/link";

/**
 * หน้า 404 (เฟส C4 · 4 ก.ย. 2026)
 *
 * 🔴 เว็บนี้ไม่เคยมีหน้านี้ — URL ที่พิมพ์ผิดจะได้หน้า 404 ปริยายของ Next
 *    ⚠️ และเอกสารของเวอร์ชันนี้เตือนไว้เองว่า **หน้าปริยายไม่อ่านธีมของแอป**
 *       (มันตาม `prefers-color-scheme` ของระบบ ไม่ตาม `data-theme` ที่เราตั้ง)
 *       ⇒ ตอนเปิดธีมมืดอยู่แล้วพิมพ์ URL ผิด จะเด้งหน้าขาวจ้าขึ้นมากลางดึก
 *    เขียนเองจึงคุมได้ — หน้านี้อยู่ใต้ root layout จึงได้โทเคน `surface`/`content` ตามธีมจริง
 *
 * 📌 ไม่มีแถบเมนูล่าง เพราะอยู่นอก route group `(app)` — ตั้งใจ: ลิงก์ที่ให้ไว้ตรงนี้ชัดกว่า
 *    และหน้านี้ไม่ใช่ที่ที่ควรค้างอยู่
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl" aria-hidden>
        🗺️
      </div>
      <h1 className="text-lg font-bold text-content">ไม่พบหน้านี้</h1>
      <p className="text-sm text-content-soft">ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>

      <div className="mt-2 flex w-full flex-col gap-2">
        <Link
          href="/today"
          className="rounded-control bg-maple-dark px-4 py-3 text-base font-semibold text-white hover:brightness-90"
        >
          ไปหน้า “วันนี้”
        </Link>
        <Link
          href="/"
          className="rounded-control border border-line px-4 py-3 text-sm font-medium text-content-soft hover:bg-surface-soft"
        >
          ไปหน้าแผนทริป
        </Link>
      </div>
    </main>
  );
}
