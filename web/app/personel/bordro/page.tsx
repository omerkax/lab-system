'use client';
import ModulePage from '@/components/ModulePage';
import { useEffect } from 'react';
import { LAB_SESSION_KEY, readLabSession } from '@/lib/lab-auth';

const HTML = `
<div class="page-shell">
<div class="ph" style="margin-bottom:20px">
  <h1 style="display:flex;align-items:center;gap:12px">📊 Aylık Bordro <span id="payrollMonthBadge" style="font-size:12px;background:var(--acc2);color:#fff;padding:4px 12px;border-radius:20px;font-weight:600"></span></h1>
  <p>Maaş hesaplama, mesai ve ek ödemeler</p>
</div>

<div class="card" style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div class="fld" style="margin:0"><label>Bordro Ayı</label>
      <input type="month" id="payrollMonth" onchange="loadPayroll(this.value)" style="padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)">
    </div>
    <button class="btn btn-p" id="btnTopluKaydet" onclick="saveAllPayroll()" style="height:42px;display:flex;align-items:center;gap:8px;background:var(--grn);border-color:var(--grn)">💾 Toplu Kaydet</button>
    <button class="btn btn-o" onclick="exportPayrollExcel()" style="height:42px;display:flex;align-items:center;gap:8px">📥 Excel İndir</button>
  </div>
  <div style="display:flex;gap:20px;flex-wrap:wrap">
    <div style="text-align:right"><div style="font-size:10px;color:var(--tx3);letter-spacing:1px;font-weight:700">TOPLAM ÖDEME</div><div id="totalPayrollPay" style="font-size:18px;font-weight:800;color:var(--grn)">0,00 ₺</div></div>
    <div style="text-align:right"><div style="font-size:10px;color:var(--tx3);letter-spacing:1px;font-weight:700">TOPLAM ASGARİ PAYI</div><div id="totalPayrollAsgari" style="font-size:18px;font-weight:800;color:var(--tx2)">0,00 ₺</div></div>
    <div style="text-align:right"><div style="font-size:10px;color:var(--tx3);letter-spacing:1px;font-weight:700">TOPLAM EK ÖDEME</div><div id="totalPayrollEk" style="font-size:18px;font-weight:800;color:var(--acc2)">0,00 ₺</div></div>
  </div>
</div>

<div class="card" style="padding:0;overflow:hidden">
  <div class="tw">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="font-size:11px;text-transform:uppercase;letter-spacing:1px">
          <th style="padding:15px;text-align:left">Personel / TC / IBAN</th>
          <th style="padding:15px;text-align:center">Net Maaş</th>
          <th style="padding:15px;text-align:center">Mesai (Saat / ₺)</th>
          <th style="padding:15px;text-align:center;border-left:1px solid var(--bdr3)">Takım & ₺/Tk</th>
          <th style="padding:15px;text-align:center;border-left:1px solid var(--bdr3);background:var(--sur)">Ek Prim & Açık.</th>
          <th style="padding:15px;text-align:center;border-left:1px solid var(--bdr3)">Avans / Kesinti</th>
          <th style="padding:15px;text-align:center;border-left:1px solid var(--bdr3);background:rgba(255,165,0,0.05)">Eksik Gün (R / D)</th>
          <th style="padding:15px;text-align:center;border-left:1px solid var(--bdr3);background:rgba(99,102,241,0.08)">📅 SGK Günü</th>
          <th style="padding:15px;text-align:right;border-left:1px solid var(--bdr3)">Asgari / Kalan</th>
          <th style="padding:15px;text-align:right">GENEL TOPLAM</th>
          <th style="padding:15px;text-align:center">İşlem</th>
        </tr>
      </thead>
      <tbody id="payrollList"></tbody>
    </table>
  </div>
</div>
</div>
`;

/** PersonelAccessBridge async tamamlanmadan önce tablo yanlış dolmasın: oturumdaki personelId ile anında kilitle */
function syncPayrollSelfFromSession() {
  const w = window as any;
  const s = readLabSession();
  const pid = String(s?.personelId || '').trim();
  if (pid) {
    w.__LAB_PERSONEL_SELF_ID__ = pid;
    w.__LAB_PERSONEL_ACCESS__ = 'view';
  }
}

export default function BordroPage() {
  useEffect(() => {
    syncPayrollSelfFromSession();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) syncPayrollSelfFromSession();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        const boot = async () => {
          syncPayrollSelfFromSession();
          const w = window as any;
          const s = readLabSession();
          if (!String(s?.personelId || '').trim() && s?.userId && typeof w.fsGet === 'function') {
            try {
              const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
              const me = users.find((x: any) => String(x.id) === String(s.userId));
              if (me?.personelId) {
                w.__LAB_PERSONEL_SELF_ID__ = String(me.personelId);
                w.__LAB_PERSONEL_ACCESS__ = 'view';
              }
            } catch {
              /* ignore */
            }
          }
          const ay = new Date().toISOString().slice(0, 7);
          const inp = document.getElementById('payrollMonth') as HTMLInputElement;
          if (inp) inp.value = ay;
          const badge = document.getElementById('payrollMonthBadge');
          if (badge) badge.textContent = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
          if (w.loadPayroll) w.loadPayroll(ay);
          if (w.fbPullStaff) await w.fbPullStaff();
        };
        void boot();
      }}
    />
  );
}
