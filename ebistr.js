/**
 * ebistr.js — EBİSTR Beton Analiz Modülü
 * Alibey Laboratuvar ERP — index.html'den ayrıştırıldı
 * Bağımlılıklar: sw(), lsGet(), lsSet(), toast(), logAction(), fbSave(), fbPull()
 */

// ── FIRESTORE WRAPPERS ─────────────────────────────────────────────
// index.html ana bloğundaki fsSet/fsGetDoc fonksiyonlarına delege eder
function fbSave(collection, docId, data) {
    if (typeof fsSet === 'function') {
        fsSet(collection, docId, data);
    }
}
function fbPull(collection, docId, cb) {
    if (typeof fsGetDoc === 'function') {
        fsGetDoc(collection, docId, cb);
    } else if (typeof cb === 'function') {
        cb(null);
    }
}

var ebistrNumuneler = [];
var ebistrAnalizler = [];
var ebistrFiltreSec = 'hepsi';
var ebistrFiltreliListe = []; // Ekranda görünen filtrelenmiş liste
var ebistrYdList = [];
var ebistrRenkMap = { 'UYGUNSUZ': 'var(--red)', 'UYARI': '#fbbf24', 'UYGUN': 'var(--grn)', 'HAFTALIK': 'var(--acc)', 'SAPMA_KURTARDI': '#f97316' };
var ebistrEtiketMap = { 'UYGUNSUZ': 'Uygunsuz', 'UYARI': 'Sapmali', 'UYGUN': 'Uygun', 'HAFTALIK': 'Haftalik', 'SAPMA_KURTARDI': 'Sapma Uyarisi' };

var EBISTR_PROXY = function () {
    var inp = document.getElementById('ebistr-proxy-url-inp');
    return (inp ? inp.value : '') || 'https://lab-system-production-fd87.up.railway.app';
};

// ── INIT (sw() içinde çağrılır) ───────────────────────────────────
var _ebistrAutoPollTimer = null;

function ebistrInit() {
    ebistrProxyKontrol();
    ebistrAyarYukle();
    // Tabloyu hemen göster (yükleniyor mesajıyla) — boş ekran olmasın
    ebistrFiltrele('hepsi');
    // Firestore'dan önbellekli verileri çek
    fbPullEBISTR();
    // Saat başından 1-2 dk sonra (XX:02) EBİSTR veri çekimini planla
    _scheduleEbistrHourlyPull();
    // Her 5 dakikada sessiz proxy güncelleme (önbellek tazelemesi)
    if (!_ebistrAutoPollTimer) {
        _ebistrAutoPollTimer = setInterval(function() {
            _ebistrSilentRefresh();
        }, 5 * 60 * 1000);
    }
}

// Her saat XX:02'de EBİSTR verisini çek (EBİSTR kendi verilerini :00'da günceller)
function _scheduleEbistrHourlyPull() {
    var now = new Date();
    var next = new Date(now);
    next.setMinutes(2, 0, 0); // :02 dakika
    if (next <= now) next.setHours(next.getHours() + 1);
    setTimeout(function() {
        _ebistrSilentRefresh();
        _scheduleEbistrHourlyPull(); // sonraki saati planla
    }, next - now);
}

// Proxy'den sessizce veri güncelle (toast yok)
function _ebistrSilentRefresh() {
    fetch(EBISTR_PROXY() + '/api/ebistr/numuneler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtre: 'hepsi' })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (!d.ok || !d.numuneler) return;
        ebistrNumuneler = d.numuneler;
        var syncTime = d.lastSync ? new Date(d.lastSync).toLocaleString('tr-TR') : '';
        var info = document.getElementById('ebistr-csv-info');
        if (info) info.textContent = ebistrNumuneler.length + ' numune hazır. (Son Senk: ' + syncTime + ')';
        var syncLbl = document.getElementById('ebistr-yaklasan-sync-lbl');
        if (syncLbl && syncTime) syncLbl.textContent = 'Son Güncelleme: ' + syncTime;
        fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
    })
    .catch(function() {}); // sessiz hata — proxy kapalıysa geçilir
}

// ── FIRESTORE SYNC ──
// Sadece numuneler + ince mailDurum haritası kaydedilir — tam analizler Firestore 1MB limitini aşıyor
var _ebistrMailDurum = {}; // { brnNo: true/false } — analiz sonrası merge için

function fbSyncEBISTR(numuneler, analizler) {
    if (!numuneler) return;
    // Slim mailDurum map — sadece gönderilmiş olanları tut
    var mailDurum = {};
    (analizler || []).forEach(function(a) {
        if (a.mailGonderildi) mailDurum[a.brnNo || a.labReportNo || ''] = true;
    });
    var data = {
        numuneler: numuneler,
        mailDurum: mailDurum,
        time: new Date().toLocaleString('tr-TR'),
        device: navigator.userAgent.slice(0, 50)
    };
    lsSet('alibey_ebistr_cache', data);
    fbSave('ebistr_cache', 'current_data', data);
    var syncLbl = document.getElementById('ebistr-yaklasan-sync-lbl');
    if (syncLbl) syncLbl.textContent = 'Son Güncelleme: ' + data.time;
}

function fbPullEBISTR() {
    fbPull('ebistr_cache', 'current_data', function(cache) {
        if (cache && cache.numuneler) {
            ebistrNumuneler = cache.numuneler;
            _ebistrMailDurum = cache.mailDurum || {};
            var syncLbl = document.getElementById('ebistr-yaklasan-sync-lbl');
            if (syncLbl && cache.time) syncLbl.textContent = 'Son Güncelleme: ' + cache.time;
            ebistrYdTespit(ebistrNumuneler);
            ebistrAnalizEt(); // analiz bittikten sonra mailDurum merge edilir (ebistrAnalizEt içinde)
        }
    });
}

// ── PROXY KONTROL ─────────────────────────────────────────────────
function ebistrProxyKontrol() {
    var dot  = document.getElementById('ebistr-proxy-dot');
    var lbl  = document.getElementById('ebistr-proxy-lbl');
    var bar  = document.getElementById('ebistr-proxy-bar-wrap');
    fetch(EBISTR_PROXY() + '/api/ebistr/status')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (dot) { dot.className = 'ebistr-proxy-dot ' + (d.loggedIn ? 'on' : ''); }
            if (bar) { bar.className = 'ebistr-proxy-bar ' + (d.loggedIn ? 'ok' : ''); }
            if (lbl) lbl.textContent = d.loggedIn ? 'Proxy bağlı — Token aktif' : 'Proxy bağlı — Giriş bekleniyor';
        })
        .catch(function () {
            if (dot) dot.className = 'ebistr-proxy-dot err';
            if (bar) bar.className = 'ebistr-proxy-bar err';
            if (lbl) lbl.textContent = 'Proxy çalışmıyor — node ebistr-proxy.js';
        });
}

// ── SEKME GEÇİŞİ ──────────────────────────────────────────────────
function ebistrTab(ad) {
    ['analiz', 'yaklasan', 'yd', 'ayar'].forEach(function (t) {
        var pane = document.getElementById('ebistr-pane-' + t);
        var btn  = document.getElementById('etab-' + t);
        if (pane) pane.style.display = t === ad ? '' : 'none';
        if (btn)  btn.className = 'ebistr-tab' + (t === ad ? ' on' : '');
    });
    if (ad === 'analiz') {
        // Varsayılan filtre: bugünün kırım tarihi (eğer filtre boşsa)
        var fbas = document.getElementById('ebistr-f-bas');
        var fbit = document.getElementById('ebistr-f-bit');
        if (fbas && !fbas.value) fbas.value = new Date().toLocaleDateString('en-CA');
        if (fbit && !fbit.value) fbit.value = new Date().toLocaleDateString('en-CA');
        ebistrFiltrele();
    }
    if (ad === 'yaklasan') ebistrYaklasanAnaliz();
    if (ad === 'yd') ebistrYdRender();
    if (ad === 'ayar') ebistrAyarYukle();
}

// ── CSV YÜKLE ─────────────────────────────────────────────────────
function ebistrCsvYukle(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        var text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        ebistrNumuneler = ebistrCsvParse(text);
        
        var info = document.getElementById('ebistr-csv-info');
        var badge = document.getElementById('ebistr-csv-info-badge');
        var dot = document.getElementById('ebistr-csv-status-dot');
        
        if (info) info.textContent = ebistrNumuneler.length + ' numune hazır (CSV)';
        if (badge) badge.className = 'ebistr-status-badge ready';
        if (dot) dot.style.background = 'var(--grn)';

        var btn = document.getElementById('ebistr-analiz-btn');
        if (btn) btn.disabled = ebistrNumuneler.length === 0;
        toast(ebistrNumuneler.length + ' numune yüklendi', 'ok');
        ebistrYdTespit(ebistrNumuneler);
    };
    if (file) reader.readAsText(file, 'UTF-8');
    return reader;
}

// ── VERİLERİ GÜNCELLE (tüm hafıza — filtre yok) ─────────────────
function ebistrVeriGuncelle() {
    var info  = document.getElementById('ebistr-csv-info');
    var dot   = document.getElementById('ebistr-csv-status-dot');
    if (info) info.textContent = '⏳ Proxy\'den tüm veriler alınıyor...';
    if (dot) dot.style.background = 'var(--amb)';
    toast('Veriler güncelleniyor...', 'amb');
    // Filtre yok: tüm hafızayı çek
    fetch(EBISTR_PROXY() + '/api/ebistr/numuneler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtre: 'hepsi' })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (!d.ok) { toast(d.err || 'Hata oluştu', 'err'); if (info) info.textContent = '❌ ' + (d.err || 'Hata'); return; }
        ebistrNumuneler = d.numuneler || [];
        var syncTime = d.lastSync ? new Date(d.lastSync).toLocaleString('tr-TR') : '—';
        var badge = document.getElementById('ebistr-csv-info-badge');
        if (badge) badge.className = 'ebistr-status-badge ready';
        if (dot) dot.style.background = 'var(--grn)';
        var syncLbl = document.getElementById('ebistr-yaklasan-sync-lbl');
        if (syncLbl) syncLbl.textContent = 'Son Güncelleme: ' + syncTime;
        ebistrYdTespit(ebistrNumuneler);
        ebistrAnalizEt();
        if (info) info.textContent = ebistrNumuneler.length + ' numune — analiz tamamlandı. (Son Senk: ' + syncTime + ')';
        fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
    })
    .catch(function(e) {
        if (info) info.textContent = '❌ Proxy bağlantısı yok';
        if (dot) dot.style.background = 'var(--red)';
        toast('Proxy bağlantı hatası: ' + e.message, 'err');
    });
}

function ebistrCanliCek(val, force) {
    var info = document.getElementById('ebistr-csv-info');
    var bas, bit;
    var d = new Date();
    bit = d.toISOString().split('T')[0];

    if (val === 'custom') {
        bas = document.getElementById('ebistr-bas-tarih').value;
        bit = document.getElementById('ebistr-bit-tarih').value;
        if (!bas || !bit) { toast('Lütfen tarih aralığı seçin', 'err'); return; }
    } else {
        var gun = val || 7;
        d.setDate(d.getDate() - gun);
        bas = d.toISOString().split('T')[0];
    }

    if (force) {
        if (info) info.textContent = '⚡ EBİSTR taze veriler çekiliyor (Sabırlı olun)...';
        toast('Manuel senkronizasyon başladı, EBİSTR taranıyor...', 'amb');
        fetch(EBISTR_PROXY() + '/api/ebistr/sync-now')
            .then(function(r){ return r.json(); })
            .then(function(){ _ebistrFetch(bas, bit); })
            .catch(function(e){ toast('Güncelleme hatası: '+e.message, 'err'); });
    } else {
        _ebistrFetch(bas, bit);
    }
}

function _ebistrFetch(bas, bit) {
    var info  = document.getElementById('ebistr-csv-info');
    var badge = document.getElementById('ebistr-csv-info-badge');
    var dot   = document.getElementById('ebistr-csv-status-dot');

    if (info) info.textContent = '⏳ Veri çekiliyor...';
    if (dot) dot.style.background = 'var(--amb)';

    // Yeni JSON endpoint kullan (CSV parse'a gerek yok)
    fetch(EBISTR_PROXY() + '/api/ebistr/numuneler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basTarih: bas, bitTarih: bit })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (!d.ok) {
            if (info) info.textContent = '⌛ ' + (d.err || 'Bekleniyor...');
            toast(d.err || 'Sunucu hatası', 'amb');
            return;
        }
        ebistrNumuneler = d.numuneler || [];
        var syncTime = d.lastSync ? new Date(d.lastSync).toLocaleString('tr-TR') : '—';
        if (badge) badge.className = 'ebistr-status-badge ready';
        if (dot) dot.style.background = 'var(--grn)';
        var syncLbl = document.getElementById('ebistr-yaklasan-sync-lbl');
        if (syncLbl) syncLbl.textContent = 'Son Güncelleme: ' + syncTime;
        ebistrYdTespit(ebistrNumuneler);
        // Analizi otomatik çalıştır — kullanıcı manuel tıklamak zorunda kalmasın
        ebistrAnalizEt();
        if (info) info.textContent = ebistrNumuneler.length + ' numune — analiz tamamlandı. (Son Senk: ' + syncTime + ')';
        fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
    })
    .catch(function(err) {
        if (info) info.textContent = '❌ Proxy bağlantı hatası';
        if (badge) badge.className = 'ebistr-status-badge';
        if (dot) dot.style.background = 'var(--red)';
        toast('Proxy bağlantı hatası: ' + err.message, 'err');
    });
}

function ebistrCsvParse(text) {
    var satirlar = text.split('\n').filter(function (s) { return s.trim(); });
    if (satirlar.length < 2) return [];
    var sep = satirlar[0].indexOf(';') > -1 ? ';' : ',';
    var basliklar = ebistrCsvSatirParse(satirlar[0], sep).map(function (h) { return h.trim().toLowerCase(); });

    var normalize = function(s) {
        return s.replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').toLowerCase().trim();
    };
    var nBasliklar = basliklar.map(normalize);

    var kolon = function (adaylar) {
        var nAdaylar = adaylar.map(normalize);
        for (var i = 0; i < nAdaylar.length; i++) {
            var k = nBasliklar.indexOf(nAdaylar[i]);
            if (k >= 0) return k;
        }
        for (var j = 0; j < nAdaylar.length; j++) {
            for (var m = 0; m < nBasliklar.length; m++) {
                if (nBasliklar[m].indexOf(nAdaylar[j]) >= 0) return m;
            }
        }
        return -1;
    };

    var idx = {
        brnNo:          kolon(['brn no', 'brnno']),
        labNo:          kolon(['lab no', 'labno']),
        labReportNo:    kolon(['rapor no', 'labreportno']),
        takeDate:       kolon(['numune alinıs tarihi', 'numune alınış tarihi', 'takedate', 'alinıs']),
        breakDate:      kolon(['kirim tarihi', 'kırım tarihi', 'breakdate', 'kirim']),
        curingGun:      kolon(['kur (gun)', 'kür (gün)', 'curing', 'kur']),
        betonSinifi:    kolon(['beton sinifi', 'beton sınıfı', 'concreteclass']),
        fckSil:         kolon(['fck (silindir)', 'resistance', 'fck sil']),
        fckKup:         kolon(['fck (kup)', 'fck (küp)', 'resistancecube']),
        numuneBoyutu:   kolon(['numune boyutu', 'samplesize']),
        fc:             kolon(['fc (mpa)', 'pressureresistance', 'fc']),
        irsaliye:       kolon(['irsaliye no', 'waybillnumber', 'irsaliye']),
        yapiElem:       kolon(['yapi bolumu', 'yapı bölümü', 'structuralcomponent']),
        yapiDenetim:    kolon(['yapi denetim', 'yapı denetim', 'yapidenetim', 'ydf']),
        contractor:     kolon(['muteahhit', 'müteahhit', 'contractor']),
        buildingOwner:  kolon(['yapi sahibi', 'yapı sahibi', 'buildingowner']),
        buildingAddress:kolon(['santiye adresi', 'şantiye adresi', 'buildingaddress']),
        manufacturer:   kolon(['uretici', 'üretici', 'manufacturer']),
        m3:             kolon(['m3 (mevcut)', 'm³ (mevcut yük)', 'm3', 'volume']),
        totalM3:        kolon(['m3 (gunluk)', 'm³ (günlük toplam)', 'totalm3']),
        hesapDisi:      kolon(['hesap disi', 'hesap dışı', 'outofcalculation']),
        yibf:           kolon(['yibf', 'yibf no', 'yibf_no', 'yibfno', 'yid'])
    };

    var numuneler = [];
    for (var i = 1; i < satirlar.length; i++) {
        var huc = ebistrCsvSatirParse(satirlar[i], sep);
        if (!huc.length) continue;
        var g = function (k) { return idx[k] >= 0 && idx[k] < huc.length ? (huc[idx[k]] || '').trim() : ''; };
        var fc = parseFloat((g('fc') || '0').replace(',', '.'));
        if (isNaN(fc)) fc = 0;
        numuneler.push({
            brnNo: g('brnNo'), labNo: g('labNo'), labReportNo: g('labReportNo'),
            takeDate: g('takeDate'), breakDate: g('breakDate'),
            curingGun: parseInt(g('curingGun')) || 0,
            betonSinifi: g('betonSinifi'),
            fckSil: parseFloat(g('fckSil')) || 0,
            fckKup: parseFloat(g('fckKup')) || 0,
            numuneBoyutu: g('numuneBoyutu'), fc: fc,
            irsaliye: g('irsaliye'), yapiElem: g('yapiElem'),
            yapiDenetim: g('yapiDenetim'), contractor: g('contractor'),
            buildingOwner: g('buildingOwner'), buildingAddress: g('buildingAddress'),
            manufacturer: g('manufacturer'),
            m3: parseFloat(g('m3')) || 0, totalM3: parseFloat(g('totalM3')) || 0,
            hesapDisi: (g('hesapDisi') || '').toLowerCase() === 'evet',
            yibf: g('yibf')
        });
    }
    return numuneler;
}

