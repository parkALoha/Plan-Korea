"use client";

import { useEffect, useState } from "react";

import { DISPLAY_NAME_MAX, countDisplayNameChars } from "@/lib/displayName";

/**
 * ช่องแก้ "ชื่อที่แสดง" — เจ้าของ: P7 (4 ก.ย. 2026) · API เป็นของ P1 (`7c9d935`)
 *
 * 🔴 **ทำไมต้องมี:** ก่อนหน้านี้ชื่อผู้ใช้ถูกเก็บใน `localStorage` เครื่องเดียว
 * (`TripSettingsModal.tsx:21`) ⇒ **เพื่อนร่วมทริปไม่มีวันเห็นชื่อของคนคนนั้นเลย**
 * ช่องนี้เขียนลง `profiles` จริงผ่าน `PATCH /api/engine/profile`
 *
 * ⚠️ **ชื่อยังอยู่สองที่ชั่วคราว** — ช่องนี้ยังไม่ไปแทน `localStorage` เอง
 * นั่นเป็นไฟล์โซน P2 และเป็นคนละใบ (P1 จัดคิวให้เขาแล้ว) · **จดไว้ให้รู้ ไม่ใช่ให้แก้ที่นี่**
 *
 * ## 🔴 ทำไมโหลดค่าเริ่มต้นเองที่นี่ แทนที่จะรับมาจาก Server Component
 * ฉบับแรก `page.tsx` อ่าน `profileOf()` ฝั่งเซิร์ฟเวอร์แล้วส่งลงมาเป็น prop — **เร็วกว่าและช่องไม่ว่าง
 * ตอนโหลดแรก แต่มันทำให้ `serverDataReach.test.ts` แดง และด่านนั้นถูก**
 * · ด่านค้ำสมมติฐานของ `docs/engine/offline-auth-gate.md`: ประตูจะ **ปล่อยผ่านตอนติดต่อ auth ไม่ได้**
 *   ซึ่งปลอดภัยได้ข้อเดียว — **หน้าเว็บไม่เรนเดอร์ข้อมูลจากเซิร์ฟเวอร์** (ได้แค่ shell · `/api/*` ยัง `401`)
 * 🎯 ***ข้อดีของทางเดิมเป็นเรื่องประสิทธิภาพ · ด่านเป็นเรื่องสถาปัตยกรรมความปลอดภัย — เรื่องที่สองชนะ***
 * · ⚠️ ด่านแดงแม้แค่ *เชื่อมถึง* โดยยังไม่เรียก — ตั้งใจ เพราะเชื่อมถึงได้ = เรียกได้ในคอมมิตถัดไปโดยไม่มีอะไรฟ้อง
 * · ✅ ผลพลอยได้: `GET /api/engine/profile` มีผู้เรียกจริงแล้ว ⇒ เลิกเป็นเส้นที่ยังไม่มีใครพิสูจน์ว่าเรียกได้ (`§3.5`)
 *
 * ## 🔴 "กำลังโหลด" กับ "ยังไม่ได้ตั้งชื่อ" ต้องแยกจากกัน
 * ช่องว่างเปล่าตอนกำลังโหลดอ่านได้ว่า *"บัญชีนี้ไม่มีชื่อ"* แล้วผู้ใช้จะเริ่มพิมพ์ **แล้วค่าที่โหลดเสร็จ
 * จะเด้งมาทับสิ่งที่เขาพิมพ์** ⇒ ตอนโหลดจึง `disabled` + มีข้อความของตัวเอง **ไม่ใช่ช่องว่างที่พิมพ์ได้**
 *
 * ## 🔴 ตัวนับต้องนับแบบเดียวกับด่านฝั่งเซิร์ฟเวอร์
 * ถ้าหน้าจอนับอีกแบบ ผู้ใช้จะเห็นว่า "ยังเหลือที่" แล้วโดน `400`
 * 🎯 ***ตัวนับที่นับคนละแบบกับด่าน คือตัวนับที่โกหก***
 * ✅ **ตอนนี้บังคับด้วยโครงสร้าง ไม่ใช่ด้วยวินัย** — ทั้งสองฝั่ง `import` ตัวนับตัวเดียวกัน
 *    จาก `lib/displayName.ts` ⇒ นับคนละแบบไม่ได้แล้วตามนิยาม (4 ก.ย. 2026)
 *
 * ## 🔴 `404 NOT_FOUND` เป็นสภาพจริง ไม่ใช่ error ที่ไม่ควรเกิด
 * บัญชีเก่าที่ไม่มีแถวใน `profiles` จะได้ `404` ทั้ง `GET` และ `PATCH` (P1 ยืนยันว่าเกิดได้จริง)
 * ⇒ **ต้องบอกผู้ใช้ว่าเกิดอะไร ไม่ใช่โชว์ช่องว่างเปล่าที่กดเซฟแล้วเงียบ**
 */

