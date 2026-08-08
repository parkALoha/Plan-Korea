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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
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
          className="min-w-0 flex-1 rounded-lg border border-cream-soft px-3 py-2 text-sm text-ink focus:border-maple focus:outline-none"
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
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              category === c
                ? "bg-maple text-white"
                : "bg-cream-soft text-ink-soft hover:bg-cream-soft/70"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-soft px-3 py-3 text-center text-xs text-ink-soft">
          ยังไม่มีของที่ต้องเตรียม
        </p>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((c) => {
            const groupItems = items.filter((i) => i.category === c);
            if (groupItems.length === 0) return null;
            return (
              <div key={c}>
                <div className="mb-1.5 text-[11px] font-semibold text-ink-soft">{CATEGORY_LABEL[c]}</div>
                <ul className="space-y-1">
                  {groupItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-xl border border-cream-soft bg-white px-3 py-2 shadow-sm shadow-ink/5"
                    >
                      <button
                        onClick={() => onToggle(item.id, !item.is_checked)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm ${
                          item.is_checked
                            ? "border-maple bg-maple text-white"
                            : "border-cream-soft text-transparent hover:border-maple/60"
                        }`}
                        aria-label={item.is_checked ? "ยกเลิกติ๊ก" : "ติ๊กว่าเตรียมแล้ว"}
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm ${
                            item.is_checked ? "text-ink-soft line-through" : "text-ink"
                          }`}
                        >
                          {item.text}
                        </div>
                        {item.is_checked && item.checked_by && (
                          <div className="text-[11px] text-ink-soft">ติ๊กโดย {item.checked_by}</div>
                        )}
                      </div>
                      <button
                        onClick={() => onRemove(item.id)}
                        className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream-soft"
                        aria-label="ลบ"
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
