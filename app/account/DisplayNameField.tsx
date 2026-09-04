"use client";

import { useEffect, useState } from "react";

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
 * ## 🔴 ตัวนับต้องนับแบบเดียวกับด่านฝั่งเซิร์ฟเวอร์ — `Array.from` ไม่ใช่ `.length`
 * `route.ts:74` ใช้ `Array.from(displayName).length > 60` · `.length` นับ **UTF-16 code unit**
 * ⇒ อีโมจิหนึ่งตัวนับเป็น 2 · ถ้าหน้าจอนับอีกแบบ ผู้ใช้จะเห็นว่า "ยังเหลือที่" แล้วโดน `400`
 * 🎯 ***ตัวนับที่นับคนละแบบกับด่าน คือตัวนับที่โกหก***
 *
 * ## 🔴 `404 NOT_FOUND` เป็นสภาพจริง ไม่ใช่ error ที่ไม่ควรเกิด
 * บัญชีเก่าที่ไม่มีแถวใน `profiles` จะได้ `404` ทั้ง `GET` และ `PATCH` (P1 ยืนยันว่าเกิดได้จริง)
 * ⇒ **ต้องบอกผู้ใช้ว่าเกิดอะไร ไม่ใช่โชว์ช่องว่างเปล่าที่กดเซฟแล้วเงียบ**
 */

const NAME_MAX = 60;

/** นับแบบเดียวกับ `route.ts` — ห้ามเปลี่ยนเป็น `.length` */
const countChars = (s: string) => Array.from(s).length;

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
      <p className="mt-0.5 text-2xs text-content-soft">
        ชื่อที่เพื่อนร่วมทริปเห็น
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
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) save();
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
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="shrink-0 rounded-control bg-pine px-3 py-2 text-sm font-medium text-cream hover:bg-pine-dark disabled:opacity-40"
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
      {/* ตัวนับโผล่เฉพาะตอนใกล้เต็ม — โชว์ตลอดเวลาคือเสียงรบกวนสำหรับชื่อ 5 ตัวอักษร */}
      {(tooLong || used > NAME_MAX - 15) && (
        <p className={`mt-1 text-2xs ${tooLong ? "text-maple-dark" : "text-content-soft"}`}>
          {used}/{NAME_MAX} ตัวอักษร
        </p>
      )}
      {load.status === "error" && <p className="mt-1 text-2xs text-maple-dark">{load.message}</p>}
      {error && <p className="mt-1 text-2xs text-maple-dark">{error}</p>}
      {ok && !dirty && <p className="mt-1 text-2xs text-pine">บันทึกแล้ว</p>}
    </div>
  );
}
