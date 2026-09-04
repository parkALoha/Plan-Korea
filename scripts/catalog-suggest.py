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

# 🔴 **ชนิดของกิน — แยกจาก `SEARCH_TYPES` โดยตั้งใจ** (P5 · 4 ก.ย. 2026)
# เหตุ: `SEARCH_TYPES` ทั้งสามเป็น "ที่ให้ดู" ⇒ คลัง 1,619 แห่งมีของกิน **29 แห่ง = 1.8%**
#      ตอบได้แค่ *"ไปดูอะไร"* · ตอบ *"กินอะไร"* แทบไม่ได้เลย ทั้งที่คนไปเกาหลี/ญี่ปุ่น/ไต้หวัน
#      เล่าถึงของกินมากที่สุด
# ⚠️ **ห้ามยัดรวมใน `SEARCH_TYPES`** — ร้านอาหารมีรีวิวเยอะกว่าวัด/สวนโดยธรรมชาติ
#    เพดานรวมเดียวจะทำให้ของกิน **เบียดที่เที่ยวออก** ⇒ แยกเพดาน (`--limit-food`)
FOOD_TYPES = ["restaurant", "cafe", "bakery", "bar", "food_court", "night_club"]

# ชนิดที่ไม่ใช่ *ปลายทาง* — ตัดทิ้งก่อนถึงตัวกรองเชนด้วยซ้ำ
FOOD_EXCLUDE = {"fast_food_restaurant", "convenience_store", "gas_station"}

# 🔴 **ชื่อที่ลงท้ายว่า "สาขา" = สาขาของเชน ไม่ว่าเราจะเห็นมันกี่เมือง** (P5 · 4 ก.ย. 2026)
# ทำไมต้องมีกฎนี้ *เพิ่มจาก* ตัวกรองเชน: ตัวกรองเชนดูว่า **ชื่อเดียวกันโผล่กี่เมือง**
# ⇒ **จับเชนที่โผล่เมืองเดียวไม่ได้เลย** · วัดจริง: ปูซานได้ `갓파스시 연산점` (Kappa Sushi สาขายอนซาน)
#    ซึ่งโผล่เมืองเดียวในผลของเรา ⇒ รอดตัวกรองเชนทุกเกณฑ์
# 🎯 ***ตัวกรองที่นับความถี่ ต้องเห็นของซ้ำถึงจะทำงาน — ของที่โผล่ครั้งเดียวมองไม่เห็นตามนิยาม***
# ✅ `본점` / `本店` / `總店` = **สาขาแรก/ร้านต้นตำรับ ซึ่งมักเป็นร้านที่คนตั้งใจไป** → เก็บไว้
#    (วัดแล้ว: `현대옥 전주본점` · `우성닭갈비 본점` · `お食事処 とよ常 別府本店` — ของจริงทั้งนั้น)
# 🔴 **`점` กับ `Branch` ใช้ตรง ๆ ได้ · `店` ใช้ตรง ๆ ไม่ได้** (P1 ทัก · P5 วัดแล้วเขาถูก)
# ```
# เกาหลี  `점` = "สาขา" เสมอ                          → กฎแม่น
# อังกฤษ  `Branch` = "สาขา" เสมอ                      → กฎแม่น
# จีน     `店` = **"ร้าน" เฉย ๆ** ไม่ได้แปลว่าสาขา     → กฎพัง
#         `南翔馒头店` = ร้านเสี่ยวหลงเปาต้นตำรับที่หยูหยวน **ร้านเดียวในโลก**
#         `海底撈火鍋 板橋店` = สาขาปั่นเฉียวของเชนหม้อไฟ  **คนละเรื่องกันสิ้นเชิง**
# ```
# ✅ **ตัวแยกที่วัดได้จากข้อมูลจริง: มี *ตัวคั่น* หน้าคำที่ลงท้าย `店` หรือเปล่า**
#    สาขาเขียนเป็น `<แบรนด์> <ย่าน>店` — ชื่อย่านเป็นคนละคำ · ร้านเดี่ยวเขียนติดกันคำเดียว
#    วัดกับ 778 แถว: จับสาขาไต้หวัน/จีนได้ **และไม่ตัด `南翔馒头店`**
# ⚠️ **แลกด้วย: สาขาที่เขียนติดกันไม่มีตัวคั่นจะรอด** (`海底捞火锅王府井店`)
#    ยอมรับข้อนี้ **เพราะตัดร้านต้นตำรับทิ้งแพงกว่าปล่อยสาขาหลุด** — และตัวนับความถี่ยังเป็นตาข่ายอีกชั้น
# 🎯 ***กฎเดียวครอบสองภาษาที่คำเดียวกันแปลไม่เหมือนกัน = สัญญาณว่าสรุปเรียบเกินจริง***
_BRANCH_TAIL = re.compile(r"(점|[Bb]ranch)$")
_HEAD_STORE = re.compile(r"(본점|本店|總店|总店)$")
# `店` ต้องมีตัวคั่น (ช่องว่าง/ขีด) นำหน้ากลุ่มคำที่จบด้วยมัน
_BRANCH_CJK = re.compile(r"[\s\-–—·]\S{1,6}店$")


