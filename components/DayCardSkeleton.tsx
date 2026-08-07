/** โครงหน้าตอนกำลังโหลด — ทรงเดียวกับการ์ดวันจริงใน DayStopsSection คร่าวๆ กันจอกระพริบ/ว่างเปล่า */
export function DayCardSkeleton() {
  return (
    <section
      className="mb-5 animate-pulse overflow-hidden rounded-2xl border border-cream-soft bg-white shadow-sm shadow-ink/5"
      aria-hidden
    >
      <div className="space-y-2 bg-cream-soft/70 px-4 py-3">
        <div className="h-3 w-24 rounded bg-ink/10" />
        <div className="h-5 w-40 rounded bg-ink/10" />
      </div>
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-10 shrink-0 rounded bg-cream-soft" />
            <div className="h-10 flex-1 rounded-lg bg-cream-soft" />
          </div>
        ))}
      </div>
    </section>
  );
}
