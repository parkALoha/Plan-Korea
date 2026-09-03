import { describe, expect, it } from "vitest";
import { testClient } from "./_testClient";
import { lookupPlace } from "@/lib/googlePlaces";
import { warmTargets } from "@/lib/engine/cacheWarmList";
import { warmCache, type WarmRow } from "@/lib/engine/cacheWarmWrite";
import {
  catalogKeyRows,
  cachedDetailKeys,
  cachedPhotoKeys,
  catalogPublicMapsQueries,
} from "@/lib/engine/db";

/**
 * **`Q3` ก้าวที่ 2 · ตัวรันจริงของการอุ่นแคช** · P1 · 3 ก.ย. 2026
 *
 * ## 🔴 ทำไมมันเป็นไฟล์ `.test.ts` ทั้งที่มันไม่ใช่เทสต์
 * `lib/engine/db.ts` มี `import "server-only"` เป็น **ด่านโครงสร้าง** — โค้ดนั้นรันนอก Next ไม่ได้
 * และ `vitest.config.mts` เป็น **ที่เดียวในรีโปที่ alias `server-only` เป็น noop** (บรรทัด 110)
 * ⇒ **นี่คือรันไทม์เดียวที่เรียกโค้ดชั้นข้อมูลจากนอกเว็บได้ โดยไม่ต้องถอดด่านนั้น**
 * · 📌 รูปเดียวกับ `rlsMatrix.test.ts` (`RLS_MATRIX_REQUIRED=1`) และ `tripDataInBundle.test.ts`
 *   (`BUNDLE_GUARD_REQUIRED=1`) — **มีอยู่แล้วสองใบในรีโปนี้ ไม่ใช่แบบแผนใหม่**
 *
 * ## 🔴 ไฟล์นี้ **เขียนฐานจริงและยิง Google จริง (มีค่าใช้จ่าย)**
 * · **ข้ามตัวเองเสมอ** เว้นแต่ตั้ง `CACHE_WARM_RUN=1` ชัดเจน
 * · ⚠️ **การข้ามที่นี่ *ถูกต้อง* ไม่ใช่ช่อง** — ต่างจากด่านที่ข้ามแล้วอ่านเป็นเขียว เพราะไฟล์นี้
 *   **ไม่ได้ยืนยันอะไรเลยเกี่ยวกับสภาพของระบบ** · ตัวที่ยืนยันคือ `cacheHeartbeat.test.ts` ซึ่งเป็นด่านจริง
 * · 🔴 **ไม่มีทางที่ไฟล์นี้จะรันโดยบังเอิญในชุดเต็ม** — ต้องมีคนตั้งธง และต้องมี `service_role` + คีย์ Google
 *
 * ## สิ่งที่ไฟล์นี้ *ไม่* ทำ
 * · **ไม่รีเฟรชของเก่า** — `warmTargets()` คัดเฉพาะคีย์ที่ยังไม่มีแถว
 *   🔴 การรีเฟรชต้องมี TTL ก่อน และ **ยังไม่มีมติ** (ดู `README § Q3` — เป็นการแลกระหว่างค่า API
 *   กับความถูกต้องของข้อมูล ซึ่งเจ้าของเป็นคนตัดสิน)
 * · **ไม่แตะ `place_details_local_cache`** — ตารางนั้นถือชื่อ/ที่อยู่ท้องถิ่น (`D77`) ปิดสนิท
 *   📌 แถวที่ `route` เคยเขียนสมัยก่อน `Q3` มี `name_local`/`address_local` อยู่ด้วย
 *      **คอลัมน์พวกนั้นถูกย้ายออกจาก `place_details_cache` ไปแล้ว** — ตัวเขียนนี้จึงไม่มีมันโดยตั้งใจ
 */
const RUN = process.env.CACHE_WARM_RUN === "1";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIMIT = (() => {
  // 🔴 GitHub Actions ให้ input ที่เว้นว่างเป็น **สตริงว่าง ไม่ใช่ undefined** — `??` จับไม่ได้
  //    (P6 เจอกับ `CACHE_MAX_MISSING_*` · `Number("") === 0` = เพดาน 0 ที่ไม่มีใครตั้งใจ)
  const raw = (process.env.CACHE_WARM_LIMIT ?? "").trim();
  return raw === "" ? 25 : Number(raw);
})();

