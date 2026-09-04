#!/usr/bin/env python3
"""ดึง "สถานที่ที่คนไปกันจริง" ต่อเมืองจาก Google Places API → เสนอเข้า catalog_places

🔴 **ทำไมไม่เขียนรายชื่อเอง:** รายชื่อที่คนเขียนจากความจำ **ตรวจไม่ได้และล้าเงียบ**
   ที่นี่ทุกแถวมี `google_place_id` + จำนวนรีวิว ⇒ รันซ้ำแล้วได้ผลเทียบกันได้

## ตัวเลือกออกแบบที่วัดมาแล้ว (4 ก.ย. 2026)
· `rankPreference: POPULARITY` ไม่ใช่ DISTANCE — บทเรียนเดิมของโปรเจกต์
  (DISTANCE ทำให้คลินิกศัลยกรรมเกาหลีขึ้นมาแทนโรงพยาบาลจริง)
· 🔴 **แจกเมืองด้วย `addressComponents.locality` ไม่ใช่ระยะทาง**
  วัดแล้ว: Hakkeijima อยู่ **โยโกฮามะ** แต่ใกล้คามาคุระกว่า (9.1 vs 11.9 กม.)
  ⇒ "เมืองใกล้สุดชนะ" จะแจกผิดเมือง **และทำให้แถวเดียวโผล่สองเมือง**
· 🔴 **ไม่ใช้เกณฑ์จำนวนรีวิวตายตัว** — เมืองเล็กมีของดีที่รีวิวน้อย
  (ซกโช: น้ำตกบีรยอง ⭐4.5 แต่ 242 รีวิว · ของจริงทั้งคู่)
  ⇒ เรียงตามความนิยม **ภายในเมืองเดียวกัน** แล้วตัดที่ `--limit`

## โหมด
    --dry     พิมพ์อย่างเดียว ไม่แตะฐาน  (ค่าเริ่มต้น)
    --apply   เขียนลง catalog_places     (ต้องมี SUPABASE_SERVICE_ROLE_KEY)
"""
import collections, json, os, re, subprocess, sys, unicodedata

FIELDS = ("places.id,places.displayName,places.primaryTypeDisplayName,places.rating,"
          "places.userRatingCount,places.location,places.types,places.addressComponents")

# Google type → category ของคลัง · เรียงตามลำดับความเจาะจง (ตัวแรกที่ match ชนะ)
CATEGORY_MAP = [
    ("market",     {"market", "flea_market", "farmers_market"}),
    ("shopping",   {"shopping_mall", "department_store", "shopping_center"}),
    ("nature",     {"park", "national_park", "garden", "botanical_garden", "hiking_area"}),
    ("beach",      {"beach"}),
    ("viewpoint",  {"observation_deck"}),
    ("culture",    {"hindu_temple", "buddhist_temple", "shinto_shrine", "church", "mosque",
                    "museum", "art_gallery", "historical_landmark", "historical_place",
                    "cultural_landmark", "monument"}),
    ("nightlife",  {"night_club", "bar"}),
]
SEARCH_TYPES = ["tourist_attraction", "market", "shopping_mall"]

def category_for(types):
    t = set(types or [])
    for cat, keys in CATEGORY_MAP:
        if t & keys:
            return cat
    return "sight"

def slugify(name, taken):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()[:40].strip("-")
    if not s:
        s = "place"
    base, i = s, 2
    while s in taken:
        s = f"{base[:36]}-{i}"; i += 1
    taken.add(s)
    return s

def nearby(key, lat, lng, radius, limit, lang="th"):
    body = {"includedTypes": SEARCH_TYPES, "maxResultCount": min(20, max(limit * 2, 10)),
            "rankPreference": "POPULARITY", "languageCode": lang,
            "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng},
                                               "radius": float(radius)}}}
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "https://places.googleapis.com/v1/places:searchNearby",
         "-H", "Content-Type: application/json", "-H", "X-Goog-Api-Key: " + key,
         "-H", "X-Goog-FieldMask: " + FIELDS, "-d", json.dumps(body)],
        capture_output=True, text=True)
    # 🔴 ห้ามกลบ stderr — ถ้าล้มต้องเห็น (TEAM.md §3.3)
    if r.returncode != 0:
        raise SystemExit(f"curl ล้ม rc={r.returncode}: {r.stderr[:200]}")
    d = json.loads(r.stdout or "{}")
    if "error" in d:
        raise SystemExit(f"Google: {d['error'].get('status')} {d['error'].get('message','')[:160]}")
    return d.get("places", [])