function ebistrCsvSatirParse(satir, sep) {
    var sonuc = [], alan = '', tirnak = false;
    for (var i = 0; i < satir.length; i++) {
        var c = satir[i];
        if (c === '"') { if (tirnak && satir[i+1] === '"') { alan += '"'; i++; } else tirnak = !tirnak; }
        else if (c === sep && !tirnak) { sonuc.push(alan); alan = ''; }
        else alan += c;
    }
    sonuc.push(alan);
    return sonuc;
}

// ── ANALİZ ET ─────────────────────────────────────────────────────
function ebistrAnalizEt() {
    if (!ebistrNumuneler.length) { toast('Önce "Verileri Güncelle" ile veri çekin', 'err'); return; }

    // Önce "hesaplanıyor" yaz, tarayıcının render etmesine izin ver
    var tbody = document.getElementById('ebistr-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="16" style="padding:40px;text-align:center;color:var(--tx3);font-size:13px">⚙️ Analiz hesaplanıyor...</td></tr>';

    setTimeout(function() {
        var gruplar = {};
        ebistrNumuneler.forEach(function (n) {
            var key = n.brnNo || n.labReportNo || 'BILINMIYOR';
            if (!gruplar[key]) gruplar[key] = [];
            gruplar[key].push(n);
        });

        ebistrAnalizler = [];
        Object.keys(gruplar).forEach(function (brnNo) {
            ebistrAnalizler.push(ebistrTs13515(brnNo, gruplar[brnNo]));
        });

        // Rapor defterinden eksik alanları tamamla (YİBF bazında lookup)
        ebistrAnalizler.forEach(function(a) {
            if (!a.yibf) return;
            var rdBilgi = typeof window.raporDefterYibfBilgi === 'function'
                ? window.raporDefterYibfBilgi(a.yibf) : null;
            if (!rdBilgi) return;
            if (!a.buildingOwner || a.buildingOwner === '—') a.buildingOwner = rdBilgi.yapiSahibi || a.buildingOwner;
            if (!a.contractor)    a.contractor    = rdBilgi.contractor || a.contractor;
            if (!a.yapiDenetim)   a.yapiDenetim   = rdBilgi.yapiDenetim || a.yapiDenetim;
            if (!a.yapiElem)      a.yapiElem       = rdBilgi.yapiBolumu || (rdBilgi.blok ? 'Bl:' + rdBilgi.blok : '');
            else if (!a.yapiElem.trim()) a.yapiElem = rdBilgi.yapiBolumu || (rdBilgi.blok ? 'Bl:' + rdBilgi.blok : '');
        });

        ebistrAnalizler.sort(function (a, b) {
            var durumSira = { 'UYGUNSUZ': 0, 'SAPMA_KURTARDI': 1, 'UYARI': 2, 'HAFTALIK': 3, 'UYGUN': 4 };
            var ydA = a.yapiDenetim || '—', ydB = b.yapiDenetim || '—';
            if (ydA < ydB) return -1;
            if (ydA > ydB) return 1;
            return (durumSira[a.durum] || 5) - (durumSira[b.durum] || 5);
        });

        // Firestore'dan gelen mailDurum haritasını merge et
        if (_ebistrMailDurum && Object.keys(_ebistrMailDurum).length) {
            ebistrAnalizler.forEach(function(a) {
                var key = a.brnNo || a.labReportNo || '';
                if (_ebistrMailDurum[key]) a.mailGonderildi = true;
            });
        }

        var uyg   = ebistrAnalizler.filter(function (a) { return a.durum === 'UYGUNSUZ'; }).length;
        var uyr   = ebistrAnalizler.filter(function (a) { return a.durum === 'UYARI' || a.durum === 'SAPMA_KURTARDI'; }).length;
        var uygun = ebistrAnalizler.filter(function (a) { return a.durum === 'UYGUN'; }).length;
        var haf   = ebistrAnalizler.filter(function (a) { return a.durum === 'HAFTALIK'; }).length;

        var oz = document.getElementById('ebistr-ozet-row');
        if (oz) oz.style.display = 'grid';
        ['eoz-toplam', 'eoz-uyg', 'eoz-uyr', 'eoz-uygun', 'eoz-haftalik'].forEach(function (id, i) {
            var el = document.getElementById(id);
            if (el) el.textContent = [ebistrAnalizler.length, uyg, uyr, uygun, haf][i];
        });

        var fr = document.getElementById('ebistr-filtre-row');
        if (fr) fr.style.display = 'flex';

        ebistrFiltreDoldur();
        ebistrFiltrele('hepsi');

        var mb = document.getElementById('ebistr-mail-btn');
        if (mb) mb.disabled = (uyg + uyr) === 0;
        var eb = document.getElementById('ebistr-excel-btn');
        if (eb) eb.disabled = false;

        var badge = document.getElementById('ebistrBadge');
        if (badge) { badge.textContent = uyg; badge.style.display = uyg > 0 ? '' : 'none'; }

        toast('Analiz tamamlandı: ' + ebistrAnalizler.length + ' rapor hazır', 'ok');
    }, 30);
}

// ── TS 13515 KRITER YARDIMCISI ────────────────────────────────────
function _ts13515Kriter(fciDeg, fck) {
    var n = fciDeg.length;
    if (n === 0) return { uygun: false, kriterler: [], fcm: 0, fciMin: 0 };
    var fcm = fciDeg.reduce(function(a,b){return a+b;},0) / n;
    var fciMin = Math.min.apply(null, fciDeg);
    var uygun = true, kriterler = [];
    if (n === 1) {
        var k1 = fciMin >= fck;
        kriterler.push({ ad:'n=1: fci≥fck', deger:parseFloat(fciMin.toFixed(2)), sinir:fck, sonuc:k1 });
        uygun = k1;
    } else if (n <= 4) {
        var ka = fcm >= fck+1, kb = fciMin >= fck-4;
        kriterler.push({ ad:'n=2-4: fcm≥fck+1', deger:parseFloat(fcm.toFixed(2)), sinir:fck+1, sonuc:ka });
        kriterler.push({ ad:'n=2-4: fci(min)≥fck-4', deger:parseFloat(fciMin.toFixed(2)), sinir:fck-4, sonuc:kb });
        uygun = ka && kb;
    } else {
        var kc = fcm >= fck+2, kd = fciMin >= fck-4;
        kriterler.push({ ad:'n≥5: fcm≥fck+2', deger:parseFloat(fcm.toFixed(2)), sinir:fck+2, sonuc:kc });
        kriterler.push({ ad:'n≥5: fci(min)≥fck-4', deger:parseFloat(fciMin.toFixed(2)), sinir:fck-4, sonuc:kd });
        uygun = kc && kd;
    }
    return { uygun:uygun, kriterler:kriterler, fcm:parseFloat(fcm.toFixed(2)), fciMin:parseFloat(fciMin.toFixed(2)) };
}

// ── TS 13515 KURAL MOTORU ─────────────────────────────────────────
function ebistrTs13515(brnNo, numuneler) {
    var ilk = numuneler[0];
    var isKup = (ilk.numuneBoyutu || '').indexOf('15x15') >= 0;
    var fck = isKup ? (ilk.fckKup || 0) : (ilk.fckSil || 0);

    var n7 = numuneler.filter(function (n) { return n.curingGun === 7; });
    var n28 = numuneler.filter(function (n) { return n.curingGun === 28; });

    // İrsaliye bazında takım grupla (28 günlük, hesap dışı olmayan)
    var irsGrp = {};
    n28.forEach(function (n) {
        if (n.hesapDisi || n.fc <= 0) return;
        var k = n.irsaliye || (n.brnNo + '_' + n.takeDate);
        if (!irsGrp[k]) irsGrp[k] = [];
        irsGrp[k].push(n);
    });

    var takimlar = [], gecersizler = [];
    Object.keys(irsGrp).forEach(function (irs) {
        var gr = irsGrp[irs];
        var fc = gr.map(function (n) { return n.fc; });
        var max = Math.max.apply(null, fc), min = Math.min.apply(null, fc);
        var ort = fc.reduce(function (a, b) { return a + b; }, 0) / fc.length;
        var aralik = max - min, sinir = ort * 0.15;
        var t = { irsaliye: irs, takeDate: gr[0].takeDate, fcDegerler: fc, ortalama: ort, aralik: parseFloat(aralik.toFixed(2)), sinir: parseFloat(sinir.toFixed(2)), gecerli: aralik <= sinir };
        
        // Kullanıcı isteği: Sapmalı da olsa sonuçlar görülmeli. 
        // Bu yüzden tüm takımları 'takimlar' listesine ekliyoruz ama geçersizleri işaretliyoruz.
        takimlar.push(t); 
        if (!t.gecerli) gecersizler.push(t);
    });

    var n = takimlar.length;
    var fciDeg = takimlar.map(function (t) { return t.ortalama; });

    var sorunlar = [];

    // 28g < 7g kontrolü (*)
    var yildiz = 0;
    n28.forEach(function (s28) {
        var esler = n7.filter(function (s) { return s.irsaliye === s28.irsaliye; });
        if (esler.length) {
            var ort7 = esler.reduce(function (a, b) { return a + b.fc; }, 0) / esler.length;
            if (s28.fc > 0 && s28.fc < ort7) yildiz++;
        }
    });
    if (yildiz) sorunlar.push(yildiz + ' numunede 28g dayanımı 7g\'den düşük (*)');

    // ── Ana TS 13515 kriter kontrolü ──
    var mainKriter, kriterler, durum;
    if (n === 0) {
        mainKriter = { uygun: false, kriterler: [], fcm: 0, fciMin: 0 };
        if (n7.length > 0) {
            var ort7v = n7.reduce(function (a, b) { return a + b.fc; }, 0) / n7.length;
            sorunlar.push('28 günlük kırım bekleniyor. 7g Ort: ' + ort7v.toFixed(1) + ' (Tahmini 28g: ~' + (ort7v / 0.75).toFixed(1) + ')');
            durum = 'HAFTALIK';
        } else {
            sorunlar.push('Geçerli veri girişi yok');
            durum = 'UYGUNSUZ';
        }
        kriterler = [];
    } else {
        mainKriter = _ts13515Kriter(fciDeg, fck);
        kriterler = mainKriter.kriterler;
        if (!mainKriter.uygun) {
            mainKriter.kriterler.forEach(function(k) { if (!k.sonuc) sorunlar.push(k.ad + ': ' + k.deger + ' < ' + k.sinir); });
        }
    }

    // ── Mikser içi sapma tespiti & düzeltilmiş takım ortalamaları ──
    // Her gecersiz takım için: en uç fc değerini çıkar, kalan değerlerin ortalamasını al.
    // Düzeltilmiş takım ortalamaları ile TS 13515'i yeniden çalıştır.
    var sapmaNotu = null;
    var adjKriter = null;

    var adjTakimlar = takimlar.map(function(t) {
        if (t.gecerli || t.fcDegerler.length <= 1) {
            // Geçerli takım: düzeltme gerekmez
            return { irsaliye: t.irsaliye, takeDate: t.takeDate,
                     fcDegerler: t.fcDegerler, ortalama: t.ortalama,
                     aralik: t.aralik, sinir: t.sinir, gecerli: t.gecerli,
                     fcDegerlerAdj: t.fcDegerler, ortalamaAdj: t.ortalama,
                     gecerliAdj: t.gecerli, sapmaliFc: null };
        }
        // En düşük değeri bul (sapmalı numune her zaman düşük olandır)
        var fcArr = t.fcDegerler;
        var bestIdx = 0;
        for (var i = 1; i < fcArr.length; i++) {
            if (fcArr[i] < fcArr[bestIdx]) bestIdx = i;
        }
        var remaining = fcArr.filter(function(_, j) { return j !== bestIdx; });
        var newOrt = remaining.reduce(function(a, b) { return a + b; }, 0) / remaining.length;
        var newAralik = remaining.length > 1
            ? Math.max.apply(null, remaining) - Math.min.apply(null, remaining) : 0;
        var newSinir = newOrt * 0.15;
        return {
            irsaliye: t.irsaliye, takeDate: t.takeDate,
            fcDegerler: t.fcDegerler, ortalama: t.ortalama,
            aralik: t.aralik, sinir: t.sinir, gecerli: t.gecerli,
            fcDegerlerAdj: remaining,
            ortalamaAdj: parseFloat(newOrt.toFixed(2)),
            aralikAdj: parseFloat(newAralik.toFixed(2)),
            sinirAdj: parseFloat(newSinir.toFixed(2)),
            gecerliAdj: newAralik <= newSinir,
            sapmaliFc: fcArr[bestIdx],
            sapmaliIdx: bestIdx,
            hasSapma: true
        };
    });

    // Düzeltilmiş takım ortalamaları ile TS 13515
    var adjFciDeg = adjTakimlar.map(function(t) {
        return t.sapmaliFc !== null && t.sapmaliFc !== undefined ? t.ortalamaAdj : t.ortalama;
    });
    adjKriter = n > 0 ? _ts13515Kriter(adjFciDeg, fck) : { uygun: false, kriterler: [], fcm: 0, fciMin: 0 };

    // sapmaliIrsaliyeler: sadece gerçekten sapmalı fc değeri olan takımların irsaliye listesi
    var sapmaliIrsaliyeler = new Set(
        adjTakimlar.filter(function(t) { return t.hasSapma; }).map(function(t) { return t.irsaliye; })
    );

    if (sapmaliIrsaliyeler.size > 0 && durum !== 'HAFTALIK') {
        if (mainKriter.uygun) {
            sapmaNotu = 'UYGUN_SAP';
            durum = 'UYGUN';
        } else if (adjKriter.uygun) {
            sapmaNotu = 'SAPMA_KURTARDI';
            durum = 'SAPMA_KURTARDI';
            sorunlar.unshift('⚠️ Sapmalı değer çıkarıldığında UYGUN olur (fcm=' + adjKriter.fcm + ', fciMin=' + adjKriter.fciMin + ' MPa)');
        } else {
            sapmaNotu = 'SAPMASIZ_UYGUNSUZ';
            durum = 'UYGUNSUZ';
            sorunlar.push('Sapmalı değer çıkarılsa da UYGUNSUZ kalır (fcm=' + adjKriter.fcm + ', fciMin=' + adjKriter.fciMin + ' MPa)');
        }
    } else if (durum !== 'HAFTALIK') {
        durum = mainKriter.uygun ? 'UYGUN' : 'UYGUNSUZ';
    }

    // Akıllı Tarih Belirleme (28-günlük önceliği)
    var rD = ilk.takeDate || '';
    var rB = (n28.length > 0 ? n28[0].breakDate : ilk.breakDate) || '';

    return {
        brnNo: brnNo, labReportNo: ilk.labReportNo, labNo: ilk.labNo,
        takeDate: rD.substring(0, 10), breakDate: rB.substring(0, 10),
        yapiDenetim: ilk.yapiDenetim, contractor: ilk.contractor,
        manufacturer: ilk.manufacturer || '',
        buildingOwner: ilk.buildingOwner || ilk.ownerName || '—',
        buildingAddress: ilk.buildingAddress, yibf: ilk.yibf,
        yapiElem: ilk.yapiElem, betonSinifi: ilk.betonSinifi, fck: fck, isKup: isKup,
        fckSil: ilk.fckSil || 0, fckKup: ilk.fckKup || 0,
        n: n, fcm: mainKriter.fcm, fciMin: mainKriter.fciMin,
        fciDegerler: fciDeg.map(function(v) { return parseFloat(v.toFixed(2)); }),
        gecerliTakim: n, gecersizTakim: gecersizler.length,
        n7Sayisi: n7.length, n28Sayisi: n28.length, yildizSayisi: yildiz,
        // 7g numune detayları (HAFTALIK kartı için)
        n7Takimlar: (function() {
            var grp7 = {};
            n7.filter(function(n){ return n.fc > 0; }).forEach(function(n) {
                var k = n.irsaliye || ('_' + n.labNo);
                if (!grp7[k]) grp7[k] = { irsaliye: n.irsaliye || '—', fcDegerler: [], takeDate: n.takeDate };
                grp7[k].fcDegerler.push(n.fc);
            });
            return Object.values(grp7).map(function(g) {
                var ort = g.fcDegerler.reduce(function(a,b){return a+b;},0) / g.fcDegerler.length;
                return { irsaliye: g.irsaliye, fcDegerler: g.fcDegerler, ortalama: parseFloat(ort.toFixed(2)) };
            });
        })(),
        takimlar: takimlar, gecersizTakimlar: gecersizler,
        adjTakimlar: adjTakimlar,
        sapmaNotu: sapmaNotu,
        sapmaliIrsaliyeler: Array.from(sapmaliIrsaliyeler),
        adjKriter: adjKriter,
        kriterler: kriterler, sorunlar: sorunlar, durum: durum, mailGonderildi: false
    };
}


// ── TABLO RENDER ──────────────────────────────────────────────────
function ebistrFiltrele(filtre) {
    if (filtre) ebistrFiltreSec = filtre;
    
    var ara = ((document.getElementById('ebistr-ara') || {}).value || '').toLowerCase();
    var fBas = (document.getElementById('ebistr-f-bas') || {}).value || '';
    var fBit = (document.getElementById('ebistr-f-bit') || {}).value || '';
    var fYd  = (document.getElementById('ebistr-f-yd') || {}).value || '';
    var fSin = (document.getElementById('ebistr-f-sinif') || {}).value || '';
    var fMut = (document.getElementById('ebistr-f-mut') || {}).value || '';
    var fYibf = ((document.getElementById('ebistr-f-yibf') || {}).value || '').toLowerCase();
    var fNo   = ((document.getElementById('ebistr-f-no')   || {}).value || '').toLowerCase();
    var fBol  = ((document.getElementById('ebistr-f-bolum')|| {}).value || '').toLowerCase();
    var fMail = (document.getElementById('ebistr-f-mail')  || {}).value || '';

    ebistrFiltreliListe = ebistrAnalizler.filter(function (a) {
        var df = ebistrFiltreSec === 'hepsi' || a.durum === ebistrFiltreSec;
        var tf = true;
        if (fBas) tf = tf && (a.breakDate >= fBas);
        if (fBit) tf = tf && (a.breakDate <= fBit);
        if (fYd)  tf = tf && (a.yapiDenetim === fYd);
        if (fSin) tf = tf && (a.betonSinifi === fSin);
        if (fMut) tf = tf && (a.contractor === fMut);
        if (fYibf) tf = tf && (String(a.yibf || '').toLowerCase().indexOf(fYibf) >= 0);
        if (fNo)   tf = tf && (String(a.brnNo || '').toLowerCase().indexOf(fNo) >= 0 || String(a.labReportNo || '').toLowerCase().indexOf(fNo) >= 0);
        if (fBol)  tf = tf && (String(a.yapiElem || '').toLowerCase().indexOf(fBol) >= 0);
        if (fMail) {
            if (fMail === 'gonderildi') tf = tf && a.mailGonderildi;
            else if (fMail === 'bekliyor') tf = tf && !a.mailGonderildi;
        }
        if (ara) {
            var hay = [a.brnNo, a.labReportNo, a.yapiDenetim, a.contractor, a.buildingOwner, a.yapiElem, a.betonSinifi].join(' ').toLowerCase();
            tf = tf && hay.indexOf(ara) >= 0;
        }
        return df && tf;
    });
    var liste = ebistrFiltreliListe;


    // ── Yapı Denetim Gruplarına Böl ─────────────────────────────────
    // Sıra: UYGUNSUZ → SAPMA_KURTARDI → UYARI → HAFTALIK → UYGUN
    var durumSira = { 'UYGUNSUZ': 0, 'SAPMA_KURTARDI': 1, 'UYARI': 2, 'HAFTALIK': 3, 'UYGUN': 4 };
    liste.sort(function(a, b) {
        var ydA = a.yapiDenetim || '—', ydB = b.yapiDenetim || '—';
        if (ydA < ydB) return -1;
        if (ydA > ydB) return 1;
        return (durumSira[a.durum] || 5) - (durumSira[b.durum] || 5);
    });

    // Firma gruplarını oluştur
    var firmalar = {};
    var firmaOrder = [];
    liste.forEach(function(a) {
        var yd = a.yapiDenetim || '—';
        if (!firmalar[yd]) { firmalar[yd] = []; firmaOrder.push(yd); }
        firmalar[yd].push(a);
    });

    function _renderRow(a) {
        var realIdx = ebistrAnalizler.indexOf(a);
        var r = ebistrRenkMap[a.durum] || 'var(--tx3)';
        var yd = ebistrYdBul(a.yapiDenetim);
        var mailDur = a.mailGonderildi
            ? '<span style="color:var(--grn);font-size:11px">✓ Gönderildi</span>'
            : yd ? '<span style="color:var(--tx3);font-size:11px">Bekliyor</span>'
            : '<span style="color:var(--tx3);font-size:11px">—</span>';

        var _dot = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + r + ';margin-right:5px;vertical-align:middle;flex-shrink:0"></span>';
        var sapmaClass = a.sapmaNotu ? 'ebistr-row-deviated' : '';
        return '<tr class="' + sapmaClass + '" style="border-bottom:1px solid var(--bdr);cursor:pointer" onclick="ebistrDetay(' + realIdx + ')">' +
            '<td style="padding:10px 8px">' +
                '<span class="ebistr-status-badge" style="background:' + r + '22;color:' + r + ';border-color:' + r + '44;display:inline-flex;align-items:center">' +
                    _dot +
                    (ebistrEtiketMap[a.durum] || a.durum) +
                '</span>' +
                (a.sapmaNotu === 'UYGUN_SAP' ? '<div style="font-size:10px;color:#f97316;margin-top:3px">↺ sapmalı, geçiyor</div>' : '') +
                (a.sapmaNotu === 'SAPMASIZ_UYGUNSUZ' ? '<div style="font-size:10px;color:#fb923c;margin-top:3px">↺ sapma çıkarılsa da uygunsuz</div>' : '') +
            '</td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;font-family:var(--mono);font-size:11px;color:var(--tx3)">' + (a.yibf || '—') + '</td>' +
            '<td style="padding:10px 8px;font-family:var(--mono);font-size:12px">' +
                '<div style="color:var(--acc2);font-weight:700">' + (a.labReportNo || a.brnNo || '—') +
                (a.gecersizTakim > 0 ? ' <span style="color:var(--amb);font-size:11px" title="%15 Sapma Kuralı İhlali">⚠</span>' : '') + '</div>' +
                (a.brnNo && a.labReportNo ? '<div style="font-size:10px;color:var(--tx3);margin-top:1px">' + a.brnNo + '</div>' : '') +
            '</td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;font-size:11px;color:var(--tx3)">' + (a.takeDate || '') + '</td>' +
            '<td style="padding:10px 8px;font-size:11px;color:var(--tx3)">' + (a.breakDate || '') + '</td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;font-size:11px">' +
                '<div style="display:flex;gap:3px;flex-wrap:wrap">' +
                    '<span style="background:rgba(59,130,246,0.1);color:var(--acc2);border-radius:5px;padding:1px 6px;font-weight:600;font-size:10px">7g:' + a.n7Sayisi + '</span>' +
                    '<span style="background:rgba(16,185,129,0.1);color:var(--grn);border-radius:5px;padding:1px 6px;font-weight:600;font-size:10px">28g:' + a.n28Sayisi + '</span>' +
                '</div>' +
            '</td>' +
            '<td style="padding:10px 8px;font-size:11px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx2)" title="' + (a.yapiDenetim || '') + '">' + (a.yapiDenetim || '—') + '</td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx3)" title="' + (a.manufacturer || '') + '">' + (a.manufacturer || '—') + '</td>' +
            '<td class="td-hide-md" style="padding:10px 8px;font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx3)" title="' + (a.buildingOwner || '') + '">' + (a.buildingOwner || '—') + '</td>' +
            '<td style="padding:10px 8px;font-size:11px"><strong style="color:var(--tx)">' + (a.betonSinifi || '') + '</strong><span style="color:var(--tx3);margin-left:3px">/' + (a.fck || '?') + '</span></td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;text-align:center;font-size:12px;font-weight:600">' + a.n + '</td>' +
            '<td style="padding:10px 8px;text-align:right;font-family:var(--mono);font-size:12px;color:' + (a.fcm < a.fck ? 'var(--red)' : 'var(--tx)') + ';font-weight:700">' + (a.fcm || '—') + '</td>' +
            '<td class="td-hide-sm" style="padding:10px 8px;text-align:right;font-family:var(--mono);font-size:12px;color:' + r + ';font-weight:700">' + (a.fciMin || '—') + '</td>' +
            '<td class="td-hide-md" style="padding:10px 8px;font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx3)">' + (a.yapiElem || '') + '</td>' +
            '<td class="td-hide-md" style="padding:10px 8px">' + mailDur + '</td>' +
            '<td style="padding:10px 8px"><button class="btn btn-o" style="width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px" onclick="event.stopPropagation();ebistrTekMail(' + realIdx + ')">📧</button></td>' +
            '</tr>';
    }

    var tbody = document.getElementById('ebistr-tbody');
    if (tbody) {
        var html = '';
        firmaOrder.forEach(function(firmaAd) {
            var grp = firmalar[firmaAd];
            var uyg = grp.filter(function(a) { return a.durum === 'UYGUNSUZ'; }).length;
            var sap = grp.filter(function(a) { return a.durum === 'SAPMA_KURTARDI'; }).length;
            var ydObj = ebistrYdBul(firmaAd);
            var mailBtn = ydObj
                ? '<button class="btn btn-o" style="padding:2px 10px;font-size:11px;border-radius:6px;margin-left:8px" onclick="event.stopPropagation();ebistrTopluMailFirma(\'' + encodeURIComponent(firmaAd) + '\')" title="Bu firmaya toplu mail gönder">📧 Toplu Mail</button>' +
                  '<button class="btn btn-p" style="padding:2px 10px;font-size:11px;border-radius:6px;margin-left:4px" onclick="event.stopPropagation();ebistrTopluMailOnizle(\'' + encodeURIComponent(firmaAd) + '\')" title="Toplu mail önizle">👁 Önizle</button>'
                : '<button class="btn btn-p" style="padding:2px 10px;font-size:11px;border-radius:6px;margin-left:8px" onclick="event.stopPropagation();ebistrTopluMailOnizle(\'' + encodeURIComponent(firmaAd) + '\')" title="Toplu mail önizle">👁 Önizle</button>';
            var colCount = 16; // thead sütun sayısı
            html += '<tr style="background:var(--bg2)">' +
                '<td colspan="' + colCount + '" style="padding:8px 12px;border-top:2px solid var(--acc);border-bottom:1px solid var(--bdr)">' +
                    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
                        '<span style="font-weight:700;color:var(--acc2);font-size:13px">' + firmaAd + '</span>' +
                        '<span style="font-size:11px;color:var(--tx3)">' + grp.length + ' rapor</span>' +
                        (uyg > 0 ? '<span style="background:rgba(239,68,68,0.12);color:var(--red);border-radius:5px;padding:1px 8px;font-size:11px;font-weight:600">' + uyg + ' uygunsuz</span>' : '') +
                        (sap > 0 ? '<span style="background:rgba(249,115,22,0.12);color:#f97316;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:600">' + sap + ' sapmalı</span>' : '') +
                        mailBtn +
                    '</div>' +
                '</td>' +
            '</tr>';
            grp.forEach(function(a) { html += _renderRow(a); });
        });
        tbody.innerHTML = html;
    }

    // Filtre buton aktif durumları
    var filterMap = { 'hepsi': 'ef-hepsi', 'UYGUNSUZ': 'ef-uyg', 'UYARI': 'ef-uyr', 'UYGUN': 'ef-uygun', 'HAFTALIK': 'ef-haftalik' };
    var classMap  = { 'hepsi': '', 'UYGUNSUZ': 'uygunsuz', 'UYARI': 'uyari', 'UYGUN': 'uygun', 'HAFTALIK': 'haftalik' };
    Object.keys(filterMap).forEach(function (f) {
        var btn = document.getElementById(filterMap[f]);
        if (btn) {
            btn.className = 'ebistr-fbtn' + (classMap[f] ? ' ' + classMap[f] : '') + (ebistrFiltreSec === f ? ' on' : '');
        }
    });

    var wrap = document.getElementById('ebistr-tablo-wrap');
    var pan  = document.getElementById('ebistr-adv-panel');
    var frw  = document.getElementById('ebistr-filtre-row');

    if (wrap) {
        if (ebistrAnalizler.length > 0) {
            wrap.style.display = '';
        } else {
            // Analiz yoksa yükleniyor mesajı göster (tablo gizleme — boş ekran olmasın)
            wrap.style.display = '';
            if (tbody && tbody.innerHTML.trim() === '') {
                tbody.innerHTML = '<tr><td colspan="16" style="padding:40px;text-align:center;color:var(--tx3);font-size:13px">⏳ Veriler yükleniyor... Proxy\'den veri çekin veya analizi çalıştırın.</td></tr>';
            }
        }
    }
    if (pan)  pan.style.display  = (ebistrAnalizler.length > 0) ? '' : 'none';
    if (frw)  frw.style.display  = '';
}

function ebistrFiltreDoldur() {
    var yds = [], siniflar = [], mutahhitler = [];
    ebistrAnalizler.forEach(function (a) {
        if (a.yapiDenetim && yds.indexOf(a.yapiDenetim) === -1) yds.push(a.yapiDenetim);
        if (a.betonSinifi && siniflar.indexOf(a.betonSinifi) === -1) siniflar.push(a.betonSinifi);
        if (a.contractor && mutahhitler.indexOf(a.contractor) === -1) mutahhitler.push(a.contractor);
    });

    var doldur = function (id, liste) {
        var el = document.getElementById(id);
        if (!el) return;
        var cur = el.value;
        el.innerHTML = '<option value="">Hepsi</option>' + 
            liste.sort().map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
        el.value = cur;
    };

    doldur('ebistr-f-yd', yds);
    doldur('ebistr-f-sinif', siniflar);
    doldur('ebistr-f-mut', mutahhitler);
}

function ebistrFiltreSifirla() {
    ['ebistr-f-bas', 'ebistr-f-bit', 'ebistr-f-yd', 'ebistr-f-sinif', 'ebistr-f-mut', 'ebistr-f-yibf', 'ebistr-f-no', 'ebistr-f-bolum', 'ebistr-f-mail', 'ebistr-ara'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    ebistrFiltrele('hepsi');
}

// ── DETAY MODAL ───────────────────────────────────────────────────
function ebistrDetay(idx) {
    try {
        var a = ebistrAnalizler[idx];
        if (!a) return;
        
        var fm = function (v, d) {
            if (v === undefined || v === null || isNaN(v)) return '—';
            return parseFloat(v).toFixed(d || 1);
        };

        var r = a.durum === 'UYGUNSUZ' ? 'var(--red)' : a.durum === 'HAFTALIK' ? 'var(--acc)' : a.durum === 'UYARI' ? '#fbbf24' : 'var(--grn)';
        var etiket = ebistrEtiketMap[a.durum] || a.durum;
        
        var sat = function (l, v, bold) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
                '<span style="color:var(--tx3);font-size:12px">' + l + '</span>' +
                '<span style="font-size:12px;font-weight:' + (bold ? '700' : '500') + ';text-align:right;color:' + (bold ? 'var(--tx)' : 'var(--tx2)') + '">' + (v || '—') + '</span></div>';
        };

        var kriterHtml = (a.kriterler || []).map(function (k) {
            var c = k.sonuc ? 'var(--grn)' : 'var(--red)';
            return '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:10px;margin-bottom:6px;border:1px solid ' + (k.sonuc ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + '">' +
                '<span style="font-size:11px;color:var(--tx3)">' + k.ad + '</span>' +
                '<span style="font-size:12px;font-weight:700;color:' + c + '">' + (k.sonuc ? '✓ ' : '✗ ') + fm(k.deger) + ' / ' + k.sinir + ' MPa</span></div>';
        }).join('');

        var sorunHtml = (a.sorunlar || []).map(function (s) {
            return '<div style="padding:8px 12px;background:rgba(239,68,68,0.05);border-left:4px solid var(--red);margin-bottom:6px;font-size:12px;color:#fca5a5;border-radius:4px">' + s + '</div>';
        }).join('');

        // ── Takım tablosu yardımcısı ──────────────────────────────────
        function _takimTabloSatiri(t, fcDeg, ort, aralik, sinir, gecerli, fck, isSapmaligostir) {
            var isFckDusuk = fck > 0 && ort < (fck - 4);
            var isSapmali  = !gecerli;
            var rowBg = isFckDusuk ? 'rgba(239,68,68,0.08);border-bottom:2px solid rgba(239,68,68,0.4)'
                : isSapmali ? 'rgba(245,158,11,0.08);border-bottom:2px solid rgba(245,158,11,0.3)'
                : 'border-top:1px solid var(--bdr)';
            var iriRenk = isFckDusuk ? 'var(--red)' : isSapmali ? 'var(--amb)' : 'var(--tx)';
            return '<tr style="' + rowBg + '">' +
                '<td style="padding:10px 12px;font-family:var(--mono);font-weight:' + (isSapmali||isFckDusuk?'700':'400') + ';color:' + iriRenk + '">' +
                    t.irsaliye +
                    (isFckDusuk ? ' 🔴 <span style="font-size:10px;font-family:sans-serif">fck-4 altı</span>' : isSapmali && isSapmaligostir ? ' ⚠️' : '') +
                '</td>' +
                '<td style="padding:10px 12px;text-align:center;color:var(--tx2)">' + fcDeg.length + '</td>' +
                '<td style="padding:10px 12px;text-align:right;font-family:var(--mono)">' +
                    fcDeg.map(function(v){ return fm(v); }).join(' <span style="opacity:0.3">·</span> ') + '</td>' +
                '<td style="padding:10px 12px;text-align:right;font-weight:800;font-size:13px;color:' + (isFckDusuk ? 'var(--red)' : isSapmali ? 'var(--amb)' : 'var(--tx)') + '">' + fm(ort) + '</td>' +
                '<td style="padding:10px 12px;text-align:right;font-family:var(--mono);color:' + (isSapmali?'var(--red)':'var(--tx3)') + '">' + fm(aralik) + '</td>' +
                '<td style="padding:10px 12px;text-align:right;font-family:var(--mono);color:var(--tx3)">' + fm(sinir) + (isSapmali ? ' <span style="color:var(--red);font-size:10px">❌</span>' : ' <span style="color:var(--grn);font-size:10px">✓</span>') + '</td>' +
            '</tr>';
        }

        var TAKIM_TH = '<tr style="background:rgba(255,255,255,0.03);color:var(--tx3)">' +
            '<th style="padding:12px;text-align:left">İrsaliye</th>' +
            '<th style="padding:12px;text-align:center">n</th>' +
            '<th style="padding:12px;text-align:right">Değerler (MPa)</th>' +
            '<th style="padding:12px;text-align:right">Ort.</th>' +
            '<th style="padding:12px;text-align:right">Aralık</th>' +
            '<th style="padding:12px;text-align:right">Sınır (%15)</th>' +
        '</tr>';

        var hasSapmaVar = a.adjTakimlar && a.adjTakimlar.some(function(t){ return t.hasSapma; });

        var takimHtml = '';
        if (a.takimlar && a.takimlar.length) {
            // ── Orijinal tablo ──────────────────────────────────────────
            var origSatirlar = a.takimlar.map(function(t) {
                return _takimTabloSatiri(t, t.fcDegerler, t.ortalama, t.aralik, t.sinir, t.gecerli, a.fck, true);
            }).join('');

            takimHtml = '<div style="margin-top:24px">' +
                '<div style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--tx2);display:flex;align-items:center;gap:8px">' +
                    '📊 Orijinal Hesaplama (28 Günlük)' +
                    (a.gecersizTakim ? '<span style="font-size:11px;background:rgba(245,158,11,.9);color:#fff;padding:2px 8px;border-radius:10px;font-weight:800">⚠️ ' + a.gecersizTakim + ' sapmalı</span>' : '') +
                '</div>' +
                '<div style="overflow:hidden;border-radius:12px;border:1px solid var(--bdr)">' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
                TAKIM_TH + origSatirlar +
                '</table></div>';

            // Orijinal sonuç badge
            var origBadgeBg = a.fcm >= a.fck ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.1)';
            var origBadgeColor = a.fcm >= a.fck ? 'var(--grn)' : 'var(--red)';
            takimHtml += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 12px;background:var(--bg2);border-radius:8px">' +
                '<span style="font-size:11px;color:var(--tx3)">fcm: <strong style="color:var(--tx)">' + fm(a.fcm) + ' MPa</strong></span>' +
                '<span style="font-size:11px;color:var(--tx3)">fci min: <strong style="color:var(--tx)">' + fm(a.fciMin) + ' MPa</strong></span>' +
                '<span style="flex:1"></span>' +
                (a.kriterler || []).map(function(k){ return '<span style="font-size:11px;color:' + (k.sonuc?'var(--grn)':'var(--red)') + '">' + (k.sonuc?'✓':'✗') + ' ' + k.ad + '</span>'; }).join('') +
            '</div></div>';

            // ── Düzeltilmiş tablo (sadece sapma varsa) ─────────────────
            if (hasSapmaVar && a.adjTakimlar && a.adjKriter) {
                var adjSatirlar = a.adjTakimlar.map(function(t) {
                    if (t.hasSapma) {
                        // Sapmalı fc değerini kırmızıyla göster, sonra kalan değerleri + yeni ortalama
                        var fcWithStrike = t.fcDegerler.map(function(v, i) {
                            return i === t.sapmaliIdx
                                ? '<span style="color:var(--red);text-decoration:line-through;opacity:.7">' + fm(v) + '</span>'
                                : fm(v);
                        }).join(' <span style="opacity:0.3">·</span> ');
                        var isFckDusukAdj = a.fck > 0 && t.ortalamaAdj < (a.fck - 4);
                        return '<tr style="background:rgba(16,185,129,0.05);border-top:1px solid var(--bdr)">' +
                            '<td style="padding:10px 12px;font-family:var(--mono);color:var(--tx)">' + t.irsaliye + ' <span style="font-size:10px;color:#22c55e">✂ düzeltildi</span></td>' +
                            '<td style="padding:10px 12px;text-align:center;color:var(--tx2)">' + t.fcDegerlerAdj.length + '</td>' +
                            '<td style="padding:10px 12px;text-align:right;font-family:var(--mono)">' + fcWithStrike + '</td>' +
                            '<td style="padding:10px 12px;text-align:right;font-weight:800;font-size:13px;color:' + (isFckDusukAdj?'var(--red)':'#22c55e') + '">' + fm(t.ortalamaAdj) + '</td>' +
                            '<td style="padding:10px 12px;text-align:right;font-family:var(--mono);color:var(--tx3)">' + fm(t.aralikAdj) + '</td>' +
                            '<td style="padding:10px 12px;text-align:right;font-family:var(--mono);color:var(--tx3)">' + fm(t.sinirAdj) + ' <span style="color:var(--grn);font-size:10px">✓</span></td>' +
                        '</tr>';
                    }
                    return _takimTabloSatiri(t, t.fcDegerler, t.ortalama, t.aralik, t.sinir, t.gecerli, a.fck, false);
                }).join('');

                var adjK = a.adjKriter;
                var adjSonucBg = adjK.uygun ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)';
                var adjSonucColor = adjK.uygun ? 'var(--grn)' : 'var(--red)';

                takimHtml += '<div style="margin-top:20px">' +
                    '<div style="font-size:14px;font-weight:700;margin-bottom:10px;color:#22c55e;display:flex;align-items:center;gap:8px">' +
                        '🛠️ Düzeltilmiş Hesaplama (Sapmalı Değer Çıkarıldı)' +
                    '</div>' +
                    '<div style="overflow:hidden;border-radius:12px;border:1px solid rgba(16,185,129,.3)">' +
                    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
                    TAKIM_TH + adjSatirlar +
                    '</table></div>' +
                    '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 12px;background:' + adjSonucBg + ';border-radius:8px;align-items:center">' +
                        '<span style="font-size:11px;color:var(--tx3)">fcm: <strong style="color:' + adjSonucColor + '">' + fm(adjK.fcm) + ' MPa</strong></span>' +
                        '<span style="font-size:11px;color:var(--tx3)">fci min: <strong style="color:' + adjSonucColor + '">' + fm(adjK.fciMin) + ' MPa</strong></span>' +
                        '<span style="flex:1"></span>' +
                        (adjK.kriterler || []).map(function(k){ return '<span style="font-size:11px;color:' + (k.sonuc?'var(--grn)':'var(--red)') + '">' + (k.sonuc?'✓':'✗') + ' ' + k.ad + '</span>'; }).join('') +
                        '<strong style="font-size:13px;color:' + adjSonucColor + ';margin-left:8px">' + (adjK.uygun ? '✅ UYGUN' : '❌ UYGUNSUZ') + '</strong>' +
                    '</div></div>';
            }
        }

        // Haftalık için 7g kırım tablosu
        var haftalikNot = '';
        if (a.durum === 'HAFTALIK') {
            var n7takimlar = a.n7Takimlar || [];
            var n7Satirlar = n7takimlar.map(function(t) {
                var tahmini28 = (t.ortalama / 0.70).toFixed(1);
                return '<tr style="border-top:1px solid var(--bdr)">' +
                    '<td style="padding:8px 10px;font-family:var(--mono);font-size:12px">' + t.irsaliye + '</td>' +
                    '<td style="padding:8px 10px;text-align:right;font-family:var(--mono)">' +
                        t.fcDegerler.map(function(v){ return parseFloat(v).toFixed(1); }).join(' · ') + '</td>' +
                    '<td style="padding:8px 10px;text-align:right;font-weight:700;font-family:var(--mono);color:var(--acc2)">' + t.ortalama.toFixed(1) + '</td>' +
                    '<td style="padding:8px 10px;text-align:right;font-size:11px;color:var(--tx3)">' + tahmini28 + '</td>' +
                '</tr>';
            }).join('');
            haftalikNot = '<div style="margin-top:20px">' +
                '<div style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--acc2)">⏳ 7 Günlük Sonuçlar (28g bekliyor)</div>' +
                (n7Satirlar
                    ? '<div style="overflow:hidden;border-radius:12px;border:1px solid var(--bdr)">' +
                      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
                      '<tr style="background:rgba(255,255,255,0.03);color:var(--tx3)">' +
                          '<th style="padding:10px;text-align:left">İrsaliye</th>' +
                          '<th style="padding:10px;text-align:right">fc Değerleri (MPa)</th>' +
                          '<th style="padding:10px;text-align:right">Ort. 7g</th>' +
                          '<th style="padding:10px;text-align:right">Tahmini 28g</th>' +
                      '</tr>' + n7Satirlar +
                      '</table></div>'
                    : '<div style="color:var(--tx3);font-size:12px">7g kırım verisi bulunamadı.</div>') +
            '</div>';
        }

        // ── Header ─────────────────────────────────────────────────
        var durumIkon = a.durum === 'UYGUNSUZ' ? '🚫' : a.durum === 'HAFTALIK' ? '⏳' : a.durum === 'UYARI' ? '⚠️' : a.durum === 'SAPMA_KURTARDI' ? '🟠' : '✅';
        var headerHtml =
            '<div style="display:flex;align-items:center;gap:16px;padding:20px 24px;background:linear-gradient(135deg,' + r + '18,transparent);border:1px solid ' + r + '33;border-radius:16px;margin-bottom:18px">' +
                '<div style="width:52px;height:52px;border-radius:14px;background:' + r + '22;border:1px solid ' + r + '44;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">' + durumIkon + '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:' + r + ';font-weight:800;margin-bottom:3px">' + etiket + '</div>' +
                    '<div style="font-size:20px;font-weight:800;color:var(--tx);letter-spacing:-.02em;font-family:var(--mono)">' + (a.brnNo || '—') + '</div>' +
                    (a.labReportNo ? '<div style="font-size:11px;color:var(--tx3);margin-top:2px">Rapor No: ' + a.labReportNo + '</div>' : '') +
                '</div>' +
                '<div style="text-align:right;flex-shrink:0">' +
                    '<div style="font-family:var(--mono);font-size:14px;font-weight:800;color:' + r + '">' + fm(a.fcm) + ' MPa</div>' +
                    '<div style="font-size:10px;color:var(--tx3)">fcm ortalama</div>' +
                    '<div style="font-size:11px;color:var(--tx3);margin-top:4px">' + (a.breakDate || '') + '</div>' +
                '</div>' +
            '</div>';

        // ── Info Grid (tek seferde, tekrarsız) ─────────────────────
        var infoRow = function(ic, label, val, highlight) {
            if (!val && val !== 0) return '';
            return '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
                '<span style="font-size:14px;flex-shrink:0;width:20px;text-align:center;margin-top:1px">' + ic + '</span>' +
                '<div style="min-width:0">' +
                    '<div style="font-size:10px;color:var(--tx3);font-weight:600;letter-spacing:.03em;text-transform:uppercase;margin-bottom:1px">' + label + '</div>' +
                    '<div style="font-size:12.5px;font-weight:' + (highlight ? '700' : '500') + ';color:' + (highlight ? 'var(--tx)' : 'var(--tx2)') + ';word-break:break-word">' + val + '</div>' +
                '</div>' +
            '</div>';
        };

        var _fckHedef = a.n >= 5 ? (a.fck + 2) : (a.n >= 2 ? (a.fck + 1) : a.fck);
        var _sinifGoster = (function() {
            var s = a.betonSinifi || '';
            if (s && s.indexOf('/') === -1 && a.fckSil && a.fckKup) return 'C' + a.fckSil + '/' + a.fckKup;
            return s;
        })();

        var bodyHtml =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">' +
            // Sol sütun: şantiye & taraflar
            '<div style="background:rgba(255,255,255,.02);border:1px solid var(--bdr);border-radius:12px;padding:14px">' +
                '<div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">🏢 Şantiye & Taraflar</div>' +
                infoRow('🏦', 'Yapı Sahibi',     a.buildingOwner,   true) +
                infoRow('👷', 'Müteahhit',        a.contractor,      false) +
                infoRow('🔍', 'Yapı Denetim',     a.yapiDenetim,     false) +
                infoRow('#',  'YİBF No',          a.yibf,            false) +
                infoRow('📍', 'Şantiye Adresi',   a.buildingAddress, false) +
            '</div>' +
            // Sağ sütun: beton analiz (tekrar eden alanlar YOK)
            '<div style="background:rgba(255,255,255,.02);border:1px solid var(--bdr);border-radius:12px;padding:14px">' +
                '<div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">🧪 Beton & Analiz</div>' +
                infoRow('🧱', 'Yapı Bölümü',   a.yapiElem,    true) +
                infoRow('🏷️', 'Beton Sınıfı',   _sinifGoster,  true) +
                infoRow('📐', 'fck Hedef',      (a.fck ? _fckHedef + ' MPa' : ''), false) +
                infoRow('📊', 'fcm Ortalama',   (a.fcm ? fm(a.fcm) + ' MPa' : ''), true) +
                infoRow('📉', 'fci Minimum',    (a.fciMin ? fm(a.fciMin) + ' MPa' : ''), false) +
                infoRow('🧪', 'Numune (7g/28g)', a.n7Sayisi + ' / ' + a.n28Sayisi, false) +
                (a.manufacturer ? infoRow('🏭', 'Beton Üreticisi', a.manufacturer, false) : '') +
                infoRow('📅', 'Alınış Tarihi',  a.takeDate,   false) +
            '</div>' +
            '</div>';

        var html = headerHtml + bodyHtml +
            (sorunHtml ? '<div style="margin-bottom:16px;padding:12px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:12px"><div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">🚨 Tespit Edilen Sorunlar</div>' + sorunHtml + '</div>' : '') +
            (kriterHtml ? '<div style="margin-bottom:16px;padding:12px 14px;background:rgba(255,255,255,.02);border:1px solid var(--bdr);border-radius:12px"><div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">📋 TS 13515 Kriterleri</div>' + kriterHtml + '</div>' : '') +
            takimHtml +
            haftalikNot +
            '<div style="display:flex;gap:10px;margin-top:24px">' +
                '<button class="btn btn-p" style="flex:2;padding:11px;border-radius:10px;font-weight:700;font-size:13px" onclick="ebistrTekMail(' + idx + ')">📧 Mail Gönder</button>' +
                '<button class="btn btn-o" style="flex:1;padding:11px;border-radius:10px;font-size:13px" onclick="ebistrMailOnizle(' + idx + ')">👁 Önizle</button>' +
                '<button class="btn btn-g" style="flex:1;padding:11px;border-radius:10px;font-size:13px" onclick="document.getElementById(\'ebistr-modal\').style.display=\'none\'">Kapat</button>' +
            '</div>';

        var icerik = document.getElementById('ebistr-modal-icerik');
        if (icerik) {
            icerik.innerHTML = html;
            icerik.parentElement.style.maxWidth = '820px';
            icerik.parentElement.style.borderRadius = '20px';
        }
        document.getElementById('ebistr-modal').style.display = 'flex';
    } catch (e) {
        console.error('EBISTR Detay Hatası:', e);
        toast('Detay hatası. Konsola bakın.', 'err');
    }
}

