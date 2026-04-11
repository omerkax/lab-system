/**
 * EBİSTR Sync Engine — Next.js versiyonu
 * ebistr-proxy.js'nin tüm mantığı buraya taşındı.
 * instrumentation.ts tarafından sunucu başlangıcında başlatılır.
 */

import fs from 'fs';
import path from 'path';
import { ebistrNumuneRowKey } from '@/lib/ebistr-numune-key';

const EBISTR_API  = 'https://business.ebistr.com/api';
const DATA_DIR    = path.join(process.cwd(), 'data');
const TOKEN_FILE  = path.join(DATA_DIR, 'ebistr_token.json');
const CACHE_FILE  = path.join(DATA_DIR, 'ebistr_cache.json');

// ── Global durum (process ömrü boyunca yaşar) ──────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _ebistr: {
    tokens: string[];
    cache: EbistrCache;
    syncing: boolean;
    lastSyncAttempt: string | null;
  } | undefined;
}

interface EbistrCache {
  sonGuncelleme: string | null;
  numuneler: any[];
  rawNumuneler: any[];
  taglar: any[];
  telemetry: any[];
  alarms: any[];
  lastTelemetrySync: string | null;
  lastAlarmSync: string | null;
  /** BRN / rapor no → mail gönderildi (sunucuda kalıcı, tüm kullanıcılar paylaşır) */
  mailDurum: Record<string, boolean>;
}

let telemetrySyncing = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getState() {
  if (!globalThis._ebistr) {
    globalThis._ebistr = {
      tokens: [],
      cache: { 
        sonGuncelleme: null, 
        numuneler: [], 
        rawNumuneler: [], 
        taglar: [],
        telemetry: [],
        alarms: [],
        lastTelemetrySync: null,
        lastAlarmSync: null,
        mailDurum: {},
      },
      syncing: false,
      lastSyncAttempt: null,
    };
  }
  return globalThis._ebistr;
}

// ── Dosya → bellek ─────────────────────────────────────────────────
export function loadToken() {
  ensureDataDir();
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      if (saved?.tokens && Array.isArray(saved.tokens)) {
        getState().tokens = saved.tokens;
        console.log(`[ebistr] ${getState().tokens.length} token yüklendi.`);
      } else if (saved?.token) {
        getState().tokens = [saved.token];
      }
    }
  } catch (e: any) { console.warn('[ebistr] Token yüklenemedi:', e.message); }
}

export function loadCache() {
  ensureDataDir();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      getState().cache = saved;
      const st = getState().cache;
      if (!st.mailDurum || typeof st.mailDurum !== 'object') st.mailDurum = {};
      console.log(`[ebistr] Cache yüklendi: ${saved.numuneler?.length ?? 0} kayıt (Son: ${saved.sonGuncelleme})`);
    }
  } catch (e: any) { console.warn('[ebistr] Cache okunamadı:', e.message); }
}

/** İstemcilerden gelen mail gönderildi bayraklarını birleştirir ve diske yazar */
export function mergeMailDurum(merge: Record<string, boolean>) {
  const st = getState().cache;
  if (!st.mailDurum || typeof st.mailDurum !== 'object') st.mailDurum = {};
  for (const k of Object.keys(merge || {})) {
    if (merge[k] === true && k) st.mailDurum[k] = true;
  }
  saveCache();
}

export function saveCache() {
  ensureDataDir();
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(getState().cache));
  } catch (e: any) { console.error('[ebistr] Cache kaydedilemedi:', e.message); }
}

// ── Token yönetimi ─────────────────────────────────────────────────
export function addToken(token: string) {
  const state = getState();
  state.tokens = state.tokens.filter(t => t !== token);
  state.tokens.unshift(token);
  if (state.tokens.length > 5) state.tokens = state.tokens.slice(0, 5);
  ensureDataDir();
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ tokens: state.tokens, date: new Date().toISOString() }));
    console.log(`[ebistr] Token eklendi. Toplam: ${state.tokens.length}`);
  } catch {}
}

export function clearTokens() {
  getState().tokens = [];
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
}

export function getStatus() {
  const state = getState();
  return {
    loggedIn: state.tokens.length > 0,
    tokenSayisi: state.tokens.length,
    proxyVersion: 'next-integrated-v1',
    lastSync: state.cache.sonGuncelleme,
    isSyncing: state.syncing,
    cacheSize: state.cache.numuneler.length,
    tagSayisi: state.cache.taglar.length,
  };
}

// ── Senkronizasyon motoru ──────────────────────────────────────────
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<any> => {
  let lastErr = '';
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return await res.json();
      if (res.status === 401 || res.status === 403) throw new Error('TOKEN_EXPIRED');
      lastErr = `HTTP ${res.status}`;
    } catch (e: any) {
      if (e.message === 'TOKEN_EXPIRED') throw e;
      lastErr = e.message;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(lastErr);
};

