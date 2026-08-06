import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const thaiSans = Noto_Sans_Thai({
  variable: "--font-thai-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "แพลนเที่ยวเกาหลี",
  description: "เว็บวางแพลนเที่ยวเกาหลี เลือกสถานที่ร่วมกัน 2 คน",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${thaiSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cream">{children}</body>
    </html>
  );
}
