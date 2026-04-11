'use client';
import { useEffect, useRef } from 'react';
import { ensureEbistrScript } from '@/lib/load-script-client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createRaporDefterYibfLookup } from '@/lib/rapor-defter-lookup';

const HTML = `
<div class="ebistr-hd">
  <div>
    <div class="ebistr-ti">EBİSTR Beton Analiz</div>
    <div class="ebistr-sub">TS 13515 uygunluk kontrolü — yapı denetim bildirimleri</div>
  </div>
  <div class="ebistr-proxy-bar" id="ebistr-proxy-bar-wrap" style="max-width:100%;white-space:normal;flex-wrap:wrap;justify-content:flex-end">
    <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 200px">
      <div class="ebistr-proxy-dot" id="ebistr-proxy-dot"></div>
      <span id="ebistr-proxy-lbl" style="white-space:normal;line-height:1.35">Proxy kontrol ediliyor...</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <button type="button" class="btn btn-o" style="padding:6px 10px;font-size:11px;font-weight:700;border-radius:10px;white-space:nowrap" onclick="ebistrBusinessGirisAc()" title="EBİSTR Business sitesinde oturum açın">🔐 EBİSTR giriş</button>
      <button type="button" class="btn btn-g" style="padding:6px 10px;font-size:11px;font-weight:700;border-radius:10px;white-space:nowrap" onclick="ebistrTokenSonrasiBaglan()" title="Girişten sonra sunucu bağlantısını dener">↻ Bağlan</button>
    </div>
  </div>
</div>

<!-- ANALİZ PANELİ -->
<div id="ebistr-pane-analiz">
  <div class="ebistr-toolbar" style="flex-wrap:wrap;gap:12px">
    <div class="ebistr-tool-group" style="align-items:center;gap:6px">
      <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:10px;font-size:11px;color:var(--tx3)">
        <span id="ebistr-auto-dot" style="width:7px;height:7px;border-radius:50%;background:var(--tx3);flex-shrink:0;transition:background .3s"></span>
        <span>Oto-yenileme: <span class="ebistr-sync-time" id="ebistr-auto-time">—</span></span>
        <button title="Şimdi Güncelle" onclick="ebistrVeriGuncelle()" style="background:none;border:none;cursor:pointer;color:var(--tx2);font-size:14px;padding:0 2px;line-height:1" onmouseover="this.style.color='var(--acc)'" onmouseout="this.style.color='var(--tx2)'">⟳</button>
      </div>
    </div>
    <div class="ebistr-tool-group">
      <div style="font-size:10px;font-weight:800;color:var(--tx3);text-transform:uppercase;margin-right:8px;letter-spacing:.08em">Son</div>
      <div class="ebistr-btn-group">
        <button class="btn-q" id="ebistr-q-1" onclick="ebistrCanliCek(1)">1G</button>
        <button class="btn-q" id="ebistr-q-3" onclick="ebistrCanliCek(3)">3G</button>
        <button class="btn-q" id="ebistr-q-7" onclick="ebistrCanliCek(7)">7G</button>
      </div>
    </div>
    <div class="ebistr-tool-group">
      <div style="font-size:10px;font-weight:800;color:var(--tx3);text-transform:uppercase;margin-right:8px;letter-spacing:.08em">Aralık</div>
      <div class="ebistr-date-box">
        <input type="date" id="ebistr-bas-tarih">
        <span style="opacity:.3;color:var(--tx3)">—</span>
        <input type="date" id="ebistr-bit-tarih">
      </div>
      <div style="display:flex">
        <button class="ebistr-sync-btn" title="Tarihe Göre Getir" onclick="ebistrCanliCek('custom')">🔍</button>
        <button class="ebistr-sync-btn bolt" title="Yeniden Sync" onclick="ebistrCanliCek('custom',true)">⚡</button>
      </div>
    </div>
    <div class="ebistr-tool-group" style="margin-left:auto;flex-wrap:wrap;gap:8px">
      <div id="ebistr-csv-info-badge" class="ebistr-status-badge">
        <span id="ebistr-csv-status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--tx3);display:inline-block;flex-shrink:0"></span>
        <span id="ebistr-csv-info">Veri Çekilmedi</span>
      </div>
      <div class="ebistr-actions" style="display:flex;gap:8px">
        <button class="btn btn-a" id="ebistr-analiz-btn" onclick="ebistrAnalizEt()" disabled style="background:var(--grn-d);color:var(--grn);border:1px solid var(--grn)">⚙️ Analiz</button>
        <button class="btn btn-o" id="ebistr-mail-btn" onclick="ebistrTopluMailGonder()" disabled title="Toplu Mail Gönder">📧</button>
        <button class="btn btn-g" id="ebistr-excel-btn" onclick="ebistrExcelIndir()" disabled title="Excel İndir">⬇</button>
      </div>
    </div>
  </div>

  <!-- GELİŞMİŞ FİLTRE -->
  <div class="ebistr-adv-panel" id="ebistr-adv-panel">
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Kırım Tarihi</div>
      <div style="display:flex;gap:4px;align-items:center">
        <input type="date" id="ebistr-f-bas" class="ebistr-adv-input" onchange="ebistrFiltrele()">
        <span style="opacity:.3">—</span>
        <input type="date" id="ebistr-f-bit" class="ebistr-adv-input" onchange="ebistrFiltrele()">
      </div>
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">YİBF No</div>
      <input type="text" id="ebistr-f-yibf" class="ebistr-adv-input" oninput="ebistrFiltrele()" placeholder="YİBF No Ara...">
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">BRN / Rapor No</div>
      <input type="text" id="ebistr-f-no" class="ebistr-adv-input" oninput="ebistrFiltrele()" placeholder="Numara Ara...">
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Yapı Denetim</div>
      <select id="ebistr-f-yd" class="ebistr-adv-select" onchange="ebistrFiltrele()">
        <option value="">Hepsi</option>
      </select>
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Müteahhit</div>
      <select id="ebistr-f-mut" class="ebistr-adv-select" onchange="ebistrFiltrele()">
        <option value="">Hepsi</option>
      </select>
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Beton Sınıfı</div>
      <select id="ebistr-f-sinif" class="ebistr-adv-select" onchange="ebistrFiltrele()">
        <option value="">Hepsi</option>
      </select>
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Yapı Bölümü</div>
      <input type="text" id="ebistr-f-bolum" class="ebistr-adv-input" oninput="ebistrFiltrele()" placeholder="Bölüm Ara...">
    </div>
    <div class="ebistr-adv-item">
      <div class="ebistr-adv-label">Mail Durumu</div>
      <select id="ebistr-f-mail" class="ebistr-adv-select" onchange="ebistrFiltrele()">
        <option value="">Hepsi</option>
        <option value="gonderildi">✓ Gönderildi</option>
        <option value="bekliyor">⌛ Beklemede</option>
      </select>
    </div>
    <div class="ebistr-adv-item" style="justify-content:flex-end">
      <button class="btn btn-g" style="padding:10px 16px;border-radius:12px;font-weight:700" onclick="ebistrFiltreSifirla()">🧹 Temizle</button>
    </div>
  </div>

  <!-- DURUM FİLTRELERİ -->
  <div class="ebistr-filtre" id="ebistr-filtre-row">
    <button class="ebistr-fbtn on" onclick="ebistrFiltrele('hepsi')" id="ef-hepsi">Hepsi</button>
    <button class="ebistr-fbtn uygunsuz" onclick="ebistrFiltrele('UYGUNSUZ')" id="ef-uyg"><span class="ef-dot" style="background:#ef4444"></span> Uygunsuz</button>
    <button class="ebistr-fbtn uyari" onclick="ebistrFiltrele('UYARI')" id="ef-uyr"><span class="ef-dot" style="background:#f59e0b"></span> Sapmalı</button>
    <button class="ebistr-fbtn uygun" onclick="ebistrFiltrele('UYGUN')" id="ef-uygun"><span class="ef-dot" style="background:#10b981"></span> Uygun</button>
    <button class="ebistr-fbtn haftalik" onclick="ebistrFiltrele('HAFTALIK')" id="ef-haftalik"><span class="ef-dot" style="background:#3b82f6"></span> Haftalık</button>
    <input type="text" class="ebistr-ara" id="ebistr-ara" placeholder="Hızlı Arama (Rapor No, Beton Firması, Yapı Denetim...)" oninput="ebistrFiltrele()">
  </div>

  <!-- ÖZET -->
  <div class="ebistr-ozet" id="ebistr-ozet-row" style="display:none">
    <div class="ebistr-stat toplam">
      <div class="ebistr-stat-val" id="eoz-toplam">0</div>
      <div class="ebistr-stat-lbl">Toplam Rapor</div>
    </div>
    <div class="ebistr-stat uygunsuz">
      <div class="ebistr-stat-val" id="eoz-uyg" style="color:var(--red)">0</div>
      <div class="ebistr-stat-lbl">Uygunsuz</div>
    </div>
    <div class="ebistr-stat uyari">
      <div class="ebistr-stat-val" id="eoz-uyr" style="color:var(--amb)">0</div>
      <div class="ebistr-stat-lbl">Sapmalı</div>
    </div>
    <div class="ebistr-stat uygun">
      <div class="ebistr-stat-val" id="eoz-uygun" style="color:var(--grn)">0</div>
      <div class="ebistr-stat-lbl">Uygun</div>
    </div>
    <div class="ebistr-stat haftalik">
      <div class="ebistr-stat-val" id="eoz-haftalik" style="color:var(--acc)">0</div>
      <div class="ebistr-stat-lbl">Haftalık</div>
    </div>
  </div>

  <!-- YD FİLTRE BUTONLARI -->
  <div id="ebistr-yd-btns" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:10px;padding:10px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:12px"></div>

  <!-- TABLO -->
  <div class="ebistr-tablo-wrap" id="ebistr-tablo-wrap">
    <table class="ebistr-tablo">
      <thead>
        <tr>
          <th>Durum</th>
          <th class="th-hide-sm">YİBF</th>
          <th>Rapor / BRN</th>
          <th class="th-hide-sm">Alınış</th>
          <th>Kırım</th>
          <th class="th-hide-sm">Numune</th>
          <th>Yapı Denetim</th>
          <th class="th-hide-sm">Beton Firması</th>
          <th class="th-hide-md">Yapı Sahibi</th>
          <th>Beton / fck</th>
          <th class="th-hide-sm">n</th>
          <th>fcm</th>
          <th class="th-hide-sm">fci min</th>
          <th class="th-hide-md">Yapı Bölümü</th>
          <th class="th-hide-md">Mail</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="ebistr-tbody"></tbody>
    </table>
  </div>
  <!-- SAYFALAMA -->
  <div id="ebistr-pag"></div>
</div>

<!-- Yaklaşan/YD/Ayar artık ayrı sayfalarda — stub divler ebistrTab() uyumluluğu için bırakıldı -->
<div id="ebistr-pane-yaklasan" style="display:none">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px">
    <div>
      <div style="font-size:18px;font-weight:800;color:var(--tx);display:flex;align-items:center;gap:10px">📅 Yaklaşan Numune Kırımları</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px"><span id="ebistr-yaklasan-sync-lbl">Son Güncelleme: —</span></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div id="ebistr-yaklasan-proxy-lbl" style="font-size:11px;color:var(--tx3);padding:4px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:20px">Proxy kontrol ediliyor...</div>
      <button class="btn btn-a" onclick="ebistrYaklasanYenile()" style="display:flex;align-items:center;gap:6px">🔄 Yenile</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px">
    <div class="ebistr-stat" style="border-left:3px solid var(--amb)">
      <div class="ebistr-stat-val" id="eyak-bugun-toplam" style="color:var(--amb)">0</div>
      <div class="ebistr-stat-lbl">🎯 Bugün Kırılacak</div>
    </div>
    <div class="ebistr-stat" style="border-left:3px solid var(--red)">
      <div class="ebistr-stat-val" id="eyak-bugun-bek" style="color:var(--red)">0</div>
      <div class="ebistr-stat-lbl">⏳ Bugün Kalan</div>
    </div>
    <div class="ebistr-stat" style="border-left:3px solid var(--grn)">
      <div class="ebistr-stat-val" id="eyak-bugun-ok" style="color:var(--grn)">0</div>
      <div class="ebistr-stat-lbl">✅ Bugün Kırılan</div>
    </div>
    <div class="ebistr-stat" style="border-left:3px solid var(--acc)">
      <div class="ebistr-stat-val" id="eyak-yaklasan-toplam" style="color:var(--acc)">0</div>
      <div class="ebistr-stat-lbl">📋 Toplam BRN Grubu</div>
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <button id="eyak-f-bugun" class="ebistr-fbtn on" onclick="ebistrYaklasanFiltre('bugun')">🎯 Bugün</button>
    <button id="eyak-f-yarin" class="ebistr-fbtn" onclick="ebistrYaklasanFiltre('yarin')">📆 Yarın</button>
    <button id="eyak-f-bu_hafta" class="ebistr-fbtn" onclick="ebistrYaklasanFiltre('bu_hafta')">📅 Bu Hafta</button>
    <button id="eyak-f-hepsi" class="ebistr-fbtn" onclick="ebistrYaklasanFiltre('hepsi')">📋 Tümü</button>
    <input type="date" id="eyak-f-tarih-inp" class="ebistr-adv-input" style="padding:5px 10px;font-size:12px;border-radius:8px" onchange="if(this.value){ebistrYaklasanFiltre(this.value)}">
    <div style="margin-left:auto;font-size:11px;color:var(--tx3)" id="eyak-sayi-lbl"></div>
  </div>
  <div id="ebistr-yaklasan-liste" style="display:flex;flex-direction:column;gap:10px"></div>
  <div class="card" style="padding:0;overflow:hidden">
    <div id="ebistr-yaklasan-bos" style="padding:60px 20px;text-align:center;color:var(--tx3);display:none">
      <div style="font-size:48px;margin-bottom:12px;opacity:.4">📅</div>
      <div style="font-size:16px;font-weight:700;color:var(--tx2);margin-bottom:8px">Yakın Tarihte Kırım Bulunamadı</div>
      <div style="font-size:12px">Yenile butonuna basın.</div>
    </div>
    <div id="ebistr-yaklasan-proxy-bos" style="padding:60px 20px;text-align:center;color:var(--tx3);display:none">
      <div style="font-size:48px;margin-bottom:12px;opacity:.4">🔌</div>
      <div style="font-size:16px;font-weight:700;color:var(--red);margin-bottom:8px">Proxy Bağlantısı Yok</div>
    </div>
    <div id="ebistr-yaklasan-yukleniyor" style="padding:40px;text-align:center;display:none">
      <div style="font-size:24px;display:inline-block">⏳</div>
      <div style="font-size:12px;color:var(--tx3);margin-top:8px">Yükleniyor...</div>
    </div>
  </div>
</div>

<!-- YAPI DENETİM PANELİ -->
<div id="ebistr-pane-yd" style="display:none">
  <div class="card">
    <div class="ch" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <span>🏢 Yapı Denetim Firmaları</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-o" style="padding:4px 14px;font-size:12px" onclick="ebistrAyarKaydet()">💾 Kaydet</button>
        <button class="btn btn-p" style="padding:4px 14px;font-size:12px" onclick="ebistrYdEkle()">+ Firma Ekle</button>
      </div>
    </div>
    <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">
      EBİSTR'deki yapı denetim firma adlarıyla otomatik eşleştirilir. <span style="color:var(--acc)">Veri çekildikçe yeni firmalar otomatik eklenir.</span>
    </div>
    <div style="overflow-x:auto">
      <table class="ebistr-yd-tablo">
        <thead>
          <tr>
            <th>Firma Adı</th>
            <th>Birincil Mail</th>
            <th>İkincil Mail</th>
            <th style="text-align:center">Aktif</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ebistr-yd-tbody"></tbody>
      </table>
    </div>
    <div id="ebistr-yd-bos" style="text-align:center;padding:24px;color:var(--tx3);font-size:13px">
      Henüz firma eklenmedi. EBİSTR'den veri çekildikçe firmalar otomatik tespit edilir.
    </div>
  </div>
</div>

<!-- AYARLAR PANELİ -->
<div id="ebistr-pane-ayar" style="display:none">
  <div class="card" style="margin-bottom:14px">
    <div class="ch">📧 SMTP Mail Ayarları</div>
    <div class="alrt i" style="margin-bottom:12px">
      <span class="alrt-ic">ℹ️</span>
      <span>Canlıda Gmail için uygulama şifresi gerekir. Yayına alınca <strong>Test Maili Gönder</strong> ile kontrol edin.</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div>
        <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Gmail / SMTP Adresi</label>
        <input class="pi" id="ebistr-smtp-user" type="email" placeholder="lab@gmail.com" style="width:100%;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">App Password</label>
        <input class="pi" id="ebistr-smtp-pass" type="password" placeholder="xxxx xxxx xxxx xxxx" style="width:100%;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">CC Mail (isteğe bağlı)</label>
        <input class="pi" id="ebistr-smtp-cc" type="email" placeholder="mudur@lab.com" style="width:100%;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Otomatik Mail Koşulu</label>
        <select class="pi" id="ebistr-mail-kosul" style="width:100%;box-sizing:border-box">
          <option value="uygunsuz">Sadece Uygunsuz</option>
          <option value="uyari" selected>Uygunsuz + Sapmalı</option>
          <option value="hepsi">Tümü</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
      <button class="btn btn-p" onclick="ebistrAyarKaydet()">💾 Kaydet</button>
      <button class="btn btn-o" onclick="ebistrSmtpTest()">📧 Test Maili Gönder</button>
      <span id="ebistr-ayar-msg" style="font-size:12px;color:var(--grn)"></span>
    </div>
  </div>
  <div class="card">
    <div class="ch">🔌 Proxy Bağlantısı</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
      <div>
        <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Proxy URL (otomatik doldurulur)</label>
        <input class="pi" id="ebistr-proxy-url-inp" type="text" placeholder="Boş bırakılabilir — bu site kullanılır" style="width:100%;box-sizing:border-box">
      </div>
      <button class="btn btn-o" onclick="ebistrProxyKontrol();ebistrAyarKaydet(true)" style="padding:8px 16px;white-space:nowrap">🔄 Test Et</button>
    </div>
  </div>
</div>

<!-- DETAY MODALİ -->
<div id="ebistr-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
  <div style="max-width:820px;width:100%;max-height:calc(100vh - 40px);overflow-y:auto;background:var(--sur);border-radius:20px;padding:28px;position:relative">
    <button onclick="document.getElementById('ebistr-modal').style.display='none'" style="position:absolute;top:14px;right:14px;background:rgba(15,23,42,.7);border:1px solid var(--bdr);color:var(--tx2);font-size:16px;cursor:pointer;z-index:2;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center">✕</button>
    <div id="ebistr-modal-icerik"></div>
  </div>
</div>

<!-- MAİL MODALİ -->
<div id="ebistr-mail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2100;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
  <div style="width:740px;max-width:100%;height:90vh;background:#f1f5f9;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;position:relative">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#1e3a5f;flex-shrink:0">
      <span id="ebistr-mail-modal-title" style="font-size:13px;font-weight:700;color:#fff">📧 Mail Önizleme</span>
      <button onclick="document.getElementById('ebistr-mail-modal').style.display='none'" style="background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px;cursor:pointer;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">✕</button>
    </div>
    <iframe id="ebistr-mail-frame" style="flex:1;border:none;width:100%;background:#f1f5f9"></iframe>
  </div>
</div>
`;

