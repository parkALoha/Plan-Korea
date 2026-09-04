"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CoverCard } from "@/components/CoverCard";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { NewTripModal } from "@/components/NewTripModal";
import type { CityOption, CountryOption } from "@/components/TripDestinationPicker";

/**
 * หน้าเลือกเมือง — ขั้นที่ ② ของ flow **ประเทศ → เมือง → รายละเอียด** (ผู้ใช้สั่งเอง 4 ก.ย. 2026)
 * เจ้าของ: P5 · route อยู่ที่ `app/explore/[countryId]/page.tsx` (แจ้ง P3 แล้ว)
 *
 * > *"หลังเลือกประเทศแล้วจะพาไป / ใหม่ เพื่อเลือกเมือง **ในหน้านี้ก็จะมี list ประเทศ ให้เลือกเพื่อเปลี่ยนได้**"*
 *
 * 🔴 ประโยคหลังคือข้อกำหนดจริง ไม่ใช่ของแถม — **สลับประเทศได้โดยไม่ต้องกดย้อนกลับ**
 *    ⇒ ตัวสลับประเทศเปลี่ยน URL (`router.replace`) ไม่ใช่แค่ state ภายใน
 *    เพราะถ้าเปลี่ยนแค่ state **ปุ่ม back ของเบราว์เซอร์จะพากลับไปหน้าแรกทั้งที่ผู้ใช้สลับประเทศมา 3 รอบ**
 *    และ URL จะโกหกว่าอยู่ประเทศเดิม · `replace` ไม่ใช่ `push` เพราะการสลับประเทศเป็น *การแก้ตัวเลือก*
 *    ไม่ใช่ *การเดินหน้า* — ไม่ควรทิ้งประวัติไว้ให้กด back ทีละประเทศ
 *
 * ## 🔴 ซ้ำกับ `DestinationExplorer` (โซน P2) ตรงไหน — จดไว้ไม่ให้เป็นหนี้เงียบ
 * `CityThumb`/`CountryThumb` ที่นั่นทำ fallback รูปแบบเดียวกัน **แต่ไม่ได้ `export`**
 * ⇒ ผมเขียนซ้ำ ~12 บรรทัด แทนที่จะแตะไฟล์ของเขาระหว่างที่เขากำลังพิมพ์
 * · ✅ ใช้ `CoverCard` ตัวเดียวกันแล้ว (เปลือกไม่ซ้ำ) · ที่ซ้ำคือ *ตรรกะ fallback ของรูป* เท่านั้น
 * · 📌 **ถ้า P2 `export` ตัวของเขาเมื่อไหร่ ให้ลบของผมทิ้งแล้ว import แทน** — ไม่ควรมีสองใบถาวร
 */

const COUNTRY_ID = /^[a-z]{2}$/;

type ListState<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

/** รูปปกเมือง — `city-<slug>` → พื้นไล่สี · **ไม่ไล่ไปรูปประเทศ** (ทุกใบในหน้านี้ประเทศเดียวกัน
 *  ⇒ รูปประเทศจะทำให้ทุกเมืองหน้าตาเหมือนกันหมด · เหตุผลเดียวกับที่ `DestinationExplorer` เขียนไว้) */
function CityThumb({ slug }: { slug: string | null | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!slug || broken) return <div className="h-28 w-full bg-gradient-to-br from-pine to-maple" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/covers/ ที่ทีมวางเอง
    <img src={`/covers/city-${slug}.svg`} alt="" className="h-28 w-full object-cover" onError={() => setBroken(true)} />
  );
}

