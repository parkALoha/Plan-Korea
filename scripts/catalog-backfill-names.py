#!/usr/bin/env python3
"""กู้ชื่อสถานที่ที่หายไปในคลัง — เติม `catalog_place_names` จาก `google_place_id`

## ปัญหาที่แก้ (4 ก.ย. 2026 · เฟส 1 ข้อ 1.1)
`catalog-suggest.py:write_rows()` เขียนแค่ `catalog_places` **ไม่เคยเขียน `catalog_place_names`**
→ วัดจากฐาน: 2,194 / 2,396 แถว (91.6%) ไม่มีชื่อสักภาษา
→ `cardToPlace()` ตกไปท้ายสุดที่ `slug` ⇒ ผู้ใช้เห็น `place-132` · `109` · `9-2`
   (`109` คือ `ชิบูย่า 109` ที่ `slugify()` กินอักษรไทยทิ้งจนเหลือแต่เลข)

## 🔴 กับดัก locale — เหตุผลที่สคริปต์นี้ไม่เขียน `locale='th'` ทั้งก้อน
`nearby()` ตั้ง `lang="th"` ค้าง · Google คืน *"ชื่อไทยถ้ามี · ไม่มีก็คืนชื่อท้องถิ่น/อังกฤษ"*
**วัดจริงด้วยตัวอย่าง 12 แห่งจาก 8 ประเทศ (4 ก.ย. 2026) — ขอ `languageCode=th` แล้วได้:**
```
th  ชิบูย่า 109 · โอเอซิส 21 · รูปปั้นกบ 9 ตัว
ko  가보정 1관
en  3rd Sister Dumplings · Adam Food Centre · AIRSIDE · A Dong Silk
    Anping Fort · ALBERGUE 1601 · 798 Art Zone · APM
```
⇒ **เหมาเป็น `th` ทั้งก้อนจะติดป้ายผิด 9/12 ในตัวอย่างนี้** และผลไม่ใช่แค่ป้ายผิด:
   `catalogPlaceCards()` (`lib/engine/trip.ts:227-240`) เลือกชื่อ **ด้วย locale**
   → `pick("th")` จะคืนชื่ออังกฤษเป็น "ชื่อไทย" · `nameLocal` จะเป็น `null` ตลอดกาล
   → และ `catalog_place_names_search_idx` (trigram บน `name`) จะมีชื่อละตินปนอยู่ในดัชนีค้นหาไทย

✅ **ไม่ต้องเดาเลย** — `displayName.languageCode` ของ Place Details บอกภาษาที่คืนจริงมาให้ทุกใบ
🎯 ***ใช้สิ่งที่ต้นทางบอก แทนที่จะอนุมานจากสิ่งที่เราขอ***

## โหมด
    --dry            พิมพ์อย่างเดียว ไม่แตะฐาน  (ค่าเริ่มต้น)
    --apply          เขียนลง catalog_place_names
    --limit N        ทำแค่ N แห่งแรก (ใช้ตรวจก่อนยิงเต็ม)
    --country NAME   จำกัดประเทศ (`catalog_countries.name_en`)
    --from-json F    ข้ามเฟสยิง Google · เขียนจากผลที่เก็บไว้แล้ว

## 🔴 ทำไมแยกสองเฟส (ยิง Google ↔ เขียนฐาน)
เฟสยิงแพงและใช้เวลา (~2,194 ใบ · ~8 นาที) · เฟสเขียนถูกและ **ต้องรอ ack ตาม `TEAM.md §3.3`**
รวมสองเฟสไว้ในคำสั่งเดียว = **รอคิวฐานทีไร ก็จ่ายค่า Google ใหม่ทุกที**
🎯 ***ของที่แพงไม่ควรผูกชะตากับของที่ต้องรอคน***

🔴 `--apply` **แตะฐาน dev** — ต้องประกาศและได้ ack ก่อน (`TEAM.md §3.3`)
🔴 ต้องมี `GOOGLE_MAPS_API_KEY` — `set -a && . .env.local && set +a`
"""
import json, os, re, subprocess, sys, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.join(HERE, "..", "supabase-platform")


