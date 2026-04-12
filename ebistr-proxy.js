/**
 * EBİSTR Proxy Server v5 — Akıllı Hafıza & Turbo Mod (10x10)
 * Çalıştırmak: node ebistr-proxy.js
 * Gerekli: npm install express cors node-fetch@2 nodemailer
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3737;

// .env dosyasını oku (varsa)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Payload çok büyükse JSON hata döndür (varsayılan HTML 413 değil)
app.use(function(err, req, res, next) {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ ok: false, err: 'Payload çok büyük. Mail HTML boyutunu azaltın.' });
    }
    next(err);
});

const EBISTR_API = 'https://business.ebistr.com/api';
const TOKEN_FILE = path.join(__dirname, 'ebistr_token.json');
const CACHE_FILE = path.join(__dirname, 'ebistr_cache.json');

// Global Durum
let authTokens = [];  // Birden fazla kullanıcı token'ı (extension'dan gelen sırayla)
let ebistrCache = {
    sonGuncelleme: null,
    numuneler: [],
    rawNumuneler: [],  // Ham API verisi — debug-fields endpoint için
    taglar: []         // Çip/tag kayıtları
};
let isSyncing = false;

// ── HAFIZA İŞLEMLERİ ──────────────────────────────────────────────
function loadToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            if (saved && saved.tokens && Array.isArray(saved.tokens)) {
                authTokens = saved.tokens;
                console.log(`✅ ${authTokens.length} token yüklendi.`);
            } else if (saved && saved.token) {
                // Geriye dönük uyumluluk
                authTokens = [saved.token];
                console.log('✅ Kayıtlı token yüklendi.');
            }
        }
    } catch (e) { console.warn('⚠️ Token yüklenemedi:', e.message); }
}

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            ebistrCache = saved;
            console.log(`✅ Yerel hafıza yüklendi: ${ebistrCache.numuneler.length} kayıt. (Son Senk: ${ebistrCache.sonGuncelleme})`);
        }
    } catch (e) { console.warn('⚠️ Hafıza dosyası okunamadı:', e.message); }
}

function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(ebistrCache));
    } catch (e) { console.error('❌ Hafıza kaydedilemedi:', e.message); }
}

loadToken();
loadCache();

// ── SENKRONİZASYON MOTORU ─────────────────────────────────────────
async function performSync() {
    if (isSyncing || authTokens.length === 0) return;
    isSyncing = true;
    console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Arka plan senkronizasyonu başladı (${authTokens.length} token)...`);

    try {
        const takeBas = new Date();
        takeBas.setDate(takeBas.getDate() - 45); // 45 günlük emniyetli pencere
        const fmt = d => d.toISOString().split('T')[0];

        // Çalışan token'ı bul (sırayla dene)
        let activeToken = '';
        for (const t of authTokens) {
            try {
                const testRes = await fetch(`${EBISTR_API}/concreteSample/findAll`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${t}`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Origin': 'https://business.ebistr.com',
                        'Referer': 'https://business.ebistr.com/'
                    },
                    body: JSON.stringify({ requireTotalCount: true, userData: {}, take: 1 })
                });
                if (testRes.ok || testRes.status === 200) { activeToken = t; break; }
                if (testRes.status === 401 || testRes.status === 403) {
                    console.log(`⚠️ Token geçersiz (${t.substring(0,10)}...), sonraki deneniyor...`);
                    continue;
                }
                // Başka hata: yine de bu token'la devam et
                activeToken = t; break;
            } catch (e) { activeToken = t; break; }
        }
        if (!activeToken) {
            console.warn('⚠️ Geçerli token bulunamadı. Sync iptal.');
            isSyncing = false;
            return;
        }
        console.log(`🔑 Aktif token: ${activeToken.substring(0,15)}...`);

        const fetchWithRetry = async (url, options, retries = 3) => {
            let sonHata = null;
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (response.ok) return await response.json();
                    if (response.status === 401 || response.status === 403) throw new Error('TOKEN_EXPIRED');
                    sonHata = `HTTP ${response.status}`;
                } catch (e) {
                    if (e.message === 'TOKEN_EXPIRED') throw e;
                    sonHata = e.message;
                    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                }
            }
            throw new Error(sonHata);
        };

        const commonHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Origin': 'https://business.ebistr.com',
            'Referer': 'https://business.ebistr.com/'
        };

        const commonBody = {
            requireTotalCount: true,
            userData: {},
            filter: ['takeDate', '>=', fmt(takeBas) + 'T00:00:00'],
            expand: ['yibf', 'yibf.ydf', 'yibf.contractor', 'yibf.buildingOwner', 'yibf.owner', 'yibf.applicant', 'yibf.number']
        };

        // ── BRN Rapor Önbelleği ──────────────────────────────────────
        // concreteBrnReport'tan buildingOwner, contractor, buildingAddress çek
        let brnRaporHaritasi = {};
        try {
            // Not: concreteBrnReport filtre kabul etmiyor, filtresiz çek
            const brnRaporBody = {
                requireTotalCount: false,
                userData: {},
                expand: ['yibf', 'yibf.ydf', 'yibf.contractor', 'yibf.buildingOwner', 'yibf.owner', 'yibf.applicant', 'yibf.number']
            };
            const brnRaporData = await fetchWithRetry(`${EBISTR_API}/concreteBrnReport/findAll`, {
                method: 'POST', headers: commonHeaders, body: JSON.stringify(brnRaporBody)
            });
            (brnRaporData?.items || brnRaporData?.data || []).forEach(r => {
                if (r.brnNo) brnRaporHaritasi[r.brnNo] = r;
            });
            console.log(`\n📋 ${Object.keys(brnRaporHaritasi).length} BRN raporu yüklendi.`);
        } catch (e) {
            console.warn('⚠️ BRN rapor verisi alınamadı:', e.message);
        }

        const ilkData = await fetchWithRetry(`${EBISTR_API}/concreteSample/findAll`, {
            method: 'POST', headers: commonHeaders, body: JSON.stringify({ ...commonBody, skip: 0, take: 1 })
        });

        const totalCount = Math.min(ilkData.totalCount || 0, 100000);
        let tumNumuneler = [];
        const TAKE_SIZE = 10;
        const CONCURRENCY = 10;

        for (let skip = 0; skip < totalCount; skip += TAKE_SIZE * CONCURRENCY) {
            const promises = [];
            for (let c = 0; c < CONCURRENCY; c++) {
                const s = skip + (c * TAKE_SIZE);
                if (s >= totalCount) break;
                promises.push((async (curS) => {
                    const data = await fetchWithRetry(`${EBISTR_API}/concreteSample/findAll`, {
                        method: 'POST', headers: commonHeaders, body: JSON.stringify({ ...commonBody, skip: curS, take: TAKE_SIZE })
                    });
                    return (data && (data.items || data.data)) || [];
                })(s));
            }
            const results = await Promise.all(promises);
            results.forEach(items => { tumNumuneler = tumNumuneler.concat(items); });
            process.stdout.write(`\r📡 Senk İlerleme: ${tumNumuneler.length}/${totalCount}`);
        }

        // ── BRN Rapor verisiyle zenginleştir ────────────────────────
        // buildingOwner, contractor, buildingAddress bilgilerini ekle
        if (Object.keys(brnRaporHaritasi).length > 0) {
            const getStr = v => {
                if (!v) return '';
                if (typeof v === 'string') return v;
                return v.name || v.title || v.fullName || '';
            };
            tumNumuneler.forEach(n => {
                const rapor = brnRaporHaritasi[n.brnNo];
                if (!rapor) return;
                if (!n.yibf) n.yibf = {};
                const ry = rapor.yibf || rapor;
                // Eksik alanları BRN rapor verisinden tamamla
                if (!getStr(n.yibf.buildingOwner) && ry.buildingOwner) n.yibf.buildingOwner = ry.buildingOwner;
                if (!getStr(n.yibf.contractor) && ry.contractor) n.yibf.contractor = ry.contractor;
                if (!n.yibf.buildingAddress && ry.buildingAddress) n.yibf.buildingAddress = ry.buildingAddress;
            });
        }

        ebistrCache.rawNumuneler = tumNumuneler;  // ham veri — debug için
        ebistrCache.numuneler = tumNumuneler;
        ebistrCache.sonGuncelleme = new Date().toISOString();

        // ── Çip / Tag Senkronizasyonu ─────────────────────────────
        try {
            const tagBody = {
                requireTotalCount: true,
                searchOperation: 'contains',
                searchValue: null,
                skip: 0,
                sort: [{ selector: 'department.name', desc: false }],
                take: 10000,
                totalSummary: [],
                userData: {}
            };
            const tagData = await fetchWithRetry(`${EBISTR_API}/tag/findAllFirm`, {
                method: 'POST',
                headers: {
                    ...commonHeaders,
                    'Origin': 'https://ebistr.com',
                    'Referer': 'https://ebistr.com/'
                },
                body: JSON.stringify(tagBody)
            });
            ebistrCache.taglar = tagData?.items || tagData?.data || (Array.isArray(tagData) ? tagData : []);
            console.log(`\n🏷️  ${ebistrCache.taglar.length} çip kaydı yüklendi.`);
        } catch (e) {
            console.warn('⚠️ Çip verisi alınamadı:', e.message);
        }

        saveCache();

        // Firestore Senkronizasyon (Opsiyonel ama istenen)
        await syncToFirestore(tumNumuneler);
        
        // Ham alan adlarını logla (yapı bölümü field tespiti için)
        if (tumNumuneler.length > 0) {
            const ornekN = tumNumuneler[0];
            const yapiAlanlar = Object.keys(ornekN).filter(k =>
                /block|floor|storey|axis|elev|kot|aks|blok|kat|yapielem|structural|location|component|position|manufacturer|firm|producer/i.test(k)
            );
            console.log(`\n🔍 Yapı bölümü & üretici ile ilgili API alanları:`, yapiAlanlar.length ? yapiAlanlar : 'bulunamadı');
            // Her ilgili alanın değerini göster
            yapiAlanlar.forEach(k => {
                const v = ornekN[k];
                if (v !== null && v !== undefined && v !== '')
                    console.log(`    ${k}:`, typeof v === 'object' ? JSON.stringify(v) : v);
            });
            console.log(`    Tüm alanlar:`, Object.keys(ornekN).join(', '));
        }
        console.log(`\n✅ Senkronizasyon tamamlandı: ${tumNumuneler.length} numune hazır.`);

    } catch (e) {
        console.error(`\n❌ Senkronizasyon Hatası:`, e.message);
        if (e.message === 'TOKEN_EXPIRED') {
            // Süresi dolmuş token'ı listeden çıkar
            const expired = authTokens[0];
            authTokens = authTokens.filter(t => t !== expired);
            console.warn(`⚠️ Token geçersiz oldu, silindi. Kalan: ${authTokens.length}`);
        }
    } finally {
        isSyncing = false;
    }
}

// Otomatik senkron (varsayılan 5 dk — web/lib/ebistr-engine ile aynı; eskiden 1 saatti)
const EBISTR_SYNC_MS = parseInt(process.env.EBISTR_SYNC_MS || '', 10) || 5 * 60 * 1000;
setInterval(performSync, EBISTR_SYNC_MS);
// Başlangıçta 5 saniye sonra ilk senkronizasyonu yap
setTimeout(performSync, 5000);

// ebistr.js ebistrCanliCek(force) — GET ile tam tarama (önceden route yoktu)
app.get('/api/ebistr/sync-now', async (req, res) => {
    if (authTokens.length === 0) return res.status(200).json({ ok: false, err: 'Token yok' });
    if (isSyncing) return res.json({ ok: true, msg: 'Senkron zaten çalışıyor', lastSync: ebistrCache.sonGuncelleme });
    try {
        await performSync();
        return res.json({ ok: true, lastSync: ebistrCache.sonGuncelleme });
    } catch (e) {
        return res.status(500).json({ ok: false, err: e.message || String(e) });
    }
});

// Her gün gece yarısı eski kayıtları temizle
setInterval(cleanupFirestore, 24 * 60 * 60 * 1000);

// ── FIRESTORE ENTEGRASYONU ──────────────────────────────────────────
const FB_PROJECT = "alibey-lab";
const FB_KEY = "AIzaSyALnq6b88THk8VpRhBDLGUkR26hplFtnng";
const FB_URL = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

async function syncToFirestore(numuneler) {
    if (!numuneler || numuneler.length === 0) return;
    try {
        console.log(`\n🔥 ${numuneler.length} kayıt Firestore'a senkronize ediliyor...`);
        // Verileri 10'arlı paketler halinde Firestore'a özet olarak atıyoruz 
        // (Kota dostu olması için tüm detay yerine önemli alanları atıyoruz)
        const summary = {
            lastSync: new Date().toISOString(),
            count: numuneler.length,
            // Sadece son 500 kaydı hızlı erişim için toplu döküman olarak sakla (opsiyonel model)
            samples: numuneler.slice(0, 500).map(n => ({
                id: n.brnNo,
                lab: n.labNo,
                date: n.takeDate,
                own: n.yibf ? (n.yibf.buildingOwner || n.yibf.ownerName || n.yibf.name || '') : ''
            }))
        };

        const toFs = v => {
            if (v === null || v === undefined) return { nullValue: null };
            if (typeof v === 'boolean') return { booleanValue: v };
            if (typeof v === 'number') return { doubleValue: v };
            if (Array.isArray(v)) return { arrayValue: { values: v.slice(0, 100).map(toFs) } };
            if (typeof v === 'object') {
                const fields = {};
                Object.keys(v).forEach(k => { fields[k] = toFs(v[k]); });
                return { mapValue: { fields } };
            }
            return { stringValue: String(v) };
        };

        await fetch(`${FB_URL}/ebistr_sync/latest?key=${FB_KEY}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { data: toFs(summary) } })
        });
        console.log("✅ Firestore özeti güncellendi.");
    } catch (e) { console.warn("⚠️ Firestore senkronizasyon hatası:", e.message); }
}

async function cleanupFirestore() {
    // 30 günden eski kayıtları silme mantığı (REST API ile zor ama döküman bazlı denenebilir)
    console.log("🧹 Firestore temizlik robotu çalıştı (Eski kayıt tespiti yapılamadı, kota korumak için sadece özet tutuluyor).");
}

// ── TOKEN YÖNETİMİ ────────────────────────────────────────────────
app.post('/api/ebistr/setToken', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, err: 'Token boş' });
    const t = token.trim();
    // Zaten varsa önce çıkar, sonra başa ekle (en güncel en önde)
    authTokens = authTokens.filter(x => x !== t);
    authTokens.unshift(t);
    if (authTokens.length > 5) authTokens = authTokens.slice(0, 5);
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({ tokens: authTokens, date: new Date().toISOString() }));
        console.log(`✅ Token güncellendi. Aktif token sayısı: ${authTokens.length}. Senkronizasyon tetikleniyor...`);
        setTimeout(performSync, 1000);
    } catch (e) { console.error('❌ Token kaydetme hatası:', e.message); }
    res.json({ ok: true });
});

app.get('/api/ebistr/status', (req, res) => {
    res.json({
        loggedIn: authTokens.length > 0,
        tokenSayisi: authTokens.length,
        proxyVersion: '7.0-MultiToken',
        lastSync: ebistrCache.sonGuncelleme,
        isSyncing,
        cacheSize: ebistrCache.numuneler.length,
        tagSayisi: (ebistrCache.taglar || []).length
    });
});

app.post('/api/ebistr/logout', (req, res) => {
    authTokens = [];
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
    res.json({ ok: true });
});

// ── EBİSTR CANLI CSV ÇEKME (HAFIZADAN) ────────────────────────────
app.post('/api/ebistr/csv-base64', async (req, res) => {
    const { basTarih, bitTarih } = req.body;
    
    if (ebistrCache.numuneler.length === 0) {
        if (authTokens.length === 0) return res.status(200).json({ ok: false, err: 'Önce giriş yapmalısınız.', base64: '', satirSayisi: 0 });
        performSync();
        return res.status(202).json({ ok: false, err: 'Hafıza henüz boş, ilk senkronizasyon başladı. Lütfen 10 sn sonra tekrar deneyin.' });
    }

    try {
        let tumNumuneler = ebistrCache.numuneler;

        if (basTarih || bitTarih) {
            const basMs = basTarih ? new Date(basTarih + 'T00:00:00').getTime() : 0;
            const bitMs = bitTarih ? new Date(bitTarih + 'T23:59:59').getTime() : Infinity;
            tumNumuneler = tumNumuneler.filter(n => {
                const d = n.breakDate; // Sadece kırıma odaklan (Kullanıcı talebi)
                if (!d) return false;
                const t = new Date(d).getTime();
                return t >= basMs && t <= bitMs;
            });
        }

        const q = v => {
            if (v === undefined || v === null) return '""';
            let s = String(v);
            if (typeof v === 'object') s = JSON.stringify(v);
            return '"' + s.replace(/"/g, '""') + '"';
        };

        const headers = [
            'BRN No', 'Lab No', 'Rapor No', 'Numune Alinıs Tarihi', 'Kirim Tarihi',
            'Kur (Gun)', 'Beton Sinifi', 'fck (Silindir)', 'fck (Kup)',
            'Numune Boyutu', 'fc (MPa)', 'Irsaliye No', 'Yapi Bolumu',
            'Yapi Denetim', 'Muteahhit', 'Yapi Sahibi', 'Şantiye Adresi', 'Uretici',
            'm3 (Mevcut)', 'm3 (Gunluk)', 'Durum', 'Hesap Disi', 'YİBF'
        ].map(h => `"${h}"`).join(';');

        const satirlar = [headers];
        tumNumuneler.forEach(n => {
            const yd = (n.yibf && n.yibf.ydf) ? n.yibf.ydf.name : '';
            const y = n.yibf || {};
            // Mal Sahibi Düzeltmesi: buildingOwner, ownerName veya direkt yibf name'e bak
            const own = y.buildingOwner || y.ownerName || y.owner?.name || y.buildingOwner?.name || '';
            const ctr = y.contractor || y.contractorName || y.contractor?.name || '';
            const adr = y.buildingAddress || y.address || '';
            let yid = y.number || y.yibfNo || y.id || '';

            satirlar.push([
                q(n.brnNo), q(n.labNo), q(n.labReportNo),
                q((n.takeDate||'').replace('T',' ').substring(0,16)),
                q((n.breakDate||'').replace('T',' ').substring(0,16)),
                q(n.curingTime?n.curingTime.id:''),
                q(n.concreteClass?n.concreteClass.name:''),
                q(n.concreteClass?n.concreteClass.resistance:''),
                q(n.concreteClass?n.concreteClass.resistanceCube:''),
                q(n.sampleSize?n.sampleSize.name:''),
                q((n.pressureResistance||0).toFixed(4)),
                q(n.wayBillNumber),
                q(n.structuralComponent),
                q(yd), q(ctr), q(own), q(adr), q(n.manufacturer),
                q(n.totalConcreteQuantityByCurrent||0),
                q(n.totalConcreteQuantityByDaily||0),
                q(n.state),
                q(n.outOfCalculation?'Evet':'Hayir'),
                q(yid)
            ].join(';'));
        });

        const csvText = '\uFEFF' + satirlar.join('\n');
        const base64 = Buffer.from(csvText, 'utf8').toString('base64');
        res.json({ ok: true, base64, satirSayisi: tumNumuneler.length, lastSync: ebistrCache.sonGuncelleme });
        console.log(`📦 Hafızadaki ${tumNumuneler.length} numune ERP'ye anında gönderildi.`);
    } catch (e) {
        console.error('❌ Cache-CSV Hatası:', e);
        res.status(500).json({ ok: false, err: e.message });
    }
});

// ── NUMUNE NORMALİZASYONU (raw API → frontend nesnesi) ─────────────
function normalizeNumune(n) {
    const y = n.yibf || {};
    const yd = (y.ydf && y.ydf.name) ? y.ydf.name : '';
    const getStr = v => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        return v.name || v.title || v.fullName || '';
    };
    const own = getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || getStr(y.applicant) || '';
    const ctr = getStr(y.contractor) || getStr(y.contractorName) || '';
    const adr = y.buildingAddress || y.address || '';
    // YİBF kayıt no: API'de farklı field adlarında gelebilir
    const yibfNo = y.no || y.number || y.yibfNo || y.yibfNo || y.registrationNo || (y.id ? String(y.id) : '');
    const curingGun = n.curingTime ? (n.curingTime.id || 0) : 0;
    const fc = parseFloat((n.pressureResistance || 0).toFixed(4));
    return {
        brnNo:          n.brnNo || '',
        labNo:          n.labNo || '',
        labReportNo:    n.labReportNo || '',
        takeDate:       (function(s){ if(!s) return ''; var d = new Date(new Date(s).getTime() + 3*60*60*1000); return d.toISOString().substring(0,16).replace('T',' '); })(n.takeDate),
        breakDate:      (function(s){ if(!s) return ''; var d = new Date(new Date(s).getTime() + 3*60*60*1000); return d.toISOString().substring(0,16).replace('T',' '); })(n.breakDate),
        curingGun:      curingGun,
        betonSinifi:    n.concreteClass ? n.concreteClass.name : '',
        fckSil:         n.concreteClass ? (n.concreteClass.resistance || 0) : 0,
        fckKup:         n.concreteClass ? (n.concreteClass.resistanceCube || 0) : 0,
        numuneBoyutu:   n.sampleSize ? n.sampleSize.name : '',
        fc:             fc,
        irsaliye:       n.wayBillNumber || '',
        yapiElem:       (function() {
            // EBİSTR'den Blok, Kat, Aks, Kot ve Yapı Elemanı alanlarını birleştir
            var getStr2 = function(v) {
                if (v === null || v === undefined) return '';
                if (typeof v === 'string') return v.trim();
                if (typeof v === 'number') return v !== 0 ? String(v) : '';
                return (v.name || v.title || v.code || v.value || '').trim();
            };
            var parts = [];
            // Yapısal konum bilgileri — farklı API alan adlarını dene
            var blok = getStr2(n.block) || getStr2(n.buildingBlock) || getStr2(n.blok) || getStr2(n.blockName) || '';
            var kat  = getStr2(n.floor) || getStr2(n.buildingFloor) || getStr2(n.storey) || getStr2(n.kat)
                    || getStr2(n.concreteFloor) || getStr2(n.floorName) || getStr2(n.floorNo) || getStr2(n.katNo) || '';
            var aks  = getStr2(n.axis) || getStr2(n.aks) || getStr2(n.buildingAxis) || getStr2(n.aksNo) || '';
            var kot  = getStr2(n.elevation) || getStr2(n.kot) || getStr2(n.buildingElevation) || '';
            var elem = getStr2(n.structuralComponent) || getStr2(n.concreteLocation) || getStr2(n.yapiElemani) || '';
            if (blok) parts.push('Bl:' + blok);
            if (kat)  parts.push('K:' + kat);
            if (aks)  parts.push('Aks:' + aks);
            if (kot)  parts.push('Kot:' + kot);
            if (elem) parts.push(elem);
            return parts.join(' / ');
        })(),
        yapiDenetim:    yd,
        contractor:     ctr,
        buildingOwner:  own,
        buildingAddress:adr,
        manufacturer:   getStr(n.manufacturer) || getStr(n.concreteFirm) || getStr(n.producer) || getStr(n.freshConcreteFirm) || '',
        m3:             n.totalConcreteQuantityByCurrent || 0,
        totalM3:        n.totalConcreteQuantityByDaily || 0,
        hesapDisi:      !!n.outOfCalculation,
        yibf:           yibfNo
    };
}

// ── NUMUNELER (JSON formatında, frontend'e doğrudan) ───────────────
// POST /api/ebistr/numuneler
// Body: { basTarih, bitTarih, filtre: 'bugun'|'yarin'|'bu_hafta'|'hepsi' }
app.post('/api/ebistr/numuneler', (req, res) => {
    const { basTarih, bitTarih, filtre } = req.body || {};

    if (ebistrCache.numuneler.length === 0) {
        if (authTokens.length === 0) {
            return res.status(200).json({
                ok: false,
                err: 'Önce giriş yapmalısınız.',
                numuneler: [],
                lastSync: ebistrCache.sonGuncelleme,
                mailDurum: {},
            });
        }
        performSync();
        return res.status(202).json({ ok: false, err: 'İlk senkronizasyon başladı. Lütfen 10 sn sonra tekrar deneyin.' });
    }

    const bugun = new Date();
    const bugunStr = bugun.toLocaleDateString('en-CA'); // YYYY-MM-DD

    let liste = ebistrCache.numuneler;

    // Filtre uygula (breakDate'e göre)
    if (filtre && filtre !== 'hepsi') {
        liste = liste.filter(n => {
            const d = (n.breakDate || '').substring(0, 10);
            if (!d) return false;
            if (filtre === 'bugun') {
                return d === bugunStr;
            }
            if (filtre === 'yarin') {
                const yarin = new Date(bugun);
                yarin.setDate(yarin.getDate() + 1);
                return d === yarin.toLocaleDateString('en-CA');
            }
            if (filtre === 'bu_hafta') {
                // Pazartesi-Pazar
                const gun = bugun.getDay() || 7;
                const haftaBasi = new Date(bugun);
                haftaBasi.setDate(bugun.getDate() - gun + 1);
                haftaBasi.setHours(0, 0, 0, 0);
                const haftaSonu = new Date(haftaBasi);
                haftaSonu.setDate(haftaBasi.getDate() + 6);
                return d >= haftaBasi.toLocaleDateString('en-CA') && d <= haftaSonu.toLocaleDateString('en-CA');
            }
            return true;
        });
    } else if (basTarih || bitTarih) {
        const basMs = basTarih ? new Date(basTarih + 'T00:00:00').getTime() : 0;
        const bitMs = bitTarih ? new Date(bitTarih + 'T23:59:59').getTime() : Infinity;
        liste = liste.filter(n => {
            const d = n.breakDate;
            if (!d) return false;
            const t = new Date(d).getTime();
            return t >= basMs && t <= bitMs;
        });
    }

    const normalized = liste.map(normalizeNumune);
    console.log(`📦 ${normalized.length} numune JSON olarak gönderildi.`);
    res.json({ ok: true, numuneler: normalized, toplam: normalized.length, lastSync: ebistrCache.sonGuncelleme });
});

// ── YAPIELEM DEBUG — ham API alanlarını göster ───────────────────
// GET /api/ebistr/debug-fields
// Ham numune nesnesinin tüm key'lerini + ilk değerlerini döner
app.get('/api/ebistr/debug-fields', (req, res) => {
    const raw = ebistrCache.rawNumuneler || [];
    if (raw.length === 0) return res.json({ ok: false, err: 'Henüz senkronize edilmemiş' });
    const ornek = raw[0];
    // Üst düzey tüm key-value çiftleri (obje ise type bilgisi)
    const alanlar = {};
    Object.keys(ornek).forEach(k => {
        const v = ornek[k];
        if (v === null || v === undefined) alanlar[k] = null;
        else if (typeof v === 'object' && !Array.isArray(v)) alanlar[k] = '{ ' + Object.keys(v).slice(0, 8).join(', ') + ' }';
        else alanlar[k] = v;
    });
    res.json({ ok: true, ornek: alanlar, toplamKayit: raw.length });
});

// ── YAKLAŞAN KIRIMLAR ────────────────────────────────────────────
// GET /api/ebistr/yaklasan?gun=0|1|2|3|7  (yoksa hepsi: 0,1,2,3,7)
// Kür günü dikkate alınır: 7/28/56/90
// Her BRN için: bireysel fc değerleri, sapma tespiti, kırılan/kalan sayısı
app.get('/api/ebistr/yaklasan', (req, res) => {
    if (ebistrCache.numuneler.length === 0) {
        return res.json({ ok: true, numuneler: [], lastSync: ebistrCache.sonGuncelleme });
    }

    const { gun } = req.query;
    const kurGunleri = [7, 28, 56, 90];

    // Hedef gün farkları
    const hedefFarklar = gun !== undefined
        ? [parseInt(gun)]
        : [0, 1, 2, 3, 7];

    const bugunStr = new Date().toLocaleDateString('en-CA');
    const bugunMs  = new Date(bugunStr + 'T00:00:00').getTime();
    const getStr   = v => { if (!v) return ''; if (typeof v === 'string') return v; return v.name || v.title || v.fullName || ''; };

    // ── Sapma tespiti ─────────────────────────────────────────────
    // Bir numunenin fc değeri grup ortalamasından %40+ sapıyorsa SAPMALI işaretle
    function sapmaTestEt(fcler, labNolar) {
        if (fcler.length < 2) return [];
        const ort = fcler.reduce((a, b) => a + b, 0) / fcler.length;
        const sapmalilar = [];
        fcler.forEach((fc, i) => {
            const sapmaYuzde = Math.abs((fc - ort) / ort) * 100;
            if (sapmaYuzde >= 40) {  // %40+ sapma kritik
                sapmalilar.push({
                    labNo:       labNolar[i] || ('Numune-' + (i + 1)),
                    fc:          parseFloat(fc.toFixed(2)),
                    ortalama:    parseFloat(ort.toFixed(2)),
                    sapmaYuzde:  parseFloat(sapmaYuzde.toFixed(1)),
                    dusuk:       fc < ort
                });
            }
        });
        return sapmalilar;
    }

    // YİBF + yapı bölümü + beton sınıfı bazında grupla.
    // Aynı YİBF'e ait farklı BRN'ler aynı kırım tarihinde tek satırda görünür.
    // YİBF yoksa BRN bazında grupla (eski davranış).
    const gruplar = {};
    ebistrCache.numuneler.forEach(n => {
        if (!n.takeDate) return;
        const tD     = n.takeDate ? new Date(new Date(n.takeDate).getTime() + 3*60*60*1000).toISOString().substring(0,10) : '';
        const y      = n.yibf || {};
        const yibfNo = y.no || y.number || y.yibfNo || y.registrationNo || (y.id ? String(y.id) : '');
        const beton  = n.concreteClass ? n.concreteClass.name : '';
        // n.yapiElem zaten normalizeNumune'de hesaplanmış (kat+blok+aks birleşik); yoksa ham alanı dene
        const bolum  = n.yapiElem || n.structuralComponent || '';

        const grupKey = (yibfNo && yibfNo !== '')
            ? `YBF_${yibfNo}__${tD}`
            : `BRN_${n.brnNo || n.labReportNo || 'bilinmiyor'}__${tD}`;

        if (!gruplar[grupKey]) {
            gruplar[grupKey] = {
                brnNolar:       new Set(),
                betonSiniflari: new Set(),
                yapiElemler:    new Set(),
                yibfNo,
                takeDate:       tD,
                yapiDenetim:    y.ydf ? y.ydf.name : '',
                contractor:     getStr(y.contractor) || getStr(y.contractorName) || '',
                buildingOwner:  getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || '',
                buildingAddress:y.buildingAddress || y.address || '',
                numuneler:      []
            };
        }
        const g = gruplar[grupKey];
        if (n.brnNo) g.brnNolar.add(n.brnNo);
        if (beton) g.betonSiniflari.add(beton);
        if (bolum) g.yapiElemler.add(bolum);
        if (!g.buildingOwner) {
            const own = getStr(y.buildingOwner) || getStr(y.ownerName) || getStr(y.owner) || '';
            if (own) g.buildingOwner = own;
        }
        if (!g.contractor) g.contractor = getStr(y.contractor) || getStr(y.contractorName) || '';
        if (!g.yapiDenetim && y.ydf) g.yapiDenetim = y.ydf.name || '';
        g.numuneler.push(n);
    });

    const yaklasanlar = [];

    Object.values(gruplar).forEach(g => {
        const takeMs = new Date(g.takeDate + 'T00:00:00').getTime();

        kurGunleri.forEach(kurGun => {
            const kirimMs  = takeMs + kurGun * 24 * 60 * 60 * 1000;
            const kirimStr = new Date(kirimMs).toLocaleDateString('en-CA');
            const fark     = Math.round((kirimMs - bugunMs) / (24 * 60 * 60 * 1000));

            if (!hedefFarklar.includes(fark)) return;

            // Bu kür gününe ait numuneler
            const kurNums = g.numuneler.filter(n => {
                const cg = n.curingTime ? (n.curingTime.id || 0) : 0;
                return cg === kurGun;
            });
            if (kurNums.length === 0) return;

            // Bireysel fc değerleri ve durumları — takeDate saatine göre sırala
            const numuneBilgileri = kurNums
                .sort((a, b) => {
                    // Önce numune alma saatine göre sırala (mikser sırası)
                    const tA = a.takeDate || '';
                    const tB = b.takeDate || '';
                    if (tA < tB) return -1;
                    if (tA > tB) return 1;
                    // Aynı saatte ise kırılmamışları üste
                    if (!a.pressureResistance && b.pressureResistance) return -1;
                    if (a.pressureResistance && !b.pressureResistance) return 1;
                    return 0;
                })
                .map(n => ({
                    labNo:      n.labNo || n.labReportNo || '',
                    fc:         parseFloat((n.pressureResistance || 0).toFixed(2)),
                    kirildi:    (n.pressureResistance || 0) > 0,
                    irsaliye:   n.wayBillNumber || '',
                    takeTime:   n.takeDate ? (function(s){ var d = new Date(new Date(s).getTime() + 3*60*60*1000); return d.toISOString().substring(11,16); })(n.takeDate) : '',
                    boyut:      n.sampleSize ? n.sampleSize.name : ''
                }));
            const kirilanlar = numuneBilgileri.filter(n => n.kirildi);
            const fcler = kirilanlar.map(n => n.fc);
            const fcOrtalama = fcler.length > 0
                ? parseFloat((fcler.reduce((a, b) => a + b, 0) / fcler.length).toFixed(2))
                : null;

            // Sapma tespiti (sadece kırılan numuneler üzerinde)
            const labNolar = kirilanlar.map(n => n.labNo);
            const sapmaliNumuneler = fcler.length >= 2 ? sapmaTestEt(fcler, labNolar) : [];

            const brnNolarArr = Array.from(g.brnNolar);
            yaklasanlar.push({
                brnNo:            brnNolarArr.join(', '),
                brnNolar:         brnNolarArr,
                yibfNo:           g.yibfNo,
                betonSinifi:      Array.from(g.betonSiniflari).filter(Boolean).join(', '),
                yapiElem:         Array.from(g.yapiElemler).filter(Boolean).join(', '),
                takeDate:         g.takeDate,
                kirimTarihi:      kirimStr,
                kurGun:           kurGun,
                farkGun:          fark,
                yapiDenetim:      g.yapiDenetim,
                contractor:       g.contractor,
                buildingOwner:    g.buildingOwner,
                buildingAddress:  g.buildingAddress,
                // Sayısal özet
                toplamSayisi:     kurNums.length,
                kirilmisSayisi:   kirilanlar.length,
                kalanSayisi:      kurNums.length - kirilanlar.length,
                // Değerler
                numuneler:        numuneBilgileri,
                fcOrtalama:       fcOrtalama,
                // Sapma
                sapmaliVar:       sapmaliNumuneler.length > 0,
                sapmaliNumuneler: sapmaliNumuneler,
                // Durum
                kirimGecti:       kirimStr < bugunStr,
                tamamlandi:       kirilanlar.length >= kurNums.length && kurNums.length > 0
            });
        });
    });

    // Kırım tarihine göre sırala
    yaklasanlar.sort((a, b) => a.kirimTarihi.localeCompare(b.kirimTarihi));
    console.log(`📅 ${yaklasanlar.length} yaklaşan kırım | ${yaklasanlar.filter(y => y.sapmaliVar).length} sapmalı`);
    res.json({ ok: true, numuneler: yaklasanlar, lastSync: ebistrCache.sonGuncelleme });
});

// ── ÇİP / TAG VERİSİ ─────────────────────────────────────────────
// GET /api/ebistr/taglar  →  chipData uyumlu normalize edilmiş liste
app.get('/api/ebistr/taglar', (req, res) => {
    const raw = ebistrCache.taglar || [];
    const normalized = raw.map(item => {
        const isYdk = !item.contractor;
        const firma = isYdk
            ? (item.requestDepartment?.name || '')
            : (item.contractor || '');
        const belge = isYdk
            ? String(item.requestDepartment?.documentNo || '')
            : String(item.contractorDocumentNumber || item.requestDepartment?.documentNo || '');
        if (!firma) return null;
        return {
            firma,
            belge,
            top: item.totalCount || 0,
            kul: item.usedCount || 0,
            kal: item.remaining || 0,
            tip: isYdk ? 'ydk' : 'mutahhit',
            rawId: item.id
        };
    }).filter(Boolean);

    res.json({
        ok: true,
        taglar: normalized,
        toplam: normalized.length,
        lastSync: ebistrCache.sonGuncelleme
    });
});

// ── MAİL GÖNDERME ──────────────────────────────────────────────────
app.post('/api/mail/gonder', async (req, res) => {
    const { mailler, smtp } = req.body;
    if (!smtp?.user) return res.status(400).json({ ok: false, err: 'Gönderici mail adresi eksik' });
    if (!mailler || !Array.isArray(mailler) || mailler.length === 0) return res.status(400).json({ ok: false, err: 'Gönderilecek mail listesi boş' });
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(500).json({ ok: false, err: 'RESEND_API_KEY tanımlı değil' });
    const transporter = nodemailer.createTransport({
        host: 'smtp.resend.com', port: 465, secure: true,
        auth: { user: 'resend', pass: resendKey }
    });
    let gonderilen = 0;
    const hatalar = [];
    for (const m of mailler) {
        try {
            await transporter.sendMail({
                from: '"Alibey Laboratuvar" <alibeybetoniletisim@omerkaya.com.tr>',
                to: m.to, subject: m.konu, html: m.html
            });
            gonderilen++;
            await new Promise(r => setTimeout(r, 100));
        } catch (e) { hatalar.push({ konu: m.konu, hata: e.message }); }
    }
    res.json({ ok: true, gonderilen, hatalar });
});

app.listen(PORT, () => {
    console.log(`\n✅ EBİSTR Akıllı Proxy v7 → http://localhost:${PORT}`);
    console.log(`📌 Veriler arka planda her 1 saatte bir otomatik güncellenir.`);
    console.log(`📌 Yeni endpoint'ler: /api/ebistr/numuneler (POST) | /api/ebistr/yaklasan (GET)\n`);
});