export function CityPickerScreen({ countryId }: { countryId: string }) {
  const router = useRouter();
  const [countries, setCountries] = useState<ListState<CountryOption>>({ status: "loading" });
  /**
   * ผลเมืองเก็บคู่กับประเทศที่มันเป็นของ แล้ว derive ตอน render
   * 🔴 **แพทเทิร์น `forCountryId` ของ `TripDestinationPicker`** — ถ้าเก็บ `items` เฉย ๆ
   *    ระหว่างสลับ `jp → tw` จะเห็น **เมืองญี่ปุ่นอยู่ใต้หัวข้อไต้หวัน** จนกว่าคำขอใหม่จะกลับมา
   *    ⇒ ไม่ใช่แค่ค้าง มัน *ตอบผิด* · และเป็นสภาพที่เกิดทุกครั้งที่เน็ตช้า ไม่ใช่เคสหายาก
   */
  const [cityResult, setCityResult] = useState<{ forCountryId: string; state: ListState<CityOption> } | null>(null);
  const [picked, setPicked] = useState<CityOption | null>(null);

  const valid = COUNTRY_ID.test(countryId);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engine/countries")
      .then((r) => {
        if (!r.ok) throw new Error(`countries ${r.status}`);
        return r.json() as Promise<CountryOption[]>;
      })
      .then((rows) => {
        if (!cancelled) setCountries({ status: "ready", items: rows });
      })
      // 🔴 ล้มเหลว = "อ่านไม่ได้" ไม่ใช่ "ไม่มีประเทศ" — โชว์ลิสต์ว่างเงียบ ๆ คือการโกหก
      .catch(() => {
        if (!cancelled) setCountries({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    /**
     * 🔴 **ไม่ `setCityResult(loading)` ตรงนี้** — `set` ตรง ๆ ในตัว effect ผิดกฎ
     * `react-hooks/set-state-in-effect` (ด่าน `npm run lint` จับให้ · ฉบับแรกของผมโดนเข้าเต็ม ๆ)
     * และมัน **ไม่จำเป็นด้วย**: สถานะ "กำลังโหลด" derive ได้จาก `forCountryId` ที่ไม่ตรงอยู่แล้ว
     * (ดูตัวแปร `cities` ข้างล่าง) ⇒ เอาออกได้ทั้งบรรทัดโดยพฤติกรรมเหมือนเดิมเป๊ะ
     * 🎯 *กฎนี้ชี้ไปที่ state ที่ซ้ำซ้อน ไม่ใช่แค่สไตล์การเขียน*
     */
    // `limit=50` = `MAX_LIMIT` ของ route — ขอเกินนี้ไม่ได้ (ดูหมายเหตุ `maybeTruncated` ข้างล่าง)
    fetch(`/api/engine/cities?country=${encodeURIComponent(countryId)}&limit=50`)
      .then((r) => {
        if (!r.ok) throw new Error(`cities ${r.status}`);
        return r.json() as Promise<CityOption[]>;
      })
      .then((rows) => {
        if (!cancelled) setCityResult({ forCountryId: countryId, state: { status: "ready", items: rows } });
      })
      .catch(() => {
        if (!cancelled) setCityResult({ forCountryId: countryId, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [countryId, valid]);

  const country = useMemo(
    () => (countries.status === "ready" ? countries.items.find((c) => c.id === countryId) ?? null : null),
    [countries, countryId],
  );

  const countryOptions: DropdownOption[] = useMemo(
    () =>
      countries.status === "ready"
        ? countries.items.map((c) => ({
            value: c.id,
            label: c.name_th,
            hint: typeof c.cityCount === "number" ? `${c.cityCount} เมือง` : undefined,
          }))
        : [],
    [countries],
  );

  // 🔴 ผลของ *ประเทศนี้เท่านั้น* — ของประเทศอื่นถือว่ายังโหลดอยู่ (ดูเหตุผลที่ `cityResult`)
  const cities: ListState<CityOption> =
    cityResult && cityResult.forCountryId === countryId ? cityResult.state : { status: "loading" };

  /**
   * 🔴 **ได้ครบ 50 พอดี = อาจถูกตัด ไม่ใช่ "มี 50 เมืองพอดี"** — `MAX_LIMIT` ของ route คือ 50
   * วันนี้ประเทศที่มีเมืองเยอะสุดคือญี่ปุ่น 23 ⇒ **ยังไม่เคยชน** แต่ถ้าชนต้องดังกว่าเงียบ
   * 🎯 *เพดานที่ชนแล้วไม่มีใครรู้ ทำให้ข้อมูลหายโดยดูเหมือนข้อมูลครบ*
   */
  const maybeTruncated = cities.status === "ready" && cities.items.length === 50;

  /**
   * 🔴 **รูปแบบถูก ≠ ประเทศมีอยู่จริง** — `/explore/zz` ผ่าน `^[a-z]{2}$` ทุกประการ
   * ฉบับแรกจึงตกไปที่ *"ยังไม่มีเมืองของประเทศนี้ในคลัง"* ซึ่ง **บอกเป็นนัยว่าประเทศมีอยู่แต่ว่างเปล่า**
   * — คนละเรื่องกับ *"ไม่มีประเทศนี้"* และผู้ใช้แยกไม่ออกเลยจากข้อความนั้น
   * 🎯 ***ข้อความที่ผิดแบบดูสมเหตุสมผล แพงกว่าข้อความว่าง — มันทำให้คนเลิกถามต่อ***
   * ✅ ตรวจได้เพราะเรามีรายชื่อประเทศอยู่แล้ว · **รอให้โหลดเสร็จก่อนตัดสิน** ไม่งั้นจะฟ้องผิดตอนเน็ตช้า
   *    (`countries.status === "ready"` เป็นเงื่อนไข ไม่ใช่ `!country`)
   */
  const unknownCountry =
    !valid || (countries.status === "ready" && !countries.items.some((c) => c.id === countryId));

  if (unknownCountry) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm">ไม่รู้จักประเทศนี้ — อาจพิมพ์ลิงก์ผิด หรือประเทศนี้ยังไม่เปิดให้ใช้</p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-maple underline">
          กลับหน้าแรก
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <Link href="/" className="text-sm text-ink/60 hover:text-ink">
        ← หน้าแรก
      </Link>

      <h1 className="mt-3 text-xl font-bold sm:text-2xl">
        {country ? `เลือกเมืองใน${country.name_th}` : "เลือกเมือง"}
      </h1>
      <p className="mt-1 text-sm text-ink/60">เลือกเมืองที่จะไป แล้วกรอกรายละเอียดทริป</p>

      {/* ── สลับประเทศได้ในหน้านี้ — ข้อกำหนดของผู้ใช้ ── */}
      <div className="mt-5 flex flex-col gap-1.5">
        <span className="text-sm font-semibold">ประเทศ</span>
        <Dropdown
          value={countryId}
          onChange={(id) => id !== countryId && router.replace(`/explore/${id}`)}
          options={countryOptions}
          placeholder={countries.status === "loading" ? "กำลังโหลด..." : "เลือกประเทศ"}
          disabled={countries.status !== "ready"}
          ariaLabel="เปลี่ยนประเทศ"
        />
        {countries.status === "error" && (
          <p className="text-xs text-maple">โหลดรายชื่อประเทศไม่ได้ — ลองรีเฟรชหน้า</p>
        )}
      </div>

      {/* ── กริดเมือง ── */}
      <div className="mt-6">
        {cities.status === "loading" && <p className="text-sm text-ink/60">กำลังโหลดเมือง…</p>}
        {cities.status === "error" && <p className="text-sm text-maple">โหลดเมืองไม่ได้ — ลองรีเฟรชหน้า</p>}
        {cities.status === "ready" && cities.items.length === 0 && (
          // ประเทศที่เปิดแล้วแต่ยังไม่มีเมือง เป็นสภาพจริงที่เกิดได้ (ไต้หวันเคยเป็นแบบนี้ทั้งวัน)
          <p className="text-sm text-ink/60">ยังไม่มีเมืองของประเทศนี้ในคลัง — ลองเลือกประเทศอื่นดู</p>
        )}
        {cities.status === "ready" && cities.items.length > 0 && (
          <>
            {/**
             * 🔴 **`auto-fill` + `minmax(17rem,1fr)` — เหมือนทุกกริดในเว็บ ไม่ใช่ `grid-cols-2` ของผมเอง**
             * ฉบับแรกผมเขียน `grid-cols-2 sm:grid-cols-3` แล้วส่ง `coverLayout="banner"` ให้ `CoverCard`
             * · ระหว่างนั้น P2 **ถอด `coverLayout` ออกทั้งพารามิเตอร์** (ผู้ใช้ทัก: การ์ดทั้งเว็บต้องทรงเดียว)
             *   ⇒ โค้ดผมพัง `tsc` ทันทีที่เขาแก้ไฟล์ร่วม **ทั้งที่ผมไม่ได้แตะอะไรเลย**
             * 🎯 **และถ้าผมแค่ลบ prop ทิ้งให้ `tsc` เขียว ผมจะได้หน้าที่การ์ดทรงเดียวกับเว็บ
             *    แต่ *กริด* คนละแบบ — ซึ่งคือปัญหาเดิมที่เขาเพิ่งกำจัด ย้ายมาอยู่ที่ผมแทน**
             * ⇒ ตามกริดกลางด้วย · การ์ดกว้างเท่ากันทั้งเว็บ (`17rem` · ปก `h-28`) ตามที่ผู้ใช้สั่ง
             */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
              {cities.items.map((c) => (
                <CoverCard
                  key={c.id}
                  onClick={() => setPicked(c)}
                  cover={<CityThumb slug={c.legacy_slug} />}
                  title={c.name_th}
                >
                  {/* ชื่ออังกฤษ/ท้องถิ่นเป็นบรรทัดรอง — ช่องนี้ว่างได้ ไม่บังคับเติมของปลอม (กติกาของ `CoverCard`) */}
                  <span className="text-xs text-ink/60">{c.name_local || c.name_en}</span>
                </CoverCard>
              ))}
            </div>
            {maybeTruncated && (
              <p className="mt-3 text-xs text-ink/60">
                แสดง 50 เมืองแรก — อาจมีมากกว่านี้
              </p>
            )}
          </>
        )}
      </div>

      {picked && (
        <NewTripModal
          cityId={picked.id}
          cityName={picked.name_th}
          onClose={() => setPicked(null)}
          /**
           * 🔴 `warning` = ทริปเกิดแล้วแต่**บันทึกเมืองไม่สำเร็จ** — ส่งต่อไปกับ URL
           * เพื่อให้หน้าทริปพูดได้ · ไม่กลืน และไม่ค้างผู้ใช้ไว้ที่โมดัลเพราะทริป *เกิดจริงแล้ว*
           * ⚠️ วันนี้หน้าทริปยังไม่ได้อ่าน `?warn=` (โซน P2) ⇒ **ผู้ใช้ยังไม่เห็นข้อความนี้**
           *    แต่สัญญาณถูกส่งถึงปลายทางแล้วและอยู่ใน URL ที่ตรวจได้ — แจ้ง P1/P2 ไว้แล้ว
           *    🎯 *ส่งสัญญาณที่ยังไม่มีคนอ่าน ดีกว่ากลืนมันตั้งแต่ต้นทาง — ตัวรับเพิ่มทีหลังได้ ข้อมูลที่ทิ้งแล้วเอาคืนไม่ได้*
           */
          onCreated={(tripId, warning) =>
            router.push(`/trip/${tripId}${warning ? `?warn=${encodeURIComponent(warning)}` : ""}`)
          }
        />
      )}
    </main>
  );
}
