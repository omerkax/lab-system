import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import {
  addToken, clearTokens, getStatus, getCache, getTokens,
  performSync, normalizeNumune, syncTelemetriOnly, mergeMailDurum,
  hydrateEbistrFallbackFromJsonIfEmpty,
  hydrateEbistrTokenFromFirestore,
} from '@/lib/ebistr-engine';

/** Vercel: yanıt döndükten sonra da performSync tamamlanabilsin (aksi halde 202 sonsuz döngü) */
function ebistrScheduleSync(work: Promise<void>) {
  try {
    waitUntil(work);
  } catch {
    work.catch(console.error);
  }
}

// Ortak CORS headers — extension ve cross-origin istekler için
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ebistrHeaders = { ...cors, 'X-Ebistr-Api': '2-json-fallback' } as Record<string, string>;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** Uzun EBİSTR çekimi — Vercel Pro+ için; Hobby’de platform üst sınırı geçerli kalır */
export const maxDuration = 300;

// ── Slug bazlı routing ─────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  hydrateEbistrFallbackFromJsonIfEmpty();
  await hydrateEbistrTokenFromFirestore();
  const { slug = [] } = await params;
  const endpoint = slug.join('/');

  // ebistr.js ebistrCanliCek(force) → GET …/sync-now (eskiden 404 dönüyordu)
  if (endpoint === 'sync-now' || endpoint === 'sync') {
    const s = getStatus();
    if (!s.loggedIn) {
      // 401 tarayıcıda kırmızı “Failed to load resource”; yeni domain/Vercel soğuk örnek için 200 + ok:false
      return NextResponse.json(
        {
          ok: false,
          err: 'Sunucuda EBİSTR JWT yok. Chrome eklentisini v1.1+ yapıp lab sayfasını yenileyin, Ayar’dan token gönderin veya Vercel’de EBISTR_SERVER_TOKEN kullanın.',
        },
        { status: 200, headers: ebistrHeaders },
      );
    }
    if (s.isSyncing) {
      return NextResponse.json({ ok: true, msg: 'Senkron zaten çalışıyor', lastSync: s.lastSync }, { headers: ebistrHeaders });
    }
    ebistrScheduleSync(performSync());
    return NextResponse.json(
      { ok: true, msg: 'Senkron arka planda başladı; numuneler birkaç dakika içinde dolacak.', lastSync: s.lastSync, cacheSize: s.cacheSize },
      { headers: ebistrHeaders }
    );
  }

  if (endpoint === 'status') {
    return NextResponse.json({ ok: true, ...getStatus() }, { headers: ebistrHeaders });
  }

  if (endpoint === 'mail-durum') {
    const c = getCache();
    return NextResponse.json({ ok: true, mailDurum: c.mailDurum || {} }, { headers: ebistrHeaders });
  }

  if (endpoint === 'yaklasan') {
    return handleYaklasan(req);
  }

  if (endpoint === 'taglar') {
    return handleTaglar();
  }

  if (endpoint === 'kurleme') {
    return handleKurleme();
  }

  if (endpoint === 'debug-fields') {
    const raw = getCache().rawNumuneler;
    if (!raw.length) return NextResponse.json({ ok: false, err: 'Henüz sync edilmedi' }, { headers: ebistrHeaders });
    const ornek = raw[0];
    const alanlar: Record<string, any> = {};
    Object.keys(ornek).forEach(k => {
      const v = ornek[k];
      if (v === null || v === undefined) alanlar[k] = null;
      else if (typeof v === 'object' && !Array.isArray(v)) alanlar[k] = '{ ' + Object.keys(v).slice(0, 8).join(', ') + ' }';
      else alanlar[k] = v;
    });
    return NextResponse.json({ ok: true, ornek: alanlar, toplamKayit: raw.length }, { headers: ebistrHeaders });
  }

  if (endpoint === 'telemetri') {
    return NextResponse.json({ ok: true, ...getStatus() }, { headers: ebistrHeaders });
  }

  return NextResponse.json({ ok: false, err: 'Bilinmeyen endpoint: ' + endpoint }, { status: 404, headers: ebistrHeaders });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug?: string[] }> }) {
  hydrateEbistrFallbackFromJsonIfEmpty();
  await hydrateEbistrTokenFromFirestore();
  const { slug = [] } = await params;
  const endpoint = slug.join('/');
  let body: any = {};
  try { body = await req.json(); } catch {}

  if (endpoint === 'setToken') {
    if (!body.token) return NextResponse.json({ ok: false, err: 'Token boş' }, { status: 400, headers: ebistrHeaders });
    addToken(body.token.trim());
    ebistrScheduleSync(performSync());
    return NextResponse.json({ ok: true, tokenSayisi: getTokens().length }, { headers: ebistrHeaders });
  }

  if (endpoint === 'logout') {
    clearTokens();
    return NextResponse.json({ ok: true }, { headers: ebistrHeaders });
  }

  if (endpoint === 'sync' || endpoint === 'sync-now') {
    const s = getStatus();
    if (s.isSyncing) return NextResponse.json({ ok: false, err: 'Zaten sync devam ediyor' }, { headers: ebistrHeaders });
    if (!s.loggedIn) return NextResponse.json({ ok: false, err: 'Token yok' }, { status: 200, headers: ebistrHeaders });
    ebistrScheduleSync(performSync());
    return NextResponse.json({ ok: true, msg: 'Sync başlatıldı' }, { headers: ebistrHeaders });
  }

  if (endpoint === 'numuneler') {
    return handleNumuneler(body);
  }

  if (endpoint === 'mail-durum') {
    const m = body.merge || body.mailDurum;
    if (m && typeof m === 'object' && !Array.isArray(m)) mergeMailDurum(m as Record<string, boolean>);
    return NextResponse.json({ ok: true }, { headers: ebistrHeaders });
  }

  if (endpoint === 'csv-base64') {
    return handleCsvBase64(body);
  }

  return NextResponse.json({ ok: false, err: 'Bilinmeyen endpoint: ' + endpoint }, { status: 404, headers: ebistrHeaders });
}

