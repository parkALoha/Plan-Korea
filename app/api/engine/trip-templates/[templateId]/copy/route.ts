import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getUser, unauthenticatedResponse } from "@/lib/auth/server";
import { copyTripTemplate } from "@/lib/engine/db";
import { rateLimitGuard } from "@/lib/rateLimit";

/**
 * ใช้ทริปแนะนำเป็นทริปของตัวเอง — `POST /api/engine/trip-templates/[templateId]/copy`
 * เจ้าของ: P1-Lead · 5 ก.ย. 2026 · ผู้ใช้สั่งเอง (*"ลองทำ เมืองยอดฮิตก่อน"*)
 *
 * ## 🔴 ทำไมเพิ่งมี ทั้งที่ `copy_trip_template()` อยู่ในฐานมาตั้งแต่ 4 ก.ย.
 * `HomeScreen.tsx:547` เขียนไว้เองว่า *"route ยังไม่มี ⇒ ไม่ผูกปลายทางที่ยังไม่มี"*
 * ⇒ การ์ดทริปแนะนำ **แสดงได้ กดไม่ได้** · ฟังก์ชันในฐานที่ไม่มีเส้นทางไหนเรียกถึง
 * คือสิ่งที่ `TEAM.md §3.5` เรียกว่า ***โค้ดที่ตายแล้ว*** — ไฟล์นี้คือเส้นทางนั้น
 *
 * ## 🔴 ไฟล์นี้ไม่มีด่านของตัวเองสักข้อ และนั่นคือเจตนา
 * ด่านทั้งหมดอยู่ใน RPC (`where published_template_at is not null`) ซึ่งเป็น `security definer`
 * ⇒ ***ห้ามเพิ่ม fallback ที่รับ `tripId` แล้วก๊อปเองโดยไม่ผ่าน RPC นี้*** (`db.ts:1917` เตือนข้อเดียวกัน)
 * ที่นี่ทำแค่สองอย่าง: **ตรวจรูปของอินพุต** และ **แปลง errcode เป็น HTTP ที่ตอบคำถามผู้เรียกได้**
 *
 * ## ⚠️ เพดานคำขอต่ำกว่าเส้นอื่นโดยตั้งใจ
 * ก๊อปหนึ่งครั้ง = insert ข้าม 7 ตาราง (`trips` `trip_members` `trip_destinations` `trip_days`
 * `custom_places` `custom_place_names` `trip_plans` `trip_stops`) ในทรานแซกชันเดียว
 * ⇒ **ราคาต่อคำขอไม่ใช่ระดับเดียวกับ `GET /trip-templates` (60/นาที)** · ผู้ใช้จริงกดปีละไม่กี่ครั้ง
 */
const RATE_LIMIT_PER_MINUTE = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ISO `YYYY-MM-DD` เท่านั้น — เหตุผลเดียวกับ `trips/route.ts:61`: คอลัมน์เป็น `date` อย่าให้ PG เดาแทน */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 120; // `trips_title_check` — ตัดที่นี่เพื่อให้ได้ 400 ที่อ่านรู้เรื่อง ไม่ใช่ 502 จาก constraint

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;

  const limited = rateLimitGuard(req, "engine-trip-template-copy", RATE_LIMIT_PER_MINUTE);
  if (limited) return limited;

  /**
   * 🔴 ตรวจล็อกอินที่นี่ **ทั้งที่ RPC ตรวจเองอยู่แล้ว** — ไม่ใช่การตรวจซ้ำ
   * RPC คืน `42501` ซึ่งแปลว่า *"ล็อกอินแล้วแต่ไม่มีสิทธิ์"* (`403`) ในทุกเส้นทางอื่นของเรา
   * ⇒ ปล่อยให้คนยังไม่ล็อกอินตกลงไปถึงตรงนั้น จะได้ `403` ที่ไคลเอนต์พาไปหน้า login ไม่ได้
   * 🎯 ***`GET` ของทริปแนะนำเปิดให้คนยังไม่ล็อกอินดู — เส้นนี้ปิด · สองคำถามคนละใบ***
   */
  const user = await getUser();
  if (!user) return unauthenticatedResponse();

  if (!UUID.test(templateId)) {
    return NextResponse.json({ error: "templateId ไม่ถูกต้อง" }, { status: 400 });
  }

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "เนื้อคำขอไม่ใช่ JSON" }, { status: 400 });
  }

  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!ISO_DATE.test(startDate)) {
    return NextResponse.json({ error: "วันเริ่มทริปต้องเป็นรูปแบบ YYYY-MM-DD" }, { status: 400 });
  }

  // ⚠️ `""` หลัง trim = *ไม่ได้ตั้งชื่อ* ⇒ ส่ง `null` ให้ RPC ใช้ชื่อของ template
  //    ไม่ใช่ *ตั้งชื่อเป็นค่าว่าง* ซึ่งจะชนกับ `length(trim(title)) between 1 and 120`
  const rawTitle = typeof b.title === "string" ? b.title.trim() : "";
  if (rawTitle.length > MAX_TITLE) {
    return NextResponse.json(
      { error: `ชื่อทริปยาวได้ไม่เกิน ${MAX_TITLE} ตัวอักษร` },
      { status: 400 },
    );
  }
  const title = rawTitle === "" ? null : rawTitle;

  const db = await createServerSupabase();
  const { data, error } = await copyTripTemplate(db, { templateId, startDate, title });

  if (error) {
    const msg = error.message ?? "";
    /**
     * แยก **ด่านทำงาน** ออกจาก **บั๊กเรา** แบบเดียวกับ `trips/route.ts:177`
     * · `P0002` ตั้งใจไม่แยก *"ไม่มีทริปนี้"* ออกจาก *"มีแต่ไม่ใช่ทริปแนะนำ"* (migration บรรทัด ~150)
     * · 🔴 `P0003` = **ก๊อปไม่ครบ ซึ่งเป็นบั๊กของเรา ไม่ใช่คำขอที่ผิด** ⇒ ต้องเป็น 5xx ไม่ใช่ 4xx
     */
    const status =
      error.code === "P0002" ? 404 :
      error.code === "22023" ? 400 :
      error.code === "42501" ? 403 :
      error.code === "PT503" ? 503 : 502;
    return NextResponse.json({ error: msg || "ใช้แผนนี้ไม่สำเร็จ", code: error.code }, { status });
  }

  /**
   * RPC คืนแถว `public.trips` — ไคลเอนต์ต้องการ `id` เพื่อพาไปหน้าทริปที่เพิ่งได้
   * ⚠️ **ตรวจรูปก่อนใช้** — `data` ที่ gen มาเป็นชนิดของแถว แต่ `rpc` คืน `null` ได้เมื่อฟังก์ชัน
   *    คืน `null` ⇒ `data.id` ตรง ๆ จะพังตอนรัน ไม่ใช่ตอนคอมไพล์
   */
  const trip = data as { id?: unknown; title?: unknown; start_date?: unknown; end_date?: unknown } | null;
  if (!trip || typeof trip.id !== "string") {
    return NextResponse.json(
      { error: "ก๊อปแผนแล้วแต่ไม่ได้รหัสทริปกลับมา", code: "NO_TRIP_ID" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      trip: {
        id: trip.id,
        title: typeof trip.title === "string" ? trip.title : "",
        startDate: typeof trip.start_date === "string" ? trip.start_date : startDate,
        endDate: typeof trip.end_date === "string" ? trip.end_date : null,
      },
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
