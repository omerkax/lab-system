'use client';
import { useEffect, useRef } from 'react';
import { DEFAULT_ADMIN_ROLE, readLabSession, roleIsSahaReadOnly } from '@/lib/lab-auth';

const HTML = `
<div style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
  <div>
    <div style="font-size:18px;font-weight:800;color:var(--tx)">Araç Takip</div>
    <div style="font-size:12px;color:var(--tx3);margin-top:4px">Zimmet, haftalık km, kontrol ve temizlik kayıtları</div>
  </div>
  <button type="button" id="arac-page-add-btn" class="btn btn-p" onclick="aracEkleFormuAc()" style="display:flex;align-items:center;gap:6px">+ Araç Ekle</button>
</div>

<div id="arac-form-wrap" style="display:none">
  <div class="card" style="margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:14px" id="arac-form-baslik">Araç Ekle</div>
    <input type="hidden" id="arac-edit-id" value="">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <div class="fld"><label>Plaka *</label><input type="text" id="arac-plaka" placeholder="34 ABC 123" style="text-transform:uppercase"></div>
      <div class="fld"><label>Marka / Model</label><input type="text" id="arac-model" placeholder="örn: Ford Transit"></div>
      <div class="fld"><label>Yıl</label><input type="number" id="arac-yil" placeholder="2020" min="1990" max="2030"></div>
      <div class="fld"><label>Sorumlu şoför</label><input type="text" id="arac-sofor" placeholder="Ad Soyad"></div>
      <div class="fld"><label>Zimmetli personel</label><input type="text" id="arac-zimmet-ad" placeholder="Zimmet adı (opsiyonel)"></div>
      <div class="fld"><label>Zimmet başlangıç</label><input type="date" id="arac-zimmet-tarih"></div>
      <div class="fld"><label>Muayene son tarihi</label><input type="date" id="arac-muayene"></div>
      <div class="fld"><label>Sigorta son tarihi</label><input type="date" id="arac-sigorta"></div>
      <div class="fld"><label>Son bakım (km)</label><input type="number" id="arac-bakim-km" placeholder="örn: 50000"></div>
      <div class="fld"><label>Güncel KM</label><input type="number" id="arac-guncel-km" placeholder="örn: 55000"></div>
    </div>
    <div class="fld" style="margin-top:8px"><label>Not</label><input type="text" id="arac-not" placeholder="Açıklama..."></div>
    <div class="acts" style="margin-top:14px">
      <button class="btn btn-p" onclick="aracKaydet()">Kaydet</button>
      <button class="btn btn-o" onclick="document.getElementById('arac-form-wrap').style.display='none'">İptal</button>
    </div>
  </div>
</div>

<div id="arac-liste">
  <div style="padding:60px 20px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</div>
</div>
`;

export default function AraclarPage() {
  const init = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shellRef.current;
    if (el) el.innerHTML = HTML;
  }, []);

  useEffect(() => {
    const boot = async () => {
      const w = window as any;
      w.__ARAC_READONLY__ = false;
      w.__ARAC_SOFOR_AD__ = '';
      const s = readLabSession();
      let restrict = !!(s?.readOnly && s.personelId);
      if (!restrict && s?.personelId && typeof w.fsGet === 'function') {
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
          if (rd && roleIsSahaReadOnly(rd)) restrict = true;
        } catch {
          /* ignore */
        }
      }
      if (restrict && s?.personelId && typeof w.fsGet === 'function') {
        const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
        const me = staff.find((x: any) => String(x.id) === String(s.personelId));
        if (me?.ad) {
          w.__ARAC_READONLY__ = true;
          w.__ARAC_SOFOR_AD__ = String(me.ad).trim();
        }
      }
      const check = () => {
        if (typeof w.fsGet === 'function') {
          if (!init.current) {
            init.current = true;
            araclarInit();
          }
        } else setTimeout(check, 100);
      };
      check();
    };
    void boot();
  }, []);

  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }}
    />
  );
}

