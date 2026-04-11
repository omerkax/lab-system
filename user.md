# Kullanıcı profili (Omer / proje sahibi)

Bu dosya, bu repoda **benimle** nasıl çalışılacağını anlatır. Başka bir Cursor oturumu, ekip arkadaşı veya AI asistan burayı okuyarak beklentilerimi ve iletişim tarzımı hızlıca kavrayabilir.

---

## Dil ve iletişim

- **Tercih ettiğim dil:** Türkçe. Açıklamalar, commit mesajları ve dokümantasyon için de Türkçe kullanmaktan memnunum; teknik terimler İngilizce kalabilir.
- **Net talepler:** “Şunu yap” dediğimde genelde **uçtan uuca uygulama** beklerim; sadece komut listesi veya teorik öneri yeterli değil — mümkünse siz **araçları kullanıp** değişikliği repoda yapın.
- **Bağlam:** Önceki mesajlarla devam eden işlerde, son cümleyi **aynı görevin parçası** gibi yorumlayın; çoğu zaman yön değiştirmekten çok **ince ayar** yapmaktayım.

---

## Ne tür işler istiyorum?

Geçmiş taleplerimden çıkan örüntü:

1. **Ürün / arayüz**
   - Görsel kalite önemli: “biraz değişti” yetmez; **profesyonel**, tutarlı tipografi, boşluk, tablolar, formlar, **checkbox** gibi detaylar.
   - Büyük planlar olduğunda: **aşamalı** (önce ortak tasarım dili, sonra düşük riskli sayfalar, sonra karmaşık modüller) ama **planın tamamının** bitmesini beklerim.
   - **Davranışı bozmadan** modernize etmek: regresyon kabul etmem; kritik akışlarda hızlı kontrol yapılmasını isterim.

2. **Hata ve teknik borç**
   - Konsoldaki hataları **kök nedene** kadar takip edin: örn. hydration uyumsuzluğu, `null` DOM’a `.value` atamak gibi.
   - Hydration / SSR konularında: `suppressHydrationWarning`, `dynamic({ ssr: false })`, client-only kabuk gibi çözümleri **bilinçli** seçin; gerekçeyi kısaca yazın.

3. **Dokümantasyon ve aktarım**
   - Projeyi **başka bir Cursor hesabına / geliştiriciye** aktarırken **çok detaylı** README veya benzeri isterim: mimari, klasörler, API’ler, tuzaklar, güvenlik uyarıları.
   - Bu `user.md` dosyası da o aktarımın parçası: **beni** ve beklentilerimi anlatıyor.

4. **Entegrasyonlar**
   - Dış servisler (EBİSTR, NetGSM, proxy URL’leri, cache) ile ilgili sorunlarda **gerçek kod yolunu** düzeltmeyi beklerim; geçici workaround yerine doğru endpoint sırası tercih edilir.

---

## Kod ve diff beklentileri

- **Kapsam:** İstemediğim “genel temizlik” veya ilgisiz dosyalara dokunma. Odaklı, kısa diff’ler tercih.
- **Stil:** Mevcut isimlendirme, import düzeni ve soyutlama seviyesine uyum. Gereksiz yorum, abartılı try/catch ve tekrarlayan kod istemem.
- **Markdown:** Sadece istediğimde yeni/uzun `.md` dosyaları ekleyin; bu proje için README ve user.md bilinçli isteklerdi.

---

## Yazım ve sunum tercihleri (asistan cevapları için)

- **Markdown:** Kod alıntıları için ` ```startLine:endLine:path ` formatı; açılış ``` tek satırda.
- **Linkler:** URL ve dosya yollarını kısaltmadan tam yazın.
- **Ton:** Net, düzgün cümleler; gereksiz kalın yazı ve “her cevapta takip sorusu” istemem.
- **Tarih:** Ortamda verilen “bugünün tarihi” alanına güvenin (ör. 2026); yılı varsayılan olarak eski yıl sanmayın.

---

## Kısa özet (başka asistan için tek paragraf)

Ben Türkçe konuşan, **işin repoda bitmesini** bekleyen bir kullanıcıyım; UI’da **belirgin, profesyonel** iyileştirme ve **davranış korunması** önemli. Hataları kökten çözün, hydration/DOM null gibi konularda dikkatli olun. Dokümantasyonu **detaylı** ve aktarım için **kullanıcı profilini** (`user.md`) dikkate alın; diff’leri odaklı ve mevcut kod stiline uyumlu tutun.

---

*Bu dosya, geçmiş konuşmalardaki talepler ve repoda tanımlı kullanıcı kurallarından türetilmiştir; isterseniz birlikte güncelleriz.*
