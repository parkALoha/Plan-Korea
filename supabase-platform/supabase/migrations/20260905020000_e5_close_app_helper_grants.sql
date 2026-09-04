-- ═══════════════════════════════════════════════════════════════════════════
-- `app.search_norm` · `app.like_literal` — ปิด `PUBLIC` แล้วให้ `authenticated` อย่างชัดเจน
-- เจ้าของ: P1-Lead · 5 ก.ย. 2026 · **P4 เจอด้วย `function_exposure` ในการวัดรอบแรก**
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 🔴 กลไก — **ไม่ใช่มีคนเปิด แต่ไม่มีคนปิด**
--   `proacl = null` ⇒ Postgres แจก `EXECUTE` ให้ `PUBLIC` เป็นค่าเริ่มต้นของฟังก์ชัน
--   **ต่างจากตารางที่ปิดโดยปริยาย** ⇒ ฟังก์ชันที่ลืม `revoke` เปิดกว้างโดยไม่มีบรรทัดไหนพูดถึงมัน
--   🎯 ***บรรทัดที่ *หายไป* ไม่ปรากฏใน `git diff` — รีวิวด้วยตามองไม่เห็นตามโครงสร้าง ไม่ใช่เพราะใครเผลอ***
--
--   · เพื่อนอีก 7 ใบใน `app` ทำถูกครบ (`20260824043822:220,227` — `revoke … from public` + `grant … to authenticated`)
--     **สองใบนี้ข้ามทั้งสองขั้น** ⇒ เป็นข้อยกเว้นที่ไม่มีใครตั้งใจให้เป็น
--
-- ## 🔴 ทำไมต้อง `grant to authenticated` ไม่ใช่ `revoke` เฉย ๆ — **ยิงพิสูจน์แล้ว ไม่ใช่เดา**
--   ทางแรกที่ดู "รัดกุมกว่า" (revoke อย่างเดียว) **ทำให้ผู้ใช้เพิ่มชื่อสถานที่ไม่ได้**
--   ```
--   custom_place_names มี GIN index บน app.search_norm(name)   (`20260826015533:74`)
--   ⇒ ผู้เขียนต้องมี EXECUTE ตอน INSERT เพื่อคำนวณค่า index
--   ยิงจริงในสนามซ้อม (ตารางจำลอง · index รูปเดียวกัน):
--     revoke แล้ว INSERT ในฐานะ authenticated → **ERROR: permission denied for function search_norm**
--   ```
--   · และทางที่สอง ยืนยันข้อเดียวกันอิสระกัน: `public.search_place_names` **ไม่ใช่ `security definer`**
--     ⇒ รันในฐานะผู้เรียก ⇒ เรียก `app.search_norm`/`app.like_literal` ข้างในด้วยสิทธิ์ของผู้ใช้
--   🎯 ***"รัดให้แน่นที่สุด" กับ "รัดให้ถูก" ไม่ใช่สิ่งเดียวกัน — และความต่างวัดได้ ไม่ต้องเถียง***
--
-- ## ⚠️ ราคาจริงของสภาพเดิม: **เกือบศูนย์ — และคำว่า "เกือบ" สำคัญ** (P4 เขียนไว้เอง)
--   ทั้งคู่ `immutable` · ไม่แตะตารางสักใบ · ไม่มี `select`
--   (`search_norm` = `lower(unaccent(t))` · `like_literal` = escape `\ % _`)
--   ⇒ เรียกได้ก็ได้กลับไปแค่สตริงที่ตัวเองส่งเข้ามา · และ `anon` เรียกไม่ได้อยู่แล้ว (ไม่มี `USAGE` บน `app`)
--   🔴 ***แต่ "ไม่มีอะไรรั่ว" ไม่ใช่เหตุผลที่มันเปิด — มันเปิดเพราะไม่มีใครตัดสินใจ***
--     และวันที่มีคนเติมเนื้อลงไปในสองใบนี้ **จะไม่มีอะไรส่งเสียงว่าผู้ใช้ทุกคนเรียกมันได้อยู่แล้ว**
--
-- ## rollback
--   `grant execute on function app.{search_norm,like_literal}(text) to public;`
--   · **แต่ไม่ควรถอย** — สภาพหลังใบนี้คือสภาพที่เพื่อนอีก 7 ใบเป็นอยู่แล้ว
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from app.project_identity
     where name = 'plan-korea-platform' and ref = 'pmvxwcimjebogjfimzqy' and environment = 'dev'
  ) then
    raise exception 'ผิดโปรเจกต์: ไม่ใช่ engine-dev';
  end if;
end $guard$;

revoke all on function app.search_norm(text)  from public;
revoke all on function app.like_literal(text) from public;

-- 🔴 `authenticated` ต้องมี — ไม่งั้นเพิ่มชื่อสถานที่ไม่ได้ (GIN index) และค้นไม่ได้ (invoker)
grant execute on function app.search_norm(text)  to authenticated;
grant execute on function app.like_literal(text) to authenticated;

do $assert$
begin
  -- ① `PUBLIC` ต้องไม่เหลือสิทธิ์
  if has_function_privilege('public', 'app.search_norm(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: PUBLIC ยังเรียก app.search_norm ได้';
  end if;
  if has_function_privilege('public', 'app.like_literal(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: PUBLIC ยังเรียก app.like_literal ได้';
  end if;

  -- ② 🔴 **เคสควบคุมฝั่งบวก — ไม่มีข้อนี้ การ revoke ทิ้งทั้งหมดจะผ่าน ① เหมือนกันเป๊ะ**
  --    และผลของมันคือ **ผู้ใช้เพิ่มชื่อสถานที่ไม่ได้** ซึ่งเป็นของที่ยิงพิสูจน์มาแล้วว่าเกิดจริง
  if not has_function_privilege('authenticated', 'app.search_norm(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก app.search_norm ไม่ได้ — INSERT ชื่อสถานที่จะล้มที่ GIN index';
  end if;
  if not has_function_privilege('authenticated', 'app.like_literal(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: authenticated เรียก app.like_literal ไม่ได้ — search_place_names (invoker) จะล้ม';
  end if;

  -- ③ `anon` ต้องไม่ได้สิทธิ์ตรง (ถึงจะไม่มี USAGE บน app ก็ตาม — สองชั้น ไม่ใช่ชั้นเดียว)
  if has_function_privilege('anon', 'app.search_norm(text)', 'EXECUTE') then
    raise exception 'assert ล้ม: anon ได้สิทธิ์ตรงบน app.search_norm';
  end if;
end $assert$;

commit;
