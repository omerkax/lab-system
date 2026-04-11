'use client';

import { useEffect } from 'react';
import ModulePage from '@/components/ModulePage';
import { DEFAULT_ADMIN_ROLE, LAB_SESSION_KEY, readLabSession, roleIsSahaReadOnly } from '@/lib/lab-auth';

const HTML = `
<div class="page-shell">
<div class="ph" style="margin-bottom:20px">
  <h1>📈 Maaş Özeti & Analitik</h1>
  <p>Personel bazlı maaş geçmişi ve SGK maliyet analizi</p>
</div>
<div class="card" style="margin-bottom:20px">
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:15px;align-items:flex-end">
    <div class="fld"><label>Personel Seçin</label>
      <select id="sumStaff" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)">
        <option value="ALL">Tüm Personel</option>
      </select>
    </div>
    <div class="fld"><label>Başlangıç Ayı</label><input type="month" id="sumStart" style="padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)"></div>
    <div class="fld"><label>Bitiş Ayı</label><input type="month" id="sumEnd" style="padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)"></div>
    <button class="btn btn-p" onclick="loadMaasSummary()" style="height:42px;font-weight:700">🔍 Verileri Getir</button>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:15px;margin-bottom:20px">
  <div class="card" style="border-left:4px solid var(--grn)">
    <div style="font-size:10px;color:var(--tx3);font-weight:700">TOPLAM ÖDEME (NET)</div>
    <div id="sumTotalPaid" style="font-size:20px;font-weight:900;color:var(--grn)">0,00 ₺</div>
  </div>
  <div class="card" style="border-left:4px solid var(--acc2)">
    <div style="font-size:10px;color:var(--tx3);font-weight:700">TOPLAM KAROT PRİMİ</div>
    <div id="sumTotalKarot" style="font-size:20px;font-weight:900;color:var(--acc2)">0,00 ₺</div>
  </div>
  <div class="card" style="border-left:4px solid var(--amb)">
    <div style="font-size:10px;color:var(--tx3);font-weight:700">EKSİK GÜN (RAPOR/DİĞER)</div>
    <div id="sumTotalEksik" style="font-size:20px;font-weight:900;color:var(--amb)">0 / 0</div>
  </div>
  <div class="card" style="border-left:4px solid #b5a4ff">
    <div style="font-size:10px;color:var(--tx3);font-weight:700">TEŞVİK KAZANCI (%5)</div>
    <div id="sumTotalTesvik" style="font-size:18px;font-weight:900;color:#8e7bff">0,00 ₺</div>
  </div>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <div class="tw">
    <table style="width:100%">
      <thead>
        <tr style="font-size:11px;text-transform:uppercase;letter-spacing:1px">
          <th style="padding:15px;text-align:left">Personel / Ay</th>
          <th style="padding:15px;text-align:right">Net Ödeme</th>
          <th style="padding:15px;text-align:right">Karot / Ek</th>
          <th style="padding:15px;text-align:center">Rapor / İzin</th>
          <th style="padding:15px;text-align:center">SGK Günü</th>
          <th style="padding:15px;text-align:right">Normal SGK Maliyeti</th>
          <th style="padding:15px;text-align:right;color:var(--grn)">Teşvikli Maliyet</th>
        </tr>
      </thead>
      <tbody id="summaryList">
        <tr><td colspan="7" style="padding:40px;text-align:center;color:var(--tx3)">Filtreleme yaparak "Verileri Getir" butonuna basınız.</td></tr>
      </tbody>
    </table>
  </div>
</div>
</div>
`;

async function applyOzetLock() {
  const s = readLabSession();
  const w = window as any;
  let lock = !!(s?.readOnly && s.personelId);
  if (!lock && s?.personelId && typeof w.fsGet === 'function') {
    try {
      const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const meU = users.find((x: any) => String(x.id) === String(s.userId));
      const rm: Record<string, any> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r;
      });
      if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
      const rd = meU ? rm[meU.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : null;
      if (rd && roleIsSahaReadOnly(rd)) lock = true;
    } catch {
      /* ignore */
    }
  }
  if (lock && s?.personelId) {
    w.__MAAS_OZET_LOCK_STAFF_ID__ = String(s.personelId);
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const sel = document.getElementById('sumStaff') as HTMLSelectElement | null;
      if (sel) {
        sel.value = String(s.personelId);
        sel.disabled = true;
        clearInterval(t);
      } else if (tries > 80) clearInterval(t);
    }, 100);
  } else {
    delete w.__MAAS_OZET_LOCK_STAFF_ID__;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const sel = document.getElementById('sumStaff') as HTMLSelectElement | null;
      if (sel) {
        sel.disabled = false;
        clearInterval(t);
      } else if (tries > 80) clearInterval(t);
    }, 100);
  }
}

export default function OzetPage() {
  useEffect(() => {
    void applyOzetLock();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) void applyOzetLock();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      delete (window as any).__MAAS_OZET_LOCK_STAFF_ID__;
    };
  }, []);

  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        void (async () => {
          await applyOzetLock();
          const w = window as any;
          if (w.fbPullStaff) await w.fbPullStaff();
        })();
      }}
    />
  );
}
