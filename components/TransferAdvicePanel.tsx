"use client";

import { useState } from "react";
import { AIRPORT_ACCESS } from "@/data/airportAccess";
import {
  DEFAULT_RISK_BUFFER_MINUTES,
  type DepartureAdvice,
} from "@/lib/departureAdvice";
import { minutesToTime } from "@/lib/schedule";

/**
 * "ควรออกกี่โมงถึงจะทันเครื่อง" ใต้แถว ✈️ ไปสนามบิน — คำนวณย้อนกลับจากเวลาบิน
 * แสดงเป็น **คำแนะนำ ไม่ใช่คำสั่ง** (ไม่แตะเวลาในแผนให้เอง) ตามที่ตกลงไว้ในเฟส 15
 */
export function TransferAdvicePanel({
  advice,
  targetLabel,
  airportId,
  isAirport,
  checkinBufferMinutes,
  travelMinutes,
  isTravelReal,
}: {
  advice: DepartureAdvice | null;
  targetLabel: string | null;
  airportId: string;
  /** false = ไปสถานีรถ/รถบัส ไม่ใช่สนามบิน — เปลี่ยนคำอธิบายไม่ให้เขียนว่า "ถึงสนามบิน" ผิดๆ */
  isAirport: boolean;
  checkinBufferMinutes: number;
  travelMinutes: number | null;
  isTravelReal: boolean;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const options = AIRPORT_ACCESS[airportId] ?? [];
  const arriveLabel = isAirport ? "ถึงสนามบิน" : "ถึงสถานี";

  if (!advice) {
    return options.length > 0 ? (
      <AccessOptions
        airportId={airportId}
        open={showOptions}
        onToggle={() => setShowOptions((v) => !v)}
        latestDepartureFor={() => null}
      />
    ) : null;
  }

  const late = advice.lateByMinutes > 0;

  return (
    <div className="px-3 pb-2 pl-10 text-[11px] sm:px-4 sm:pl-14">
      <div
        className={`rounded-lg px-2.5 py-1.5 leading-relaxed ${
          // โทเคน panel-* เพื่อให้พลิกตามธีมมืดของ /today ได้ (เหมือน LayoverBadges)
          late ? "bg-panel-maple text-panel-maple-ink" : "bg-panel-pine text-panel-pine-ink"
        }`}
      >
        <div className="font-semibold">
          {late
            ? `⚠️ ช้ากว่าที่ควร ${advice.lateByMinutes} นาที — ${arriveLabel} ${advice.plannedArrival} แต่ควรถึงไม่เกิน ${advice.mustArriveBy}`
            : `✅ ทัน — ${arriveLabel} ${advice.plannedArrival} ก่อนเส้นตาย ${advice.mustArriveBy} อยู่ ${advice.slackMinutes} นาที`}
        </div>
        <div className="mt-0.5">
          ควรออกจากจุดก่อนหน้าไม่เกิน <span className="font-semibold tabular-nums">{advice.shouldLeaveBy}</span>
          {travelMinutes != null && (
            <>
              {" "}
              (เดินทาง {travelMinutes} น.
              <span className="opacity-70">{isTravelReal ? " จริง" : " ประมาณการ"}</span> + เผื่อ{" "}
              {DEFAULT_RISK_BUFFER_MINUTES} น.)
            </>
          )}
        </div>
        {targetLabel && (
          <div className="mt-0.5 opacity-80">
            เส้นตายนี้มาจาก {targetLabel} · เผื่อเช็คอิน {checkinBufferMinutes} นาที
          </div>
        )}
      </div>
      {options.length > 0 && (
        <AccessOptions
          airportId={airportId}
          open={showOptions}
          onToggle={() => setShowOptions((v) => !v)}
          latestDepartureFor={(minutes) =>
            minutesToTime(advice.mustArriveByMinutes - minutes - DEFAULT_RISK_BUFFER_MINUTES)
          }
        />
      )}
    </div>
  );
}

function AccessOptions({
  airportId,
  open,
  onToggle,
  latestDepartureFor,
}: {
  airportId: string;
  open: boolean;
  onToggle: () => void;
  /** เวลาที่ต้องออกอย่างช้าที่สุดถ้าใช้ตัวเลือกนี้ — null เมื่อยังไม่ได้ตั้งเดดไลน์ให้แถวนี้ */
  latestDepartureFor: (minutes: number) => string | null;
}) {
  const options = AIRPORT_ACCESS[airportId] ?? [];
  return (
    <div className="mt-1">
      <button onClick={onToggle} className="py-1 text-[11px] text-content-soft hover:text-content">
        {open ? "▾" : "▸"} เทียบตัวเลือกการเดินทาง ({options.length})
      </button>
      {open && (
        <ul className="space-y-1 pb-1 text-[11px] text-content-soft">
          {options.map((o) => {
            const leaveBy = latestDepartureFor(o.minutes);
            return (
              <li key={o.id} className="rounded-lg bg-surface-soft/60 px-2.5 py-1.5">
                <div>
                  {o.icon} <span className="font-medium text-content">{o.label}</span> ~{o.minutes} น.
                  {leaveBy && (
                    <>
                      {" "}
                      · ออกไม่เกิน <span className="font-semibold tabular-nums text-content">{leaveBy}</span>
                    </>
                  )}
                </div>
                <div className="opacity-80">
                  ขึ้นจาก {o.from}
                  {o.note ? ` · ${o.note}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <p className="pb-1 text-[10px] text-content-soft/70">
          ตัวเลขข้างบนเป็นเวลาตามตารางเดินรถของผู้ให้บริการ (คงที่) ส่วนเวลาในแถวเดินทางด้านบนเป็นของ Google
          ตามพิกัดจริงของจุดก่อนหน้า
        </p>
      )}
    </div>
  );
}
