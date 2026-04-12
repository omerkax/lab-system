'use client';
import { useEffect, useRef } from 'react';
import { ensureEbistrScript, loadScriptOnce } from '@/lib/load-script-client';

const HTML = `
<div style="padding:0 0 8px">
  <div class="ph">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:22px;font-weight:800;color:var(--tx)">Kürleme Takibi</div>
        <div style="font-size:13px;color:var(--tx3);margin-top:4px">EBİSTR numuneleri — kür havuzu durum takibi</div>
      </div>
      <button class="btn btn-o" style="font-size:12px;height:34px" onclick="kurlemeYenile()">&#8635; Yenile</button>
    </div>
  </div>

  <!-- Stats bar -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px">
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--acc)">
      <div style="font-size:26px;font-weight:800;color:var(--acc)" id="kur-stat-toplam">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Toplam</div>
    </div>
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--red)">
      <div style="font-size:26px;font-weight:800;color:var(--red)" id="kur-stat-kritik">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Kritik &gt;72s</div>
    </div>
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--amb)">
      <div style="font-size:26px;font-weight:800;color:var(--amb)" id="kur-stat-bekleyen">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Bekleyen</div>
    </div>
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--acc2)">
      <div style="font-size:26px;font-weight:800;color:var(--acc2)" id="kur-stat-yolda">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Yolda</div>
    </div>
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--acc)">
      <div style="font-size:26px;font-weight:800;color:var(--acc)" id="kur-stat-kurlemede">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Kurlemede</div>
    </div>
    <div class="card" style="padding:14px 16px;text-align:center;border-left:3px solid var(--grn)">
      <div style="font-size:26px;font-weight:800;color:var(--grn)" id="kur-stat-tamamlandi">-</div>
      <div style="font-size:10px;color:var(--tx3);margin-top:3px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Tamamlandı</div>
    </div>
  </div>

  <!-- Filtreler + tarih aralığı -->
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
    <button class="btn btn-o kur-filtre-btn kur-filtre-active" data-filtre="tumu"      onclick="kurFiltrele('tumu')">Tümü</button>
    <button class="btn btn-o kur-filtre-btn" data-filtre="kritik"    onclick="kurFiltrele('kritik')">🔴 Kritik</button>
    <button class="btn btn-o kur-filtre-btn" data-filtre="bekleyen"  onclick="kurFiltrele('bekleyen')">⏳ Bekleyen</button>
    <button class="btn btn-o kur-filtre-btn" data-filtre="yolda"     onclick="kurFiltrele('yolda')">🚚 Yolda</button>
    <button class="btn btn-o kur-filtre-btn" data-filtre="kurlemede" onclick="kurFiltrele('kurlemede')">🌊 Kurlemede</button>
    <button class="btn btn-o kur-filtre-btn" data-filtre="tamamlandi" onclick="kurFiltrele('tamamlandi')">✓ Tamamlandı</button>
    <div style="width:1px;height:24px;background:var(--bdr);margin:0 4px"></div>
    <div style="display:flex;align-items:center;gap:6px">
      <label style="font-size:10px;color:var(--tx3);font-weight:700;text-transform:uppercase">Alınış:</label>
      <input type="date" id="kur-tarih-bas" style="padding:5px 8px;border-radius:7px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx);font-size:11px" onchange="kurFiltreleUygula()">
      <span style="font-size:10px;color:var(--tx3)">—</span>
      <input type="date" id="kur-tarih-bit" style="padding:5px 8px;border-radius:7px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx);font-size:11px" onchange="kurFiltreleUygula()">
    </div>
    <button class="btn btn-g" style="font-size:11px;padding:5px 10px;height:30px" onclick="kurTarihSifirla()">✕ Sıfırla</button>
    <div style="flex:1"></div>
    <span id="kur-cnt" style="font-size:11px;color:var(--tx3)"></span>
  </div>

  <!-- Loading & Error -->
  <div id="kur-loading" style="display:flex;align-items:center;justify-content:center;padding:48px;color:var(--tx3);font-size:13px;gap:10px">
    <span style="animation:kur-spin 1s linear infinite;display:inline-block">&#8987;</span>
    Yükleniyor...
  </div>
  <div id="kur-hata" style="display:none;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:16px 20px;margin-bottom:16px;font-size:13px;color:var(--red)"></div>
  <div id="kur-uyari-banner" style="display:none;margin-bottom:14px"></div>

  <!-- Tablo -->
  <div id="kur-tablo-wrap" style="display:none">
    <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;overflow:hidden">
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:780px">
          <thead>
            <tr style="background:var(--sur2)">
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">BRN No</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">YİBF</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Firma / YD</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Yapı Elemanı</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Alınış</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Beton</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Süre</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">Durum</th>
              <th style="padding:10px 14px;text-align:left;font-size:9.5px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;border-bottom:1px solid var(--bdr)">İşlem</th>
            </tr>
          </thead>
          <tbody id="kur-tbody"></tbody>
        </table>
      </div>
      <div id="kur-bos" style="display:none;text-align:center;padding:48px;color:var(--tx3);font-size:13px">
        Bu filtre için numune bulunamadı.
      </div>
    </div>
  </div>
</div>

<style>
  .kur-filtre-active { background:var(--acc) !important; color:#fff !important; border-color:var(--acc) !important; }
  @keyframes kur-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  @keyframes kur-blink { 0%,100%{opacity:1} 50%{opacity:.5} }
  .kur-grp-hd td { background:rgba(255,255,255,.03); cursor:pointer; user-select:none; transition:background .15s; }
  .kur-grp-hd:hover td { background:rgba(20,184,166,.06); }
  .kur-grp-inner { padding:10px 12px 14px 18px; background:rgba(0,0,0,.14); border-top:1px dashed rgba(148,163,184,.2); }
  .kur-nested { width:100%; border-collapse:collapse; font-size:11.5px; border-radius:10px; overflow:hidden; }
  .kur-nested thead th { padding:8px 10px; text-align:left; font-size:9px; font-weight:800; color:var(--tx3); text-transform:uppercase; letter-spacing:.06em; background:rgba(255,255,255,.04); border-bottom:1px solid var(--bdr); }
  .kur-nested tbody td { padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle; }
  .kur-nested .kur-date-cap { font-size:10px; font-weight:700; color:var(--tx3); letter-spacing:.05em; padding:8px 10px 4px; background:transparent; border:none; }
  .kur-badge { padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; border:1px solid; white-space:nowrap; }
  .kur-banner-soft { background:rgba(251,191,36,.08); border:1px solid rgba(251,191,36,.28); border-radius:12px; padding:12px 16px; font-size:12px; color:var(--tx2); display:flex; align-items:flex-start; gap:12px; justify-content:space-between; flex-wrap:wrap; }
</style>
`;

export default function KurlemePage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const bootStarted = useRef(false);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    const el = shellRef.current;
    if (el) el.innerHTML = HTML;
    void (async () => {
      await ensureEbistrScript('/ebistr.js?v=20260412-waituntil-retry');
      await loadScriptOnce('/kurleme-init.js?v=20260411-kur-yibfsiz', 'lab-kurleme-init-js');
      const tryInit = () => {
        if (typeof (window as any)._kurlemeInit === 'function' &&
            typeof (window as any).fsGet === 'function') {
          (window as any)._kurlemeInit();
        } else {
          setTimeout(tryInit, 150);
        }
      };
      tryInit();
    })();
  }, []);

  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 32, paddingLeft: 24 }}
    />
  );
}