// ── EXCEL İNDİR ───────────────────────────────────────────────────
function ebistrExcelIndir() {
    if (!ebistrAnalizler.length) { toast('Önce analiz yapın', 'err'); return; }
    var aoa = [['Durum', 'YİBF', 'BRN No', 'Rapor No', 'Alınış', 'Kırım', 'Yapı Denetim', 'Müteahhit', 'Yapı Sahibi', 'Beton', 'fck (MPa)', 'n', 'fcm (MPa)', 'fci min (MPa)', 'Yapı Bölümü', 'Şantiye']];
    ebistrAnalizler.forEach(function(a) {
        aoa.push([a.durum, a.yibf, a.brnNo, a.labReportNo, a.takeDate, a.breakDate, a.yapiDenetim, a.contractor, a.buildingOwner, a.betonSinifi, a.fck, a.n, a.fcm, a.fciMin, a.yapiElem, a.buildingAddress]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EBİSTR Analiz');
    XLSX.writeFile(wb, 'EBİSTR_Analiz_' + new Date().toISOString().split('T')[0] + '.xlsx');
    toast('Excel indirildi', 'ok');
}

// ── MAİL HTML ─────────────────────────────────────────────────────
function ebistrMailHtml(a, fromName) {
    var durumRenk = a.durum==='UYGUNSUZ'?'#dc2626':a.durum==='UYARI'?'#d97706':a.durum==='SAPMA_KURTARDI'?'#ea580c':a.durum==='HAFTALIK'?'#2563eb':'#16a34a';
    var durumBg   = a.durum==='UYGUNSUZ'?'#fef2f2':a.durum==='UYARI'?'#fffbeb':a.durum==='SAPMA_KURTARDI'?'#fff7ed':a.durum==='HAFTALIK'?'#eff6ff':'#f0fdf4';
    var etiket    = {UYGUNSUZ:'UYGUNSUZ',UYARI:'SAPMALI',SAPMA_KURTARDI:'SAPMA UYARISI',HAFTALIK:'HAFTALIK - 7 GUN',UYGUN:'UYGUN'}[a.durum]||a.durum;
    var isHaftalik = a.durum === 'HAFTALIK';
    var fm2 = function(v){ return v!=null ? parseFloat(v).toFixed(2) : '—'; };
    var fckHedef = a.n >= 5 ? (a.fck + 2) : (a.n >= 2 ? (a.fck + 1) : a.fck);
    var sinifGoster = (function() {
        var s = a.betonSinifi || '';
        if (s && s.indexOf('/') === -1 && a.fckSil && a.fckKup) return 'C' + a.fckSil + '/' + a.fckKup;
        return s || '—';
    })();

    // Satır yardımcıları — tablo bazlı (spam-safe)
    var tr = function(l, v) {
        if (!v && v !== 0) return '';
        return '<tr><td style="padding:8px 14px;font-size:13px;color:#64748b;background:#f8fafc;width:42%;border-bottom:1px solid #e2e8f0">' + l + '</td>' +
            '<td style="padding:8px 14px;font-size:13px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">' + v + '</td></tr>';
    };

    // Takımlar tablosu
    var takimBaslik = isHaftalik ? '7 Günlük Kırım Sonuçları (28g Bekleniyor)' : '28 Günlük Kırım Takım Sonuçları';
    var takimBaslikBg = isHaftalik ? '#eff6ff' : '#f8fafc';
    var takimBaslikRenk = isHaftalik ? '#2563eb' : '#64748b';
    var _takimlarMail = isHaftalik ? (a.n7Takimlar || []) : (a.adjTakimlar || a.takimlar || []);
    var takimSatirlari = _takimlarMail.map(function(t) {
        var fcStr = (t.fcDegerler || []).map(function(v){ return parseFloat(v).toFixed(1); }).join('&nbsp;&nbsp;&nbsp;');
        var tahmini = isHaftalik && t.ortalama ? '<br><span style="font-size:11px;color:#64748b">Tahmini 28g: ~' + (t.ortalama / 0.70).toFixed(1) + ' MPa</span>' : '';
        var sapmaliStr = t.sapmaliFc != null ? '<br><span style="font-size:11px;color:#ea580c;font-weight:700">Sapmalı: ' + parseFloat(t.sapmaliFc).toFixed(1) + ' MPa çıkarıldı</span>' : '';
        var gecerli = t.gecerliAdj !== undefined ? t.gecerliAdj : t.gecerli;
        var ortRenk = gecerli === false ? '#dc2626' : (isHaftalik ? '#2563eb' : '#16a34a');
        var ort = t.sapmaliFc != null ? (t.ortalamaAdj || t.ortalama) : t.ortalama;
        return '<tr style="border-bottom:1px solid #e2e8f0' + (t.sapmaliFc != null ? ';background:#fff7ed' : '') + '">' +
            '<td style="padding:8px 14px;font-family:Courier New,monospace;font-size:12px;color:#475569">' + (t.irsaliye || '—') + '</td>' +
            '<td style="padding:8px 14px;text-align:center;font-size:12px;color:#64748b">' + (t.fcDegerler || []).length + '</td>' +
            '<td style="padding:8px 14px;font-family:Courier New,monospace;font-size:12px;color:#374151">' + fcStr + sapmaliStr + '</td>' +
            '<td style="padding:8px 14px;text-align:right;font-family:Courier New,monospace;font-size:13px;font-weight:700;color:' + ortRenk + '">' + parseFloat(ort).toFixed(1) + ' MPa' + tahmini + '</td>' +
        '</tr>';
    }).join('');
    var _takimlarLen = isHaftalik ? (a.n7Takimlar || []).length : (a.takimlar || []).length;
    var takimHtml = _takimlarLen ?
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #e2e8f0">' +
            '<tr><td colspan="4" style="padding:10px 14px 8px;font-size:11px;font-weight:700;color:' + takimBaslikRenk + ';text-transform:uppercase;letter-spacing:1px;background:' + takimBaslikBg + '">' + takimBaslik + ' (' + _takimlarLen + ' takım)</td></tr>' +
            '<tr style="background:#f1f5f9">' +
                '<th style="padding:7px 14px;text-align:left;font-size:11px;color:#64748b;font-weight:600">İrsaliye</th>' +
                '<th style="padding:7px 14px;text-align:center;font-size:11px;color:#64748b;font-weight:600">n</th>' +
                '<th style="padding:7px 14px;text-align:left;font-size:11px;color:#64748b;font-weight:600">fc Değerleri (MPa)</th>' +
                '<th style="padding:7px 14px;text-align:right;font-size:11px;color:#64748b;font-weight:600">Ortalama</th>' +
            '</tr>' +
            takimSatirlari +
        '</table>' : '';

    // TS 13515 kriterler
    var kriterSatirlari = (a.kriterler || []).map(function(k) {
        return '<tr style="border-bottom:1px solid #e2e8f0">' +
            '<td style="padding:7px 14px;font-size:13px;color:#475569">' + k.ad + '</td>' +
            '<td style="padding:7px 14px;font-family:Courier New,monospace;font-size:13px;text-align:right;font-weight:600;color:#1e293b">' + k.deger.toFixed(1) + ' MPa</td>' +
            '<td style="padding:7px 14px;font-size:12px;color:#64748b;text-align:right">&gt; ' + k.sinir + ' MPa</td>' +
            '<td style="padding:7px 14px;text-align:center;font-size:13px;font-weight:700;color:' + (k.sonuc ? '#16a34a' : '#dc2626') + '">' + (k.sonuc ? 'Uygun' : 'Uygun Değil') + '</td>' +
        '</tr>';
    }).join('');
    var kriterHtml = kriterSatirlari ?
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #e2e8f0">' +
            '<tr><td colspan="4" style="padding:10px 14px 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;background:#f8fafc">TS 13515 Uygunluk Kontrolleri</td></tr>' +
            '<tr style="background:#f1f5f9">' +
                '<th style="padding:7px 14px;text-align:left;font-size:11px;color:#64748b;font-weight:600">Kriter</th>' +
                '<th style="padding:7px 14px;text-align:right;font-size:11px;color:#64748b;font-weight:600">Değer</th>' +
                '<th style="padding:7px 14px;text-align:right;font-size:11px;color:#64748b;font-weight:600">Sınır</th>' +
                '<th style="padding:7px 14px;text-align:center;font-size:11px;color:#64748b;font-weight:600">Sonuç</th>' +
            '</tr>' +
            kriterSatirlari +
        '</table>' : '';

    // Sorunlar
    var sorunHtml = (a.sorunlar || []).length ?
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border-bottom:1px solid #fecaca">' +
            '<tr><td style="padding:14px 20px">' +
                '<div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Tespit Edilen Uygunsuzluklar</div>' +
                '<ul style="margin:0;padding-left:20px">' +
                    (a.sorunlar || []).map(function(s){ return '<li style="margin-bottom:6px;font-size:13px;color:#b91c1c">' + s + '</li>'; }).join('') +
                '</ul>' +
            '</td></tr>' +
        '</table>' : '';

    return (
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Beton Uygunluk Raporu</title></head>' +
        '<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">' +
        '<table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0">' +

        // ── HEADER ──
        '<tr><td style="background:' + durumBg + ';border-bottom:3px solid ' + durumRenk + ';padding:24px">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
                '<td style="vertical-align:top">' +
                    '<div style="font-size:11px;font-weight:700;color:' + durumRenk + ';letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">' + etiket + ' — Beton Uygunluk Bildirimi</div>' +
                    '<div style="font-size:26px;font-weight:800;color:#0f172a;font-family:Courier New,monospace">' + (a.brnNo || '—') + '</div>' +
                    (a.labReportNo ? '<div style="font-size:12px;color:#64748b;margin-top:4px">Lab Rapor: ' + a.labReportNo + '</div>' : '') +
                    '<div style="font-size:12px;color:#64748b;margin-top:2px">' + (a.breakDate || a.takeDate || '') + '</div>' +
                '</td>' +
                '<td style="text-align:right;vertical-align:top;padding-left:24px">' +
                    '<div style="font-size:34px;font-weight:900;color:' + durumRenk + ';font-family:Courier New,monospace;line-height:1">' + fm2(a.fcm) + '</div>' +
                    '<div style="font-size:11px;color:#64748b;font-weight:600;margin-top:3px">MPa — fcm genel ortalama</div>' +
                    '<div style="font-size:12px;color:#475569;margin-top:8px">fci min: <strong style="color:#1e293b">' + fm2(a.fciMin) + '</strong> MPa</div>' +
                    '<div style="font-size:12px;color:#475569">fcm hedef: <strong style="color:#1e293b">' + fckHedef + '</strong> MPa</div>' +
                '</td>' +
            '</tr></table>' +
        '</td></tr>' +

        // ── ÖZET BAND ──
        '<tr><td style="background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
                '<td style="padding:10px 14px;text-align:center;border-right:1px solid #e2e8f0">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase">fcm</div>' +
                    '<div style="font-size:18px;font-weight:800;color:' + durumRenk + ';font-family:Courier New,monospace">' + fm2(a.fcm) + ' MPa</div>' +
                '</td>' +
                '<td style="padding:10px 14px;text-align:center;border-right:1px solid #e2e8f0">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase">fci min</div>' +
                    '<div style="font-size:18px;font-weight:800;color:#1e293b;font-family:Courier New,monospace">' + fm2(a.fciMin) + ' MPa</div>' +
                '</td>' +
                '<td style="padding:10px 14px;text-align:center;border-right:1px solid #e2e8f0">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase">fcm Hedef</div>' +
                    '<div style="font-size:18px;font-weight:800;color:#475569;font-family:Courier New,monospace">' + fckHedef + ' MPa</div>' +
                '</td>' +
                '<td style="padding:10px 14px;text-align:center;border-right:1px solid #e2e8f0">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase">Beton Sınıfı</div>' +
                    '<div style="font-size:18px;font-weight:800;color:#1e293b">' + sinifGoster + '</div>' +
                '</td>' +
                '<td style="padding:10px 14px;text-align:center">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase">7g / 28g</div>' +
                    '<div style="font-size:18px;font-weight:800;color:#1e293b">' + (a.n7Sayisi || 0) + ' / ' + (a.n28Sayisi || 0) + '</div>' +
                '</td>' +
            '</tr></table>' +
        '</td></tr>' +

        // ── UYGUNSUZLUK (varsa) ──
        (sorunHtml ? '<tr><td>' + sorunHtml + '</td></tr>' : '') +

        // ── BİLGİ TABLOLARI ──
        '<tr><td style="border-bottom:1px solid #e2e8f0">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
                '<td style="width:50%;vertical-align:top;border-right:1px solid #e2e8f0">' +
                    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
                    '<tr><td colspan="2" style="padding:10px 14px 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;background:#f8fafc">Şantiye ve Taraflar</td></tr>' +
                    tr('Yapı Sahibi', a.buildingOwner) +
                    tr('Müteahhit', a.contractor) +
                    tr('Yapı Denetim', a.yapiDenetim) +
                    tr('YİBF No', a.yibf) +
                    tr('Şantiye Adresi', a.buildingAddress) +
                    '</table>' +
                '</td>' +
                '<td style="width:50%;vertical-align:top">' +
                    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
                    '<tr><td colspan="2" style="padding:10px 14px 6px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;background:#f8fafc">Numune Detayları</td></tr>' +
                    (a.yapiElem ? tr('Yapı Bölümü / Kat', a.yapiElem) : '') +
                    tr('Alınış Tarihi', a.takeDate) +
                    tr('Kırım Tarihi', a.breakDate) +
                    tr('7g Numune', a.n7Sayisi ? a.n7Sayisi + ' adet' : null) +
                    tr('28g Numune', a.n28Sayisi ? a.n28Sayisi + ' adet' : null) +
                    tr('Üretici', a.manufacturer) +
                    (a.gecersizTakim ? tr('Sapmalı Takım', a.gecersizTakim + ' adet') : '') +
                    '</table>' +
                '</td>' +
            '</tr></table>' +
        '</td></tr>' +

        // ── TS 13515 KRİTERLER ──
        (kriterHtml ? '<tr><td>' + kriterHtml + '</td></tr>' : '') +

        // ── TAKIM DETAYLARI ──
        (takimHtml ? '<tr><td>' + takimHtml + '</td></tr>' : '') +

        // ── GENEL ORTALAMA (alt özet) ──
        '<tr><td style="background:' + durumBg + ';border-top:3px solid ' + durumRenk + ';padding:14px 24px">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
                '<td style="vertical-align:middle">' +
                    '<div style="font-size:11px;font-weight:700;color:' + durumRenk + ';letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Genel Ortalama (fcm)</div>' +
                    '<div style="font-size:28px;font-weight:900;color:' + durumRenk + ';font-family:Courier New,monospace;line-height:1">' + fm2(a.fcm) + ' MPa</div>' +
                '</td>' +
                '<td style="text-align:right;vertical-align:middle">' +
                    '<div style="font-size:12px;color:#475569">fcm hedef: <strong style="color:#1e293b">' + fckHedef + ' MPa</strong></div>' +
                    '<div style="font-size:12px;color:#475569">fci min: <strong style="color:#1e293b">' + fm2(a.fciMin) + ' MPa</strong></div>' +
                    '<div style="font-size:12px;color:#475569;margin-top:4px">Sınıf: <strong style="color:#1e293b">' + sinifGoster + '</strong></div>' +
                '</td>' +
            '</tr></table>' +
        '</td></tr>' +

        // ── FOOTER ──
        '<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;text-align:center">' +
            '<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:3px">ALIBEY LABORATUVAR ERP</div>' +
            '<div style="font-size:11px;color:#94a3b8">Gönderen: ' + (fromName || 'Sistem') + ' — Otomatik bildirim, lütfen yanıtlamayın</div>' +
        '</td></tr>' +

        '</table>' +
        '</td></tr></table>' +
        '</body></html>'
    );
}

// ── YAPI DENETİM FONKSİYONLARI ───────────────────────────────────

function ebistrYdBul(ad) {
    if (!ad) return null;
    return ebistrYdList.find(function(y) { return y.ad === ad; }) || null;
}

function ebistrYdTespit(numuneler) {
    // Verideki yapı denetim firmalarını otomatik tespit et
    var mevcutAdlar = ebistrYdList.map(function(y) { return y.ad; });
    var yeniEklendi = 0;
    numuneler.forEach(function(n) {
        var ad = n.yapiDenetim;
        if (ad && mevcutAdlar.indexOf(ad) === -1) {
            ebistrYdList.push({ ad: ad, mail1: '', mail2: '', aktif: true });
            mevcutAdlar.push(ad);
            yeniEklendi++;
        }
    });
    if (yeniEklendi > 0) {
        ebistrAyarKaydet(true);
        ebistrYdRender();
    }
}

function ebistrYdRender() {
    var tbody = document.getElementById('ebistr-yd-tbody');
    var bos   = document.getElementById('ebistr-yd-bos');
    if (!tbody) return;
    if (ebistrYdList.length === 0) {
        tbody.innerHTML = '';
        if (bos) bos.style.display = 'block';
        return;
    }
    if (bos) bos.style.display = 'none';
    tbody.innerHTML = ebistrYdList.map(function(y, i) {
        return '<tr>' +
            '<td style="padding:8px 10px;font-size:12px;font-weight:600">' + y.ad + '</td>' +
            '<td style="padding:8px 10px"><input class="ebistr-input" value="' + (y.mail1 || '') + '" onchange="ebistrYdList[' + i + '].mail1=this.value;ebistrAyarKaydet(true)" placeholder="mail@örnek.com" style="padding:5px 8px;font-size:11px"></td>' +
            '<td style="padding:8px 10px"><input class="ebistr-input" value="' + (y.mail2 || '') + '" onchange="ebistrYdList[' + i + '].mail2=this.value;ebistrAyarKaydet(true)" placeholder="opsiyonel" style="padding:5px 8px;font-size:11px"></td>' +
            '<td style="padding:8px 10px;text-align:center"><input type="checkbox"' + (y.aktif ? ' checked' : '') + ' onchange="ebistrYdList[' + i + '].aktif=this.checked;ebistrAyarKaydet(true)"></td>' +
            '<td style="padding:8px 10px"><button class="btn btn-g" style="padding:3px 10px;font-size:11px" onclick="ebistrYdList.splice(' + i + ',1);ebistrYdRender();ebistrAyarKaydet(true)">✕</button></td>' +
        '</tr>';
    }).join('');
}

function ebistrYdEkle() {
    var ad = prompt('Yapı Denetim Firma Adı (EBİSTR\'deki gibi):');
    if (!ad) return;
    if (ebistrYdList.find(function(y) { return y.ad === ad; })) { toast('Bu firma zaten var', 'err'); return; }
    ebistrYdList.push({ ad: ad.trim(), mail1: '', mail2: '', aktif: true });
    ebistrYdRender();
    ebistrAyarKaydet(true);
}

// ── AYARLAR FONKSİYONLARI ─────────────────────────────────────────

function _ebistrAyarUygula(kaydedilen) {
    if (!kaydedilen) return;
    if (kaydedilen.ydList) ebistrYdList = kaydedilen.ydList;
    var smtpU  = document.getElementById('ebistr-smtp-user');
    var smtpP  = document.getElementById('ebistr-smtp-pass');
    var smtpC  = document.getElementById('ebistr-smtp-cc');
    var proxyU = document.getElementById('ebistr-proxy-url-inp');
    var mailK  = document.getElementById('ebistr-mail-kosul');
    if (smtpU  && kaydedilen.smtpUser)  smtpU.value  = kaydedilen.smtpUser;
    if (smtpP  && kaydedilen.smtpPass)  smtpP.value  = kaydedilen.smtpPass;
    if (smtpC  && kaydedilen.smtpCc)    smtpC.value  = kaydedilen.smtpCc;
    if (proxyU && kaydedilen.proxyUrl)  proxyU.value = kaydedilen.proxyUrl;
    if (mailK  && kaydedilen.mailKosul) mailK.value  = kaydedilen.mailKosul;
    ebistrYdRender();
}

function ebistrAyarYukle() {
    // Önce localStorage'dan yükle (hızlı başlangıç)
    var ls = lsGet('alibey_ebistr_ayar');
    if (ls) _ebistrAyarUygula(ls);
    else ebistrYdRender();
    // Sonra Firestore'dan yükle (güncel veri)
    fbPull('sys_settings', 'ebistr_ayar', function(fs) {
        if (fs) {
            lsSet('alibey_ebistr_ayar', fs); // localStorage'ı güncelle
            _ebistrAyarUygula(fs);
        }
    });
}

function ebistrAyarKaydet(sessiz) {
    var smtpU  = document.getElementById('ebistr-smtp-user');
    var smtpP  = document.getElementById('ebistr-smtp-pass');
    var smtpC  = document.getElementById('ebistr-smtp-cc');
    var proxyU = document.getElementById('ebistr-proxy-url-inp');
    var mailK  = document.getElementById('ebistr-mail-kosul');
    var data = {
        ydList:    ebistrYdList,
        smtpUser:  smtpU  ? smtpU.value  : '',
        smtpPass:  smtpP  ? smtpP.value  : '',
        smtpCc:    smtpC  ? smtpC.value  : '',
        proxyUrl:  proxyU ? proxyU.value : 'https://lab-system-production-fd87.up.railway.app',
        mailKosul: mailK  ? mailK.value  : 'uyari'
    };
    lsSet('alibey_ebistr_ayar', data);      // localStorage (hızlı)
    fbSave('sys_settings', 'ebistr_ayar', data); // Firestore (kalıcı)
    if (!sessiz) {
        var msg = document.getElementById('ebistr-ayar-msg');
        if (msg) { msg.textContent = '✓ Kaydedildi'; setTimeout(function(){ msg.textContent = ''; }, 2000); }
        toast('Ayarlar kaydedildi', 'ok');
    }
}

function ebistrSmtpTest() {
    var smtpU = (document.getElementById('ebistr-smtp-user') || {}).value;
    var smtpP = (document.getElementById('ebistr-smtp-pass') || {}).value;
    var smtpC = (document.getElementById('ebistr-smtp-cc')   || {}).value;
    if (!smtpU || !smtpP) { toast('Gmail ve şifre giriniz', 'err'); return; }
    toast('Test maili gönderiliyor...', 'amb');
    fetch(EBISTR_PROXY() + '/api/mail/gonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            smtp: { user: smtpU, pass: smtpP },
            mailler: [{ to: smtpU, konu: 'Alibey EBİSTR Test Maili', html: '<p>Test başarılı. SMTP bağlantısı çalışıyor.</p>' }]
        })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){ toast(d.ok ? '✓ Test maili gönderildi' : 'Hata: ' + JSON.stringify(d.hatalar), d.ok ? 'ok' : 'err'); })
    .catch(function(e){ toast('Proxy bağlantı hatası: ' + e.message, 'err'); });
}

