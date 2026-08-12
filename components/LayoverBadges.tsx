import type { Layover } from "@/data/itinerary";

type Badge = {
  icon: string;
  text: string;
  /** true = ต้องลงมือทำอะไรบางอย่าง/กินเวลา (เน้นสีส้ม) · false = ไม่ต้องทำอะไร (เขียวจางๆ) */
  attention: boolean;
};

/**
 * แปลงข้อมูลช่วงต่อเครื่องเป็นป้ายสั้นๆ ที่อ่านจบใน 2 วินาที — คำถามที่คนถามจริงตอนยืนอยู่หน้าประตูเครื่อง
 * คือ "ต้องรับกระเป๋าไหม / ต้องผ่าน ตม. ไหม / ออกไปข้างนอกได้ไหม / ต้องย้ายอาคารไหม" เท่านั้น
 */
export function layoverBadges(layover: Layover): Badge[] {
  return [
    layover.baggage === "through-checked"
      ? { icon: "🧳", text: "กระเป๋าเช็คทะลุแล้ว ไม่ต้องรับ", attention: false }
      : { icon: "🧳", text: "ต้องรับกระเป๋าแล้วเช็คอินใหม่", attention: true },
    layover.immigration === "none"
      ? { icon: "🛂", text: "อยู่เขต transit ไม่ต้องผ่าน ตม.", attention: false }
      : { icon: "🛂", text: "ต้องผ่าน ตม. ถึงจะออกไปข้างนอกได้", attention: true },
    layover.leavesAirport
      ? { icon: "🚪", text: "แผนคือออกไปเที่ยวนอกสนามบิน", attention: true }
      : { icon: "🚪", text: "รออยู่ในสนามบินตลอด", attention: false },
    layover.terminalChange
      ? { icon: "🔀", text: "ต้องเปลี่ยนอาคารผู้โดยสาร", attention: true }
      : { icon: "🏢", text: "อยู่อาคารเดิม ไม่ต้องย้าย", attention: false },
  ];
}

export function LayoverBadges({ layover }: { layover: Layover }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {layoverBadges(layover).map((badge) => (
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
