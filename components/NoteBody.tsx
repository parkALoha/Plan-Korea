"use client";

import { useState } from "react";

/* โน้ตของจุดแวะบางอันยาวจนแทบเป็นแพลนย่อยในตัวเอง (ลำดับที่จะเดิน เมนูที่จะสั่ง เวลาที่ต้องต่อคิว)
   ถ้าปล่อยเป็นข้อความก้อนเดียวเอียงๆ จะอ่านไม่ออกเลย — ตัวนี้เลยแปลงบรรทัด/บุลเล็ต/เวลา
   ให้เป็นโครงสร้างที่กวาดตาอ่านได้ โดยยังเก็บเป็น text ธรรมดาใน DB เหมือนเดิม (ไม่ต้อง migrate) */

type Block =
  | { kind: "p"; lines: Line[] }
  | { kind: "ul"; lines: Line[] }
  | { kind: "ol"; lines: Line[] };

type Line = { time: string | null; text: string };

const BULLET = /^[-–—•*]\s+/;
const NUMBERED = /^\d{1,2}[.)]\s+/;
/* "09:30 ไปต่อคิว" / "9.30 น. เจอกันหน้าร้าน" — ดึงเวลานำหน้าออกมาทำเป็นป้ายเวลา */
const LEADING_TIME = /^(\d{1,2}[:.]\d{2})(\s*น\.)?\s+/;

function toLine(raw: string): Line {
  const m = raw.match(LEADING_TIME);
  if (!m) return { time: null, text: raw };
  return { time: m[1].replace(".", ":"), text: raw.slice(m[0].length) };
}

/** โน้ตเก่าๆ ที่จดไว้ก่อนหน้านี้คั่นหลายหัวข้อด้วย " · " ในบรรทัดเดียว (เช่น "จิบกาแฟที่ X · เดินดู Y")
 *  แตกให้เป็นบุลเล็ตอัตโนมัติ จะได้อ่านง่ายขึ้นโดยไม่ต้องไปพิมพ์ใหม่ทุกอัน */
const INLINE_SEP = /\s+[·•]\s+/;

/** แตกโน้ตเป็นบรรทัดที่มีเนื้อหาจริง (ตัดบรรทัดว่างทิ้ง) — ใช้ทั้งตอนนับและตอนเรนเดอร์ */
export function noteLines(note: string): string[] {
  return note
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (!INLINE_SEP.test(line)) return [line];
      const parts = line
        .split(INLINE_SEP)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.map((p) => (BULLET.test(p) || NUMBERED.test(p) ? p : `• ${p}`));
    });
}

/** หนึ่ง "ข้อ" ของโน้ต — `marker` คือสัญลักษณ์นำหน้าที่ผู้ใช้พิมพ์ไว้เอง ("- " / "1. " / "")
 *  แยกออกจาก `text` เพื่อให้ตัวแก้ไขให้พิมพ์เฉพาะเนื้อ ไม่ต้องมาดูแลสัญลักษณ์เอง */
export type NoteItem = { marker: string; text: string };

/** แตกโน้ตเป็น "ข้อ" ตามที่ *ตาเห็นบนจอ* ไม่ใช่ตามที่เก็บใน DB
 *  (โน้ตเก่าที่คั่นด้วย " · " แสดงผลเป็น 2 บุลเล็ต — ตัวแก้ไขต้องเห็นเป็น 2 ข้อเหมือนกัน
 *  ไม่งั้นคนแก้จะเจอ 1 ช่องทั้งที่จอโชว์ 2 บรรทัด) */
export function noteItems(note: string): NoteItem[] {
  return noteLines(note).map((raw) => {
    const m = raw.match(BULLET) ?? raw.match(NUMBERED);
    return m ? { marker: m[0], text: raw.slice(m[0].length) } : { marker: "", text: raw };
  });
}

/** ประกอบกลับเป็นข้อความบรรทัดละข้อ — เก็บลง DB เป็น text เหมือนเดิม ไม่ต้อง migrate
 *  · บุลเล็ตทุกแบบ (– — • *) เขียนกลับเป็น "- " ให้เป็นรูปเดียว
 *  · ข้อที่เป็นตัวเลขไล่ใหม่ตามลำดับปัจจุบัน — ลบข้อ 1 ทิ้งแล้วต้องไม่เหลือ "2. 3." */
export function itemsToNote(items: NoteItem[]): string {
  let n = 0;
  return items
    .filter((i) => i.text.trim())
    .map((i) => {
      if (NUMBERED.test(i.marker)) return `${++n}. ${i.text.trim()}`;
      return i.marker ? `- ${i.text.trim()}` : i.text.trim();
    })
    .join("\n");
}

/** พรีวิวที่พื้นที่แคบมาก (การ์ดในคลัง / การ์ดบนแผนที่) — เอาบรรทัดแรกพอ ที่เหลือต่อท้ายด้วย … */
export function noteFirstLine(note: string): string {
  const lines = noteLines(note);
  if (lines.length === 0) return "";
  const first = lines[0].replace(BULLET, "").replace(NUMBERED, "");
  return lines.length > 1 ? `${first} …` : first;
}

function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (const raw of lines) {
    const kind: Block["kind"] = BULLET.test(raw) ? "ul" : NUMBERED.test(raw) ? "ol" : "p";
    const text = raw.replace(BULLET, "").replace(NUMBERED, "");
    const last = blocks[blocks.length - 1];
    /* ย่อหน้าธรรมดาไม่รวมกลุ่มกัน จะได้เว้นระยะระหว่างประโยคให้อ่านง่าย */
    if (last && last.kind === kind && kind !== "p") last.lines.push(toLine(text));
    else blocks.push({ kind, lines: [toLine(text)] });
  }
  return blocks;
}

function TimeTag({ time }: { time: string }) {
  return (
    <span className="mr-1.5 inline-block rounded bg-current/10 px-1 font-medium tabular-nums opacity-90">
      {time}
    </span>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          const line = b.lines[0];
          return (
            <p key={i} className={i > 0 ? "mt-1" : ""}>
              {line.time && <TimeTag time={line.time} />}
              {line.text}
            </p>
          );
        }
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List
            key={i}
            className={`${i > 0 ? "mt-1" : ""} ml-4 space-y-0.5 ${
              b.kind === "ul" ? "list-disc" : "list-decimal"
            }`}
          >
            {b.lines.map((line, j) => (
              <li key={j} className="pl-0.5">
                {line.time && <TimeTag time={line.time} />}
                {line.text}
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export default function NoteBody({
  note,
  className = "",
  previewLines,
}: {
  note: string;
  /** สีและขนาดตัวอักษรให้ที่เรียกกำหนดเอง แต่ละหน้าคุมโทนต่างกัน */
  className?: string;
  /** ถ้าใส่ไว้ = ย่อเหลือกี่บรรทัดตอนยังไม่กด "ดูทั้งหมด" (ไม่ใส่ = โชว์เต็มเสมอ) */
  previewLines?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = noteLines(note);
  if (lines.length === 0) return null;

  const canCollapse = previewLines != null && lines.length > previewLines;
  const shown = canCollapse && !expanded ? lines.slice(0, previewLines) : lines;

  return (
    <div className={`leading-relaxed ${className}`}>
      <Blocks blocks={toBlocks(shown)} />
      {canCollapse && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 font-medium underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
        >
          {expanded ? "ย่อโน้ต" : `ดูทั้งหมด (อีก ${lines.length - previewLines!} บรรทัด)`}
        </button>
      )}
    </div>
  );
}
