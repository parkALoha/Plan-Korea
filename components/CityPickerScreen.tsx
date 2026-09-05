"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BackHomeLink } from "@/components/BackHomeLink";
import { BackLink } from "@/components/BackLink";
import { CoverCard } from "@/components/CoverCard";
import { NewTripModal } from "@/components/NewTripModal";
import { MAX_TRIP_DESTINATIONS } from "@/lib/engine/tripLimits";
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
 * ## ✅ `CityThumb` เคยซ้ำกับ `DestinationExplorer` — **ตอนนี้ไม่ซ้ำแล้ว และไม่ต้องรออะไร**
 * เดิมมีสองใบ (ของเขาไม่ได้ `export` ผมจึงเขียนซ้ำ ~12 บรรทัด แทนที่จะแตะไฟล์เขาระหว่างเขาพิมพ์)
 * 🔴 **5 ก.ย. 2026: P2 ถอดกิ่งเมืองออกจากไฟล์เขา แล้ว *ลบ* `CityThumb` ทิ้งทั้งฟังก์ชัน**
 * ⇒ ตอนนี้มัน **มีที่เดียวในเว็บคือไฟล์นี้** (`grep` ยืนยันแล้วทั้ง `components/` และ `app/`) ⇒ ไม่มีหนี้เหลือ
 *
 * ⚠️ **ฉบับก่อนของย่อหน้านี้เขียนว่า *"ถ้า P2 export เมื่อไหร่ ให้ลบของผมแล้ว import แทน"* — เป็นเท็จแล้ว**
 * `export` นั้น **จะไม่มีวันมาถึง** เพราะของเขาถูกลบ ไม่ใช่ถูกซ่อน
 * 🎯 ***คำสั่งที่บอกให้ "รอ" ของที่ไม่มีวันมา ทำให้คนอ่านคนถัดไปหยุดรอ โดยไม่มีใครรู้ว่าเขารออยู่***
 *    (`§3.4`: *การรอที่อีกฝ่ายไม่รู้ ไม่ใช่การประสาน มันคือการหายไปเงียบ ๆ*)
 * · 🔴 และมันหมดอายุ **โดยที่คนทำให้มันหมดอายุไม่เคยเปิดไฟล์นี้เลย** — P2 ลบของเขา ไฟล์ผมไม่ขยับ
 *   ⇒ รูปเดียวกับ *"ข้อเท็จจริงที่เก็บคนละที่กับสิ่งที่ทำให้มันจริง"* · **ตัวที่จับได้คือเขาเขียนมาบอก ไม่ใช่ด่านไหน**
 * · 📌 ถ้าวันหนึ่งมีหน้าที่สองต้องใช้รูปปกเมือง **ให้ย้ายตัวนี้ออกไปเป็นโมดูลร่วมแล้ว import สองที่**
 *   — อย่าก๊อป · แต่ **วันนี้มีผู้ใช้รายเดียว การแยกโมดูลตอนนี้คือการเพิ่มไฟล์โดยไม่มีใครได้อะไร**
 */

const COUNTRY_ID = /^[a-z]{2}$/;

/** คีย์ของ `sessionStorage` — ตั้งชื่อให้ชนกับของคนอื่นไม่ได้ */
const PICK_KEY = "luitrip.newTrip.cities";