def comp(place, kind):
    for c in place.get("addressComponents", []):
        if kind in c.get("types", []):
            return c.get("longText")
    return None


# คำต่อท้ายที่ Google ใส่แต่ชื่อเมืองในคลังไม่มี (และกลับกัน)
# 🔴 `shi`/`sheng`/`qu` มาจากจีน: Google คืน **พินอินเว้นวรรค + คำต่อท้าย** — `Cheng Du Shi` (成都市)
# 🔴 เติม 4 ก.ย. 2026 (P5 วัดมา) — ไต้หวันคืน `county`/`township`/`district` ที่ระดับ admin1/admin2
#    `_norm("Nantou County")` = `nantoucounty` ≠ `nantou` ⇒ **หนานโถว/ฮวาเหลียนได้ 0 แห่ง**
#    ⚠️ **และครึ่งหนึ่งผ่าน**: `New Taipei City` · `Taipei City` ผ่านเพราะ `city` อยู่ในลิสต์อยู่แล้ว
#    → ตัวเลขรวมจึงไม่ดูผิดสังเกต **นั่นคือเหตุผลที่ไม่มีใครเห็นมันจนกว่าจะไล่ทีละเมือง**
_SUFFIX = ("city", "town", "village", "ward", "county", "township", "district",
           "shi", "sheng", "qu", "go", "cho")

# 🔴 **เมืองที่ Google ไม่มีชื่อเดียว — ต้องประกาศชื่ออื่นตรง ๆ**
#    ฮ่องกงไม่มี `locality` และ `admin1` เป็น *เขต* ทั้งสาม ไม่ใช่ชื่อเมือง
#    ⇒ เป็นข้อเท็จจริงของ *ปลายทาง* ไม่ใช่ของคลังเรา จึงประกาศที่นี่ ไม่ใช่แก้ข้อมูลในฐาน
#    ⚠️ **ตารางนี้จะล้าถ้า Google เปลี่ยนวิธีเรียก** — และ `--why` จะบอกทันทีว่าข้ามเพราะชื่ออะไร
ALIASES = {
    "Hong Kong": ("kowloon", "hongkongisland", "newterritories", "hongkong"),
}


def _norm(name):
    """ทำให้ชื่อเมืองเทียบกันได้ — ตัดคำต่อท้าย ช่องว่าง และขีด

    วัดแล้ว 4 ก.ย. 2026 · รูปที่ Google คืนมาจริงและไม่ตรงกับคลังเรา:
    ```
    Cheng Du Shi   ↔ Chengdu      พินอินเว้นวรรค + 市
    Minato City    ↔ Tokyo        ชื่อเขต (แก้ด้วยชั้น admin1)
    Shirakawa      ↔ Shirakawa-go คำต่อท้ายต่างกัน
    กรุงเทพมหานคร  ↔ Bangkok      คนละภาษา (แก้ด้วย name_local)
    ```
    """
    n = (name or "").strip().lower()
    # 🔴 ตัดอักขระที่ไม่ใช่ตัวอักษร/ตัวเลขทิ้ง — `Xi'an` ↔ `Xi An Shi` ต่างกันแค่ตัวนี้
    #    ⚠️ ใช้ `\w` ของ Python ซึ่งครอบตัวอักษรไทย/จีน/ญี่ปุ่นด้วย (ไม่ใช่แค่ ASCII)
    n = re.sub(r"[^\w\s]", " ", n, flags=re.UNICODE)
    parts = [w for w in n.split() if w]
    while len(parts) > 1 and parts[-1] in _SUFFIX:
        parts.pop()
    n = "".join(parts)
    for suf in _SUFFIX:
        if n.endswith(suf) and len(n) > len(suf) + 2:
            n = n[: -len(suf)]
    return n