function resolveNumunelerSource(cache: ReturnType<typeof getCache>): { rows: any[]; fromJsonSnapshot: boolean } {
  if (cache.numuneler.length) return { rows: cache.numuneler, fromJsonSnapshot: false };
  const fb = cache.fallbackNormalized;
  if (fb && fb.length) return { rows: fb, fromJsonSnapshot: true };
  return { rows: [], fromJsonSnapshot: false };
}

// ── /api/ebistr/yaklasan ──────────────────────────────────────────
function handleYaklasan(req: NextRequest) {
  const cache = getCache();
  const src = resolveNumunelerSource(cache);
  if (!src.rows.length) {
    return NextResponse.json({ ok: true, numuneler: [], lastSync: cache.sonGuncelleme }, { headers: ebistrHeaders });
  }

  const gun = req.nextUrl.searchParams.get('gun');
  const hedefFarklar = gun !== undefined && gun !== null ? [parseInt(gun)] : [0, 1, 2, 3, 7];
  const kurGunleri   = [7, 28, 56, 90];
  const bugunStr     = new Date().toLocaleDateString('en-CA');
  const bugunMs      = new Date(bugunStr + 'T00:00:00').getTime();

  const getStr = (v: any) => { if (!v) return ''; if (typeof v === 'string') return v; return v.name || v.title || v.fullName || ''; };

  /** Ham EBİSTR API satırı veya ebistr-numuneler.json (normalize) satırı */
  function rowYibfNo(n: any): string {
    const yb = n.yibf;
    if (yb != null && typeof yb === 'object') {
      return yb.no || yb.number || yb.yibfNo || yb.registrationNo || (yb.id != null ? String(yb.id) : '') || '';
    }
    if (typeof yb === 'string' && yb.trim()) return yb.trim();
    return '';
  }
  function rowYObj(n: any): any | null {
    return n.yibf != null && typeof n.yibf === 'object' ? n.yibf : null;
  }
  function rowBolum(n: any): string {
    return String(n.structuralComponent || n.yapiElem || '').trim();
  }
  function rowBeton(n: any): string {
    return n.concreteClass?.name || n.betonSinifi || '';
  }
  function rowCuringId(n: any): number {
    const fromApi = n.curingTime?.id;
    if (fromApi != null && fromApi !== '') return Number(fromApi) || 0;
    return Number(n.curingGun) || 0;
  }
  function rowFcRaw(n: any): number {
    const v = n.pressureResistance != null && n.pressureResistance !== '' ? n.pressureResistance : n.fc;
    return Number(v) || 0;
  }
  function rowIrsaliye(n: any): string {
    return n.wayBillNumber || n.irsaliye || '';
  }
  function rowBoyut(n: any): string {
    return n.sampleSize?.name || n.numuneBoyutu || '';
  }

  /** Aynı numune satırı JSON/sync tekrarında iki kez gelirse toplam şişer (ör. 12/24 + yarısı “–”). */
  function rowNumuneUniqueKey(n: any): string {
    const id = n.id != null && String(n.id).trim() !== '' ? String(n.id).trim() : '';
    if (id) return `id:${id}`;
    const brn = String(n.brnNo || '').trim();
    const lab = String(n.labNo || n.labReportNo || '').trim();
    const td = String(n.takeDate || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 19);
    const cg = rowCuringId(n);
    const irs = rowIrsaliye(n).trim();
    return `${brn}|${lab}|${td}|${cg}|${irs}`;
  }

  function sapmaTestEt(fcler: number[], labNolar: string[]) {
    if (fcler.length < 2) return [];
    const ort = fcler.reduce((a, b) => a + b, 0) / fcler.length;
    return fcler
      .map((fc, i) => ({ fc, labNo: labNolar[i] || `Numune-${i + 1}`, sapma: Math.abs((fc - ort) / ort) * 100, dusuk: fc < ort }))
      .filter(x => x.sapma >= 40)
      .map(x => ({ labNo: x.labNo, fc: parseFloat(x.fc.toFixed(2)), ortalama: parseFloat(ort.toFixed(2)), sapmaYuzde: parseFloat(x.sapma.toFixed(1)), dusuk: x.dusuk }));
  }

  const gruplar: Record<string, any> = {};
  src.rows.forEach((n: any) => {
    if (!n.takeDate) return;
    const tD = n.takeDate ? new Date(new Date(n.takeDate).getTime() + 3 * 3600000).toISOString().substring(0, 10) : '';
    const y = rowYObj(n);
    const yibfNo = rowYibfNo(n);
    const bolum = rowBolum(n);
    const grupKey = yibfNo ? `YBF_${yibfNo}__${tD}` : `BRN_${n.brnNo || 'x'}__${tD}`;

    if (!gruplar[grupKey]) {
      gruplar[grupKey] = {
        brnNolar: new Set(), betonSiniflari: new Set(), yapiElemler: new Set(),
        yibfNo, takeDate: tD,
        yapiDenetim: (y && y.ydf?.name) || n.yapiDenetim || '',
        contractor: y ? getStr(y.contractor) || getStr(y.contractorName) || '' : String(n.contractor || ''),
        buildingOwner: y
          ? getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || ''
          : String(n.buildingOwner || ''),
        buildingAddress: y ? y.buildingAddress || y.address || '' : String(n.buildingAddress || ''),
        numuneler: [],
      };
    }
    const g = gruplar[grupKey];
    if (n.brnNo) g.brnNolar.add(n.brnNo);
    const beton = rowBeton(n);
    if (beton) g.betonSiniflari.add(beton);
    if (bolum) g.yapiElemler.add(bolum);
    if (!g.buildingOwner) {
      g.buildingOwner = y
        ? getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || ''
        : String(n.buildingOwner || '');
    }
    if (!g.contractor) g.contractor = y ? getStr(y.contractor) || '' : String(n.contractor || '');
    if (!g.yapiDenetim && y && y.ydf) g.yapiDenetim = y.ydf.name || '';
    if (!g.yapiDenetim && n.yapiDenetim) g.yapiDenetim = n.yapiDenetim;
    g.numuneler.push(n);
  });

  const yaklasanlar: any[] = [];
  Object.values(gruplar).forEach((g: any) => {
    const takeMs = new Date(g.takeDate + 'T00:00:00').getTime();
    kurGunleri.forEach(kurGun => {
      const kirimMs  = takeMs + kurGun * 86400000;
      const kirimStr = new Date(kirimMs).toLocaleDateString('en-CA');
      const fark     = Math.round((kirimMs - bugunMs) / 86400000);
      if (!hedefFarklar.includes(fark)) return;

      const kurNumsRaw = g.numuneler.filter((n: any) => rowCuringId(n) === kurGun);
      const seenK = new Set<string>();
      const kurNums = kurNumsRaw.filter((n: any) => {
        const k = rowNumuneUniqueKey(n);
        if (seenK.has(k)) return false;
        seenK.add(k);
        return true;
      });
      if (!kurNums.length) return;

      const numuneBilgileri = kurNums
        .sort((a: any, b: any) => (a.takeDate || '') < (b.takeDate || '') ? -1 : 1)
        .map((n: any) => {
          const fc = rowFcRaw(n);
          return {
            labNo: n.labNo || n.labReportNo || '',
            fc: parseFloat(fc.toFixed(2)),
            kirildi: fc > 0,
            irsaliye: rowIrsaliye(n),
            takeTime: n.takeDate
              ? new Date(new Date(n.takeDate).getTime() + 3 * 3600000).toISOString().substring(11, 16)
              : '',
            boyut: rowBoyut(n),
          };
        });

      const kirilanlar = numuneBilgileri.filter((n: any) => n.kirildi);
      const fcler = kirilanlar.map((n: any) => n.fc);
      const fcOrtalama = fcler.length ? parseFloat((fcler.reduce((a: number, b: number) => a + b, 0) / fcler.length).toFixed(2)) : null;
      const sapmaliNumuneler = fcler.length >= 2 ? sapmaTestEt(fcler, kirilanlar.map((n: any) => n.labNo)) : [];
      const brnNolarArr = Array.from(g.brnNolar) as string[];

      yaklasanlar.push({
        brnNo: brnNolarArr.join(', '), brnNolar: brnNolarArr,
        yibfNo: g.yibfNo,
        betonSinifi: Array.from(g.betonSiniflari as Set<string>).filter(Boolean).join(', '),
        yapiElem: Array.from(g.yapiElemler as Set<string>).filter(Boolean).join(', '),
        takeDate: g.takeDate, kirimTarihi: kirimStr, kurGun, farkGun: fark,
        yapiDenetim: g.yapiDenetim, contractor: g.contractor,
        buildingOwner: g.buildingOwner, buildingAddress: g.buildingAddress,
        toplamSayisi: kurNums.length, kirilmisSayisi: kirilanlar.length, kalanSayisi: kurNums.length - kirilanlar.length,
        numuneler: numuneBilgileri, fcOrtalama,
        sapmaliVar: sapmaliNumuneler.length > 0, sapmaliNumuneler,
        kirimGecti: kirimStr < bugunStr,
        tamamlandi: kirilanlar.length === kurNums.length && kurNums.length > 0,
      });
    });
  });

  yaklasanlar.sort((a, b) => a.kirimTarihi.localeCompare(b.kirimTarihi));
  return NextResponse.json({ ok: true, numuneler: yaklasanlar, lastSync: cache.sonGuncelleme }, { headers: ebistrHeaders });
}