function EbistrInner() {
  const initialized = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const params = useSearchParams();

  useEffect(() => {
    if (initialized.current) return;
    const el = shellRef.current;
    if (el) el.innerHTML = HTML;

    const runInit = () => {
      if (initialized.current) return;
      if (typeof (window as any).ebistrInit === 'function') {
        initialized.current = true;
        (window as any).ebistrInit();
        _patchEbistrSync();
        _patchEbistrUI();
        _loadRaporDefteri();

        const dot = document.getElementById('ebistr-auto-dot');
        const timeEl = document.getElementById('ebistr-auto-time');
        const flash = () => {
          if (dot) { dot.style.background = 'var(--grn)'; setTimeout(() => { if (dot) dot.style.background = 'var(--tx3)'; }, 2000); }
        };
        const w = window as any;
        if (w._ebistrLastUpdate && timeEl) timeEl.textContent = w._ebistrLastUpdate;
        document.addEventListener('ebistr:refreshed', (e: any) => {
          if (timeEl) timeEl.textContent = e.detail?.time || new Date().toLocaleTimeString('tr-TR');
          flash();
        });
        const info = document.getElementById('ebistr-csv-info');
        if (info && timeEl && info.textContent?.includes('Son Senk:')) {
          const m = info.textContent.match(/Son Senk: (.+)\)/);
          if (m) timeEl.textContent = m[1];
        }
      } else {
        setTimeout(runInit, 100);
      }
    };

    void ensureEbistrScript('/ebistr.js?v=20260411-proxy-origin').then(() => {
      runInit();
    });
  }, [params]);

  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }}
    />
  );
}

