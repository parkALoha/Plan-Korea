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