// ── /api/ebistr/numuneler ─────────────────────────────────────────
function handleNumuneler(body: any) {
  const cache = getCache();
  const src = resolveNumunelerSource(cache);
  if (!src.rows.length) {
    const s = getStatus();
    if (!s.loggedIn) {
      return NextResponse.json(
        {
          ok: false,
          err: 'Sunucuda EBİSTR token yok. Vercel’de EBISTR_SERVER_TOKEN tanımlayın veya EBİSTR Ayar’dan token gönderin; /tmp her örnekte boşalabilir.',
          numuneler: [],
          lastSync: cache.sonGuncelleme,
          mailDurum: cache.mailDurum && typeof cache.mailDurum === 'object' ? cache.mailDurum : {},
        },
        { status: 200, headers: ebistrHeaders },
      );
    }
    ebistrScheduleSync(performSync());
    return NextResponse.json({ ok: false, err: 'İlk sync başladı; 10 sn sonra tekrar deneyin.' }, { status: 202, headers: ebistrHeaders });
  }

  const { basTarih, bitTarih, filtre } = body;
  const bugunStr = new Date().toLocaleDateString('en-CA');
  let liste: any[] = src.rows;

  if (filtre && filtre !== 'hepsi') {
    liste = liste.filter((n: any) => {
      const d = (n.breakDate || '').substring(0, 10); if (!d) return false;
      if (filtre === 'bugun') return d === bugunStr;
      if (filtre === 'yarin') {
        const y = new Date(); y.setDate(y.getDate() + 1);
        return d === y.toLocaleDateString('en-CA');
      }
      if (filtre === 'bu_hafta') {
        const gun = new Date().getDay() || 7;
        const pzt = new Date(); pzt.setDate(pzt.getDate() - gun + 1); pzt.setHours(0,0,0,0);
        const paz = new Date(pzt); paz.setDate(pzt.getDate() + 6);
        return d >= pzt.toLocaleDateString('en-CA') && d <= paz.toLocaleDateString('en-CA');
      }
      return true;
    });
  } else if (basTarih || bitTarih) {
    const basMs = basTarih ? new Date(basTarih + 'T00:00:00').getTime() : 0;
    const bitMs = bitTarih ? new Date(bitTarih + 'T23:59:59').getTime() : Infinity;
    liste = liste.filter((n: any) => { const d = n.breakDate; if (!d) return false; const t = new Date(d).getTime(); return t >= basMs && t <= bitMs; });
  }

  const normalized = src.fromJsonSnapshot ? liste : liste.map(normalizeNumune);
  const mailDurum = cache.mailDurum && typeof cache.mailDurum === 'object' ? cache.mailDurum : {};
  return NextResponse.json({
    ok: true,
    numuneler: normalized,
    toplam: normalized.length,
    lastSync: cache.sonGuncelleme,
    mailDurum,
    fromJsonSnapshot: src.fromJsonSnapshot,
  }, { headers: ebistrHeaders });
}