function aracEl(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

function aracVal(id: string): string {
  return aracEl(id)?.value ?? '';
}

function aracSet(id: string, v: string) {
  const el = aracEl(id);
  if (el) el.value = v;
}

function araclarInit() {
  const w = window as any;

  w.aracEkleFormuAc = (arac?: any) => {
    if (w.__ARAC_READONLY__) return;
    const wrap = document.getElementById('arac-form-wrap');
    const baslik = document.getElementById('arac-form-baslik');
    const editId = aracEl('arac-edit-id');
    if (!wrap || !baslik || !editId) return;
    wrap.style.display = 'block';
    if (arac) {
      baslik.textContent = 'Araç Düzenle';
      editId.value = arac.id;
      aracSet('arac-plaka', arac.plaka || '');
      aracSet('arac-model', arac.model || '');
      aracSet('arac-yil', arac.yil || '');
      aracSet('arac-sofor', arac.sofor || '');
      aracSet('arac-zimmet-ad', arac.zimmetAd || '');
      aracSet('arac-zimmet-tarih', arac.zimmetTarih || '');
      aracSet('arac-muayene', arac.muayene || '');
      aracSet('arac-sigorta', arac.sigorta || '');
      aracSet('arac-bakim-km', arac.bakimKm || '');
      aracSet('arac-guncel-km', arac.guncelKm || '');
      aracSet('arac-not', arac.not || '');
    } else {
      baslik.textContent = 'Araç Ekle';
      editId.value = '';
      [
        'arac-plaka',
        'arac-model',
        'arac-yil',
        'arac-sofor',
        'arac-zimmet-ad',
        'arac-zimmet-tarih',
        'arac-muayene',
        'arac-sigorta',
        'arac-bakim-km',
        'arac-guncel-km',
        'arac-not',
      ].forEach(id => aracSet(id, ''));
    }
    wrap.scrollIntoView({ behavior: 'smooth' });
  };

  w.aracKaydet = async () => {
    if (w.__ARAC_READONLY__) return;
    const plaka = (aracVal('arac-plaka') || '').trim().toUpperCase();
    if (!plaka) {
      w.toast && w.toast('Plaka zorunlu!', 'error');
      return;
    }
    const editId = aracVal('arac-edit-id');
    const id = editId || plaka.replace(/\s/g, '-');
    const prev = ((w._araclarData || []) as any[]).find((x: any) => x.id === id) || {};
    const data = {
      ...prev,
      id,
      plaka,
      model: aracVal('arac-model'),
      yil: aracVal('arac-yil'),
      sofor: aracVal('arac-sofor'),
      zimmetAd: aracVal('arac-zimmet-ad').trim(),
      zimmetTarih: aracVal('arac-zimmet-tarih'),
      muayene: aracVal('arac-muayene'),
      sigorta: aracVal('arac-sigorta'),
      bakimKm: aracVal('arac-bakim-km'),
      guncelKm: aracVal('arac-guncel-km'),
      not: aracVal('arac-not'),
      aktif: true,
      guncelleme: new Date().toISOString(),
    };
    await w.fsSet('araclar', id, data);
    w.logAction && w.logAction('araclar', `Araç kaydedildi: ${plaka}`);
    w.toast && w.toast('Araç kaydedildi', 'success');
    const fw = document.getElementById('arac-form-wrap');
    if (fw) fw.style.display = 'none';
    araclarYukle();
  };

  w.aracSil = async (id: string, plaka: string) => {
    if (w.__ARAC_READONLY__) return;
    if (!confirm(`${plaka} plakalı aracı silmek istiyor musunuz?`)) return;
    await w.fsSet('araclar', id, { aktif: false, silme: new Date().toISOString() });
    w.logAction && w.logAction('araclar', `Araç silindi: ${plaka}`);
    araclarYukle();
  };

  araclarYukle();
}

function normAd(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function aracSonHaftaKmOzeti(a: any): string {
  const log = Array.isArray(a.haftalikKmLog) ? a.haftalikKmLog : [];
  if (!log.length) return '—';
  const last = log[log.length - 1];
  return `${last.hafta || '—'}: ${last.km != null ? Number(last.km).toLocaleString('tr-TR') : '—'} km`;
}

function fmtTrShort(iso: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Özet sayılar + son kayıtların tabloları (kart içi) */
function aracOperasyonGecmisHtml(a: any): string {
  const hkAll = Array.isArray(a.haftalikKmLog) ? a.haftalikKmLog : [];
  const koAll = Array.isArray(a.kontrolLog) ? a.kontrolLog : [];
  const teAll = Array.isArray(a.temizlikLog) ? a.temizlikLog : [];
  const hk = [...hkAll].reverse().slice(0, 16);
  const ko = [...koAll].reverse().slice(0, 10);
  const te = [...teAll].reverse().slice(0, 10);

  const hkKmVals = hkAll.map((x: any) => Number(x.km)).filter((n: number) => Number.isFinite(n));
  const avg =
    hkKmVals.length > 0
      ? (hkKmVals.reduce((s: number, n: number) => s + n, 0) / hkKmVals.length).toLocaleString('tr-TR', {
          maximumFractionDigits: 0,
        })
      : null;

  const sumLine =
    hkAll.length || koAll.length || teAll.length
      ? `<div style="font-size:10px;color:var(--tx3);margin-top:6px;line-height:1.45">
          <span style="color:var(--tx2);font-weight:700">${hkAll.length}</span> haftalık km
          · <span style="color:var(--tx2);font-weight:700">${koAll.length}</span> kontrol
          · <span style="color:var(--tx2);font-weight:700">${teAll.length}</span> temizlik
          ${avg != null ? ` · ort. haftalık km: <span style="color:var(--acc2);font-weight:700">${avg}</span>` : ''}
        </div>`
      : '';

  const hkRows =
    hk.length > 0
      ? hk
          .map(
            (x: any) =>
              `<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px">${escapeHtml(String(x.hafta || '—'))}</td>` +
              `<td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px;text-align:right;font-variant-numeric:tabular-nums">${x.km != null ? Number(x.km).toLocaleString('tr-TR') : '—'}</td>` +
              `<td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px;color:var(--tx3);white-space:nowrap">${escapeHtml(fmtTrShort(x.tarih || ''))}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="3" style="padding:10px;font-size:10px;color:var(--tx3);text-align:center">Henüz haftalık km kaydı yok</td></tr>`;

  const hkCap =
    hkAll.length > 16
      ? `Son ${hk.length} / toplam ${hkAll.length}`
      : hkAll.length
        ? `Son ${hk.length}`
        : 'Haftalık km';

  const koRows =
    ko.length > 0
      ? ko
          .map(
            (x: any) =>
              `<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px;color:var(--tx3);white-space:nowrap">${escapeHtml(fmtTrShort(x.tarih || ''))}</td>` +
              `<td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px">${escapeHtml(x.not || '—')}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="2" style="padding:10px;font-size:10px;color:var(--tx3);text-align:center">Henüz kontrol kaydı yok</td></tr>`;

  const temizlikGunGoster = (x: any): string => {
    const olay = String(x.olayTarihi || '').trim();
    if (olay && /^\d{4}-\d{2}-\d{2}$/.test(olay)) return olay.split('-').reverse().join('.');
    if (x.tarih) {
      const t = Date.parse(String(x.tarih));
      if (Number.isFinite(t)) return new Date(t).toLocaleDateString('tr-TR');
    }
    return '—';
  };
  const temizlikDurumGoster = (x: any): string => {
    if (x.temiz === true) return '<span style="color:var(--grn);font-weight:700">Temiz</span>';
    if (x.temiz === false) return '<span style="color:var(--amb);font-weight:700">Temiz değil</span>';
    return '<span style="color:var(--tx3)">—</span>';
  };
  const teRows =
    te.length > 0
      ? te
          .map(
            (x: any) =>
              `<tr><td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px;color:var(--tx3);white-space:nowrap">${escapeHtml(temizlikGunGoster(x))}</td>` +
              `<td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px">${temizlikDurumGoster(x)}</td>` +
              `<td style="padding:5px 8px;border-bottom:1px solid var(--bdr);font-size:10px">${escapeHtml(x.not || '—')}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="3" style="padding:10px;font-size:10px;color:var(--tx3);text-align:center">Henüz temizlik kaydı yok</td></tr>`;

  return `
    ${sumLine}
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--acc);user-select:none">Kayıt geçmişi (tablolar)</summary>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${escapeHtml(hkCap)}</div>
          <div style="overflow:auto;max-height:160px;border:1px solid var(--bdr);border-radius:8px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr)">Hafta</th><th style="text-align:right;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr)">Km</th><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr)">Kayıt</th></tr></thead>
              <tbody>${hkRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Kontrol — son ${ko.length}</div>
          <div style="overflow:auto;max-height:140px;border:1px solid var(--bdr);border-radius:8px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr);width:38%">Tarih</th><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr)">Not</th></tr></thead>
              <tbody>${koRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Temizlik — son ${te.length}</div>
          <div style="overflow:auto;max-height:140px;border:1px solid var(--bdr);border-radius:8px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr);width:26%">Tarih</th><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr);width:28%">Durum</th><th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bdr)">Not</th></tr></thead>
              <tbody>${teRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  `;
}

async function aracPatchLog(aracId: string, patch: (prev: any) => any) {
  const w = window as any;
  const docs: any[] = (await w.fsGet('araclar')) || [];
  const a = docs.find((d: any) => d.id === aracId && d.aktif !== false);
  if (!a) {
    w.toast && w.toast('Araç bulunamadı', 'error');
    return;
  }
  const next = patch({ ...a });
  await w.fsSet('araclar', aracId, next);
  w.logAction && w.logAction('araclar', `Araç operasyon: ${aracId}`);
  w.toast && w.toast('Kaydedildi', 'success');
  araclarYukle();
}

async function araclarYukle() {
  const w = window as any;
  const el = document.getElementById('arac-liste');
  if (!el) return;
  try {
    const docs: any[] = (await w.fsGet('araclar')) || [];
    let aktif = docs.filter(d => d.aktif !== false);
    if (w.__ARAC_READONLY__ && w.__ARAC_SOFOR_AD__) {
      const me = normAd(w.__ARAC_SOFOR_AD__);
      aktif = aktif.filter((a: any) => {
        const s = normAd(a.sofor || '');
        const z = normAd(a.zimmetAd || '');
        const hit = (x: string) => x && me && (x === me || x.includes(me) || me.includes(x));
        return hit(s) || hit(z);
      });
    }
    if (!aktif.length) {
      el.innerHTML =
        '<div class="card" style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Henüz araç eklenmedi veya size zimmetli kayıt yok.</div>';
      return;
    }
    const today = new Date();
    const uyar = (tarih: string) => {
      if (!tarih) return '';
      const t = new Date(tarih);
      const diff = Math.ceil((t.getTime() - today.getTime()) / 86400000);
      if (diff < 0) return 'color:var(--red);font-weight:700';
      if (diff <= 30) return 'color:var(--amb);font-weight:700';
      return 'color:var(--grn)';
    };
    w._araclarData = aktif;
    const ro = !!w.__ARAC_READONLY__;
    const todayYmd = new Date().toLocaleDateString('en-CA');
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">
        ${aktif
          .map(
            (a, i) => `
          <div class="card" style="padding:16px 18px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--tx);font-family:var(--fd)">${escapeHtml(a.plaka)}</div>
                <div style="font-size:12px;color:var(--tx3)">${escapeHtml(a.model || '—')} ${a.yil ? '(' + escapeHtml(String(a.yil)) + ')' : ''}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                ${ro ? '' : `<button type="button" data-edit-idx="${i}" style="background:var(--sur2);border:1px solid var(--bdr);color:var(--tx2);font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">Düzenle</button>
                <button type="button" data-del-idx="${i}" style="background:none;border:1px solid var(--bdr);color:var(--red);font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer">Sil</button>`}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
              <div><span style="color:var(--tx3)">Şoför:</span> <span style="color:var(--tx)">${escapeHtml(a.sofor || '—')}</span></div>
              <div><span style="color:var(--tx3)">Zimmet:</span> <span style="color:var(--tx)">${escapeHtml(a.zimmetAd || '—')}</span></div>
              <div><span style="color:var(--tx3)">KM:</span> <span style="color:var(--tx)">${a.guncelKm ? Number(a.guncelKm).toLocaleString('tr-TR') : '—'}</span></div>
              <div><span style="color:var(--tx3)">Haftalık:</span> <span style="color:var(--acc2)">${escapeHtml(aracSonHaftaKmOzeti(a))}</span></div>
              <div><span style="color:var(--tx3)">Muayene:</span> <span style="${uyar(a.muayene)}">${escapeHtml(a.muayene || '—')}</span></div>
              <div><span style="color:var(--tx3)">Sigorta:</span> <span style="${uyar(a.sigorta)}">${escapeHtml(a.sigorta || '—')}</span></div>
            </div>
            ${a.not ? `<div style="font-size:11px;color:var(--tx3);font-style:italic">${escapeHtml(a.not)}</div>` : ''}

            <div style="margin-top:4px;padding-top:12px;border-top:1px solid var(--bdr)">
              <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Haftalık km</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:11px">
                <input type="week" id="arac-op-wk-${i}" style="padding:6px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx)" />
                <input type="number" id="arac-op-km-${i}" placeholder="Km" min="0" step="1" style="width:88px;padding:6px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx)" />
                <button type="button" class="btn btn-p" style="padding:6px 12px;font-size:11px" data-arac-hk="${i}">Kaydet</button>
              </div>
              <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">Kontrol</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                <input type="text" id="arac-op-ko-${i}" placeholder="Not (opsiyonel)" style="flex:1;min-width:120px;padding:6px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px" />
                <button type="button" class="btn btn-o" style="padding:6px 12px;font-size:11px" data-arac-ko="${i}">Kontrol kaydı</button>
              </div>
              <div style="font-size:10px;font-weight:800;color:var(--acc2);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">Temizlik</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:11px">
                <label style="display:flex;align-items:center;gap:4px;color:var(--tx2);white-space:nowrap">Tarih
                  <input type="date" id="arac-op-te-t-${i}" value="${escapeAttr(todayYmd)}" style="padding:6px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px" />
                </label>
                <select id="arac-op-te-durum-${i}" style="padding:6px 8px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px;max-width:140px">
                  <option value="evet">Temiz</option>
                  <option value="hayir">Temiz değil</option>
                </select>
                <input type="text" id="arac-op-te-${i}" placeholder="Not (opsiyonel)" style="flex:1;min-width:100px;padding:6px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px" />
                <button type="button" class="btn btn-o" style="padding:6px 12px;font-size:11px" data-arac-te="${i}">Kaydet</button>
              </div>
              ${ro ? '' : `<div style="font-size:10px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px">Zimmet güncelle</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                <input type="text" id="arac-op-zi-${i}" placeholder="Personel adı" value="${escapeAttr(a.zimmetAd || '')}" style="flex:1;min-width:120px;padding:6px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px" />
                <input type="date" id="arac-op-zd-${i}" value="${escapeAttr(a.zimmetTarih || '')}" style="padding:6px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:11px" />
                <button type="button" class="btn btn-p" style="padding:6px 12px;font-size:11px" data-arac-zi="${i}">Zimmet kaydet</button>
              </div>`}
              ${aracOperasyonGecmisHtml(a)}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
    if (ro) {
      const addBtn = document.getElementById('arac-page-add-btn');
      if (addBtn) (addBtn as HTMLElement).style.display = 'none';
    }
    el.querySelectorAll<HTMLButtonElement>('[data-edit-idx]').forEach(btn => {
      btn.addEventListener('click', () => w.aracEkleFormuAc(w._araclarData[Number(btn.dataset.editIdx)]));
    });
    el.querySelectorAll<HTMLButtonElement>('[data-del-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = w._araclarData[Number(btn.dataset.delIdx)];
        if (a) w.aracSil(a.id, a.plaka);
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-arac-hk]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.aracHk);
        const a = w._araclarData[i];
        if (!a) return;
        const wkEl = document.getElementById(`arac-op-wk-${i}`) as HTMLInputElement;
        const kmEl = document.getElementById(`arac-op-km-${i}`) as HTMLInputElement;
        const hafta = (wkEl?.value || '').trim();
        const km = parseFloat(kmEl?.value || '');
        if (!hafta || !Number.isFinite(km) || km < 0) {
          w.toast && w.toast('Hafta ve km girin', 'error');
          return;
        }
        await aracPatchLog(a.id, prev => {
          const log = Array.isArray(prev.haftalikKmLog) ? prev.haftalikKmLog.slice() : [];
          log.push({ hafta, km, tarih: new Date().toISOString() });
          while (log.length > 52) log.shift();
          return { ...prev, haftalikKmLog: log, guncelleme: new Date().toISOString() };
        });
        if (kmEl) kmEl.value = '';
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-arac-ko]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.aracKo);
        const a = w._araclarData[i];
        if (!a) return;
        const n = (document.getElementById(`arac-op-ko-${i}`) as HTMLInputElement)?.value?.trim() || '';
        await aracPatchLog(a.id, prev => {
          const log = Array.isArray(prev.kontrolLog) ? prev.kontrolLog.slice() : [];
          log.push({ tarih: new Date().toISOString(), not: n });
          while (log.length > 40) log.shift();
          return { ...prev, kontrolLog: log, guncelleme: new Date().toISOString() };
        });
        const koInp = document.getElementById(`arac-op-ko-${i}`) as HTMLInputElement | null;
        if (koInp) koInp.value = '';
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-arac-te]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.aracTe);
        const a = w._araclarData[i];
        if (!a) return;
        const gun = (document.getElementById(`arac-op-te-t-${i}`) as HTMLInputElement)?.value?.trim() || '';
        if (!gun) {
          w.toast && w.toast('Temizlik tarihi seçin', 'error');
          return;
        }
        const durum = (document.getElementById(`arac-op-te-durum-${i}`) as HTMLSelectElement)?.value || 'evet';
        const temiz = durum === 'evet';
        const n = (document.getElementById(`arac-op-te-${i}`) as HTMLInputElement)?.value?.trim() || '';
        const kayit = new Date().toISOString();
        await aracPatchLog(a.id, prev => {
          const log = Array.isArray(prev.temizlikLog) ? prev.temizlikLog.slice() : [];
          log.push({ olayTarihi: gun, temiz, not: n, kayit, tarih: kayit });
          while (log.length > 40) log.shift();
          return { ...prev, temizlikLog: log, guncelleme: new Date().toISOString() };
        });
        const teInp = document.getElementById(`arac-op-te-${i}`) as HTMLInputElement | null;
        if (teInp) teInp.value = '';
        const teT = document.getElementById(`arac-op-te-t-${i}`) as HTMLInputElement | null;
        if (teT) teT.value = new Date().toLocaleDateString('en-CA');
        const teD = document.getElementById(`arac-op-te-durum-${i}`) as HTMLSelectElement | null;
        if (teD) teD.value = 'evet';
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-arac-zi]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = Number(btn.dataset.aracZi);
        const a = w._araclarData[i];
        if (!a) return;
        const zad = (document.getElementById(`arac-op-zi-${i}`) as HTMLInputElement)?.value?.trim() || '';
        const zt = (document.getElementById(`arac-op-zd-${i}`) as HTMLInputElement)?.value || '';
        await aracPatchLog(a.id, prev => ({
          ...prev,
          zimmetAd: zad,
          zimmetTarih: zt,
          sofor: zad || prev.sofor,
          guncelleme: new Date().toISOString(),
        }));
      });
    });
  } catch {
    el.innerHTML =
      '<div class="card" style="padding:20px;text-align:center;color:var(--red);font-size:12px">Araçlar yüklenemedi.</div>';
  }
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
