"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth/signIn";
import { E5_COPY } from "@/lib/i18n";

const COPY = E5_COPY.home;

/**
 * **เมนูบัญชีบนแถบหัว — จอ `lg` ขึ้นไปเท่านั้น** (ผู้ใช้สั่งเอง 5 ก.ย. 2026)
 *
 * > *"ในมุมมองคอม icon โปรไฟล์ ไม่เอาสัญลักษณ์นี้ และหากกดแล้ว ควรมีตัวเลือก ข้อมูลส่วนตัว/ออกจากระบบ*
 * > *ส่วนในมุมมองมือถือควรเอาออกไป เพราะมีปุ่มบัญชีด้านล่างแล้ว"*
 *
 * ## 🔴 ทำไมมือถือไม่มีเลย — และทำไมมันเพิ่งกลายเป็นของซ้ำเมื่อคืนนี้
 * `SiteNav` (แถบล่างระดับเว็บ) เพิ่งลงไปเมื่อคืน ⇒ **ปุ่ม "บัญชี" มีอยู่แล้วที่ล่างจอ**
 * 🎯 ***ของชิ้นนี้ไม่ได้ผิดมาตลอด — มันกลายเป็นของซ้ำเพราะเราเพิ่มของใหม่เข้าไป***
 * · ⚠️ **รูปเดียวกับที่เขียนไว้แล้วที่ `TripHeader.tsx:91`** (ลิงก์บนหัวซ้ำกับ `BottomNav` เมื่อจอเล็กกว่า `lg`)
 *   ⇒ แถบล่างแต่ละอันที่เพิ่มเข้ามา **สร้างของซ้ำชุดใหม่กับแถบหัวเสมอ** — ต้องไล่ทุกครั้ง ไม่ใช่แค่ครั้งนี้
 * · เกณฑ์จุดตัดคือ `lg` **เพราะ `SiteNav` เป็น `lg:hidden`** — ผูกกับตัวมันโดยตรง ไม่ใช่เลือกเอง
 *   🔴 **ย้ายจุดตัดของอันใดอันหนึ่งโดยไม่ย้ายอีกอัน = ช่วงจอที่ไม่มีทางเข้าหน้าบัญชีเลย** (หรือมีสองทาง)
 *
 * ## 🔴 ตัวกดไม่ใช่วงกลมตัวย่อแล้ว — ผู้ใช้บอกว่า *"ไม่เอาสัญลักษณ์นี้"*
 * ใช้ **ชื่อ + ลูกศร** แทน · เขาไม่ได้บอกว่าจะเอาอะไรแทน ⇒ ผมเลือกสิ่งที่ *บอกได้มากกว่าเดิม*
 * (ชื่อจริงอ่านออกทันที · ลูกศรบอกว่ากดแล้วมีเมนู ซึ่งวงกลมเปล่าไม่เคยบอก) · **เปลี่ยนได้ถ้าเขาอยากได้อย่างอื่น**
 *
 * ## 🔴 ปิดเมนูให้ครบสามทาง — ลืมทางไหนไม่มีอะไรฟ้อง
 * `Escape` · คลิกนอกเมนู · เลือกรายการแล้ว · **และคืนโฟกัสกลับปุ่มตอนปิดด้วย `Escape`**
 * ⚠️ ไม่คืนโฟกัส = คนใช้คีย์บอร์ดจะหลุดไปต้น `document` แล้วต้อง Tab ใหม่ทั้งแถบ
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      {/**
       * 🔴 **ไอคอนคน ไม่ใช่ชื่อ และไม่ใช่วงกลมตัวย่อ** — ผู้ใช้สั่งสองรอบ ซึ่ง *ต้องอ่านรวมกัน*
       * ```
       * รอบ ① (4 ก.ย.)  "ไม่เอาสัญลักษณ์นี้"                    ← ชี้ที่ **วงกลมตัวอักษรย่อ**
       * รอบ ② (5 ก.ย.)  "แก้ ก้องทดสอบ … เป็น icon profile ยังดีกว่า"
       * ```
       * 🎯 ***อ่านรวมสองรอบ: เขาไม่ได้ไม่ชอบ "ไอคอน" — เขาไม่ชอบ "วงกลมตัวอักษรย่อ"***
       * ⚠️ ระหว่างสองรอบผมเปลี่ยนเป็น **ชื่อ + ลูกศร** ซึ่งเป็นการเดาที่ผิด — และผมเดาผิด
       *    เพราะอ่านรอบแรกว่า *"ไม่เอาไอคอน"* ทั้งที่เขาชี้ที่ *รูปแบบ* ของไอคอน ไม่ใช่ตัวไอคอน
       *
       * · ชื่อยังอยู่ใน `aria-label` ⇒ **โปรแกรมอ่านหน้าจอยังบอกได้ว่าเป็นบัญชีของใคร** ไม่ได้หายไปกับตัวอักษร
       * · `stroke="currentColor"` ⇒ ตามสีข้อความของแถบหัว **ไม่ต้องมีสีของตัวเอง** (เหมือนแว่นขยาย)
       */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${COPY.account} · ${displayName}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cream/10 hover:bg-cream/20"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          className="h-[1.15rem] w-[1.15rem]"
        >
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.8 20c.9-3.6 3.7-5.4 7.2-5.4s6.3 1.8 7.2 5.4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-edge bg-surface-raised text-content shadow-overlay"
        >
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm hover:bg-surface-soft"
          >
            {COPY.accountProfile}
          </Link>
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                /**
                 * ต้องให้เบราว์เซอร์ยิงรอบใหม่ทั้งรอบ เพื่อให้ `proxy.ts` เห็นคุกกี้ที่เพิ่งถูกล้าง
                 * · **เหตุผลเต็มเขียนไว้ที่ `app/account/SignOutButton.tsx`** — ที่นี่ไม่เขียนซ้ำ
                 *   เพราะถ้าเหตุผลเปลี่ยน จะได้มีที่ต้องแก้ที่เดียว
                 */
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/login");
              }
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-maple-dark hover:bg-surface-soft disabled:opacity-60"
          >
            {busy ? COPY.signingOut : COPY.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
