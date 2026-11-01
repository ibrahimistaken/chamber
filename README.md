# chamber

> Because you shouldn't have to witness the noise of the internet against your will.

**chamber**, kişi ve konu bazlı filtre listeleriyle çalışan açık kaynaklı bir tarayıcı eklentisidir. Engellediğin bir hesap bile başka yerlerde karşına çıkabilir; chamber ise bir kişiyle ya da konuyla ilgili içeriği, sen seçtiğin listelere göre sayfada gizler.

Herkes kendi listesini yazabilir. Kimse hepsini kurmak zorunda değil: sadece görmek istemediklerini seçersin.

## Gizlilik

- **Telemetri yok.** Analitik, hata raporlama servisi ya da uzak log yok.
- **Eşleştirme tamamen cihazında yapılır.** Gördüğün sayfalar ve gizlenen içerikler cihazından çıkmaz.
- Ağ isteği yalnızca **seçtiğin listeleri ve kataloğu indirmek** içindir.
- Listeler sadece JSON verisidir. Listeden gelen hiçbir şey kod olarak çalıştırılmaz.

## Durum

Erken aşama, hobi proje.

| | |
|---|---|
| Platform | X (Twitter) çalışıyor. YouTube, Reddit ve diğerleri planlı. |
| Tarayıcı | Chrome ve Firefox (Manifest V3) |
| Listeler | Katalogdan ya da URL'den kurulur, tek tek açılıp kapatılır |

## Nasıl çalışır

1. Bir listeyi katalogdan ya da URL ile kurarsın.
2. Eklenti, listedeki kurallara uyan gönderileri sayfada bulur.
3. Varsayılan olarak gönderi silinmez, **"Gizlendi · Göster"** kutusuna daralır. İstersen tamamen kaldırabilir ya da bulanıklaştırabilirsin.

## Liste formatı

Bir liste tek bir JSON dosyasıdır:

```json
{
  "id": "ornek-liste",
  "name": "Örnek Liste",
  "description": "Kısa açıklama",
  "author": "kullanici_adi",
  "version": 1,
  "tags": { "country": "TR", "lang": "tr", "category": "eglence" },
  "mode": "collapse",
  "includes": ["baska-liste-id"],
  "rules": {
    "accounts": [{ "platform": "x", "handle": "ornek_hesap" }],
    "keywords": ["kelime", { "text": "siyasetçi", "match": "prefix" }],
    "exclude": ["istisna ifade"],
    "scoped": [
      { "platform": "x", "handle": "baska_hesap", "keywords": ["belirli kelime"] }
    ]
  }
}
```

- **accounts:** Bu hesapların tüm içeriğini gizler.
- **keywords:** Bu kelimeleri içeren gönderileri gizler. `word` (varsayılan) tam kelime arar, `prefix` Türkçe ekleri de yakalar ("siyasetçi" kuralı "siyasetçilerin" içinde de eşleşir).
- **exclude:** Bu ifadeler metinden çıkarılır, kalan metinde arama yapılır (yanlış eşleşmeleri önler).
- **scoped:** Sadece belirli bir hesabın, belirli kelimeleri içeren gönderilerini gizler.
- **includes:** Başka listelerin kurallarını bu listeye dahil eder (meta listeler).

Ayrıntılar için [liste rehberi](docs/list-guide.md) ve [katkı rehberi](docs/CONTRIBUTING.md).

## Kendi listeni yaz

1. `lists/` klasörüne bir JSON dosyası ekle (rehbere uygun).
2. `pnpm build:catalog` çalıştırıp `index.json`'u güncelle.
3. Pull request aç. CI şemayı ve kuralları doğrular.

Listeler **kişisel zevk filtresidir**: kimse hakkında iddia, hakaret ya da özel bilgi içermez.

## Geliştirme

Gereksinimler: Node.js 22+ ve pnpm.

```bash
git clone https://github.com/ibrahimistaken/chamber.git
cd chamber
pnpm install
pnpm dev
```

Sonra Chrome'da `chrome://extensions` adresini aç, **Developer mode**'u etkinleştir, **Load unpacked** ile `.output/chrome-mv3-dev` klasörünü seç.

| Komut | Ne yapar |
|---|---|
| `pnpm dev` | Geliştirme derlemesi, değişiklikte kendini yeniler |
| `pnpm test` | Testleri çalıştırır |
| `pnpm compile` | Tip kontrolü |
| `pnpm build` | Chrome için üretim derlemesi |
| `pnpm build:firefox` | Firefox için üretim derlemesi |
| `pnpm build:catalog` | `lists/` altından `index.json` kataloğunu üretir |

Teknoloji: WXT, React, TypeScript (strict), Vitest.

## Bilinen sınırlar

- Yalnızca **metin** filtrelenir. Görsel, video ve ekran görüntüsündeki içerik filtrelenmez.
- X "Show more" ile kısalttığı gönderilerde, gizli kısımdaki kelime eşleşmez.
- Başkasının yanıtında sadece `@hesap` diye etiketlenen bir hesap, hesap kuralıyla yakalanmaz. Handle'ı `keywords` içine de yazman gerekir.
- Sitelerin arayüzü değişince adapter'lar kırılabilir. Düzeltme PR'ları çok değerlidir.
- Geniş kelime listeleri masum içeriği de gizleyebilir. Bu yüzden varsayılan mod "daralt ve göster"dir.

## Yol haritası

- [x] Eşleştirme motoru, X adapter'ı
- [x] Liste sistemi (URL'den kurma, `includes`, açma/kapama)
- [x] Katalog ve katkı akışı
- [ ] YouTube, Reddit ve genel web adapter'ları
- [ ] Instagram ve TikTok web
- [ ] Performans iyileştirmeleri, gelişmiş mod, mobil

## Lisans

[MIT](LICENSE)