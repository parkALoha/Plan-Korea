import type { Layover } from "@/data/itinerary";
import type { Lang } from "@/lib/i18n";

type Badge = {
  icon: string;
  text: string;
  /** true = ต้องลงมือทำอะไรบางอย่าง/กินเวลา (เน้นสีส้ม) · false = ไม่ต้องทำอะไร (เขียวจางๆ) */
  attention: boolean;
};

const TEXT = {
  th: {
    throughChecked: "กระเป๋าเช็คทะลุแล้ว ไม่ต้องรับ",
    reclaim: "ต้องรับกระเป๋าแล้วเช็คอินใหม่",
    noImmigration: "อยู่เขต transit ไม่ต้องผ่าน ตม.",
    immigration: "ต้องผ่าน ตม. ถึงจะออกไปข้างนอกได้",
    leaves: "แผนคือออกไปเที่ยวนอกสนามบิน",
    stays: "รออยู่ในสนามบินตลอด",
    terminalChange: "ต้องเปลี่ยนอาคารผู้โดยสาร",
    sameTerminal: "อยู่อาคารเดิม ไม่ต้องย้าย",
  },
  en: {
    throughChecked: "Bags checked through — no reclaim",
    reclaim: "Reclaim bags and check in again",
    noImmigration: "Stay airside — no immigration",
    immigration: "Immigration required to leave airside",
    leaves: "Planned: leave the airport",
    stays: "Wait inside the airport",
    terminalChange: "Terminal change required",
    sameTerminal: "Same terminal — no move",
  },
} as const;

/**
 * แปลงข้อมูลช่วงต่อเครื่องเป็นป้ายสั้นๆ ที่อ่านจบใน 2 วินาที — คำถามที่คนถามจริงตอนยืนอยู่หน้าประตูเครื่อง
 * คือ "ต้องรับกระเป๋าไหม / ต้องผ่าน ตม. ไหม / ออกไปข้างนอกได้ไหม / ต้องย้ายอาคารไหม" เท่านั้น
 */
export function layoverBadges(layover: Layover, lang: Lang = "th"): Badge[] {
  const s = TEXT[lang];
  return [
    layover.baggage === "through-checked"
      ? { icon: "🧳", text: s.throughChecked, attention: false }
      : { icon: "🧳", text: s.reclaim, attention: true },
    layover.immigration === "none"
      ? { icon: "🛂", text: s.noImmigration, attention: false }
      : { icon: "🛂", text: s.immigration, attention: true },
    layover.leavesAirport
      ? { icon: "🚪", text: s.leaves, attention: true }
      : { icon: "🚪", text: s.stays, attention: false },
    layover.terminalChange
      ? { icon: "🔀", text: s.terminalChange, attention: true }
      : { icon: "🏢", text: s.sameTerminal, attention: false },
  ];
}

export function LayoverBadges({ layover, lang = "th" }: { layover: Layover; lang?: Lang }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {layoverBadges(layover, lang).map((badge) => (
        <span
          key={badge.text}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-snug ${
            badge.attention
              ? "bg-maple-soft text-maple-dark"
              : "bg-pine-soft text-pine-dark"
          }`}
        >
          <span aria-hidden>{badge.icon}</span>
          {badge.text}
        </span>
      ))}
    </div>
  );
}
