/**
 * ลิงก์นำทางไปจุดหนึ่ง — ให้ครบ 3 แอปเสมอ (ตกลงกันไว้ 7 ส.ค. 2026)
 * เหตุผล: เฟส 1 พิสูจน์แล้วว่า Google DRIVE/WALK คืนค่าว่างในเกาหลี (กฎหมายแผนที่เกาหลี)
 * คนเกาหลีใช้ Naver/Kakao กันจริง แต่ที่ฮานอย Google กลับใช้ได้ดีที่สุด — ให้ผู้ใช้เลือกเองหน้างาน
 * ไม่มี API key ไหนเกี่ยวข้อง เป็นแค่ deep link เปิดแอป/เว็บของแต่ละเจ้า
 */

/** ลิงก์เว็บ Google Maps มาตรฐาน (api=1) — เปิดแอปบนมือถือ, เปิดเว็บบนคอม ใช้งานได้ทุกที่รวมฮานอย */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

/** Kakao Map "link/to" — URL เว็บทางการ ไม่ต้องใช้ API key เปิดแอป/เว็บให้อัตโนมัติตามเครื่อง */
export function kakaoMapDirectionsUrl(lat: number, lng: number, name: string): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

/** ลิงก์ค้นหาสถานที่บนเว็บ Naver Map — ใช้เป็น fallback เมื่อแอป Naver Map ไม่ได้ติดตั้ง (nmap:// ไม่มี response ให้เช็ก) */
export function naverMapSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

/** nmap:// URL scheme — เปิดแอป Naver Map นำทางเดินไปจุดหมายตรงๆ ถ้าติดตั้งไว้ */
export function naverMapAppSchemeUrl(lat: number, lng: number, name: string): string {
  return `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=plankorea.web`;
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