def is_branch_name(name):
    """ชื่อนี้เป็น *สาขา* ของเชนหรือเปล่า — ดูรูปของชื่อ ไม่ใช่ความถี่

    🔴 มีไว้เพราะ **ตัวกรองเชนที่นับความถี่ มองไม่เห็นเชนที่โผล่เมืองเดียวตามนิยาม**
       (ปูซานได้ `갓파스시 연산점` มาเพราะข้อนี้ — Kappa Sushi โผล่เมืองเดียวในผลของเรา)
    """
    name = name or ""
    parts = name.split()
    if not parts or _HEAD_STORE.search(name):
        return False
    return bool(_BRANCH_TAIL.search(parts[-1]) or _BRANCH_CJK.search(name))

# 🔴 **ของกินแมปด้วย *กฎ* ไม่ใช่ *รายชื่อ*** (P5 · 4 ก.ย. 2026)
# Google มีชนิดอาหารแยกตามสัญชาติเป็นสิบ ๆ ตัว (`ramen_restaurant` `korean_restaurant`
# `sushi_restaurant` …) และ **เพิ่มชนิดใหม่ได้ตลอด** ⇒ รายชื่อที่ไล่เองจะล้าเงียบ
# ✅ ใช้กฎ `ลงท้ายด้วย _restaurant` ครอบทั้งตระกูลในบรรทัดเดียว — ชนิดใหม่เข้าเองอัตโนมัติ
_CAFE_TYPES = {"cafe", "coffee_shop", "bakery", "tea_house", "dessert_shop",
               "ice_cream_shop", "donut_shop", "juice_shop"}
_RESTAURANT_TYPES = {"restaurant", "food_court", "meal_takeaway", "deli", "diner", "steak_house"}


def category_for(types):
    t = set(types or [])
    for cat, keys in CATEGORY_MAP:
        if t & keys:
            return cat
    # 🔴 ต้องอยู่ **หลัง** `CATEGORY_MAP` — บาร์ที่เสิร์ฟอาหารด้วยควรเป็น `nightlife` ไม่ใช่ `restaurant`
    if t & _CAFE_TYPES:
        return "cafe"
    if (t & _RESTAURANT_TYPES) or any(x.endswith("_restaurant") for x in t):
        return "restaurant"
    # ⚠️ `sight` **ไม่มีอยู่ใน `Category` ของ `data/places.ts`** (10 หมวด ไม่มีตัวนี้)
    #    ⇒ ทุกแถวที่ตกมาถึงบรรทัดนี้ **แสดงเป็น 📍 เทา "อื่น ๆ" บนจอ**
    #    วันนี้มี 479/1,619 = 29% ของคลัง · P2 กำลังจะตัดสินชุดหมวดใหม่
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

def nearby(key, lat, lng, radius, limit, lang="th", types=None):
    body = {"includedTypes": types or SEARCH_TYPES, "maxResultCount": min(20, max(limit * 2, 10)),
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
           "shi", "sheng", "qu", "go", "cho",
           # ── เกาหลี · วัดจาก `skipped_names` ของการรันจริง 4 ก.ย. 2026 (P5) ──
           #   14  Sokcho-si / Gangwon-do      ← ซกโชค้างที่ 9 แห่ง
           #   11  Gapyeong-gun / Gyeonggi-do  ← คาพย็องได้ 0 (เกาะนามิอยู่ที่นี่)
           #    5  Jeju-si / Jeju-do
           # 🔴 **จงใจไม่ใส่ `gu` และ `do`** — `Daegu` ลงท้ายด้วย `gu` จริง ๆ (จะถูกตัดเหลือ `dae`)
           #    และ `do` เสี่ยงกับชื่อที่ลงท้ายด้วยพยางค์นั้นโดยบังเอิญ · `Jeju-do` แก้ด้วย ALIASES แทน
           #    🎯 **รายการนี้ต้องแลกความครอบคลุมกับความปลอดภัยเสมอ — ไม่ใช่ยิ่งยาวยิ่งดี**
           "si", "gun", "eup", "myeon")

# 🔴 **คำ *นำหน้า* ของหน่วยปกครองไทย — `_SUFFIX` ตัดหางอย่างเดียว จับข้อนี้ไม่ได้เลย** (P5 · 4 ก.ย. 2026)
# วัดจาก `skipped_names` ของการรันจริง ไม่ได้เดา:
# ```
#   15  เมืองพัทยา / ชลบุรี            ← พัทยาค้างอยู่ที่ 2 แห่งเพราะข้อนี้
#    8  ตำบลหัวหิน / ประจวบคีรีขันธ์     ← หัวหิน 2
#   13  — / จังหวัดพระนครศรีอยุธยา       ← อยุธยา 2 (ใบนี้ต้องใช้ ALIASES ด้วย ชื่อคนละชื่อ)
# ```
# 🎯 **ไทยเป็นภาษาที่ *หน่วยปกครองอยู่หน้า* ไม่ใช่หลัง** — `เมือง`/`ตำบล`/`จังหวัด` นำหน้าชื่อจริงเสมอ
#    ⇒ กฎที่เขียนขึ้นจากภาษาที่หน่วยอยู่ท้าย (`市` `Shi` `City`) **ไม่มีทางครอบภาษาที่หน่วยอยู่หน้า**
#    · และมันเงียบสนิท: เมืองได้ 2 แห่งแทนที่จะเป็น 20 **ซึ่งยังอ่านเหมือนตัวเลขปกติ**
_PREFIX = ("จังหวัด", "อำเภอ", "ตำบล", "แขวง", "เขต", "เมือง")
# รูปของ `_PREFIX` หลังผ่านการตัดอักขระแบบเดียวกับ `_norm` — คำนวณครั้งเดียวตอนโหลด
# 🎯 **ที่มาจากที่เดียวกัน จึงเพี้ยนพร้อมกันไม่ได้** — เขียนซ้ำด้วยมือเมื่อไหร่คือรอให้มันล้า
_PREFIX_N = tuple(re.sub(r"[^\w\s]", "", p, flags=re.UNICODE) for p in _PREFIX)

