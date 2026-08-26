/**
 * ลิงก์นำทางไปจุดหนึ่ง — ให้ครบ 3 แอปเสมอ (ตกลงกันไว้ 7 ส.ค. 2026)
 * เหตุผล: เฟส 1 พิสูจน์แล้วว่า Google DRIVE/WALK คืนค่าว่างในเกาหลี (กฎหมายแผนที่เกาหลี)
 * คนเกาหลีใช้ Naver/Kakao กันจริง แต่ที่ฮานอย Google กลับใช้ได้ดีที่สุด — ให้ผู้ใช้เลือกเองหน้างาน
 * ไม่มี API key ไหนเกี่ยวข้อง เป็นแค่ deep link เปิดแอป/เว็บของแต่ละเจ้า
 *
 * เฟส 14 — **ทุกลิงก์ต้องได้ชื่อภาษาท้องถิ่น** (เกาหลี/เวียดนาม) ไม่ใช่ชื่อไทย
 * เดิมส่ง `place.nameTh` เข้าไปตรงๆ ("ตลาดจากัลชี") ซึ่ง Naver/Kakao ค้นไม่เจอแน่นอน
 * ต้องเป็น "자갈치시장" ถึงจะเจอ — ดู navigationName() ด้านล่าง
 */

/** ชื่อที่ใช้ส่งเข้าแอปแผนที่ — เอาภาษาท้องถิ่นก่อนเสมอ ตกไปอังกฤษ แล้วค่อยไทยเป็นทางสุดท้าย
 *  `cachedLocal` มาจาก place_details_cache.name_local (สำหรับที่เพิ่มเองที่ไม่มี nameLocal ฝังไว้) */
export function navigationName(
  place: { nameLocal?: string; nameEn?: string; nameTh: string },
  cachedLocal?: string | null
): string {
  return place.nameLocal || cachedLocal || place.nameEn || place.nameTh;
}

/** ชื่อที่พักที่ใช้ส่งเข้าแอปแผนที่ — เกาหลี/เวียดนามก่อน แล้วค่อยอังกฤษ สุดท้ายชื่อที่บันทึกไว้ (ซึ่งเป็นไทย)
 *  `trip_hotels.name_local` มาจาก migration 0026 · ที่พักที่บันทึกไว้ก่อนหน้านั้นยังไม่มีค่า
 *  ต้องกดบันทึกใหม่ในหน้าแผนหนึ่งครั้งถึงจะเติมให้ (เฟส 16 ปิดงานค้างของเฟส 14 ข้อนี้) */
export function hotelNavigationName(hotel: {
  name_local?: string | null;
  name_en?: string | null;
  hotel_name: string;
}): string {
  return hotel.name_local || hotel.name_en || hotel.hotel_name;
}

/** ลิงก์เปิดหน้าสถานที่บน Google Maps
 *  รู้ place id → ใช้ `place/?q=place_id:...` ซึ่งชี้ร้านนั้นเป๊ะ ไม่มีทางเพี้ยน
 *  ไม่รู้ → ตกไปค้นด้วยข้อความ ซึ่ง Google จะเดาจากตำแหน่งของคนที่กดลิงก์ (เปิดจากไทยได้ร้านในไทย) */