// ── MAİL ÖNİZLE ───────────────────────────────────────────────────

function ebistrMailOnizle(idx) {
    var a = ebistrAnalizler[idx];
    if (!a) return;
    var ayar = lsGet('alibey_ebistr_ayar') || {};
    var html = ebistrMailHtml(a, ayar.smtpUser || 'Alibey Lab');
    var modal = document.getElementById('ebistr-mail-modal');
    var frame = document.getElementById('ebistr-mail-frame');
    if (!modal || !frame) {
        // Fallback: yeni pencere
        var w = window.open('', '_blank', 'width=760,height=700,scrollbars=yes');
        if (w) { w.document.write(html); w.document.close(); }
        return;
    }
    frame.srcdoc = html;
    var title = document.getElementById('ebistr-mail-modal-title');
    if (title) title.textContent = '📧 Mail Önizleme — ' + (a.brnNo || a.labReportNo || '');
    modal.style.display = 'flex';
}

// ── MAİL GÖNDERME ─────────────────────────────────────────────────

function ebistrTekMail(idx) {
    if (typeof _canMail === 'function' && !_canMail()) { toast('Mail gönderme yetkiniz yok', 'err'); return; }
    var a = ebistrAnalizler[idx];
    if (!a) return;
    var yd = ebistrYdBul(a.yapiDenetim);
    if (!yd || !yd.mail1) { toast('Bu firma için mail adresi tanımlı değil. Yapı Denetim sekmesine gidin.', 'err'); return; }
    var ayar = lsGet('alibey_ebistr_ayar') || {};
    if (!ayar.smtpUser || !ayar.smtpPass) { toast('SMTP ayarları eksik. Ayarlar sekmesine gidin.', 'err'); return; }
    var alicilar = [yd.mail1, yd.mail2, ayar.smtpCc].filter(Boolean);
    var html = ebistrMailHtml(a, ayar.smtpUser);
    toast('Mail gönderiliyor...', 'amb');
    fetch(EBISTR_PROXY() + '/api/mail/gonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            smtp: { user: ayar.smtpUser, pass: ayar.smtpPass },
            mailler: alicilar.map(function(to) {
                var etiket = {UYGUNSUZ:'Uygunsuz',UYARI:'Sapmali',SAPMA_KURTARDI:'Sapma Uyarisi',HAFTALIK:'Haftalik 7g',UYGUN:'Uygun'}[a.durum]||a.durum;
                var konu = 'Beton Raporu: ' + (a.brnNo||'') + ' — ' + etiket + ' (' + new Date().toLocaleDateString('tr-TR') + ')';
                return { to: to, konu: konu, html: html };
            })
        })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
        if (d.ok) {
            a.mailGonderildi = true;
            _ebistrMailDurum[a.brnNo || a.labReportNo || ''] = true;
            ebistrFiltrele();
            fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
            toast('Mail gönderildi: ' + d.gonderilen + ' alıcı', 'ok');
            logAction('EBİSTR Mail', a.brnNo + ' → ' + yd.mail1);
        } else { toast('Gönderim hatası: ' + JSON.stringify(d.hatalar), 'err'); }
    })
    .catch(function(e){ toast('Proxy hatası: ' + e.message, 'err'); });
}

