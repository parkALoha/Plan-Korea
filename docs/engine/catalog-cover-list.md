# รายชื่อประเทศและเมืองทั้งหมดในคลัง — สำหรับเจนภาพ

> 🔴 **นี่คือ *สแนปช็อตของคลัง ณ 5 ก.ย. 2026* ไม่ใช่รายการงานที่ยังเหลือ** — มันหมดอายุทุกครั้งที่มีคนเก็บภาพเพิ่ม
> **อย่าอ่านว่า "ยังไม่มีภาพ" จากไฟล์นี้** · ถามดิสก์แทน แล้วมันจะไม่มีวันล้า:
> ```bash
> cd /Users/park/plan-korea-platform/public/catalog && for d in */; do printf "%s: " "${d%/}"; ls "$d" | sed 's/\.jpg$//' | tr '\n' ' '; echo; done
> ```
> · วิธีเจน/เก็บภาพอยู่ที่ [`gen-cover-howto.md`](gen-cover-howto.md) · **ไฟล์จริงเป็น `.jpg` ไม่ใช่ `.webp` ตามที่ตารางข้างล่างเขียน**


ดึงจากฐาน dev · 5 ก.ย. 2026 · **9 ประเทศ · 78 เมือง** (ทุกเมืองมีสถานที่แล้ว ไม่มีเมืองว่าง)

## ตั้งชื่อไฟล์ยังไง

```
ประเทศ  <country_id>.webp        เช่น  kr.webp
เมือง   <city_slug>.webp          เช่น  gyeongju.webp
```
· ใช้ **slug** ไม่ใช่ UUID — คอลัมน์ในฐานจะเก็บพาธของไฟล์ ผมแมปให้เองตอนลง
· ขนาดที่ใช้จริงบนการ์ด: กว้าง ~280px สูง **112px** (`h-28`) ⇒ ภาพแนวนอน ~3:1 ถึง 5:2 พอดี
  🔴 ภาพแนวตั้งจะถูกครอปกลางจนเหลือแถบแคบ — **เจนเป็นแนวนอนเสมอ**

## 🔴 ข้อควรระวังตอนเจน

· ระบุ **ชื่อแลนด์มาร์กจริง** ในพรอมป์ ไม่ใช่แค่ชื่อเมือง — ไม่งั้นจะได้เมืองเอเชียทั่วไปที่ไม่ใช่ที่นั่น
· ⚠️ AI มักสร้าง **ตัวหนังสือมั่ว ๆ** บนป้าย/อาคาร — ถ้าเห็นตัวอักษรอ่านไม่ออกในภาพ ให้เจนใหม่
· ⚠️ ภาพ AI ของแลนด์มาร์กจริง **มักผิดรายละเอียด** (จำนวนชั้น รูปหลังคา) — ถ้าจะให้ปลอดภัยที่สุด
  ใช้มุมกว้าง/บรรยากาศเมือง แทนการโคลสอัพตัวอาคาร

---

## ญี่ปุ่น · Japan  
**ไฟล์ประเทศ: `jp.webp`** · 23 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| โตเกียว | Tokyo | 東京 | `tokyo.webp` | 44 |
| โอซากะ | Osaka | 大阪 | `osaka.webp` | 38 |
| เกียวโต | Kyoto | 京都 | `kyoto.webp` | 35 |
| ซัปโปโร | Sapporo | 札幌 | `sapporo.webp` | 34 |
| ฟุกุโอกะ | Fukuoka | 福岡 | `fukuoka.webp` | 34 |
| โอตารุ | Otaru | 小樽 | `otaru.webp` | 32 |
| ฮิโรชิมะ | Hiroshima | 広島 | `hiroshima.webp` | 32 |
| โกเบ | Kobe | 神戸 | `kobe.webp` | 31 |
| ทาคายามะ | Takayama | 高山 | `takayama.webp` | 31 |
| นางาซากิ | Nagasaki | 長崎 | `nagasaki.webp` | 31 |
| คานาซาวะ | Kanazawa | 金沢 | `kanazawa.webp` | 30 |
| นาโกย่า | Nagoya | 名古屋 | `nagoya.webp` | 30 |
| นารา | Nara | 奈良 | `nara.webp` | 30 |
| นิกโก้ | Nikko | 日光 | `nikko.webp` | 30 |
| โยโกฮามะ | Yokohama | 横浜 | `yokohama.webp` | 30 |
| ฮาโกดาเตะ | Hakodate | 函館 | `hakodate.webp` | 30 |
| ชิราคาวาโกะ | Shirakawa-go | 白川郷 | `shirakawago.webp` | 26 |
| ฟุราโนะ | Furano | 富良野 | `furano.webp` | 26 |
| ฮาโกเน่ | Hakone | 箱根 | `hakone.webp` | 25 |
| เซนได | Sendai | 仙台 | `sendai.webp` | 24 |
| โอกินาว่า (นาฮะ) | Naha | 那覇 | `naha.webp` | 22 |
| เบปปุ | Beppu | 別府 | `beppu.webp` | 21 |
| คามาคุระ | Kamakura | 鎌倉 | `kamakura.webp` | 18 |

