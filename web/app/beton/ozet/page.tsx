'use client';
import { useEffect, useRef } from 'react';
import { DEFAULT_ADMIN_ROLE, isSahaRestrictedSession, readLabSession } from '@/lib/lab-auth';
import {
  KAROT_ALT,
  NUMUNE_TURLERI,
  type NumuneTurKey,
  betonRowAssignedToPersonelAd,
  filterDocsByDateRange,
  localDateISO,
  numuneTurOf,
  personelListesi,
} from '@/lib/numune-shared';

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TUR_STIL: Record<NumuneTurKey, { bg: string; fg: string }> = {
  beton: { bg: 'rgba(59,130,246,.18)', fg: 'var(--acc2)' },
  karot: { bg: 'rgba(167,139,250,.18)', fg: '#a78bfa' },
  celik: { bg: 'rgba(52,211,153,.14)', fg: 'var(--grn)' },
  diger: { bg: 'rgba(148,163,184,.15)', fg: 'var(--tx2)' },
};

const SHELL = `
<div class="ph" style="margin-bottom:18px">
  <h1>📊 Numune özeti</h1>
  <p style="margin:0;color:var(--tx3);font-size:13px;line-height:1.45">Tarih aralığına göre kayıt, tür, günlük ve personel kırılımı. Ham veriyi CSV olarak indirebilirsiniz.</p>
  <p style="margin:10px 0 0;font-size:12px"><a href="/beton" style="color:var(--acc2);font-weight:600;text-decoration:none">← Numune programına dön</a></p>
</div>

<div class="card" style="margin-bottom:16px;padding:14px 16px">
  <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
    <div class="fld" style="min-width:140px">
      <label>Başlangıç</label>
      <input type="date" id="noz-bas" class="pi" style="width:100%">
    </div>
    <div class="fld" style="min-width:140px">
      <label>Bitiş</label>
      <input type="date" id="noz-bit" class="pi" style="width:100%">
    </div>
    <button type="button" class="btn btn-g" style="height:38px" onclick="numuneOzetHizli('son7')">Son 7 gün</button>
    <button type="button" class="btn btn-g" style="height:38px" onclick="numuneOzetHizli('buay')">Bu ay</button>
    <button type="button" class="btn btn-g" style="height:38px" onclick="numuneOzetHizli('son30')">Son 30 gün</button>
    <button type="button" class="btn btn-g" style="height:38px" onclick="numuneOzetHizli('tumu')">Tümü</button>
    <button type="button" class="btn btn-p" style="height:38px" onclick="numuneOzetYenile()">Uygula</button>
    <button type="button" class="btn btn-o" style="height:38px" onclick="numuneOzetCsv()">CSV indir</button>
  </div>
  <div id="noz-info" style="margin-top:12px;font-size:12px;color:var(--tx3)">Yükleniyor…</div>
</div>

<div id="noz-kpi" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px"></div>

<div class="card" style="margin-bottom:16px;padding:16px 18px">
  <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:12px">Türe göre</div>
  <div id="noz-tur" style="font-size:12px;color:var(--tx2);line-height:1.5"></div>
</div>

<div class="card" style="margin-bottom:16px;padding:16px 18px">
  <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:12px">Karot alt tür</div>
  <div id="noz-karot" style="font-size:12px;color:var(--tx3)">—</div>
</div>

<div style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px">
  <div class="card" style="padding:0;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--tx)">Günlük</div>
    <div style="overflow-x:auto">
      <table class="beton-tbl" style="min-width:520px">
        <thead><tr>
          <th>Tarih</th><th style="text-align:right">Kayıt</th><th style="text-align:right">Planlı adet</th><th style="text-align:right">m³</th>
          <th style="text-align:right">🏗️</th><th style="text-align:right">🧱</th><th style="text-align:right">🔩</th><th style="text-align:right">📋</th>
        </tr></thead>
        <tbody id="noz-tbody-gun"></tbody>
      </table>
    </div>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div style="padding:12px 16px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--tx)">Personel</div>
    <div style="overflow-x:auto">
      <table class="beton-tbl" style="min-width:640px">
        <thead><tr>
          <th>Personel</th><th style="text-align:right">Kayıt</th><th style="text-align:right">Adet</th><th style="text-align:right">m³</th>
          <th style="text-align:right">🏗️</th><th style="text-align:right">🧱</th><th style="text-align:right">🔩</th><th style="text-align:right">📋</th>
        </tr></thead>
        <tbody id="noz-tbody-per"></tbody>
      </table>
    </div>
  </div>
</div>
`;