def names_of(city):
    """ชื่อทั้งหมดที่เมืองนี้อาจถูกเรียก — **มาจากคลังของเราเอง ไม่ได้เดา**

    🔴 **วัดแล้ว 4 ก.ย. 2026 — ไทยกับเวียดนาม *ไม่มี* `locality` เลยสักรายการ**
    และ `administrative_area_level_1` เป็น **ชื่อท้องถิ่น** ไม่ใช่ชื่ออังกฤษ:
    ```
    กรุงเทพฯ  loc=—  admin1=กรุงเทพมหานคร   ← คลังเก็บ name_en='Bangkok'
    ฮานอย     loc=—  admin1=Hà Nội          ← คลังเก็บ name_en='Hanoi'
    โซล       loc=—  admin1=Seoul           ← ตรง จึงผ่านมาแต่แรก
    ```
    🎯 **ผลลบที่มาจากกฎแคบเกิน ไม่ใช่จากข้อมูล** — ไทยได้ 3 จาก 156 ที่เจอ · เวียดนามได้ 2 จาก 18
    ✅ `catalog_cities.name_local` มีชื่อที่ตรงกับ Google อยู่แล้ว (`กรุงเทพมหานคร` · `Hà Nội`)
       ⇒ **ใช้ข้อมูลของเราเอง ไม่ต้องทำตารางแปลชื่อขึ้นมาใหม่ให้ล้า**
    """
    out = [n for n in (city.get("name_en"), city.get("name_local"), city.get("name_th")) if n]
    out += list(ALIASES.get(city.get("name_en"), ()))
    return out


