'use client';
import { useEffect, useRef } from 'react';
import { pickEbistrYibfGroupKey, resolveYibfForImportRow } from '@/lib/yibf-utils';
import {
  createRaporDefterYibfLookup,
  filterRaporStorageRows,
  findLatestRaporRowForYibf,
  mergeRaporMaps,
} from '@/lib/rapor-defter-lookup';
import { fetchRaporDefteriWithFallback, syncRaporDefteriRemote } from '@/lib/rapor-defteri-remote';

/* ──────────────────────────────────────────────────────────────────
   Tüm HTML istemci tarafında (useEffect) inject edilir.
   Server hiçbir HTML render etmez → hydration hatası imkânsız.
────────────────────────────────────────────────────────────────── */

const FILTER_STYLE = 'padding:4px 6px;border-radius:4px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx);font-size:10px;width:100%;box-sizing:border-box';

const COL_LABELS = [
  'TİP','YIL','KOD','NMN.ALINIŞ TARİHİ','LAB.GELİŞ TARİHİ','DENEYİ TALEP EDEN',
  'YAPI DENETİM','YAPI SAHİBİ','İDARE','PAFTA','ADA','PARSEL','RUHSAT NO','YİBF',
  'YAPI BÖLÜMÜ','BLOK','ADRES','m³','ADET','7','28','CİNS','SINIFI','BETON','LAB.',
  'DENEY TARİHLERİ (7 GÜNLÜK)','DENEY TARİHLERİ (28 GÜNLÜK)','BRN 7','NO','BRN 28','NO','MÜTEAHHİT','FİYAT'
];

const COL_KEYS = [
  'tip','yil','kod','alinTarih','labTarih','talepEden','yd','sahip','idare','pafta',
  'ada','parsel','ruhsatNo','yibf','bolum','blok','adres','m3','adet','gun7','gun28',
  'cins','sinif','beton','lab','deney7','deney28','brn7','no7','brn28','no28','muteahhit','fiyat'
];

const COL_WIDTHS = [
  '60px','60px','90px','110px','110px','160px','160px','160px','100px','70px',
  '60px','70px','90px','110px','120px','60px','180px','60px','60px','50px','50px',
  '80px','100px','120px','70px','130px','130px','110px','60px','110px','60px','180px','90px'
];
// Summed left positions for sticky columns: 0, 60, 120

const XL_WIDTHS = [
  6,6,10,14,14,22,22,22,12,8,
  7,8,12,12,16,7,22,7,7,5,5,
  8,8,14,7,16,16,14,7,14,7,22,10
];

// ── Excel column header → iç key eşlemesi ──────────────────────
function mapRowKeys(row: Record<string, any>): Record<string, string> {
  const s = (v: any) => String(v ?? '').trim();
  return {
    tip:       s(row['TİP']   || row['TIP']   || row['Tip']   || ''),
    yil:       s(row['YIL']   || row['Yıl']   || ''),
    kod:       s(row['KOD']   || row['Kod']   || ''),
    alinTarih: s(row['NMN.ALINIŞ TARİHİ'] || row['ALINIŞ TARİHİ'] || row['Alınış Tarihi'] || ''),
    labTarih:  s(row['LAB.GELİŞ TARİHİ']  || row['Lab Geliş'] || ''),
    talepEden: s(row['DENEYİ TALEP EDEN']  || row['Talep Eden'] || ''),
    yd:        s(row['YAPI DENETİM']        || row['Yapı Denetim'] || ''),
    sahip:     s(row['YAPI SAHİBİ']         || row['Yapı Sahibi'] || ''),
    idare:     s(row['İDARE']  || row['IDARE']  || row['Idare']  || ''),
    pafta:     s(row['PAFTA']  || ''),
    ada:       s(row['ADA']    || ''),
    parsel:    s(row['PARSEL'] || ''),
    ruhsatNo:  s(row['RUHSAT NO'] || row['Ruhsat No'] || ''),
    yibf:      s(row['YİBF']  || row['YIBF']  || ''),
    bolum:     s(row['YAPI BÖLÜMÜ'] || row['YAPI BOLUMU'] || ''),
    blok:      s(row['BLOK']  || row['Blok']  || ''),
    adres:     s(row['ADRES'] || row['Adres'] || ''),
    m3:        s(row['m³']    || row['M3']    || row['m3']    || ''),
    adet:      s(row['ADET']  || row['Adet']  || ''),
    gun7:      s(row['7']     || ''),
    gun28:     s(row['28']    || ''),
    cins:      s(row['CİNS']  || row['CINS']  || row['Cins']  || ''),
    sinif:     s(row['SINIFI'] || row['SINIF'] || row['Sınıf'] || ''),
    beton:     s(row['BETON'] || row['Beton'] || ''),
    lab:       s(row['LAB.']  || row['Lab']   || ''),
    deney7:    s(row['DENEY TARİHLERİ (7 GÜNLÜK)']  || row['7 Günlük']  || ''),
    deney28:   s(row['DENEY TARİHLERİ (28 GÜNLÜK)'] || row['28 Günlük'] || ''),
    brn7:      s(row['BRN 7'] || ''),
    no7:       s(row['NO']    || ''),
    brn28:     s(row['BRN 28'] || ''),
    no28:      s(row['NO']    || ''),
    muteahhit: s(row['MÜTEAHHİT'] || row['MUTEAHHIT'] || ''),
    fiyat:     s(row['FİYAT'] || row['FIYAT'] || ''),
  };
}

const PAGE_SIZE = 50;

// ── Tarih formatlama ────────────────────────────────────────────
function fmtD(s: string): string {
  if (!s) return '';
  const d = String(s).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split('-').reverse().join('.');
  return d || '';
}

/** HTML date input sadece YYYY-MM-DD kabul eder; Excel/elle girilen GG.AA.YYYY vb. boş görünür. */
function normalizeDateForInput(s: unknown): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s|$|[Tt])/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function modalDateField(
  id: string,
  lbl: string,
  rawVal: unknown,
  inpFn: (id: string, lbl: string, val: any, type?: string, extra?: string) => string
): string {
  const raw = String(rawVal ?? '').trim();
  const norm = normalizeDateForInput(raw);
  if (norm) return inpFn(id, lbl, norm, 'date');
  if (raw) return inpFn(id, `${lbl} (metin)`, raw, 'text');
  return inpFn(id, lbl, '', 'date');
}

