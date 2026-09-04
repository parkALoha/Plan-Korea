import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { listCatalogCityNames, listSupportedCountries } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * รายชื่อประเทศที่รองรับ — ขั้นแรกของ picker "เลือกประเทศ → เลือกเมือง" (`E5`)
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026 · ขอโดย P2 สำหรับ `TripDestinationPicker`
 *
 * ลำดับเดียวกับ route อื่นทุกตัว: `rateLimitGuard → getUser() → createServerSupabase() → db`
 * **ไม่มีบรรทัดไหนกรองสิทธิ์เอง** — คลังเป็นข้อมูลสาธารณะที่ `authenticated` มี `select` อยู่แล้ว (`D38`)
 *
 * 🔴 **ไม่มี `limit` โดยตั้งใจ — และนั่นคือความต่างจาก `/cities` ไม่ใช่ของที่ลืม**
 * ประเทศเป็นข้อมูล**ปลายปิด** (วันนี้ 4) · เมืองเป็นข้อมูล**ปลายเปิด** (โตขึ้นทุกครั้งที่ seed)
 * · ใส่ `limit` ที่นี่จะสร้างกับดักเดียวกับที่ `/cities` มี: **ตัดหลังเรียง = ของท้ายลิสต์หายเงียบ**
 *   ซึ่งที่ชั้นประเทศแปลว่า **"ประเทศนั้นไม่มีในระบบ"** ในสายตาผู้ใช้ ทั้งที่มี
 *
 * 🔴 **`supported = true` กรองในฐาน ไม่ใช่ที่นี่ และไม่ใช่ฝั่ง UI**
 * ผู้ใช้สั่งว่าจุดหมาย *"ต้องอยู่ในลิสของเรา"* — ถ้ากรองฝั่ง UI ลิสต์จริงยังเปิดอยู่
 * · และถ้า hardcode รายชื่อในโค้ด มันจะหลุดจากคลังทันทีที่มีคนเพิ่มประเทศที่ 5 (`D48`)
 *
 * ⚠️ **ต้องรัน migration `20260828001500` ก่อน** ไม่งั้นตอบ 502 (`column ... does not exist`)
 * · route นี้ใหม่ทั้งอัน วันนี้ยังตอบ 404 อยู่ → **ไม่มีอะไรที่เคยทำงานแล้วพังเพราะไฟล์นี้**
 *   (ต่างจาก `fad69d0` ที่ผมแก้ `select` ของเส้นทางที่คนใช้อยู่ ก่อนฐานจะมีคอลัมน์ → 502 ทั้งเว็บ)
 */
const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-countries", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  try {
    const db = await createServerSupabase();
    const { data, error } = await listSupportedCountries(db);
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }

    /**
     * 🔴 **จำนวนเมือง + ชื่อตัวอย่าง — เพิ่ม 4 ก.ย. 2026 (ขอโดย P2 สำหรับการ์ดประเทศบนหน้าแรก)**
     *
     * ⚠️ **คำขอที่สองล้มแล้ว *ต้องไม่* ทำให้ทั้งเส้นล้ม** — รายชื่อประเทศคือของจำเป็น
     * ตัวเลขเมืองเป็นของประดับ · ล้มแล้วส่ง `null` ไป **ไม่ใช่ `0`**
     * 🎯 ***`0` แปลว่า "ประเทศนี้ไม่มีเมือง" ซึ่งเป็นคำกล่าวอ้างที่เราไม่ได้วัด ·
     *    `null` แปลว่า "ยังไม่รู้" ซึ่งเป็นความจริง*** — และ UI เลือกแสดงต่างกันได้
     * · 🔴 P2 จองที่ว่างของช่องนี้ไว้แล้วโดยไม่เติมของปลอม ⇒ `null` เข้ากับที่เขาทำพอดี
     */
    let cityCount: Record<string, number> | null = null;
    let sampleCities: Record<string, string[]> | null = null;
    const cities = await listCatalogCityNames(db);
    if (!cities.error && cities.data) {
      cityCount = {};
      sampleCities = {};
      for (const c of cities.data) {
        cityCount[c.country_id] = (cityCount[c.country_id] ?? 0) + 1;
        const s = (sampleCities[c.country_id] ??= []);
        if (s.length < 3) s.push(c.name_th);
      }
    }

    const withCounts = (data ?? []).map((c) => ({
      ...c,
      // `?? null` ไม่ใช่ `?? 0` — ประเทศที่เปิดแต่ยังไม่มีเมือง กับ อ่านคลังไม่ได้ **คนละเรื่อง**
      cityCount: cityCount ? (cityCount[c.id] ?? 0) : null,
      sampleCities: sampleCities ? (sampleCities[c.id] ?? []) : null,
    }));
    // เปลี่ยนน้อยที่สุดในระบบ แต่ผลผูกกับตัวตนผู้เรียก (ต้องล็อกอิน) → `private` ไม่ใช่ `public`
    // ⚠️ อายุสั้นกว่าที่ข้อมูลสมควรได้ **โดยตั้งใจ** — เปิดประเทศใหม่แล้วต้องเห็นภายในนาที
    //    ไม่ใช่รอผู้ใช้ล้างแคช · แคชที่ยาวเกินทำให้ "เพิ่มแล้วไม่ขึ้น" อ่านเหมือนของพัง
    return NextResponse.json(withCounts, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายชื่อประเทศไม่ได้" },
      { status: 502 },
    );
  }
}