export async function performSync(): Promise<void> {
  const state = getState();
  if (state.syncing || state.tokens.length === 0) return;
  state.syncing = true;
  state.lastSyncAttempt = new Date().toISOString();
  console.log(`\n[ebistr] ${new Date().toLocaleTimeString('tr-TR')} senkronizasyon başladı (${state.tokens.length} token)...`);

  try {
    // Çalışan token bul
    let activeToken = '';
    for (const t of state.tokens) {
      try {
        const testRes = await fetch(`${EBISTR_API}/concreteSample/findAll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}`, 'Origin': 'https://business.ebistr.com', 'Referer': 'https://business.ebistr.com/' },
          body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 1 }),
        });
        if (testRes.ok || (testRes.status !== 401 && testRes.status !== 403)) { activeToken = t; break; }
      } catch { activeToken = t; break; }
    }
    if (!activeToken) { console.warn('[ebistr] Geçerli token yok.'); return; }

    const takeBas = new Date();
    takeBas.setDate(takeBas.getDate() - 45);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const commonHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
      'Origin': 'https://business.ebistr.com',
      'Referer': 'https://business.ebistr.com/',
    };

    const commonBody = {
      requireTotalCount: true,
      userData: {},
      filter: ['takeDate', '>=', fmt(takeBas) + 'T00:00:00'],
      expand: [
        'yibf', 'yibf.ydf', 'yibf.contractor', 'yibf.buildingOwner', 'yibf.owner', 'yibf.applicant', 'yibf.number',
        'concreteTakeSample', 'concreteWorksiteOut', 'concreteCure'
      ],
    };

    // BRN rapor haritası
    let brnRaporHaritasi: Record<string, any> = {};
    try {
      const brnData = await fetchWithRetry(`${EBISTR_API}/concreteBrnReport/findAll`, {
        method: 'POST', headers: commonHeaders,
        body: JSON.stringify({ requireTotalCount: false, userData: {}, expand: commonBody.expand }),
      });
      (brnData?.items || brnData?.data || []).forEach((r: any) => { if (r.brnNo) brnRaporHaritasi[r.brnNo] = r; });
      console.log(`[ebistr] ${Object.keys(brnRaporHaritasi).length} BRN raporu yüklendi.`);
    } catch (e: any) { console.warn('[ebistr] BRN rapor alınamadı:', e.message); }

    // Toplam sayı
    const ilk = await fetchWithRetry(`${EBISTR_API}/concreteSample/findAll`, {
      method: 'POST', headers: commonHeaders,
      body: JSON.stringify({ ...commonBody, skip: 0, take: 1 }),
    });
    const total = Math.min(ilk.totalCount || 0, 100000);
    let samples: any[] = [];
    const TAKE = 10, CONC = 10;

    for (let skip = 0; skip < total; skip += TAKE * CONC) {
      const promises = [];
      for (let c = 0; c < CONC; c++) {
        const s = skip + (c * TAKE);
        if (s >= total) break;
        promises.push(
          fetchWithRetry(`${EBISTR_API}/concreteSample/findAll`, {
            method: 'POST', headers: commonHeaders,
            body: JSON.stringify({ ...commonBody, skip: s, take: TAKE }),
          }).then((d: any) => (d?.items || d?.data || []))
        );
      }
      const results = await Promise.all(promises);
      results.forEach(items => { samples = samples.concat(items); });
      process.stdout.write(`\r[ebistr] İlerleme: ${samples.length}/${total}`);
    }

    // BRN ile zenginleştir
    if (Object.keys(brnRaporHaritasi).length > 0) {
      const getStr = (v: any) => { if (!v) return ''; if (typeof v === 'string') return v; return v.name || v.title || v.fullName || ''; };
      samples.forEach(n => {
        const rapor = brnRaporHaritasi[n.brnNo];
        if (!rapor) return;
        if (!n.yibf) n.yibf = {};
        const ry = rapor.yibf || rapor;
        if (!getStr(n.yibf.buildingOwner) && ry.buildingOwner) n.yibf.buildingOwner = ry.buildingOwner;
        if (!getStr(n.yibf.contractor) && ry.contractor) n.yibf.contractor = ry.contractor;
        if (!n.yibf.buildingAddress && ry.buildingAddress) n.yibf.buildingAddress = ry.buildingAddress;
      });
    }

    state.cache.rawNumuneler = samples;
    state.cache.numuneler = samples;
    state.cache.sonGuncelleme = new Date().toISOString();

    // Çip / tag senkronizasyonu
    try {
      const tagData = await fetchWithRetry(`${EBISTR_API}/tag/findAllFirm`, {
        method: 'POST',
        headers: { ...commonHeaders, 'Origin': 'https://ebistr.com', 'Referer': 'https://ebistr.com/' },
        body: JSON.stringify({ requireTotalCount: true, searchOperation: 'contains', searchValue: null, skip: 0, sort: [{ selector: 'department.name', desc: false }], take: 10000, totalSummary: [], userData: {} }),
      });
      state.cache.taglar = tagData?.items || tagData?.data || (Array.isArray(tagData) ? tagData : []);
      console.log(`\n[ebistr] ${state.cache.taglar.length} çip kaydı yüklendi.`);
    } catch (e: any) { console.warn('\n[ebistr] Çip verisi alınamadı:', e.message); }

    // Telemetri senkronizasyonu
    try {
      const telData = await fetchWithRetry(`${EBISTR_API}/telemetryData/findAll`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 2000, sort: [{ selector: 'timestamp', desc: true }] }),
      });
      state.cache.telemetry = telData?.items || telData?.data || [];
      state.cache.lastTelemetrySync = new Date().toISOString();
      console.log(`[ebistr] ${state.cache.telemetry.length} telemetri kaydı yüklendi.`);
    } catch (e: any) { console.warn('[ebistr] Telemetri alınamadı:', e.message); }

    // Alarm senkronizasyonu
    try {
      const alarmData = await fetchWithRetry(`${EBISTR_API}/alarm/findAll`, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 50 }),
      });
      state.cache.alarms = alarmData?.items || alarmData?.data || [];
      state.cache.lastAlarmSync = new Date().toISOString();
      console.log(`[ebistr] ${state.cache.alarms.length} alarm kaydı yüklendi.`);
    } catch (e: any) { console.warn('[ebistr] Alarm alınamadı:', e.message); }

    saveCache();
    console.log(`\n[ebistr] ✅ Sync tamamlandı: ${samples.length} numune.`);

    // data/ebistr-numuneler.json'a da merge ile kaydet (HTTP olmadan, doğrudan)
    try {
      const normalized = samples.map(normalizeNumune);
      const numunerFile = path.join(DATA_DIR, 'ebistr-numuneler.json');
      let existing: any[] = [];
      try { existing = JSON.parse(fs.readFileSync(numunerFile, 'utf-8')); } catch {}
      if (!Array.isArray(existing)) existing = [];

      const existingKeys = new Set(existing.map(ebistrNumuneRowKey));
      const onlyNew = normalized.filter((item: any) => !existingKeys.has(ebistrNumuneRowKey(item)));
      const merged = [...existing, ...onlyNew];
      fs.writeFileSync(numunerFile, JSON.stringify(merged, null, 2), 'utf-8');
      console.log(`[ebistr] data/ebistr-numuneler.json güncellendi: +${onlyNew.length} yeni, toplam ${merged.length} kayıt.`);
    } catch (e: any) {
      console.warn('[ebistr] ebistr-numuneler.json yazılamadı:', e.message);
    }

  } catch (e: any) {
    console.error('\n[ebistr] ❌ Sync hatası:', e.message);
    if (e.message === 'TOKEN_EXPIRED') {
      const bad = state.tokens[0];
      state.tokens = state.tokens.filter(t => t !== bad);
      console.warn('[ebistr] Token geçersiz, silindi. Kalan:', state.tokens.length);
    }
  } finally {
    state.syncing = false;
  }
}

