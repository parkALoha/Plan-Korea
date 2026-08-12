import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { MapsApiProvider } from "@/components/MapsApiProvider";
import { TripDataProvider } from "@/components/TripDataProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
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
        <ServiceWorkerRegistrar />
        <OfflineBanner />
        <MapsApiProvider>
          <TripDataProvider>{children}</TripDataProvider>
        </MapsApiProvider>
      </body>
    </html>
  );
}