def city_of(place, city, catalog_names):
    """เจ้าของสถานที่นี้คือเมือง `city_en` หรือเปล่า — คืน (ใช่ไหม, เหตุผล)

    🔴 **สามชั้น เรียงตามความเจาะจง — และชั้นล่างห้ามแย่งของชั้นบน**
    ```
    ① locality ตรงชื่อเมืองเป๊ะ                      Kotoku-in → Kamakura
    ② locality ตรงหลังตัดคำต่อท้าย                    "Shirakawa" ↔ "Shirakawa-go"
    ③ admin2 ตรงชื่อเมือง (อำเภอ/เขต)                  ฮอยอัน: locality=— · admin2="Hoi An" · admin1="Da Nang"
    ④ admin1 ตรงชื่อเมือง (จังหวัดที่ชื่อเดียวกับเมือง)  โตเกียว: locality="Minato City" · admin1="Tokyo"
    ```
    🔴 **ชั้น admin2 เพิ่ม 4 ก.ย. 2026 (P5 วัดมา) — และมันปิดบั๊กที่*ดูสมเหตุสมผลทั้งสองฝั่ง*:**
    เวียดนามควบรวมจังหวัดปี 2025 ⇒ `admin1` ของ **ฮอยอัน** คือ **`Da Nang`**
    ⇒ ชั้น admin1 เดิมคืน `True` ให้ดานัง · **ฮอยอันได้ 0 · ดานังได้ของฮอยอันไปทั้งหมด**
    ⚠️ **และการ์ด "ยกให้เมืองที่ตรงกว่า" เดิมช่วยไม่ได้ เพราะมันเขียนว่า `if loc and …`**
       — ฮอยอัน **ไม่มี `locality`** ⇒ การ์ดทั้งอันถูกข้าม · ตัวที่รู้ว่าเป็นฮอยอันคือ `admin2`
    🎯 ***การ์ดที่ผูกกับฟิลด์เดียว จะเงียบสนิทในเคสที่ฟิลด์นั้นว่าง — ซึ่งคือเคสที่มันควรทำงานที่สุด***
    🔴 **ชั้น ③ ต้องไม่แย่งของเมืองอื่นในคลัง** — ถ้า `locality` เป็นชื่อเมืองที่มีในคลังอยู่แล้ว
       ให้เมืองนั้นเป็นเจ้าของ **ไม่ใช่เมืองที่ชื่อตรงกับจังหวัด**
       (ไม่งั้น "Tokyo" จะกวาดสถานที่ของเมืองข้างเคียงที่อยู่ในจังหวัดเดียวกัน)
    ⚠️ **วัดมาแล้ว 4 ก.ย. 2026:** ถ้ามีแต่ชั้น ① → **โตเกียวได้ 0 · ชิราคาวาโกะได้ 0**
       ทั้งที่ทั้งสองเมืองมีของเพียบ — ผลลบที่มาจากกฎแคบเกิน ไม่ใช่จากข้อมูล
    """
    loc = comp(place, "locality")
    a2 = comp(place, "administrative_area_level_2")
    a1 = comp(place, "administrative_area_level_1")
    mine = {_norm(n) for n in names_of(city)}

    def owned_by_other(name):
        """ชื่อนี้เป็นชื่อของเมือง *อื่น* ในคลังหรือเปล่า — ใช้ยกของให้เจ้าของที่เจาะจงกว่า"""
        if not name:
            return False
        t = _norm(name)
        return any(t in {_norm(x) for x in ns}
                   for cn, ns in catalog_names.items() if cn != city["name_en"])

    if loc and _norm(loc) in mine:
        return True, "locality"
    if a2 and _norm(a2) in mine:
        # ชั้นนี้ยังต้องยกให้ `locality` ซึ่งเจาะจงกว่า ตามหลักเดียวกับชั้น admin1
        if owned_by_other(loc):
            return False, "ยกให้เมืองที่ locality ตรงกว่า"
        return True, "admin2"
    if a1 and _norm(a1) in mine:
        # 🔴 ชั้น ③ — ยกให้เมืองที่ระดับเจาะจงกว่าตรงกว่า ถ้าเมืองนั้นมีในคลัง
        #    ไม่งั้น "โตเกียว" (ที่ชื่อตรงกับจังหวัด) จะกวาดของเมืองข้างเคียงในจังหวัดเดียวกัน
        if owned_by_other(loc) or owned_by_other(a2):
            return False, "ยกให้เมืองที่ locality/admin2 ตรงกว่า"
        return True, "admin1"
    # 🔴 **ชั้น ④ — นครรัฐ: ไม่มีทั้ง `locality` และ `admin1` เลย**
    #    วัดแล้ว 4 ก.ย. 2026: มาเก๊าคืนมาแค่ `country = "มาเก๊า"` ทั้ง 15 รายการ
    #    (ซากอาสนวิหารนักบุญเปาโล 26,590 รีวิว · เดอะเวเนเชี่ยน 28,827 — ของจริงทั้งนั้น)
    #    ⇒ กฎสามชั้นแรกตัดทิ้งหมด **มาเก๊าได้ 0 แห่งทั้งที่มีของเพียบ**
    # ⚠️ **ชั้นนี้แคบโดยตั้งใจ: ใช้ได้เฉพาะตอนที่ *ไม่มีทั้งสองระดับ***
    #    ถ้าประเทศใหญ่คืนมาแบบนี้ แปลว่ามีอย่างอื่นผิด — ให้ `--why` โชว์แล้วไปดู ไม่ใช่กวาดเข้ามา
    if not loc and not a1:
        ctry = comp(place, "country")
        if ctry and _norm(ctry) in mine:
            return True, "country (นครรัฐ)"
    return False, "คนละเมือง"


