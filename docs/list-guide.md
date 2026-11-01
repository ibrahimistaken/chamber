# Liste Yazma Rehberi (`v1`)

Chamber listeleri tamamen deklaratif JSON dosyalarıdır. Listelerden gelen hiçbir içerik kod olarak çalıştırılmaz; tüm kurallar şema doğrulamasından ([`schema/list.schema.json`](../schema/list.schema.json)) ve yerel derleyiciden geçer.

---

## 1. Temel Liste Yapısı ve Şema Alanları

```json
{
  "$schema": "../schema/list.schema.json",
  "id": "spoiler-diziler",
  "name": "Dizi ve Film Spoiler Filtresi",
  "description": "Dizi ve filmlerdeki sürpriz bozan paylaşımları gizler.",
  "author": "kullanici_adi",
  "version": 1,
  "tags": {
    "country": "TR",
    "lang": "tr",
    "category": "eglence"
  },
  "mode": "collapse",
  "includes": ["baska-liste-id"],
  "rules": {
    "accounts": [
      { "platform": "x", "handle": "ornek_hesap" }
    ],
    "keywords": [
      "spoiler",
      { "text": "sezon final", "match": "prefix" }
    ],
    "exclude": [
      "spoiler yok"
    ],
    "scoped": [
      {
        "platform": "x",
        "handle": "ornek_spor_hesabi",
        "keywords": ["transfer", { "text": "hakem", "match": "prefix" }],
        "exclude": ["resmi açıklama"]
      }
    ]
  }
}
```

### Üst Düzey Alanlar

