'use client';
import { useEffect, useRef } from 'react';
import { DEFAULT_ADMIN_ROLE, readLabSession, roleIsSahaReadOnly } from '@/lib/lab-auth';
import { personelKayitMetni, personelListesi } from '@/lib/numune-shared';

function fmtD(s: string) {
  if (!s) return '—';
  const d = String(s).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split('-').reverse().join('.');
  return d;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type PerfTur = 'beton' | 'karot' | 'celik' | 'diger';

function perfNumuneTurOf(d: any): PerfTur {
  const t = String(d?.numuneTur ?? '').trim().toLowerCase();
  if (t === 'karot' || t === 'celik' || t === 'diger') return t;
  return 'beton';
}

const PERF_TUR_META: { key: PerfTur; emoji: string; label: string }[] = [
  { key: 'beton', emoji: '🏗️', label: 'Beton' },
  { key: 'karot', emoji: '🧱', label: 'Karot' },
  { key: 'celik', emoji: '🔩', label: 'Çelik' },
  { key: 'diger', emoji: '📋', label: 'Diğer' },
];

function perfTurBadge(d: any): string {
  const t = perfNumuneTurOf(d);
  const m = PERF_TUR_META.find(x => x.key === t)!;
  let sub = '';
  if (t === 'karot') {
    const ka = String(d.karotAlt || '').toLowerCase();
    if (ka === 'kentsel') sub = ' · kentsel';
    else if (ka === 'performans') sub = ' · performans';
  }
  return `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:var(--sur2);color:var(--tx2);white-space:nowrap">${m.emoji} ${m.label}${sub}</span>`;
}

export default function PerformansPage() {
  const init = useRef(false);

  useEffect(() => {
    if (init.current) return;
    const check = () => {
      if (typeof (window as any).fsGet === 'function') {
        init.current = true;
        perfInit();
      } else setTimeout(check, 150);
    };
    check();
  }, []);

  return (
    <div style={{ padding: '0 24px 28px' }}>
      {/* Başlık */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.3px' }}>Personel Performansı</div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 3 }}>Numune programı (beton, karot, çelik, diğer) — görev ve adet özeti</div>
      </div>

      {/* Filtreler */}
      <div
        id="prf-filtre-wrap"
        style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', background: 'var(--sur2)', border: '1px solid var(--bdr)',
        borderRadius: 14, marginBottom: 20,
      }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>Başlangıç</label>
          <input type="date" id="prf-bas" style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--sur)', color: 'var(--tx)', fontSize: 12 }} onChange={() => (window as any).perfFiltrele?.()} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>Bitiş</label>
          <input type="date" id="prf-bit" style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--sur)', color: 'var(--tx)', fontSize: 12 }} onChange={() => (window as any).perfFiltrele?.()} />
        </div>
        <button className="btn btn-g" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => (window as any).perfHizliFiltre?.('bu-ay')}>Bu Ay</button>
        <button className="btn btn-g" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => (window as any).perfHizliFiltre?.('gecen-ay')}>Geçen Ay</button>
        <button className="btn btn-g" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => (window as any).perfHizliFiltre?.('son-30')}>Son 30 Gün</button>
        <button className="btn btn-g" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => (window as any).perfHizliFiltre?.('tumu')}>Tümü</button>
        <div style={{ flex: 1 }} />
        <span id="prf-info" style={{ fontSize: 11, color: 'var(--tx3)' }}>Yükleniyor...</span>
      </div>

      {/* Özet kartlar */}
      <div id="prf-ozet" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }} />

      {/* Personel bazlı kart listesi */}
      <div id="prf-personel-kartlar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginBottom: 20 }} />

      {/* Detay tablosu */}
      <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: 16 }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--bdr)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>📋 Numune Detay Tablosu</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="prf-arama" type="text" placeholder="Ara (personel, yibf, tarih...)"
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--sur2)', color: 'var(--tx)', fontSize: 12, width: 240 }}
              onInput={() => (window as any).perfTablo?.()} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead id="prf-thead">
              <tr style={{ background: 'var(--sur2)' }}>
                {['Tarih','Tür','Personel','YİBF','Yapı Sahibi','Yapı Denetim','Bölüm / Blok','m³','Adet','Durum'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--tx3)', fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bdr)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody id="prf-tbody">
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sayfa mantığı ─────────────────────────────────────────────────────────
function perfNormName(x: string) {
  return String(x || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function perfInit() {
  const w = window as any;
  w.__PERF_SAHA_READONLY = false;
  w.__PERF_SAHA_AD = '';
  const sess = readLabSession();
  let restrictSelf = !!(sess?.readOnly && sess.personelId);
  if (!restrictSelf && sess?.personelId && typeof w.fsGet === 'function') {
    try {
      const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const meU = users.find((x: any) => String(x.id) === String(sess.userId));
      const rm: Record<string, any> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r;
      });
      if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
      const rd = meU ? rm[meU.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : null;
      if (rd && roleIsSahaReadOnly(rd)) restrictSelf = true;
    } catch (_) {
      /* ignore */
    }
  }
  if (restrictSelf && sess?.personelId && typeof w.fsGet === 'function') {
    const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
    const me = staff.find((x: any) => String(x.id) === String(sess.personelId));
    if (me?.ad) {
      w.__PERF_SAHA_AD = String(me.ad).trim();
      w.__PERF_SAHA_READONLY = true;
    }
  }

  // Default: bu ay
  const bugun = new Date().toISOString().slice(0, 10);
  const ayBas = bugun.slice(0, 7) + '-01';
  const basEl = document.getElementById('prf-bas') as HTMLInputElement;
  const bitEl = document.getElementById('prf-bit') as HTMLInputElement;
  if (basEl) basEl.value = ayBas;
  if (bitEl) bitEl.value = bugun;

  // Tüm beton programı verisi
  const docs: any[] = (await w.fsGet('beton_programi').catch(() => [])) || [];
  w._perfDocs = docs.filter((d: any) => !d._silindi);

  w.perfHizliFiltre = (tip: string) => {
    const now = new Date().toISOString().slice(0, 10);
    const basElL = document.getElementById('prf-bas') as HTMLInputElement;
    const bitElL = document.getElementById('prf-bit') as HTMLInputElement;
    if (tip === 'bu-ay') { if (basElL) basElL.value = now.slice(0, 7) + '-01'; if (bitElL) bitElL.value = now; }
    else if (tip === 'gecen-ay') {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
      const gb = d.toISOString().slice(0, 7) + '-01';
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      if (basElL) basElL.value = gb; if (bitElL) bitElL.value = lastDay;
    } else if (tip === 'son-30') {
      if (basElL) basElL.value = addDays(now, -30); if (bitElL) bitElL.value = now;
    } else {
      if (basElL) basElL.value = ''; if (bitElL) bitElL.value = '';
    }
    w.perfFiltrele();
  };

  w.perfFiltrele = () => perfRender();
  w._perfArama = '';
  w.perfTablo = () => {
    w._perfArama = (document.getElementById('prf-arama') as HTMLInputElement)?.value?.toLowerCase() || '';
    perfRender();
  };

  if (w.__PERF_SAHA_READONLY) {
    const fw = document.getElementById('prf-filtre-wrap');
    if (fw) fw.style.display = 'flex';
    const ar = document.getElementById('prf-arama') as HTMLInputElement | null;
    if (ar) {
      ar.disabled = false;
      ar.placeholder = 'Kendi kayıtlarınızda ara…';
    }
  }

  perfRender();
}

function perfRender() {
  const w = window as any;
  const tum: any[] = w._perfDocs || [];

  const basEl = document.getElementById('prf-bas') as HTMLInputElement;
  const bitEl = document.getElementById('prf-bit') as HTMLInputElement;
  const bas = basEl?.value || '';
  const bit = bitEl?.value || '';

  let filtered = tum.filter(d => {
    const t = d.tarih || '';
    if (bas && t < bas) return false;
    if (bit && t > bit) return false;
    return true;
  });

  if (w.__PERF_SAHA_READONLY && w.__PERF_SAHA_AD) {
    const adn = perfNormName(w.__PERF_SAHA_AD);
    filtered = filtered.filter(d => {
      const people = personelListesi(d);
      if (people.some(p => perfNormName(p) === adn)) return true;
      return perfNormName(String(d.personel || '')) === adn;
    });
  }

  const info = document.getElementById('prf-info');
  if (info) {
    info.textContent = w.__PERF_SAHA_READONLY
      ? `Yalnızca kendi kayıtlarınız · ${filtered.length} kayıt`
      : `${filtered.length} kayıt`;
  }

  // ── Personel bazlı gruplama (çoklu görevli: kayıt her isim altında sayılır) ──
  const byPer: Record<string, any[]> = {};
  filtered.forEach(d => {
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
  });

  const perAdlar = Object.keys(byPer).sort((a, b) => byPer[b].length - byPer[a].length);
  const toplamAdet = filtered.reduce((s, d) => s + (parseInt(d.adet) || 0), 0);
  const toplamM3   = filtered.reduce((s, d) => s + (parseFloat(d.m3) || 0), 0);
  const turSay: Record<PerfTur, number> = { beton: 0, karot: 0, celik: 0, diger: 0 };
  filtered.forEach(d => {
    turSay[perfNumuneTurOf(d)]++;
  });
  const turOzet = PERF_TUR_META.map(m => `${m.emoji} ${turSay[m.key]}`).join(' · ');

  // ── Özet kartlar ──────────────────────────────────────────────
  const ozetEl = document.getElementById('prf-ozet');
  if (ozetEl) {
    ozetEl.innerHTML = [
      { lbl: 'Toplam kayıt', val: filtered.length, renk: 'var(--acc)', alt: turOzet },
      { lbl: 'Toplam Numune (adet)', val: toplamAdet, renk: 'var(--grn)', alt: 'planlanan / girilen adet' },
      { lbl: 'Toplam m³', val: toplamM3.toFixed(1), renk: 'var(--amb)', alt: 'beton satırları' },
      { lbl: 'Aktif Personel', val: perAdlar.filter(p => p !== '(Atanmamış)').length, renk: 'var(--pur)', alt: 'kişi' },
    ].map(k => `
      <div class="card" style="padding:16px 20px;border-left:3px solid ${k.renk}">
        <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${k.lbl}</div>
        <div style="font-size:30px;font-weight:800;color:${k.renk};font-family:var(--fd)">${k.val}</div>
        <div style="font-size:11px;color:var(--tx3);margin-top:4px;line-height:1.35">${k.alt}</div>
      </div>
    `).join('');
  }

  // ── Personel kartları ──────────────────────────────────────────
  const kartEl = document.getElementById('prf-personel-kartlar');
  if (kartEl) {
    if (!perAdlar.length) {
      kartEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px;grid-column:1/-1">Bu aralıkta kayıt bulunamadı.</div>';
    } else {
      kartEl.innerHTML = perAdlar.map(per => {
        const rows = byPer[per];
        const adet  = rows.reduce((s, d) => s + (parseInt(d.adet) || 0), 0);
        const m3    = rows.reduce((s, d) => s + (parseFloat(d.m3) || 0), 0);
        const dates = [...new Set(rows.map(d => d.tarih))].sort();
        const gunler = dates.length;
        const isAtanmamis = per === '(Atanmamış)';
        const av = per !== '(Atanmamış)' ? per.split(' ').map((s: string) => s[0]).join('').slice(0, 2).toUpperCase() : '?';

        // Son 5 döküm
        const son5 = [...rows].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).slice(0, 5);

        return `<div class="card" style="padding:0;overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:${isAtanmamis?'var(--sur2)':'rgba(59,130,246,.2)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${isAtanmamis?'var(--tx3)':'var(--acc2)'};flex-shrink:0">${av}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:${isAtanmamis?'var(--tx3)':'var(--tx)'}">${per}</div>
              <div style="font-size:11px;color:var(--tx3);margin-top:2px">${gunler} farklı gün</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--bdr)">
            <div style="padding:12px;text-align:center;border-right:1px solid var(--bdr)">
              <div style="font-size:22px;font-weight:800;color:var(--grn)">${adet}</div>
              <div style="font-size:10px;color:var(--tx3);margin-top:2px;font-weight:600;text-transform:uppercase">Numune</div>
            </div>
            <div style="padding:12px;text-align:center;border-right:1px solid var(--bdr)">
              <div style="font-size:22px;font-weight:800;color:var(--amb)">${m3.toFixed(1)}</div>
              <div style="font-size:10px;color:var(--tx3);margin-top:2px;font-weight:600;text-transform:uppercase">m³</div>
            </div>
            <div style="padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:var(--acc)">${rows.length}</div>
              <div style="font-size:10px;color:var(--tx3);margin-top:2px;font-weight:600;text-transform:uppercase">Gittiği iş</div>
            </div>
          </div>
          <div style="padding:10px 14px">
            <div style="font-size:10px;color:var(--tx3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Son Dökümleri</div>
            ${son5.map(d => `
              <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);flex-wrap:wrap">
                <span style="font-size:11px;color:var(--tx3);flex-shrink:0;font-family:var(--fm)">${fmtD(d.tarih)}</span>
                ${perfTurBadge(d)}
                <span style="font-size:11px;color:var(--acc2);font-family:var(--fm);flex-shrink:0">${d.yibf||'—'}</span>
                <span style="font-size:11px;color:var(--tx2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:120px">${[d.numuneEtiket, d.bolum, d.blok].filter(Boolean).join(' · ') || '—'}</span>
                <span style="font-size:11px;color:var(--grn);font-weight:700;flex-shrink:0">${d.adet||0} ad</span>
              </div>
            `).join('')}
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Detay tablosu ──────────────────────────────────────────────
  const ara = w._perfArama || '';
  const tabloRows = [...filtered]
    .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))
    .filter(
      d =>
        !ara ||
        [
          personelKayitMetni(d),
          d.personel,
          d.yibf,
          d.tarih,
          d.yapiSahibi,
          d.yapiDenetim,
          d.bolum,
          d.numuneEtiket,
          d.numuneTur,
          d.karotAlt,
        ]
          .join(' ')
          .toLowerCase()
          .includes(ara)
    );

  const tbody = document.getElementById('prf-tbody');
  if (!tbody) return;

  if (!tabloRows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Kayıt bulunamadı.</td></tr>`;
    return;
  }

  const DURUM_RENK: Record<string, string> = {
    bekliyor: 'var(--tx3)', pompa_yolda: 'var(--amb)', pompa_geldi: 'var(--acc2)', mikser_geldi: '#a78bfa', tamamlandi: 'var(--grn)',
  };
  const DURUM_LBL: Record<string, string> = {
    bekliyor: 'Bekliyor', pompa_yolda: 'Pompa Yolda', pompa_geldi: 'Pompa Geldi', mikser_geldi: 'Mikser Geldi', tamamlandi: 'Tamamlandı',
  };

  tbody.innerHTML = tabloRows.map((d, i) => {
    const stripe = i % 2 !== 0 ? 'background:rgba(255,255,255,.02)' : '';
    const durumClr = DURUM_RENK[d.durum] || 'var(--tx3)';
    const durumLbl = DURUM_LBL[d.durum] || d.durum || '—';
    return `<tr style="${stripe}">
      <td style="padding:8px 12px;white-space:nowrap;font-family:var(--fm)">${fmtD(d.tarih)} ${d.saat ? d.saat.slice(0,5) : ''}</td>
      <td style="padding:8px 12px;vertical-align:middle">${perfTurBadge(d)}</td>
      <td style="padding:8px 12px;font-weight:600;color:var(--tx);line-height:1.35">${personelKayitMetni(d) || '<em style="color:var(--tx3)">Atanmamış</em>'}</td>
      <td style="padding:8px 12px;font-family:var(--fm);color:var(--acc2)">${d.yibf || '—'}</td>
      <td style="padding:8px 12px">${d.yapiSahibi || '—'}</td>
      <td style="padding:8px 12px;color:var(--tx2)">${d.yapiDenetim || '—'}</td>
      <td style="padding:8px 12px">${[d.bolum, d.blok].filter(Boolean).join(' / ') || '—'}</td>
      <td style="padding:8px 12px;text-align:right;color:var(--amb)">${d.m3 || '—'}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:var(--grn)">${d.adet || '—'}</td>
      <td style="padding:8px 12px"><span style="font-size:10px;font-weight:700;color:${durumClr}">${durumLbl}</span></td>
    </tr>`;
  }).join('');
}