/** Personele bağlı veya saha kısıtlı kullanıcılar için özet kapsamı */
async function resolveNumuneOzetScope(w: any): Promise<{
  selfAd: string;
  selfFilter: boolean;
  sahaNoSelf: boolean;
}> {
  const s = readLabSession();
  if (!s?.userId || typeof w.fsGet !== 'function') {
    return { selfAd: '', selfFilter: false, sahaNoSelf: false };
  }
  try {
    const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
    const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
    const rm: Record<string, any> = {};
    rRows.forEach((r: any) => {
      if (r?.id && !r._silindi) rm[r.id] = r;
    });
    if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
    const meU = users.find((x: any) => String(x.id) === String(s.userId));
    const role = meU ? rm[meU.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : null;
    const pid = String(s.personelId || meU?.personelId || '').trim();
    if (pid) {
      const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
      const me = staff.find((x: any) => String(x.id) === String(pid));
      const ad = me?.ad ? String(me.ad).trim() : '';
      return { selfAd: ad, selfFilter: true, sahaNoSelf: false };
    }
    if (isSahaRestrictedSession(role, s)) {
      return { selfAd: '', selfFilter: false, sahaNoSelf: true };
    }
  } catch {
    /* ignore */
  }
  return { selfAd: '', selfFilter: false, sahaNoSelf: false };
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDateISO(d);
}

function aggregate(rows: any[]) {
  const byTur: Record<NumuneTurKey, number> = { beton: 0, karot: 0, celik: 0, diger: 0 };
  const karotAlt: Record<string, number> = { genel: 0, kentsel: 0, performans: 0 };
  let toplamAdet = 0;
  let toplamM3 = 0;
  const byGun: Record<string, any[]> = {};
  const byPer: Record<string, any[]> = {};

  for (const d of rows) {
    const t = numuneTurOf(d);
    byTur[t]++;
    toplamAdet += parseInt(String(d.adet), 10) || 0;
    toplamM3 += parseFloat(String(d.m3)) || 0;
    if (t === 'karot') {
      const k = String(d.karotAlt || 'genel').toLowerCase();
      if (k in karotAlt) karotAlt[k]++;
      else karotAlt.genel++;
    }
    const g = d.tarih || '—';
    if (!byGun[g]) byGun[g] = [];
    byGun[g].push(d);
    const people = personelListesi(d);
    if (!people.length) {
      const p = '(Atanmamış)';
      if (!byPer[p]) byPer[p] = [];
      byPer[p].push(d);
    } else {
      people.forEach(p => {
        if (!byPer[p]) byPer[p] = [];
        byPer[p].push(d);
      });
    }
  }

  return { byTur, karotAlt, toplamAdet, toplamM3, byGun, byPer };
}

function renderOzet() {
  const w = window as any;
  const docs: any[] = w._nozDocs || [];
  const basEl = document.getElementById('noz-bas') as HTMLInputElement;
  const bitEl = document.getElementById('noz-bit') as HTMLInputElement;
  const bas = basEl?.value?.trim() || '';
  const bit = bitEl?.value?.trim() || '';
  const filtered = bas || bit ? filterDocsByDateRange(docs, bas, bit) : docs.slice();

  const info = document.getElementById('noz-info');
  if (info) {
    if (w.__NOZ_SAHA_NO_SELF__) {
      info.textContent =
        'Hesabınız personele bağlı değil; özet yalnızca size atanmış görevler içindir. Yöneticinizden lab_users.personelId eşlemesi isteyin.';
    } else if (w.__NOZ_SELF_FILTER__) {
      info.textContent = `Yalnızca size atanmış kayıtlar · ${filtered.length} kayıt · ${bas || '…'} → ${bit || '…'}`;
    } else {
      info.textContent = `${filtered.length} kayıt · ${bas || '…'} → ${bit || '…'}`;
    }
  }

  const { byTur, karotAlt, toplamAdet, toplamM3, byGun, byPer } = aggregate(filtered);

  const kpi = document.getElementById('noz-kpi');
  if (kpi) {
    const cards = [
      { t: 'Kayıt', v: String(filtered.length), s: 'var(--acc)' },
      { t: 'Planlı numune adedi', v: String(toplamAdet), s: 'var(--grn)' },
      { t: 'Toplam m³', v: toplamM3.toFixed(1), s: 'var(--amb)' },
      {
        t: 'Personel (atanmış)',
        v: String(Object.keys(byPer).filter(p => p !== '(Atanmamış)').length),
        s: 'var(--pur)',
      },
    ];
    kpi.innerHTML = cards
      .map(
        c => `<div class="card" style="padding:14px 16px;border-left:3px solid ${c.s}">
        <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em">${escHtml(c.t)}</div>
        <div style="font-size:26px;font-weight:800;color:${c.s};margin-top:6px;font-family:var(--fd)">${escHtml(c.v)}</div>
      </div>`
      )
      .join('');
  }

  const turEl = document.getElementById('noz-tur');
  if (turEl) {
    turEl.innerHTML = NUMUNE_TURLERI.map(m => {
      const st = TUR_STIL[m.key];
      return `<span style="display:inline-flex;margin:4px 8px 4px 0;padding:4px 12px;border-radius:999px;background:${st.bg};color:${st.fg};font-size:12px;font-weight:700">${m.emoji} ${m.label}: ${byTur[m.key]}</span>`;
    }).join('');
  }

  const karEl = document.getElementById('noz-karot');
  if (karEl) {
    if (byTur.karot === 0) {
      karEl.innerHTML = '<span style="color:var(--tx3)">Bu aralıkta karot kaydı yok.</span>';
    } else {
      karEl.innerHTML = KAROT_ALT.map(
        k => `<strong>${escHtml(k.label)}</strong>: ${karotAlt[k.key] ?? 0}`
      ).join(' · ');
    }
  }

  const gunRows = Object.entries(byGun)
    .filter(([d]) => d !== '—')
    .sort((a, b) => b[0].localeCompare(a[0]));
  const tbGun = document.getElementById('noz-tbody-gun');
  if (tbGun) {
    if (!gunRows.length) {
      tbGun.innerHTML =
        '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--tx3);font-size:12px">Tarihli kayıt yok.</td></tr>';
    } else {
      tbGun.innerHTML = gunRows
        .map(([gun, list]) => {
          const adet = list.reduce((s, d) => s + (parseInt(String(d.adet), 10) || 0), 0);
          const m3 = list.reduce((s, d) => s + (parseFloat(String(d.m3)) || 0), 0);
          const tc: Record<NumuneTurKey, number> = { beton: 0, karot: 0, celik: 0, diger: 0 };
          list.forEach(d => {
            tc[numuneTurOf(d)]++;
          });
          const lbl =
            /^\d{4}-\d{2}-\d{2}$/.test(gun)
              ? new Date(gun + 'T12:00:00').toLocaleDateString('tr-TR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : gun;
          return `<tr>
            <td style="font-family:var(--fm);font-size:12px">${escHtml(lbl)}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${list.length}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${adet}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${m3.toFixed(1)}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.beton}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.karot}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.celik}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.diger}</td>
          </tr>`;
        })
        .join('');
    }
  }

  const perRows = Object.entries(byPer).sort((a, b) => b[1].length - a[1].length);
  const tbPer = document.getElementById('noz-tbody-per');
  if (tbPer) {
    tbPer.innerHTML = perRows
      .map(([per, list]) => {
        const adet = list.reduce((s, d) => s + (parseInt(String(d.adet), 10) || 0), 0);
        const m3 = list.reduce((s, d) => s + (parseFloat(String(d.m3)) || 0), 0);
        const tc: Record<NumuneTurKey, number> = { beton: 0, karot: 0, celik: 0, diger: 0 };
        list.forEach(d => {
          tc[numuneTurOf(d)]++;
        });
        return `<tr>
          <td style="font-weight:600;font-size:12px">${escHtml(per)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${list.length}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${adet}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${m3.toFixed(1)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.beton}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.karot}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.celik}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${tc.diger}</td>
        </tr>`;
      })
      .join('');
  }
}

function numuneOzetCsv() {
  const w = window as any;
  const docs: any[] = w._nozDocs || [];
  const basEl = document.getElementById('noz-bas') as HTMLInputElement;
  const bitEl = document.getElementById('noz-bit') as HTMLInputElement;
  const bas = basEl?.value?.trim() || '';
  const bit = bitEl?.value?.trim() || '';
  const rows = bas || bit ? filterDocsByDateRange(docs, bas, bit) : docs.slice();
  const headers = [
    'tarih',
    'saat',
    'numuneTur',
    'karotAlt',
    'numuneEtiket',
    'yibf',
    'personel',
    'personeller',
    'adet',
    'm3',
    'durum',
    'bolum',
    'blok',
    'not',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [
    headers.join(','),
    ...rows.map(d =>
      [
        d.tarih,
        d.saat,
        numuneTurOf(d),
        d.karotAlt || '',
        d.numuneEtiket || '',
        d.yibf || '',
        d.personel || '',
        personelListesi(d).join('; '),
        d.adet ?? '',
        d.m3 ?? '',
        d.durum || '',
        d.bolum || '',
        d.blok || '',
        d.not || '',
      ]
        .map(esc)
        .join(',')
    ),
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `numune-ozet-${localDateISO()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function numuneOzetInit() {
  const w = window as any;
  const shell = document.getElementById('numune-ozet-shell');
  if (shell && !shell.querySelector('#noz-bas')) {
    shell.innerHTML = SHELL;
  }

  const bugun = localDateISO();
  const basEl = document.getElementById('noz-bas') as HTMLInputElement;
  const bitEl = document.getElementById('noz-bit') as HTMLInputElement;
  if (basEl && !basEl.value) basEl.value = addDaysISO(bugun, -6);
  if (bitEl && !bitEl.value) bitEl.value = bugun;

  w.numuneOzetYenile = () => renderOzet();
  w.numuneOzetHizli = (tip: string) => {
    const b = document.getElementById('noz-bas') as HTMLInputElement;
    const t = document.getElementById('noz-bit') as HTMLInputElement;
    const now = localDateISO();
    if (tip === 'son7') {
      if (b) b.value = addDaysISO(now, -6);
      if (t) t.value = now;
    } else if (tip === 'son30') {
      if (b) b.value = addDaysISO(now, -29);
      if (t) t.value = now;
    } else if (tip === 'buay') {
      if (b) b.value = now.slice(0, 7) + '-01';
      if (t) t.value = now;
    } else {
      if (b) b.value = '';
      if (t) t.value = '';
    }
    renderOzet();
  };
  w.numuneOzetCsv = numuneOzetCsv;

  basEl?.addEventListener('change', () => renderOzet());
  bitEl?.addEventListener('change', () => renderOzet());

  try {
    const scope = await resolveNumuneOzetScope(w);
    w.__NOZ_SELF_FILTER__ = scope.selfFilter;
    w.__NOZ_SAHA_NO_SELF__ = scope.sahaNoSelf;
    const raw: any[] = (await w.fsGet('beton_programi').catch(() => [])) || [];
    let docs = raw.filter((d: any) => !d._silindi);
    if (scope.sahaNoSelf) {
      docs = [];
    } else if (scope.selfFilter) {
      const ad = String(scope.selfAd || '').trim();
      if (ad) docs = docs.filter((d: any) => betonRowAssignedToPersonelAd(d, ad));
      else docs = [];
    }
    w._nozDocs = docs;
  } catch {
    w._nozDocs = [];
    w.__NOZ_SELF_FILTER__ = false;
    w.__NOZ_SAHA_NO_SELF__ = false;
  }
  renderOzet();
}

export default function NumuneOzetPage() {
  const init = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.querySelector('#numune-ozet-shell')) {
      el.innerHTML = '<div id="numune-ozet-shell" class="beton-page" style="padding:0"></div>';
    }
    const check = () => {
      if (typeof (window as any).fsGet === 'function') {
        if (!init.current) {
          init.current = true;
          numuneOzetInit();
        }
      } else setTimeout(check, 100);
    };
    check();
  }, []);

  return <div ref={ref} style={{ padding: '0 0 28px' }} suppressHydrationWarning />;
}
