'use client';
import ModulePage from '@/components/ModulePage';

const HTML = `
<div class="ph" style="margin-bottom:20px">
  <h1>📁 Teklif Geçmişi</h1>
  <p>Kaydedilmiş fiyat teklifleri, durum takibi ve yazdırma</p>
</div>

<div class="rec-filter" style="margin-bottom:12px">
  <div class="sw2" style="flex:1;min-width:160px;margin:0"><input class="si" id="prSearch" placeholder="Müşteri ara..." oninput="renderPR()"></div>
  <select class="fsel" id="prFilt" onchange="renderPR()">
    <option value="all">Tüm Durumlar</option>
    <option value="beklemede">Beklemede</option>
    <option value="alindi">Alındı ✅</option>
    <option value="alinmadi">Alınmadı ❌</option>
  </select>
</div>

<div class="card" style="padding:0">
  <div class="tw">
    <table>
      <thead>
        <tr>
          <th>Müşteri</th>
          <th>Tip</th>
          <th>m²</th>
          <th>Net Fiyat</th>
          <th>İsk.</th>
          <th colspan="2">Eklenti / Kalem Özetleri</th>
          <th>Tarih</th>
          <th>Durum</th>
          <th>Not</th>
          <th>İşlem</th>
        </tr>
      </thead>
      <tbody id="prList"></tbody>
    </table>
  </div>
</div>

<!-- Teklif Görüntüleme Modalı -->
<div id="prViewModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);z-index:9999;backdrop-filter:blur(10px);padding:20px;overflow-y:auto">

  <!-- 1. DİJİTAL ÖZET KARTI -->
  <div id="prSummaryCard" class="no-print" style="max-width:700px;margin:40px auto;background:var(--p-bg);color:var(--tx);padding:35px;border-radius:24px;border:1px solid var(--bdr2);box-shadow:0 30px 70px rgba(0,0,0,0.5)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:25px">
      <h2 style="margin:0;font-size:20px;display:flex;align-items:center;gap:12px">📋 Teklif Özeti <span id="psID" style="font-size:12px;color:var(--acc2);background:var(--sur2);padding:4px 10px;border-radius:6px">...</span></h2>
      <button onclick="closePRView()" style="background:var(--sur2);border:none;width:36px;height:36px;border-radius:50%;color:var(--tx);cursor:pointer">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:30px">
      <div style="background:var(--sur2);padding:20px;border-radius:16px">
        <div style="font-size:11px;color:var(--tx3);margin-bottom:6px">MÜŞTERİ / FİRMA</div>
        <div id="psFirma" style="font-weight:700;font-size:16px">—</div>
      </div>
      <div style="background:var(--sur2);padding:20px;border-radius:16px;text-align:right">
        <div style="font-size:11px;color:var(--tx3);margin-bottom:6px">GENEL TOPLAM (KDV DAHİL)</div>
        <div id="psTotal" style="font-weight:800;font-size:22px;color:var(--grn)">0,00 ₺</div>
      </div>
    </div>
    <div style="background:var(--sur2);padding:20px;border-radius:16px;margin-bottom:25px">
      <div style="font-size:11px;color:var(--tx3);margin-bottom:12px">TEKLİF KALEMLERİ</div>
      <div id="psItems" style="display:flex;flex-direction:column;gap:10px"></div>
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-p" style="flex:1.5;height:55px;font-size:15px" onclick="showOfficialProposal()">📄 Resmi Teklifi Görüntüle / Yazdır</button>
      <button class="btn btn-o" style="flex:1" onclick="closePRView()">Kapat</button>
    </div>
  </div>

  <!-- 2. RESMİ ANTETLİ TEKLİF -->
  <div id="printableOffer" style="display:none;max-width:850px;margin:20px auto;background:#fff;color:#1e293b;padding:50px;font-family:'DM Sans',sans-serif;box-shadow:0 25px 60px rgba(0,0,0,.3);border-radius:2px;position:relative">
    <button class="no-print" style="position:absolute;top:20px;right:-60px;background:var(--p-bg);border:1px solid var(--bdr2);width:45px;height:45px;border-radius:12px;font-size:18px;cursor:pointer;color:var(--tx)" onclick="hideOfficialProposal()">⇠</button>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #e2e8f0;padding-bottom:30px;margin-bottom:40px">
      <div style="width:200px">
        <img src="https://lh3.googleusercontent.com/p/AF1QipOsxSatAowErSaXDrNvjgUnl6DKvFCknk26CL67=s1360-w1360-h1020-rw" style="width:100%;height:auto;display:block">
        <div style="font-size:10px;margin-top:8px;font-weight:700;color:#1e293b;letter-spacing:1px">ALİBEY YAPI LABORATUVARI</div>
      </div>
      <div style="text-align:right">
        <h2 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:0.5px">FİYAT TEKLİFİ</h2>
        <div style="margin-top:8px;font-size:12px;color:#64748b">
          <div>Referans No: <strong id="pvID" style="color:#0f172a;font-weight:600">—</strong></div>
          <div>Teklif Tarihi: <strong id="pvTarihPrint" style="color:#0f172a;font-weight:600">...</strong></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:40px;margin-bottom:45px">
      <div>
        <div style="font-size:10px;color:#94a3b8;font-weight:800;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">MÜŞTERİ / FİRMA</div>
        <div id="pvFirma" style="font-size:20px;font-weight:700;color:#0f172a;line-height:1.2;margin-bottom:12px">—</div>
        <p style="font-size:13px;color:#475569;line-height:1.6;margin:0">İlgili projenin laboratuvar hizmetleri fiyat teklifimiz aşağıdadır. Belirtilen fiyatlara KDV dahil değildir.</p>
      </div>
      <div style="background:#f8fafc;padding:20px;border-radius:12px;border:1px solid #e2e8f0">
        <div style="font-size:10px;color:#94a3b8;font-weight:800;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">TEKLİF DETAYLARI</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between"><span>Tip:</span><strong id="pvTip" style="color:#0f172a">—</strong></div>
          <div style="display:flex;justify-content:space-between"><span>İnşaat Alanı:</span><strong id="pvAlan" style="color:#0f172a">—</strong></div>
          <div style="display:flex;justify-content:space-between"><span>Ödeme Koşulu:</span><strong id="pvVade" style="color:#0f172a">—</strong></div>
          <div style="display:flex;justify-content:space-between"><span>Geçerlilik:</span><strong id="pvGecerlilik" style="color:#0f172a">—</strong></div>
        </div>
      </div>
    </div>
    <div style="margin-bottom:40px">
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">
        <thead>
          <tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;font-weight:700">
            <th style="padding:15px;text-align:left;border:1px solid #e2e8f0">Hizmet / Deney Açıklaması</th>
            <th style="padding:15px;text-align:center;border:1px solid #e2e8f0;width:80px">Miktar</th>
            <th style="padding:15px;text-align:right;border:1px solid #e2e8f0;width:120px">Birim Fiyat</th>
            <th style="padding:15px;text-align:right;border:1px solid #e2e8f0;width:130px">Toplam (TL)</th>
          </tr>
        </thead>
        <tbody id="pvItemsList" style="font-size:13px;color:#1e293b"></tbody>
        <tfoot>
          <tr style="background:#fff;font-weight:600">
            <td colspan="3" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;font-size:11px;color:#64748b">Ara Toplam (Brüt):</td>
            <td id="pvAraTop" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0">—</td>
          </tr>
          <tr style="background:#fff;font-weight:600">
            <td colspan="3" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;font-size:11px;color:#64748b">İndirim <span id="pvIskLabel" style="font-weight:400;font-size:10px">(%0)</span>:</td>
            <td id="pvIskVal" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;color:#ef4444">—</td>
          </tr>
          <tr style="background:#f8fafc;font-weight:600">
            <td colspan="3" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;font-size:11px;color:#64748b">Matrah (Net):</td>
            <td id="pvMatrah" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0">—</td>
          </tr>
          <tr style="background:#fff;font-weight:600">
            <td colspan="3" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;font-size:11px;color:#64748b">KDV (%20):</td>
            <td id="pvKdvPrint" style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0">—</td>
          </tr>
          <tr style="background:#f8fafc;color:#0f172a;font-weight:700">
            <td colspan="3" style="padding:12px 15px;text-align:right;border:1px solid #e2e8f0;font-size:13px;letter-spacing:0.5px">GENEL TOPLAM:</td>
            <td id="pvTotalPrint" style="padding:12px 15px;text-align:right;border:1px solid #e2e8f0;font-size:18px">0,00 ₺</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="margin-bottom:50px">
      <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;padding-bottom:5px">NOTLAR VE ŞARTLAR</div>
      <div id="pvNot" style="font-size:12px;line-height:1.6;color:#64748b;white-space:pre-wrap"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div style="width:250px;font-size:10px;color:#94a3b8;line-height:1.4">
        <p style="margin:0">İşlem ID: <span id="pvCikti" style="color:#64748b">...</span></p>
        <p style="margin:0">Bu teklif dijital ortamda hazırlanmış olup imza/kaşe ile yürürlüğe girer.</p>
      </div>
      <div style="text-align:center;width:250px">
        <div style="font-size:11px;color:#64748b;margin-bottom:40px;font-weight:600">TEKLİFİ HAZIRLAYAN</div>
        <div id="pvYetkili" style="font-size:15px;font-weight:700;color:#0f172a;border-bottom:2px solid #0f172a;display:inline-block;padding:0 20px 8px 20px;min-width:180px">...</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:8px">Alibey Lab Yetkilisi</div>
      </div>
    </div>
    <div class="no-print" style="margin-top:40px;display:flex;gap:15px">
      <button class="btn btn-p" style="flex:1.5;height:55px;font-size:16px;font-weight:700" onclick="fiyatYazdir()">🖨️ Teklifi Şimdi Yazdır</button>
      <button class="btn btn-o" style="flex:1" onclick="hideOfficialProposal()">Geri Dön</button>
    </div>
  </div>
</div>
`;

export default function GecmisPage() {
  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        const w = window as any;
        if (w.renderPR) w.renderPR();
        if (w.fbPullPR) w.fbPullPR();
        w.fiyatYazdir = () => {
          const el = document.getElementById('printableOffer');
          if (!el) return;
          const html = el.innerHTML;
          const win = window.open('', '_blank', 'width=900,height=700');
          if (!win) { window.print(); return; }
          win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiyat Teklifi</title>
            <style>
              @page { margin: 15mm; }
              body { font-family: 'DM Sans', 'Segoe UI', sans-serif; margin: 0; padding: 30px; background: #fff; color: #1e293b; }
              table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
              th, td { padding: 10px 15px; border: 1px solid #e2e8f0; }
              th { background: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: 700; }
              img { max-width: 200px; }
              .no-print { display: none !important; }
            </style>
          </head><body>${html}</body></html>`);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); win.close(); }, 400);
        };
      }}
    />
  );
}