function ebistrTopluMailGonder() {
    if (typeof _canMail === 'function' && !_canMail()) { toast('Mail gönderme yetkiniz yok', 'err'); return; }
    var ayar = lsGet('alibey_ebistr_ayar') || {};
    if (!ayar.smtpUser || !ayar.smtpPass) { toast('SMTP ayarları eksik', 'err'); return; }

    // Ekranda görünen (filtrelenmiş) raporlardan mail gönderilmemişler
    var hedefler = ebistrFiltreliListe.filter(function(a) { return !a.mailGonderildi; });
    if (!hedefler.length) { toast('Gönderilecek rapor yok', 'amb'); return; }

    // Yapı denetim bazında grupla
    var ydGruplari = {};
    hedefler.forEach(function(a) {
        var yd = ebistrYdBul(a.yapiDenetim);
        if (!yd || !yd.mail1 || !yd.aktif) return;
        var key = a.yapiDenetim || 'bilinmiyor';
        if (!ydGruplari[key]) ydGruplari[key] = { yd: yd, raporlar: [] };
        ydGruplari[key].raporlar.push(a);
    });

    var ydKeys = Object.keys(ydGruplari);
    if (!ydKeys.length) { toast('Mail adresi tanımlı firma bulunamadı', 'err'); return; }

    var firmaSayisi = ydKeys.length;
    var toplamRapor = hedefler.length;
    if (!confirm(firmaSayisi + ' firmaya toplam ' + toplamRapor + ' rapor gönderilecek.\nHer firmaya 1 mail (tüm raporları içeren).\n\nOnaylıyor musunuz?')) return;

    var mailler = [];
    ydKeys.forEach(function(key) {
        var grp = ydGruplari[key];
        var yd  = grp.yd;
        var alicilar = [yd.mail1, yd.mail2, ayar.smtpCc].filter(Boolean);
        var html = _ebistrTopluMailHtml(grp.raporlar, ayar.smtpUser, yd.ad || key);
        var sayilar = {UYGUNSUZ:0,SAPMA_KURTARDI:0,UYARI:0,UYGUN:0,HAFTALIK:0};
        grp.raporlar.forEach(function(a){ if(sayilar.hasOwnProperty(a.durum)) sayilar[a.durum]++; });
        var parcalar = [];
        if(sayilar.UYGUNSUZ) parcalar.push(sayilar.UYGUNSUZ + ' uygunsuz');
        if(sayilar.SAPMA_KURTARDI) parcalar.push(sayilar.SAPMA_KURTARDI + ' sapma uyarisi');
        if(sayilar.UYARI) parcalar.push(sayilar.UYARI + ' sapmali');
        if(sayilar.UYGUN) parcalar.push(sayilar.UYGUN + ' uygun');
        if(sayilar.HAFTALIK) parcalar.push(sayilar.HAFTALIK + ' haftalik 7g');
        var konu = 'Beton Raporu: ' + grp.raporlar.length + ' sonuc — ' + parcalar.join(', ') + ' (' + new Date().toLocaleDateString('tr-TR') + ')';
        alicilar.forEach(function(to) {
            mailler.push({ to: to, konu: konu, html: html, _raporlar: grp.raporlar });
        });
    });

    if (!mailler.length) { toast('Mail listesi oluşturulamadı', 'err'); return; }
    toast(firmaSayisi + ' firmaya ' + mailler.length + ' mail gönderiliyor...', 'amb');

    fetch(EBISTR_PROXY() + '/api/mail/gonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            smtp: { user: ayar.smtpUser, pass: ayar.smtpPass },
            mailler: mailler.map(function(m) { return { to: m.to, konu: m.konu, html: m.html }; })
        })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
        if (d.ok) {
            hedefler.forEach(function(a) {
                a.mailGonderildi = true;
                _ebistrMailDurum[a.brnNo || a.labReportNo || ''] = true;
            });
            ebistrFiltrele();
            fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
            toast(d.gonderilen + ' mail gönderildi (' + firmaSayisi + ' firma)', 'ok');
            logAction('EBİSTR Toplu Mail', firmaSayisi + ' firmaya ' + toplamRapor + ' rapor');
        } else { toast('Hata: ' + JSON.stringify(d.hatalar), 'err'); }
    })
    .catch(function(e){ toast('Proxy hatası: ' + e.message, 'err'); });
}

