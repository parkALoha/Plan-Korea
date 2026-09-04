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
    // 🔴 เป็นกลาง — manifest ใบเดียวเสิร์ฟทุกทริปทุกประเทศ (เหตุผลเดียวกับ `app/layout.tsx`)
    name: "แพลนทริป",
    short_name: "แพลนทริป",
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
