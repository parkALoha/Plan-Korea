import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { customPlacesOfTrip, oneCustomPlace } from "@/lib/engine/customPlaces";
import { createCustomPlace, softDeleteCustomPlace } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";
import type { CustomPlace } from "@/lib/supabase";

/**
 * คลังสถานที่ของทริป — **route ตัวแรกของ `E3` และเป็นแม่แบบของอีก 9 ตัว**
 * เจ้าของ: P1-Lead · 26 ส.ค. 2026
 *
 * ## ลำดับที่ทุก route ของ `E3` ต้องเดินเหมือนกัน
 * ```
 * rateLimitGuard → getUser() (401) → createServerSupabase() → lib/engine/* → NextResponse.json
 * ```
 * **ไม่ได้คิดรูปใหม่** — รูปนี้มาจาก route สตรีมไฟล์ที่ P3 กับผมทำไว้ก่อน (`app/api/booking-file/…`
 * ลบทิ้งแล้ว 26 ส.ค. 2026 เพราะไม่มีใครเรียก) · เขียนตัวรูปแบบไว้ตรงนี้แทนการอ้างถึงไฟล์
 * 🔴 **เพราะการอ้างถึงไฟล์ที่ถูกลบ คือคำตอบที่ชี้ไปที่ไม่มีอยู่จริง** (`P-73`)
 *
 * ## 🔴 `createServerSupabase()` ผูก session ผู้ใช้ — **ไม่ใช่ service role**
 * `D38` — *ย้ายมาเซิร์ฟเวอร์ไม่ได้แปลว่าได้สิทธิ์เพิ่ม* · **RLS ยังเป็นคนกรองทุกแถวเหมือนตอนอยู่บนเบราว์เซอร์**
 * · ไฟล์นี้จึง **ไม่มีบรรทัดไหนตรวจว่าใครเป็นเจ้าของทริป** และนั่นคือความตั้งใจ ไม่ใช่การลืม
 *   เขียนเองเมื่อไหร่ = แหล่งความจริงที่สองเรื่องสิทธิ์ ที่ต้องคอยให้ตรงกับ policy ตลอดไป (`P-15`)
 *
 * ## 🎯 `getUser()` มีไว้ให้ *สถานะถูก* ไม่ใช่ให้ *ข้อมูลปลอดภัย* (P4 · 26 ส.ค. 2026)
 * ถ้าลืมบรรทัดนี้ คนไม่ล็อกอินจะเป็น `anon` → RLS คืน 0 แถวอยู่ดี
 * **สิ่งที่พังคือ `200` แทน `401` ไม่ใช่ข้อมูลรั่ว** — ผมเคยจะให้ P6 สร้างด่านตรวจ *ลำดับการเรียก*
 * และ P4 ค้านว่ามันเป็นด่านที่ต้องรู้หน้าตาของโค้ด → **ด่านที่ต้องเดา**
 * ✅ ท่าที่รับแทน: **ไล่ไฟล์ `app/api/engine/** /route.ts` จากดิสก์ แล้วยิงทุกเส้นแบบไม่ล็อกอิน ต้องได้ `401`**
 *    → **route ตัวที่ 11 ถูกครอบเองเพราะมันเป็นไฟล์บนดิสก์ ไม่มีใครต้องเขียนเคสให้มัน**
 *
 * ## 🔴 `tripId` มาจาก **path** ไม่ใช่ query · และไม่ใช่การเดาจาก session (P3 · 26 ส.ค. 2026)
 * `E3-AC6`/`D11` บังคับให้เช็คสมาชิกภาพ **นอกและก่อน** ฟังก์ชันที่ถูกแคช
 * → route ต้องรู้ `tripId` ตั้งแต่ก่อนเรียก `db.ts` เสมอ · **query param ลืม validate ง่ายกว่ามาก**
 * · **`tripId` ต้องอยู่ใน path ทุก route ของ `E3` — รูปเดียวกันทั้งระบบ** (มติเดิม ไม่ใช่ของใหม่)
 * · 📌 `soleTrip()` (`lib/engine/trip.ts`) ยังมีที่ใช้ — **ที่หน้าเพจ ตอนตัดสินว่าจะพาไปทริปไหน**
 *   ไม่ใช่ที่นี่ · วันที่ `E5-AC1` มี `/trip/[tripId]` แล้ว หน้าเพจจะส่ง id ต่อมาให้ตรง ๆ
 *
 * ## 🔴 คืน `CustomPlace[]` — รูปเดิมที่ UI ใช้อยู่ ไม่ใช่รูปของตาราง
 * ชั้นแปลงรูปอยู่ที่ [`lib/engine/customPlaces.ts`](../../../../lib/engine/customPlaces.ts)
 * · **`tsc` เป็นคนบังคับว่ารูปไม่เพี้ยน** (P4) — ไม่ต้องมีเคสเทียบสองฝั่ง ซึ่งจะกลายเป็นการเทียบสำเนา
 */

