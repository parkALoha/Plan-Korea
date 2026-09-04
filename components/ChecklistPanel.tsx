"use client";

import { useState } from "react";
import type { ChecklistCategory, ChecklistItem } from "@/lib/supabase";

const CATEGORY_LABEL: Record<ChecklistCategory, string> = {
  packing: "🎒 ของใส่กระเป๋า",
  before_hotel_checkout: "🏨 ก่อนออกจากโรงแรม",
  before_flight: "✈️ ก่อนขึ้นเครื่อง",
};

const CATEGORY_ORDER: ChecklistCategory[] = ["packing", "before_hotel_checkout", "before_flight"];

export function ChecklistPanel({
  items,
  onAdd,
  onToggle,
  onRemove,
}: {
  items: ChecklistItem[];
  onAdd: (text: string, category: ChecklistCategory) => void;
  onToggle: (itemId: string, checked: boolean) => void;
  onRemove: (itemId: string) => void;
}) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<ChecklistCategory>("packing");
  const checkedCount = items.filter((i) => i.is_checked).length;

  function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, category);
    setText("");
  }

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-content-soft">
          ✅ ของที่ต้องเตรียม
          {items.length > 0 ? ` (${checkedCount}/${items.length})` : ""}
        </h2>
      </div>

      <div className="mb-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="เช่น อะแดปเตอร์ปลั๊กไฟ"
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-content focus:border-maple focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="shrink-0 rounded-lg bg-maple px-3 py-2 text-sm font-medium text-white hover:bg-maple-dark disabled:opacity-40"
        >
          + เพิ่ม
        </button>
      </div>

      <div className="mb-3 flex gap-1.5">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-2.5 py-1 text-2xs font-medium ${
              category === c
                ? "bg-maple text-white"
                : "bg-surface-soft text-content-soft hover:bg-surface-soft/70"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-content-soft">
          ยังไม่มีของที่ต้องเตรียม
        </p>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((c) => {
            const groupItems = items.filter((i) => i.category === c);
            if (groupItems.length === 0) return null;
            return (
              <div key={c}>
                <div className="mb-1.5 text-2xs font-semibold text-content-soft">{CATEGORY_LABEL[c]}</div>
                <ul className="space-y-1">
                  {groupItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-sm shadow-ink/5"
                    >
                      {/* role="checkbox" + aria-checked ไม่ใช่แค่ aria-label — ไม่งั้น screen reader
                          อ่านว่า "ปุ่ม ติ๊กว่าเตรียมแล้ว" ทุกแถวเหมือนกันหมด ไม่บอกว่าติ๊กไปแล้วหรือยัง
                          และ aria-label เป็นชื่อของที่ต้องเตรียม ไม่ใช่ชื่อการกระทำ (จะได้ยิน "ซิมการ์ด, ช่องทำเครื่องหมาย, ติ๊กแล้ว")
                          · before:-inset-[10px] ขยายพื้นที่แตะจาก 24px เป็น 44px โดยกล่องที่มองเห็นเท่าเดิม
                            (ใช้ padding/margin ติดลบแทนจะไปดันแถวให้สูงขึ้น) */}
                      <button
                        role="checkbox"
                        aria-checked={item.is_checked}
                        onClick={() => onToggle(item.id, !item.is_checked)}
                        className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm before:absolute before:-inset-[10px] before:content-[''] ${
                          item.is_checked
                            ? "border-maple bg-maple text-white"
                            : "border-line text-transparent hover:border-maple/60"
                        }`}
                        aria-label={item.text}
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm ${
                            item.is_checked ? "text-content-soft line-through" : "text-content"
                          }`}
                        >
                          {item.text}
                        </div>
                        {item.is_checked && item.checked_by && (
                          <div className="text-2xs text-content-soft">ติ๊กโดย {item.checked_by}</div>
                        )}
                      </div>
                      <button
                        onClick={() => onRemove(item.id)}
                        className="relative shrink-0 rounded-full p-1.5 text-content-soft before:absolute before:-inset-2 before:content-[''] hover:bg-surface-soft"
                        aria-label={`ลบ ${item.text}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
