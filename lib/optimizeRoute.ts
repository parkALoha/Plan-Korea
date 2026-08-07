import { haversineKm } from "@/lib/geo";

export type RoutePoint = { id: string; lat: number; lng: number };

function distance(a: RoutePoint, b: RoutePoint) {
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

/** ระยะรวมของเส้นทางตามลำดับที่ให้มา รวมช่วงที่พักหัว-ท้ายถ้ามี */
export function routeDistanceKm(
  order: RoutePoint[],
  startAt?: RoutePoint | null,
  endAt?: RoutePoint | null
): number {
  if (order.length === 0) return 0;
  let total = 0;
  if (startAt) total += distance(startAt, order[0]);
  for (let i = 1; i < order.length; i++) total += distance(order[i - 1], order[i]);
  if (endAt) total += distance(order[order.length - 1], endAt);
  return total;
}

/**
 * เสนอลำดับจุดแวะที่เดินทางรวมสั้นลง (nearest-neighbor + 2-opt บนระยะเส้นตรง)
 * — จุดที่อยู่ใน pinnedIndexes จะถูกตรึงไว้ที่ตำแหน่งเดิมเสมอ (ค่าเริ่มต้นในหน้าเว็บคือร้านอาหาร
 *   เพราะมื้อเที่ยง/เย็นผูกกับเวลา ไม่ควรถูกสลับไปไหน)
 * — ระยะเส้นตรงเป็นแค่ตัวช่วยเสนอ ไม่ใช่เวลาจริง จึงต้องให้คนดูก่อนกดใช้เสมอ
 */
export function suggestOrder(
  points: RoutePoint[],
  options: {
    startAt?: RoutePoint | null;
    endAt?: RoutePoint | null;
    pinnedIndexes?: Set<number>;
  } = {}
): RoutePoint[] {
  const { startAt = null, endAt = null, pinnedIndexes = new Set<number>() } = options;
  if (points.length < 3) return points;

  const freeIndexes = points.map((_, i) => i).filter((i) => !pinnedIndexes.has(i));
  const freePoints = freeIndexes.map((i) => points[i]);
  if (freePoints.length < 2) return points;

  // ประกอบลำดับเต็มกลับจากลำดับของจุดที่ขยับได้ (จุดที่ตรึงไว้อยู่ที่ index เดิมเสมอ)
  const rebuild = (freeOrder: RoutePoint[]): RoutePoint[] => {
    const out = [...points];
    freeIndexes.forEach((slot, k) => {
      out[slot] = freeOrder[k];
    });
    return out;
  };
  const costOf = (freeOrder: RoutePoint[]) => routeDistanceKm(rebuild(freeOrder), startAt, endAt);

  // nearest-neighbor เริ่มจากที่พัก (ไม่มีก็เริ่มจากจุดแรกเดิม)
  const remaining = [...freePoints];
  const seed = startAt ?? freePoints[0];
  let current = seed;
  const greedy: RoutePoint[] = [];
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((p, i) => {
      const d = distance(current, p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    current = remaining[bestIdx];
    greedy.push(current);
    remaining.splice(bestIdx, 1);
  }

  // 2-opt ปรับซ้ำจนไม่ดีขึ้น — จุดน้อย (≤ ~15 ต่อวัน) คำนวณในเบราว์เซอร์เสร็จทันที
  let best = greedy;
  let bestCost = costOf(best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const cost = costOf(candidate);
        if (cost < bestCost - 1e-9) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }

  const suggested = rebuild(best);
  // ไม่ดีขึ้นจริง (หรือดีขึ้นน้อยกว่า 100 เมตร) ก็คืนลำดับเดิม จะได้ไม่เสนอการสลับที่ไร้ความหมาย
  return bestCost < routeDistanceKm(points, startAt, endAt) - 0.1 ? suggested : points;
}
