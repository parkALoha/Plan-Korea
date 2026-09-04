import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/auth/server";
import { listPublicDestinations } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * รายชื่อประเทศที่รองรับ — ขั้นแรกของ picker "เลือกประเทศ → เลือกเมือง" (`E5`)
 * เจ้าของ: P1-Lead · 27 ส.ค. 2026 · **เปิดให้คนยังไม่ล็อกอิน 4 ก.ย. 2026 (ผู้ใช้สั่ง)**
 *
 * ## 🔴 ไม่มี `getUser()` แล้ว — และนั่นคือทั้งหมดที่เปลี่ยนในเชิงพฤติกรรม
 * ผู้ใช้สั่งว่า *"คนที่ไม่ได้ล็อกอิน ควรจะเข้าหน้าแรกได้ … ลองดู คลิกนู้นนี่ … แต่สร้างทริปไม่ได้"*
 * ⇒ **รายชื่อประเทศคือของที่ต้องเห็นก่อนตัดสินใจสมัคร** · กั้นไว้ = กั้นคนที่ยังไม่รู้ว่าเว็บทำอะไรได้
 *
 * ## 🔴 แต่ `anon` **ไม่ได้** สิทธิ์บนตารางคลังสักใบ — ข้อมูลออกทาง RPC เท่านั้น
 * `anon key` อยู่ใน bundle ของทุกหน้า ⇒ `grant select on catalog_countries to anon`
 * = ใครก็ยิง PostgREST ตรงได้ **เลือกคอลัมน์เองและไม่มีเพดานแถว** ข้าม route นี้กับ `rateLimitGuard` ไปเลย
 * 🎯 ***definer ให้ *ข้อมูล* โดยไม่ให้ *ตาราง* — ความต่างนี้คือเหตุผลทั้งหมดที่ไม่ใช้ `grant` ตรง***
 * · P4 ค้านร่างแรกของผมที่ `grant` ตรง และเขาถูก · ทะเบียนข้อ 9 ใน `TEAM.md`
 *
 * ## ✅ รูปคำตอบเหมือนเดิมทุกคีย์ — ผู้เรียกเดิมไม่ต้องแก้อะไร
 * `id · name_th · name_en · cityCount · sampleCities`
 * · 🔴 **ฉบับก่อนรวม `cityCount` เองด้วยคำขอที่สอง (`listCatalogCityNames`) — ตัดทิ้งแล้ว**
 *   ฐานนับมาให้ในคำสั่งเดียว **และนับถูกกว่า** (ฉบับเดิมนับจากหน้าที่ดึงมาได้ ไม่ใช่ทั้งคลัง)
 * · ⚠️ **`cityCount` เป็น `number` เสมอแล้ว ไม่มี `null` อีก** — `null` เดิมแปลว่า *"คำขอที่สองล้ม"*
 *   ซึ่งเป็นสภาพที่หายไปพร้อมคำขอที่สอง · **ผู้เรียกที่เช็ค `null` ไว้ ไม่พังแต่โค้ดนั้นตายแล้ว**
 *
 * ## 🔴 ไม่มี `limit` โดยตั้งใจ — เหมือนเดิม
 * ประเทศเป็นข้อมูล**ปลายปิด** · ตัดหลังเรียง = ประเทศท้ายลิสต์หายเงียบ ซึ่งผู้ใช้อ่านว่า *"ไม่มีในระบบ"*
 * (เพดาน 100 อยู่ในตัว RPC เผื่อไว้ — ไม่ใช่การแบ่งหน้า)
 */
const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  // 🔴 `rateLimitGuard` สำคัญกว่าเดิม ไม่ใช่เท่าเดิม — เส้นนี้ไม่มีด่านล็อกอินคั่นอีกแล้ว
  const limited = rateLimitGuard(req, "engine-countries", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  try {
    const db = await createServerSupabase();
    const { data, error } = await listPublicDestinations(db);
    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }

    const rows = (data ?? []).map((c) => ({
      id: c.id,
      name_th: c.name_th,
      name_en: c.name_en,
      cityCount: c.city_count,
      sampleCities: c.sample_cities ?? [],
    }));

    // 🔴 `public` ไม่ใช่ `private` แล้ว — คำตอบ **ไม่ผูกกับตัวตนผู้เรียกอีกต่อไป** ทุกคนได้ก้อนเดียวกัน
    //    (เหตุผลเดิมที่เขียนว่า `private` คือ "ต้องล็อกอิน" ซึ่งเลิกจริงไปพร้อมกับ `getUser()`)
    // ⚠️ อายุสั้นกว่าที่ข้อมูลสมควรได้ **โดยตั้งใจ** — เปิดประเทศใหม่แล้วต้องเห็นภายในนาที
    //    แคชยาวเกินทำให้ "เพิ่มแล้วไม่ขึ้น" อ่านเหมือนของพัง
    return NextResponse.json(rows, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านรายชื่อประเทศไม่ได้" },
      { status: 502 },
    );
  }
}