def sql(query):
    """รัน SQL ผ่าน `supabase db query --linked` แล้วคืน rows — ท่าเดียวกับ catalog-suggest.py"""
    r = subprocess.run(["supabase", "db", "query", "--linked"], input=query,
                       capture_output=True, text=True, cwd=SUPA)
    if r.returncode != 0:
        raise SystemExit(f"supabase db query ล้ม rc={r.returncode}: {r.stderr[:300]}")
    i = r.stdout.find("{")
    if i < 0:
        raise SystemExit(f"อ่านผลไม่ออก: {r.stdout[:300]}")
    d = json.loads(r.stdout[i:])
    if d.get("_tag") == "Error":
        raise SystemExit(f"SQL error: {json.dumps(d)[:300]}")
    return d.get("rows", [])


def details(key, gpid, lang):
    """Place Details — ขอแค่ `id,displayName` (ฟิลด์น้อยที่สุดที่ตอบคำถามได้)

    คืน `(name, locale)` · `(None, reason)` เมื่อล้ม
    🔴 ห้ามกลบ stderr (`TEAM.md §3.3`) — ถ้า curl ล้มต้องดังทันที ไม่ใช่กลายเป็น "ไม่มีชื่อ"
    """
    r = subprocess.run(
        ["curl", "-s", f"https://places.googleapis.com/v1/places/{gpid}?languageCode={lang}",
         "-H", "X-Goog-Api-Key: " + key, "-H", "X-Goog-FieldMask: id,displayName"],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"curl ล้ม rc={r.returncode}: {r.stderr[:200]}")
    d = json.loads(r.stdout or "{}")
    if "error" in d:
        return None, "API:" + d["error"].get("status", "?")
    dn = d.get("displayName") or {}
    name = (dn.get("text") or "").strip()
    if not name:
        return None, "ไม่มี displayName"
    return name, (dn.get("languageCode") or "").strip()


def norm_locale(code):
    """`zh-TW` → `zh` · `ja` → `ja` · อะไรที่ไม่เข้ารูป → `None`

    🔴 คอลัมน์บังคับ `locale ~ '^[a-z]{2}$'` (`20260825134043_e2_catalog_places.sql:126`)
       → subtag ต้องตัดทิ้ง **ที่นี่** ไม่ใช่ปล่อยให้ฐานปฏิเสธทั้ง batch
    ⚠️ ตัวที่ตัดไม่ได้จะถูก *ข้ามและรายงาน* ไม่ใช่เดาให้เป็น `th`
    """
    c = (code or "").lower().split("-")[0]
    return c if re.fullmatch(r"[a-z]{2}", c) else None