// ── Tablo render ────────────────────────────────────────────────
function renderRaporTable(rows: any[]) {
  const w = window as any;
  const tbody = document.getElementById('rapor-liste');
  if (!tbody) return;

  const reversed = [...rows].reverse();
  const total = reversed.length;
  const page = w._raporPage || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  if (safePage !== page) w._raporPage = safePage;

  const pageRows = reversed.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const info = document.getElementById('rapor-page-info');
  const prev = document.getElementById('rapor-prev') as HTMLButtonElement | null;
  const next = document.getElementById('rapor-next') as HTMLButtonElement | null;
  if (info) {
    const from = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
    const to = Math.min((safePage + 1) * PAGE_SIZE, total);
    info.textContent = total === 0 ? 'Kayıt yok' : `${from}–${to} / ${total} kayıt (Sayfa ${safePage + 1}/${totalPages})`;
  }
  if (prev) prev.disabled = safePage === 0;
  if (next) next.disabled = safePage >= totalPages - 1;

  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="33" style="padding:48px;text-align:center;color:var(--tx3);font-size:13px">Kayıt bulunamadı.</td></tr>`;
    return;
  }

  const TD = 'padding:6px 8px;font-size:11px;white-space:nowrap;border-bottom:1px solid var(--bdr)';
  const empty = `<span style="color:var(--tx3);font-size:10px;opacity:.5">—</span>`;
  const cv = (v: string, st = '') => v ? `<span${st ? ` style="${st}"` : ''}>${v}</span>` : empty;
  const dateCell = (v: string) => { const d = fmtD(v); return d ? `<span style="color:var(--tx2)">${d}</span>` : empty; };

  const globalBase = safePage * PAGE_SIZE;
  tbody.innerHTML = pageRows.map((r, i) => {
    const gIdx   = globalBase + i; // reversed array'deki gerçek index
    const stripe = i % 2 !== 0 ? 'background:rgba(255,255,255,.022)' : '';
    const tipBg  = r.tip === 'B' ? 'rgba(59,130,246,.15)'  : r.tip === 'C' ? 'rgba(34,197,94,.15)'   : 'rgba(251,191,36,.15)';
    const tipClr = r.tip === 'B' ? 'var(--acc2)'           : r.tip === 'C' ? 'var(--grn)'            : 'var(--amb)';
    const tipBadge = r.tip
      ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:${tipBg};color:${tipClr}">${r.tip}</span>`
      : empty;
    const durumDot = r._deney?.durum === 'UYGUN'
      ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--grn);margin-left:4px;vertical-align:middle" title="Deney: UYGUN"></span>`
      : r._deney?.durum === 'UYGUNSUZ'
      ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--red);margin-left:4px;vertical-align:middle" title="Deney: UYGUNSUZ"></span>`
      : '';

    // Sticky cell style — opak arka plan zorunlu (scroll'da içerik görünmesin)
    const stickyBg = i % 2 !== 0 ? '#111827' : '#0F172A';
    const STICKY_TD = `position:sticky;z-index:5;background:${stickyBg};border-right:1px solid var(--bdr);`;

    return `<tr style="${stripe};cursor:pointer" class="rapor-row" onclick="raporDeneyAc(${gIdx})">
      <td style="${TD};text-align:center;left:0;${STICKY_TD}">${tipBadge}</td>
      <td style="${TD};font-family:var(--fm);text-align:center;color:var(--tx3);left:60px;${STICKY_TD}">${cv(r.yil)}</td>
      <td style="${TD};font-family:var(--fm);font-weight:700;color:var(--acc);left:120px;${STICKY_TD}">${cv(r.kod)}${durumDot}</td>
      <td style="${TD}">${dateCell(r.alinTarih)}</td>
      <td style="${TD}">${dateCell(r.labTarih)}</td>
      <td style="${TD}">${cv(r.talepEden)}</td>
      <td style="${TD}">${cv(r.yd)}</td>
      <td style="${TD};font-weight:500">${cv(r.sahip)}</td>
      <td style="${TD}">${cv(r.idare)}</td>
      <td style="${TD};text-align:center">${cv(r.pafta)}</td>
      <td style="${TD};text-align:center">${cv(r.ada)}</td>
      <td style="${TD};text-align:center">${cv(r.parsel)}</td>
      <td style="${TD}">${cv(r.ruhsatNo)}</td>
      <td style="${TD};font-family:var(--fm);font-weight:700;color:var(--acc2)">${cv(r.yibf)}</td>
      <td style="${TD}">${cv(r.bolum)}</td>
      <td style="${TD};text-align:center">${cv(r.blok)}</td>
      <td style="${TD}">${cv(r.adres)}</td>
      <td style="${TD};text-align:right;color:var(--amb);font-weight:600">${cv(r.m3)}</td>
      <td style="${TD};text-align:center">${cv(r.adet)}</td>
      <td style="${TD};text-align:center">${cv(r.gun7)}</td>
      <td style="${TD};text-align:center">${cv(r.gun28)}</td>
      <td style="${TD};text-align:center">${cv(r.cins)}</td>
      <td style="${TD};font-weight:700;color:var(--grn)">${cv(r.sinif)}</td>
      <td style="${TD}">${cv(r.beton)}</td>
      <td style="${TD};text-align:center">${cv(r.lab)}</td>
      <td style="${TD}">${dateCell(r.deney7)}</td>
      <td style="${TD}">${dateCell(r.deney28)}</td>
      <td style="${TD};font-family:var(--fm);color:var(--pur)">${cv(r.brn7)}</td>
      <td style="${TD};text-align:center">${cv(r.no7)}</td>
      <td style="${TD};font-family:var(--fm);color:var(--pur)">${cv(r.brn28)}</td>
      <td style="${TD};text-align:center">${cv(r.no28)}</td>
      <td style="${TD}">${cv(r.muteahhit)}</td>
      <td style="${TD};text-align:right;color:var(--grn);font-weight:600">${cv(r.fiyat)}</td>
    </tr>`;
  }).join('');
}

// ── Veri çekme ──────────────────────────────────────────────────
const isEmpty = (v: any) => {
  const s = String(v ?? '').trim();
  return !s || /^[-—–]+$/.test(s);
};

async function raporYukle() {
  const w = window as any;
  const durum = document.getElementById('rapor-durum');
  try {
    const { rows, map } = await fetchRaporDefteriWithFallback(window);
    w._raporRows = rows;
    w._raporMap = map;
    w._raporFiltered = null;
    w._raporPage = 0;
    renderRaporTable(rows);
    const cnt = document.getElementById('rapor-cnt');
    if (cnt) cnt.textContent = String(rows.length);
    if (durum) durum.textContent = rows.length ? `${rows.length} kayıt mevcut` : 'Kayıt yok — Excel yükleyin';
    w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
  } catch {
    if (durum) durum.textContent = 'Veriler yüklenemedi';
  }
}

