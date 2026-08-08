// Rate limit in-memory ง่ายๆ ต่อ IP — พอสำหรับ endpoint สาธารณะที่ไม่มี auth และคิดเงินต่อ request
// (ทริปนี้มีแค่ 2 คนใช้งานจริง ไม่ต้องพึ่ง Redis/Upstash) รีเซ็ตเองเมื่อ serverless instance ถูกรีไซเคิล ซึ่งรับได้
const buckets = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}