| Alan | Zorunlu | Tür / Sınırlar | Açıklama |
| :--- | :--- | :--- | :--- |
| `id` | Evet | `string` (`1–64` karakter, `^[a-z0-9]+(-[a-z0-9]+)*$`) | Küçük harf, rakam ve tireden oluşan benzersiz kimlik. |
| `name` | Evet | `string` (`1–100` karakter) | Kullanıcıya gösterilen liste adı. |
| `description` | Hayır | `string` (`0–500` karakter) | Listenin neyi ve neden filtrelediğini nötr bir dille açıklayan metin. |
| `author` | Evet | `string` (`1–64` karakter) | Listeyi hazırlayan kişinin/topluluğun adı veya GitHub kullanıcı adı. |
| `version` | Evet | `integer` (`>= 1`) | Liste sürümü. Otomatik güncellemelerin çalışması için her değişiklikte artırılmalıdır (`1 -> 2`). |
| `tags` | Hayır | `{ country?: "TR", lang?: "tr", category?: "..." }` | `country` 2 büyük harf ISO kodu (`TR`, `US`), `lang` 2 küçük harf dil kodu (`tr`, `en`), `category` `1–40` karakterlik kategori adı. |
| `mode` | Hayır | `"collapse"` \| `"remove"` \| `"blur"` | Varsayılan: `"collapse"` ("Gizlendi — Göster" kutusu). |
| `includes` | Hayır | `string[]` (en fazla `20` adet liste `id`'si) | Başka listelerin kurallarını bu listeye dahil eder. |
| `rules` | Evet | `object` (`accounts`, `keywords`, `exclude`, `scoped`) | Filtreleme kuralları. |

---

## 2. Kelime Eşleştirme: `word` ve `prefix` Farkı

Chamber tüm metinleri karşılaştırmadan önce normalize eder (Türkçe `İ/I/ı/i` dönüşümü, aksanların kaldırılması, görünmez karakterlerin temizlenmesi ve fazla boşlukların tek boşluğa indirilmesi).

### `word` (Tam Kelime / Varsayılan)
Bir kelimeyi düz metin olarak (`"spoiler"`) veya `{ "text": "spoiler", "match": "word" }` şeklinde yazdığınızda **kelime sınırına** göre eşleşir:
- `"ali"` kuralı `"Bugün Ali geldi"` metniyle **eşleşir**, ancak `"kalite"` veya `"alimler"` kelimeleriyle **eşleşmez**.
- Çok kelimeli ifadelerde (`"son sahne"`) her iki uçta da kelime sınırı aranır.

### `prefix` (Önek Eşleştirmesi ve 4 Karakter Sınırı)
Türkçe gibi sondan eklemeli dillerde aynı kökün çekimlerini (`"sezon finali"`, `"sezon finalinde"`, `"sezon finalini"`) tek kuralla yakalamak için `prefix` modu kullanılır:

```json
{ "text": "sezon final", "match": "prefix" }
```

#### Son Kelime En Az 4 Karakter Kuralı
`prefix` modunda yalnızca ifadenin **son kelimesi** açık uçludur. Yanlış pozitifleri önlemek için normalize edilmiş **son kelimenin en az 4 karakter** olması zorunludur:
- `{ "text": "milletvekil", "match": "prefix" }` -> **Geçerli** (`milletvekil` = 11 karakter).
- `{ "text": "seçim anket", "match": "prefix" }` -> **Geçerli** (son kelime `anket` = 5 karakter).
- `{ "text": "ali", "match": "prefix" }` -> **Geçersiz** (3 karakter; `"alinin"`, `"alışveriş"`, `"alüminyum"` gibi ilgisiz kelimeleri gizleyeceği için reddedilir).
- `{ "text": "ab c", "match": "prefix" }` -> **Geçersiz** (toplam uzunluk 4 olsa bile son kelime `"c"` 1 karakterdir; `"ab c..."` ile başlayan her şeyi gizleyeceği için derleyici tarafından reddedilir).

---

## 3. İstisnalar (`exclude`)

`exclude` dizisindeki ifadeler, `keywords` kuralları değerlendirilmeden **önce** gönderi metninden çıkarılır (en uzun istisna ifadesinden başlayarak):
- Örneğin `keywords: ["spoiler"]` ve `exclude: ["spoiler yok"]` tanımlıysa:
  - `"Bu incelemede spoiler yok, rahatça okuyabilirsiniz"` -> `"spoiler yok"` çıkarıldığı için gönderi **gizlenmez**.
  - `"Spoiler yok dediler ama ağır spoiler yedim"` -> ikinci `"spoiler"` kelimesi metinde kaldığı için gönderi **gizlenir**.

---

## 4. Hesap (`accounts`) ve Hesaba Bağlı Kelime (`scoped`) Kuralları

### `accounts` (En Fazla 5000 Hesap)
Belirtilen platform ve kullanıcı adına (`handle`) ait tüm gönderileri (X üzerinde yapılan repost ve alıntılar dahil) gizler. Başındaki `@` işareti ve büyük/küçük harf farkı otomatik olarak normalize edilir (`"@OrnekHesap"` ile `"ornekhesap"` aynıdır).

### `scoped` (En Fazla 1000 Kural)
Bir hesabı tamamen gizlemek yerine, **yalnızca o hesabın belirli bir konuda yazdığı gönderileri** gizlemek için kullanılır:

```json
{
  "platform": "x",
  "handle": "ornek_yazar",
  "keywords": ["futbol", { "text": "hakem", "match": "prefix" }],
  "exclude": ["milli takım"]
}
```

- Gönderinin gizlenmesi için **hem** gönderinin ana yazarının (`getAuthor`) `handle` ile eşleşmesi **hem de** gönderi metninin o kuraldaki `keywords` listesinden en az biriyle eşleşmesi (`exclude` ifadeleri çıkarıldıktan sonra) gerekir.
- `scoped` kuralları yalnızca gönderinin ana yazarına bakar; repost veya alıntı içindeki ikincil yazarlara uygulanmaz.

---

## 5. Liste Birleştirme (`includes`)

Bir liste, `includes` alanında başka listelerin `id`'lerini belirterek onların kurallarını devralabilir:

```json
{
  "id": "spor-ve-polemik-paketi",
  "name": "Spor ve Polemik Paketi",
  "author": "kullanici",
  "version": 1,
  "includes": ["futbol-taraftar-polemik", "etkilesim-tuzagi-tr"],
  "rules": {
    "keywords": ["derbi tartışması"]
  }
}
```

- **Döngüsel referans yasağı:** `A -> B -> A` veya `A -> A` gibi döngüsel referanslar motor tarafından tespit edilir ve reddedilir.
- **Eksik referans toleransı:** Kullanıcının cihazında `includes` içindeki bir liste henüz yüklü değilse ana liste bozulmaz; eksik referans yalnızca uyarı olarak işaretlenir.

---

## 6. Yerel Doğrulama

Listenizi göndermeden önce aşağıdaki komutlarla şema uyumluluğunu, `prefix` kurallarını ve katalog üretimini yerel olarak doğrulayabilirsiniz:

```bash
pnpm run build:catalog
pnpm test
```