// ── Normalizasyon ──────────────────────────────────────────────────
export function normalizeNumune(n: any) {
  const y = n.yibf || {};
  const yd = (y.ydf?.name) ? y.ydf.name : '';
  const getStr = (v: any) => { if (!v) return ''; if (typeof v === 'string') return v; return v.name || v.title || v.fullName || ''; };
  const own = getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || getStr(y.applicant) || '';
  const ctr = getStr(y.contractor) || getStr(y.contractorName) || '';
  const adr = y.buildingAddress || y.address || '';
  const yibfNo = y.no || y.number || y.yibfNo || y.registrationNo || (y.id ? String(y.id) : '');
  const fc = parseFloat((n.pressureResistance || 0).toFixed(4));

  const tzFix = (s: string) => { if (!s) return ''; const d = new Date(new Date(s).getTime() + 3 * 60 * 60 * 1000); return d.toISOString().substring(0, 16).replace('T', ' '); };

  const getStr2 = (v: any) => { if (v === null || v === undefined) return ''; if (typeof v === 'string') return v.trim(); if (typeof v === 'number') return v !== 0 ? String(v) : ''; return (v.name || v.title || v.code || v.value || '').trim(); };
  const parts: string[] = [];
  const blok = getStr2(n.block) || getStr2(n.buildingBlock) || getStr2(n.blok) || '';
  const kat  = getStr2(n.floor) || getStr2(n.buildingFloor) || getStr2(n.storey) || getStr2(n.concreteFloor) || '';
  const aks  = getStr2(n.axis) || getStr2(n.aks) || getStr2(n.buildingAxis) || '';
  const kot  = getStr2(n.elevation) || getStr2(n.kot) || '';
  const elem = getStr2(n.structuralComponent) || getStr2(n.concreteLocation) || '';
  if (blok) parts.push('Bl:' + blok);
  if (kat)  parts.push('K:' + kat);
  if (aks)  parts.push('Aks:' + aks);
  if (kot)  parts.push('Kot:' + kot);
  if (elem) parts.push(elem);

  return {
    brnNo:          n.brnNo || '',
    labNo:          n.labNo || '',
    labReportNo:    n.labReportNo || '',
    takeDate:       tzFix(n.takeDate),
    breakDate:      tzFix(n.breakDate),
    curingGun:      n.curingTime ? (n.curingTime.id || 0) : 0,
    betonSinifi:    n.concreteClass?.name || '',
    fckSil:         n.concreteClass?.resistance || 0,
    fckKup:         n.concreteClass?.resistanceCube || 0,
    numuneBoyutu:   n.sampleSize?.name || '',
    fc,
    irsaliye:       n.wayBillNumber || '',
    yapiElem:       parts.join(' / '),
    yapiDenetim:    yd,
    contractor:     ctr,
    buildingOwner:  own,
    buildingAddress: adr,
    manufacturer:   getStr(n.manufacturer) || getStr(n.concreteFirm) || getStr(n.freshConcreteFirm) || '',
    m3:             n.totalConcreteQuantityByCurrent || 0,
    totalM3:        n.totalConcreteQuantityByDaily || 0,
    hesapDisi:      !!n.outOfCalculation,
    yibf:           yibfNo,
    worksiteOutDate: tzFix(n.worksiteOutDate || n.concreteWorksiteOut?.date),
    cureDate:       tzFix(n.cureDate || n.concreteCure?.date || n.concreteCure?.startDate),
    state:          (() => {
      const s = n.state;
      if (s == null || s === '') return '';
      if (typeof s === 'string') return s.trim();
      if (typeof s === 'object') return String((s as any).name || (s as any).code || (s as any).title || (s as any).value || '').trim();
      return String(s);
    })(),
  };
}

