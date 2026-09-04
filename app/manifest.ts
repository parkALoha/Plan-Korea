import type { MetadataRoute } from "next";

/**
 * Web App Manifest — ติดตั้งลงหน้าจอโฮมได้ (เฟส 18)
 * ใช้รูปแบบ `app/manifest.ts` ของ Next เวอร์ชันนี้ (ดู
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`)
 *
 * `start_url` ชี้ไป `/today` ไม่ใช่ `/` — เหตุผลที่ติดตั้งลงโฮมสกรีนคือใช้ตอนเที่ยวจริง
 * เปิดแอปแล้วต้องเห็น "ตอนนี้ไปไหนต่อ" ทันที ไม่ใช่หน้าวางแผนที่ใช้ตอนอยู่บ้าน
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /**
     * 🔴 **ชื่อแบรนด์ — ผู้ใช้ตั้งเองเมื่อ 4 ก.ย. 2026** (*"ชื่อเว็บเราคือ luitrip"*)
     * ยังเป็นกลางเหมือนเดิม: manifest ใบเดียวเสิร์ฟทุกทริปทุกประเทศ (เหตุผลเดียวกับ `app/layout.tsx`)
     * **ชื่อแบรนด์ไม่ผูกกับประเทศ จึงไม่ขัดกับข้อเป็นกลาง** — ต่างจาก "แพลนเที่ยวเกาหลี" ที่ถูกถอดไปแล้ว
     *
     * ⚠️ **สะกดตามที่ผู้ใช้พิมพ์เป๊ะ (`luitrip` ตัวเล็กทั้งหมด)** — ยังไม่มีการยืนยันรูปภาษาไทย
     * มีผู้เสนอว่าอ่านเป็น "ลุยทริป" (คำพ้องสองภาษา) **แต่ผู้ใช้ยังไม่ได้ระบุ จึงยังไม่ใช้**
     * · `short_name` ต้องสั้นกว่า 12 ตัวอักษรตามข้อกำหนด PWA — `luitrip` = 7 ผ่าน
     */
    name: "luitrip",
    short_name: "luitrip",
    description: "วางแผนทริป ดูว่าตอนนี้ต้องไปไหน นำทางได้เลย",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "th",
    background_color: "#fdf6ec",
    theme_color: "#33564a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