SELFTEST = [
    # (ป้าย, addressComponents, ชื่อเมืองที่ถาม, ผลที่ต้องได้)
    # ── รูปที่ P5 วัดจาก Places API จริง 4 ก.ย. 2026 (ไต้หวัน · เวียดนาม) ──
    ("หนานโถว: county ที่ admin1", dict(administrative_area_level_2="Yuchi Township",
                                        administrative_area_level_1="Nantou County"), "Nantou", True),
    ("ฮวาเหลียน: county",          dict(administrative_area_level_2="Xiulin Township",
                                        administrative_area_level_1="Hualien County"), "Hualien", True),
    ("นิวไทเป: city (เคยผ่านอยู่แล้ว)", dict(administrative_area_level_2="Ruifang District",
                                        administrative_area_level_1="New Taipei City"), "New Taipei", True),
    ("ฮอยอัน: admin2 เป็นตัวชี้",   dict(administrative_area_level_2="Hoi An",
                                        administrative_area_level_1="Da Nang"), "Hoi An", True),
    ("ดานังห้ามกวาดของฮอยอัน",     dict(administrative_area_level_2="Hoi An",
                                        administrative_area_level_1="Da Nang"), "Da Nang", False),
    ("ดานังของจริงยังเป็นของดานัง", dict(locality="Da Nang",
                                        administrative_area_level_1="Da Nang"), "Da Nang", True),
    # ── รูปที่สคริปต์นี้จดไว้เองว่าวัดมาแล้วก่อนหน้า (เคสถดถอย) ──
    ("โตเกียว: ward → admin1",     dict(locality="Minato City",
                                        administrative_area_level_1="Tokyo"), "Tokyo", True),
    ("ชิราคาวาโกะ: คำต่อท้ายต่าง",  dict(locality="Shirakawa",
                                        administrative_area_level_1="Gifu"), "Shirakawa-go", True),
    ("เฉิงตู: พินอินเว้นวรรค + 市",  dict(locality="Cheng Du Shi",
                                        administrative_area_level_1="Sichuan Sheng"), "Chengdu", True),
    ("ซีอาน: อะพอสทรอฟี",           dict(locality="Xi An Shi",
                                        administrative_area_level_1="Shaanxi Sheng"), "Xi'an", True),
    ("มาเก๊า: นครรัฐ ไม่มีสองระดับ", dict(country="Macao"), "Macao", True),
    ("ฮ่องกง: admin1 เป็นเขต",       dict(administrative_area_level_1="Kowloon"), "Hong Kong", True),
    ("โตเกียวห้ามแย่งเมืองในคลัง",   dict(locality="Yokohama",
                                        administrative_area_level_1="Tokyo"), "Tokyo", False),
]

_SELFTEST_CITIES = ["Nantou", "Hualien", "New Taipei", "Hoi An", "Da Nang", "Tokyo",
                    "Yokohama", "Shirakawa-go", "Chengdu", "Xi'an", "Macao", "Hong Kong"]


def selftest():
    """🔴 **รันเองทุกครั้งก่อนนำเข้า — ไม่ใช่แฟล็กที่ต้องมีคนนึกได้**

    เหตุผลที่ต้องเป็นแบบนี้ ไม่ใช่แค่ไฟล์ probe ข้าง ๆ:
    `city_of()` **พังแบบเงียบ** — ผลของมันคือ *"เมืองนี้ได้ n แห่ง"* ซึ่งอ่านเป็นตัวเลขปกติเสมอ
    ไม่ว่าจะถูกหรือผิด · บั๊กสองตัวที่ P5 เจอ (4 ก.ย. 2026) ทำให้ **หนานโถว/ฮวาเหลียนได้ 0**
    และ **ฮอยอันได้ 0 ส่วนดานังได้ของฮอยอันไปทั้งหมด** — และตัวเลขทั้งสองฝั่ง *ดูสมเหตุสมผล*

    🎯 ***ด่านที่มีค่าที่สุดคือด่านของฟังก์ชันที่ผลลัพธ์ผิดของมันหน้าตาเหมือนผลลัพธ์ถูก***
    ⚠️ **ไม่ยิงเน็ต ไม่แตะฐาน** — เป็น pure function ล้วน ราคาจึงเป็นศูนย์ ไม่มีเหตุให้ข้าม
    """
    cities = [{"name_en": n, "name_th": n, "name_local": None} for n in _SELFTEST_CITIES]
    cat = {c["name_en"]: [c["name_en"], c["name_th"]] for c in cities}
    by = {c["name_en"]: c for c in cities}
    bad = []
    for label, kw, city_en, want in SELFTEST:
        p = {"addressComponents": [{"types": [k], "longText": v} for k, v in kw.items() if v]}
        got, why = city_of(p, by[city_en], cat)
        if got != want:
            bad.append(f"{label}: {city_en} ได้ {got} ({why}) ต้องการ {want}")
    # 🔴 ทะเบียนว่าง = ด่านเงียบ — เคสหายไปหมดต้องแดง ไม่ใช่ผ่าน
    if len(SELFTEST) < 10:
        raise SystemExit("🔴 selftest: เคสหายไป — ด่านนี้จะผ่านโดยไม่ตรวจอะไร")
    if bad:
        raise SystemExit("🔴 selftest ของ city_of ล้ม — **หยุดก่อนนำเข้า**\n   "
                         + "\n   ".join(bad))