export function getCache(): EbistrCache { return getState().cache; }
export function getTokens(): string[] { return getState().tokens; }

// ── Sadece telemetri + alarm sync (token varsa) ───────────────────
export async function syncTelemetriOnly(): Promise<void> {
  const state = getState();
  if (telemetrySyncing || state.tokens.length === 0) return;
  telemetrySyncing = true;
  let activeToken = '';
  for (const t of state.tokens) {
    try {
      const res = await fetch(`${EBISTR_API}/telemetryData/findAll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}`, 'Origin': 'https://business.ebistr.com', 'Referer': 'https://business.ebistr.com/' },
        body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 1 }),
      });
      if (res.ok || (res.status !== 401 && res.status !== 403)) { activeToken = t; break; }
    } catch { activeToken = t; break; }
  }
  if (!activeToken) { telemetrySyncing = false; return; }
  const hdrs: HeadersInit = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeToken}`, 'Origin': 'https://business.ebistr.com', 'Referer': 'https://business.ebistr.com/' };
  try {
    try {
      const telData = await fetchWithRetry(`${EBISTR_API}/telemetryData/findAll`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 2000, sort: [{ selector: 'timestamp', desc: true }] }),
      });
      state.cache.telemetry = telData?.items || telData?.data || [];
      state.cache.lastTelemetrySync = new Date().toISOString();
    } catch (e: any) { console.warn('[ebistr] syncTelemetriOnly telemetri hatası:', e.message); }
    try {
      const alarmData = await fetchWithRetry(`${EBISTR_API}/alarm/findAll`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 50 }),
      });
      state.cache.alarms = alarmData?.items || alarmData?.data || [];
      state.cache.lastAlarmSync = new Date().toISOString();
    } catch (e: any) { console.warn('[ebistr] syncTelemetriOnly alarm hatası:', e.message); }
    saveCache();
  } finally {
    telemetrySyncing = false;
  }
}

// ── Engine başlatma (instrumentation.ts'ten çağrılır) ─────────────
export function initEbistrEngine() {
  console.log('[ebistr] Engine başlatılıyor...');
  loadToken();
  loadCache();

  // 5 saniye sonra ilk sync
  setTimeout(() => performSync().catch(console.error), 5_000);

  // Her 5 dakikada bir sync (Near-live tracking)
  setInterval(() => performSync().catch(console.error), 5 * 60 * 1000);

  console.log('[ebistr] Engine hazır — tam senkron her 5 dakikada bir (ilk sync ~5 sn sonra).');
}