## เกาหลีใต้ · South Korea  
**ไฟล์ประเทศ: `kr.webp`** · 15 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| ปูซาน | Busan | 부산 | `busan.webp` | 55 |
| โซล | Seoul | 서울 | `seoul.webp` | 53 |
| คังนึง | Gangneung | 강릉 | `gangneung.webp` | 39 |
| ซกโช | Sokcho | 속초 | `sokcho.webp` | 35 |
| ซูวอน | Suwon | 수원 | `suwon.webp` | 34 |
| คยองจู | Gyeongju | 경주 | `gyeongju.webp` | 30 |
| ช็อนจู | Jeonju | 전주 | `jeonju.webp` | 30 |
| ชุนช็อน | Chuncheon | 춘천 | `chuncheon.webp` | 30 |
| เชจู | Jeju | 제주 | `jeju.webp` | 30 |
| อันดง | Andong | 안동 | `andong.webp` | 30 |
| แทกู | Daegu | 대구 | `daegu.webp` | 29 |
| ยอซู | Yeosu | 여수 | `yeosu.webp` | 29 |
| อินช็อน | Incheon | 인천 | `incheon.webp` | 29 |
| โพฮัง | Pohang | 포항 | `pohang.webp` | 25 |
| คาพย็อง | Gapyeong | 가평 | `gapyeong.webp` | 21 |

## ไทย · Thailand  
**ไฟล์ประเทศ: `th.webp`** · 13 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| กรุงเทพฯ | Bangkok | กรุงเทพมหานคร | `bangkok.webp` | 39 |
| เชียงใหม่ | Chiang Mai | เชียงใหม่ | `chiang-mai.webp` | 36 |
| ภูเก็ต | Phuket | ภูเก็ต | `phuket.webp` | 35 |
| กระบี่ | Krabi | กระบี่ | `krabi.webp` | 34 |
| เกาะสมุย | Koh Samui | เกาะสมุย | `koh-samui.webp` | 33 |
| อุดรธานี | Udon Thani | อุดรธานี | `udon-thani.webp` | 33 |
| กาญจนบุรี | Kanchanaburi | กาญจนบุรี | `kanchanaburi.webp` | 32 |
| เชียงราย | Chiang Rai | เชียงราย | `chiang-rai.webp` | 32 |
| น่าน | Nan | น่าน | `nan.webp` | 32 |
| อยุธยา | Ayutthaya | พระนครศรีอยุธยา | `ayutthaya.webp` | 32 |
| สุโขทัย | Sukhothai | สุโขทัย | `sukhothai.webp` | 31 |
| หัวหิน | Hua Hin | หัวหิน | `hua-hin.webp` | 31 |
| พัทยา | Pattaya | พัทยา | `pattaya.webp` | 27 |

## เวียดนาม · Vietnam  
**ไฟล์ประเทศ: `vn.webp`** · 10 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| ฮานอย | Hanoi | Hà Nội | `hanoi.webp` | 41 |
| โฮจิมินห์ | Ho Chi Minh City | Thành phố Hồ Chí Minh | `hcmc.webp` | 39 |
| ดานัง | Da Nang | Đà Nẵng | `da-nang.webp` | 30 |
| ดาลัด | Da Lat | Đà Lạt | `da-lat.webp` | 30 |
| เว้ | Hue | Huế | `hue.webp` | 30 |
| ญาจาง | Nha Trang | Nha Trang | `nha-trang.webp` | 28 |
| ฟูก๊วก | Phu Quoc | Phú Quốc | `phu-quoc.webp` | 28 |
| ฮาลอง | Ha Long | Hạ Long | `ha-long.webp` | 28 |
| ซาปา | Sa Pa | Sa Pa | `sapa.webp` | 25 |
| ฮอยอัน | Hoi An | Hội An | `hoi-an.webp` | 18 |

## จีน · China  
**ไฟล์ประเทศ: `cn.webp`** · 7 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| กุ้ยหลิน | Guilin | 桂林市 | `guilin.webp` | 30 |
| จางเจียเจี้ย | Zhangjiajie | 张家界市 | `zhangjiajie.webp` | 30 |
| เฉิงตู | Chengdu | 成都市 | `chengdu.webp` | 30 |
| ชิงเต่า | Qingdao | 青岛市 | `qingdao.webp` | 30 |
| ซีอาน | Xi'an | 西安市 | `xi-an.webp` | 30 |
| เซี่ยงไฮ้ | Shanghai | 上海市 | `shanghai.webp` | 30 |
| ปักกิ่ง | Beijing | 北京市 | `beijing.webp` | 30 |

## ไต้หวัน · Taiwan  
**ไฟล์ประเทศ: `tw.webp`** · 7 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| เกาสง | Kaohsiung | 高雄市 | `kaohsiung.webp` | 30 |
| ไถหนาน | Tainan | 臺南市 | `tainan.webp` | 30 |
| หนานโถว | Nantou | 南投縣 | `nantou.webp` | 30 |
| ฮวาเหลียน | Hualien | 花蓮 | `hualien.webp` | 30 |
| ไถจง | Taichung | 臺中 | `taichung.webp` | 29 |
| ไทเป | Taipei | 臺北 | `taipei.webp` | 26 |
| นิวไทเป | New Taipei | 新北市 | `new-taipei.webp` | 15 |

## มาเก๊า · Macao  
**ไฟล์ประเทศ: `mo.webp`** · 1 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| มาเก๊า | Macao | 澳门 | `macao.webp` | 29 |

## สิงคโปร์ · Singapore  
**ไฟล์ประเทศ: `sg.webp`** · 1 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| สิงคโปร์ | Singapore | Singapore | `singapore.webp` | 30 |

## ฮ่องกง · Hong Kong  
**ไฟล์ประเทศ: `hk.webp`** · 1 เมือง

| เมือง | อังกฤษ | ชื่อท้องถิ่น | ไฟล์ | สถานที่ในคลัง |
|---|---|---|---|---|
| ฮ่องกง | Hong Kong | 香港 | `hong-kong.webp` | 30 |

