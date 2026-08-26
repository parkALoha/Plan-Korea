/**
 * ตัวแทนของ `server-only` ตอนรันด้วย vitest — **ว่างเปล่าโดยเจตนา**
 *
 * แพ็กเกจจริงเปิด `exports` ไว้แค่ `"."` และเลือกไฟล์ด้วย condition `react-server`
 * ซึ่งมีเฉพาะตอน Next build → vitest ได้ `index.js` ที่โยนทันทีที่ import
 * (และ alias ไปที่ `server-only/empty.js` ตรง ๆ ก็ไม่ได้ เพราะไม่ได้ประกาศใน `exports`)
 *
 * 🔴 **ไฟล์นี้ไม่ได้ทำให้ด่านอ่อนลง** — ด่านของ `server-only` อยู่ที่ `next build`
 * ไม่ใช่ที่ vitest · ดูเหตุผลเต็มใน `vitest.config.mts`
 */
export {};