def sql(query):
    """รัน SQL ผ่าน `supabase db query --linked` แล้วคืน rows"""
    r = subprocess.run(["supabase", "db", "query", "--linked"], input=query,
                       capture_output=True, text=True,
                       cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "supabase-platform"))
    if r.returncode != 0:
        raise SystemExit(f"supabase db query ล้ม rc={r.returncode}: {r.stderr[:300]}")
    i = r.stdout.find("{")
    if i < 0:
        raise SystemExit(f"อ่านผลไม่ออก: {r.stdout[:300]}")
    d = json.loads(r.stdout[i:])
    if d.get("_tag") == "Error":
        raise SystemExit(f"SQL error: {json.dumps(d)[:300]}")
    return d.get("rows", [])


def main():
    args = sys.argv[1:]
    apply_ = "--apply" in args
    country = next((a.split("=", 1)[1] for a in args if a.startswith("--country=")), "jp")
    limit = int(next((a.split("=", 1)[1] for a in args if a.startswith("--limit=")), "12"))
    radius = int(next((a.split("=", 1)[1] for a in args if a.startswith("--radius=")), "12000"))
    only = next((a.split("=", 1)[1] for a in args if a.startswith("--city=")), None)

    selftest()   # 🔴 ก่อนทุกอย่าง — ราคาศูนย์ และมันคือสิ่งเดียวที่จับ city_of ที่พังเงียบได้

    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        raise SystemExit("🔴 ไม่มี GOOGLE_MAPS_API_KEY — `set -a && . .env.local && set +a` ก่อน")

    cities = sql(f"""select ci.id, ci.name_th, ci.name_en, ci.name_local, ci.lat, ci.lng,
                            count(p.id) as have
                       from public.catalog_cities ci
                       left join public.catalog_places p on p.city_id = ci.id
                      where ci.country_id = '{country}'
                      group by ci.id, ci.name_th, ci.name_en, ci.name_local, ci.lat, ci.lng
                      order by ci.name_en;""")
    if only:
        cities = [c for c in cities if c["name_en"] == only]
    if not cities:
        raise SystemExit(f"ไม่พบเมืองของประเทศ '{country}'")

    # ── ของที่มีอยู่แล้ว: กันซ้ำสองทาง (google_place_id และชื่อ) ──
    existing = sql("""select google_place_id, maps_query, legacy_slug
                        from public.catalog_places;""")
    seen_gpid = {e["google_place_id"] for e in existing if e.get("google_place_id")}
    seen_name = {(e["maps_query"] or "").lower().strip() for e in existing if e.get("maps_query")}
    taken_slug = {e["legacy_slug"] for e in existing if e.get("legacy_slug")}
    by_en = {c["name_en"]: c for c in cities}
    # ชื่อทุกแบบของทุกเมือง — ใช้ตัดสินว่าสถานที่หนึ่ง "เป็นของเมืองไหน"
    all_names = {c["name_en"]: names_of(c) for c in cities}

    print(f"\n  ประเทศ {country} · {len(cities)} เมือง · limit {limit}/เมือง · radius {radius/1000:g} กม.")
    print(f"  มีในคลังแล้ว {len(existing)} แห่ง (กันซ้ำด้วย google_place_id {len(seen_gpid)} · ชื่อ {len(seen_name)})\n")

    rows, skipped_city, dup = [], 0, 0
    # 🔴 **เก็บว่าข้ามเพราะ *ชื่ออะไร* ไม่ใช่แค่ *กี่อัน***
    #    บั๊กคลาส "กฎแจกเมืองแคบเกิน" เกิดสามรอบแล้ว (โตเกียว 0 · ไทย 3 · ฮ่องกง 0)
    #    ทุกรอบ **สคริปต์ทำงานสำเร็จและให้ตัวเลขที่ดูสมเหตุสมผล**
    #    🎯 ตัวนับเปล่า ๆ บอกว่า *มีของหาย* แต่ไม่บอกว่า *หายเพราะอะไร*
    #       ⇒ ต้องมีคนไปนั่งยิง API เองทุกครั้ง · ตัวนี้ทำให้มันบอกเองได้
    skipped_names = collections.Counter()
    for c in cities:
        got = nearby(key, c["lat"], c["lng"], radius, limit)
        picked = []
        for p in got:
            # 🔴 แจกด้วยเขตปกครอง ไม่ใช่ระยะทาง · เมืองที่ไม่มีในคลัง = ข้าม (ไม่เดา)
            ok, why = city_of(p, c, all_names)
            if not ok:
                loc, a1 = comp(p, "locality"), comp(p, "administrative_area_level_1")
                known = {_norm(x) for ns in all_names.values() for x in ns}
                if (loc and _norm(loc) not in known) or (not loc and a1 and _norm(a1) not in known):
                    skipped_city += 1
                    skipped_names[(loc or "—") + " / " + (a1 or "—")] += 1
                continue
            gpid = p.get("id")
            name = p.get("displayName", {}).get("text", "").strip()
            if not name or not gpid:
                continue
            if gpid in seen_gpid or name.lower() in seen_name:
                dup += 1
                continue
            seen_gpid.add(gpid); seen_name.add(name.lower())
            picked.append({
                "city_id": c["id"], "city_en": c["name_en"], "city_th": c["name_th"],
                "name": name, "google_place_id": gpid,
                "category": category_for(p.get("types")),
                "lat": p["location"]["latitude"], "lng": p["location"]["longitude"],
                "maps_query": f"place_id:{gpid}",
                "legacy_slug": slugify(name, taken_slug),
                "rating": p.get("rating"), "reviews": p.get("userRatingCount", 0),
            })
            if len(picked) >= limit:
                break
        rows.extend(picked)
        print(f"  ── {c['name_en']} / {c['name_th']} (มีอยู่ {c['have']}) → เสนอเพิ่ม {len(picked)} ──")
        for i, x in enumerate(picked, 1):
            print("     %2d. %-34s %-10s ⭐%-4s %8s รีวิว" %
                  (i, x["name"][:34], x["category"], x["rating"] or "-", f'{x["reviews"]:,}'))

    print(f"\n  รวมเสนอเพิ่ม {len(rows)} แห่ง · ข้ามเพราะซ้ำ {dup} · ข้ามเพราะอยู่เมืองนอกคลัง {skipped_city}")
    if skipped_names:
        # 🔴 ถ้าชื่อที่ข้ามบ่อยที่สุด *หน้าตาเหมือนเมืองที่เราเพิ่งใส่ไป* = กฎแจกเมืองแคบเกิน ไม่ใช่ข้อมูลขาด
        print("  ── ชื่อเขต/จังหวัดที่ถูกข้ามบ่อยที่สุด (loc / admin1) ──")
        for name, n in skipped_names.most_common(8):
            print(f"     {n:4d}  {name}")
    json.dump(rows, open("/tmp/catalog-suggest.json", "w"), ensure_ascii=False)
    print("  📄 รายละเอียดเต็ม: /tmp/catalog-suggest.json")

    if not apply_:
        print("\n  🔴 โหมด --dry (ค่าเริ่มต้น) — **ไม่ได้แตะฐานเลย** · เติม --apply เพื่อเขียนจริง")
        return 0

    svc = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not svc:
        raise SystemExit("🔴 --apply ต้องมี SUPABASE_SERVICE_ROLE_KEY")
    values = ",\n".join(
        "  ('{cid}', '{slug}', '{cat}', {lat}, {lng}, '{mq}', '{gp}', 'google')".format(
            cid=r["city_id"], slug=r["legacy_slug"], cat=r["category"],
            lat=r["lat"], lng=r["lng"], mq=r["maps_query"].replace("'", "''"),
            gp=r["google_place_id"].replace("'", "''"))
        for r in rows)
    if not values:
        print("  ไม่มีอะไรให้เขียน"); return 0
    out = sql(f"""insert into public.catalog_places
                    (city_id, legacy_slug, category, lat, lng, maps_query, google_place_id, source)
                  values
{values}
                  on conflict do nothing
                  returning legacy_slug;""")
    print(f"  ✅ เขียนลงคลังแล้ว {len(out)} แถว")
    return 0


if __name__ == "__main__":
    sys.exit(main())
