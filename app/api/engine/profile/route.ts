import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { profileOf, updateDisplayName } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * โปรไฟล์ของผู้เรียก — `GET` อ่าน · `PATCH` แก้ชื่อที่แสดง
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026 · ผู้ใช้สั่งรื้อหน้า `/account`
 *
 * ## 🔴 ทำไมเส้นนี้ต้องมี ทั้งที่ฐานเปิดให้ไคลเอนต์เขียนได้อยู่แล้ว
 * `20260825122247:71` `grant update (display_name, locale, home_country) on profiles` มีมาตั้งแต่ 25 ส.ค.
 * **แต่ไม่มีที่ไหนในเว็บเรียกใช้มันเลย** ⇒ ชื่อผู้ใช้ถูกเก็บใน `localStorage` ของเครื่องเดียว
 * (`TripSettingsModal.tsx:21` เขียนไว้เอง) ⇒ ***เพื่อนร่วมทริปไม่มีวันเห็นชื่อเขา***
 * 🎯 **สิทธิ์ที่ไม่มีใครเรียก ไม่ได้แปลว่าฟีเจอร์มีอยู่** — รูปเดียวกับข้อ 6/7 ใน `TEAM.md §3.5`
 *
 * ## ⚠️ ไม่รับ `locale` / `home_country` ทั้งที่ `grant` ให้ไว้ — **โดยตั้งใจ**
 * ยังไม่มีหน้าไหนแก้สองอย่างนี้ ⇒ รับมาก็ไม่มีใครส่ง แต่**เพิ่มพื้นผิวให้ของที่ยังไม่มีคนตรวจ**
 * 🔴 วันที่จะเปิด ให้เปิดพร้อมหน้าที่ใช้มัน **และอ่าน `§3.4` เรื่องการขยายชุดฟิลด์ก่อน** —
 *    ชุดที่โตขึ้นทำให้ช่องที่เคยปลอดภัยเพราะชุดมันเล็ก กว้างพอจะเดินผ่าน
 */
const RATE_LIMIT_PER_MINUTE = 60;
const NAME_MAX = 60;

export async function GET(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-profile", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const db = await createServerSupabase();
  const { data, error } = await profileOf(db, user.id);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
  }
  // 🔴 แถวโปรไฟล์ถูกสร้างโดย trigger ตอนสมัคร — แต่ **บัญชีเก่าที่สมัครก่อน trigger จะไม่มีแถว**
  //    ⇒ `404` ตรงนี้เป็นสถานะที่เกิดได้จริง ไม่ใช่เคสที่เป็นไปไม่ได้ · อย่าแปลงเป็น `502`
  if (!data) {
    return NextResponse.json({ error: "ไม่พบโปรไฟล์", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(
    { profile: { id: data.id, displayName: data.display_name, locale: data.locale } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const limited = rateLimitGuard(req, "engine-profile-write", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  let body: { displayName?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body ต้องเป็นอ็อบเจกต์" }, { status: 400 });
  }
  if (typeof body.displayName !== "string") {
    return NextResponse.json({ error: "displayName ต้องเป็นข้อความ" }, { status: 400 });
  }

  // 🔴 `trim` **ก่อน** วัดความยาว — ไม่งั้น "   " ผ่านด่านความยาวแล้วลงฐานเป็นชื่อว่าง
  const displayName = body.displayName.trim();
  if (displayName === "") {
    return NextResponse.json({ error: "ชื่อที่แสดงห้ามว่าง" }, { status: 400 });
  }
  // ⚠️ นับด้วย `Array.from` ไม่ใช่ `.length` — `.length` นับ UTF-16 code unit
  //    ⇒ อีโมจิหนึ่งตัวถูกนับเป็น 2 และชื่อไทยที่มีสระ/วรรณยุกต์ก็นับต่างจากที่คนเห็น
  //    🎯 **เพดานที่ผู้ใช้มองไม่เห็นวิธีนับ ต้องนับแบบที่เขาเห็น**
  if (Array.from(displayName).length > NAME_MAX) {
    return NextResponse.json(
      { error: `ชื่อที่แสดงยาวเกิน ${NAME_MAX} ตัวอักษร` },
      { status: 400 },
    );
  }

  const db = await createServerSupabase();
  const { data, error } = await updateDisplayName(db, user.id, displayName);
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: error.message, code: "42501" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
  }
  // 🔴 **`data` เป็น null = RLS กรองแถวออก ไม่ใช่ "สำเร็จแต่ไม่มีอะไรเปลี่ยน"**
  //    PostgREST คืน 0 แถวโดยไม่ใช่ error เมื่อ policy ไม่ให้ผ่าน ⇒ ตอบ `200 ok` ตรงนี้
  //    จะเป็นการบอกผู้ใช้ว่าชื่อเปลี่ยนแล้วทั้งที่ฐานไม่ขยับเลย
  //    🎯 ***"ไม่มีแถวถูกแก้" กับ "แก้สำเร็จ" อ่านเหมือนกันจากฝั่งนี้ ถ้าไม่ถามให้ชัด***
  if (!data) {
    return NextResponse.json(
      { error: "แก้โปรไฟล์ไม่ได้ — ไม่พบแถวของคุณ", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { ok: true, profile: { id: data.id, displayName: data.display_name } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