/**
 * เมืองที่เลือกค้างไว้ — อ่าน **ตอนตั้งค่าเริ่มต้นของ state** ไม่ใช่ใน `useEffect`
 *
 * ## 🔴 ทำไมไม่ใช่ `useEffect` แล้ว `setState`
 * `react-hooks/set-state-in-effect` แดง (ด่าน `npm run lint` จับ · **ฉบับแรกของผมโดนซ้ำรอบสอง
 * ในไฟล์เดียวกัน คนละบรรทัด**) · และการกู้ค่าครั้งเดียวตอน mount **ไม่ต้องใช้ effect ตั้งแต่แรก**
 * 🎯 *กฎนี้ชี้ไปที่ state ที่ซ้ำซ้อนอีกครั้ง — ค่าเริ่มต้นที่รู้ได้ตั้งแต่เรนเดอร์แรก ไม่ควรมาทีหลัง*
 *
 * ## 🔴 `typeof window` จำเป็น — ไม่ใช่ของเผื่อ
 * ไฟล์เป็น `"use client"` **แต่ Next ยัง prerender บนเซิร์ฟเวอร์อยู่ดี** ⇒ `sessionStorage` ไม่มีตัวตนที่นั่น
 * ไม่กันไว้ = **โยนตอน build/prerender** · แพทเทิร์นเดียวกับ `hooks/useDarkTheme.ts:16-20`
 */
function readPickedCities(): CityOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(PICK_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // 🔴 ของใน storage แก้ด้วยมือได้ ⇒ ตรวจรูปก่อนใช้ ไม่ใช่ `as CityOption[]` แล้วหวังว่าถูก
    return Array.isArray(parsed) ? (parsed.filter((x) => x && typeof x.id === "string") as CityOption[]) : [];
  } catch {
    return [];
  }
}

type ListState<T> = { status: "loading" } | { status: "ready"; items: T[] } | { status: "error" };

/** รูปปกเมือง — `city-<slug>` → พื้นไล่สี · **ไม่ไล่ไปรูปประเทศ** (ทุกใบในหน้านี้ประเทศเดียวกัน
 *  ⇒ รูปประเทศจะทำให้ทุกเมืองหน้าตาเหมือนกันหมด · เหตุผลเดียวกับที่ `DestinationExplorer` เขียนไว้) */
/**
 * รูปปกเมือง — ไล่ **ภาพจริง → ภาพวาด `city-*.svg` เดิม → พื้นไล่สี**
 *
 * ## 🔴 ทำไมต้องมีชั้นแรก และทำไมมันเพิ่งมี
 * ทีมกำลังเจนภาพจริงเก็บไว้ที่ `public/catalog/<country>/<slug>.jpg` (ผู้ใช้สั่ง 5 ก.ย. 2026)
 * **แต่ไม่มีใครต่อมันเข้าหน้าเว็บ** ⇒ ยิงหน้าจริงแล้วยังเห็นพื้นไล่สีทุกใบ ทั้งที่ไฟล์อยู่ในรีโปแล้ว
 * 🎯 ***ภาพ 87 ใบที่ไม่มีใครเห็น = งานที่เสร็จแล้วแต่ยังไม่ส่งมอบ*** — และมันดูเหมือน "ยังไม่ได้ทำ" ทุกประการ
 *
 * ## 🔴 ทำไม **ไม่** อ่านจากฐาน — และมันไม่ใช่ "ยังไม่ถึงเวลา" อีกแล้ว (ตัดสินแล้ว 6 ก.ย. 2026 · P5 เสนอ · P1 รับและปิดคำถาม)
 * คอลัมน์ `image_url` มีอยู่จริงในฐาน (`20260905120000`) และ **จะถูกปล่อยว่างไว้โดยตั้งใจ**
 * ```
 * ค่าที่มันจะเก็บวันนี้ = ค่าที่ derive ได้ 100% จาก `countryId` + `slug` ที่ RPC คืนอยู่แล้ว
 * ⇒ มันไม่ใช่แหล่งความจริงที่ดีกว่า — มันคือ **สำเนาที่ต้องมีคนซิงก์**
 * ```
 * 🎯 ***แหล่งความจริงของรูปคือไฟล์บนดิสก์ · ห้ามมีสองแหล่งพร้อมกัน***
 * · 🔴 **และฐานโกหกได้ในแบบที่ดิสก์โกหกไม่ได้**: แถวชี้ไปไฟล์ที่ไม่มี = ภาพแตก ·
 *   ไฟล์มีแต่ไม่มีแถว = ภาพหายทั้งที่อยู่ในรีโป — **`git status` ไม่ฟ้องสักอย่าง**
 * · ✅ **เงื่อนไขที่ทำให้คอลัมน์คุ้ม (เขียนไว้ให้คนตัดสินทีหลังใช้ได้):** วันที่ URL
 *   **ประกอบจาก `countryId` + `slug` ไม่ได้อีกต่อไป** — ย้ายขึ้น CDN/Storage · นามสกุลต่างกันรายใบ ·
 *   มีหลายภาพต่อเมือง · ต้องเก็บเครดิต/ป้าย *"ภาพจำลอง"* คู่กับรูป (อันหลัง P1 เป็นคนชี้)
 * · ⚠️ **ราคาที่จ่ายและรู้ตัวว่าจ่าย:** พาธประกอบจาก convention ⇒ ใครย้ายที่เก็บ **ภาพหายเงียบ ๆ กลับไปเป็นไล่สี**
 *   (ไม่พังจอ ไม่มีอะไรฟ้อง) — รับความเสี่ยงนี้ไว้ ไม่ได้มองข้าม
 * · 📌 กติกาชื่อไฟล์ที่ทำให้ทางนี้เป็นไปได้: **`<countryId>/<slug>.jpg` สำหรับเมือง ·
 *   `<countryId>/<countryId>.jpg` สำหรับประเทศ** — ห้ามมีตารางแปลงชื่อที่ไหนทั้งสิ้น
 *   🎯 ***แก้ที่กติกาการตั้งชื่อ ถูกกว่าแก้ที่ตัวแปลชื่อ — ตัวแปลต้องมีคนซิงก์ กติกาไม่ต้อง*** (ถ้อยคำ P2)
 */