function _patchEbistrSync() {
  const w = window as any;
  const origSync = w.fbSyncEBISTR;
  if (!origSync || w._syncPatched) return;
  w._syncPatched = true;
  w.fbSyncEBISTR = function(numuneler: any[], analizler: any[]) {
    // Orijinal çağır
    if (origSync) origSync(numuneler, analizler);
    // JSON cache'e kaydet
    if (numuneler && numuneler.length > 0) {
      fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ebistr-numuneler', data: numuneler })
      }).catch(() => {});
    }
  };
}

function _patchEbistrUI() {
  const w = window as any;
  if (w._uiPatched) return;
  w._uiPatched = true;

  const origFiltrele = w.ebistrFiltrele;
  if (!origFiltrele) return;

  w.ebistrFiltrele = function(filtre?: string) {
    if (arguments.length > 0 && typeof filtre === 'string') w._ebistrCurrentPage = 0;
    origFiltrele(filtre);
    _renderYdButtons();
    _paginateEbistrUI();
  };

  w._ebistrPaginate = _paginateEbistrUI;

  // YD butonu tıklama
  w._ebistrYdFiltre = (yd: string) => {
    const sel = document.getElementById('ebistr-f-yd') as HTMLSelectElement;
    if (sel) { sel.value = yd; }
    w._ebistrCurrentPage = 0;
    w.ebistrFiltrele();
  };
  w._ebistrYdTemizle = () => {
    const sel = document.getElementById('ebistr-f-yd') as HTMLSelectElement;
    if (sel) sel.value = '';
    w._ebistrCurrentPage = 0;
    w.ebistrFiltrele();
  };
}

