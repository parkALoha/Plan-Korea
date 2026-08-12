import { isWetDay, weatherLabel, type DayWeather } from "@/lib/weather";

/**
 * พยากรณ์อากาศของวันนั้นบนหัวการ์ด — บรรทัดเดียว อ่านจบด้วยตาเดียว
 * วางบนพื้นสีเข้มของหัวการ์ด (หรือพื้นสว่างใน /today) จึงใช้พื้นโปร่งขาวจางๆ แทนสีจากธีม
 * เพื่อให้อ่านออกบนพื้นหลังสีเมืองทั้ง 6 สีโดยไม่ต้องมีสูตรสีต่อเมือง
 */
export function WeatherBadge({
  weather,
  className = "",
}: {
  weather: DayWeather;
  className?: string;
}) {
  const label = weatherLabel(weather.code);
  const wet = isWetDay(weather);
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-white/15 px-2 py-1 text-xs ${className}`}
    >
      <span>
        {label.icon} {label.text}
      </span>
      {weather.tempMax != null && weather.tempMin != null && (
        <span className="tabular-nums">
          {Math.round(weather.tempMin)}–{Math.round(weather.tempMax)}°
        </span>
      )}
      {weather.rainChance != null && (
        <span className={`tabular-nums ${wet ? "font-semibold" : "opacity-80"}`}>
          ☔️ {weather.rainChance}%
        </span>
      )}
      {wet && <span className="font-semibold">— เผื่อแผนในร่มไว้ด้วย</span>}
    </div>
  );
}