// ── TEK FİRMA TOPLU MAİL (header butonundan) ──────────────────────
function ebistrTopluMailFirma(encodedFirmaAd) {
    if (typeof _canMail === 'function' && !_canMail()) { toast('Mail gönderme yetkiniz yok', 'err'); return; }
    var firmaAd = decodeURIComponent(encodedFirmaAd);
    var ayar = lsGet('alibey_ebistr_ayar') || {};
    if (!ayar.smtpUser || !ayar.smtpPass) { toast('SMTP ayarları eksik', 'err'); return; }

    var yd = ebistrYdBul(firmaAd);
    if (!yd || !yd.mail1) { toast('Bu firmaya tanımlı mail adresi yok', 'err'); return; }

    // Filtredeki tüm bu firmaya ait raporlar
    var raporlar = ebistrAnalizler.filter(function(a) { return a.yapiDenetim === firmaAd; });
    if (!raporlar.length) { toast('Bu firmaya ait rapor yok', 'amb'); return; }

    var sz = {UYGUNSUZ:0,SAPMA_KURTARDI:0,UYARI:0,UYGUN:0,HAFTALIK:0};
    raporlar.forEach(function(a){ if(sz.hasOwnProperty(a.durum)) sz[a.durum]++; });
    var pc = [];
    if(sz.UYGUNSUZ) pc.push(sz.UYGUNSUZ+' uygunsuz');
    if(sz.SAPMA_KURTARDI) pc.push(sz.SAPMA_KURTARDI+' sapma uyarisi');
    if(sz.UYARI) pc.push(sz.UYARI+' sapmali');
    if(sz.UYGUN) pc.push(sz.UYGUN+' uygun');
    if(sz.HAFTALIK) pc.push(sz.HAFTALIK+' haftalik 7g');
    var konu = 'Beton Raporu: ' + raporlar.length + ' sonuc — ' + pc.join(', ') + ' (' + new Date().toLocaleDateString('tr-TR') + ')';

    var html = _ebistrTopluMailHtml(raporlar, ayar.smtpUser, firmaAd);
    var alicilar = [yd.mail1, yd.mail2, ayar.smtpCc].filter(Boolean);

    if (!confirm(firmaAd + ' firmasına ' + raporlar.length + ' raporla mail gönderilecek.\nAlıcılar: ' + alicilar.join(', ') + '\n\nOnaylıyor musunuz?')) return;
    toast('Mail gönderiliyor...', 'amb');

    fetch(EBISTR_PROXY() + '/api/mail/gonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            smtp: { user: ayar.smtpUser, pass: ayar.smtpPass },
            mailler: alicilar.map(function(to) { return { to: to, konu: konu, html: html }; })
        })
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
        if (d.ok) {
            raporlar.forEach(function(a) {
                a.mailGonderildi = true;
                _ebistrMailDurum[a.brnNo || a.labReportNo || ''] = true;
            });
            ebistrFiltrele();
            fbSyncEBISTR(ebistrNumuneler, ebistrAnalizler);
            toast('Mail gönderildi: ' + firmaAd, 'ok');
        } else { toast('Hata: ' + JSON.stringify(d.hatalar), 'err'); }
    })
    .catch(function(e){ toast('Proxy hatası: ' + e.message, 'err'); });
}