// ── Tüm sayfa mantığı ───────────────────────────────────────────
async function raporPageInit() {
  const w = window as any;
  w._raporPage = 0;
  await raporYukle();

  // Yardımcılar
  const nextKod = (rows: any[]): string => {
    const yr = new Date().getFullYear();
    const pfix = `${yr}-`;
    let max = 0;
    rows.forEach((r: any) => {
      if ((r.kod || '').startsWith(pfix)) {
        const n = parseInt((r.kod as string).slice(pfix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    return `${yr}-${String(max + 1).padStart(3, '0')}`;
  };

  const findRaporInfo = (yibf: string, rows: any[]): Record<string, string> => {
    if (!yibf) return {};
    const m = findLatestRaporRowForYibf(rows, yibf);
    if (!m) return {};
    return {
      sahip: String(m.sahip ?? ''),
      yd: String(m.yd ?? ''),
      muteahhit: String(m.muteahhit ?? ''),
      adres: String(m.adres ?? ''),
      pafta: String(m.pafta ?? ''),
      ada: String(m.ada ?? ''),
      parsel: String(m.parsel ?? ''),
      ruhsatNo: String(m.ruhsatNo ?? ''),
      idare: String(m.idare ?? ''),
    };
  };

  // ── Excel yükleme ─────────────────────────────────────────────
  w.raporXlsxYukle = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    const durum = document.getElementById('rapor-durum');
    if (durum) durum.textContent = 'Okunuyor...';

    if (!w.XLSX) {
      if (durum) durum.textContent = 'XLSX yükleniyor...';
      await new Promise<void>(res => { const chk = () => (w.XLSX ? res() : setTimeout(chk, 200)); chk(); });
    }

    try {
      const buf = await file.arrayBuffer();
      const wb  = w.XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = w.XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

      const rows = filterRaporStorageRows(
        rawRows.map(raw => {
          const mapped = mapRowKeys(raw);
          (Object.keys(mapped) as (keyof typeof mapped)[]).forEach(k => {
            if (isEmpty(mapped[k])) (mapped as any)[k] = '';
          });
          return mapped;
        })
      ) as any[];

      const map = mergeRaporMaps({}, rows);

      const { cloudOk } = await syncRaporDefteriRemote(w, rows, map);
      w._raporRows = rows; w._raporMap = map; w._raporFiltered = null; w._raporPage = 0;
      renderRaporTable(rows);
      const cnt = document.getElementById('rapor-cnt'); if (cnt) cnt.textContent = String(rows.length);
      if (durum) durum.textContent = `${rows.length} kayıt yüklendi`;
      w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
      if (cloudOk) w.toast?.(`${rows.length} kayıt kaydedildi`, 'success');
      else w.toast?.(`${rows.length} kayıt bu oturumda güncellendi; ortak kopya yazılamadı`, 'warn');
    } catch (e: any) {
      if (durum) durum.textContent = 'Hata: ' + (e.message || 'Okunamadı');
      w.toast?.('Excel okunamadı: ' + e.message, 'error');
    }
    input.value = '';
  };

  // ── Excel dışa aktarma ────────────────────────────────────────
  w.raporExcelIndir = () => {
    if (!w.XLSX) { w.toast?.('XLSX hazır değil', 'error'); return; }
    const rows = w._raporFiltered || w._raporRows || [];
    const headers = ['TİP','YIL','KOD','NMN.ALINIŞ TARİHİ','LAB.GELİŞ TARİHİ','DENEYİ TALEP EDEN','YAPI DENETİM','YAPI SAHİBİ','İDARE','PAFTA','ADA','PARSEL','RUHSAT NO','YİBF','YAPI BÖLÜMÜ','BLOK','ADRES','m³','ADET','7','28','CİNS','SINIFI','BETON','LAB.','DENEY TARİHLERİ (7 GÜNLÜK)','DENEY TARİHLERİ (28 GÜNLÜK)','BRN 7','NO','BRN 28','NO','MÜTEAHHİT','FİYAT'];
    const keys  = ['tip','yil','kod','alinTarih','labTarih','talepEden','yd','sahip','idare','pafta','ada','parsel','ruhsatNo','yibf','bolum','blok','adres','m3','adet','gun7','gun28','cins','sinif','beton','lab','deney7','deney28','brn7','no7','brn28','no28','muteahhit','fiyat'];
    const data = [headers, ...[...rows].reverse().map((r: any) => keys.map(k => r[k] || ''))];
    const ws = w.XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = XL_WIDTHS.map(wch => ({ wch }));
    // Freeze ilk satır (başlık)
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };
    // Autofilter — 33 sütun için doğru aralık (SheetJS encode_col kullan)
    const lastCol = w.XLSX.utils.encode_col(keys.length - 1); // 'AG'
    ws['!autofilter'] = { ref: `A1:${lastCol}1` };
    const wb2 = w.XLSX.utils.book_new();
    w.XLSX.utils.book_append_sheet(wb2, ws, 'Rapor Defteri');
    w.XLSX.writeFile(wb2, 'rapor-defteri.xlsx');
    w.toast?.(`${rows.length} kayıt indirildi`, 'success');
  };

  // ── Filtre ────────────────────────────────────────────────────
  w.raporFiltrele = () => {
    const rows: any[] = w._raporRows || [];
    const filters: Record<string, string> = {};
    COL_KEYS.forEach(k => { filters[k] = (document.getElementById(`rf-${k}`) as HTMLInputElement)?.value.toLowerCase() || ''; });
    const filtered = rows.filter(r => COL_KEYS.every(k => !filters[k] || String(r[k] || '').toLowerCase().includes(filters[k])));
    w._raporFiltered = filtered; w._raporPage = 0;
    renderRaporTable(filtered);
  };

  w.raporFiltreTemizle = () => {
    COL_KEYS.forEach(k => { const el = document.getElementById(`rf-${k}`) as HTMLInputElement; if (el) el.value = ''; });
    w._raporFiltered = null; w._raporPage = 0;
    renderRaporTable(w._raporRows || []);
  };

  // ── Sayfalama ─────────────────────────────────────────────────
  w.raporGoTo = (delta: number) => {
    const rows  = w._raporFiltered || w._raporRows || [];
    const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    w._raporPage = Math.max(0, Math.min(total - 1, (w._raporPage || 0) + delta));
    renderRaporTable(rows);
  };

  // ── EBİSTR paneli ─────────────────────────────────────────────
  const buildEbistrPanel = (tarihBas: string, tarihBit: string) => {
    const tum: any[] = w._betonEbistrNumuneler || w.ebistrNumuneler || [];
    const numuneler = tum.filter((n: any) => {
      if (!tarihBas && !tarihBit) return true;
      const t = (n.alinisDate || n.alinisZamani || '').slice(0, 10);
      if (tarihBas && t < tarihBas) return false;
      if (tarihBit && t > tarihBit) return false;
      return true;
    });

    const groups: Record<string, any[]> = {};
    numuneler.forEach((n: any) => {
      const k = pickEbistrYibfGroupKey(n);
      if (!groups[k]) groups[k] = [];
      groups[k].push(n);
    });
    const existingRows: any[] = w._raporRows || [];

    let html = `<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);background:var(--sur)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--tx)">📋 EBİSTR'den Aktar</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:2px">${numuneler.length} numune · ${Object.keys(groups).length} YİBF</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tx3);cursor:pointer">
              <input type="checkbox" id="rapor-chk-all" checked onchange="document.querySelectorAll('.rapor-pending-chk').forEach(c=>c.checked=this.checked)">
              Tümünü Seç
            </label>
            <button class="btn btn-p" onclick="raporEbistrImport()" style="font-size:12px;padding:6px 16px">✓ Seçilenleri Ekle</button>
            <button class="btn btn-g" onclick="document.getElementById('rapor-pending-panel').style.display='none'" style="font-size:12px;padding:6px 14px">✕</button>
          </div>
        </div>
        <!-- Tarih filtresi -->
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--tx3)">Tarih aralığı:</span>
          <input type="date" id="ebistr-tarih-bas" value="${tarihBas}" style="padding:4px 8px;border-radius:6px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx);font-size:11px" onchange="raporEbistrFiltrele()">
          <span style="font-size:11px;color:var(--tx3)">→</span>
          <input type="date" id="ebistr-tarih-bit" value="${tarihBit}" style="padding:4px 8px;border-radius:6px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx);font-size:11px" onchange="raporEbistrFiltrele()">
          <button class="btn btn-g" style="font-size:11px;padding:4px 10px" onclick="raporEbistrFiltrele('','')">Tümü</button>
        </div>
      </div>`;

    Object.entries(groups).forEach(([yibf, items]) => {
      const info = findRaporInfo(yibf === '__YIBFSIZ__' || yibf.startsWith('__BRN__') ? '' : yibf, existingRows);
      const totalM3   = items.reduce((s: number, n: any) => s + (parseFloat(n.m3 || n.miktar || '0') || 0), 0);
      const totalAdet = items.reduce((s: number, n: any) => s + (parseInt(n.numuneSayisi || n.adet || '1') || 0), 0);
      const yd    = items[0]?.yapiDenetim || info.yd || '—';
      const sahip = info.sahip || items[0]?.yapiSahibi || '—';
      const mut   = info.muteahhit || items[0]?.muteahhit || '—';
      const dispY = yibf === '__YIBFSIZ__'
        ? `<em style="color:var(--tx3)">YİBF'siz</em>`
        : yibf.startsWith('__BRN__')
          ? `<span style="font-family:var(--fm);color:var(--acc2)">BRN ${String(yibf.slice(7)).replace(/</g, '&lt;')}</span>`
          : `<span style="font-family:var(--fm);color:var(--acc2)">${String(yibf).replace(/</g, '&lt;')}</span>`;

      html += `<div style="border-bottom:1px solid var(--bdr)">
        <div style="padding:10px 18px;display:flex;align-items:center;gap:10px;background:var(--sur);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <input type="checkbox" class="rapor-yibf-chk" data-yibf="${yibf}" checked onchange="document.querySelectorAll('.rapor-pending-chk[data-group=\\'${yibf}\\']').forEach(c=>c.checked=this.checked)" onclick="event.stopPropagation()">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="font-size:12px;font-weight:700">${dispY}</div>
              <div style="font-size:11px;color:var(--tx3)">${yd}</div>
              <div style="font-size:11px;color:var(--tx3)">Sahip: ${sahip}</div>
              <div style="font-size:11px;color:var(--tx3)">Müt: ${mut}</div>
            </div>
          </div>
          <div style="display:flex;gap:16px;font-size:11px;text-align:right;flex-shrink:0">
            <div><div style="color:var(--tx3)">Numune</div><div style="font-weight:700;color:var(--tx)">${totalAdet} adet</div></div>
            ${totalM3 > 0 ? `<div><div style="color:var(--tx3)">Hacim</div><div style="font-weight:700;color:var(--amb)">${totalM3.toFixed(1)} m³</div></div>` : ''}
            <div><div style="color:var(--tx3)">İşlem</div><div style="font-weight:700;color:var(--acc2)">${items.length} kayıt</div></div>
          </div>
          <div style="font-size:11px;color:var(--tx3)">▼</div>
        </div>
        <div style="display:none">
          <div style="overflow-x:auto">
          <table style="width:100%;font-size:11px;border-collapse:collapse;min-width:700px">
          <thead><tr style="background:var(--sur2);text-align:left">
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Seç</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">BRN No</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Yapı Bölümü</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Alınış Tarihi</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Beton Sınıfı</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">m³</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Adet</th>
            <th style="padding:6px 10px;font-weight:600;color:var(--tx3)">Blok</th>
          </tr></thead><tbody>`;

      items.forEach((n: any, i: number) => {
        const bg = i % 2 !== 0 ? 'background:rgba(255,255,255,.02)' : '';
        const brnGor = n.brnNo
        ? `<span style="font-family:var(--fm);color:var(--acc2)">${n.brnNo}</span>${n.labReportNo && n.labReportNo !== n.brnNo ? `<br><span style="font-size:10px;color:var(--tx3)">${n.labReportNo}</span>` : ''}`
        : `<span style="color:var(--tx3)">${n.labReportNo || '—'}</span>`;
      const alinGor = fmtD(n.takeDate || n.alinisDate || n.alisTarihi || n.tarih || '');
      html += `<tr style="border-top:1px solid var(--bdr);${bg}">
          <td style="padding:5px 10px"><input type="checkbox" class="rapor-pending-chk" data-group="${yibf}" data-idx="${i}" data-yibf="${yibf}" checked></td>
          <td style="padding:5px 10px">${brnGor}</td>
          <td style="padding:5px 10px">${n.yapiElem || n.yapiBolumu || n.bolum || '—'}</td>
          <td style="padding:5px 10px">${alinGor || '—'}</td>
          <td style="padding:5px 10px;font-weight:600;color:var(--grn)">${n.betonSinifi || n.sinif || '—'}</td>
          <td style="padding:5px 10px;text-align:right">${n.m3 || n.miktar || '—'}</td>
          <td style="padding:5px 10px;text-align:center">${n.numuneSayisi || n.adet || '—'}</td>
          <td style="padding:5px 10px">${n.blok || '—'}</td>
        </tr>`;
      });

      html += `</tbody></table></div></div></div>`;
    });

    html += `</div>`;
    w._raporEbistrPending = numuneler;
    w._raporEbistrGroups  = groups;

    const panel = document.getElementById('rapor-pending-panel');
    if (!panel) return;
    panel.innerHTML = html;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  w.raporEbistrPanelGoster = () => {
    const all: any[] = w._betonEbistrNumuneler || w.ebistrNumuneler || [];
    const panel = document.getElementById('rapor-pending-panel');
    if (!panel) return;
    if (!all.length) {
      panel.innerHTML = `<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:12px;padding:24px;text-align:center;color:var(--tx3);font-size:13px">EBİSTR verisi bulunamadı. Önce EBİSTR sayfasını ziyaret edin.</div>`;
      panel.style.display = 'block'; return;
    }
    // Default: show last 30 days
    const defBit = new Date().toISOString().slice(0, 10);
    const defBas = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    buildEbistrPanel(defBas, defBit);
  };

  w.raporEbistrFiltrele = (bas?: string, bit?: string) => {
    const basEl = document.getElementById('ebistr-tarih-bas') as HTMLInputElement;
    const bitEl = document.getElementById('ebistr-tarih-bit') as HTMLInputElement;
    const b = bas !== undefined ? bas : (basEl?.value || '');
    const e = bit !== undefined ? bit : (bitEl?.value || '');
    buildEbistrPanel(b, e);
  };

  w.raporEbistrImport = async () => {
    const groups: Record<string, any[]> = w._raporEbistrGroups || {};
    const existingRows: any[] = w._raporRows || [];
    const toAdd: any[] = [];
    document.querySelectorAll('.rapor-pending-chk').forEach((chk: any) => {
      if (!chk.checked) return;
      const yibf = chk.dataset.yibf;
      const idx  = parseInt(chk.dataset.idx, 10);
      const grp  = groups[yibf];
      if (grp && !isNaN(idx) && grp[idx]) toAdd.push({ n: grp[idx], yibf });
    });
    if (!toAdd.length) { w.toast?.('Hiç numune seçilmedi', 'warn'); return; }

    const newRows = toAdd.map(({ n, yibf }: { n: any; yibf: string }) => {
      const info = findRaporInfo(yibf === '__YIBFSIZ__' || yibf.startsWith('__BRN__') ? '' : yibf, existingRows);
      const alinTarih = (n.takeDate || n.alinisDate || n.alisTarihi || n.tarih || '').slice(0, 10);
      return {
        tip:'B', yil: new Date().getFullYear().toString(), kod:'',
        alinTarih, labTarih:'', talepEden:'',
        yd: n.yapiDenetim||info.yd||'', sahip: n.buildingOwner||n.yapiSahibi||info.sahip||'',
        idare:info.idare||'', pafta:info.pafta||'', ada:info.ada||'', parsel:info.parsel||'',
        ruhsatNo:n.ruhsatNo||info.ruhsatNo||'', yibf: resolveYibfForImportRow(yibf, n),
        bolum:n.yapiElem||n.yapiBolumu||n.bolum||'', blok:n.blok||'', adres:n.buildingAddress||info.adres||'',
        m3:n.m3||n.miktar||'', adet:n.numuneSayisi||n.adet||'',
        gun7:'', gun28:'', cins:'B', sinif:n.betonSinifi||n.sinif||'',
        beton:n.betonFirmasi||'', lab:'', deney7:'', deney28:'',
        brn7:n.brnNo||'', no7:'', brn28:n.labReportNo&&n.labReportNo!==n.brnNo?n.labReportNo:'', no28:'',
        muteahhit:n.contractor||n.muteahhit||n.yuklenici||info.muteahhit||'', fiyat:'',
      };
    });

    const baseRows = w._raporRows || [];
    newRows.forEach((r, i) => { r.kod = nextKod([...baseRows, ...newRows.slice(0, i)]); });

    const rows = [...baseRows, ...newRows];
    const map = mergeRaporMaps(w._raporMap || {}, rows);

    const { cloudOk } = await syncRaporDefteriRemote(w, rows, map);
    w._raporRows = rows; w._raporMap = map; w._raporFiltered = null; w._raporPage = 0;
    w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
    renderRaporTable(rows);

    const panel = document.getElementById('rapor-pending-panel');
    if (panel) panel.style.display = 'none';
    const cnt = document.getElementById('rapor-cnt'); if (cnt) cnt.textContent = String(rows.length);
    if (cloudOk) w.toast?.(`${newRows.length} numune eklendi`, 'success');
    else w.toast?.(`${newRows.length} numune eklendi; ortak kopya yazılamadı`, 'warn');
  };

  // ── Manuel giriş ─────────────────────────────────────────────
  w.raporManuelGirisGoster = () => {
    const panel = document.getElementById('rapor-pending-panel');
    if (!panel) return;
    const IS = 'width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:12px;box-sizing:border-box';
    const LB = 'font-size:10px;color:var(--tx3);display:block;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em';
    const inp = (id: string, lbl: string, type = 'text', ph = '', extra = '', autoFill = false) =>
      `<div><label style="${LB}">${lbl}${autoFill ? ' <span style="color:var(--acc);font-size:9px">(otomatik)</span>' : ''}</label><input id="${id}" type="${type}" placeholder="${ph}" ${extra} style="${IS}${type==='text'&&id.includes('yibf')?';font-family:var(--fm)':''}"></div>`;

    panel.innerHTML = `<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;background:var(--sur)">
        <div style="font-size:14px;font-weight:700;color:var(--tx)">📝 Manuel Giriş</div>
        <button class="btn btn-g" onclick="document.getElementById('rapor-pending-panel').style.display='none'" style="font-size:12px;padding:5px 12px">✕</button>
      </div>
      <div style="padding:16px 20px">

        <!-- Tip seçimi -->
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <button class="btn btn-p" id="mg-tip-B" onclick="raporMgTip('B')" style="font-size:12px;padding:6px 18px">🧱 Beton</button>
          <button class="btn btn-g" id="mg-tip-C" onclick="raporMgTip('C')" style="font-size:12px;padding:6px 18px">🔩 Çelik</button>
          <button class="btn btn-g" id="mg-tip-K" onclick="raporMgTip('K')" style="font-size:12px;padding:6px 18px">🔘 Karot</button>
        </div>

        <!-- Bölüm 1: Temel bilgiler -->
        <div style="font-size:10px;font-weight:700;color:var(--acc);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bdr)">Temel Bilgiler</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${inp('mg-yibf','YİBF','text','YİBF No','oninput="raporMgYibfFill()"')}
          ${inp('mg-alin','Alınış Tarihi','date','','',false)}
          ${inp('mg-lab-tarih','Lab Geliş Tarihi','date','','',false)}
          ${inp('mg-talep','Deneyi Talep Eden','text','Firma / Kişi...','',false)}
        </div>

        <!-- Bölüm 2: Yapı bilgileri (YİBF'den otomatik) -->
        <div style="font-size:10px;font-weight:700;color:var(--acc);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bdr)">Yapı Bilgileri <span style="color:var(--tx3);font-weight:400">(YİBF girilince otomatik dolar)</span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
          ${inp('mg-yd','Yapı Denetim','text','YD Firması...','',true)}
          ${inp('mg-sahip','Yapı Sahibi','text','Sahip...','',true)}
          ${inp('mg-mut','Müteahhit','text','Müteahhit...','',true)}
          ${inp('mg-idare','İdare','text','İdare...','',true)}
          ${inp('mg-adres','Adres','text','Adres...','',true)}
          ${inp('mg-talep-eden','Talep Eden','text','','')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
          ${inp('mg-pafta','Pafta','text','','',true)}
          ${inp('mg-ada','Ada','text','','',true)}
          ${inp('mg-parsel','Parsel','text','','',true)}
          ${inp('mg-ruhsat','Ruhsat No','text','','',true)}
          ${inp('mg-fiyat','Fiyat (TL)','text','0 TL','',false)}
        </div>

        <!-- Bölüm 3: Numune bilgileri -->
        <div style="font-size:10px;font-weight:700;color:var(--acc);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bdr)">Numune Bilgileri</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${inp('mg-bolum','Yapı Bölümü','text','Temel, Kolon...','',false)}
          ${inp('mg-blok','Blok','text','A, B...','',false)}
          <div id="mg-m3-wrap">${inp('mg-m3','m³','number','0','',false)}</div>
          ${inp('mg-adet','Adet','number','1','',false)}
          ${inp('mg-gun7','7 Gün (kür süresi)','text','7','',false)}
          ${inp('mg-gun28','28 Gün (kür süresi)','text','28','',false)}
          ${inp('mg-sinif','Sınıf / Cins','text','C25/30, B420C...','',false)}
          ${inp('mg-beton','Beton Firması','text','','',false)}
        </div>

        <!-- Bölüm 4: Rapor bilgileri -->
        <div style="font-size:10px;font-weight:700;color:var(--acc);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bdr)">Rapor & Deney Bilgileri</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${inp('mg-brn7','BRN No (7 gün)','text','BRN-...','',false)}
          ${inp('mg-no7','No (7 gün)','text','','',false)}
          ${inp('mg-brn28','BRN No (28 gün)','text','BRN-...','',false)}
          ${inp('mg-no28','No (28 gün)','text','','',false)}
          ${inp('mg-lab','Lab','text','','',false)}
          ${inp('mg-deney7','Deney Tar. 7 Gün','date','','',false)}
          ${inp('mg-deney28','Deney Tar. 28 Gün','date','','',false)}
        </div>

        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-p" onclick="raporManuelKaydet()" style="font-size:12px;padding:8px 24px">💾 Kaydet</button>
          <button class="btn btn-g" onclick="document.getElementById('rapor-pending-panel').style.display='none'" style="font-size:12px;padding:8px 16px">İptal</button>
        </div>
      </div>
    </div>`;

    const alinEl = document.getElementById('mg-alin') as HTMLInputElement;
    if (alinEl) alinEl.value = new Date().toISOString().slice(0, 10);
    w._mgTip = 'B';
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  w.raporMgTip = (tip: string) => {
    w._mgTip = tip;
    ['B','C','K'].forEach(t => { const b = document.getElementById(`mg-tip-${t}`); if (b) b.className = t === tip ? 'btn btn-p' : 'btn btn-g'; });
    const m3w = document.getElementById('mg-m3-wrap'); if (m3w) m3w.style.display = tip === 'B' ? '' : 'none';
  };

  w.raporMgYibfFill = () => {
    const yibf = (document.getElementById('mg-yibf') as HTMLInputElement)?.value?.trim();
    if (!yibf || yibf.length < 3) return;
    const info = findRaporInfo(yibf, w._raporRows || []);
    const set = (id: string, val: string) => { const el = document.getElementById(id) as HTMLInputElement; if (el && !el.value && val) el.value = val; };
    set('mg-yd', info.yd);
    set('mg-sahip', info.sahip);
    set('mg-mut', info.muteahhit);
    set('mg-idare', info.idare);
    set('mg-adres', info.adres);
    set('mg-pafta', info.pafta);
    set('mg-ada', info.ada);
    set('mg-parsel', info.parsel);
    set('mg-ruhsat', info.ruhsatNo);
  };

  w.raporManuelKaydet = async () => {
    const g   = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value?.trim() || '';
    const tip = w._mgTip || 'B';
    const alinTarih = g('mg-alin');
    if (!alinTarih) { w.toast?.('Alınış tarihi zorunlu', 'warn'); return; }

    const baseRows = w._raporRows || [];
    const newRow = {
      tip, yil: new Date().getFullYear().toString(), kod: nextKod(baseRows),
      alinTarih, labTarih:g('mg-lab-tarih'), talepEden:g('mg-talep'),
      yd:g('mg-yd'), sahip:g('mg-sahip'), idare:g('mg-idare'), pafta:g('mg-pafta'),
      ada:g('mg-ada'), parsel:g('mg-parsel'), ruhsatNo:g('mg-ruhsat'),
      yibf:g('mg-yibf'), bolum:g('mg-bolum'), blok:g('mg-blok'), adres:g('mg-adres'),
      m3: tip==='B' ? g('mg-m3') : '', adet:g('mg-adet'),
      gun7:g('mg-gun7'), gun28:g('mg-gun28'), cins:tip, sinif:g('mg-sinif'), beton:g('mg-beton'),
      lab:g('mg-lab'), deney7:g('mg-deney7'), deney28:g('mg-deney28'),
      brn7:g('mg-brn7'), no7:g('mg-no7'), brn28:g('mg-brn28'), no28:g('mg-no28'),
      muteahhit:g('mg-mut'), fiyat:g('mg-fiyat'),
    };

    const rows = [...baseRows, newRow];
    const map = mergeRaporMaps(w._raporMap || {}, rows);

    const { cloudOk } = await syncRaporDefteriRemote(w, rows, map);
    w._raporRows = rows; w._raporMap = map; w._raporFiltered = null; w._raporPage = 0;
    w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
    renderRaporTable(rows);

    const panel = document.getElementById('rapor-pending-panel'); if (panel) panel.style.display = 'none';
    const cnt = document.getElementById('rapor-cnt'); if (cnt) cnt.textContent = String(rows.length);
    if (cloudOk) w.toast?.(`${newRow.kod} kaydedildi`, 'success');
    else w.toast?.(`${newRow.kod} kaydedildi; ortak kopya yazılamadı`, 'warn');
  };

  // ── Satır detay / deney pop-up ───────────────────────────────
  w.raporDeneyAc = (gIdx: number) => {
    // gIdx → reversed array index, satırı doğrudan bul ve referansı sakla
    const allRows: any[] = w._raporFiltered || w._raporRows || [];
    const reversed = [...allRows].reverse();
    const r = reversed[gIdx];
    if (!r) { console.warn('raporDeneyAc: row not found for gIdx', gIdx); return; }
    w._deneyRow = r; // referansı sakla — index güvensiz

    const modal = document.getElementById('rapor-deney-modal');
    if (!modal) return;

    const d = r._deney || {};
    const esc = (v: any) => String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const BG  = '#101628';
    const INS = `width:100%;padding:7px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);background:#1A2240;color:#F1F5F9;font-size:12px;box-sizing:border-box;outline:none`;
    const LBS = `font-size:10px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:3px`;
    const SEP = `font-size:10px;font-weight:700;color:#60A5FA;text-transform:uppercase;letter-spacing:.08em;padding:10px 0 6px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:12px`;

    const inp = (id: string, lbl: string, val: any, type = 'text', extra = '') =>
      `<div><label style="${LBS}">${lbl}</label><input id="${id}" type="${type}" value="${esc(val)}" ${extra} style="${INS}"></div>`;

    const tipBg  = r.tip === 'B' ? '#1e3a5f' : r.tip === 'C' ? '#14532d' : '#4a3000';
    const tipClr = r.tip === 'B' ? '#60A5FA' : r.tip === 'C' ? '#22C55E' : '#FBBF24';
    const durumClr = d.durum === 'UYGUN' ? '#22C55E' : d.durum === 'UYGUNSUZ' ? '#F87171' : '#94A3B8';

    modal.innerHTML = `
    <div style="background:#0C1120;border:1px solid rgba(255,255,255,0.1);border-radius:16px;width:96%;max-width:820px;max-height:92vh;overflow-y:auto;position:relative">

      <!-- Başlık -->
      <div style="padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#0C1120;z-index:10">
        <div style="display:flex;align-items:center;gap:10px">
          ${r.tip ? `<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;background:${tipBg};color:${tipClr}">${r.tip}</span>` : ''}
          <span style="font-size:17px;font-weight:800;color:#F1F5F9;font-family:monospace">${esc(r.kod) || '—'}</span>
          ${d.durum ? `<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;border:1px solid ${durumClr};color:${durumClr}">${d.durum}</span>` : ''}
        </div>
        <button onclick="document.getElementById('rapor-deney-modal').style.display='none'" style="background:none;border:none;color:#94A3B8;font-size:22px;cursor:pointer;line-height:1;padding:2px 6px">✕</button>
      </div>

      <div style="padding:20px 24px">

        <!-- Bölüm 1: Temel bilgiler -->
        <div style="${SEP}">Temel Bilgiler</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${inp('dr-yibf','YİBF', r.yibf, 'text', 'style="font-family:monospace;color:#60A5FA"')}
          ${inp('dr-kod','KOD', r.kod)}
          ${modalDateField('dr-alin', 'Alınış Tarihi', r.alinTarih, inp)}
          ${modalDateField('dr-lab', 'Lab Geliş', r.labTarih, inp)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
          ${inp('dr-yd','Yapı Denetim', r.yd)}
          ${inp('dr-sahip','Yapı Sahibi', r.sahip)}
          ${inp('dr-mut','Müteahhit', r.muteahhit)}
          ${inp('dr-idare','İdare', r.idare)}
          ${inp('dr-adres','Adres', r.adres)}
          ${inp('dr-talep','Talep Eden', r.talepEden)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
          ${inp('dr-pafta','Pafta', r.pafta)}
          ${inp('dr-ada','Ada', r.ada)}
          ${inp('dr-parsel','Parsel', r.parsel)}
          ${inp('dr-ruhsat','Ruhsat No', r.ruhsatNo)}
          ${inp('dr-fiyat','Fiyat', r.fiyat)}
        </div>

        <!-- Bölüm 2: Numune bilgileri (defter JSON: gun7/gun28 adet, brn/no, deney tarihleri) -->
        <div style="${SEP}">Numune Bilgileri</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          ${inp('dr-bolum','Yapı Bölümü', r.bolum)}
          ${inp('dr-blok','Blok', r.blok)}
          ${inp('dr-m3','m³', r.m3, 'number')}
          ${inp('dr-adet','Adet (toplam)', r.adet, 'number')}
          ${inp('dr-gun7','7 gün (adet)', r.gun7)}
          ${inp('dr-gun28','28 gün (adet)', r.gun28)}
          ${inp('dr-sinif','Sınıf / Cins', r.sinif)}
          ${inp('dr-beton','Beton Firması', r.beton)}
          ${inp('dr-brn7','BRN (7 gün)', r.brn7)}
          ${inp('dr-no7','No (7 gün)', r.no7)}
          ${inp('dr-brn28','BRN (28 gün)', r.brn28)}
          ${inp('dr-no28','No (28 gün)', r.no28)}
        </div>

        <!-- Bölüm 3: Deney sonuçları -->
        <div style="${SEP}">7 Günlük Kırım (N/mm²)</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
          ${inp('dn-fc7-1','fc₁', (d.fc7||[])[0]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          ${inp('dn-fc7-2','fc₂', (d.fc7||[])[1]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          ${inp('dn-fc7-3','fc₃', (d.fc7||[])[2]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          <div><label style="${LBS}">Ortalama (ort.)</label><div id="dn-ort7" style="padding:7px 10px;border-radius:7px;background:rgba(59,130,246,.15);color:#60A5FA;font-size:13px;font-weight:700">${d.fcm7 ? d.fcm7.toFixed(1) : '—'}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          ${modalDateField('dn-tar7', 'Deney Tarihi (7 gün)', d.tarih7 || r.deney7, inp)}
          ${inp('dn-brn7-d','BRN No (deney)', d.brn7 || r.brn7 || '')}
          ${inp('dn-no7-d','No (7 gün)', d.no7 || r.no7 || '')}
        </div>

        <div style="${SEP}">28 Günlük Kırım (N/mm²)</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
          ${inp('dn-fc28-1','fc₁', (d.fc28||[])[0]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          ${inp('dn-fc28-2','fc₂', (d.fc28||[])[1]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          ${inp('dn-fc28-3','fc₃', (d.fc28||[])[2]||'', 'number', 'oninput="raporDeneyHesapla()"')}
          <div><label style="${LBS}">Ortalama (ort.)</label><div id="dn-ort28" style="padding:7px 10px;border-radius:7px;background:rgba(34,197,94,.15);color:#22C55E;font-size:13px;font-weight:700">${d.fcm28 ? d.fcm28.toFixed(1) : '—'}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          ${modalDateField('dn-tar28', 'Deney Tarihi (28 gün)', d.tarih28 || r.deney28, inp)}
          ${inp('dn-brn28-d','BRN No (deney)', d.brn28 || r.brn28 || '')}
          ${inp('dn-no28-d','No (28 gün)', d.no28 || r.no28 || '')}
          ${inp('dn-fck','fck (Karakteristik)', d.fck||r.sinif?.replace(/[^0-9.]/g,'')||'', 'number', 'oninput="raporDeneyHesapla()"')}
        </div>

        <!-- Sonuç -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
          <div>
            <label style="${LBS}">Sonuç / Durum</label>
            <select id="dn-durum" style="${INS}">
              <option value="">— Belirtilmedi</option>
              <option value="UYGUN" ${d.durum==='UYGUN'?'selected':''}>✅ UYGUN</option>
              <option value="UYGUNSUZ" ${d.durum==='UYGUNSUZ'?'selected':''}>❌ UYGUNSUZ</option>
              <option value="BEKLİYOR" ${d.durum==='BEKLİYOR'?'selected':''}>⏳ BEKLİYOR</option>
            </select>
          </div>
          ${inp('dn-not','Notlar', d.not||'')}
        </div>

        <div style="display:flex;gap:8px;padding-top:4px">
          <button onclick="raporDeneyKaydet()" style="flex:1;padding:11px;border-radius:9px;border:none;background:#3B82F6;color:#fff;font-size:13px;font-weight:700;cursor:pointer">💾 Kaydet</button>
          <button onclick="document.getElementById('rapor-deney-modal').style.display='none'" style="padding:11px 20px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:#1A2240;color:#94A3B8;font-size:13px;cursor:pointer">İptal</button>
        </div>

      </div>
    </div>`;

    modal.style.display = 'flex';
  };

  w.raporDeneyHesapla = () => {
    const gv = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement)?.value || '') || 0;
    const vals7  = [gv('dn-fc7-1'),  gv('dn-fc7-2'),  gv('dn-fc7-3')].filter(v => v > 0);
    const vals28 = [gv('dn-fc28-1'), gv('dn-fc28-2'), gv('dn-fc28-3')].filter(v => v > 0);
    const ort7El  = document.getElementById('dn-ort7');
    const ort28El = document.getElementById('dn-ort28');
    if (ort7El)  ort7El.textContent  = vals7.length  ? (vals7.reduce((a,b)=>a+b,0)/vals7.length).toFixed(1)   : '—';
    if (ort28El) ort28El.textContent = vals28.length ? (vals28.reduce((a,b)=>a+b,0)/vals28.length).toFixed(1)  : '—';
    const fck = gv('dn-fck');
    if (fck > 0 && vals28.length >= 2) {
      const fcm = vals28.reduce((a,b)=>a+b,0)/vals28.length;
      const fciMin = Math.min(...vals28);
      const uygun = fcm >= fck + 4 && fciMin >= fck - 4;
      const sel = document.getElementById('dn-durum') as HTMLSelectElement;
      if (sel && !sel.value) sel.value = uygun ? 'UYGUN' : 'UYGUNSUZ';
    }
  };

  w.raporDeneyKaydet = async () => {
    const r = w._deneyRow;
    if (!r) return;

    const gs  = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value?.trim() || '';
    const gv  = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement)?.value || '') || 0;
    const gvs = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';

    // Temel satır alanlarını güncelle
    r.yibf      = gs('dr-yibf');
    r.kod       = gs('dr-kod');
    r.alinTarih = gvs('dr-alin');
    r.labTarih  = gvs('dr-lab');
    r.yd        = gs('dr-yd');
    r.sahip     = gs('dr-sahip');
    r.muteahhit = gs('dr-mut');
    r.idare     = gs('dr-idare');
    r.adres     = gs('dr-adres');
    r.talepEden = gs('dr-talep');
    r.pafta     = gs('dr-pafta');
    r.ada       = gs('dr-ada');
    r.parsel    = gs('dr-parsel');
    r.ruhsatNo  = gs('dr-ruhsat');
    r.fiyat     = gs('dr-fiyat');
    r.bolum     = gs('dr-bolum');
    r.blok      = gs('dr-blok');
    r.m3        = gs('dr-m3');
    r.adet      = gs('dr-adet');
    r.gun7      = gs('dr-gun7');
    r.gun28     = gs('dr-gun28');
    r.sinif     = gs('dr-sinif');
    r.beton     = gs('dr-beton');
    r.brn7      = gs('dr-brn7');
    r.no7       = gs('dr-no7');
    r.brn28     = gs('dr-brn28');
    r.no28      = gs('dr-no28');
    r.deney7    = gvs('dn-tar7');
    r.deney28   = gvs('dn-tar28');

    // Deney sonuçları
    const fc7  = [gv('dn-fc7-1'),  gv('dn-fc7-2'),  gv('dn-fc7-3')].filter(v => v > 0);
    const fc28 = [gv('dn-fc28-1'), gv('dn-fc28-2'), gv('dn-fc28-3')].filter(v => v > 0);
    r._deney = {
      fc7, fc28,
      fcm7:    fc7.length  ? parseFloat((fc7.reduce((a,b)=>a+b,0)/fc7.length).toFixed(2))   : 0,
      fcm28:   fc28.length ? parseFloat((fc28.reduce((a,b)=>a+b,0)/fc28.length).toFixed(2)) : 0,
      tarih7:  gvs('dn-tar7'),
      tarih28: gvs('dn-tar28'),
      brn7:    gs('dn-brn7-d'),
      brn28:   gs('dn-brn28-d'),
      no7:     gs('dn-no7-d'),
      no28:    gs('dn-no28-d'),
      fck:     gv('dn-fck'),
      durum:   gs('dn-durum'),
      not:     gs('dn-not'),
    };

    const rows = w._raporRows || [];
    const map = mergeRaporMaps(w._raporMap || {}, rows);
    w._raporMap = map;
    w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
    const { cloudOk } = await syncRaporDefteriRemote(w, rows, map);
    renderRaporTable(w._raporFiltered || rows);
    document.getElementById('rapor-deney-modal')!.style.display = 'none';
    if (cloudOk) w.toast?.(`Kaydedildi${r._deney.durum ? ' · ' + r._deney.durum : ''}`, 'success');
    else w.toast?.(`Kaydedildi; ortak kopya yazılamadı${r._deney.durum ? ' · ' + r._deney.durum : ''}`, 'warn');
  };
}

// ── React bileşeni — SSR hiçbir HTML üretmez ───────────────────
export default function RaporPage() {
  const topRef    = useRef<HTMLDivElement>(null);
  const pendRef   = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const init      = useRef(false);

  useEffect(() => {
    if (init.current) return;
    init.current = true;

    // ── Üst panel HTML ──────────────────────────────────────────
    if (topRef.current) {
      topRef.current.innerHTML = `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--tx);letter-spacing:-.3px">📂 Rapor Defteri</div>
            <div style="font-size:13px;color:var(--tx3);margin-top:3px">YİBF bazlı numune kayıtları</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div id="rapor-durum" style="font-size:12px;color:var(--tx3);padding:5px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:20px">Yükleniyor...</div>
            <span style="font-size:12px;color:var(--tx3)">Toplam: <strong id="rapor-cnt" style="color:var(--acc2)">0</strong></span>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:12px 16px;background:var(--sur2);border:1px solid var(--bdr);border-radius:14px">
        <label style="cursor:pointer">
          <div class="btn btn-p" style="height:36px;padding:0 16px;font-size:12px;border-radius:10px;display:flex;align-items:center;gap:6px">📥 Excel Yükle</div>
          <input type="file" id="raporXlsx" accept=".xlsx,.xls" style="display:none" onchange="raporXlsxYukle(this)">
        </label>
        <button class="btn btn-g" style="height:36px;padding:0 16px;font-size:12px;border-radius:10px" onclick="raporExcelIndir()">📤 Dışa Aktar</button>
        <button class="btn btn-g" style="height:36px;padding:0 16px;font-size:12px;border-radius:10px" onclick="raporEbistrPanelGoster()">📋 EBİSTR'den Al</button>
        <button class="btn btn-o" style="height:36px;padding:0 16px;font-size:12px;border-radius:10px" onclick="raporManuelGirisGoster()">📝 Manuel Giriş</button>
        <div style="flex:1"></div>
        <button class="btn btn-g" style="height:36px;padding:0 14px;font-size:12px;border-radius:10px;opacity:.7" onclick="raporFiltreTemizle()">🧹 Sıfırla</button>
      </div>
      <style>
        /* Container styles */
        .rapor-table-container {
          width: 100%;
          background: var(--sur);
          border: 1px solid var(--bdr);
          border-radius: var(--r);
          overflow-x: auto;
          position: relative;
          box-shadow: var(--shd);
        }

        /* Fixed table-layout for sticky logic */
        table {
          width: 100%;
          border-collapse: separate; /* Required for sticky border issues */
          border-spacing: 0;
          font-size: 13px;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 20;
          background: var(--sur2);
          padding: 12px 16px;
          text-align: left;
          font-size: 10px;
          font-weight: 800;
          color: var(--tx3);
          text-transform: uppercase;
          letter-spacing: .08em;
          border-bottom: 2px solid var(--bdr);
          white-space: nowrap;
        }

        td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--bdr);
          color: var(--tx2);
          white-space: nowrap;
        }

        /* Sticky columns configuration */
        .sticky-col {
          position: sticky;
          background: var(--sur);
          z-index: 10;
          border-right: 1px solid var(--bdr);
        }

        th.sticky-col { z-index: 30; background: var(--sur2); }

        /* Left offsets for nested sticky columns */
        .col-tip { left: 0; }
        .col-yil { left: 80px; } /* Adjust based on actual widths */
        .col-kod { left: 140px; }

        @media (max-width: 768px) {
          .rapor-table-container {
            border-radius: 10px;
          }
          #rapor-scroll-box {
            -webkit-overflow-scrolling: touch;
          }
        }
      </style>`;
    }

    // ── Thead HTML (filtre satırı dahil) ────────────────────────
    const thead = document.getElementById('rapor-thead');
    if (thead) {
      const headerRow = COL_KEYS.map((k, i) => {
        const w = COL_WIDTHS[i];
        const isSticky = i < 3;
        const stickyClass = isSticky ? ` sticky-col sticky-${i}` : '';
        const z = isSticky ? 110 : 100;
        return `<th class="${stickyClass}" style="width:${w};min-width:${w};padding:10px 8px;z-index:${z}">${COL_LABELS[i]}</th>`;
      }).join('');

      const filterRow = COL_KEYS.map((k, i) => {
        const w = COL_WIDTHS[i];
        const isSticky = i < 3;
        const stickyClass = isSticky ? ` sticky-col sticky-${i}` : '';
        const z = isSticky ? 110 : 95;
        return `<th class="filter-th ${stickyClass}" style="width:${w};min-width:${w};padding:4px 6px;z-index:${z}"><input id="rf-${k}" placeholder="🔍" oninput="raporFiltrele()" style="${FILTER_STYLE}" title="${COL_LABELS[i]}"></th>`;
      }).join('');

      thead.innerHTML = `<tr>${headerRow}</tr><tr>${filterRow}</tr>`;
    }

    // ── Scroll container — gerçek kullanılabilir genişlikten hesapla ──
    const fixScrollWidth = () => {
      const sc = scrollRef.current;
      if (!sc) return;
      // .main elemanının gerçek margin-left değerini oku (collapsed/expanded/mobile hepsini kapsar)
      const mainEl = document.querySelector('.main') as HTMLElement | null;
      const mainML = mainEl ? parseInt(getComputedStyle(mainEl).marginLeft) || 0 : 0;
      const pageWrap = sc.closest('.main > div') as HTMLElement | null;
      const wrapPad = pageWrap ? (parseInt(getComputedStyle(pageWrap).paddingLeft) || 0) + (parseInt(getComputedStyle(pageWrap).paddingRight) || 0) : 48;
      sc.style.width = (window.innerWidth - mainML - wrapPad) + 'px';
    };
    fixScrollWidth();
    window.addEventListener('resize', fixScrollWidth);

    raporPageInit();

    return () => window.removeEventListener('resize', fixScrollWidth);
  }, []);

  return (
    <div style={{ padding: '0 24px 24px' }}>
      {/* Başlık + araç çubuğu — client-only inject */}
      <div ref={topRef} />

      {/* EBİSTR / Manuel panel */}
      <div ref={pendRef} id="rapor-pending-panel" style={{ display: 'none', marginBottom: 14 }} />

      {/* ── TABLO KARTI ──────────────────────────────────────── */}
      <div className="rapor-table-container">
        {/* Kart başlığı */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', background: 'var(--sur2)',
          borderBottom: '1px solid var(--bdr)', borderRadius: '16px 16px 0 0',
        }}>
          <span style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 600 }}>📋 Kayıtlar</span>
          <span style={{ fontSize: 10, color: 'var(--tx3)', opacity: .6 }}>← sağa kaydırabilirsiniz →</span>
        </div>

        {/* ── SCROLL CONTAINER ─────────────────────────────── */}
        <div id="rapor-scroll-box" ref={scrollRef} style={{
          overflowX: 'scroll',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 280px)',
          background: '#0F172A',
          display: 'block',
          position: 'relative',
        }}>
          <table className="rapor-tablo">
            <thead id="rapor-thead" />
            <tbody id="rapor-liste" />
          </table>
        </div>

        {/* Sayfalama */}
        <div id="rapor-pagination" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--bdr)',
          background: 'var(--sur2)', fontSize: 12, color: 'var(--tx3)',
          borderRadius: '0 0 16px 16px',
        }}>
          <span id="rapor-page-info">—</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button id="rapor-prev" className="btn btn-g" style={{ height: 28, padding: '0 12px', fontSize: 12, borderRadius: 8 }}
              onClick={() => (window as any).raporGoTo?.(-1)}>← Önceki</button>
            <button id="rapor-next" className="btn btn-g" style={{ height: 28, padding: '0 12px', fontSize: 12, borderRadius: 8 }}
              onClick={() => (window as any).raporGoTo?.(1)}>Sonraki →</button>
          </div>
        </div>
      </div>

      {/* ── DENEY SONUÇLARI MODAL ────────────────────────────── */}
      <div id="rapor-deney-modal" style={{
        display: 'none', position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.75)', zIndex: 500,
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }} />
    </div>
  );
}
