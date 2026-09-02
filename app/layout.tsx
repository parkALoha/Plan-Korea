import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { OfflineBanner } from "@/components/OfflineBanner";
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
  title: "แพลนเที่ยวเกาหลี",
  description: "เว็บวางแพลนเที่ยวเกาหลี เลือกสถานที่ร่วมกัน 2 คน",
  // ติดตั้งลงหน้าจอโฮมได้ (เฟส 18) — manifest มาจาก app/manifest.ts
  // iOS ไม่อ่านไอคอนจาก manifest ต้องใช้ apple-touch-icon แยกต่างหาก
  appleWebApp: { capable: true, title: "เที่ยวเกาหลี", statusBarStyle: "default" },
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