// ── TOPLU MAIL ÖNİZLE ─────────────────────────────────────────────
function ebistrTopluMailOnizle(encodedFirmaAd) {
    var firmaAd = decodeURIComponent(encodedFirmaAd);
    var raporlar = ebistrAnalizler.filter(function(a) { return a.yapiDenetim === firmaAd; });
    if (!raporlar.length) { toast('Bu firmaya ait rapor yok', 'amb'); return; }
    var ayar = lsGet('alibey_ebistr_ayar') || {};
    var html = _ebistrTopluMailHtml(raporlar, ayar.smtpUser || 'Alibey Lab', firmaAd);
    var frame = document.getElementById('ebistr-mail-frame');
    var modal = document.getElementById('ebistr-mail-modal');
    var title = document.getElementById('ebistr-mail-modal-title');
    if (frame) frame.srcdoc = html;
    if (title) title.textContent = '📧 Toplu Mail Önizleme — ' + firmaAd;
    if (modal) modal.style.display = 'flex';
}

// ── TOPLU MAIL HTML (firma bazında birleşik — spam-safe, tam bilgi) ──
function _ebistrTopluMailHtml(raporlar, fromUser, firmaAd) {
    var tarih = new Date().toLocaleDateString('tr-TR');
    var renkMap   = {UYGUNSUZ:'#dc2626',SAPMA_KURTARDI:'#ea580c',UYARI:'#d97706',UYGUN:'#16a34a',HAFTALIK:'#2563eb'};
    var bgMap     = {UYGUNSUZ:'#fef2f2',SAPMA_KURTARDI:'#fff7ed',UYARI:'#fffbeb',UYGUN:'#ffffff',HAFTALIK:'#eff6ff'};
    var bdMap     = {UYGUNSUZ:'#fecaca',SAPMA_KURTARDI:'#fed7aa',UYARI:'#fde68a',UYGUN:'#e2e8f0',HAFTALIK:'#bfdbfe'};
    var etiketMap = {UYGUNSUZ:'UYGUNSUZ',SAPMA_KURTARDI:'SAPMA UYARISI',UYARI:'SAPMALI',UYGUN:'Uygun',HAFTALIK:'Haftalik 7g'};
    var fm2 = function(v){ return v!=null ? parseFloat(v).toFixed(2) : '—'; };

    // Sayılar
    var sayilar = {UYGUNSUZ:0,SAPMA_KURTARDI:0,UYARI:0,UYGUN:0,HAFTALIK:0};
    raporlar.forEach(function(a){ if(sayilar.hasOwnProperty(a.durum)) sayilar[a.durum]++; });
    var toplamUygunsuz = sayilar.UYGUNSUZ + sayilar.SAPMA_KURTARDI + sayilar.UYARI;

    // Özet badge satırı
    var ozetCells = '';
    [{k:'UYGUNSUZ',l:'Uygunsuz'},{k:'SAPMA_KURTARDI',l:'Sapma Uyarisi'},{k:'UYARI',l:'Sapmali'},{k:'UYGUN',l:'Uygun'},{k:'HAFTALIK',l:'Haftalik 7g'}].forEach(function(d){
        if(!sayilar[d.k]) return;
        ozetCells += '<td style="padding:4px 6px 4px 0"><span style="display:inline-block;background:'+bgMap[d.k]+';color:'+renkMap[d.k]+';padding:6px 14px;border-radius:4px;font-size:13px;font-weight:700;border:1px solid '+bdMap[d.k]+'">' + sayilar[d.k] + ' ' + d.l + '</span></td>';
    });

    // Özet tablo satırları — her rapor için tam bilgi
    var satirlar = raporlar.map(function(a) {
        var r = renkMap[a.durum] || '#64748b';
        var bg = bgMap[a.durum] || '#ffffff';
        var bd = bdMap[a.durum] || '#e2e8f0';
        var e = etiketMap[a.durum] || a.durum;
        var isKritik = (a.durum === 'UYGUNSUZ' || a.durum === 'SAPMA_KURTARDI' || a.durum === 'UYARI');
        var isHaf = a.durum === 'HAFTALIK';
        var fckHedef = a.n >= 5 ? (a.fck + 2) : (a.n >= 2 ? (a.fck + 1) : a.fck);
        var sinif = (function(){var s=a.betonSinifi||'';if(s&&s.indexOf('/')===-1&&a.fckSil&&a.fckKup)return 'C'+a.fckSil+'/'+a.fckKup;return s||'—';}());
        var fcmRenk = isKritik ? r : '#16a34a';

        // Takım fc değerleri satırı
        var _topluTakimlar = isHaf ? (a.n7Takimlar || []) : (a.adjTakimlar || a.takimlar || []);
        var takimStr = _topluTakimlar.map(function(t) {
            var fcArr = (t.fcDegerler || []).map(function(v){ return parseFloat(v).toFixed(1); });
            var ort = t.sapmaliFc != null ? (t.ortalamaAdj || t.ortalama) : t.ortalama;
            var sapmaTxt = t.sapmaliFc != null ? ' [sapmali:' + parseFloat(t.sapmaliFc).toFixed(1) + ' cikarildi]' : '';
            var tahTxt = isHaf ? ' (~' + (ort / 0.70).toFixed(1) + ' MPa 28g tahmini)' : '';
            return (t.irsaliye || '?') + ': ' + fcArr.join(', ') + '  Ort=' + parseFloat(ort).toFixed(1) + ' MPa' + sapmaTxt + tahTxt;
        }).join('\n');

        // Sapma notu (durum sütununda gösterilecek)
        var sapmaNotDiv = '';
        if (a.sapmaNotu === 'UYGUN_SAP') {
            sapmaNotDiv = '<div style="font-size:10px;color:#f97316;margin-top:4px;text-align:center">sapma var, geciyor</div>';
        } else if (a.sapmaNotu === 'SAPMA_KURTARDI') {
            sapmaNotDiv = '<div style="font-size:10px;color:#16a34a;margin-top:4px;text-align:center;font-weight:700">sapma cikarilinca UYGUN</div>' +
                (a.adjKriter ? '<div style="font-size:9px;color:#64748b;text-align:center">fcm=' + parseFloat(a.adjKriter.fcm).toFixed(1) + ' / fci=' + parseFloat(a.adjKriter.fciMin).toFixed(1) + ' MPa</div>' : '');
        } else if (a.sapmaNotu === 'SAPMASIZ_UYGUNSUZ') {
            sapmaNotDiv = '<div style="font-size:10px;color:#dc2626;margin-top:4px;text-align:center;font-weight:700">sapma cikarilsa da UYGUNSUZ</div>' +
                (a.adjKriter ? '<div style="font-size:9px;color:#64748b;text-align:center">fcm=' + parseFloat(a.adjKriter.fcm).toFixed(1) + ' / fci=' + parseFloat(a.adjKriter.fciMin).toFixed(1) + ' MPa</div>' : '');
        }

        // Sorunlar satırı için arka plan rengi (SAPMA_KURTARDI = turuncu, diğerleri kırmızı)
        var sorunBg = a.durum === 'SAPMA_KURTARDI' ? '#fff7ed' : '#fef2f2';
        var sorunRenk = a.durum === 'SAPMA_KURTARDI' ? '#9a3412' : '#b91c1c';

        return (
            '<tr style="background:' + bg + ';border-bottom:2px solid ' + bd + '">' +
            // Durum sütunu
            '<td style="padding:10px 12px;vertical-align:top;border-right:1px solid ' + bd + ';min-width:90px">' +
                '<div style="background:' + r + ';color:#fff;font-size:11px;font-weight:800;padding:3px 8px;border-radius:3px;text-align:center;letter-spacing:.5px">' + e + '</div>' +
                sapmaNotDiv +
            '</td>' +
            // Rapor kimlik sütunu
            '<td style="padding:10px 12px;vertical-align:top;border-right:1px solid ' + bd + '">' +
                '<div style="font-family:Courier New,monospace;font-size:13px;font-weight:700;color:#1e293b">' + (a.labReportNo || a.brnNo || '—') + '</div>' +
                (a.brnNo && a.labReportNo ? '<div style="font-size:10px;color:#94a3b8;margin-top:2px">BRN: ' + a.brnNo + '</div>' : '') +
                (a.yibf ? '<div style="font-size:10px;color:#64748b;margin-top:2px">YiBF: ' + a.yibf + '</div>' : '') +
                '<div style="font-size:11px;color:#64748b;margin-top:3px">' + (a.breakDate || a.takeDate || '—') + '</div>' +
            '</td>' +
            // Yapı bilgileri sütunu
            '<td style="padding:10px 12px;vertical-align:top;border-right:1px solid ' + bd + ';max-width:180px">' +
                (a.buildingOwner && a.buildingOwner !== '—' ? '<div style="font-size:12px;font-weight:600;color:#1e293b;margin-bottom:2px">' + a.buildingOwner + '</div>' : '') +
                (a.yapiDenetim ? '<div style="font-size:10px;color:#64748b;">YD: ' + a.yapiDenetim + '</div>' : '') +
                (a.contractor ? '<div style="font-size:10px;color:#64748b;">Mut: ' + a.contractor + '</div>' : '') +
                (a.yapiElem ? '<div style="font-size:10px;color:#64748b;margin-top:2px">' + a.yapiElem + '</div>' : '') +
            '</td>' +
            // Beton & sonuç sütunu
            '<td style="padding:10px 12px;vertical-align:top;text-align:right">' +
                '<div style="font-size:15px;font-weight:800;color:' + fcmRenk + ';font-family:Courier New,monospace">' + fm2(a.fcm) + ' MPa</div>' +
                '<div style="font-size:10px;color:#94a3b8;margin-bottom:4px">fcm sonucu</div>' +
                '<div style="font-size:11px;color:#475569">Hedef: <strong>' + fckHedef + ' MPa</strong></div>' +
                '<div style="font-size:11px;color:#475569">fci min: <strong>' + fm2(a.fciMin) + '</strong></div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:4px">' + sinif + '</div>' +
                '<div style="font-size:10px;color:#94a3b8">' + (a.n||0) + ' takim / ' + ((a.n7Sayisi||0)+(a.n28Sayisi||0)) + ' numune</div>' +
            '</td>' +
            '</tr>' +
            // Takım detay satırı (varsa)
            (takimStr ? '<tr style="background:#f8fafc;border-bottom:2px solid ' + bd + '"><td colspan="4" style="padding:5px 12px 8px 24px;font-family:Courier New,monospace;font-size:10px;color:#64748b;white-space:pre-wrap">' + takimStr + '</td></tr>' : '') +
            // Uygunsuzluk notu
            (isKritik && a.sorunlar && a.sorunlar.length ? '<tr style="background:' + sorunBg + ';border-bottom:2px solid ' + bd + '"><td colspan="4" style="padding:6px 12px 6px 24px;font-size:11px;color:' + sorunRenk + '">' + a.sorunlar.map(function(s){ return '• ' + s; }).join('<br>') + '</td></tr>' : '')
        );
    }).join('');

    // Kritik rapor sayısı (detay kartlar kaldırıldı — özet tablo tüm bilgileri içeriyor)
    var kritikDurumlar = ['UYGUNSUZ', 'SAPMA_KURTARDI', 'UYARI'];
    var kritikRaporlar = raporlar.filter(function(a) { return kritikDurumlar.indexOf(a.durum) >= 0; });

    // Genel istatistik
    var genelFcm = raporlar.filter(function(a){ return a.fcm > 0; });
    var ortFcm = genelFcm.length ? (genelFcm.reduce(function(s,a){ return s + a.fcm; }, 0) / genelFcm.length) : 0;

    return (
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
        '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Beton Uygunluk Bildirimi</title></head>' +
        '<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">' +
        '<table width="700" cellpadding="0" cellspacing="0" border="0" style="max-width:700px">' +

        // ── BAŞLIK ──
        '<tr><td>' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1e3a5f">' +
            '<tr><td style="padding:22px 28px">' +
                '<div style="font-size:21px;font-weight:800;color:#ffffff;margin-bottom:4px">Alibey Beton Kontrol Laboratuvar</div>' +
                '<div style="font-size:13px;color:#93c5fd">Beton Uygunluk Raporu — ' + tarih + '</div>' +
            '</td>' +
            '<td style="padding:22px 28px;text-align:right;vertical-align:top">' +
                '<div style="font-size:14px;font-weight:700;color:#ffffff">' + firmaAd + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;margin-top:4px">' + raporlar.length + ' rapor</div>' +
            '</td></tr></table>' +
        '</td></tr>' +

        // ── ÖZET BAR ──
        '<tr><td style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:14px 20px">' +
            '<table cellpadding="0" cellspacing="0" border="0"><tr>' + ozetCells + '</tr></table>' +
            (toplamUygunsuz > 0
                ? '<div style="margin-top:10px;padding:8px 14px;background:#fef2f2;border-radius:4px;border-left:4px solid #dc2626;font-size:12px;color:#b91c1c;font-weight:600">' +
                  toplamUygunsuz + ' rapor dikkat gerektirmektedir. Lütfen aşağıdaki detayları inceleyiniz.' +
                  '</div>'
                : '<div style="margin-top:10px;padding:8px 14px;background:#f0fdf4;border-radius:4px;border-left:4px solid #16a34a;font-size:12px;color:#166534;font-weight:600">Tum raporlar uygun durumdadir.</div>'
            ) +
        '</td></tr>' +

        // ── ÖZET TABLO ──
        '<tr><td style="padding-top:2px;padding-bottom:20px">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #1e3a5f">' +
                '<tr style="background:#f1f5f9">' +
                    '<th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:700;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">DURUM</th>' +
                    '<th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:700;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">RAPOR NO / YiBF</th>' +
                    '<th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:700;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">YAPI SAHIBI / SANTIYE</th>' +
                    '<th style="padding:9px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:700;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">SONUC / BETON</th>' +
                '</tr>' +
                satirlar +
            '</table>' +
        '</td></tr>' +

        // ── GENEL İSTATİSTİK ──
        (ortFcm > 0 ? (
            '<tr><td style="padding-bottom:20px">' +
                '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #1e3a5f">' +
                '<tr><td style="padding:14px 20px;border-right:1px solid #e2e8f0;width:33%;text-align:center">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Rapor Sayisi</div>' +
                    '<div style="font-size:24px;font-weight:800;color:#1e293b">' + raporlar.length + '</div>' +
                '</td>' +
                '<td style="padding:14px 20px;border-right:1px solid #e2e8f0;width:33%;text-align:center">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Genel fcm Ortalamasi</div>' +
                    '<div style="font-size:24px;font-weight:800;color:' + (toplamUygunsuz > 0 ? '#dc2626' : '#16a34a') + ';font-family:Courier New,monospace">' + fm2(ortFcm) + ' MPa</div>' +
                '</td>' +
                '<td style="padding:14px 20px;width:33%;text-align:center">' +
                    '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Kritik Rapor</div>' +
                    '<div style="font-size:24px;font-weight:800;color:' + (toplamUygunsuz > 0 ? '#dc2626' : '#16a34a') + '">' + toplamUygunsuz + ' / ' + raporlar.length + '</div>' +
                '</td>' +
                '</tr></table>' +
            '</td></tr>'
        ) : '') +

        // ── FOOTER ──
        '<tr><td style="padding:16px 0;text-align:center;border-top:1px solid #e2e8f0">' +
            '<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:3px">ALIBEY BETON KONTROL LABORATUVAR ERP</div>' +
            '<div style="font-size:11px;color:#94a3b8">Gönderen: ' + (fromUser || 'Sistem') + ' — Otomatik bildirim, lütfen yanıtlamayın</div>' +
        '</td></tr>' +

        '</table>' +
        '</td></tr></table>' +
        '</body></html>'
    );
}