export function googleMapsPlaceUrl(query: string, googlePlaceId?: string | null): string {
  return googlePlaceId
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(googlePlaceId)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** ลิงก์เว็บ Google Maps มาตรฐาน (api=1) — เปิดแอปบนมือถือ, เปิดเว็บบนคอม ใช้งานได้ทุกที่รวมฮานอย */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

/** Kakao Map "link/to" — URL เว็บทางการ ไม่ต้องใช้ API key เปิดแอป/เว็บให้อัตโนมัติตามเครื่อง
 *  ชื่อที่ส่งไปเป็นแค่ป้ายกำกับหมุด แต่ถ้าเป็นภาษาเกาหลีจะอ่านออกทันทีตอนแอปเปิดขึ้นมา */
export function kakaoMapDirectionsUrl(lat: number, lng: number, name: string): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

/** ลิงก์ค้นหาสถานที่บนเว็บ Naver Map — ใช้เป็น fallback เมื่อแอป Naver Map ไม่ได้ติดตั้ง (nmap:// ไม่มี response ให้เช็ก)
 *  ตรงนี้แหละที่ชื่อภาษาเกาหลีสำคัญที่สุด เพราะเป็นการ "ค้นด้วยข้อความ" ล้วนๆ ไม่ได้ใช้พิกัดเลย */
export function naverMapSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

/** nmap:// URL scheme — เปิดแอป Naver Map นำทางไปจุดหมายตรงๆ ถ้าติดตั้งไว้
 *  ใช้ route/public (ขนส่งสาธารณะ) เป็นค่าเริ่มต้นเพราะเป็นวิธีเดินทางหลักของทริปนี้ในเกาหลี
 *  ⚠️ พารามิเตอร์ชุดนี้ยังไม่ได้ยืนยันบนเครื่องที่ลงแอปจริง — `nmap://` ไม่คืน response ให้เช็ก
 *     ถ้ากดแล้วแอปไม่เปิด ตัว fallback ด้านล่างจะพาไปเว็บ Naver ให้อยู่ดี (ซึ่งทดสอบแล้วว่าใช้ได้) */
export function naverMapAppSchemeUrl(
  lat: number,
  lng: number,
  name: string,
  mode: "public" | "walk" | "car" = "public"
): string {
  return `nmap://route/${mode}?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=plankorea.web`;
}

/**
 * เปิด Naver Map — ลองแอปก่อน (nmap://) ถ้าไม่มีแอปให้ตกไปหน้าค้นหาเว็บแทนหลังรอสั้นๆ
 * (ไม่มีลิงก์เว็บทางการที่นำทางตรงๆ ได้เหมือน Kakao — เอกสาร Naver มีแค่ app scheme)
 */
export function openNaverMap(lat: number, lng: number, name: string) {
  const fallback = naverMapSearchUrl(name);
  const start = Date.now();
  window.location.href = naverMapAppSchemeUrl(lat, lng, name);
  setTimeout(() => {
    if (Date.now() - start < 2200 && !document.hidden) {
      window.location.href = fallback;
    }
  }, 1300);
}

// ═══════════════════════════════════════════════════════════════════════════
// `E4-AC4` — ผู้ให้บริการแผนที่มาจาก *ทะเบียน* ไม่ใช่จากการสมมติที่จุดเรียก
// เจ้าของ: P1-Lead · 27 ส.ค. 2026
// ═══════════════════════════════════════════════════════════════════════════
//
// ## 🔴 สภาพก่อนหน้านี้ และทำไมมันแย่กว่า `if`
// `app/today/page.tsx:126` เรียก `kakaoMapDirectionsUrl()` **ตรง ๆ ไม่มีเงื่อนไข**
// → เปิดทริปญี่ปุ่น **ปุ่ม Kakao ก็ยังขึ้น** และไม่มีบรรทัดไหนผิดให้ใครเห็น
// 🎯 **ไม่มีการตัดสินใจให้ผิด จึงไม่มีอะไรให้ grep เจอ** — `E4-AC2` ที่ค้นหา `if (country === …)`
//    จึงรายงานว่าเหลือ 1 บรรทัด ทั้งที่ของจริงยังผูกกับเกาหลีทั้งหน้า
//
// ## ทำไมต้องเป็น "action" ไม่ใช่ "url"
// Google กับ Kakao เป็น URL เปิดตรงได้ · **Naver ไม่มีลิงก์เว็บที่นำทางตรงได้**
// มีแต่ `nmap://` ที่ต้องลองแล้วตกกลับเว็บถ้าไม่มีแอป (ดู `openNaverMap`)
// 🔴 **ถ้าฝืนให้ทุกเจ้าคืน URL เหมือนกัน Naver จะต้องถูกทำให้เหมือน ซึ่งแปลว่าทำให้แย่ลง**
//    → คืนรูปที่ต่างกันได้ **แล้วให้ผู้เรียก render ตามรูป** ไม่ใช่บังคับให้เหมือน

import { mapProvidersFor, type MapProvider } from "@/lib/engine/countries";

export type MapTarget = { lat: number; lng: number; name: string };

export type MapAction =
  /** ลิงก์ธรรมดา — ใส่ใน `<a href>` ได้เลย */
  | { provider: MapProvider; label: string; kind: "href"; url: string }
  /** ต้องเรียกฟังก์ชัน เพราะมี fallback ที่ทำด้วย `href` เฉย ๆ ไม่ได้ */
  | { provider: MapProvider; label: string; kind: "open"; open: () => void };

const LABEL: Record<MapProvider, string> = {
  google: "Google",
  naver: "Naver",
  kakao: "Kakao",
};

function actionFor(provider: MapProvider, t: MapTarget): MapAction {
  switch (provider) {
    case "google":
      return { provider, label: LABEL.google, kind: "href", url: googleMapsDirectionsUrl(t.lat, t.lng) };
    case "kakao":
      return { provider, label: LABEL.kakao, kind: "href", url: kakaoMapDirectionsUrl(t.lat, t.lng, t.name) };
    case "naver":
      return { provider, label: LABEL.naver, kind: "open", open: () => openNaverMap(t.lat, t.lng, t.name) };
  }
}

/**
 * ปุ่มนำทางที่ควรแสดงสำหรับประเทศนี้ **เรียงตามลำดับของทะเบียน**
 *
 * 🎯 **นี่คือที่เดียวที่แปลง "ประเทศ" เป็น "ปุ่มไหนบ้าง"** — ผู้เรียกไม่ต้องรู้จักชื่อผู้ให้บริการเลย
 * · ประเทศที่ยังไม่มีในทะเบียน (เช่น ญี่ปุ่นวันนี้) ได้ `["google"]` — **ใช้งานได้ ไม่ใช่ปุ่มหาย**
 * · 🔴 **`switch` ตัวเดียวในไฟล์นี้ ไม่ใช่ `switch` กระจายตามหน้า** — เพิ่มผู้ให้บริการรายใหม่
 *   แก้ที่นี่ที่เดียว และ `switch` จะไม่ compile ถ้าลืมเคสใหม่ (`MapProvider` เป็น union)
 */
export function mapActionsFor(
  countryCode: string | null | undefined,
  target: MapTarget
): MapAction[] {
  return mapProvidersFor(countryCode).map((p) => actionFor(p, target));
}