function CityThumb({ slug, countryId }: { slug: string | null | undefined; countryId: string }) {
  // 🔴 `stage` ไม่ใช่ `broken` แบบบูลีน — มีสามชั้น ต้องรู้ว่าตกมาถึงชั้นไหนแล้ว
  const [stage, setStage] = useState<"photo" | "svg" | "gradient">(slug ? "photo" : "gradient");
  if (!slug || stage === "gradient")
    return <div className="aspect-video w-full bg-gradient-to-br from-pine to-maple" />;
  const src = stage === "photo" ? `/catalog/${countryId}/${slug}.jpg` : `/covers/city-${slug}.svg`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ใน public/ ที่ทีมวางเอง
    <img
      src={src}
      /**
       * 🔴 **ไฟล์ใบเดียวเสิร์ฟสองสนามนี้พร้อมกันไม่ได้** (P2 วัดกล่องจริง · ผมวัดซ้ำได้เท่ากัน)
       * ```
       * มือถือ 375px   กล่อง 164 CSS × DPR 2 = ต้องการ ~330px
       * เดสก์ท็อป      กล่อง 278 CSS × DPR 2 = ต้องการ ~560px
       * ```
       * ⇒ `800px` **ไม่ได้ใหญ่เกินสำหรับเดสก์ท็อป** (เหลือเผื่อ 1.4×) · มันใหญ่เกิน **เฉพาะบนมือถือ** (2.4×)
       * ⇒ ย่อไฟล์เดียวลงอีกเพื่อมือถือ = **เดสก์ท็อปเบลอ** · ทางที่เหลือคือให้เบราว์เซอร์เลือกเอง
       *
       * · 🔴 **ทำไมคู่ไฟล์นี้ไม่ใช่ "ของที่ต้องมีคนซิงก์" แบบที่เราปฏิเสธ `image_url` ไป:**
       *   ***`save-cover.sh` สร้างทั้งสองใบจากคำสั่งเดียว*** ⇒ ไม่มีเส้นทางไหนที่ทำให้มีใบใหญ่โดยไม่มีใบเล็ก
       *   (ต่างจาก `image_url` ที่แถวในฐานกับไฟล์บนดิสก์ **ไม่มีตัวผลิตร่วมกัน** ⇒ เพี้ยนกันได้เงียบ ๆ)
       * · ⚠️ ถ้าใบเล็กหาย เบราว์เซอร์จะ 404 เฉพาะตัวเลือกนั้นแล้ว **ตกไปใช้ `src` ใบใหญ่เอง** — ไม่พังจอ แค่ไม่ประหยัด
       */
      srcSet={stage === "photo" ? `${src.replace(/\.jpg$/, "-sm.jpg")} 400w, ${src} 800w` : undefined}
      sizes="(max-width: 639px) 45vw, 280px"
      alt=""
      /**
       * ⚠️ **`lazy` ที่นี่แทบไม่ประหยัดอะไร — ผมวัดหลังใส่แล้ว และมันไม่ใช่ตัวแก้ปัญหา**
       * ```
       * ก่อนใส่ (P3 วัด)   /explore/jp เดสก์ท็อป   17 <img> · 3.87MB
       * หลังใส่ (P5 วัด)   375x812 มือถือ          17 <img> · **16 ใบยังโหลด** · 3.66MB
       * ```
       * 🎯 ***Chrome เผื่อระยะ lazy ไว้กว้างมาก ⇒ การ์ดที่ "อยู่ใต้ fold" ยังอยู่ในระยะโหลดเกือบทั้งหมด***
       * ⇒ เก็บไว้เพราะมันช่วยตอนเน็ตช้า (Chrome ลดระยะเผื่อเอง) และไม่มีราคา — **แต่ห้ามนับว่าปัญหาถูกแก้แล้ว**
       *
       * 🔴 **ตัวที่ประหยัดจริงคือ *ขนาดไฟล์* ไม่ใช่ *จังหวะโหลด*** — เรนเดอร์ 278px จากไฟล์ 1200px (โอเวอร์ไซส์ 4.3 เท่า)
       * ```
       * โฟลเดอร์ jp 18 ไฟล์   1200px = 4213KB   →  800px = 2253KB (−46%)  →  600px = 1326KB (−68%)
       * ```
       * · **ยังไม่ทำ ต้องตัดสินใจก่อน** ว่าจะย่อไฟล์ต้นทาง หรือทำไฟล์เล็กคู่แล้วใช้ `srcset` · **P3 เป็นคนวัดใบแรก คุยกับเขาก่อน**
       * · 🔴 **ห้ามเปลี่ยนไป `next/image`** — P6 ชี้ว่า Vercel Hobby จำกัด **1,000 transformation/เดือน** ⇒ พังเงียบเมื่อเต็มโควตา
       *
       * · ⚠️ **ผลข้างเคียงของ `lazy` ที่ต้องรู้ ไม่ใช่บั๊ก**: ใบที่ยังไม่เข้าระยะจะค้างที่ `stage="photo"`
       *   เพราะเบราว์เซอร์ยังไม่ได้ลองโหลด ⇒ `onError` ยังไม่ยิง · **ชั้นถอยทำงานตอนเลื่อนถึง ไม่ใช่ตอนเปิดหน้า**
       * · ⚠️ **ขอบเขตการวัดของผม**: dev server · แพเนลเบราว์เซอร์ที่ซ่อนอยู่ (`document.visibilityState = "hidden"`)
       *   ⇒ ต้องสั่ง `screenshot` ให้มันวาดก่อนถึงจะมีคำขอภาพเกิดขึ้นเลย — **ยังไม่ได้วัดบน `next start` และไม่ได้วัดบนเน็ตช้า**
       *   🎯 ตัวเลขแรกที่ผมได้คือ `imgRequests: 0` ซึ่ง**อ่านเหมือน lazy ได้ผลสมบูรณ์แบบ** ที่จริงคือหน้ายังไม่ถูกวาดเลย
       */
      loading="lazy"
      decoding="async"
      className="aspect-video w-full object-cover"
      onError={() => setStage((p) => (p === "photo" ? "svg" : "gradient"))}
    />
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
  /**
   * เมืองที่เลือกไว้ — **อาร์เรย์ ไม่ใช่ `Set`** เพราะ *ลำดับคือข้อมูล*
   * `POST /trips` และ `PUT /destinations` เอา `rank` จาก **ตำแหน่งใน array**
   * (`…/destinations/route.ts` · *"`rank` จึงมาจากตำแหน่งใน array ไม่ต้องส่งมา"*)
   * ⇒ `Set` จะทิ้งลำดับที่ผู้ใช้ตั้งใจ · กติกาเดียวกับ `TripDestinationPicker`
   */
  const [selected, setSelected] = useState<CityOption[]>(readPickedCities);
  const [modalOpen, setModalOpen] = useState(false);

  const valid = COUNTRY_ID.test(countryId);

  useEffect(() => {
    try {
      sessionStorage.setItem(PICK_KEY, JSON.stringify(selected));
    } catch {
      /* เขียนไม่ได้ = การเลือกยังใช้ได้ในหน้านี้ แค่ไม่รอดการสลับประเทศ — ไม่ใช่เหตุให้ล้ม */
    }
  }, [selected]);

  /** ลำดับที่จะไป (1-based) · `0` = ยังไม่ได้เลือก */
  const orderOf = (id: string) => selected.findIndex((x) => x.id === id) + 1;

  const toggleCity = (c: CityOption) =>
    setSelected((prev) => {
      const at = prev.findIndex((x) => x.id === c.id);
      if (at >= 0) return prev.filter((x) => x.id !== c.id);
      // 🔴 เพดานมาจาก `tripLimits` — route ปฏิเสธที่ 400 ถ้าเกิน · ห้ามพิมพ์เลขซ้ำ
      if (prev.length >= MAX_TRIP_DESTINATIONS) return prev;
      return [...prev, c];
    });

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
      <main className="mx-auto w-full max-w-4xl px-4 py-10 pb-24 lg:pb-10">
        <p className="text-sm">ไม่รู้จักประเทศนี้ — อาจพิมพ์ลิงก์ผิด หรือประเทศนี้ยังไม่เปิดให้ใช้</p>
        <BackHomeLink className="mt-3" />
      </main>
    );
  }

  /**
   * 🔴 **`w-full` บน `<main>` จำเป็น ไม่ใช่ของแถม** (P2 ชี้ · 5 ก.ย. 2026)
   * `<body>` เป็น `flex flex-col` ⇒ `<main>` เป็น **flex item**
   * 🎯 ***`mx-auto` บน flex item = "หดเหลือเท่าเนื้อหา แล้วจัดกึ่งกลาง" ไม่ใช่ "ยืดเต็มแล้วจัดกึ่งกลาง"***
   *    ⇒ `max-w-4xl` (896px) **ไม่มีผลเลย เพราะความกว้างไม่เคยไปถึง 896 ตั้งแต่แรก**
   * · หน้าอื่นไม่พังเพราะลูกของมันยืดเอง (กริดของ `HomeScreen`) — **หน้านี้เนื้อหาแคบพอจะเปิดโปงมัน**
   *
   * ⚠️ **และมันซ่อนตัวเก่งเป็นพิเศษ เพราะ *ความกว้างขึ้นกับเนื้อหา*:**
   * ตอน P2 วัดได้ `333px` · ผมวัดซ้ำหลังเพิ่มรายการประเทศได้ `822px` (เพดานจริง 896)
   * ⇒ **รายการประเทศที่ผมเพิ่งเพิ่ม ทำให้อาการดีขึ้นเองโดยบังเอิญ ไม่ใช่เพราะมีใครแก้**
   * 🎯 ***บั๊กที่อาการขึ้นกับเนื้อหา จะ "หาย" ตอนมีคนเพิ่มเนื้อหา แล้วกลับมาตอนมีคนลบ***
   */
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 sm:py-10 lg:pb-10">
      {/* 🔴 ปุ่มกลับหน้าหลักใบกลางของ P2 (`9db9199`) — ผู้ใช้สั่งให้ **ทั้งเว็บใช้ตัวเดียวกัน**
          ทั้งคำและรูปร่าง · ของเดิมในเว็บมีสี่แบบไปที่เดียวกัน และใบที่เขาส่งภาพมาบ่นคือใบนี้เอง
          ⚠️ **ห้ามใส่คำเองว่า "หน้าแรก"** — คำที่ผู้ใช้เลือกคือ **"กลับหน้าหลัก"** และมันอยู่ใน `E5_COPY` แล้ว */}
      <BackHomeLink />

      <h1 className="mt-3 text-xl font-bold sm:text-2xl">
        {country ? `เลือกเมืองใน${country.name_th}` : "เลือกเมือง"}
      </h1>
      <p className="mt-1 text-sm text-ink/60">เลือกเมืองที่จะไป แล้วกรอกรายละเอียดทริป</p>

      {/**
        * สลับประเทศได้ในหน้านี้ — ผู้ใช้สั่ง 5 ก.ย. 2026: *"ในคอม มี **list** ประเทศ ให้เลือก"*
        *
        * ## 🔴 สองรูป ไม่ใช่รูปเดียวที่ responsive
        * `sm` ขึ้นไป → **รายการที่เห็นทุกประเทศพร้อมกัน** (สิ่งที่ผู้ใช้ขอตรง ๆ)
        * มือถือ      → `Dropdown` เหมือนเดิม · 9 ประเทศเรียงกันบนจอ 375px จะดันกริดเมืองตกจอไปหมด
        * 🎯 ***"list บนคอม" เป็นคำสั่งเรื่อง **จอคอม** — เอาไปใช้กับมือถือด้วยคือทำเกินคำสั่งแล้วทำให้แย่ลง***
        *
        * ## 🔴 เป็น `Link` ไม่ใช่ `button` — และ `replace` ไม่ใช่ `push`
        * `Link` ⇒ เปิดแท็บใหม่/คลิกขวาได้ · มีใน accessibility tree เป็นลิงก์จริง
        * `replace` ⇒ สลับประเทศคือ **การแก้ตัวเลือก ไม่ใช่การเดินหน้า** — ไม่ทิ้งประวัติให้กด back ทีละประเทศ
        * ⚠️ **ของที่เลือกไว้ไม่หายตอนสลับ** เพราะอ่านกลับจาก `sessionStorage` ตอน mount (ดู `readPickedCities`)
        *    🔴 P2 ห่วงข้อนี้พอดี (*"list สวย ๆ ที่ล้างของที่เลือกไว้ทิ้ง"*) — **ผมถือใบนี้เองจึงไม่เกิด**
        */}
      <div className="mt-5 flex flex-col gap-1.5">
        <span className="text-sm font-semibold">ประเทศ</span>

        {/**
          * มือถือ — **ย้อนกลับไปหน้าเลือกประเทศ ไม่ใช่ `Dropdown`** (ผู้ใช้สั่ง 5 ก.ย. 2026)
          * > *"ถ้ามือถือ **ให้ย้อนกลับไปเลือกประเทศเอา** / เดียวกับที่กดปุ่มสร้างทริปใหม่"*
          *
          * 🔴 *"เดียวกับ"* เป็นข้อกำหนด ไม่ใช่คำเปรียบ — ปุ่ม "สร้างทริปใหม่" บนหน้าแรกชี้ `/explore`
          * ⇒ ที่นี่ต้องชี้ **ที่เดียวกัน** ไม่ใช่หน้าที่หน้าตาเหมือนกัน
          * ⚠️ เพิ่งชี้ได้วันนี้ — `/explore` ยังไม่มีตอนผมทำรอบแรก (P2 วาง `9423fd7`)
          *    **ระหว่างนั้นผมคง `Dropdown` ไว้แทนที่จะชี้ไป 404**
          */}
        <BackLink href="/explore" className="self-start sm:hidden">
          เลือกประเทศอื่น
        </BackLink>

        {/* จอคอม — เห็นทุกประเทศพร้อมกัน */}
        <nav aria-label="เปลี่ยนประเทศ" className="hidden sm:block">
          {countries.status === "ready" ? (
            <ul className="flex flex-wrap gap-2">
              {countries.items.map((c) => {
                const current = c.id === countryId;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/explore/${c.id}`}
                      replace
                      // 🔴 `aria-current` — ตัวชี้ว่า "อยู่ที่นี่" ต้องไม่ใช่แค่สี ไม่งั้นคนที่แยกสีไม่ออกอ่านไม่ได้
                      aria-current={current ? "page" : undefined}
                      className={
                        "inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-sm transition " +
                        (current
                          ? "border-maple bg-maple/10 font-semibold text-maple"
                          : "border-line text-ink/75 hover:border-maple/40")
                      }
                    >
                      {c.name_th}
                      {/* 🔴 `null` ≠ `0` — `null` คืออ่านคลังไม่ได้รอบนี้ ⇒ เว้นว่าง ไม่ใช่โชว์ "0 เมือง" */}
                      {typeof c.cityCount === "number" && (
                        <span className="text-xs font-normal text-ink/45">{c.cityCount}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink/60">
              {countries.status === "loading" ? "กำลังโหลดรายชื่อประเทศ…" : "\u00a0"}
            </p>
          )}
        </nav>

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
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
              {cities.items.map((c) => (
                <CoverCard
                  key={c.id}
                  onClick={() => toggleCity(c)}
                  cover={<CityThumb slug={c.legacy_slug} countryId={countryId} />}
                  title={c.name_th}
                  /**
                   * ป้ายมุมขวาบน = **ลำดับที่จะไป** ไม่ใช่แค่เครื่องหมายถูก
                   * 🎯 ลำดับคือข้อมูลที่ส่งจริง ⇒ ผู้ใช้ต้องเห็นมัน ไม่ใช่รู้แค่ว่า "เลือกแล้ว"
                   */
                  badge={
                    orderOf(c.id) > 0 ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-maple text-xs font-bold text-cream">
                        {orderOf(c.id)}
                      </span>
                    ) : undefined
                  }
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

      {/**
        * แถบสรุปท้ายจอ — **เห็นตลอดว่าตอนนี้เลือกอะไรอยู่ รวมเมืองของประเทศอื่น**
        * 🔴 ของที่รอดข้ามหน้าโดยผู้ใช้มองไม่เห็น จะกลายเป็นเมืองที่เขาไม่ได้ตั้งใจใส่
        *    ⇒ ที่เก็บข้ามการสลับประเทศได้ **ต้องมาคู่กับที่แสดงให้เห็นเสมอ** ไม่ใช่อย่างใดอย่างหนึ่ง
        */}
      {selected.length > 0 && (
        <div
          /**
           * 🔴 **`bottom-14` ไม่ใช่ `bottom-0` ต่ำกว่า `lg`** — `SiteNav` เป็น `fixed bottom-0 z-30`
           * แถบนี้เป็น `sticky` `z-auto` ⇒ ฉบับแรก **ปุ่ม "ถัดไป" ถูกแถบเมนูทับจนกดไม่ได้**
           * วัดด้วย `document.elementFromPoint()` ที่กึ่งกลางปุ่ม: ได้ `SPAN` ของเมนู **ไม่ใช่ปุ่ม**
           *
           * 🎯 ***ปุ่มยัง "มองเห็น" อยู่ครึ่งบน — สกรีนช็อตจึงดูปกติ · สิ่งที่จับได้คือ *การทดสอบว่าใครอยู่บนสุด ณ จุดนั้น*
           *    ไม่ใช่การดูว่ามันโผล่บนจอไหม***
           * ⚠️ ผมเป็นคนทำให้พังเอง ตอนเพิ่ม `SiteNav` (`8df0f7a`) — ระหว่างนั้น **flow เลือกหลายเมืองบนมือถือเดินไม่จบ**
           * · `lg:bottom-0` เพราะตั้งแต่ `lg` ขึ้นไปเมนูไม่ได้ลอยอยู่ล่างจอแล้ว
           */
          className="sticky bottom-14 z-10 -mx-4 mt-6 border-t border-line bg-surface-raised/95 px-4 py-3 backdrop-blur lg:bottom-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              เลือกไว้ {selected.length} เมือง
            </span>
            {selected.length >= MAX_TRIP_DESTINATIONS && (
              <span className="text-xs text-maple">ครบเพดาน {MAX_TRIP_DESTINATIONS} เมืองแล้ว</span>
            )}
          </div>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {selected.map((c, i) => (
              <li key={c.id}>
                {/* กดที่ชิปเพื่อเอาออก — เอาเมืองของประเทศอื่นออกได้โดยไม่ต้องสลับกลับไป */}
                <button
                  type="button"
                  onClick={() => toggleCity(c)}
                  className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs"
                  aria-label={`เอา ${c.name_th} ออก`}
                >
                  <span className="font-semibold text-ink/50">{i + 1}</span>
                  {c.name_th}
                  <span aria-hidden className="text-ink/40">✕</span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-3 w-full rounded-xl bg-maple px-4 py-2.5 text-sm font-bold text-cream sm:w-auto"
          >
            ถัดไป — ตั้งชื่อและวันเดินทาง
          </button>
        </div>
      )}

      {modalOpen && selected.length > 0 && (
        <NewTripModal
          cities={selected.map((c) => ({
            id: c.id,
            name: c.name_th,
            // ฝังมากับ `GET /api/engine/cities` แล้ว (`lib/engine/db.ts:569`) — ยืนยันจากผลจริงของ route
            country: c.catalog_countries?.name_th ?? null,
          }))}
          onClose={() => setModalOpen(false)}
          /**
           * 🔴 `warning` = ทริปเกิดแล้วแต่**บันทึกเมืองไม่สำเร็จ** — ส่งต่อไปกับ URL
           * เพื่อให้หน้าทริปพูดได้ · ไม่กลืน และไม่ค้างผู้ใช้ไว้ที่โมดัลเพราะทริป *เกิดจริงแล้ว*
           * ⚠️ วันนี้หน้าทริปยังไม่ได้อ่าน `?warn=` (โซน P2) ⇒ **ผู้ใช้ยังไม่เห็นข้อความนี้**
           *    แต่สัญญาณถูกส่งถึงปลายทางแล้วและอยู่ใน URL ที่ตรวจได้ — แจ้ง P1/P2 ไว้แล้ว
           *    🎯 *ส่งสัญญาณที่ยังไม่มีคนอ่าน ดีกว่ากลืนมันตั้งแต่ต้นทาง — ตัวรับเพิ่มทีหลังได้ ข้อมูลที่ทิ้งแล้วเอาคืนไม่ได้*
           */
          onCreated={(tripId, warning) => {
            // 🔴 ล้าง **หลังสร้างสำเร็จเท่านั้น** — ล้างตอนเปิดโมดัลหรือตอนยกเลิก
            //    จะทำให้ผู้ใช้ที่กดยกเลิกเสียรายการที่อุตส่าห์เลือกมาหลายประเทศ
            try {
              sessionStorage.removeItem(PICK_KEY);
            } catch {
              /* ล้างไม่ได้ก็ไม่เป็นไร — ทริปเกิดแล้ว และเรากำลังออกจากหน้านี้ */
            }
            router.push(`/trip/${tripId}${warning ? `?warn=${encodeURIComponent(warning)}` : ""}`);
          }}
        />
      )}
    </main>
  );
}