# 🔴 **เมืองที่ Google ไม่มีชื่อเดียว — ต้องประกาศชื่ออื่นตรง ๆ**
#    ฮ่องกงไม่มี `locality` และ `admin1` เป็น *เขต* ทั้งสาม ไม่ใช่ชื่อเมือง
#    ⇒ เป็นข้อเท็จจริงของ *ปลายทาง* ไม่ใช่ของคลังเรา จึงประกาศที่นี่ ไม่ใช่แก้ข้อมูลในฐาน
#    ⚠️ **ตารางนี้จะล้าถ้า Google เปลี่ยนวิธีเรียก** — และ `--why` จะบอกทันทีว่าข้ามเพราะชื่ออะไร
ALIASES = {
    "Hong Kong": ("kowloon", "hongkongisland", "newterritories", "hongkong"),
    # ── ไทย · วัดจาก `skipped_names` ของการรันจริง 4 ก.ย. 2026 (P5) ──────────
    # 🔴 **สองใบนี้ไม่ใช่เรื่องคำนำหน้า — เป็นเรื่อง *ชื่อคนละชื่อ* จึงแก้ที่ `_norm` ไม่ได้**
    # อยุธยา: Google คืน `จังหวัดพระนครศรีอยุธยา` · คลังเก็บ `อยุธยา` (ชื่อที่คนไทยใช้จริง)
    #   ⇒ ตัดคำนำหน้าแล้วยังเหลือ `พระนครศรีอยุธยา` ซึ่งคนละสตริงกับ `อยุธยา`
    "Ayutthaya": ("จังหวัดพระนครศรีอยุธยา", "พระนครศรีอยุธยา", "phranakhonsiayutthaya"),
    # เกาะสมุย: **ไม่มี `locality` เลย** · `admin1` = `สุราษฎร์ธานี` ซึ่งเป็น *จังหวัด* ไม่ใช่ชื่อเกาะ
    #   ⚠️ **ความเสี่ยงที่ต้องรู้:** จังหวัดนี้มีเกาะพะงัน/เกาะเต่า/แผ่นดินใหญ่ด้วย
    #      วันที่มีคนเพิ่มเกาะพะงันเข้าคลัง **สองเมืองจะอ้างสิทธิ์บน `สุราษฎร์ธานี` เหมือนกัน**
    #      และการ์ด "ยกให้เมืองที่ตรงกว่า" **ช่วยไม่ได้เพราะมันดู `locality`/`admin2` ซึ่งว่างทั้งคู่**
    #   📌 วันนี้ปลอดภัยเพราะ ① สมุยเป็นเมืองเดียวของจังหวัดนี้ในคลัง ② การค้นยิงรอบพิกัดสมุย
    #      **ทั้งสองข้อเป็นข้อเท็จจริงของวันนี้ ไม่ใช่คุณสมบัติของโค้ด** — เพิ่มเมืองในจังหวัดนี้เมื่อไหร่ ต้องกลับมาดู
    "Koh Samui": ("สุราษฎร์ธานี", "suratthani"),
    # เชจู: Google คืน `Cheju` (การถอดเสียงแบบเก่า) และ `Jeju-do` (จังหวัด) ปนกัน
    # 🔴 `Cheju` แก้ด้วย `_SUFFIX` ไม่ได้ **เพราะมันไม่ใช่คำต่อท้าย มันคือคนละสตริง**
    "Jeju": ("cheju", "jejudo", "jeju-do"),
    # ฮาลอง: Google **ไม่เคยคืนคำว่า `Ha Long` เลยสักใบ** — คืนชื่อแขวงกับจังหวัดเท่านั้น
    #   วัดจากการรันจริง 4 ก.ย. 2026: `Hồng Gai` 6 · `Bãi Cháy` 4 · `Cao Xanh` 2 · `Việt Hưng` 1
    #   ⇒ ฮาลองได้ **4 แห่ง** ทั้งที่เป็นอ่าวมรดกโลก · **ข้ามไป 15 แห่ง**
    # 🔴 **ใช้ชื่อ *จังหวัด* ไม่ใช่ไล่ชื่อแขวง** — ไล่แขวงคือทะเบียนที่ต้องมีคนคอยเติม
    #    และแขวงใหม่จะหลุดเงียบ ๆ · จังหวัดครอบได้ทั้งหมดในครั้งเดียว
    #    ⚠️ **ข้อแลก (รูปเดียวกับเกาะสมุย):** ถ้าวันหนึ่งมีเมืองที่สองของจังหวัดนี้เข้าคลัง
    #       สองเมืองจะอ้างสิทธิ์ทับกัน · วันนี้ปลอดภัยเพราะฮาลองเป็นใบเดียว **และการค้นยิงรอบพิกัดฮาลอง**
    # 📌 ใส่ทั้งรูปมีและไม่มีวรรณยุกต์ — **API คืนทั้งสองรูปจริง** (`Quảng Ninh` และ `Quang Ninh`)
    "Ha Long": ("Quảng Ninh", "Quang Ninh"),
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
    # 🔴 **ตัดคำต่อท้ายครั้งเดียว (`break`)** — วัดจริง 4 ก.ย. 2026 (P5):
    #    เดิมวนตัดต่อเนื่อง ⇒ `Sokcho-si` → `sokchosi` → ตัด `si` → `sokcho` → **ตัด `cho` ต่อ → `sok`**
    #    ⚠️ **เคสยังเขียวเพราะคลังก็เก็บ `Sokcho` ซึ่งโดนตัดเป็น `sok` เหมือนกัน**
    #       — สองฝั่งเพี้ยนเท่ากันจึงยังตรงกัน · **นั่นคือความบังเอิญ ไม่ใช่ความถูกต้อง**
    #       และมันเปิดช่องให้ชื่อคนละเมืองย่อลงมาชนกันเงียบ ๆ (`sok` สั้นกว่าชื่อจริงมาก)
    #    🎯 ***ตัวปรับข้อมูลที่ทำลายข้อมูลเท่ากันทั้งสองฝั่ง จะผ่านการทดสอบความเท่ากันเสมอ***
    for suf in _SUFFIX:
        if n.endswith(suf) and len(n) > len(suf) + 2:
            n = n[: -len(suf)]
            break
    # 🔴 ตัดคำนำหน้าไทย · เงื่อนไขความยาวเหมือนฝั่งท้าย — กันชื่อที่ *ขึ้นต้นด้วยคำนั้นจริง ๆ* ถูกกินหัว
    #    ตัดครั้งเดียวพอ (`break`) — `จังหวัดเมือง…` ไม่มีอยู่จริง และการวนตัดซ้ำจะกินชื่อสั้น
    # 🔴 **เทียบกับคำนำหน้าที่ผ่าน `_strip_marks` แล้วเท่านั้น** — วัดจริง 4 ก.ย. 2026:
    #    `re.sub(r"[^\w\s]")` ข้างบน **ตัดสระ/วรรณยุกต์ไทยทิ้ง** เพราะ `\w` ของ Python
    #    ไม่นับอักขระประกอบ (Unicode category Mn) ⇒ `เมือง` → `เมอง` · `จังหวัด` → `จงหวด`
    #    ⚠️ **ถ้าเทียบกับคำที่เขียนไว้ในโค้ดตรง ๆ จะไม่มีวันตรง** และมันจะเงียบสนิท
    #       — `ตำบล` บังเอิญรอด (ตัวอักษรทุกตัวเป็น Lo) ⇒ **ครึ่งหนึ่งทำงาน ครึ่งหนึ่งไม่**
    #       ซึ่งเป็นรูปเดียวกับที่ `city`/`county` เคยเป็น · selftest จับได้ตั้งแต่รันแรก
    for pre in _PREFIX_N:
        if n.startswith(pre) and len(n) > len(pre) + 2:
            n = n[len(pre):]
            break
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


def _locality_forms(name):
    """รูปที่เป็นไปได้ของ *ชื่อเมือง* ที่ซ่อนอยู่ใน `locality` — คืนรายการที่ยังไม่ผ่าน `_norm`

    🔴 **วัดจาก `skipped_names` ของการรันเวียดนามจริง 4 ก.ย. 2026 (P5)** — ไม่ได้เดา:
    ```
       9  Xuân Hương - Đà Lạt / Lâm Đồng      ← ดาลัดได้ 0 ทั้งที่มีของเพียบ
       6  Cam Ly - Đà Lạt / Lâm Đồng
       3  Lang Biang - Đà Lạt / Lâm Đồng
       4  Bắc Nha Trang / Khánh Hòa           ← ญาจางได้ไม่ครบ
       3  Tây Nha Trang / Khánh Hòa
    ```
    **สองรูป สองสาเหตุ:**
      ① `<แขวง> - <เมือง>` — ชื่อเมืองอยู่ *หลังขีด* · `_norm` ตัดขีดแล้วเชื่อมติดกัน
         ⇒ `xuanhuongdalat` ซึ่งไม่เท่ากับ `dalat` **และไม่มีชั้นไหนมองเห็น**
      ② `<ทิศ> <เมือง>` — `Bắc/Nam/Đông/Tây` = เหนือ/ใต้/ตะวันออก/ตะวันตก นำหน้าชื่อเมือง

    🎯 ***ทั้งสองรูปคือ "ชื่อเมืองที่ถูกต้อง + ส่วนขยาย" ไม่ใช่ "ชื่ออื่น"*** —
       ต่างจาก `สุราษฎร์ธานี`/`เกาะสมุย` ที่เป็นคนละชื่อกันจริง ๆ (ต้องใช้ `ALIASES`)
    ⚠️ **จงใจไม่ทำให้ทั่วไปกว่านี้** — ไม่ตัดคำนำหน้าอะไรก็ได้ เพราะจะกลายเป็น
       "ชื่อไหนก็แมตช์ได้ถ้ามีชื่อเมืองอยู่ข้างใน" ซึ่งจะกวาดเมืองข้างเคียงเข้ามาเงียบ ๆ
    """
    if not name:
        return []
    out = [name]
    if " - " in name:
        out.append(name.rsplit(" - ", 1)[1])       # เอาส่วนหลังขีดสุดท้าย
    parts = name.split()
    if len(parts) > 1 and parts[0] in ("Bắc", "Nam", "Đông", "Tây"):
        out.append(" ".join(parts[1:]))
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
        # 🔴 ต้องใช้ `_locality_forms` ชุดเดียวกับชั้นข้างล่าง — ไม่งั้นการ์ดจะ *ตาบอด*
        #    ต่อรูปที่ชั้นนั้นมองเห็น แล้วยกของให้เมืองที่ความจริงไม่ได้อ้างสิทธิ์
        #    (รูปเดียวกับที่การ์ดเดิมผูกกับ `loc` ฟิลด์เดียวแล้วเงียบตอน `loc` ว่าง)
        forms = {_norm(f) for f in _locality_forms(name)}
        return any(forms & {_norm(x) for x in ns}
                   for cn, ns in catalog_names.items() if cn != city["name_en"])

    # 🔴 เทียบ *ทุกรูป* ของ locality ไม่ใช่รูปดิบรูปเดียว — ดู `_locality_forms`
    if loc and any(_norm(f) in mine for f in _locality_forms(loc)):
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
    # ── ไทย · รูปที่ P5 วัดจาก `skipped_names` ของการรันจริง 4 ก.ย. 2026 ──
    # 🔴 ทั้งสี่ใบนี้เคยถูกข้ามเงียบ ๆ · พัทยา/หัวหิน/อยุธยา ค้างอยู่ที่เมืองละ **2 แห่ง**
    ("พัทยา: คำนำหน้า `เมือง`",   dict(locality="เมืองพัทยา",
                                        administrative_area_level_1="ชลบุรี"), "Pattaya", True),
    ("หัวหิน: คำนำหน้า `ตำบล`",   dict(locality="ตำบลหัวหิน",
                                        administrative_area_level_1="ประจวบคีรีขันธ์"), "Hua Hin", True),
    ("อยุธยา: ชื่อทางการคนละชื่อ", dict(administrative_area_level_1="จังหวัดพระนครศรีอยุธยา"),
                                        "Ayutthaya", True),
    ("เกาะสมุย: admin1 เป็นจังหวัด", dict(administrative_area_level_1="สุราษฎร์ธานี"),
                                        "Koh Samui", True),
    # 🔴 เคสควบคุมฝั่งลบ — ตัดคำนำหน้าแล้วต้องไม่กลายเป็น "อะไรก็ได้"
    ("หัวหินต้องไม่กวาดของพัทยา",  dict(locality="เมืองพัทยา",
                                        administrative_area_level_1="ชลบุรี"), "Hua Hin", False),
    # ── เวียดนาม · รูปที่ P5 วัดจาก `skipped_names` ของการรันจริง 4 ก.ย. 2026 ──
    ("ดาลัด: `<แขวง> - <เมือง>`", dict(locality="Xuân Hương - Đà Lạt",
                                        administrative_area_level_1="Lâm Đồng"), "Da Lat", True),
    ("ญาจาง: ทิศนำหน้า",          dict(locality="Bắc Nha Trang",
                                        administrative_area_level_1="Khánh Hòa"), "Nha Trang", True),
    # 🔴 เคสควบคุมฝั่งลบ — รูปหลังขีดต้องไม่ทำให้เมืองอื่นแมตช์ตามไปด้วย
    ("ฮอยอันต้องไม่กินของดาลัด",   dict(locality="Xuân Hương - Đà Lạt",
                                        administrative_area_level_1="Lâm Đồng"), "Hoi An", False),
    # ── เกาหลี · รูปที่ P5 วัดจาก `skipped_names` ของการรันจริง 4 ก.ย. 2026 ──
    ("ซกโช: คำต่อท้าย -si",      dict(locality="Sokcho-si",
                                        administrative_area_level_1="Gangwon-do"), "Sokcho", True),
    ("คาพย็อง: คำต่อท้าย -gun",  dict(locality="Gapyeong-gun",
                                        administrative_area_level_1="Gyeonggi-do"), "Gapyeong", True),
    ("เชจู: ถอดเสียงเก่า Cheju",  dict(locality="Cheju",
                                        administrative_area_level_1="Jeju-do"), "Jeju", True),
    # 🔴 เคสควบคุม — `Daegu` ต้องไม่ถูกตัดหางเป็น `dae`
    ("แทกูต้องไม่ถูกตัดเป็น dae", dict(locality="Daegu",
                                        administrative_area_level_1="Daegu"), "Daegu", True),
    ("ฮาลอง: แขวง+จังหวัด ไม่มีชื่อเมือง", dict(locality="Hồng Gai",
                                        administrative_area_level_1="Quảng Ninh"), "Ha Long", True),
    ("ฮาลอง: จังหวัดไม่มีวรรณยุกต์",  dict(locality="Cao Xanh",
                                        administrative_area_level_1="Quang Ninh"), "Ha Long", True),
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

# ทูเพิล = (name_en, name_th) · สตริงเดี่ยว = ใช้ชื่อเดียวกันทั้งสองช่อง
# 🔴 **เมืองไทยต้องมี `name_th` จริง ไม่งั้นเคสไทยจะเทียบ `เมืองพัทยา` กับ `Pattaya` แล้วแดงตลอด
#    ด้วยเหตุผลที่ไม่เกี่ยวกับบั๊กที่มันตั้งใจจับ**
_SELFTEST_CITIES = ["Nantou", "Hualien", "New Taipei", "Hoi An", "Da Nang", "Tokyo",
                    "Yokohama", "Shirakawa-go", "Chengdu", "Xi'an", "Macao", "Hong Kong",
                    ("Pattaya", "พัทยา"), ("Hua Hin", "หัวหิน"),
                    ("Ayutthaya", "อยุธยา"), ("Koh Samui", "เกาะสมุย"),
                    # 🔴 เมืองเวียดนามต้องมี `name_local` จริง — `_norm` ไม่แปลงอักขระมีเครื่องหมาย
                    #    (`Đà Lạt` ≠ `Da Lat`) · คลังจริงเก็บทั้งสองช่อง เคสจึงต้องเหมือนคลัง
                    #    ไม่งั้นเคสจะแดงด้วยเหตุผลที่ไม่ใช่บั๊กที่มันตั้งใจจับ
                    ("Da Lat", "ดาลัด", "Đà Lạt"), ("Nha Trang", "ญาจาง", "Nha Trang"),
                    ("Sokcho", "ซกโช", "속초"), ("Gapyeong", "คาพย็อง", "가평"),
                    ("Jeju", "เชจู", "제주"), ("Daegu", "แทกู", "대구"),
                    ("Ha Long", "ฮาลอง", "Hạ Long")]


def selftest():
    """🔴 **รันเองทุกครั้งก่อนนำเข้า — ไม่ใช่แฟล็กที่ต้องมีคนนึกได้**

    เหตุผลที่ต้องเป็นแบบนี้ ไม่ใช่แค่ไฟล์ probe ข้าง ๆ:
    `city_of()` **พังแบบเงียบ** — ผลของมันคือ *"เมืองนี้ได้ n แห่ง"* ซึ่งอ่านเป็นตัวเลขปกติเสมอ
    ไม่ว่าจะถูกหรือผิด · บั๊กสองตัวที่ P5 เจอ (4 ก.ย. 2026) ทำให้ **หนานโถว/ฮวาเหลียนได้ 0**
    และ **ฮอยอันได้ 0 ส่วนดานังได้ของฮอยอันไปทั้งหมด** — และตัวเลขทั้งสองฝั่ง *ดูสมเหตุสมผล*

    🎯 ***ด่านที่มีค่าที่สุดคือด่านของฟังก์ชันที่ผลลัพธ์ผิดของมันหน้าตาเหมือนผลลัพธ์ถูก***
    ⚠️ **ไม่ยิงเน็ต ไม่แตะฐาน** — เป็น pure function ล้วน ราคาจึงเป็นศูนย์ ไม่มีเหตุให้ข้าม
    """
    cities = [{"name_en": n[0] if isinstance(n, tuple) else n,
               "name_th": n[1] if isinstance(n, tuple) else n,
               "name_local": n[2] if isinstance(n, tuple) and len(n) > 2 else None}
              for n in _SELFTEST_CITIES]
    cat = {c["name_en"]: [x for x in (c["name_en"], c["name_th"], c["name_local"]) if x]
           for c in cities}
    by = {c["name_en"]: c for c in cities}
    bad = []
    for label, kw, city_en, want in SELFTEST:
        p = {"addressComponents": [{"types": [k], "longText": v} for k, v in kw.items() if v]}
        got, why = city_of(p, by[city_en], cat)
        if got != want:
            bad.append(f"{label}: {city_en} ได้ {got} ({why}) ต้องการ {want}")
    # ── ชื่อสาขา — ตรึงเคสที่ P1 ทักและที่วัดจากข้อมูลจริง ──────────────────
    # 🔴 **เคสที่มีค่าที่สุดคือสองบรรทัดจีน** — คำเดียวกัน (`店`) ผลตรงข้ามกัน
    #    ตัดผิดใบเดียวคือทิ้งร้านต้นตำรับที่หยูหยวน · ปล่อยผิดใบเดียวคือได้สาขาเชนมาหนึ่งแถว
    for nm, want in [("갓파스시 연산점", True), ("현대옥 전주본점", False),
                     ("HaiDiLao Taipei Breeze NanShan Branch", True),
                     ("南翔馒头店", False),          # ร้านเสี่ยวหลงเปาต้นตำรับ ร้านเดียวในโลก
                     ("海底撈火鍋 板橋店", True),      # สาขาปั่นเฉียวของเชนหม้อไฟ
                     ("貴族世家-板橋板新店", True),
                     ("Din Tai Fung 101", False),
                     ("お食事処 とよ常 別府本店", False)]:
        if is_branch_name(nm) != want:
            bad.append(f"ชื่อสาขา: {nm} ได้ {not want} ต้องการ {want}")

    # 🔴 ทะเบียนว่าง = ด่านเงียบ — เคสหายไปหมดต้องแดง ไม่ใช่ผ่าน
    if len(SELFTEST) < 26:
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


def _chain_key(name):
    """คีย์ที่ใช้บอกว่า "ร้านนี้กับร้านนั้นคือแบรนด์เดียวกัน" — ตัดส่วนขยายสาขาออก

    `Starbucks Coffee - Myeongdong` · `Starbucks 명동점` ⇒ คีย์เดียวกัน
    ⚠️ **หยาบโดยตั้งใจ** — คีย์ที่ละเอียดเกินจะไม่จับสาขา · คีย์ที่หยาบเกินจะรวมร้านคนละแบรนด์
       ตัวชี้ขาดคือ **รายชื่อที่มันตัดทิ้ง ซึ่งสคริปต์พิมพ์ออกมาให้ตรวจทุกครั้ง**
    """
    n = unicodedata.normalize("NFKC", name).lower()
    n = re.split(r"[-–—(|·]", n)[0]                   # ตัดหลังขีด/วงเล็บ = ชื่อสาขา
    n = re.sub(r"[^\w\s]", " ", n, flags=re.UNICODE)
    return " ".join(n.split())[:40]


def food_pass(key, cities, all_names, seen_gpid, seen_name, taken_slug, limit_food, radius):
    """หา *ที่กิน* ต่อเมือง แล้วกรองเชนออกด้วยข้อมูลของเราเอง

    ## 🔴 ทำไมตัวกรองเชนไม่ใช้ "รายชื่อเชน"
    รายชื่อที่คนเขียน **ต้องมีคนคอยเติม และเชนใหม่จะหลุดเงียบ** — รูปที่รีโปนี้จดไว้แล้วว่าอย่าสร้าง
    ✅ ใช้เกณฑ์ที่ *วัดจากของที่เราดึงมาอยู่แล้ว*: **ชื่อเดียวกันโผล่หลายเมือง**
    🎯 จับ `Starbucks` · `스타벅스` · `星巴克` ได้ **โดยไม่รู้จักชื่อพวกนั้นเลย** เพราะเกณฑ์คือ
       *"โผล่หลายเมือง"* ไม่ใช่ *"ชื่อนี้เป็นเชน"*

    ## เกณฑ์ (P5 เสนอ · P1 เติมข้อหลัง)
        โผล่ ≥3 เมือง **และ** ( ข้ามประเทศ **หรือ** ≥5 เมืองในประเทศเดียว )
    · เงื่อนไข "ข้ามประเทศ" กัน **ร้านท้องถิ่นที่มี 3-4 สาขาในเมืองใกล้กัน** ไม่ให้โดนตัด
      (ร้านที่คนบินไปกินมักมีสาขาในประเทศเดียว)
    · เงื่อนไข "≥5 เมืองในประเทศเดียว" กันเชนใหญ่ที่มีแต่ในประเทศนั้น (เชนกาแฟเกาหลี ฯลฯ)
    · 🔴 **เลข 3 และ 5 เป็นค่าที่เราเดา — ให้ข้อมูลตัดสิน** ดูรายชื่อที่ถูกตัดแล้วปรับ

    ## 🔴 ต้องยิงทุกเมืองในคลังพร้อมกัน ไม่ใช่ทีละประเทศ
    "ข้ามประเทศ" ตรวจไม่ได้ถ้าเห็นทีละประเทศ — **โหมดนี้จึงไม่รับ `--country`**
    """
    cand, branch_drop = [], []
    for c in cities:
        for p in nearby(key, c["lat"], c["lng"], radius, limit_food, types=FOOD_TYPES):
            ok, _ = city_of(p, c, all_names)
            if not ok:
                continue
            t = set(p.get("types") or [])
            if t & FOOD_EXCLUDE:
                continue
            nm = p.get("displayName", {}).get("text", "").strip()
            if is_branch_name(nm):
                branch_drop.append((nm, c["name_th"]))
                continue
            gpid, name = p.get("id"), p.get("displayName", {}).get("text", "").strip()
            if not gpid or not name or gpid in seen_gpid or name.lower() in seen_name:
                continue
            cand.append({"c": c, "p": p, "gpid": gpid, "name": name,
                         "key": _chain_key(name), "reviews": p.get("userRatingCount", 0)})

    # ── นับว่าคีย์ไหนโผล่กี่เมือง กี่ประเทศ ──
    cities_of = collections.defaultdict(set)
    countries_of = collections.defaultdict(set)
    per_country = collections.defaultdict(lambda: collections.defaultdict(set))
    for x in cand:
        cities_of[x["key"]].add(x["c"]["name_en"])
        countries_of[x["key"]].add(x["c"]["country_id"])
        per_country[x["key"]][x["c"]["country_id"]].add(x["c"]["name_en"])

    def is_chain(k):
        if len(cities_of[k]) < 3:
            return False
        if len(countries_of[k]) >= 2:
            return True
        return any(len(v) >= 5 for v in per_country[k].values())

    chains = {k for k in cities_of if is_chain(k)}

    # 🔴 **พิมพ์ *ตัวอย่างจริง* ที่ถูกตัด ไม่ใช่แค่จำนวน** (P1 ขอ · และเป็นข้อที่ถูก)
    #    "ตัด 47 แห่ง" ตรวจไม่ได้ · "ตัด: Starbucks (12 เมือง)" ตรวจได้ใน 5 วินาที
    if chains:
        print(f"\n  ── ตัดออกเพราะเข้าเกณฑ์เชน ({len(chains)} แบรนด์) ──")
        for k in sorted(chains, key=lambda k: -len(cities_of[k]))[:12]:
            ex = next(x["name"] for x in cand if x["key"] == k)
            print(f"     {ex[:38]:<38} {len(cities_of[k])} เมือง / {len(countries_of[k])} ประเทศ")
    else:
        # 🔴 ไม่มีอะไรถูกตัด = อาจแปลว่าตัวกรองไม่ทำงาน ไม่ใช่ว่าไม่มีเชน — ต้องดังไว้ก่อน
        print("\n  ⚠️ ไม่มีแบรนด์ไหนเข้าเกณฑ์เชนเลย — ตรวจว่าโหมดนี้ยิงหลายเมืองจริงหรือเปล่า")

    if branch_drop:
        print(f"\n  ── ตัดออกเพราะชื่อบอกว่าเป็นสาขา ({len(branch_drop)} แห่ง) ──")
        for nm, ct in branch_drop[:10]:
            print(f"     {nm[:44]:<44} {ct}")

    rows, by_city = [], collections.defaultdict(int)
    for x in sorted(cand, key=lambda x: -x["reviews"]):
        if x["key"] in chains or by_city[x["c"]["id"]] >= limit_food:
            continue
        p, c = x["p"], x["c"]
        seen_gpid.add(x["gpid"]); seen_name.add(x["name"].lower())
        by_city[c["id"]] += 1
        rows.append({"city_id": c["id"], "city_en": c["name_en"], "city_th": c["name_th"],
                     "name": x["name"], "google_place_id": x["gpid"],
                     "category": category_for(p.get("types")),
                     "lat": p["location"]["latitude"], "lng": p["location"]["longitude"],
                     "maps_query": f"place_id:{x['gpid']}",
                     "legacy_slug": slugify(x["name"], taken_slug),
                     "rating": p.get("rating"), "reviews": x["reviews"]})
    return rows


def main():
    args = sys.argv[1:]
    apply_ = "--apply" in args
    country = next((a.split("=", 1)[1] for a in args if a.startswith("--country=")), "jp")
    limit = int(next((a.split("=", 1)[1] for a in args if a.startswith("--limit=")), "12"))
    radius = int(next((a.split("=", 1)[1] for a in args if a.startswith("--radius=")), "12000"))
    only = next((a.split("=", 1)[1] for a in args if a.startswith("--city=")), None)
    food = "--food" in args
    limit_food = int(next((a.split("=", 1)[1] for a in args if a.startswith("--limit-food=")), "10"))

    selftest()   # 🔴 ก่อนทุกอย่าง — ราคาศูนย์ และมันคือสิ่งเดียวที่จับ city_of ที่พังเงียบได้

    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        raise SystemExit("🔴 ไม่มี GOOGLE_MAPS_API_KEY — `set -a && . .env.local && set +a` ก่อน")

    # 🔴 `country_id` จำเป็นสำหรับตัวกรองเชนของโหมดของกิน (เกณฑ์ "ข้ามประเทศ")
    #    ตกไปครั้งแรกแล้วพังตอนรัน — **และมันพังดัง ไม่ใช่พังเงียบ ซึ่งถูกแล้ว**
    cities = sql(f"""select ci.id, ci.country_id, ci.name_th, ci.name_en, ci.name_local, ci.lat, ci.lng,
                            count(p.id) as have
                       from public.catalog_cities ci
                       left join public.catalog_places p on p.city_id = ci.id
                      {"" if food else f"where ci.country_id = '{country}'"}
                      group by ci.id, ci.country_id, ci.name_th, ci.name_en, ci.name_local, ci.lat, ci.lng
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

    # 🔴 โหมดของกินยิง **ทุกเมืองในคลัง** — ตัวกรองเชนต้องเห็นข้ามประเทศ (ดู `food_pass`)
    if food:
        print(f"\n  🍜 โหมดของกิน · {len(cities)} เมืองทั้งคลัง · limit-food {limit_food}/เมือง")
        rows = food_pass(key, cities, all_names, seen_gpid, seen_name, taken_slug,
                         limit_food, radius)
        by = collections.Counter(r["city_th"] for r in rows)
        cat = collections.Counter(r["category"] for r in rows)
        print(f"\n  รวมเสนอเพิ่ม {len(rows)} แห่ง · {len(by)} เมือง")
        print("  หมวด: " + " · ".join(f"{k} {v}" for k, v in cat.most_common()))
        print("  เมืองที่ได้น้อยสุด: " +
              " · ".join(f"{t} {n}" for t, n in sorted(by.items(), key=lambda kv: kv[1])[:8]))
        json.dump(rows, open("/tmp/catalog-suggest.json", "w"), ensure_ascii=False)
        if not apply_:
            print("\n  🔴 โหมด --dry — **ไม่ได้แตะฐานเลย** · เติม --apply เพื่อเขียนจริง")
            return
        return write_rows(rows)

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

    return write_rows(rows)


def write_rows(rows):
    """เขียนลงคลัง — **ที่เดียวในสคริปต์ที่แตะฐาน** · ทั้งโหมดที่เที่ยวและโหมดของกินใช้ตัวนี้ร่วมกัน
    🎯 มีทางเขียนทางเดียว = มีที่ให้แก้ที่เดียวเวลากติกาการเขียนเปลี่ยน
    """
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