const RATE_LIMIT_PER_MINUTE = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const limited = rateLimitGuard(req, "engine-custom-places", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const { tripId } = await params;
  // 🔴 ตรวจรูปแบบก่อนส่งเข้าฐาน — ไม่ใช่เพื่อความปลอดภัย (RLS ทำหน้าที่นั้น)
  //    แต่เพราะ uuid ที่ผิดรูปทำให้ PostgREST คืน `22P02` ซึ่งอ่านไม่ออกว่าเกิดอะไรขึ้น
  if (!UUID.test(tripId)) {
    return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();

  try {
    const places: CustomPlace[] = await customPlacesOfTrip(db, tripId);
    // 🔴 `no-store` — ข้อมูลรายทริปห้ามถูกแคชที่ชั้นไหนก็ตามที่ไม่รู้จัก RLS (`D11`/`E3-AC6`)
    //    การ hit แคช = ข้าม DB = ข้าม RLS · และแคชที่ผิดคนอ่านไม่ออกเลยว่าผิด
    return NextResponse.json(places, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "อ่านคลังสถานที่ไม่ได้" },
      { status: 502 }
    );
  }
}

/**
 * เพิ่มสถานที่ลงคลังของทริป
 *
 * 🔴 **คืนแถวที่สร้างแล้วในรูปเดิม ไม่ใช่แค่ `id`** — ฝั่ง hook ต้องเอาไปใส่ state ทันที
 * และถ้าคืนแค่ `id` มันจะต้องประกอบรูปเองที่ฝั่ง client **ซึ่งคือ join ตัวที่สอง** ที่ P3 ห้ามไว้
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const limited = rateLimitGuard(req, "engine-custom-places", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  const { tripId } = await params;
  if (!UUID.test(tripId)) {
    return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });
  }

  let body: Partial<CustomPlace>;
  try {
    body = (await req.json()) as Partial<CustomPlace>;
  } catch {
    return NextResponse.json({ error: "อ่าน body ไม่ได้" }, { status: 400 });
  }

  // ⚠️ ตรวจช่องที่ **ฐานบังคับ** เท่านั้น — ไม่ใช่ตรวจซ้ำสิ่งที่ `check` ตรวจอยู่แล้ว
  //    ตรวจซ้ำ = กฎสองที่ที่ต้องคอยให้ตรงกัน (`P-15`) · ที่นี่ตรวจเพื่อให้ **ข้อความอ่านออก**
  if (!body.city || !body.category || !body.maps_query || !body.name_th) {
    return NextResponse.json(
      { error: "ต้องมี city · category · maps_query · name_th" },
      { status: 400 }
    );
  }
  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat/lng ต้องเป็นตัวเลข" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { data: newId, error } = await createCustomPlace(db, {
    tripId,
    citySlug: body.city,
    category: body.category,
    lat: body.lat,
    lng: body.lng,
    mapsQuery: body.maps_query,
    nameTh: body.name_th,
    nameEn: body.name_en,
    nameKo: body.name_ko,
    description: body.description,
    googlePlaceId: body.google_place_id,
    legacyAddedBy: body.added_by,
  });

  if (error || !newId) {
    // 🔴 `42501` ต้องเดินทางถึงไคลเอนต์เป็น `403` — `writeGuard` แยกชนิดจาก `code` ไม่ได้ถ้าเราแปลงทิ้ง
    const status = error?.code === "42501" ? 403 : error?.code === "23503" ? 400 : 502;
    return NextResponse.json(
      { error: error?.message ?? "สร้างสถานที่ไม่สำเร็จ", code: error?.code },
      { status }
    );
  }

  try {
    const created = await oneCustomPlace(db, tripId, newId as unknown as string);
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    // แถวถูกสร้างแล้วจริง แต่เราอ่านกลับไม่ได้ — **ห้ามบอกว่าล้มเหลว** ผู้ใช้จะกดซ้ำแล้วได้สองแถว
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "สร้างแล้วแต่อ่านกลับไม่ได้", id: newId },
      { status: 207 }
    );
  }
}

/**
 * ลบสถานที่ที่ผู้ใช้เพิ่มเอง — `DELETE /api/engine/trips/[tripId]/custom-places?placeId=<uuid>`
 * เจ้าของ: P1-Lead · 4 ก.ย. 2026
 *
 * ## 🔴 ทำไมเพิ่งมี ทั้งที่ฐานพร้อมมาตั้งแต่ 25 ส.ค.
 * `soft_delete_custom_place(uuid)` มีอยู่แล้ว · `grant execute … to authenticated` ก็ให้แล้ว
 * (`20260825142949_e2_soft_delete_rpc.sql:118`) · RPC ตรวจสิทธิ์ครบทั้ง `can_read_trip` และ `can_write_trip`
 * **ขาดแค่ทางเข้าจากเว็บ** ⇒ ผู้ใช้กด "ลงคลัง" แล้วเอาออกไม่ได้อีกเลย
 * · 🎯 ***ใบที่สามของวันนี้ที่รูปเหมือนกันเป๊ะ: ความสามารถอยู่ในฐาน · ไม่มี route*** (คู่กับ `create_trip` · `trip_destinations`)
 *
 * ## ⚠️ `placeId` มาทาง query ไม่ใช่ body — เพราะ `DELETE` ที่มี body ถูกพร็อกซีบางตัวตัดทิ้ง
 * รูปเดียวกับ `DELETE /hotels?checkIn=&checkOut=` และ `DELETE /hidden-places` ที่มีอยู่แล้ว
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;

  const limited = rateLimitGuard(req, "engine-custom-places", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;
  const user = await getUser();
  if (!user) return unauthenticatedResponse();
  if (!UUID.test(tripId)) return NextResponse.json({ error: "tripId ไม่ถูกต้อง" }, { status: 400 });

  const placeId = req.nextUrl.searchParams.get("placeId");
  if (!placeId || !UUID.test(placeId)) {
    return NextResponse.json({ error: "placeId ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await createServerSupabase();
  const { error } = await softDeleteCustomPlace(db, placeId);
  if (error) {
    // 🔴 **สามความล้มเหลวที่ผู้ใช้ต้องแยกออกจากกัน — ยุบเป็น 502 เดียวคือบอกว่า "ระบบพัง" ทั้งที่เขาแก้ได้เอง**
    //    RPC โยนข้อความไทยมาแล้ว (`…150942_e2_soft_delete_rpc_messages.sql`) จึงส่งต่อได้ตรง ๆ
    const msg = error.message ?? "";
    // trigger `custom_places_not_in_use` — ยังถูกใช้เป็นจุดแวะอยู่ · `409` เพราะเป็นความขัดแย้งของ *สถานะ*
    // ไม่ใช่ของ *คำขอ* · ผู้ใช้แก้ได้ด้วยการเอาออกจากวันก่อน
    if (/ใช้อยู่|in use|not_in_use/i.test(msg)) {
      return NextResponse.json(
        { error: "สถานที่นี้ยังถูกใช้เป็นจุดแวะอยู่ — เอาออกจากวันก่อนแล้วค่อยลบ", code: "PLACE_IN_USE" },
        { status: 409 }
      );
    }
    if (/ไม่มีสิทธิ์/.test(msg) || error.code === "42501") {
      return NextResponse.json({ error: msg || "ไม่มีสิทธิ์แก้ทริปนี้", code: "42501" }, { status: 403 });
    }
    // 🔴 "ไม่พบ" = `404` ไม่ใช่ `502` — และมันครอบ *ลบไปแล้ว* ด้วย ซึ่งเป็นสภาพที่กดซ้ำแล้วเจอปกติ
    if (/ไม่พบ/.test(msg)) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: msg || "ลบไม่สำเร็จ", code: error.code }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
