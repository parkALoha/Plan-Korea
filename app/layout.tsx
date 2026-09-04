import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CacheFullBanner } from "@/components/CacheFullBanner";
import { SystemModeBanner } from "@/components/SystemModeBanner";
import { DeviceOwnerStamp } from "@/components/DeviceOwnerStamp";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ToastHost } from "@/components/ToastHost";
import { SystemModeProvider } from "@/hooks/useSystemMode";
import "./globals.css";

const thaiSans = Noto_Sans_Thai({
  variable: "--font-thai-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // 🔴 ชื่อ/คำอธิบายต้องเป็นกลาง — แอปนี้ถือทริปหลายประเทศแล้ว (P1 เปิดทริปญี่ปุ่นแล้วแท็บเบราว์เซอร์
  //    ยังเขียนว่า "แพลนเที่ยวเกาหลี" · 4 ก.ย. 2026) — เนื้อหาเฉพาะทริปอยู่ในหน้า ไม่ใช่ใน metadata ของ root
  /**
   * 🔴 **`template` ทำให้ชื่อแบรนด์อยู่ที่เดียวทั้งเว็บ** — หน้าย่อยตั้งแค่ชื่อของตัวเอง
   * ก่อนหน้านี้เป็นสตริงเปล่า ⇒ หน้าที่อยากมีชื่อของตัวเองต้อง **วางสำเนาของ `luitrip` ไว้อีกที่**
   * 🎯 ***สำเนาที่ต้องมีคนซิงก์ จะล้าเสมอ*** — และชื่อนี้เพิ่งเปลี่ยนวันนี้เอง (P7 เจอ · P1 ขอ · P3 แก้)
   *
   * ⚠️ **`template` มีผลกับ *segment ลูก* เท่านั้น ไม่ใช่ segment ที่ประกาศมัน** —
   * `default` จึงไม่ถูกวิ่งผ่าน template · root ได้ `luitrip` เปล่า ไม่ใช่ `luitrip · luitrip`
   * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:285-289`)
   * · หน้าที่ไม่อยากได้ suffix ใช้ `title: { absolute: "…" }`
   * · 📌 `appleWebApp.title` เป็นคนละฟิลด์ **ไม่ตาม template** — ยังเป็น `luitrip` ตามเดิมโดยตั้งใจ
   */
  title: { template: "%s · luitrip", default: "luitrip" },
  description: "เว็บวางแผนทริป เลือกสถานที่และจัดตารางร่วมกัน",
  // ติดตั้งลงหน้าจอโฮมได้ (เฟส 18) — manifest มาจาก app/manifest.ts
  // iOS ไม่อ่านไอคอนจาก manifest ต้องใช้ apple-touch-icon แยกต่างหาก
  appleWebApp: { capable: true, title: "luitrip", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#33564a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${thaiSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cream">
        {/* 🔴 ต้องอยู่นอก `SystemModeProvider` และมาก่อนทุกอย่าง — ตราเจ้าของเป็นของทั้งเครื่อง
            ไม่ใช่ของทริปใดทริปหนึ่ง และไม่ขึ้นกับโหมดของระบบ (`E6-AC14`) */}
        <DeviceOwnerStamp />
        <ServiceWorkerRegistrar />
        <OfflineBanner />
        {/* คนละเรื่องกับ OfflineBanner โดยตั้งใจ — อันบนบอกว่าที่เห็นเป็นของเก่า
            อันนี้บอกว่าของใหม่จะไม่ถูกเก็บไว้เลย (E6-AC7 ครึ่งฝั่งผู้ใช้) */}
        <CacheFullBanner />
        {/* ครอบทั้ง banner และ children — ทั้งคู่อ่านโหมดผ่าน useSystemMode() (banner เป็นคนแรก
            ตอนนี้มี BookingEditModal ที่ลึกลงไปใน children เป็นคนที่สองแล้ว) provider ต้องอยู่เหนือ
            ทุกจุดที่เรียก ไม่ใช่แค่เหนือ banner (ดู hooks/useSystemMode.tsx) */}
        <SystemModeProvider>
          <SystemModeBanner />
          <ToastHost />
          {/* MapsApiProvider **ไม่อยู่ตรงนี้แล้ว** — ย้ายไปครอบเฉพาะหน้าแผนที่ `app/page.tsx`
              `APIProvider` โหลด Google Maps JS SDK ทันทีที่ mount ไม่ว่าจะมีแผนที่ให้วาดหรือไม่
              พออยู่ใน layout ทุกหน้าจึงจ่ายค่านี้ ทั้งที่ `<Map>` มีที่เดียวคือ DayMapPanel ในหน้าแผน
              (`/today` `/summary` ใช้แผนที่แบบ iframe ผ่าน GoogleMapEmbed ซึ่งไม่พึ่ง SDK เลย)
              วัดจริงบน /today: 6 request ไป maps.googleapis.com ~840 KB ที่ไม่ได้ใช้สักไบต์
              — หน้านั้นคือหน้าที่เปิดบ่อยที่สุดตอนอยู่เกาหลีจริงบนเน็ตโรมมิ่ง */}
          {/* 🔴 `TripDataProvider` **ไม่อยู่ตรงนี้แล้วเช่นกัน** — `E5-AC1` — ต้องมี `tripId` จริง
              จะได้ไม่ resolve เอง (ดู `useCustomPlaces.tsx`) แต่ root layout ครอบทุกหน้ารวม `/login`/
              `/account` ที่ไม่ต้องมีทริปเลย จึงย้ายไปอยู่ที่ผู้เรียกแต่ละกลุ่มแทน:
              `/trip/[tripId]/layout.tsx` ใช้ tripId จาก path ตรง ๆ · หน้า bare (`/`,`/today`,`/summary`)
              ใช้ `<BareTripDataProvider>` ที่ resolve ผ่าน `useActiveTripId()` เอง */}
          {children}
        </SystemModeProvider>
      </body>
    </html>
  );
}