function _renderYdButtons() {
  const w = window as any;
  const container = document.getElementById('ebistr-yd-btns');
  if (!container) return;

  const liste: any[] = w.ebistrFiltreliListe || [];
  if (!liste.length) { container.style.display = 'none'; return; }

  // YD gruplarını say
  const counts: Record<string, { toplam: number; uyg: number }> = {};
  liste.forEach((a: any) => {
    const yd = a.yapiDenetim || '—';
    if (!counts[yd]) counts[yd] = { toplam: 0, uyg: 0 };
    counts[yd].toplam++;
    if (a.durum === 'UYGUNSUZ') counts[yd].uyg++;
  });

  const firmaCount = Object.keys(counts).length;
  const sel = document.getElementById('ebistr-f-yd') as HTMLSelectElement;
  const aktifYd = sel?.value || '';

  // Always show container when a filter is active, even if only 1 firm remains
  if (firmaCount <= 1 && !aktifYd) { container.style.display = 'none'; return; }

  let html = `<span style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;align-self:center;margin-right:4px">YD:</span>`;
  html += `<button onclick="window._ebistrYdTemizle()" style="padding:4px 12px;font-size:11px;border-radius:20px;border:1px solid ${!aktifYd ? 'var(--acc)' : 'var(--bdr)'};cursor:pointer;font-weight:600;background:${!aktifYd ? 'var(--acc)' : 'var(--sur2)'};color:${!aktifYd ? '#fff' : 'var(--acc2)'}">${aktifYd ? '← Tüm YD' : `Tümü (${liste.length})`}</button>`;

  Object.entries(counts).sort((a, b) => b[1].toplam - a[1].toplam).forEach(([yd, c]) => {
    const isAktif = aktifYd === yd;
    const hasUyg = c.uyg > 0;
    html += `<button onclick="window._ebistrYdFiltre('${yd.replace(/'/g, "\\'")}')" style="padding:4px 12px;font-size:11px;border-radius:20px;border:1px solid ${hasUyg ? 'rgba(239,68,68,0.4)' : 'var(--bdr)'};cursor:pointer;font-weight:600;background:${isAktif ? 'var(--acc)' : (hasUyg ? 'rgba(239,68,68,0.08)' : 'var(--sur)')};color:${isAktif ? '#fff' : (hasUyg ? 'var(--red)' : 'var(--tx2)')}">
      ${yd} <span style="opacity:.7">(${c.toplam}${c.uyg ? ' · ' + c.uyg + ' uyg' : ''})</span>
    </button>`;
  });

  container.style.display = 'flex';
  container.innerHTML = html;
}

