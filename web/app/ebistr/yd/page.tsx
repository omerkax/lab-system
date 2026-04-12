'use client';
import { useEffect, useRef } from 'react';
import { ensureEbistrScript } from '@/lib/load-script-client';

const HTML = `
        <div class="card">
            <div class="ch" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                <span>🏢 Yapı Denetim Firmaları</span>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-o" style="padding:4px 14px;font-size:12px" onclick="ebistrAyarKaydet()">💾 Kaydet</button>
                    <button class="btn btn-p" style="padding:4px 14px;font-size:12px" onclick="ebistrYdEkle()">+ Firma Ekle</button>
                </div>
            </div>
            <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">
                EBİSTR'deki yapı denetim firma adlarıyla otomatik eşleştirilir. Analiz sonuçları ilgili firma mail adresine gönderilir.<br>
                <span style="color:var(--acc)">Veri çekildikçe yeni firmalar otomatik eklenir — sadece mail adresini girin.</span>
            </div>
            <div style="overflow-x:auto">
                <table class="ebistr-yd-tablo">
                    <thead>
                        <tr>
                            <th>Firma Adı (EBİSTR'deki gibi)</th>
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
          setTimeout(() => { if (w.ebistrYdRender) w.ebistrYdRender(); }, 300);
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