// ── /api/ebistr/csv-base64 ────────────────────────────────────────
function handleCsvBase64(body: any) {
  const cache = getCache();
  const src = resolveNumunelerSource(cache);
  if (!src.rows.length) {
    const s = getStatus();
    if (!s.loggedIn) {
      return NextResponse.json(
        { ok: false, err: 'Sunucuda EBİSTR token yok.', lastSync: cache.sonGuncelleme },
        { status: 200, headers: ebistrHeaders },
      );
    }
    ebistrScheduleSync(performSync());
    return NextResponse.json({ ok: false, err: 'İlk sync başladı.' }, { status: 202, headers: ebistrHeaders });
  }

  let liste: any[] = src.rows;
  const { basTarih, bitTarih } = body;
  if (basTarih || bitTarih) {
    const basMs = basTarih ? new Date(basTarih + 'T00:00:00').getTime() : 0;
    const bitMs = bitTarih ? new Date(bitTarih + 'T23:59:59').getTime() : Infinity;
    liste = liste.filter((n: any) => { const d = n.breakDate; if (!d) return false; const t = new Date(d).getTime(); return t >= basMs && t <= bitMs; });
  }

  const q = (v: any) => { if (v === undefined || v === null) return '""'; let s = String(v); if (typeof v === 'object') s = JSON.stringify(v); return '"' + s.replace(/"/g, '""') + '"'; };
  const headers = ['BRN No','Lab No','Rapor No','Numune Alınış Tarihi','Kırım Tarihi','Kür (Gün)','Beton Sınıfı','fck (Silindir)','fck (Küp)','Numune Boyutu','fc (MPa)','İrsaliye No','Yapı Bölümü','Yapı Denetim','Müteahhit','Yapı Sahibi','Şantiye Adresi','Üretici','m3 (Mevcut)','m3 (Günlük)','Durum','Hesap Dışı','YİBF'].map(h => `"${h}"`).join(';');

  const satirlar = [headers];
  if (src.fromJsonSnapshot) {
    liste.forEach((n: any) => {
      const fcVal = typeof n.fc === 'number' ? n.fc : (Number(n.pressureResistance) || 0);
      const yid = typeof n.yibf === 'string' ? n.yibf : (n.yibf?.number || n.yibfNo || n.yibf?.id || '');
      const hesapDisi = n.hesapDisi === true || n.outOfCalculation === true;
      satirlar.push([
        q(n.brnNo), q(n.labNo), q(n.labReportNo),
        q((n.takeDate||'').replace('T',' ').substring(0,16)),
        q((n.breakDate||'').replace('T',' ').substring(0,16)),
        q(n.curingGun ?? n.curingTime?.id ?? ''),
        q(n.betonSinifi || n.concreteClass?.name || ''),
        q(n.fckSil ?? n.concreteClass?.resistance ?? ''),
        q(n.fckKup ?? n.concreteClass?.resistanceCube ?? ''),
        q(n.numuneBoyutu || n.sampleSize?.name || ''),
        q(fcVal.toFixed(4)),
        q(n.irsaliye || n.wayBillNumber || ''),
        q(n.yapiElem || n.structuralComponent || ''),
        q(n.yapiDenetim || n.yibf?.ydf?.name || ''),
        q(n.contractor || ''), q(n.buildingOwner || ''), q(n.buildingAddress || ''),
        q(n.manufacturer || ''),
        q(n.m3 ?? n.totalConcreteQuantityByCurrent ?? 0),
        q(n.totalM3 ?? n.totalConcreteQuantityByDaily ?? 0),
        q(n.state || ''), q(hesapDisi ? 'Evet' : 'Hayır'), q(yid),
      ].join(';'));
    });
  } else {
    liste.forEach((n: any) => {
      const yd = (n.yibf?.ydf) ? n.yibf.ydf.name : '';
      const y  = n.yibf || {};
      const own = y.buildingOwner || y.ownerName || y.owner?.name || '';
      const ctr = y.contractor || y.contractorName || y.contractor?.name || '';
      const adr = y.buildingAddress || y.address || '';
      const yid = y.number || y.yibfNo || y.id || '';
      satirlar.push([
        q(n.brnNo), q(n.labNo), q(n.labReportNo),
        q((n.takeDate||'').replace('T',' ').substring(0,16)),
        q((n.breakDate||'').replace('T',' ').substring(0,16)),
        q(n.curingTime?.id||''), q(n.concreteClass?.name||''),
        q(n.concreteClass?.resistance||''), q(n.concreteClass?.resistanceCube||''),
        q(n.sampleSize?.name||''), q((n.pressureResistance||0).toFixed(4)),
        q(n.wayBillNumber), q(n.structuralComponent),
        q(yd), q(ctr), q(own), q(adr), q(n.manufacturer),
        q(n.totalConcreteQuantityByCurrent||0), q(n.totalConcreteQuantityByDaily||0),
        q(n.state), q(n.outOfCalculation ? 'Evet' : 'Hayır'), q(yid),
      ].join(';'));
    });
  }

  const csvText = '\uFEFF' + satirlar.join('\n');
  const base64 = Buffer.from(csvText, 'utf-8').toString('base64');
  return NextResponse.json({ ok: true, base64, satirSayisi: liste.length, lastSync: cache.sonGuncelleme }, { headers: ebistrHeaders });
}

// ── /api/ebistr/kurleme ───────────────────────────────────────────
function handleKurleme() {
  const cache = getCache();
  const src = resolveNumunelerSource(cache);
  let raw: any[] = cache.rawNumuneler.length ? cache.rawNumuneler : cache.numuneler;
  let fromSnap = false;
  if (!raw.length && src.rows.length) {
    raw = src.rows;
    fromSnap = src.fromJsonSnapshot;
  }
  if (!raw.length) {
    const s = getStatus();
    if (!s.loggedIn) {
      return NextResponse.json(
        { ok: false, err: 'Sunucuda EBİSTR token yok.', numuneler: [], lastSync: cache.sonGuncelleme },
        { status: 200, headers: ebistrHeaders },
      );
    }
    ebistrScheduleSync(performSync());
    return NextResponse.json({ ok: false, err: 'İlk sync başladı; 10 sn sonra tekrar deneyin.' }, { status: 202, headers: ebistrHeaders });
  }
  const cutoffMs = Date.now() - 45 * 86400000;
  const active = raw.filter((n: any) => n.takeDate && new Date(n.takeDate).getTime() >= cutoffMs);
  const numuneler = fromSnap ? active : active.map(normalizeNumune);
  return NextResponse.json({ ok: true, numuneler, toplam: numuneler.length, lastSync: cache.sonGuncelleme, fromJsonSnapshot: fromSnap }, { headers: ebistrHeaders });
}

// ── /api/ebistr/taglar ────────────────────────────────────────────
function handleTaglar() {
  const cache = getCache();
  const s = getStatus();
  const raw = cache.taglar || [];
  if (!raw.length && s.loggedIn && !s.isSyncing) {
    ebistrScheduleSync(performSync());
  }
  const normalized = raw.map((item: any) => {
    const isYdk = !item.contractor;
    const firma = isYdk ? (item.requestDepartment?.name || '') : (item.contractor || '');
    if (!firma) return null;
    const belge = isYdk ? String(item.requestDepartment?.documentNo || '') : String(item.contractorDocumentNumber || item.requestDepartment?.documentNo || '');
    return { firma, belge, top: item.totalCount || 0, kul: item.usedCount || 0, kal: item.remaining || 0, tip: isYdk ? 'ydk' : 'mutahhit', rawId: item.id };
  }).filter(Boolean);

  return NextResponse.json({ ok: true, taglar: normalized, toplam: normalized.length, lastSync: cache.sonGuncelleme }, { headers: ebistrHeaders });
}