// ── YAKLAŞAN KIRIMLAR — Global durum ─────────────────────────────
var ebistrYaklasanData  = [];   // proxy'den gelen ham liste
var ebistrYaklasanFiltreSec = 'bugun'; // aktif filtre

// ── YENİLE (proxy'den çek) ────────────────────────────────────────
function ebistrYaklasanYenile() {
    var proxyLbl = document.getElementById('ebistr-yaklasan-proxy-lbl');
    if (proxyLbl) { proxyLbl.textContent = 'Yenileniyor...'; proxyLbl.style.color = 'var(--tx3)'; }
    ebistrYaklasanFiltre(ebistrYaklasanFiltreSec);
}

function ebistrYaklasanMetrikler() {
    var bugunStr = new Date().toLocaleDateString('en-CA');
    var bugun = ebistrYaklasanData.filter(function(y) { return y.kirimTarihi === bugunStr; });
    var setEl = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    // Bugün kırılacak toplam numune sayısı
    var bugunToplam = bugun.reduce(function(acc, y) { return acc + (y.toplamSayisi || 0); }, 0);
    var bugunKirilan = bugun.reduce(function(acc, y) { return acc + (y.kirilmisSayisi || 0); }, 0);
    var bugunKalan = bugun.reduce(function(acc, y) { return acc + (y.kalanSayisi || 0); }, 0);
    setEl('eyak-bugun-toplam', bugunToplam);
    setEl('eyak-bugun-bek',    bugunKalan);
    setEl('eyak-bugun-ok',     bugunKirilan);
    setEl('eyak-yaklasan-toplam', ebistrYaklasanData.length);
}

// ── FİLTRE SEÇ ───────────────────────────────────────────────────
function ebistrYaklasanFiltre(filtre) {
    ebistrYaklasanFiltreSec = filtre;
    // Filtre butonlarını güncelle
    ['bugun', 'yarin', 'bu_hafta', 'hepsi'].forEach(function(f) {
        var btn = document.getElementById('eyak-f-' + f);
        if (btn) btn.className = 'ebistr-fbtn' + (f === filtre ? ' on' : '');
    });
    // Tarih seçici input güncelle
    var tarihInp = document.getElementById('eyak-f-tarih-inp');
    if (tarihInp && filtre && filtre.match(/^\d{4}-\d{2}-\d{2}$/)) tarihInp.value = filtre;

    // Proxy'den filtreli çek
    var yukleniyor = document.getElementById('ebistr-yaklasan-yukleniyor');
    var liste      = document.getElementById('ebistr-yaklasan-liste');
    var bos        = document.getElementById('ebistr-yaklasan-bos');
    var proxyBos   = document.getElementById('ebistr-yaklasan-proxy-bos');

    if (yukleniyor) yukleniyor.style.display = 'block';
    if (liste)      liste.innerHTML = '';
    if (bos)        bos.style.display = 'none';
    if (proxyBos)   proxyBos.style.display = 'none';

    var url = EBISTR_PROXY() + '/api/ebistr/yaklasan';
    if (filtre === 'bugun') url += '?gun=0';
    else if (filtre === 'yarin') url += '?gun=1';
    // Tarih formatı: YYYY-MM-DD — belirli gün filtresi
    // bu_hafta ve hepsi ve tarih filtreleri için tüm listeyi çek (frontend'de filtrele)

    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (yukleniyor) yukleniyor.style.display = 'none';
            if (!d.ok) { if (proxyBos) proxyBos.style.display = 'block'; return; }
            ebistrYaklasanData = d.numuneler || [];
            // bu_hafta için sadece +0..+7 gün içindekiler
            if (filtre === 'bu_hafta') {
                ebistrYaklasanData = ebistrYaklasanData.filter(function(y) {
                    return y.farkGun >= 0 && y.farkGun <= 7;
                });
            }
            // Belirli tarih filtresi (YYYY-MM-DD formatında)
            if (filtre && filtre.match(/^\d{4}-\d{2}-\d{2}$/)) {
                ebistrYaklasanData = ebistrYaklasanData.filter(function(y) {
                    return y.kirimTarihi === filtre;
                });
            }
            ebistrYaklasanMetrikler();
            ebistrYaklasanRender();
        })
        .catch(function() {
            if (yukleniyor) yukleniyor.style.display = 'none';
            if (proxyBos)   proxyBos.style.display = 'block';
        });
}

// ── RENDER ─────────────────────────────────────────────────────────
function ebistrYaklasanRender() {
    var konteyner = document.getElementById('ebistr-yaklasan-liste');
    var bos       = document.getElementById('ebistr-yaklasan-bos');
    var sayiLbl   = document.getElementById('eyak-sayi-lbl');
    if (!konteyner) return;

    // Kür günü → tamamlanmama → tarih sırası
    var liste = (ebistrYaklasanData || []).slice().sort(function(a, b) {
        var kA = a.kurGun || 0, kB = b.kurGun || 0;
        if (kA !== kB) return kA - kB;
        var aT = a.tamamlandi ? 1 : 0, bT = b.tamamlandi ? 1 : 0;
        if (aT !== bT) return aT - bT;
        return (a.kirimTarihi || '') < (b.kirimTarihi || '') ? -1 : 1;
    });
    if (sayiLbl) sayiLbl.textContent = liste.length + ' rapor';

    if (liste.length === 0) {
        konteyner.innerHTML = '';
        if (bos) bos.style.display = 'block';
        return;
    }
    if (bos) bos.style.display = 'none';

    var bugunStr = new Date().toLocaleDateString('en-CA');

    var sonKurGun = null;
    var kartlar = liste.map(function(y) {
        var gecti     = y.kirimGecti && !y.tamamlandi;
        var bugun     = y.kirimTarihi === bugunStr;
        var yarinStr  = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
        var yarin     = y.kirimTarihi === yarinStr;

        // Kart renk teması
        var aksanRenk, aksan2, kartBg, solSerit;
        if (y.tamamlandi) {
            aksanRenk = 'var(--grn)'; aksan2 = 'rgba(16,185,129,.12)'; kartBg = 'rgba(16,185,129,.04)'; solSerit = '3px solid rgba(16,185,129,.4)';
        } else if (gecti) {
            aksanRenk = 'var(--red)'; aksan2 = 'rgba(239,68,68,.12)'; kartBg = 'rgba(239,68,68,.04)'; solSerit = '3px solid rgba(239,68,68,.6)';
        } else if (bugun) {
            aksanRenk = 'var(--amb)'; aksan2 = 'rgba(245,158,11,.12)'; kartBg = 'rgba(245,158,11,.05)'; solSerit = '3px solid var(--amb)';
        } else {
            aksanRenk = 'var(--acc)'; aksan2 = 'rgba(59,130,246,.08)'; kartBg = 'transparent'; solSerit = '3px solid rgba(59,130,246,.3)';
        }

        // Tarih etiketi
        var tarihLabel = y.tamamlandi ? '✓ Tamamlandı' : (bugun ? '🎯 BUGÜN' : (gecti ? '⏰ Gecikti' : (yarin ? '📆 Yarın' : y.kirimTarihi)));

        // İlerleme
        var toplam  = y.toplamSayisi  || 0;
        var kirilan = y.kirilmisSayisi || 0;
        var kalan   = y.kalanSayisi   || 0;
        var pct     = toplam > 0 ? Math.round(kirilan / toplam * 100) : 0;

        // fc pilleri — irsaliye/mikser bazında grupla
        var numuneler  = y.numuneler || [];
        var sapmaliMap = {};
        (y.sapmaliNumuneler || []).forEach(function(s) { sapmaliMap[s.labNo] = s; });

        // irsaliyeye göre grupla (sıra koruyarak)
        var mikserGruplari = [];
        var mikserIndex = {};
        numuneler.forEach(function(n) {
            var irs = n.irsaliye || 'bilinmiyor';
            if (mikserIndex[irs] === undefined) {
                mikserIndex[irs] = mikserGruplari.length;
                mikserGruplari.push({ irsaliye: irs, numuneler: [] });
            }
            mikserGruplari[mikserIndex[irs]].numuneler.push(n);
        });

        var pillsHtml = mikserGruplari.map(function(mg, mi) {
            var pills = mg.numuneler.map(function(n) {
                var sap   = sapmaliMap[n.labNo];
                var fcStr = n.kirildi ? parseFloat(n.fc).toFixed(1) : '–';
                var bg, fg, bdr, fw;
                if (!n.kirildi) { bg='var(--sur2)'; fg='var(--tx3)'; bdr='var(--bdr)'; fw='400'; }
                else if (sap)   { bg='rgba(245,158,11,.18)'; fg='var(--amb)'; bdr='rgba(245,158,11,.5)'; fw='700'; }
                else            { bg='rgba(16,185,129,.12)'; fg='var(--grn)'; bdr='rgba(16,185,129,.3)'; fw='600'; }
                var tip = sap ? 'Lab: ' + n.labNo + ' | Sapma: %' + parseFloat(sap.sapmaYuzde).toFixed(0) + ' (ort: ' + parseFloat(sap.ortalama).toFixed(1) + ')' : (n.labNo || '');
                return '<span title="' + tip + '" style="background:' + bg + ';color:' + fg + ';border:1px solid ' + bdr + ';font-weight:' + fw + ';padding:3px 8px;border-radius:6px;font-size:11px;font-family:var(--mono);cursor:default">' + fcStr + (sap ? ' ⚠' : '') + '</span>';
            }).join('');
            // İrsaliye no + ilk numunenin alma saati
            var firstTime = mg.numuneler[0] && mg.numuneler[0].takeTime ? mg.numuneler[0].takeTime : '';
            var irsLabel = mg.irsaliye && mg.irsaliye !== 'bilinmiyor'
                ? '<span style="font-size:9px;color:var(--tx3);letter-spacing:.02em;margin-right:4px" title="İrsaliye No: ' + mg.irsaliye + '">' +
                    mg.irsaliye + (firstTime ? ' <span style="color:var(--tx3);opacity:.7">' + firstTime + '</span>' : '') +
                  '</span>'
                : (firstTime ? '<span style="font-size:9px;color:var(--tx3);margin-right:4px">' + firstTime + '</span>' : '');
            return (mi > 0 ? '<span style="width:1px;background:var(--bdr);align-self:stretch;margin:0 6px;display:inline-block;height:20px;vertical-align:middle"></span>' : '') +
                irsLabel + pills;
        }).join('');

        var pillsBlock = pillsHtml
            ? '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:10px">' + pillsHtml + '</div>'
            : '';

        // Sapma uyarısı
        var sapmaHtml = '';
        if (y.sapmaliVar && y.sapmaliNumuneler && y.sapmaliNumuneler.length > 0) {
            var sapDetay = y.sapmaliNumuneler.map(function(s) {
                return '<span style="background:rgba(245,158,11,.15);padding:2px 7px;border-radius:4px;margin-right:6px;font-size:10px">' +
                    s.labNo + ': <strong>' + parseFloat(s.fc).toFixed(1) + ' MPa</strong> ' +
                    (s.dusuk ? '↓' : '↑') +
                    ' %' + parseFloat(s.sapmaYuzde).toFixed(0) + ' sapma' +
                '</span>';
            }).join('');
            sapmaHtml = '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px">' +
                '<span style="font-size:13px;flex-shrink:0">⚠️</span>' +
                '<div style="font-size:11px;color:var(--amb);line-height:1.6"><strong>Sapmalı Numune:</strong> ' + sapDetay + '</div>' +
            '</div>';
        }

        // BRN listesi (çok BRN varsa kısalt)
        var brnGorunur = (y.brnNolar && y.brnNolar.length > 0) ? y.brnNolar.slice(0, 3).join(', ') + (y.brnNolar.length > 3 ? ' +' + (y.brnNolar.length - 3) + ' more' : '') : (y.brnNo || '—');

        var kart = '<div style="background:var(--sur);border:1px solid var(--bdr);border-left:' + solSerit + ';border-radius:12px;padding:16px 18px;background:' + kartBg + ';transition:box-shadow .15s" ' +
            'onmouseover="this.style.boxShadow=\'0 4px 20px rgba(0,0,0,.18)\'" onmouseout="this.style.boxShadow=\'none\'">' +

            // ── Üst Satır: Tarih | Bilgi | Meta ──
            '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">' +

                // Tarih badge (sol)
                '<div style="flex-shrink:0">' +
                    '<span style="display:inline-block;background:' + aksan2 + ';color:' + aksanRenk + ';border:1px solid ' + aksanRenk + '44;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:.03em">' + tarihLabel + '</span>' +
                    '<div style="font-size:10px;color:var(--tx3);margin-top:4px;text-align:center">' + y.kirimTarihi + ' · ' + y.kurGun + 'g</div>' +
                '</div>' +

                // Orta: Ana bilgi
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
                        (y.yapiElem ? '<span style="background:rgba(139,92,246,.1);color:#a78bfa;border:1px solid rgba(139,92,246,.2);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600">' + y.yapiElem + '</span>' : '') +
                        '<span style="background:var(--sur2);color:var(--tx);border:1px solid var(--bdr);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">' + (y.betonSinifi || '—') + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px;color:var(--tx2);font-weight:500;margin-bottom:2px" title="' + (y.yapiDenetim || '') + '">' +
                        '<span style="color:var(--tx3);font-size:10px">YD</span> ' + (y.yapiDenetim || '—') +
                    '</div>' +
                    (y.contractor ? '<div style="font-size:11px;color:var(--tx3)"><span style="color:var(--tx3);font-size:10px">Müt.</span> ' + y.contractor + '</div>' : '') +
                    (y.buildingOwner ? '<div style="font-size:11px;color:var(--tx3)"><span style="color:var(--tx3);font-size:10px">Mal Sahibi</span> ' + y.buildingOwner + '</div>' : '') +
                '</div>' +

                // Sağ: YİBF + BRN + İlerleme
                '<div style="flex-shrink:0;text-align:right">' +
                    (y.yibfNo ? '<div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--acc2)">YİBF ' + y.yibfNo + '</div>' : '') +
                    '<div style="font-size:10px;color:var(--tx3);margin-bottom:8px">' + brnGorunur + '</div>' +
                    // Progress
                    '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">' +
                        '<span style="font-size:11px;font-family:var(--mono);color:' + aksanRenk + ';font-weight:700">' + kirilan + '/' + toplam + '</span>' +
                        (y.tamamlandi
                            ? '<span style="background:var(--grn);color:#fff;border-radius:5px;padding:1px 6px;font-size:10px;font-weight:700">✓ Tamam</span>'
                            : kalan > 0 ? '<span style="background:' + aksan2 + ';color:' + aksanRenk + ';border-radius:5px;padding:1px 6px;font-size:10px;font-weight:600">' + kalan + ' kalan</span>' : '') +
                    '</div>' +
                    '<div style="width:120px;height:5px;background:var(--bdr);border-radius:4px;margin-top:5px;overflow:hidden">' +
                        '<div style="height:100%;background:' + aksanRenk + ';border-radius:4px;width:' + pct + '%;transition:width .3s ease"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            pillsBlock +
            sapmaHtml +
        '</div>';

        // Kür günü bölüm başlığı ekle
        var baslik = '';
        if (y.kurGun !== sonKurGun) {
            sonKurGun = y.kurGun;
            var kurRenk = y.kurGun === 7 ? '#3b82f6' : y.kurGun === 28 ? '#22c55e' : '#a78bfa';
            baslik = '<div style="display:flex;align-items:center;gap:8px;margin:16px 0 6px;padding:0 2px">' +
                '<span style="background:' + kurRenk + '22;color:' + kurRenk + ';border:1px solid ' + kurRenk + '44;border-radius:8px;padding:3px 12px;font-size:12px;font-weight:800">' +
                    y.kurGun + ' Günlük Kırımlar' +
                '</span>' +
                '<div style="flex:1;height:1px;background:var(--bdr)"></div>' +
            '</div>';
        }
        return baslik + kart;
    }).join('');

    konteyner.innerHTML = kartlar;
}

// ── YAKLAŞAN ANALİZ (sekme açılınca çağrılır) ─────────────────────
function ebistrYaklasanAnaliz() {
    // Filtre butonlarını sıfırla
    ['bugun', 'yarin', 'bu_hafta', 'hepsi'].forEach(function(f) {
        var btn = document.getElementById('eyak-f-' + f);
        if (btn) btn.className = 'ebistr-fbtn' + (f === ebistrYaklasanFiltreSec ? ' on' : '');
    });
    ebistrYaklasanFiltre(ebistrYaklasanFiltreSec);
}