def main():
    a = sys.argv[1:]
    apply_ = "--apply" in a
    limit = int(a[a.index("--limit") + 1]) if "--limit" in a else 0
    country = a[a.index("--country") + 1] if "--country" in a else None
    from_json = a[a.index("--from-json") + 1] if "--from-json" in a else None
    lang = a[a.index("--lang") + 1] if "--lang" in a else "th"

    if from_json:
        got = json.load(open(from_json))
        h = collections.Counter(g["locale"] for g in got)
        print(f"  อ่านจาก {from_json}: {len(got)} แถว · locale: "
              + " · ".join(f"{k}={v}" for k, v in h.most_common()))
        if not apply_:
            print("\n  🔴 โหมด --dry — **ไม่ได้เขียนฐานเลย** · เติม --apply เพื่อเขียนจริง")
            return 0
        return write_names(got)

    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        raise SystemExit("🔴 ไม่มี GOOGLE_MAPS_API_KEY — `set -a && . .env.local && set +a` ก่อน")

    where = "and co.name_en = '%s'" % country.replace("'", "''") if country else ""
    rows = sql(f"""
        select p.id, p.city_id, p.google_place_id gpid, p.legacy_slug slug, co.name_en country
        from public.catalog_places p
        join public.catalog_cities ci on ci.id = p.city_id
        join public.catalog_countries co on co.id = ci.country_id
        where not exists (select 1 from public.catalog_place_names n where n.place_id = p.id)
          and coalesce(p.google_place_id, '') <> ''
          {where}
        order by co.name_en, p.legacy_slug;""")
    if limit:
        rows = rows[:limit]
    print(f"  แถวที่ไม่มีชื่อและมี google_place_id: {len(rows)}"
          + (f"  (จำกัด --limit {limit})" if limit else ""))
    if not rows:
        print("  ไม่มีอะไรให้ทำ"); return 0

    got, failed = [], collections.Counter()
    loc_hist = collections.Counter()
    t0 = time.time()
    for i, r in enumerate(rows, 1):
        name, code = details(key, r["gpid"], lang)
        if name is None:
            failed[code] += 1
            continue
        loc = norm_locale(code)
        if loc is None:
            failed["locale ไม่เข้ารูป: " + repr(code)] += 1
            continue
        loc_hist[loc] += 1
        got.append({"place_id": r["id"], "city_id": r["city_id"],
                    "locale": loc, "name": name, "slug": r["slug"], "country": r["country"]})
        if i <= 40 or i % 200 == 0:
            print("   %5d/%d  %-22s %-3s %s" % (i, len(rows), (r["slug"] or "")[:22], loc, name[:44]))
    dt = time.time() - t0

    print(f"\n  ── ผล ── ได้ชื่อ {len(got)} / {len(rows)}  ({dt:.0f} วิ)")
    # 🎯 ฮิสโทแกรมนี้คือหลักฐานว่า "แยก locale จริง" ไม่ใช่คำอ้าง — ถ้าออกมา `th` 100% ให้สงสัยทันที
    print("  locale ที่ Google คืนมาจริง (ขอไปเป็น '%s'): %s" % (
        lang, " · ".join(f"{k}={v}" for k, v in loc_hist.most_common()) or "-"))
    if failed:
        print("  ── ที่ไม่ได้ชื่อ ──")
        for k, v in failed.most_common():
            print(f"     {v:5d}  {k}")

    json.dump(got, open("/tmp/catalog-backfill-names.json", "w"), ensure_ascii=False)
    print("  📄 รายละเอียดเต็ม: /tmp/catalog-backfill-names.json")

    if not apply_:
        print("\n  🔴 โหมด --dry (ค่าเริ่มต้น) — **ไม่ได้เขียนฐานเลย** · เติม --apply เพื่อเขียนจริง")
        return 0
    return write_names(got)


def write_names(got):
    """เขียน `catalog_place_names` — ที่เดียวในสคริปต์ที่เขียนฐาน

    · `priority = 1` ทุกใบ — เป็นชื่อแรกของสถานที่นั้นอยู่แล้ว (ตารางนี้ว่างสำหรับแถวเหล่านี้)
    · `source = 'google'` — คอลัมน์นี้มีอยู่เพื่อให้ *ลบเฉพาะของ Google ได้* ตอน ToS เปลี่ยน
      (`20260825134043_e2_catalog_places.sql:139-141`) ⇒ ติดป้ายให้ถูกตั้งแต่แถวแรก
    · `on conflict do nothing` — รันซ้ำได้โดยไม่พัง (pk = place_id, locale, priority)
    """
    if not got:
        print("  ไม่มีอะไรให้เขียน"); return 0
    total = 0
    CH = 200
    for s in range(0, len(got), CH):
        chunk = got[s:s + CH]
        values = ",\n".join(
            "  ('{pid}', '{cid}', '{loc}', '{nm}', 1, 'google')".format(
                pid=g["place_id"], cid=g["city_id"], loc=g["locale"],
                nm=g["name"].replace("'", "''"))
            for g in chunk)
        out = sql(f"""insert into public.catalog_place_names
                        (place_id, city_id, locale, name, priority, source)
                      values
{values}
                      on conflict do nothing
                      returning place_id;""")
        total += len(out)
        print(f"  เขียนแล้ว {total}/{len(got)}")
    print(f"  ✅ เขียน catalog_place_names {total} แถว")
    return 0


if __name__ == "__main__":
    sys.exit(main())