/** Sadece sayfalama çubuğu — satırlar ebistr.js içinde sayfa başına render edilir */
function _paginateEbistrUI() {
  const w = window as any;
  const liste: any[] = w.ebistrFiltreliListe || [];
  const pag = document.getElementById('ebistr-pag');
  if (!liste.length || !pag) {
    if (pag) pag.innerHTML = '';
    return;
  }

  const pages: string[][] = w._ebistrYdPages || [];
  if (!pages.length || pages.length <= 1) {
    pag.innerHTML = '';
    return;
  }

  const ydGroups: Record<string, number> = {};
  liste.forEach((item: any) => {
    const yd = item.yapiDenetim || '—';
    ydGroups[yd] = (ydGroups[yd] || 0) + 1;
  });

  let page = typeof w._ebistrCurrentPage === 'number' ? w._ebistrCurrentPage : 0;
  page = Math.max(0, Math.min(page, pages.length - 1));
  w._ebistrCurrentPage = page;

  const pageRowCount = pages[page].reduce((s, yd) => s + (ydGroups[yd] || 0), 0);
  const pageStart =
    pages.slice(0, page).reduce((s, pg) => s + pg.reduce((ss, yd) => ss + (ydGroups[yd] || 0), 0), 0) + 1;

  let html = `<div class="ebistr-pag-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--bdr)">`;
  html += `<span style="font-size:11px;color:var(--tx3);flex:1;min-width:140px">${pageStart}–${pageStart + pageRowCount - 1} / ${liste.length} rapor · sayfa ${page + 1}/${pages.length}</span>`;
  html += `<div class="ebistr-pag-btns" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">`;
  html += `<button type="button" onclick="ebistrSayfaGit(${page - 1})" ${page === 0 ? 'disabled' : ''} style="padding:8px 14px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);cursor:pointer;font-size:12px;min-height:40px;touch-action:manipulation${page === 0 ? ';opacity:.35' : ''}">← Önceki</button>`;

  for (let i = 0; i < pages.length; i++) {
    const isActive = i === page;
    const show = pages.length <= 7 || i === 0 || i === pages.length - 1 || Math.abs(i - page) <= 1;
    const showEllipsis = !show && (i === 1 || i === pages.length - 2) && Math.abs(i - page) === 2;
    if (show) {
      html += `<button type="button" onclick="ebistrSayfaGit(${i})" style="padding:8px 12px;min-width:40px;min-height:40px;border-radius:8px;border:1px solid ${isActive ? 'var(--acc)' : 'var(--bdr)'};background:${isActive ? 'var(--acc)' : 'var(--sur)'};color:${isActive ? '#fff' : 'var(--tx)'};cursor:pointer;font-size:12px;font-weight:${isActive ? '700' : '400'};touch-action:manipulation">${i + 1}</button>`;
    } else if (showEllipsis) {
      html += `<span style="color:var(--tx3);font-size:12px;padding:0 2px">…</span>`;
    }
  }

  html += `<button type="button" onclick="ebistrSayfaGit(${page + 1})" ${page === pages.length - 1 ? 'disabled' : ''} style="padding:8px 14px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);cursor:pointer;font-size:12px;min-height:40px;touch-action:manipulation${page === pages.length - 1 ? ';opacity:.35' : ''}">Sonraki →</button>`;
  html += `</div></div>`;
  pag.innerHTML = html;
}

async function _loadRaporDefteri() {
  try {
    const res = await fetch('/api/rapor');
    const json = await res.json();
    if (!json.ok) return;
    const rows = json.rows || [];
    (window as any)._raporRows = rows;
    (window as any).raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, json.map || json.data);
  } catch {}
}

export default function EbistrPage() {
  return (
    <Suspense fallback={null}>
      <EbistrInner />
    </Suspense>
  );
}
