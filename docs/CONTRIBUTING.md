# Katkı Rehberi (CONTRIBUTING)

Chamber topluluk listelerine veya eklenti koduna katkıda bulunmak istediğiniz için teşekkürler. Projenin temel ilkelerini korumak için lütfen aşağıdaki kuralları dikkatle okuyun.

---

## 1. Topluluk Listesi İlkeleri

1. **Kişisel Zevk ve Konfor Filtresidir:**
   - Chamber listeleri birer **kişisel tercih filtresidir**; hiçbir kişi veya kurum hakkında iddia, suçlama, karalama ya da etiketleme aracı değildir.
2. **Hakaret, İddia ve Özel Bilgi Yasağı:**
   - Listelerde (`name`, `description`, `keywords`, `accounts` dahil hiçbir alanda) hakaret, iftira, doğrulanmamış iddia veya hedef gösterici ifadeler bulunamaz.
   - Gerçek kişilere ait özel bilgiler (ev/iş adresi, telefon numarası, e-posta, kimlik numarası vb.) kesinlikle eklenemez.
3. **Yalnızca Herkese Açık Handle'lar ve Genel Anahtar Kelimeler:**
   - Listelere yalnızca genel konu/terim anahtar kelimeleri ve herkese açık platform hesap adları (`handle`) eklenebilir.
4. **Açık ve Nötr Açıklama (`description`):**
   - Her listenin `description` alanında, listenin hangi konuyu veya içerik türünü filtrelediği nötr ve anlaşılır bir dille açıklanmalıdır.

---

## 2. Yeni Liste Ekleme veya Güncelleme Adımları

1. [`docs/list-guide.md`](./list-guide.md) dosyasındaki şema kurallarına uygun olarak `lists/<liste-id>.json` dosyasını oluşturun veya düzenleyin.
   - Dosya adı ile JSON içindeki `"id"` alanı aynı olmalıdır (`lists/ornek-konu.json` -> `"id": "ornek-konu"`).
   - Mevcut bir listeyi güncelliyorsanız `"version"` alanını mutlaka bir artırın (`1 -> 2`). Eklenti, kullanıcıların cihazlarındaki listeleri yalnızca sürüm numarası arttığında günceller.
2. PR'dan önce yerel doğrulama ve katalog üretim betiğini çalıştırıp güncellenen `index.json` dosyasını commit'e dahil edin:
   ```bash
   pnpm build:catalog
   pnpm test
   ```
3. `lists/<liste-id>.json` ve güncellenen `index.json` dosyalarını açıklayıcı bir commit mesajıyla (`feat:`, `fix:`, `docs:`) commitleyip Pull Request (PR) açın.
4. PR açıldığında GitHub Actions otomatik olarak şemayı, `id` benzersizliğini, `index.json` dosyasının güncel olduğunu (`git diff --exit-code index.json`) ve birim testlerini doğrulayacaktır.

---

## 3. Kod Katkıları İçin Değişmez İlkeler

Eklenti koduna katkıda bulunurken [`CLAUDE.md`](../CLAUDE.md) içindeki değişmez ilkelere uyulması zorunludur:
- **Gizlilik:** Kullanıcının cihazından dışarıya hiçbir telemetri, analitik veya kullanım verisi çıkamaz.
- **Tek Amaçlı Ağ İsteği:** Ağ istekleri yalnızca kullanıcının seçtiği listeleri ve kataloğu indirmek/güncellemek içindir.
- **Güvenlik:** Listelerden gelen hiçbir veri `eval`, `new Function` veya `innerHTML` ile çalıştırılamaz.
- **Kod Stili:** TypeScript `strict` modda `any` kullanılmamalı, kullanıcıya görünen tüm metinler `src/core/i18n.ts` içinde tanımlanmalı ve her yeni davranış için birim testi eklenmelidir.