/** ตรงกับที่ `app/api/place-details/route.ts` ใช้ตอนดึงของสด — **ห้ามแยกกัน** */
const FIELD_MASK =
  "places.id,places.regularOpeningHours,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.reviews";

describe("Q3 ก้าวที่ 2 — อุ่นแคช (ต้องตั้ง CACHE_WARM_RUN=1)", () => {
  /**
   * 🔴 **จงใจ *ไม่* ใช้ `it.runIf`/`describe.skipIf`** — รีโปนี้มีด่านที่ทำให้ชุดเต็ม `exit 1`
   * ทันทีที่มีเคสถูกข้าม (`vitest.config.mts:39` · *"การข้ามอ่านเป็นเขียวได้"*)
   * · ⚠️ **ฉบับแรกของไฟล์นี้ใช้ `it.runIf` แล้วทำให้ `npm test` ของทุกคนแดง** — ด่านจับได้ทันที
   *   ⇒ เคสนี้จึง **รันเสมอ** และแตกกิ่งข้างในแทน · ไม่มีการข้ามเลยสักเคส
   * 🎯 ตอนธงปิด มันยังยืนยันของจริงอยู่: ***ท่าตั้งต้นของไฟล์นี้คือ "ไม่ทำงาน"***
   *   ซึ่งเป็นคุณสมบัติที่เราต้องการจริง ๆ (ไฟล์นี้เสียเงินและเขียนฐาน)
   */
  it(
    "อุ่นคีย์ที่ยังขาด — ตั้งต้นต้องไม่ทำงาน · ทำงานเมื่อ CACHE_WARM_RUN=1 เท่านั้น",
    async () => {
      if (!RUN) {
        expect(RUN, "ท่าตั้งต้นเปลี่ยนไป — ไฟล์นี้ไม่ควรทำงานเองโดยไม่มีคนตั้งธง").toBe(false);
        return;
      }
      expect(Boolean(URL_ && SERVICE), "ตั้ง CACHE_WARM_RUN=1 แล้วแต่ไม่มี creds").toBe(true);
      // 🔴 ใช้ `testClient` ของรีโป ไม่ใช่ `createClient` ตรง —
      //    `supabase-js` ต้องการ WebSocket ใน Node (`Node.js detected but native WebSocket not found`)
      //    `_testClient.ts` แก้ข้อนี้ไว้แล้วและ live-test ทุกไฟล์ใช้ตัวเดียวกัน
      const admin = testClient(SERVICE);

      const catalog = await catalogKeyRows(admin);
      const cached = await cachedDetailKeys(admin);
      expect(catalog, "อ่านคลังไม่ได้").not.toBeNull();
      expect(cached, "อ่านแคชไม่ได้").not.toBeNull();

      const targets = warmTargets({
        catalog: catalog!.map((r) => ({
          id: r.id,
          mapsQuery: r.maps_query,
          googlePlaceId: r.google_place_id,
        })),
        cachedKeys: cached!,
        limit: LIMIT,
      });

      const report = await warmCache(targets, {
        fetchOne: async (key): Promise<WarmRow | null> => {
          const { place, error } = await lookupPlace(key, FIELD_MASK);
          if (error || !place?.id) return null;   // ไม่มี place id = แคชไม่ได้ (รูปเดิมของ route)
          return {
            maps_query: key,
            google_place_id: place.id,
            opening_hours: place.regularOpeningHours ?? null,
            rating: place.rating ?? null,
            user_rating_count: place.userRatingCount ?? null,
            primary_type: place.primaryTypeDisplayName?.text ?? null,
            reviews: place.reviews?.slice(0, 3) ?? null,
          };
        },
        // 🔴 ด่านสุดท้าย — `service_role` มี BYPASSRLS ไม่มี policy ใดขวางได้
        verifyPublic: async (keys) => {
          const ok = await catalogPublicMapsQueries(admin, keys);
          return ok.size === 0 && keys.length > 0 ? null : ok;   // ว่างทั้งที่ถามไป = ถามไม่ได้ → fail-closed
        },
        writeRows: async (rows) => {
          const { error } = await admin
            .from("place_details_cache")
            .upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), {
              onConflict: "maps_query",
              ignoreDuplicates: true,   // ไม่เขียนทับของเดิม — การรีเฟรชยังไม่มีมติ
            });
          return error ? null : rows.length;
        },
      });

      console.log(`\n📊 อุ่นแคช: เป้า ${report.attempted} · เขียน ${report.written} · ` +
        `Google ล้ม ${report.fetchFailed} · หลุดบัญชีขาว ${report.droppedNotPublic} · ` +
        `abort ${report.aborted ?? "ไม่มี"}\n`);

      expect(report.aborted, `อุ่นไม่สำเร็จ: ${report.aborted}`).toBeNull();
      // 🔴 หลุดบัญชีขาวต้องเป็น 0 เสมอ — เป้ามาจากคลัง ถ้าไม่ 0 แปลว่ามีคนแก้คลังระหว่างรอบ
      expect(report.droppedNotPublic, "คีย์หลุดบัญชีขาวระหว่างรอบ — คลังถูกแก้ขณะอุ่น").toBe(0);

      // ── รอบที่สอง: `place_photo_cache` ──────────────────────────────────
      // 🔴 **คำขอคนละชนิดกับ Google** (`places.photos` ไม่ใช่ `places.rating,…`)
      //    ⇒ ขาดไม่เท่ากันได้ตามธรรมชาติ · นั่นคือเหตุผลที่ P6 แยกเพดานเป็นสองตัว
      const cachedPhotos = await cachedPhotoKeys(admin);
      expect(cachedPhotos, "อ่าน place_photo_cache ไม่ได้").not.toBeNull();
      const photoTargets = warmTargets({
        catalog: catalog!.map((r) => ({
          id: r.id,
          mapsQuery: r.maps_query,
          googlePlaceId: r.google_place_id,
        })),
        cachedKeys: cachedPhotos!,
        limit: LIMIT,
      });

      const photoReport = await warmCache<{ maps_query: string; photo_names: string[] }>(
        photoTargets,
        {
          fetchOne: async (key) => {
            const { place, error } = await lookupPlace(key, "places.photos");
            const names = place?.photos?.map((ph) => ph.name).filter(Boolean) ?? [];
            // 🔴 ไม่มีรูป = **ไม่ใช่ความล้มเหลว** แต่ก็ไม่ควรเขียนแถวว่างไว้ให้เข้าใจผิดว่า "อุ่นแล้ว"
            //    → ข้ามไป · แถวจะยังนับเป็น "ขาด" ซึ่งตรงกับความจริงมากกว่า
            if (error || names.length === 0) return null;
            return { maps_query: key, photo_names: names };
          },
          verifyPublic: async (keys) => {
            const ok = await catalogPublicMapsQueries(admin, keys);
            return ok.size === 0 && keys.length > 0 ? null : ok;
          },
          writeRows: async (rows) => {
            const { error } = await admin
              .from("place_photo_cache")
              .upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), {
                onConflict: "maps_query",
                ignoreDuplicates: true,
              });
            return error ? null : rows.length;
          },
        },
      );

      console.log(`\n📷 อุ่นรูป: เป้า ${photoReport.attempted} · เขียน ${photoReport.written} · ` +
        `ไม่มีรูป/ล้ม ${photoReport.fetchFailed} · หลุดบัญชีขาว ${photoReport.droppedNotPublic} · ` +
        `abort ${photoReport.aborted ?? "ไม่มี"}\n`);

      expect(photoReport.aborted, `อุ่นรูปไม่สำเร็จ: ${photoReport.aborted}`).toBeNull();
      expect(photoReport.droppedNotPublic, "คีย์รูปหลุดบัญชีขาวระหว่างรอบ").toBe(0);
    },
    120_000,
  );
});