/**
 * 🔴 **เพดานและวิธีนับมาจาก `lib/displayName.ts` ที่เดียว — ห้ามประกาศซ้ำที่นี่**
 * ฉบับก่อนหน้ามี `NAME_MAX = 60` กับตัวนับของตัวเอง **คู่กับอีกชุดในด่านฝั่งเซิร์ฟเวอร์**
 * แล้วใช้คอมเมนต์เตือนให้คนจำว่าต้องแก้ให้ตรงกัน 🎯 ***ค่าที่ต้องเท่ากันแต่พิมพ์ไว้สองที่
 * จะต่างกันวันใดวันหนึ่งเสมอ*** — ตอนนี้ตัดความเป็นไปได้นั้นทิ้ง ไม่ใช่เตือนไม่ให้เกิด
 */
const NAME_MAX = DISPLAY_NAME_MAX;
const countChars = countDisplayNameChars;

type Load =
  | { status: "loading" }
  | { status: "ready"; name: string }
  /** อ่านไม่ได้ — **คนละเรื่องกับ "ไม่มีชื่อ"** · ยังให้แก้ไม่ได้ เพราะไม่รู้ว่ากำลังจะทับอะไร */
  | { status: "error"; message: string };

export function DisplayNameField() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  /**
   * 🔴 **ยืนยันก่อนบันทึก** (ผู้ใช้สั่ง 4 ก.ย. 2026) — ตามแพทเทิร์นที่มีอยู่แล้วที่
   * `TripSettingsModal.tsx:70-88` (ช่องชื่อเหมือนกัน) **ไม่เปิดระบบยืนยันใบที่สอง**
   * · ยืนยัน = พื้นทึบ · ยกเลิก = พื้นทึบสีเมเปิล — ผู้ใช้เคยสั่งเองว่า
   *   *"ตัวหนังสือเปล่า ๆ ข้างปุ่มพื้นทึบ อ่านเป็นลิงก์ ไม่ใช่ปุ่ม"*
   */
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/engine/profile");
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          profile?: { displayName?: string | null };
        };
        if (!alive) return;
        if (!res.ok) {
          setLoad({
            status: "error",
            message:
              json.code === "NOT_FOUND"
                ? "ไม่พบโปรไฟล์ของบัญชีนี้ — แจ้งทีมพร้อมรหัสผู้ใช้ด้านล่าง"
                : (json.error ?? `โหลดชื่อไม่สำเร็จ (${res.status})`),
          });
          return;
        }
        const value = json.profile?.displayName ?? "";
        setLoad({ status: "ready", name: value });
        setName(value);
        setSaved(value);
      } catch {
        if (alive) setLoad({ status: "error", message: "ต่อเน็ตไม่ได้ — โหลดชื่อไม่สำเร็จ" });
      }
    })();
    // 🔴 กันเขียน state หลัง unmount — ออกจากหน้านี้ได้ตลอด (ปุ่มกลับ · ออกจากระบบ)
    return () => {
      alive = false;
    };
  }, []);

  const ready = load.status === "ready";
  const trimmed = name.trim();
  const used = countChars(trimmed);
  const tooLong = used > NAME_MAX;
  const dirty = trimmed !== saved.trim();
  const canSave = ready && dirty && trimmed !== "" && !tooLong && !busy;

  async function save() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/engine/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        profile?: { displayName?: string | null };
      };
      if (!res.ok) {
        // ข้อความจากเซิร์ฟเวอร์เป็นภาษาไทยและตรงเหตุอยู่แล้ว — ใช้ของมันก่อนเสมอ
        // แล้วค่อยมีของสำรองไว้สำหรับกรณีที่ body อ่านไม่ได้ (เช่น 502 ที่ไม่ใช่ JSON)
        setError(
          json.error ??
            (json.code === "NOT_FOUND"
              ? "ไม่พบโปรไฟล์ของบัญชีนี้ — แจ้งทีมพร้อมรหัสผู้ใช้ด้านล่าง"
              : `บันทึกไม่สำเร็จ (${res.status})`),
        );
        return;
      }
      // เชื่อค่าที่ฐานคืนมา ไม่ใช่ค่าที่เราส่งไป — เซิร์ฟเวอร์ `trim` เองด้วย
      const next = json.profile?.displayName ?? trimmed;
      setSaved(next);
      setName(next);
      setOk(true);
    } catch {
      setError("ต่อเน็ตไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor="display-name" className="text-sm font-medium">
        ชื่อที่แสดง
      </label>
      {/* 🔴 **บอกเพดานตั้งแต่ยังไม่ชน** (ผู้ใช้ทัก 4 ก.ย. 2026 — พิมพ์ยาวแล้วไม่มีอะไรเตือนเลย)
          เพดานมีอยู่จริงและบังคับจริงทั้งสองฝั่งมาตลอด **แต่ผู้ใช้ไม่มีทางรู้จนกว่าจะเกือบชน**
          (ตัวนับโผล่เฉพาะตอนใกล้เต็ม) ⇒ คนที่พิมพ์ยาว ๆ เห็นหน้าจอที่บอกว่า *ไม่มีขีดจำกัด*
          🎯 ***กฎที่บังคับได้ แต่ไม่มีใครเห็น ทำงานเป็น "ข้อผิดพลาด" ไม่ใช่ "กติกา"***
          · ตัวเลขมาจาก `NAME_MAX` ตัวเดียวกับที่ใช้ตรวจ **ไม่ใช่เลขที่พิมพ์มือ** — ไม่งั้นวันที่เพดานเปลี่ยน
            ข้อความนี้จะกลายเป็นเท็จเงียบ ๆ (ซึ่งเกิดจริงกับคอมเมนต์ในไฟล์นี้เองตอนเพดานเปลี่ยน 60 → 20) */}
      <p className="mt-0.5 text-2xs text-content-soft">
        ชื่อที่เพื่อนร่วมทริปเห็น · ไม่เกิน {NAME_MAX} ตัวอักษร
      </p>
      <div className="mt-2 flex items-start gap-2">
        <input
          id="display-name"
          value={name}
          maxLength={200}
          /* 🔴 ปิดช่องจนกว่าจะรู้ค่าปัจจุบัน — ไม่งั้นค่าที่โหลดเสร็จจะเด้งทับสิ่งที่ผู้ใช้พิมพ์ไปแล้ว */
          disabled={busy || !ready}
          onChange={(e) => {
            setName(e.target.value);
            setOk(false);
            setError(null);
            /* 🔴 พิมพ์ต่อระหว่างรอยืนยัน = ยกเลิก — ไม่งั้นจะยืนยัน *ค่าใหม่* ทั้งที่ตอนกดเห็น *ค่าเก่า* */
            setConfirming(false);
          }}
          onKeyDown={(e) => {
            /* Enter เปิดขั้นยืนยัน ไม่บันทึกทันที — ขั้นยืนยันจะไร้ความหมายถ้า Enter ข้ามมันได้ */
            if (e.key === "Enter" && canSave) setConfirming(true);
            if (e.key === "Escape") setConfirming(false);
          }}
          placeholder={
            load.status === "loading"
              ? "กำลังโหลด…"
              : load.status === "error"
                ? "โหลดชื่อไม่ได้"
                : "เช่น ก้อง"
          }
          aria-invalid={tooLong || undefined}
          className="min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2 text-sm text-content focus:border-maple focus:outline-none disabled:opacity-60"
        />
        {confirming ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="rounded-control bg-action px-3 py-2 text-sm font-medium text-cream hover:bg-action-hover disabled:opacity-40"
            >
              ยืนยัน
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-control bg-maple px-3 py-2 text-sm font-medium text-cream hover:bg-maple-dark"
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canSave}
            /* 🔴 `bg-action` ไม่ใช่ `bg-pine` — ธีมมืดสนเดิมได้ 2.27:1 กับพื้น (เกณฑ์ปุ่ม 3:1)
               ⇒ ปุ่มมองไม่เห็น (ผู้ใช้รายงานเอง) · ดูเหตุผลที่โทเคนใน `globals.css` */
            className="shrink-0 rounded-control bg-action px-3 py-2 text-sm font-medium text-cream hover:bg-action-hover disabled:opacity-40"
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        )}
      </div>
      {/* ตัวนับโผล่เฉพาะตอนใกล้เต็ม — โชว์ตลอดเวลาคือเสียงรบกวนสำหรับชื่อ 5 ตัวอักษร */}
      {/* เดิม `-15` ตั้งไว้ตอนเพดาน 60 · พอเพดานเป็น 20 มันจะโผล่ตั้งแต่ตัวที่ 6 = เสียงรบกวน
          เหตุผลเดิม ("โผล่เฉพาะตอนใกล้เต็ม") ยังถูก — ที่ต้องขยับคือ *ระยะ* ให้พอดีกับเพดานใหม่ */}
      {(tooLong || used > NAME_MAX - 6) && (
        <p className={`mt-1 text-2xs ${tooLong ? "text-maple-dark" : "text-content-soft"}`}>
          {used}/{NAME_MAX} ตัวอักษร
        </p>
      )}
      {/* 🔴 บอกว่า *กำลังจะบันทึกอะไร* — ขั้นยืนยันที่ไม่บอกว่ายืนยันอะไร คือปุ่มเพิ่มมาหนึ่งครั้งเฉย ๆ */}
      {confirming && (
        <p className="mt-1 text-2xs text-content-soft">
          เปลี่ยนชื่อที่แสดงเป็น <strong className="font-semibold text-content">{trimmed}</strong> — เพื่อนร่วมทริปจะเห็นชื่อนี้
        </p>
      )}
      {load.status === "error" && <p className="mt-1 text-2xs text-maple-dark">{load.message}</p>}
      {error && <p className="mt-1 text-2xs text-maple-dark">{error}</p>}
      {ok && !dirty && <p className="mt-1 text-2xs text-pine">บันทึกแล้ว</p>}
    </div>
  );
}
