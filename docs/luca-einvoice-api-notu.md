# Luca TÜRMOB e-Fatura API — not (araştırma özeti)

**Kaynak:** https://einvoiceapiturmob.luca.com.tr/Help (EInvoice Mobile Service)

## Genel

- ASP.NET Web API yardım sayfası; Swagger bu ortamda `/swagger` ile açılmıyor (404).
- Ana dokümantasyon: Help ana sayfası + `Help/Api/POST-api-...` alt sayfaları.
- Birçok controller satırında “No documentation available” yazsa da kritik uçların gövde şemaları (ör. `SaveInvoice`) detaylı.

## Kimlik doğrulama

- **`POST api/Account/Login`**
- Gövde (JSON): `IdentificationNumber`, `Password`
- Yanıt: `Token`, `CompanyList` (`IdFirma`, `SchemaName`, `FirmaAdi`, …), `ExpiresOn`, `Result`, `ErrorMessage`
- Sonraki isteklerde token’ın hangi HTTP başlığıyla gönderileceği Help’te açık değil; deneme veya Luca destek ile teyit gerekir (ör. `Authorization: Bearer` veya özel başlık).

## Fatura kesme / programatik akış

Bu API seti yalnızca liste okumakla sınırlı değil; **taslak kayıt ve gönderim hattı** var.

| Amaç | Örnek uç nokta |
|------|----------------|
| Fatura kaydet (geniş model: alıcı, kalemler, tarih, ETTN, tutarlar, …) | **`POST api/Invoice/SaveInvoice`** |
| Taslak / staging listele veya getir | `GetStagingInvoiceList`, `GetStagingInvoice`, `GetApprovableStagingInvoiceList` |
| Taslağı onayla | **`POST api/Invoice/ApproveStagingInvoice`** |
| e-Arşiv gönderim (ETTN + CompanyId) | **`POST api/Invoice/SendStagingArchive`** |
| Diğer | `CloneInvoice`, `GetInvoicePdf`, `GetInvoiceXml`, gelen faturalar, irsaliye (`CloneDespatch`), … |

**Özet akış (mantıksal):** Login → Token + `CompanyId` → `SaveInvoice` → gerekirse onay / `SendStagingArchive` vb.

## Dikkat

- Host **“mobil”** API; tam kurumsal/entegratör REST farklı taban adreste olabilir.
- `SaveInvoice` çok alanlı; e-Fatura / e-Arşiv ve senaryoya göre zorunlu alanlar için resmi şema veya Luca örneği kullanılmalı.
- Üretim/test ve sözleşme kapsamı için Luca / TÜRMOB ile netleştirme önerilir.

*Tarih: 2026-04-11 — Cursor oturumunda yapılan harici Help incelemesi özeti.*
