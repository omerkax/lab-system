'use client';
import { useEffect, useRef } from 'react';
import { ensureEbistrScript } from '@/lib/load-script-client';

const HTML = `
        <!-- Başlık + Güncelle -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px">
            <div>
                <div style="font-size:18px; font-weight:800; color:var(--tx); display:flex; align-items:center; gap:10px">
                    📅 Yaklaşan Numune Kırımları
                </div>
                <div style="font-size:11px; color:var(--tx3); margin-top:4px">
                    <span id="ebistr-yaklasan-sync-lbl">Son Güncelleme: —</span>
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center">
                <div id="ebistr-yaklasan-proxy-lbl" style="font-size:11px; color:var(--tx3); padding:4px 12px; background:var(--sur2); border:1px solid var(--bdr); border-radius:20px">Proxy kontrol ediliyor...</div>
                <button title="Şimdi Güncelle" onclick="ebistrYaklasanYenile()" style="background:var(--sur2);border:1px solid var(--bdr);color:var(--tx2);font-size:16px;cursor:pointer;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0" onmouseover="this.style.color='var(--acc)'" onmouseout="this.style.color='var(--tx2)'">⟳</button>
            </div>
        </div>

        <!-- Özet Kartlar -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px">
            <div class="ebistr-stat" style="border-left:3px solid var(--amb)">
                <div class="ebistr-stat-val" id="eyak-bugun-toplam" style="color:var(--amb)">0</div>
                <div class="ebistr-stat-lbl">🎯 Bugün Kırılacak (numune)</div>
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

        <!-- Filtre Butonları -->
        <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center">
            <button id="eyak-f-bugun"   class="ebistr-fbtn on"  onclick="ebistrYaklasanFiltre('bugun')">🎯 Bugün</button>
            <button id="eyak-f-yarin"   class="ebistr-fbtn"     onclick="ebistrYaklasanFiltre('yarin')">📆 Yarın</button>
            <button id="eyak-f-bu_hafta" class="ebistr-fbtn"     onclick="ebistrYaklasanFiltre('bu_hafta')">📅 Bu Hafta</button>
            <button id="eyak-f-hepsi"   class="ebistr-fbtn"     onclick="ebistrYaklasanFiltre('hepsi')">📋 Tümü</button>
            <input type="date" id="eyak-f-tarih-inp" class="ebistr-adv-input" style="padding:5px 10px;font-size:12px;border-radius:8px;cursor:pointer" onchange="if(this.value){ebistrYaklasanFiltre(this.value)}" title="Belirli gün seç">
            <div style="margin-left:auto; font-size:11px; color:var(--tx3)" id="eyak-sayi-lbl"></div>
        </div>

        <!-- Kart Listesi -->
        <div id="ebistr-yaklasan-liste" style="display:flex;flex-direction:column;gap:10px"></div>

        <!-- Durum ekranları -->
        <div class="card" style="padding:0;overflow:hidden">
            <div id="ebistr-yaklasan-bos" style="padding:60px 20px;text-align:center;color:var(--tx3);display:none">
                <div style="font-size:48px;margin-bottom:12px;opacity:.4">📅</div>
                <div style="font-size:16px;font-weight:700;color:var(--tx2);margin-bottom:8px">Yakın Tarihte Kırım Bulunamadı</div>
                <div style="font-size:12px">Yenile butonuna basın veya Verileri Güncelle ile proxy'den veri çekin.</div>
            </div>
            <div id="ebistr-yaklasan-proxy-bos" style="padding:60px 20px;text-align:center;color:var(--tx3);display:none">
                <div style="font-size:48px;margin-bottom:12px;opacity:.4">🔌</div>
                <div style="font-size:16px;font-weight:700;color:var(--red);margin-bottom:8px">Lab API / EBİSTR önbelleği yok</div>
                <div style="font-size:12px">Next sunucusu çalışıyor olmalı; <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">/api/ebistr/status</code> ve token kontrol edin (ayrı <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">ebistr-proxy.js</code> artık gerekmez).</div>
            </div>
            <div id="ebistr-yaklasan-yukleniyor" style="padding:40px;text-align:center;display:none">
                <div style="font-size:24px;animation:spin 1s linear infinite;display:inline-block">⏳</div>
                <div style="font-size:12px;color:var(--tx3);margin-top:8px">Veriler yükleniyor...</div>
            </div>
        </div>

<div id="ebistr-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
    <div style="max-width:820px;width:100%;max-height:calc(100vh - 40px);overflow-y:auto;background:var(--sur);border-radius:20px;padding:28px;position:relative">
        <button onclick="document.getElementById('ebistr-modal').style.display='none'" style="position:absolute;top:14px;right:14px;background:rgba(15,23,42,0.7);border:1px solid var(--bdr);color:var(--tx2);font-size:16px;cursor:pointer;z-index:2;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
        <div id="ebistr-modal-icerik"></div>
    </div>
</div>

<!-- MAİL ÖNİZLEME MODALİ -->
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

function _patchYaklasanMetrikler() {
  const w = window as any;
  if (w._yaklasanMetrikPatched) return;
  w._yaklasanMetrikPatched = true;

  const orig = w.ebistrYaklasanMetrikler;
  if (!orig) return;

  /**
   * Proxy satırları BRN/kür grubu: toplamSayisi, kalanSayisi, kirilmisSayisi (ebistr.js ile aynı).
   * Eski patch grupta olmayan `kirildi` ile süzüyordu → kalan kartı hep toplama eşit çıkıyordu.
   */
  w.ebistrYaklasanMetrikler = function () {
    orig();
    const filtre = w.ebistrYaklasanFiltreSec;
    const data: any[] = w.ebistrYaklasanData || [];
    const bugunStr = new Date().toLocaleDateString('en-CA');

    const set = (id: string, val: number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    const aggregate = (rows: any[]) => {
      let toplam = 0;
      let kalan = 0;
      let kirilan = 0;
      for (const x of rows) {
        toplam += Number(x.toplamSayisi) || 0;
        kalan += Number(x.kalanSayisi) || 0;
        kirilan += Number(x.kirilmisSayisi) || 0;
      }
      return { toplam, kalan, kirilan };
    };

    const setLbl = (id: string, txt: string) => {
      const el = document.getElementById(id);
      const lbl = el?.nextElementSibling as HTMLElement | null;
      if (lbl) lbl.textContent = txt;
    };

    let rows = data;
    if (!filtre || filtre === 'bugun') {
      rows = data.filter((x: any) => x.farkGun === 0 || String(x.kirimTarihi) === bugunStr);
      setLbl('eyak-bugun-toplam', '🎯 Bugün Kırılacak (numune)');
      setLbl('eyak-bugun-bek', '⏳ Bugün Kalan');
      setLbl('eyak-bugun-ok', '✅ Bugün Kırılan');
    } else if (filtre === 'yarin') {
      rows = data.filter((x: any) => x.farkGun === 1);
      setLbl('eyak-bugun-toplam', '📆 Yarın Kırılacak (numune)');
      setLbl('eyak-bugun-bek', '⏳ Yarın Kalan');
      setLbl('eyak-bugun-ok', '✅ Yarın Kırılan');
    } else {
      setLbl('eyak-bugun-toplam', '📋 Toplam Numune');
      setLbl('eyak-bugun-bek', '⏳ Kalan');
      setLbl('eyak-bugun-ok', '✅ Kırılan');
    }

    const { toplam, kalan, kirilan } = aggregate(rows);
    set('eyak-bugun-toplam', toplam);
    set('eyak-bugun-bek', kalan);
    set('eyak-bugun-ok', kirilan);
    set('eyak-yaklasan-toplam', data.length);
  };
}

export default function Page() {
  const shellRef = useRef<HTMLDivElement>(null);
  const init = useRef(false);
  useEffect(() => {
    const el = shellRef.current;
    if (el) el.innerHTML = HTML;
    void ensureEbistrScript('/ebistr.js?v=20260412-vercel-data-api').then(() => {
      const check = () => {
        if (init.current) return;
        if (typeof (window as any).ebistrInit === 'function') {
          init.current = true;
          const w = window as any;
          if (w.ebistrInit) w.ebistrInit();
          _patchYaklasanMetrikler();
          setTimeout(() => { if (w.ebistrYaklasanYenile) w.ebistrYaklasanYenile(); }, 300);
        } else setTimeout(check, 100);
      };
      check();
    });
  }, []);
  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }}
    />
  );
}
