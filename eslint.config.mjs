import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /**
   * 🔴 **`E6-AC11` — "วัน" ของทริปมีแหล่งเดียว** (P3 · P1 อนุมัติ · 30 ส.ค. 2026)
   *
   * เดิม 4 hook ยิง `/days` เองแล้วสร้าง `buildDayBridge([], …)` คนละใบ → **สะพาน 4 ใบ**
   * ราคาจริงไม่ใช่จำนวนคำขอ แต่คือ **จำนวนที่ ๆ ความหมายจะเพี้ยนได้** — และมันเพี้ยนจริงไปแล้ว
   * (`bridge.matched` เป็น `0` เสมอในใบเดียว → แถบ 🚧 ค้าง + แคชไม่เคยถูกเขียน · อีก 3 ใบไม่เพี้ยน
   * เพราะบังเอิญเทียบคนละค่า **จึงไม่มีใครเห็น**)
   *
   * 🎯 **ทำไมเป็น lint ไม่ใช่ "เลิก export"** — ข้อเสนอแรกคือถอด `export` ให้คอมไพเลอร์บังคับ
   * แต่มันชนกับ `lib/__tests__/dayBridge.test.ts` ที่ทดสอบ *ตรรกะของสะพาน* โดยตรง
   * · เทสต์ชุดนั้นกัน **บั๊กตรรกะของสะพาน** ซึ่งเป็นคลาสที่กัดเราจริงไปแล้ว
   * · `export` กัน **ผู้เรียกรายที่ 5** ซึ่งยังไม่เคยเกิด
   * → **แลกของที่กัดจริงแล้ว ไปกับของที่ยังไม่เคยเกิด = แลกผิดทาง** (P1 · เขาเป็นคนถอนข้อเสนอตัวเอง)
   *
   * ⚠️ **อ่อนกว่าคอมไพเลอร์ตรงที่ `eslint-disable` หลบได้** — แต่มัน *โผล่ใน diff เป็นบรรทัดที่เขียนว่า
   * กำลังหลบ* ต่างจาก re-export ที่อ่านเหมือนโค้ดปกติ · CI รัน `npm run lint --max-warnings=0` จึงแดงจริง
   *
   * 📌 จำกัดที่ **ชื่อ `buildDayBridge` ตัวเดียว ไม่ใช่ทั้งพาธ** — `type DayBridge` ยัง import ได้ปกติ
   *    และเผื่อ relative path ไว้ด้วย เพราะ `paths` ของ ESLint match **ตามสตริง ไม่ได้ resolve ให้**
   */
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["hooks/useTripDays.tsx", "lib/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/engine/dayBridge",
              importNames: ["buildDayBridge"],
              message:
                "ใช้ useTripDays() แทน — 'วัน' ของทริปมีแหล่งเดียว (E6-AC11) · เพิ่มผู้เรียกใหม่ = แตกแหล่งอีกครั้ง",
            },
            {
              name: "../engine/dayBridge",
              importNames: ["buildDayBridge"],
              message: "ใช้ useTripDays() แทน — 'วัน' ของทริปมีแหล่งเดียว (E6-AC11)",
            },
            {
              name: "./dayBridge",
              importNames: ["buildDayBridge"],
              message: "ใช้ useTripDays() แทน — 'วัน' ของทริปมีแหล่งเดียว (E6-AC11)",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
