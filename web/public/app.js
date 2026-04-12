    // ════════════════════════════════════════════════════════════════════
    // FIREBASE FIRESTORE — Çok cihaz anlık senkronizasyon
    // ════════════════════════════════════════════════════════════════════



    var FB_CONFIG = {
        apiKey: "AIzaSyALnq6b88THk8VpRhBDLGUkR26hplFtnng",

        authDomain: "alibey-lab.firebaseapp.com",
        projectId: "alibey-lab"
    };

    var DB_URL = "https://firestore.googleapis.com/v1/projects/" + FB_CONFIG.projectId + "/databases/(default)/documents";
    var DB_KEY = FB_CONFIG.apiKey;

    /** layout / env ile aynı kök; eski *.vercel.app env iken sayfa özel domaindeyse location.origin kullan */
    function labPublicOrigin() {
        if (typeof window === 'undefined') return '';
        var loc = (window.location.origin || '').replace(/\/+$/, '');
        var raw = (window.__LAB_BASE_URL__ != null && String(window.__LAB_BASE_URL__).trim() !== '')
            ? String(window.__LAB_BASE_URL__).trim().replace(/\/+$/, '')
            : '';
        if (!raw) return loc;
        try {
            var envHost = new URL(raw).hostname.toLowerCase();
            var locHost = (window.location.hostname || '').toLowerCase();
            if (/\.vercel\.app$/i.test(envHost) && !/\.vercel\.app$/i.test(locHost)) return loc;
        } catch (e) {}
        return raw;
    }
    /** NetGSM: Vercel’de PHP yok; Next /api/netgsm (netgsm_proxy.php ile aynı sorgu parametreleri) */
    function netgsmProxyAbs(queryNoQ) {
        return labPublicOrigin() + '/api/netgsm?' + queryNoQ;
    }

    /**
     * NetGSM 30: Panelde çoğu zaman “alan adı / hosting’de gördüğüm IP” YANLIŞTIR — NetGSM,
     * api.netgsm.com.tr’ye isteği atan SUNUCUNUN çıkış IP’sine bakar (ör. Vercel). A kaydı IP’si farklı olabilir.
     */
    function netgsmLogEgressHintOnce() {
        if (typeof window === 'undefined' || window._netgsmEgressHintDone) return;
        window._netgsmEgressHintDone = true;
        var base = labPublicOrigin();
        if (!base || /localhost|127\.0\.0\.1/i.test(base)) return;
        fetch(base + '/api/egress-ip', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (!j || !j.ok || !j.ip) return;
                console.info(
                    '[NetGSM] NetGSM panelinde izin vermeniz gereken çıkış IP (bu uygulamanın sunucusu): ' +
                        j.ip +
                        '\n  — Doğrulama: ' +
                        base +
                        '/api/egress-ip\n  — Not: Domain satıcısının gösterdiği “site IP” / A kaydı genelde bu adres DEĞİLDİR.'
                );
            })
            .catch(function () {});
    }

    function labSaltBytesFromB64(saltB64) {
        var bin = atob(saltB64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function labRandomSaltB64() {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        var s = '';
        for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
        return btoa(s);
    }
    function labDerivePasswordHashHex(password, saltB64) {
        var enc = new TextEncoder();
        return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
            .then(function (keyMaterial) {
                return crypto.subtle.deriveBits({
                    name: 'PBKDF2',
                    salt: labSaltBytesFromB64(saltB64),
                    iterations: 100000,
                    hash: 'SHA-256'
                }, keyMaterial, 256);
            })
            .then(function (buf) {
                var arr = new Uint8Array(buf);
                return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
            });
    }
    function upsertLabUserForStaff(personelId, ad, loginRaw, password, isEdit) {
        loginRaw = (loginRaw || '').trim().toLowerCase();
        if (!loginRaw) return Promise.reject(new Error('Kullanıcı adı gerekli'));
        if (!/^[a-z0-9._-]{3,32}$/i.test(loginRaw)) return Promise.reject(new Error('Kullanıcı adı 3–32 karakter'));
        return fsGet('lab_users').then(function (rows) {
            var list = rows || [];
            var dup = list.find(function (u) {
                return u.login && String(u.login).toLowerCase() === loginRaw && String(u.personelId || '') !== String(personelId);
            });
            if (dup) throw new Error('Bu kullanıcı adı başka personelde');
            var existing = list.find(function (u) { return String(u.personelId || '') === String(personelId); });
            var id = existing && existing.id ? existing.id : 'user_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 10) : String(Date.now()));
            var pass = (password || '').trim();
            if (!pass && existing && existing.passwordHash && existing.passwordSalt) {
                return fsSet('lab_users', id, {
                    id: id, ad: ad, roleId: 'saha_personeli', aktif: true, personelId: String(personelId),
                    login: loginRaw, passwordSalt: existing.passwordSalt, passwordHash: existing.passwordHash
                });
            }
            if (!pass) return Promise.reject(new Error('Şifre gerekli'));
            var salt = labRandomSaltB64();
            return labDerivePasswordHashHex(pass, salt).then(function (hashHex) {
                return fsSet('lab_users', id, {
                    id: id, ad: ad, roleId: 'saha_personeli', aktif: true, personelId: String(personelId),
                    login: loginRaw, passwordSalt: salt, passwordHash: hashHex
                });
            });
        });
    }

    // ── Firestore REST helpers ────────────────────────────────────────
    function fsUrl(collection, docId) {
        return DB_URL + "/" + collection + (docId ? "/" + docId : "");
    }

    function fsHeaders() {
        return { "Content-Type": "application/json" };
    }

    // Firestore value → JS value
    function fsVal(v) {
        if (!v) return null;
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue);
        if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
        if (v.booleanValue !== undefined) return v.booleanValue;
        if (v.nullValue !== undefined) return null;
        if (v.arrayValue) return (v.arrayValue.values || []).map(fsVal);
        if (v.mapValue) return fsDoc2obj({ fields: v.mapValue.fields });
        return null;
    }

    // JS value → Firestore value
    function toFsVal(v) {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        if (typeof v === 'string') return { stringValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
        if (typeof v === 'object') return { mapValue: { fields: obj2fsFields(v) } };
        return { stringValue: String(v) };
    }

    function obj2fsFields(obj) {
        var f = {};
        Object.keys(obj).forEach(function (k) { f[k] = toFsVal(obj[k]); });
        return f;
    }

    function fsDoc2obj(doc) {
        if (!doc || !doc.fields) return {};
        var obj = {};
        Object.keys(doc.fields).forEach(function (k) { obj[k] = fsVal(doc.fields[k]); });
        // ID from doc name
        if (doc.name) obj._id = doc.name.split('/').pop();
        return obj;
    }

    // Koleksiyon getir — 429 alınırsa exponential backoff ile retry yapar
    // ── Global Firestore istek kuyruğu — aynı anda sadece 1 istek ──────
    // 429 storm'unu tamamen önler: tüm GET/SET sırayla çalışır
    var _fsQueue = [];
    var _fsRunning = false;

    function _fsEnqueue(fn) {
        return new Promise(function (resolve, reject) {
            _fsQueue.push(function () { return fn().then(resolve, reject); });
            if (!_fsRunning) _fsFlush();
        });
    }

    function _fsFlush() {
        if (!_fsQueue.length) { _fsRunning = false; return; }
        _fsRunning = true;
        var next = _fsQueue.shift();
        next().catch(function () { }).then(function () {
            setTimeout(_fsFlush, 50); // Blaze planında kısa bekleme yeterli
        });
    }

    function fsGetDoc(collection, docId, cb) {
        var url = fsUrl(collection, docId) + '?key=' + DB_KEY;
        return _fsEnqueue(function () {
            return fetch(url, { headers: fsHeaders() })
                .then(function (r) {
                    if (r.status === 404) return null;
                    if (!r.ok) {
                        if (typeof _fsNotifyAccessDenied === 'function') _fsNotifyAccessDenied(r, 'GET doc', collection + '/' + docId);
                        console.warn('fsGetDoc hata ' + r.status + ' (' + collection + '/' + docId + ')');
                        return null;
                    }
                    return r.json();
                })
                .then(function (data) {
                    if (data && data.fields) {
                        if (cb) cb(fsDoc2obj(data));
                    } else {
                        if (cb) cb(null);
                    }
                })
                .catch(function (err) {
                    console.error('fsGetDoc network hata:', err);
                    if (cb) cb(null);
                });
        });
    }

    function fsGet(collection, pageToken, accumulated, _attempt) {
        if (!accumulated) accumulated = [];
        if (_attempt === undefined || _attempt === null) _attempt = 0;
        var url = fsUrl(collection) + '?key=' + DB_KEY + '&pageSize=300';
        if (pageToken && typeof pageToken === 'string') url += '&pageToken=' + encodeURIComponent(pageToken);

        return _fsEnqueue(function () {
            return fetch(url, { headers: fsHeaders() })
                .then(function (r) {
                    if (r.status === 429) {
                        if (_attempt >= 3) {
                            console.warn('fsGet ' + collection + ' 429 — max retry, atlanıyor');
                            return Promise.resolve(accumulated);
                        }
                        var delay = 4000 + 2000 * _attempt;
                        console.warn('fsGet 429 — ' + delay + 'ms bekleyip tekrar: ' + collection);
                        return new Promise(function (resolve) {
                            setTimeout(function () {
                                fsGet(collection, pageToken, accumulated, _attempt + 1).then(resolve);
                            }, delay);
                        });
                    }
                    // 400 veya koleksiyon henüz yok → boş döndür, hata fırlatma
                    if (!r.ok) {
                        if (typeof _fsNotifyAccessDenied === 'function') _fsNotifyAccessDenied(r, 'GET list', collection);
                        console.warn('fsGet hata ' + r.status + ' (' + collection + ') — boş array dönülüyor');
                        return Promise.resolve(accumulated);
                    }
                    return r.json().then(function (data) {
                        if (!data) return accumulated;
                        if (data.documents && data.documents.length) {
                            accumulated = accumulated.concat(data.documents.map(fsDoc2obj));
                        }
                        if (data.nextPageToken && typeof data.nextPageToken === 'string') {
                            return fsGet(collection, data.nextPageToken, accumulated, 0);
                        }
                        return accumulated;
                    });
                })
                .catch(function (e) { console.error('fsGet network hata:', e); return accumulated; });
        });
    }

    // Belge yaz (upsert by custom ID)
    function fsSet(collection, docId, obj) {
        var fields = obj2fsFields(obj);
        var url = fsUrl(collection, docId) + "?key=" + DB_KEY;
        return fetch(url, {
            method: "PATCH",
            headers: fsHeaders(),
            body: JSON.stringify({ fields: fields })
        }).then(function (r) {
            if (r.status === 429) {
                console.warn('fsSet 429 — rate limit (' + collection + '/' + docId + ')');
                return;
            }
            if (!r.ok) {
                if (typeof _fsNotifyAccessDenied === 'function') _fsNotifyAccessDenied(r, 'PATCH', collection + '/' + docId);
                console.warn('fsSet hata ' + r.status + ' (' + collection + '/' + docId + ')');
            }
        }).catch(function (e) {
            console.error('fsSet network hata:', e);
        });
    }

    // Belge sil
    function fsDel(collection, docId) {
        return fetch(fsUrl(collection, docId) + "?key=" + DB_KEY, {
            method: "DELETE", headers: fsHeaders()
        }).then(function (r) {
            if (!r.ok) {
                if (typeof _fsNotifyAccessDenied === 'function') _fsNotifyAccessDenied(r, 'DELETE', collection + '/' + docId);
                console.warn('fsDel hata ' + r.status);
            }
        }).catch(function (e) {
            console.error('fsDel network hata:', e);
        });
    }

    // ── Sync durumu göstergesi ──────────────────────────────────────
    function setSyncStatus(ok) {
        var el = document.getElementById('syncDot');
        if (!el) return;
        el.style.background = ok ? '#22C55E' : '#F87171';
        el.title = ok ? 'Firestore bağlı' : 'Bağlantı yok';
    }
    function setSyncBusy() {
        var el = document.getElementById('syncDot');
        if (!el) return;
        el.style.background = '#F59E0B'; // amber — sync devam ediyor
        el.title = 'Senkronizasyon...';
    }

    // ── CHIP DATA ─────────────────────────────────────────────────────
    function getChipId(d) {
        var b = (d.belge || '').replace(/\D/g, '').replace(/^0+/, '');
        if (b) return 'b_' + b;
        var n = (d.firma || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        return 'n_' + n;
    }

    // Telefonları NetGSM GET API için normalize et: 5XXXXXXXXX (10 hane)
    function normalizeTel(tel) {
        var t = (tel || '').replace(/\D/g, '');
        if (t.startsWith('90')) t = t.slice(2);
        if (t.startsWith('0')) t = t.slice(1);
        return t;
    }

    function fbSaveChip(d) {
        var id = getChipId(d);
        fsSet('chip_data', id, {
            firma: d.firma || '', belge: d.belge || '',
            tel: d.tel || '', top: d.top || 0,
            kul: d.kul || 0, kal: d.kal || 0,
            pasif: !!(d.pasif), dt: d.dt || ''
        }).then(function () { setSyncStatus(true); });
    }

    function fbSaveAllChip() {
        chipData.forEach(function (d) { fbSaveChip(d); });
        // PhoneBook-only firmaları Firestore'a kal:0 ile YAZMA — zombie kaynağı buydu
    }

    // Lokaldeki tüm chipData'yı Firestore'a senkronize eder (manuel tetikleme)
    function fbExportAllToFirestore() {
        // Butonları devre dışı bırak
        ['btnFsExport', 'btnFsExportSettings'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) { b.disabled = true; b.textContent = '⏳ Gönderiliyor...'; }
        });

        var tasks = [];
        var t = 0; // gecikme sayacı (ms)

        // ── 1. Çip verisi ────────────────────────────────────────────
        var chipLS = (function () {
            try {
                var raw = JSON.parse(localStorage.getItem('alibey_chip') || '{}');
                return Array.isArray(raw) ? raw : (raw.data || []);
            } catch (e) { return []; }
        })();
        chipLS.forEach(function (d) {
            var _t = t; t += 150;
            tasks.push(function () { setTimeout(function () { fbSaveChip(d); }, _t); });
        });

        // ── 2. Sözleşmeli Firmalar ───────────────────────────────────
        t += 1000;
        var sfLS = (function () {
            try { return JSON.parse(localStorage.getItem('alibey_sf') || '[]'); } catch (e) { return []; }
        })();
        sfLS.forEach(function (f) {
            if (!f || !f.ad) return;
            var _t = t; t += 600;
            tasks.push(function () { setTimeout(function () { fbSaveSF(f); }, _t); });
        });

        // ── 3. Fiyat Teklifleri ──────────────────────────────────────
        t += 1000;
        var prLS = (function () {
            try { return JSON.parse(localStorage.getItem('alibey_pr') || '[]'); } catch (e) { return []; }
        })();
        prLS.forEach(function (p) {
            if (!p || !p.mu) return;
            var _t = t; t += 600;
            tasks.push(function () { setTimeout(function () { fbSavePR(p); }, _t); });
        });

        // ── 4. Chip Siparişleri ──────────────────────────────────────
        t += 1000;
        var ordLS = (function () {
            try { return JSON.parse(localStorage.getItem('alibey_chip_orders') || '[]'); } catch (e) { return []; }
        })();
        ordLS.forEach(function (o) {
            if (!o || !o.firma) return;
            var _t = t; t += 600;
            tasks.push(function () { setTimeout(function () { fbSaveOrder(o); }, _t); });
        });

        var total = tasks.length;
        if (!total) {
            toast('Lokalde aktarılacak veri bulunamadı', 'err');
            ['btnFsExport', 'btnFsExportSettings'].forEach(function (id) {
                var b = document.getElementById(id);
                if (b) { b.disabled = false; b.textContent = '🔄 Tüm Veriyi Firestore\'a Aktar'; }
            });
            return;
        }

        tasks.forEach(function (fn) { fn(); });

        setTimeout(function () {
            ['btnFsExport', 'btnFsExportSettings'].forEach(function (id) {
                var b = document.getElementById(id);
                if (b) {
                    b.disabled = false; b.textContent = '✅ Aktarıldı';
                    setTimeout(function () { b.textContent = '🔄 Tüm Veriyi Firestore\'a Aktar'; }, 4000);
                }
            });
            toast(total + ' kayıt Firestore\'a aktarıldı ✅', 'ok');
        }, t + 2000);
    }

    // ── ÇİP + SF SİLİNEN FİRMALAR BLACKLİSTİ ──────────────────────────
    // localStorage'dan yükle → sayfa yenilenince de korunur
    var _chipDeletedIds = (function () {
        try { return JSON.parse(localStorage.getItem('alibey_chip_deleted') || '{}'); } catch (e) { return {}; }
    })();
    var _sfDeletedNames = (function () {
        try { return JSON.parse(localStorage.getItem('alibey_sf_deleted') || '{}'); } catch (e) { return {}; }
    })();

    function _saveChipDeletedStore() { try { localStorage.setItem('alibey_chip_deleted', JSON.stringify(_chipDeletedIds)); } catch (e) { } }
    function _saveSfDeletedStore() { try { localStorage.setItem('alibey_sf_deleted', JSON.stringify(_sfDeletedNames)); } catch (e) { } }

    function addDeletedFirm(name, belge) {
        if (name) {
            _chipDeletedIds['n_' + name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')] = true;
            _chipDeletedIds[name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80)] = true;
        }
        if (belge) {
            var b = belge.replace(/\D/g, '').replace(/^0+/, '');
            if (b) _chipDeletedIds['b_' + b] = true;
        }
        _saveChipDeletedStore();
        // Firestore'a da yaz — diğer tarayıcı/cihazlar da hatırlasın
        fsSet('sys_config', 'deleted_firms', { ids: _chipDeletedIds })
            .catch(function (e) { console.warn('deleted_firms kaydedilemedi', e); });
    }

    function addDeletedSF(name) {
        if (name) {
            _sfDeletedNames[name] = true;
            _sfDeletedNames[name.toLowerCase().trim()] = true;
        }
        _saveSfDeletedStore();
        // Firestore'a da yaz — diğer tarayıcı/cihazlar da hatırlasın
        fsSet('sys_config', 'deleted_sf_firms', { names: _sfDeletedNames })
            .catch(function(e) { console.warn('deleted_sf_firms kaydedilemedi', e); });
    }

    function isDeletedSF(name) {
        return !!(name && (_sfDeletedNames[name] || _sfDeletedNames[(name || '').toLowerCase().trim()]));
    }

    function _chipBelgeKey(d) {
        return (d.belge || '').replace(/\D/g, '').replace(/^0+/, '');
    }

    /** Firestore çip listesini bellekteki listeyle birleştirir; EBİSTR’de olup henüz Firebase’e yazılmamış satırlar silinmez. */
    function mergeFsChipIntoLocal(fsChip, localArr) {
        var merged = localArr.slice();
        fsChip.forEach(function (fs) {
            var mevcutIdx = -1;
            var fb = _chipBelgeKey(fs);
            if (fb) {
                for (var i = 0; i < merged.length; i++) {
                    var mb = _chipBelgeKey(merged[i]);
                    if (mb && mb === fb) { mevcutIdx = i; break; }
                }
            }
            if (mevcutIdx < 0) {
                var nFs = normalize(fs.firma || '');
                for (var j = 0; j < merged.length; j++) {
                    var nM = normalize(merged[j].firma || '');
                    if (nM && nFs && (nFs.indexOf(nM) >= 0 || nM.indexOf(nFs) >= 0)) { mevcutIdx = j; break; }
                }
            }
            if (mevcutIdx >= 0) {
                var d = merged[mevcutIdx];
                d.top = fs.top;
                d.kul = fs.kul;
                d.kal = fs.kal;
                d.pasif = !!fs.pasif;
                d.smsOff = !!fs.smsOff;
                if (fs.belge && !d.belge) d.belge = fs.belge;
                if (fs.tel) d.tel = fs.tel;
                if (fs.dt) d.dt = fs.dt;
                d.id = fs.id;
            } else {
                merged.push({
                    id: fs.id,
                    firma: fs.firma,
                    belge: fs.belge,
                    tel: fs.tel || '',
                    top: fs.top,
                    kul: fs.kul,
                    kal: fs.kal,
                    pasif: !!fs.pasif,
                    smsOff: !!fs.smsOff,
                    dt: fs.dt || ''
                });
            }
        });
        return merged;
    }

    /** Son EBİSTR/CSV kaydı localStorage’da — sayfa açılışında izleme tablosu bunu gösterir; Firestore tamamlayıcıdır. */
    function loadChipFromLocalStorage() {
        try {
            var bag = lsGet('alibey_chip');
            if (!bag || !bag.data || !Array.isArray(bag.data) || !bag.data.length) return;
            chipData = bag.data.map(function (d) {
                return {
                    id: d.id,
                    firma: d.firma,
                    belge: d.belge,
                    tel: normalizeTel(d.tel),
                    top: d.top,
                    kul: d.kul,
                    kal: d.kal,
                    pasif: !!d.pasif,
                    smsOff: !!d.smsOff,
                    dt: d.dt || ''
                };
            });
            if (bag.pb && typeof bag.pb === 'object') {
                Object.keys(bag.pb).forEach(function (ka) {
                    if (!phoneBook[ka]) phoneBook[ka] = bag.pb[ka];
                    else {
                        var p = bag.pb[ka];
                        if (p.tel && !phoneBook[ka].tel) phoneBook[ka].tel = p.tel;
                        if (p.belge && !phoneBook[ka].belge) phoneBook[ka].belge = p.belge;
                        if (p.firma && !phoneBook[ka].firma) phoneBook[ka].firma = p.firma;
                    }
                });
                savePB_Quiet();
            }
        } catch (e) {
            console.warn('loadChipFromLocalStorage', e);
        }
    }
    window.loadChipFromLocalStorage = loadChipFromLocalStorage;

    function fbPullChip() {
        return fsGet('chip_data').then(function (rows) {
            if (!rows) rows = [];
            if (rows.length === 0 && chipData.length === 0) return;
            // Firestore boş ama yerelde (LS/EBİSTR) veri var — listeyi silme
            if (rows.length === 0) {
                syncChipTelFromPB();
                updateChipStats();
                renderChip();
                setSyncStatus(true);
                return;
            }

            // ── Kara listedeki (silinen) firmaları filtrele
            rows = rows.filter(function (r) {
                var id = r._id || '';
                if (_chipDeletedIds[id]) { fsDel('chip_data', id); return false; }
                var nk = 'n_' + (r.firma || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                if (_chipDeletedIds[nk]) { fsDel('chip_data', id); return false; }
                var b = (r.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                if (b && _chipDeletedIds['b_' + b]) { fsDel('chip_data', id); return false; }
                return true;
            });

            var unique = {};
            var zombies = [];

            rows.forEach(function (r) {
                var b = (r.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                var key = b ? 'b_' + b : 'n_' + (r.firma || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

                if (!unique[key]) {
                    unique[key] = r;
                } else {
                    var existing = unique[key];
                    if (r._id === key && existing._id !== key) {
                        zombies.push(existing._id); unique[key] = r;
                    } else if (existing._id === key && r._id !== key) {
                        zombies.push(r._id);
                    } else {
                        if ((existing.firma || '') === (r.firma || '') || (existing.belge || '') === (r.belge || '')) {
                            zombies.push(r._id);
                        } else {
                            unique[key + '_' + r._id] = r;
                        }
                    }
                    if (!unique[key].tel && r.tel) unique[key].tel = normalizeTel(r.tel);
                    if (!unique[key].smsOff && r.smsOff) unique[key].smsOff = true;
                    if (!unique[key].pasif && r.pasif) unique[key].pasif = true;
                    // Eski "max" birleştirme (örn: 193) bayat değerleri kalıcı yapıyordu.
                    // Artık yalnızca boş/invalid alanda diğer kaydı fallback olarak kullan.
                    if (unique[key].top === undefined || unique[key].top === null || isNaN(Number(unique[key].top))) unique[key].top = r.top;
                    if (unique[key].kul === undefined || unique[key].kul === null || isNaN(Number(unique[key].kul))) unique[key].kul = r.kul;
                    if (unique[key].kal === undefined || unique[key].kal === null || isNaN(Number(unique[key].kal))) unique[key].kal = r.kal;
                }
            });

            // Zombie temizleme — max 3 per session
            if (zombies.length > 0) {
                zombies.slice(0, 3).forEach(function (zid, idx) {
                    setTimeout(function () { fsDel('chip_data', zid); }, 5000 + idx * 3000);
                });
            }

            var fsChip = Object.keys(unique).map(function (k) {
                var r = unique[k];
                return {
                    id: k, firma: r.firma, belge: r.belge, tel: normalizeTel(r.tel),
                    top: r.top, kul: r.kul, kal: r.kal, pasif: !!r.pasif, smsOff: !!r.smsOff, dt: r.dt
                };
            });

            chipData = mergeFsChipIntoLocal(fsChip, chipData);
            chipData = chipData.filter(function (d) {
                var id = d.id || '';
                if (_chipDeletedIds[id]) return false;
                var nk = 'n_' + (d.firma || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                if (_chipDeletedIds[nk]) return false;
                var b = _chipBelgeKey(d);
                if (b && _chipDeletedIds['b_' + b]) return false;
                return true;
            });

            // ── YETKİ-NO → FİRMA ADI OTO-DÜZELTME ──────────────────────────
            // Bazı kayıtlar firma adı yerine yetki belge no ile kaydedilmiş.
            // PhoneBook'ta aynı belge no varsa doğru isimle güncelle → Firestore'a yaz.
            var fixedNames = [];
            chipData.forEach(function (d) {
                var isOnlyDigits = /^\d+$/.test((d.firma || '').trim());
                if (!isOnlyDigits) return; // Zaten firma adı var
                var cleanB = (d.belge || (d.firma || '')).replace(/\D/g, '').replace(/^0+/, '');
                // PhoneBook'ta belge eşleşmesi
                var pbMatch = null;
                Object.keys(phoneBook).forEach(function (ka) {
                    if (pbMatch) return;
                    var pb = phoneBook[ka];
                    var pbB = (pb.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                    if (cleanB && pbB && pbB === cleanB) { pbMatch = ka; }
                    // Belge yoksa firma normalindeki numara eşleşmesi
                    if (!pbMatch) {
                        var pbNorm = ka.replace(/\D/g, '').replace(/^0+/, '');
                        if (cleanB && pbNorm && pbNorm === cleanB) { pbMatch = ka; }
                    }
                });
                if (pbMatch) {
                    var oldId = d._id; // eski yanlış-isimli Firestore doküman ID'si
                    console.log('Yetki-no düzeltmesi:', d.firma, '→', pbMatch, '(eski ID:', oldId, ')');
                    d.firma = pbMatch;
                    if (!d.tel && phoneBook[pbMatch]) d.tel = phoneBook[pbMatch].tel || '';
                    fixedNames.push({ data: d, oldId: oldId });
                }
            });
            if (fixedNames.length > 0) {
                fixedNames.forEach(function (fx, i) {
                    setTimeout(function () {
                        fbSaveChip(fx.data);          // yeni doğru isimle yaz
                        if (fx.oldId) fsDel('chip_data', fx.oldId); // eski yanlış kaydı sil
                    }, i * 300);
                });
                toast(fixedNames.length + ' firma adı düzeltildi', 'ok');
            }

            // PhoneBook'tan tel senkronizasyonu — sipariş sayfasından girilen numaraları yansıt
            syncChipTelFromPB();
            lsSet('alibey_chip', { data: chipData, pb: phoneBook });
            updateChipStats();
            renderChip();
            setSyncStatus(true);
        });
    }

    // ── CHIP ORDERS ───────────────────────────────────────────────────
    function fbSaveOrder(o) {
        var id = String(o.id || Date.now());
        fsSet('chip_orders', id, {
            id: o.id, firma: o.firma || '', belge: o.belge || '', tel: o.tel || '',
            siparisNo: o.siparisNo || '',
            adet: o.adet || 0, tarih: o.tarih || '', not: o.not || '', durum: o.durum || 'verildi'
        });
    }

    function fbDeleteOrder(o) {
        fsDel('chip_orders', String(o.id));
    }

    function fbPullOrders() {
        return fsGet('chip_orders').then(function (rows) {
            if (rows.length) {
                chipOrders = rows.map(function (r) {
                    return { id: r.id, firma: r.firma, belge: r.belge, siparisNo: r.siparisNo || '', tel: r.tel, adet: r.adet, tarih: r.tarih, not: r.not, durum: r.durum };
                }).sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
                renderChipOrders();
            } else {
                // Firestore boş ise lokal listeyi de boşalt (silme işlemi)
                chipOrders = [];
                renderChipOrders();
            }
        });
    }

    // ── PRICE RECORDS ─────────────────────────────────────────────────
    function fbSavePR(p) {
        var id = String(p._id || Date.now());
        p._id = id;
        fsSet('price_records', id, {
            id: id, mu: p.mu || '', tip: p.tip || '', alan: p.alan || '',
            tablo: p.tablo || '', isk: p.isk || '', net: p.net || '', kdv: p.kdv || '',
            items: p.items || [],
            vade: p.vade || '', gecerlilik: p.gecerlilik || '', yetkili: p.yetkili || '',
            not: p.not || '', tarih: p.tarih || '', durum: p.durum || 'beklemede',
            updatedAt: new Date().toISOString()
        });
    }

    function fbDeletePR(p) {
        fsDel('price_records', String(p._id));
    }

    function fbPullPR() {
        // localStorage'dan önce yükle — her zaman görünsün
        var locals = lsGet('alibey_pr') || [];
        if (locals.length && !prData.length) { prData = locals; renderPR(); }

        return fsGet('price_records').then(function (rows) {
            if (!rows.length) {
                // Firestore boş ise lokal listeyi de boşalt (silme işlemi)
                prData = [];
                renderPR();
                return;
            }

            // ── Duplicate temizleme: aynı mu+tarih+tablo'ya sahip kayıtlardan en yeniyi tut ──
            var seen = {};
            var toDelete = [];
            rows.forEach(function (r) {
                var key = (r.mu || '') + '|' + (r.tarih || '') + '|' + (r.tablo || '');
                if (!seen[key]) {
                    seen[key] = r;
                } else {
                    // İkisi de varsa en yüksek id'liyi tut (en son yazılan)
                    var existing = seen[key];
                    if (String(r.id || r._id || '') > String(existing.id || existing._id || '')) {
                        toDelete.push(String(existing._id || existing.id || ''));
                        seen[key] = r;
                    } else {
                        toDelete.push(String(r._id || r.id || ''));
                    }
                }
            });

            // Fazla kayıtları Firestore'dan sil
            if (toDelete.length) {
                console.log('[PR dedup] ' + toDelete.length + ' duplikat siliniyor');
                toDelete.forEach(function (did, i) {
                    if (did) setTimeout(function () { fsDel('price_records', did); }, 500 + i * 300);
                });
            }

            prData = Object.values(seen).sort(function (a, b) {
                return (b.id || '') > (a.id || '') ? 1 : -1;
            });
            lsSet('alibey_pr', prData);
            renderPR();
        }).catch(function () {
            console.warn('fbPullPR hata — localStorage kullanılıyor');
        });
    }

    // ── HR & MAAŞ YÖNETİMİ ───────────────────────────────────────────
    var staffData = [], payrollData = {}; // payrollData: { '2024-03': [records...] }
    var currentMaasTab = 'payroll';
    var ASGARI_UCRET = 28075.50; // 2026 Net asgari ücret
    var editingStaffId = null;

    function swMaas(tab) {
        currentMaasTab = tab;
        ['payroll', 'personnel', 'summary'].forEach(function(t) {
            var el = document.getElementById('sub-maas-' + t);
            if (el) el.style.display = t === tab ? 'block' : 'none';
            var btn = document.getElementById('btn-maas-' + t);
            if (btn) {
                btn.style.background = t === tab ? 'var(--acc2)' : 'var(--sur2)';
                btn.style.color = t === tab ? '#fff' : 'var(--tx)';
                btn.style.fontWeight = t === tab ? '700' : '400';
                btn.style.boxShadow = t === tab ? '0 2px 12px rgba(0,0,0,0.25)' : 'none';
            }
        });
        if (tab === 'personnel') renderStaff();
        else if (tab === 'summary') {
            var sel = document.getElementById('sumStaff');
            if (sel) sel.innerHTML = '<option value="ALL">Tüm Personel</option>' + staffData.map(function(s) { return '<option value="' + s.id + '">' + s.ad + '</option>'; }).join('');
            // Varsayılan tarih aralığı: bu ay
            var now = new Date();
            var thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
            var sumS = document.getElementById('sumStart');
            var sumE = document.getElementById('sumEnd');
            if (sumS && !sumS.value) sumS.value = thisMonth;
            if (sumE && !sumE.value) sumE.value = thisMonth;
        }
        else {
            var pm = document.getElementById('payrollMonth');
            var curMonth = pm ? pm.value : '';
            if (!curMonth) {
                var n = new Date();
                curMonth = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0');
            }
            loadPayroll(curMonth);
        }
    }

    function labPersonelCanEdit() {
        var v = window.__LAB_PERSONEL_ACCESS__;
        if (v === 'none' || v === 'view') return false;
        return true;
    }

    /** Personel hesabı: listede / özlükte yalnızca kendi hr_personnel kaydı */
    function staffRowsForUi() {
        var sid = window.__LAB_PERSONEL_SELF_ID__;
        if (!sid) return staffData;
        return staffData.filter(function (s) { return String(s.id) === String(sid); });
    }

    function payrollRowsStaff() {
        var pl = window.__LAB_PERSONEL_SELF_ID__ || window.__PAYROLL_LOCK_STAFF_ID__;
        if (!pl) return staffData;
        return staffData.filter(function (s) { return String(s.id) === String(pl); });
    }

    function saveStaff() {
        if (!labPersonelCanEdit()) return toast('Bu rol personel / özlük kayıtlarını düzenleyemez.', 'err');
        function gv(id) {
            var el = document.getElementById(id);
            return el ? (el.value || '').trim() : '';
        }
        var ad = (document.getElementById('staffName').value || '').trim();
        var tc = (document.getElementById('staffTC').value || '').trim();
        var iban = (document.getElementById('staffIBAN').value || '').trim();
        var net = parseFloat(document.getElementById('staffNet').value) || 0;
        var karot = document.getElementById('staffIsKarot').checked;
        var gorev = (document.getElementById('staffGorev').value || '').trim();
        var meslek = (document.getElementById('staffMeslek').value || '').trim();
        var loginEl = document.getElementById('staffPortalLogin');
        var passEl = document.getElementById('staffPortalPass');
        var portalLogin = loginEl ? (loginEl.value || '').trim().toLowerCase() : '';
        var portalPass = passEl ? (passEl.value || '').trim() : '';
        if (!ad) return toast('Ad Soyad zorunlu', 'err');
        if (portalLogin) {
            if (!/^[a-z0-9._-]{3,32}$/i.test(portalLogin)) return toast('Saha kullanıcı adı 3–32 karakter (harf, rakam, . _ -)', 'err');
            if (!editingStaffId && !portalPass) return toast('Yeni personel için saha şifresi girin', 'err');
        }

        var id = editingStaffId || (tc || String(Date.now()));
        var obj = {
            id: id, ad: ad, tc: tc, iban: iban, net: net, isKarot: karot, gorev: gorev, meslek: meslek,
            dogumTarihi: gv('staffDogum'), kanGrubu: gv('staffKan'), cepTel: gv('staffCep'),
            yakinAd: gv('staffYakinAd'), yakinTel: gv('staffYakinTel')
        };

        fbSaveStaff(obj).then(function () {
            if (!portalLogin) {
                toast(editingStaffId ? 'Personel güncellendi' : 'Personel kaydedildi');
                cancelStaffEdit();
                return;
            }
            upsertLabUserForStaff(id, ad, portalLogin, portalPass, !!editingStaffId).then(function () {
                if (passEl) passEl.value = '';
                toast(editingStaffId ? 'Personel ve saha girişi güncellendi' : 'Personel ve saha girişi kaydedildi');
                cancelStaffEdit();
            }).catch(function (e) {
                toast((e && e.message) ? e.message : 'Saha kullanıcı kaydı hatası', 'err');
            });
        });
    }

    function editStaff(id) {
        var s = staffData.find(x => x.id === id);
        if (!s) return;
        function setIf(fid, val) {
            var el = document.getElementById(fid);
            if (el) el.value = val != null ? val : '';
        }
        editingStaffId = id;
        document.getElementById('staffName').value = s.ad;
        document.getElementById('staffTC').value = s.tc || '';
        document.getElementById('staffIBAN').value = s.iban || '';
        document.getElementById('staffNet').value = s.net;
        document.getElementById('staffGorev').value = s.gorev || '';
        document.getElementById('staffMeslek').value = s.meslek || '';
        setIf('staffDogum', s.dogumTarihi || '');
        setIf('staffKan', s.kanGrubu || '');
        setIf('staffCep', s.cepTel || '');
        setIf('staffYakinAd', s.yakinAd || '');
        setIf('staffYakinTel', s.yakinTel || '');
        var loginEl = document.getElementById('staffPortalLogin');
        var passEl = document.getElementById('staffPortalPass');
        if (loginEl) loginEl.value = '';
        if (passEl) passEl.value = '';
        if (typeof fsGet === 'function') {
            fsGet('lab_users').then(function (rows) {
                var u = (rows || []).find(function (x) { return String(x.personelId || '') === String(id); });
                if (loginEl && u && u.login) loginEl.value = u.login;
            }).catch(function () {});
        }
        document.getElementById('saveStaffBtn').textContent = '✅ Güncelle';
        document.getElementById('cancelStaffBtn').style.display = 'block';
        var sub = document.getElementById('sub-maas-personnel');
        if (sub) window.scrollTo({ top: sub.offsetTop - 100, behavior: 'smooth' });
    }

    function cancelStaffEdit() {
        editingStaffId = null;
        ['staffName', 'staffTC', 'staffIBAN', 'staffNet', 'staffGorev', 'staffMeslek', 'staffDogum', 'staffKan', 'staffCep', 'staffYakinAd', 'staffYakinTel'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var pl = document.getElementById('staffPortalLogin');
        var pp = document.getElementById('staffPortalPass');
        if (pl) pl.value = '';
        if (pp) pp.value = '';
        document.getElementById('staffIsKarot').checked = false;
        document.getElementById('saveStaffBtn').textContent = '👤 Personel Ekle';
        document.getElementById('cancelStaffBtn').style.display = 'none';
        renderStaff();
    }

    function fbSaveStaff(s) {
        return fsSet('hr_personnel', s.id, s).then(function() { return fbPullStaff(); });
    }

    function fbPullStaff() {
        return fsGet('hr_personnel').then(rows => {
            staffData = rows || [];
            renderStaff();
            renderOzlukIk();
            renderPayroll(); // Personel listesi değişirse bordroyu da tazele
        });
    }

    function renderStaff() {
        var tb = document.getElementById('staffList');
        if (!tb) return;
        var canEdit = labPersonelCanEdit();
        var rows = staffRowsForUi();
        if (!rows.length && window.__LAB_PERSONEL_SELF_ID__) {
            tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tx3)">Personel kaydınız bulunamadı veya henüz atanmadı.</td></tr>';
            return;
        }
        tb.innerHTML = rows.map(function (s) {
            var actions = canEdit
                ? '<td style="display:flex;gap:4px;justify-content:center">' +
                  '<button class="btn btn-g" style="color:var(--acc2)" onclick="editStaff(\'' + s.id + '\')">✏️</button>' +
                  '<button class="btn btn-g" style="color:var(--red)" onclick="deleteStaff(\'' + s.id + '\')">🗑</button></td>'
                : '<td style="text-align:center;color:var(--tx3);font-size:11px">Salt okunur</td>';
            return '<tr>' +
            '<td><div style="font-weight:700">' + s.ad + '</div>' +
            '<div style="font-size:10px;color:var(--tx3)">' + (s.gorev || '') + ' / ' + (s.meslek || '') + '</div></td>' +
            '<td style="text-align:center">' + (s.tc || '—') + '</td>' +
            '<td style="font-size:10px;text-align:center">' + (s.iban || '—') + '</td>' +
            '<td style="text-align:right;font-weight:600">' + s.net.toLocaleString('tr-TR') + ' ₺</td>' +
            '<td style="text-align:center">' + (s.isKarot ? '🧱 Karot' : '👤 Normal') + '</td>' +
            actions +
            '</tr>';
        }).join('');
    }

    function renderOzlukIk() {
        var tb = document.getElementById('ozlukStaffList');
        if (!tb) return;
        var canEdit = labPersonelCanEdit();
        var rows = staffRowsForUi();
        if (!rows.length) {
            tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tx3)">' +
                (window.__LAB_PERSONEL_SELF_ID__ ? 'Kaydınız bulunamadı.' : 'Personel kaydı yok. Personel listesinden ekleyin.') +
                '</td></tr>';
            return;
        }
        function esc(x) {
            return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        }
        tb.innerHTML = rows.map(function (s) {
            var editCell = canEdit
                ? '<td style="text-align:center"><a class="btn btn-g" style="font-size:11px;padding:5px 10px;text-decoration:none;display:inline-block" href="/personel/liste">Düzenle</a></td>'
                : '<td style="text-align:center;color:var(--tx3)">—</td>';
            return '<tr>' +
                '<td><div style="font-weight:700">' + esc(s.ad) + '</div>' +
                '<div style="font-size:10px;color:var(--tx3)">' + esc(s.gorev) + ' / ' + esc(s.meslek) + '</div></td>' +
                '<td style="font-size:11px;white-space:nowrap">' + (esc(s.dogumTarihi) || '—') + '</td>' +
                '<td style="text-align:center">' + (esc(s.kanGrubu) || '—') + '</td>' +
                '<td style="font-size:11px">' + (esc(s.cepTel) || '—') + '</td>' +
                '<td style="font-size:11px">' + (esc(s.yakinAd) || '—') + '</td>' +
                '<td style="font-size:11px">' + (esc(s.yakinTel) || '—') + '</td>' +
                '<td style="text-align:center">' + (s.isKarot ? 'Karotçu' : '—') + '</td>' +
                editCell +
                '</tr>';
        }).join('');
    }

    window.fbPullStaff = fbPullStaff;

    function deleteStaff(id) {
        if (!labPersonelCanEdit()) return toast('Bu rol personel kayıtlarını düzenleyemez.', 'err');
        if (!confirm('Personeli silmek istediğinize emin misiniz?')) return;
        fsDel('hr_personnel', id).then(function() { fbPullStaff(); });
    }

    function loadPayroll(month) {
        if (!month) return;
        var monthEl = document.getElementById('payrollMonth');
        if (monthEl) monthEl.value = month;
        var date = new Date(month + "-01");
        var ayAd = date.toLocaleString('tr-TR', { month: 'long', year: 'numeric' });
        var badgeEl = document.getElementById('payrollMonthBadge');
        if (badgeEl) badgeEl.textContent = ayAd;
        fbPullPayroll(month);
    }

    function fbPullPayroll(month) {
        return fsGet('hr_payroll').then(rows => {
            var map = {};
            (rows || []).filter(r => r.yilAy === month).forEach(r => map[r.personnelId] = r);
            payrollData[month] = map;
            renderPayroll();
        });
    }

    function renderPayroll() {
        var monthEl = document.getElementById('payrollMonth');
        var month = monthEl ? monthEl.value : '';
        var tb = document.getElementById('payrollList');
        if (!tb || !month) return;
        var records = payrollData[month] || {};
        var totalPay = 0, totalAsgari = 0;

        var rows = payrollRowsStaff();
        tb.innerHTML = rows.map(s => {
            var r = records[s.id] || {};
            var net = s.net;
            var mesaiH = r.mesaiH || 0, mesaiRate = r.mesaiR || 0;
            var kT = r.karotT || 0, kP = r.karotP || 0;
            var ekP = r.ekPrim || 0, pDesc = r.primDesc || "";
            var avans = r.avans || 0, kes = r.kesinti || 0, kDesc = r.kesintiDesc || "";
            var eksR = r.eksikR || 0, eksO = r.eksikO || 0;

            var idPrefix = `pay_${s.id}_`;

            return `<tr style="font-size:12px;border-bottom:1px solid var(--bdr3)">
                <td style="padding:10px">
                    <div style="font-weight:800;font-size:13px;color:var(--acc2);line-height:1.2">${s.ad}</div>
                    <div style="font-size:10px;color:var(--tx3);font-weight:600">${s.gorev || ''} | ${s.meslek || ''}</div>
                    <div style="font-size:9px;color:var(--tx3);opacity:0.6">${s.tc || ''} | ${s.iban || ''}</div>
                </td>
                <td style="text-align:center;background:var(--sur2)">
                    <div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px">NET MAAŞ</div>
                    <div style="font-weight:800;color:var(--tx);font-size:13px">${net.toLocaleString('tr-TR')} ₺</div>
                </td>
                <td>
                    <div style="display:flex;gap:6px;justify-content:center">
                        <div style="text-align:center"><div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">📊 SAAT</div><input type="number" id="${idPrefix}mesaiH" value="${mesaiH}" oninput="recalcRow('${s.id}')" style="width:48px;text-align:center;padding:5px;border-radius:6px;border:1px solid var(--acc2);font-size:12px;font-weight:700;color:var(--acc2)"></div>
                        <div style="text-align:center"><div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">₺ / SAAT</div><input type="number" id="${idPrefix}mesaiR" value="${mesaiRate}" oninput="recalcRow('${s.id}')" style="width:60px;text-align:center;padding:5px;border-radius:6px;border:1px solid var(--acc2);font-size:12px;font-weight:700;color:var(--acc2)"></div>
                    </div>
                </td>
                <td>
                    ${s.isKarot ? `<div style="display:flex;gap:6px;justify-content:center">
                        <div style="text-align:center"><div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">🧱 TAKIM</div><input type="number" id="${idPrefix}karotT" value="${kT}" oninput="recalcRow('${s.id}')" style="width:45px;padding:5px;border-radius:6px;border:1px solid var(--acc2);font-size:12px;font-weight:700;color:var(--acc2);text-align:center"></div>
                        <div style="text-align:center"><div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">₺ / TAKIM</div><input type="number" id="${idPrefix}karotP" value="${kP}" oninput="recalcRow('${s.id}')" style="width:55px;padding:5px;border-radius:6px;border:1px solid var(--acc2);font-size:12px;font-weight:700;color:var(--acc2);text-align:center"></div>
                    </div>` : '<div style="text-align:center;color:var(--tx3);font-size:10px;font-weight:600">👤 Karotcu Değil</div>'}
                </td>
                <td style="background:var(--sur2)">
                    <div style="display:flex;flex-direction:column;gap:5px">
                        <div style="text-align:center"><div style="font-size:9px;color:var(--acc2);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">🎁 EK PRİM TUTARI</div><input type="number" id="${idPrefix}ekPrim" value="${ekP}" oninput="recalcRow('${s.id}')" placeholder="0" style="width:100%;padding:5px;border-radius:6px;border:1px solid var(--acc2);font-size:12px;font-weight:700;color:var(--acc2);text-align:center"></div>
                        <input type="text" id="${idPrefix}primDesc" value="${pDesc}" placeholder="Açıklama giriniz..." style="width:100%;font-size:10px;padding:4px;border-radius:6px;border:1px solid var(--bdr2);background:var(--p-bg);color:var(--tx2)">
                    </div>
                </td>
                <td>
                    <div style="display:flex;flex-direction:column;gap:5px">
                        <div style="display:flex;gap:6px">
                            <div style="text-align:center;flex:1"><div style="font-size:9px;color:var(--red);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">🏦 AVANS</div><input type="number" id="${idPrefix}avans" value="${avans}" oninput="recalcRow('${s.id}')" style="width:100%;padding:5px;border-radius:6px;border:1px solid var(--red);font-size:12px;font-weight:700;color:var(--red);text-align:center;background:rgba(255,0,0,0.05)"></div>
                            <div style="text-align:center;flex:1"><div style="font-size:9px;color:var(--red);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">📉 KESİNTİ</div><input type="number" id="${idPrefix}kesinti" value="${kes}" oninput="recalcRow('${s.id}')" style="width:100%;padding:5px;border-radius:6px;border:1px solid var(--red);font-size:12px;font-weight:700;color:var(--red);text-align:center;background:rgba(255,0,0,0.05)"></div>
                        </div>
                        <input type="text" id="${idPrefix}kesintiDesc" value="${kDesc}" placeholder="Neden giriniz..." style="width:100%;font-size:10px;padding:4px;border-radius:6px;border:1px solid var(--bdr2);background:var(--p-bg);color:var(--tx2)">
                    </div>
                </td>
                <td style="background:rgba(255,165,0,0.05)">
                    <div style="display:flex;flex-direction:column;gap:5px;justify-content:center">
                        <div style="display:flex;gap:4px">
                            <div style="text-align:center;flex:1"><div style="font-size:9px;color:var(--amb);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">🏥 RAPOR</div><input type="number" id="${idPrefix}eksikR" value="${eksR}" oninput="recalcRow('${s.id}')" style="width:100%;padding:5px;border-radius:6px;border:1px solid var(--amb);font-size:12px;font-weight:700;color:var(--amb);text-align:center;background:rgba(255,165,0,0.05)"></div>
                            <div style="text-align:center;flex:1"><div style="font-size:9px;color:var(--amb);font-weight:800;letter-spacing:0.5px;margin-bottom:2px">⏳ DİĞER</div><input type="number" id="${idPrefix}eksikO" value="${eksO}" oninput="recalcRow('${s.id}')" style="width:100%;padding:5px;border-radius:6px;border:1px solid var(--amb);font-size:12px;font-weight:700;color:var(--amb);text-align:center;background:rgba(255,165,0,0.05)"></div>
                        </div>
                    </div>
                </td>
                <td style="background:rgba(99,102,241,0.06);text-align:center">
                    <div style="font-size:9px;color:#6366f1;font-weight:800;letter-spacing:0.5px;margin-bottom:4px">📅 SGK GÜNÜ</div>
                    <input type="number" id="${idPrefix}sgkGun"
                        value="${r.sgkGun !== undefined ? r.sgkGun : Math.max(0, 30 - (r.eksikR||0) - (r.eksikO||0))}"
                        data-manual="${r.sgkGun !== undefined ? '1' : ''}"
                        min="0" max="30"
                        oninput="this.dataset.manual='1'; this.style.borderColor='#a855f7'; autoSaveRow('${s.id}', this);"
                        title="Otomatik: eksik günlerden hesaplanır. Elle yazarsan manuel moda geçer. Sıfırlamak için çift tıkla."
                        ondblclick="this.dataset.manual=''; this.style.borderColor='#6366f1'; recalcRow('${s.id}');"
                        style="width:54px;padding:6px;border-radius:8px;border:2px solid ${r.sgkGun !== undefined ? '#a855f7' : '#6366f1'};font-size:13px;font-weight:800;color:#6366f1;text-align:center;background:rgba(99,102,241,0.08);cursor:pointer">
                    <div style="font-size:9px;color:var(--tx3);margin-top:2px">/ 30 gün</div>
                    <div id="${idPrefix}sgkStatus" style="font-size:8px;color:var(--tx3);opacity:0.7">${r.sgkGun !== undefined ? '🔒 Manuel' : '🔄 Otomatik'}</div>
                </td>
                <td style="text-align:right">
                    <div style="font-size:9px;color:var(--acc2);font-weight:800;text-transform:uppercase;margin-bottom:2px">ASGARİ / KALAN</div>
                    <div id="${idPrefix}totalAsgari" style="color:var(--tx2);font-weight:800;font-size:13px">0,00 ₺</div>
                    <div id="${idPrefix}totalKalan" style="font-size:11px;color:var(--tx3);font-weight:600">+ 0,00 ₺</div>
                </td>
                <td id="${idPrefix}totalGenel" style="text-align:right;font-weight:900;color:var(--grn);font-size:17px;background:var(--grn-d);padding:0 12px;border-radius:6px">0,00 ₺</td>
                <td style="text-align:center;padding:10px">
                    <button class="btn btn-p" id="btn_save_pay_${s.id}" onclick="saveRowPay('${s.id}')" style="padding:10px;font-size:22px;border-radius:12px;box-shadow:0 0 10px rgba(0,0,0,0.5)" title="Satırı Kaydet">💾</button>
                </td>
            </tr>`;
        }).join('');

        rows.forEach(s => recalcRow(s.id));
        updatePayrollSummary();
        if (!labPersonelCanEdit()) {
            tb.querySelectorAll('input, button').forEach(function (el) { el.disabled = true; });
        }
        var btnTop = document.getElementById('btnTopluKaydet');
        if (btnTop) {
            btnTop.style.display = (window.__LAB_PERSONEL_SELF_ID__ || window.__PAYROLL_LOCK_STAFF_ID__) ? 'none' : '';
            if (!labPersonelCanEdit()) btnTop.style.display = 'none';
        }
    }

    function recalcRow(staffId) {
        var pre = `pay_${staffId}_`;
        var s = staffData.find(x => x.id === staffId);
        if (!s) return;

        var net = s.net;
        var mH = parseFloat(document.getElementById(pre + 'mesaiH')?.value) || 0;
        var mR = parseFloat(document.getElementById(pre + 'mesaiR')?.value) || 0;
        var kT = parseFloat(document.getElementById(pre + 'karotT')?.value) || 0;
        var kP = parseFloat(document.getElementById(pre + 'karotP')?.value) || 0;
        var ekP = parseFloat(document.getElementById(pre + 'ekPrim')?.value) || 0;
        var avans = parseFloat(document.getElementById(pre + 'avans')?.value) || 0;
        var kes = parseFloat(document.getElementById(pre + 'kesinti')?.value) || 0;
        var eksR = parseFloat(document.getElementById(pre + 'eksikR')?.value) || 0;
        var eksO = parseFloat(document.getElementById(pre + 'eksikO')?.value) || 0;

        // SGK günü: eksik günler değişince otomatik hesaplanır
        // Kullanıcı sgkGun alanını değiştirmemişse → 30 - eksik günler
        var sgkGunEl = document.getElementById(pre + 'sgkGun');
        if (sgkGunEl && !sgkGunEl.dataset.manual) {
            sgkGunEl.value = Math.max(0, 30 - eksR - eksO);
        }

        var mesaiTot = mH * mR;
        var karotTot = kT * kP;
        var eksikKes = (eksR + eksO) * (net / 30);
        
        var genelT = (net + mesaiTot + karotTot + ekP) - avans - kes - eksikKes;
        var asgari = Math.min(genelT, ASGARI_UCRET);
        var kalan = Math.max(0, genelT - asgari);

        document.getElementById(pre + 'totalAsgari').textContent = asgari.toLocaleString('tr-TR') + ' ₺';
        document.getElementById(pre + 'totalKalan').textContent = '+ ' + kalan.toLocaleString('tr-TR') + ' ₺';
        document.getElementById(pre + 'totalGenel').textContent = genelT.toLocaleString('tr-TR') + ' ₺';
        
        updatePayrollSummary();
    }

    function updatePayrollSummary() {
        var tPay = 0, tAsg = 0;
        payrollRowsStaff().forEach(s => {
            var el = document.getElementById(`pay_${s.id}_totalGenel`);
            if (el) tPay += parseFloat(el.textContent.replace(/\./g, '').replace(',', '.').replace(' ₺', '')) || 0;
            var elA = document.getElementById(`pay_${s.id}_totalAsgari`);
            if (elA) tAsg += parseFloat(elA.textContent.replace(/\./g, '').replace(',', '.').replace(' ₺', '')) || 0;
        });
        document.getElementById('totalPayrollPay').textContent = tPay.toLocaleString('tr-TR') + ' ₺';
        document.getElementById('totalPayrollAsgari').textContent = tAsg.toLocaleString('tr-TR') + ' ₺';
        document.getElementById('totalPayrollEk').textContent = (tPay - tAsg).toLocaleString('tr-TR') + ' ₺';
    }

    // Debounce timer için map
    var _autoSaveTimers = {};

    window.labFlushPendingPayroll = function () {
        var ids = Object.keys(_autoSaveTimers);
        ids.forEach(function (id) {
            clearTimeout(_autoSaveTimers[id]);
            delete _autoSaveTimers[id];
        });
        return Promise.all(ids.map(function (id) { return saveRowPay(id, true); }));
    };

    window.labSoftMergeBeforeLogout = function () {
        return Promise.all([
            fsGet('beton_programi').catch(function () { return []; }),
            new Promise(function (resolve) {
                fsGetDoc('ebistr_cache', 'current_data', function (doc) { resolve(doc || null); });
            })
        ]).then(function (pair) {
            var beton = pair[0] || [];
            var eb = pair[1] || {};
            var betonCount = beton.filter(function (b) { return !b._silindi; }).length;
            var ebN = (eb.numuneler && eb.numuneler.length) ? eb.numuneler.length : 0;
            return fsSet('dashboard_cache', 'logout_merge', {
                ts: new Date().toISOString(),
                betonCount: betonCount,
                ebistrNumuneCount: ebN
            });
        }).catch(function () { return null; });
    };

    /**
     * İki personel kaydını birleştirir: keepId kalır, dropId silinir.
     * Bordro satırları (yilAy_personelId) taşınır; lab_users.personelId güncellenir.
     */
    window.labMergePersonnelRecords = function (keepId, dropId) {
        keepId = String(keepId);
        dropId = String(dropId);
        if (!keepId || !dropId || keepId === dropId) return Promise.reject(new Error('Geçersiz seçim'));
        return Promise.all([
            fsGet('hr_personnel').catch(function () { return []; }),
            fsGet('hr_payroll').catch(function () { return []; }),
            fsGet('lab_users').catch(function () { return []; })
        ]).then(function (rows) {
            var staff = rows[0] || [];
            var payroll = rows[1] || [];
            var users = rows[2] || [];
            var k = staff.find(function (s) { return String(s.id) === keepId; });
            var d = staff.find(function (s) { return String(s.id) === dropId; });
            if (!k || !d) throw new Error('Personel bulunamadı');
            var merged = Object.assign({}, k, {
                gorev: k.gorev || d.gorev,
                meslek: k.meslek || d.meslek,
                yakinAd: k.yakinAd || d.yakinAd,
                yakinTel: k.yakinTel || d.yakinTel,
                cepTel: k.cepTel || d.cepTel,
                kanGrubu: k.kanGrubu || d.kanGrubu,
                dogumTarihi: k.dogumTarihi || d.dogumTarihi,
                not: [k.not, d.not, 'Birleştirilen: ' + (d.ad || dropId)].filter(Boolean).join(' | ')
            });
            var tasks = [];
            payroll.forEach(function (r) {
                if (!r || String(r.personnelId) !== dropId || !r.yilAy) return;
                var oldId = r.yilAy + '_' + dropId;
                var newId = r.yilAy + '_' + keepId;
                var nr = Object.assign({}, r, { id: newId, personnelId: keepId });
                tasks.push(fsSet('hr_payroll', newId, nr).then(function () { return fsDel('hr_payroll', oldId); }));
            });
            users.forEach(function (u) {
                if (u && String(u.personelId) === dropId) {
                    tasks.push(fsSet('lab_users', u.id, Object.assign({}, u, { personelId: keepId })));
                }
            });
            return Promise.all(tasks).then(function () {
                return fsSet('hr_personnel', keepId, merged);
            }).then(function () {
                return fsSet('hr_personnel', dropId, { id: dropId, _silindi: true, mergedInto: keepId });
            }).then(function () {
                if (typeof fbPullStaff === 'function') return fbPullStaff();
            });
        });
    };

    function autoSaveRow(staffId, inputEl) {
        // Debounce: 800ms sonra sessiz kayıt
        clearTimeout(_autoSaveTimers[staffId]);
        var statusEl = document.getElementById('pay_' + staffId + '_sgkStatus');
        if (statusEl) statusEl.textContent = '💾 Kaydediliyor...';
        _autoSaveTimers[staffId] = setTimeout(function() {
            saveRowPay(staffId, true).then(function() {
                if (statusEl) {
                    statusEl.textContent = '✅ Kaydedildi';
                    setTimeout(function() { statusEl.textContent = '🔒 Manuel'; }, 1500);
                }
            });
        }, 800);
    }

    function saveRowPay(staffId, silent) {
        if (!labPersonelCanEdit()) {
            if (!silent) toast('Bu rol bordroyu düzenleyemez.', 'err');
            return Promise.resolve();
        }
        var selfOnly = window.__LAB_PERSONEL_SELF_ID__;
        if (selfOnly && String(staffId) !== String(selfOnly)) {
            return Promise.resolve();
        }
        var month = document.getElementById('payrollMonth').value;
        if (!month) return Promise.resolve();
        var idPrefix = 'pay_' + staffId + '_';

        function numVal(elId) { return parseFloat((document.getElementById(elId) || {}).value) || 0; }
        function strVal(elId) { return ((document.getElementById(elId) || {}).value || '').trim(); }

        var record = {
            personnelId: staffId,
            yilAy: month,
            mesaiH: numVal(idPrefix + 'mesaiH'),
            mesaiR: numVal(idPrefix + 'mesaiR'),
            ekPrim: numVal(idPrefix + 'ekPrim'),
            primDesc: strVal(idPrefix + 'primDesc'),
            avans: numVal(idPrefix + 'avans'),
            kesinti: numVal(idPrefix + 'kesinti'),
            kesintiDesc: strVal(idPrefix + 'kesintiDesc'),
            eksikR: numVal(idPrefix + 'eksikR'),
            eksikO: numVal(idPrefix + 'eksikO'),
            sgkGun: (function() {
                var el = document.getElementById(idPrefix + 'sgkGun');
                if (!el) return 30;
                var v = parseFloat(el.value);
                return isNaN(v) ? 30 : v;
            })()
        };

        var kT = document.getElementById(idPrefix + 'karotT');
        var kP = document.getElementById(idPrefix + 'karotP');
        if (kT) record.karotT = parseFloat(kT.value) || 0;
        if (kP) record.karotP = parseFloat(kP.value) || 0;

        var btn = document.getElementById('btn_save_pay_' + staffId);
        if (btn && !silent) { btn.textContent = '⏳'; btn.disabled = true; }

        var id = month + '_' + staffId;
        return fsSet('hr_payroll', id, record).then(function() {
            if (!payrollData[month]) payrollData[month] = {};
            payrollData[month][staffId] = record;
            setSyncStatus(true);
            if (btn && !silent) {
                btn.textContent = '✅';
                setTimeout(function() { btn.textContent = '💾'; btn.disabled = false; }, 1500);
                toast('Kayıt Başarılı ✓', 'ok');
            }
        });
    }

    function saveAllPayroll() {
        if (!labPersonelCanEdit()) return toast('Bu rol bordroyu düzenleyemez.', 'err');
        var monthEl = document.getElementById('payrollMonth');
        var month = monthEl ? monthEl.value : '';
        if (!month) return toast('Önce bir ay seçin', 'err');
        var rows = payrollRowsStaff();
        if (!rows.length) return toast('Personel bulunamadı', 'err');
        var btn = document.getElementById('btnTopluKaydet');
        if (btn) { btn.textContent = '⏳ Kaydediliyor...'; btn.disabled = true; }
        var promises = rows.map(function(s) { return saveRowPay(s.id, true); });
        Promise.all(promises).then(function() {
            setSyncStatus(true);
            if (btn) {
                btn.textContent = '✅ Kaydedildi!';
                setTimeout(function() { btn.textContent = '💾 Toplu Kaydet'; btn.disabled = false; }, 2000);
            }
            toast(rows.length + ' personel bordrosu kaydedildi ✓', 'ok');
        }).catch(function() {
            if (btn) { btn.textContent = '💾 Toplu Kaydet'; btn.disabled = false; }
            toast('Bazı kayıtlar başarısız oldu', 'err');
        });
    }

    function loadMaasSummary() {
        var staffId = document.getElementById('sumStaff').value;
        if (window.__MAAS_OZET_LOCK_STAFF_ID__) staffId = window.__MAAS_OZET_LOCK_STAFF_ID__;
        var start = document.getElementById('sumStart').value;
        var end = document.getElementById('sumEnd').value;
        var tb = document.getElementById('summaryList');
        if (!start || !end) return toast('Tarih aralığı seçiniz', 'err');
        
        tb.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center">🔍 Veriler analiz ediliyor...</td></tr>';

        // 2026 SGK Parametreleri
        const EMPLOYER_RATE = 0.225;   // %22.5 İşveren Payı + İşsizlik Sigortası
        const INCENTIVE_DISC = 0.05;   // %5 Erken Ödeme Teşviki
        const NET_TO_BRUT = 0.71;      // Yaklaşık Net/Brüt katsayısı (2026)

        fsGet('hr_payroll').then(allRecords => {
            var filtered = allRecords.filter(r => {
                var inStaff = (staffId === 'ALL' || r.personnelId === staffId);
                var inDate  = (r.yilAy >= start && r.yilAy <= end);
                return inStaff && inDate;
            });

            if (filtered.length === 0) {
                tb.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--tx3)">Seçili aralıkta veri bulunamadı.</td></tr>';
                ['sumTotalPaid','sumTotalKarot','sumTotalTesvik'].forEach(id => document.getElementById(id).textContent = '0,00 ₺');
                document.getElementById('sumTotalEksik').textContent = '0 / 0';
                return;
            }

            var tNet = 0, tKarot = 0, tR = 0, tO = 0, tTesvik = 0;
            
            var html = filtered.map(r => {
                var s    = staffData.find(x => x.id === r.personnelId) || { ad: 'Bilinmeyen', net: 0 };
                var rNet = parseFloat(s.net) || 0;

                // Gelen alan değerlerini güvenli parse et
                var mH   = parseFloat(r.mesaiH)  || 0;
                var mR   = parseFloat(r.mesaiR)  || 0;
                var kT   = parseFloat(r.karotT)  || 0;
                var kP   = parseFloat(r.karotP)  || 0;
                var ekP  = parseFloat(r.ekPrim)  || 0;
                var avns = parseFloat(r.avans)   || 0;
                var kes  = parseFloat(r.kesinti) || 0;
                var eksR = parseFloat(r.eksikR)  || 0;
                var eksO = parseFloat(r.eksikO)  || 0;

                var mesaiTot = mH * mR;
                var karotTot = kT * kP;
                var eksikKes = (eksR + eksO) * (rNet / 30);
                var payNet   = (rNet + mesaiTot + karotTot + ekP) - avns - kes - eksikKes;

                // SGK günü: bordro sayfasında el ile girilmiş değer öncelikli — maaşa etkisi yok
                // Girilmemişse eskiden olduğu gibi eksik günlerden hesaplanır
                var sgkGun = (r.sgkGun !== undefined && r.sgkGun !== null && r.sgkGun !== '')
                    ? Math.max(0, parseFloat(r.sgkGun))
                    : Math.max(0, 30 - (eksR + eksO));
                // SGK matrahı her zaman ASGARİ ÜCRET brütü üzerinden hesaplanır
                var asgariBreut = ASGARI_UCRET / NET_TO_BRUT;
                var normalMaliyet   = asgariBreut * EMPLOYER_RATE * (sgkGun / 30);
                var tesvikliMaliyet = asgariBreut * (EMPLOYER_RATE - INCENTIVE_DISC) * (sgkGun / 30);
                var kazanc = normalMaliyet - tesvikliMaliyet;

                tNet += payNet; tKarot += karotTot; tR += eksR; tO += eksO; tTesvik += kazanc;

                return `<tr>
                    <td style="padding:12px">
                        <div style="font-weight:700;color:var(--acc2)">${s.ad}</div>
                        <div style="font-size:10px;color:var(--tx3);font-weight:600">${r.yilAy}</div>
                        ${s.gorev ? `<div style="font-size:9px;color:var(--tx3)">${s.gorev}</div>` : ''}
                    </td>
                    <td style="text-align:right;font-weight:700;padding:12px">${payNet.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺</td>
                    <td style="text-align:right;font-size:11px;padding:12px">
                        <div>${karotTot.toLocaleString('tr-TR')} ₺ karot</div>
                        <div style="color:var(--acc2)">${ekP.toLocaleString('tr-TR')} ₺ ek prim</div>
                    </td>
                    <td style="text-align:center;padding:12px">
                        <div style="font-size:11px;color:var(--amb);font-weight:700">🏥 ${eksR} Rapor</div>
                        <div style="font-size:11px;color:var(--tx3)">⏳ ${eksO} Diğer</div>
                    </td>
                    <td style="text-align:center;font-weight:800;background:var(--sur2);padding:12px">${sgkGun} Gün</td>
                    <td style="text-align:right;font-size:11px;background:var(--sur2);padding:12px">${normalMaliyet.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺</td>
                    <td style="text-align:right;color:var(--grn);font-weight:700;background:var(--sur2);padding:12px">${tesvikliMaliyet.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺</td>
                </tr>`;
            }).join('');

            tb.innerHTML = html;
            document.getElementById('sumTotalPaid').textContent    = tNet.toLocaleString('tr-TR',{minimumFractionDigits:2}) + ' ₺';
            document.getElementById('sumTotalKarot').textContent   = tKarot.toLocaleString('tr-TR',{minimumFractionDigits:2}) + ' ₺';
            document.getElementById('sumTotalEksik').textContent   = tR + ' / ' + tO;
            document.getElementById('sumTotalTesvik').textContent  = tTesvik.toLocaleString('tr-TR',{minimumFractionDigits:2}) + ' ₺';
        });
    }

    function upPay(staffId, key, val) {
        // Redundant but kept for internal calls if any
        saveRowPay(staffId);
    }

    function exportPayrollExcel() {
        var monthEl = document.getElementById('payrollMonth');
        var month = monthEl ? monthEl.value : '';
        if (!month) return toast('Ay seçiniz', 'err');
        var date = new Date(month + "-01");
        var ayAd = date.toLocaleString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase();
        var records = payrollData[month] || {};

        var wb = { SheetNames: ["Bordro_" + month], Sheets: {} };
        var ws = {};
        var enc = XLSX.utils.encode_cell;

        // --- STYLES (Ultra Premium) ---
        var BDR = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        var sBanner = { font: { sz: 14, bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: '1A3560' } } };
        var sH = { font: { sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } }, border: BDR };
        var sD = { font: { sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: BDR };
        var sDLeft = { font: { sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' }, border: BDR };
        var sDTL = { font: { sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00" ₺"', border: BDR };
        var sDAsg = { font: { sz: 10, color: { rgb: '1E3A8A' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00" ₺"', fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } }, border: BDR };
        var sDGen = { font: { sz: 10, bold: true, color: { rgb: '14532D' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00" ₺"', fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } }, border: BDR };
        var sDTot = { font: { sz: 11, bold: true }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.00" ₺"', fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }, border: BDR };
        var sDesc = { font: { sz: 9, italic: true }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BDR };

        function put(r, c, v, t, s) {
            var ref = enc({ r: r, c: c });
            ws[ref] = { v: v, t: t || (typeof v === 'number' ? 'n' : 's'), s: s };
        }

        // Row 0: Banner
        var headerText = "ALİBEY LABORATUVAR — " + ayAd + " MAAŞ BORDROSU";
        put(0, 0, headerText, 's', sBanner);
        for(var i=1; i<15; i++) put(0, i, "", "s", sBanner);
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];

        // Row 2: Headers
        var heads = ["PERSONEL", "GÖREV", "MESLEK", "TC KİMLİK", "IBAN", "NET MAAŞ", "MESAI ₺", "KAROT ₺", "EK PRİM", "PRİM AÇIKLAMA", "AVANS", "KESİNTİ", "EKSİK GÜN (R)", "EKSİK GÜN (D)", "KESİNTİ TOPLAM", "ASGARİ PAYI", "KALAN PAYI", "GENEL TOPLAM"];
        heads.forEach((h, i) => put(2, i, h, 's', sH));

        var r = 3;
        var tNet=0, tMesai=0, tKarot=0, tEk=0, tAvans=0, tKes=0, tAsg=0, tKal=0, tTot=0;

        payrollRowsStaff().forEach(s => {
            var p = records[s.id] || {};
            var net = s.net;
            var mesH = parseFloat(p.mesaiH)||0, mesR = parseFloat(p.mesaiR)||0;
            var kT = parseFloat(p.karotT)||0, kP = parseFloat(p.karotP)||0;
            var ek = parseFloat(p.ekPrim)||0, avans = parseFloat(p.avans)||0, kes = parseFloat(p.kesinti)||0;
            var eksR = parseFloat(p.eksikR)||0, eksO = parseFloat(p.eksikO)||0;

            var mTot = mesH * mesR;
            var kTot = kT * kP;
            var eksikK = (eksR + eksO) * (net / 30);
            var kesTotal = avans + kes + eksikK;
            
            var gen = (net + mTot + kTot + ek) - kesTotal;
            var asg = Math.min(gen, ASGARI_UCRET), kal = Math.max(0, gen - asg);

            put(r, 0, s.ad, 's', sDLeft);
            put(r, 1, s.gorev || "", 's', sDLeft);
            put(r, 2, s.meslek || "", 's', sDLeft);
            put(r, 3, s.tc || "", 's', sD);
            put(r, 4, s.iban || "", 's', sD);
            put(r, 5, net, 'n', sDTL);
            put(r, 6, mTot, 'n', sDTL);
            put(r, 7, kTot, 'n', sDTL);
            put(r, 8, ek, 'n', sDTL);
            put(r, 9, p.primDesc || "", 's', sDesc);
            put(r, 10, avans, 'n', sDTL);
            put(r, 11, kes, 'n', sDTL);
            put(r, 12, eksR, 'n', sD);
            put(r, 13, eksO, 'n', sD);
            put(r, 14, kesTotal, 'n', sDTL);
            put(r, 15, asg, 'n', sDAsg);
            put(r, 16, kal, 'n', sDTL);
            put(r, 17, gen, 'n', sDGen);

            tNet+=net; tMesai+=mTot; tKarot+=kTot; tEk+=ek; tAvans+=avans; tKes+=kes; tAsg+=asg; tKal+=kal; tTot+=gen;
            r++;
        });

        // Totals Row
        put(r, 0, "GENEL TOPLAM", 's', sH);
        for(var i=1; i<5; i++) put(r, i, "", 's', sH);
        put(r, 5, tNet, 'n', sDTot);
        put(r, 6, tMesai, 'n', sDTot);
        put(r, 7, tKarot, 'n', sDTot);
        put(r, 8, tEk, 'n', sDTot);
        put(r, 9, "", 's', sDTot);
        put(r, 10, tAvans, 'n', sDTot);
        put(r, 11, tKes, 'n', sDTot);
        put(r, 12, "", 's', sDTot);
        put(r, 13, "", 's', sDTot);
        put(r, 14, "", 's', sDTot);
        put(r, 15, tAsg, 'n', sDTot);
        put(r, 16, tKal, 'n', sDTot);
        put(r, 17, tTot, 'n', sDTot);

        ws['!ref'] = "A1:R" + (r + 1);
        ws['!cols'] = [
            {wch:22}, {wch:18}, {wch:18}, {wch:14}, {wch:25}, {wch:11}, {wch:10}, {wch:10}, {wch:10}, {wch:20}, {wch:10}, {wch:10}, {wch:8}, {wch:8}, {wch:12}, {wch:12}, {wch:12}, {wch:14}
        ];

        wb.Sheets[wb.SheetNames[0]] = ws;
        XLSX.writeFile(wb, "Alibey_Maas_Bordrosu_" + month + ".xlsx");
        toast('Ultra Premium döküm hazır ✓', 'ok');
    }

    // Silinen firma adlarını session boyunca tut — polling ile geri gelmesin
    var _sfDeletedIds = {};

    function fbSaveSF(f) {
        var id = f.ad.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        fsSet('sf_firmalar', id, {
            ad: f.ad, ys: f.ys, logon: f.logon,
            beton: f.beton, celik: f.celik, karot: f.karot, pazar: f.pazar,
            pasif: !!(f.pasif)
        }).then(function () { setSyncStatus(true); });
    }

    function fbDeleteSF(ad) {
        var id = ad.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        addDeletedSF(ad); // localStorage'a kalıcı kaydet
        fsDel('sf_firmalar', id);
    }

    function fbPullSF() {
        // localStorage'dan önce yükle — her zaman görünsün (kara listedekileri çıkar)
        var locals = (lsGet('alibey_sf') || []).filter(function(f) { return f && !isDeletedSF(f.ad); });
        if (locals.length && !sfData.length) { sfData = locals; renderSF(); }

        // Firestore'daki kara listeyi de yükle (diğer cihazlardan gelen silmeler)
        return fsGetDoc('sys_config', 'deleted_sf_firms', function(data) {
            if (data && data.names) {
                Object.keys(data.names).forEach(function(k) { _sfDeletedNames[k] = true; });
                _saveSfDeletedStore();
            }
        }).catch(function(){}).then(function() { return fsGet('sf_firmalar'); }).then(function (rows) {
            var filtered = rows.filter(function (r) {
                if (isDeletedSF(r.ad)) {
                    var id = (r.ad || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
                    fsDel('sf_firmalar', id);
                    return false;
                }
                return true;
            }).map(function (r) {
                return { ad: r.ad, ys: r.ys, logon: r.logon, beton: r.beton, celik: r.celik, karot: r.karot, pazar: r.pazar, pasif: !!(r.pasif) };
            });

            if (filtered.length) {
                sfData = filtered;
                lsSet('alibey_sf', sfData);
                renderSF();
            } else {
                // Firestore boş ise lokal listeyi de boşalt (veya mevcut boş hali koru)
                sfData = [];
                lsSet('alibey_sf', sfData);
                renderSF();
            }
        }).catch(function (e) {
            console.warn('fbPullSF hata:', e);
        });
    }

    // ── LOGLAR ───────────────────────────────────────────────────────
    function fbPushLog(entry) {
        var id = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        fsSet('logs', id, { dt: entry.dt, u: entry.u, action: entry.action });
    }

    function fbPullLogs() {
        return fsGet('logs').then(function (rows) {
            if (!rows.length) return;
            actLogs = rows.sort(function (a, b) { return b.dt > a.dt ? 1 : -1; }).slice(0, 300);
            if (typeof renderLogs === 'function') renderLogs();
        });
    }

    // ── SÖZLEŞMELI FIRMALAR ──────────────────────────────────
    // ── TAM SYNC (sayfa açılışında) — sıralı okuma, tek sekme kilidi ─────
    var _SYNC_LOCK_KEY = 'alibey_sync_lock';
    var _SYNC_LOCK_TTL = 30000; // 30 saniye — sync max süresi
    var _syncBusy = false;

    function _acquireSyncLock() {
        if (_syncBusy) return false; // aynı sekmede zaten çalışıyor
        var now = Date.now();
        var lock = lsGet(_SYNC_LOCK_KEY);
        // Başka sekme/tarayıcı 30 saniye içinde sync yapıyorsa bekle
        if (lock && (now - lock) < _SYNC_LOCK_TTL) return false;
        _syncBusy = true;
        lsSet(_SYNC_LOCK_KEY, now);
        return true;
    }
    function _releaseSyncLock() {
        _syncBusy = false;
        localStorage.removeItem(_SYNC_LOCK_KEY);
    }
    // Sekme kapanınca veya refresh'te lock'u hemen bırak
    window.addEventListener('beforeunload', function () { localStorage.removeItem(_SYNC_LOCK_KEY); });

    function fbSaveApi(set) {
        fsSet('sys_config', 'api_settings', {
            smsVen: set.smsVen || 'netgsm',
            smsUser: set.smsUser || '',
            smsKey: set.smsKey || '',
            smsBas: set.smsBas || 'ALIBEYLAB',
            waVen: set.waVen || '',
            waKey: set.waKey || ''
        }).then(function () { setSyncStatus(true); });
    }

    function fbPullApi() {
        return fsGet('sys_config').then(function (rows) {
            var row = rows.filter(function (r) { return r._id === 'api_settings'; })[0];
            if (!row) return;
            var set = lsGet('alibey_api') || {};
            if (row.smsUser) set.smsUser = row.smsUser;
            if (row.smsKey) set.smsKey = row.smsKey;
            if (row.smsVen) set.smsVen = row.smsVen;
            if (row.smsBas) set.smsBas = row.smsBas;
            if (row.waVen) set.waVen = row.waVen;
            if (row.waKey) set.waKey = row.waKey;
            lsSet('alibey_api', set);
            loadApiSettings();
            if (typeof updateNetgsmBalance === 'function') updateNetgsmBalance();
        });
    }

    // ── ŞABLONLAR (Firestore) ──────────────────────────────────────────────────
    var _tpl = {}; // in-memory cache: { waDefault, waKargo, smsDefault, smsKargo }

    function fbSaveTemplates() {
        fsSet('sys_config', 'templates', {
            waDefault: _tpl.waDefault || '',
            waKargo: _tpl.waKargo || '',
            smsDefault: _tpl.smsDefault || '',
            smsKargo: _tpl.smsKargo || ''
        }).then(function () { setSyncStatus(true); });
    }

    function fbPullTemplates() {
        return fsGet('sys_config').then(function (rows) {
            var row = rows.filter(function (r) { return r._id === 'templates'; })[0];
            if (row) {
                _tpl.waDefault = row.waDefault || WA_DEF;
                _tpl.waKargo = row.waKargo || WA_KARGO;
                _tpl.smsDefault = row.smsDefault || SMS_DEF;
                _tpl.smsKargo = row.smsKargo || SMS_KARGO;
            } else {
                var waLs = localStorage.getItem('alibey_wa');
                var waKLs = localStorage.getItem('alibey_wa_kargo');
                var smsKLs = localStorage.getItem('alibey_sms_kargo');
                var smsLs = localStorage.getItem('alibey_sms');
                _tpl.waDefault = waLs || WA_DEF;
                _tpl.waKargo = waKLs || WA_KARGO;
                _tpl.smsKargo = smsKLs || SMS_KARGO;
                _tpl.smsDefault = smsLs || SMS_DEF;
                if (waLs || waKLs || smsKLs || smsLs) {
                    fbSaveTemplates();
                    ['alibey_wa', 'alibey_wa_kargo', 'alibey_sms_kargo', 'alibey_sms'].forEach(function (k) { localStorage.removeItem(k); });
                }
            }
            if (typeof loadSablon === 'function') loadSablon();
        });
    }

    // ── MESAJ LOGU (Firestore) ─────────────────────────────────────────────────
    function fbPushMsgLog(entry) {
        var id = entry.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 5));
        entry.id = id;
        fsSet('msg_log', id, {
            id: id, firma: entry.firma || '', belge: entry.belge || '',
            tur: entry.tur || 'SMS', tarih: entry.tarih || new Date().toISOString(),
            mesaj: entry.mesaj || '', msgTip: entry.msgTip || 'bakiye',
            tel: entry.tel || ''
        });
    }

    function fbPullMsgLog() {
        return fsGet('msg_log').then(function (rows) {
            if (!rows.length) return;
            msgLog = rows.sort(function (a, b) { return b.tarih > a.tarih ? 1 : -1; }).slice(0, 500);
            renderMsgLog();
        });
    }

    function fbClearMsgLog() {
        return fsGet('msg_log').then(function (rows) {
            rows.forEach(function (r, i) {
                setTimeout(function () { fsDel('msg_log', r._id); }, i * 150);
            });
            msgLog = [];
            renderMsgLog();
        });
    }

    // ── PHONEBOOK (Firestore) ──────────────────────────────────────────────────
    function fbSavePB(ka) {
        var entry = phoneBook[ka];
        if (!entry) return;
        return fsSet('sys_phonebook', ka, entry).then(function () { setSyncStatus(true); });
    }

    function fbDeletePB(ka) {
        var url = fsUrl('sys_phonebook', ka) + "?key=" + DB_KEY;
        return fetch(url, { method: "DELETE", headers: fsHeaders() });
    }

    function fbPullPhoneBook() {
        return fsGet('sys_phonebook').then(function (rows) {
            if (rows && rows.length > 0) {
                var newPB = {};
                rows.forEach(function (r) {
                    var id = r._id;
                    delete r._id;
                    newPB[id] = r;
                });
                phoneBook = newPB;
                lsSet('alibey_pb2', phoneBook);
                renderTelsEnhanced();
                _fillDataLists();
                console.log('Phonebook synchronized from Firestore.');
            } else if (Object.keys(phoneBook).length > 0) {
                fbExportAllPhoneBook();
            }
        });
    }

    var INITIAL_PHONEBOOK = {};

    function fbMigrateLocalToFirestore() {
        // ZOMBİ VERİ SORUNU (PL-V4): Bu fonksiyon devredışı bırakılmıştır.
        // Lokal hafızadan Firestore'a otomatik geri yükleme yapılmamalıdır.
        return;
    }

    function fbExportAllPhoneBook() {
        var keys = Object.keys(phoneBook);
        if (keys.length === 0) return;
        var p = [];
        keys.forEach(function (k) { p.push(fbSavePB(k)); });
        return Promise.all(p);
    }

    // in-memory log array (Firestore-backed)
    var actLogs = [];

    // ── TAM SYNC (sayfa açılışında) — sıralı okuma, 429'ı önler ──────
    // ── STARTUP MIGRATION: localStorage → Firestore (bir kez çalışır) ───────
    // SF, PR ve Orders için mevcut lokal veriyi Firestore'a push eder.
    // Koleksiyon doluysa hiçbir şey yapmaz (PULL sırasında zaten kontrol edilir).
    function fbMigrateLocalToFirestore() {
        // Sadece bir kez çalış — tekrar çalıştırma
        if (localStorage.getItem('alibey_migrated') === '1') return;

        var did = false;
        // 1. Sözleşmeli Firmalar
        var sfLocals = lsGet('alibey_sf') || [];
        if (sfLocals.length) {
            console.log('[Migrasyon] SF:', sfLocals.length, 'firma');
            sfLocals.forEach(function (f, i) {
                if (f && f.ad) setTimeout(function () { fbSaveSF(f); }, 500 + i * 400);
            });
            did = true;
        }
        // 2. Fiyat Teklifleri
        var prLocals = lsGet('alibey_pr') || [];
        if (prLocals.length) {
            console.log('[Migrasyon] PR:', prLocals.length, 'teklif');
            prLocals.forEach(function (p, i) {
                if (p && p.mu) setTimeout(function () { fbSavePR(p); }, 2000 + i * 400);
            });
            did = true;
        }
        // 3. Chip Siparişleri
        var ordLocals = lsGet('alibey_chip_orders') || [];
        if (ordLocals.length) {
            console.log('[Migrasyon] Orders:', ordLocals.length, 'sipariş');
            ordLocals.forEach(function (o, i) {
                if (o && o.firma) setTimeout(function () { fbSaveOrder(o); }, 3500 + i * 400);
            });
            did = true;
        }
        if (did) {
            // Migration tamamlandı bayrağını koy
            setTimeout(function () { localStorage.setItem('alibey_migrated', '1'); }, 5000);
        }
    }

    function fbSyncAll() {
        if (!_acquireSyncLock()) {
            console.log('Sync kilidi: başka bir sekme sync yapıyor, atlanıyor.');
            return;
        }
        setSyncBusy();
        fbPullChip().then(function () {
            _releaseSyncLock();
            setSyncStatus(true);
            // Ayarlar ve veriler — farklı instance / yeni cihazda da yüklensin
            setTimeout(fbPullApi, 800);
            setTimeout(fbPullTemplates, 1600);
            setTimeout(fbPullPR, 2400);
            setTimeout(fbPullOrders, 3200);
            setTimeout(fbPullStaff, 4000);
        }).catch(function () {
            _releaseSyncLock();
            setSyncStatus(false);
        });
    }

    // ── Realtime polling (10dk'da bir) — sıralı okuma ──────────────
    var _fbPollTimer = null;
    function startFbPolling() {
        if (_fbPollTimer) return;
        _fbPollTimer = setInterval(function () {
            if (!_acquireSyncLock()) return;
            fbPullChip()
                .then(function () { return new Promise(function (r) { setTimeout(r, 3000); }); })
                .then(fbPullOrders)
                .then(function () { return new Promise(function (r) { setTimeout(r, 3000); }); })
                .then(fbPullPR)
                .then(function () { return new Promise(function (r) { setTimeout(r, 3000); }); })
                .then(fbPullStaff)
                .then(function () {
                    var monthEl = document.getElementById('payrollMonth');
                    var m = monthEl ? monthEl.value : '';
                    if (m) return fbPullPayroll(m);
                })
                .then(_releaseSyncLock)
                .catch(_releaseSyncLock);
        }, 600000); // 10 dakika — 429 sınırını aşmamak için
    }




    function normalize(s) {
        return (s || '').toString().toUpperCase()
            .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
            .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
            .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
            // Harf+boşluk+rakam veya rakam+boşluk+harf gruplarını birleştir
            // Örnek: "MED 77" → "MED77", "3B İNŞ" → "3B INS"
            .replace(/([A-Z]+) (\d+)(?= |$)/g, '$1$2')
            .replace(/\b(\d+) ([A-Z])/g, '$1$2');
    }

    // Returns best kisaAd match score (0-1) for a long CSV firma name

    function matchScore(kisaAd, csvFirma) {
        var n1 = normalize(kisaAd);
        var n2 = normalize(csvFirma);
        // Exact
        if (n1 === n2) return 1.0;
        // n1 fully inside n2
        if (n2.indexOf(n1) >= 0) return 0.95;
        // n2 inside n1
        if (n1.indexOf(n2) >= 0) return 0.9;
        // Word overlap score
        var w1 = n1.split(' ').filter(function (w) {
            return w.length > 2;
        });
        var w2 = n2.split(' ').filter(function (w) {
            return w.length > 2;
        });
        if (!w1.length || !w2.length) return 0;
        var matched = 0;
        w1.forEach(function (w) {
            if (w2.indexOf(w) >= 0) matched++;
        });
        var score = matched / Math.max(w1.length, w2.length);
        // En az 2 kelime eşleştiyse skoru hafif yükselt (uzun firma adlarını yakala)
        if (matched >= 2 && score < 0.3) score += 0.1;
        return score;
    }

    // Find best kisaAd match from phoneBook for a given CSV firma name
    // Returns {kisaAd, score} or null

    function findBestMatch(csvFirma) {
        var best = null,
            bestScore = 0.3; // minimum threshold
        Object.keys(phoneBook).forEach(function (ka) {
            var score = matchScore(ka, csvFirma);
            if (score > bestScore) {
                bestScore = score;
                best = ka;
            }
        });
        return best ? {
            kisaAd: best,
            score: bestScore
        } : null;
    }

    // ═══════════════════════════════════════════════════════════
    // INIT PHONEBOOK from defaults (called once on first load)
    // ═══════════════════════════════════════════════════════════

    var PB_VERSION = 7; // Bu sayiyi artirinca eski cache sifirlanir

    function initPhoneBook() {
        var saved = lsGet('alibey_pb2', null);
        if (saved) {
            phoneBook = saved;
        } else if (typeof INITIAL_PHONEBOOK !== 'undefined' && Object.keys(INITIAL_PHONEBOOK).length > 0) {
            phoneBook = INITIAL_PHONEBOOK;
            savePB();
        } else {
            phoneBook = {};
        }

        // Firestore'dan güncel rehberi çek ve yerelle birleştir (master DB)
        fbSyncPhonebook();
    }

    function fbSyncPhonebook() {
        // ZOMBİ VERİ ENGELİ: Tekil master doküman kullanımı kaldırıldı.
        // Artık sadece fbPullPhoneBook (koleksiyon bazlı) kullanılıyor.
        fbPullPhoneBook();
    }

    function fbSavePhonebook(pb) {
        // Bu fonksiyon artık koleksiyon bazlı sisteme geçildiği için devre dışıdır.
        return;
    }

    function savePB() {
        lsSet('alibey_pb2', phoneBook);
        if (typeof _fillDataLists === 'function') _fillDataLists();
    }

    // PhoneBook → ChipData tel senkronizasyonu (fuzzy eşleşme)
    // ChipData'daki tel boş kayıtları phoneBook'tan doldurur
    function syncChipTelFromPB() {
        var degisti = false;
        // phoneBook'tan belge→tel ve fuzzy-firma→tel haritaları oluştur
        var belgeMap = {}, firmaMap = {};
        Object.keys(phoneBook).forEach(function(ka) {
            var pb = phoneBook[ka];
            if (!pb.tel) return;
            var pb_b = (pb.belge || '').replace(/\D/g, '').replace(/^0+/, '');
            if (pb_b) belgeMap[pb_b] = pb.tel;
            firmaMap[normalize(ka)] = pb.tel;
        });
        chipData.forEach(function(cd) {
            if (cd.tel) return;
            // 1. Belge eşleşmesi
            var cdB = (cd.belge || '').replace(/\D/g, '').replace(/^0+/, '');
            if (cdB && belgeMap[cdB]) { cd.tel = belgeMap[cdB]; degisti = true; return; }
            // 2. Fuzzy firma eşleşmesi
            var nCd = normalize(cd.firma || '');
            if (!nCd) return;
            Object.keys(firmaMap).forEach(function(nPb) {
                if (cd.tel) return;
                if (nPb && (nCd.indexOf(nPb) >= 0 || nPb.indexOf(nCd) >= 0)) {
                    cd.tel = firmaMap[nPb];
                    degisti = true;
                }
            });
        });
        if (degisti) lsSet('alibey_chip', { data: chipData, pb: phoneBook });
        return degisti;
    }

    function savePB_Quiet() {
        lsSet('alibey_pb2', phoneBook);
        if (typeof _fillDataLists === 'function') _fillDataLists();
    }

    function msgBadge(belge, firma) {
        var entry = msgLog.find(function (e) { return e.belge === belge && e.firma === firma; });
        if (!entry) return '';
        var d = new Date(entry.tarih);
        var diff = (Date.now() - d.getTime()) / 86400000;
        var days = Math.floor(diff);
        // Renk: son 3 gün yeşil, daha eski gri
        var cl = days <= 3 ? 'color:#22C55E' : 'color:#6B7280';
        // Format: 27 Mar 13:42
        var ay = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];
        var saat = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
        var tarihTxt = d.getDate() + ' ' + ay + ' ' + saat;
        return '<div style="font-size:9px;' + cl + ';margin-top:1px">✉ ' + tarihTxt + '</div>';
    }

    // Belge no üzerinden chipData firma adlarını phoneBook ile senkronize et
    // Ayrıca MÜT No'su firma adı olarak kaydedilmiş girişleri düzeltir (MONTSA gibi)
    function fixChipFirmaNames(saveToFirebase) {
        // belge → kisaAd haritası (INITIAL_PHONEBOOK'tan)
        var belgeMap = {};
        Object.keys(phoneBook).forEach(function (ka) {
            var b = (phoneBook[ka].belge || '').replace(/\D/g, '').replace(/^0+/, '');
            if (b) belgeMap[b] = ka;
        });

        // 1) Firma adı yanlış olanları düzelt
        var fixedEntries = [];
        chipData.forEach(function (d) {
            var normB = (d.belge || '').replace(/\D/g, '').replace(/^0+/, '');
            // Firma alanı tamamen sayısal mı? (MÜT no olarak kaydedilmiş olabilir)
            var firmaStr = (d.firma || '').trim();
            var normFirma = /^\d+$/.test(firmaStr) ? firmaStr.replace(/^0+/, '') : '';

            // Önce belge no ile bak, bulamazsan firma alanını belge no gibi dene
            var ka = (normB && belgeMap[normB]) || (normFirma && belgeMap[normFirma]);

            if (ka && d.firma !== ka) {
                // Belge alanı boşsa ama firma alanı belge nuydu → belge'yi de düzelt
                if (!d.belge && normFirma) d.belge = firmaStr;
                d.firma = ka;
                if (!d.tel && phoneBook[ka] && phoneBook[ka].tel) d.tel = phoneBook[ka].tel;
                fixedEntries.push(d);
            }
        });

        // 2) Belge no bazlı tekrar eden girişleri temizle
        var seen = {};
        chipData = chipData.filter(function (d) {
            var normB = (d.belge || '').replace(/\D/g, '').replace(/^0+/, '');
            var key = normB ? ('b_' + normB) : ('f_' + d.firma);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });

        // 3) Düzeltilen girişleri Firebase'e kaydet (staggered)
        if (saveToFirebase && fixedEntries.length > 0) {
            console.log('fixChipFirmaNames: ' + fixedEntries.length + ' giriş düzeltildi (MÜT→isim), Firebase güncelleniyor');
            fixedEntries.forEach(function (d, i) {
                setTimeout(function () { fbSaveChip(d); }, 1000 + i * 400);
            });
        }

        return fixedEntries.length;
    }

    function resetPhoneBook() {
        if (!confirm('Telefon rehberi veritabanından (Firestore) tekrar çekilecek. Emin misiniz?')) return;
        fbSyncPhonebook();
        toast('Rehber güncelleniyor...', 'info');
    }

    // ═══════════════════════════════════════════════════════════
    // ENHANCED parseCSV — auto-match CSV firms to phoneBook
    // ═══════════════════════════════════════════════════════════

    function parseCSVEnhanced(text, fname) {
        var clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        var lines = clean.split('\n').filter(function (l) {
            return l.trim();
        });
        if (lines.length < 2) {
            toast('CSV boş', 'err');
            return;
        }
        var sep = lines[0].indexOf(';') >= 0 ? ';' : ',';

        function pr(l) {
            var p = [],
                c = '',
                q = false;
            for (var i = 0; i < l.length; i++) {
                var ch = l[i];
                if (ch === '"') q = !q;
                else if (ch === sep && !q) {
                    p.push(c.trim().replace(/^"|"$/g, ''));
                    c = '';
                } else c += ch;
            }
            p.push(c.trim().replace(/^"|"$/g, ''));
            return p;
        }

        var hdr = pr(lines[0]).map(function (h) {
            return h.toLowerCase().replace(/\s+/g, '');
        });
        var cF = -1,
            cB = -1,
            cT = -1,
            cK = -1,
            cKl = -1;
        hdr.forEach(function (h, i) {
            if (h.indexOf('müteahhit') >= 0 && h.indexOf('firma') >= 0) cF = i;
            else if (h.indexOf('belge') >= 0) cB = i;
            else if (h.indexOf('toplam') >= 0) cT = i;
            else if (h.indexOf('kullan') >= 0) cK = i;
            else if (h.indexOf('kalan') >= 0) cKl = i;
        });
        if (cF < 0 || cB < 0 || cKl < 0) {
            toast('CSV kolon yapısı tanınamadı', 'err');
            return;
        }

        var nd = [];
        var autoMatched = 0,
            notMatched = 0;

        // "Talep Eden Kurum" kolonunu bul (yapı denetim firmalar için)
        var cKurum = -1;
        hdr.forEach(function (h, i) {
            if (h.indexOf('talep') >= 0) cKurum = i;
        });

        for (var i = 1; i < lines.length; i++) {
            var row = pr(lines[i]);
            if (row.length < 3) continue;
            var csvFirma = row[cF] || '';
            // Belge no: sadece rakamlar, başındaki sıfırları temizle (normalize)
            var belge = (row[cB] || '').replace(/\D/g, '').replace(/^0+/, '');
            var top = parseInt(row[cT]) || 0;
            var kul = parseInt(row[cK]) || 0;
            var kal = parseInt(row[cKl]) || 0;

            // Belirtilmemiş satırı: müteahhit yok ama Talep Eden = yapı denetim firması
            if (csvFirma === 'Belirtilmemiş' || !csvFirma) {
                var kurum = cKurum >= 0 ? (row[cKurum] || '').trim() : '';
                if (!kurum) continue;
                // Yapı denetim firmasını PhoneBook'tan kısa adıyla bul
                var ydKisaAd = kurum;
                Object.keys(phoneBook).forEach(function (ka) {
                    var nka = normalize(ka);
                    var nkurum = normalize(kurum);
                    if (nkurum.indexOf(nka) >= 0 || nka.indexOf(nkurum) >= 0) ydKisaAd = ka;
                });
                // Aynı firma daha önce eklendiyse bakiyeleri topla
                var ydExisting = null;
                for (var di = 0; di < nd.length; di++) {
                    if (nd[di].firma === ydKisaAd) { ydExisting = nd[di]; break; }
                }
                if (ydExisting) {
                    ydExisting.top += top; ydExisting.kul += kul; ydExisting.kal += kal;
                } else {
                    var ydTel = (phoneBook[ydKisaAd] || {}).tel || '';
                    nd.push({ firma: ydKisaAd, csvFirma: kurum, belge: '', top: top, kul: kul, kal: kal, tel: ydTel, dt: '' });
                    if (!phoneBook[ydKisaAd]) {
                        phoneBook[ydKisaAd] = { kisaAd: ydKisaAd, tel: '', belge: '' };
                        savePB();
                    }
                }
                continue;
            }

            if (!belge) continue;

            // Aynı belge no zaten eklendiyse satırları birleştir (duplicate engel)
            var existingRow = null;
            for (var di = 0; di < nd.length; di++) {
                if (nd[di].belge === belge) { existingRow = nd[di]; break; }
            }
            if (existingRow) {
                existingRow.top += top;
                existingRow.kul += kul;
                existingRow.kal += kal;
                continue;
            }

            // Try to find existing phoneBook entry by belge number (most reliable)
            var kisaAd = '';
            var tel = '';
            var matchedByBelge = false;

            // Search by belge no first — normalize stored belge too
            Object.keys(phoneBook).forEach(function (ka) {
                var pbBelge = (phoneBook[ka].belge || '').replace(/\D/g, '').replace(/^0+/, '');
                if (pbBelge && pbBelge === belge) {
                    kisaAd = ka;
                    tel = phoneBook[ka].tel || '';
                    matchedByBelge = true;
                }
            });

            // Belge no ile eşleşmediyse: CSV adıyla direkt ekle, phoneBook'a belge bağla
            if (!matchedByBelge) {
                // Önce phoneBook'ta bu belge no'suz ama bu firma adına yakın kayıt var mı?
                // FUZZY YOK — sadece belge no güvenilir. CSV adıyla ekle.
                kisaAd = csvFirma;
                tel = (phoneBook[csvFirma] || {}).tel || '';
                // Bu belge no'yu phoneBook'a kaydet (sonraki yüklemelerde belge ile bulunur)
                if (!phoneBook[csvFirma]) {
                    phoneBook[csvFirma] = { kisaAd: csvFirma, tel: '', belge: belge, dt: '' };
                } else {
                    if (!phoneBook[csvFirma].belge) phoneBook[csvFirma].belge = belge;
                }
                savePB();
                notMatched++;
            }

            nd.push({
                firma: kisaAd || csvFirma,
                csvFirma: csvFirma,
                belge: belge,
                top: top,
                kul: kul,
                kal: kal,
                tel: normalizeTel(tel),
                dt: (phoneBook[kisaAd] || {}).dt || ''
            });
        }

        chipData = nd;
        lsSet('alibey_chip', {
            data: chipData,
            pb: phoneBook
        });
        fbSaveAllChip();
        updateChipStats();
        renderChip();

        var cuz = document.getElementById('chipUZ');
        if (cuz) {
            cuz.classList.add('ok');
            cuz.innerHTML = '<div class="fr"><div class="fic">✅</div><div>' +
                '<div class="fn2">' + fname + '</div>' +
                '<div class="fm2">' + nd.length + ' firma · ' +
                nd.filter(function (d) {
                    return d.kal < 50;
                }).length + ' kritik · ' +
                autoMatched + ' otomatik eşleşti</div>' +
                '</div></div>';
        }

        var totalRows = lines.length - 1;
        var msg = nd.length + ' firma yüklendi';
        if (totalRows > nd.length) {
            var diff = totalRows - nd.length;
            msg += ' (' + diff + ' satır birleştirildi)';
        }
        if (autoMatched) msg += ' · ' + autoMatched + ' eşleşti';
        if (notMatched) msg += ' · ' + notMatched + ' yeni';
        toast(msg, 'ok');
        chipTab('izle');
    }

    // ═══════════════════════════════════════════════════════════
    // ÇİP SİPARİŞ TAKİP
    // Sipariş verildiğinde: firma adı, adet, tarih kaydet
    // ═══════════════════════════════════════════════════════════
    var chipOrders = [];


    // ── ÇİP SİPARİŞ TAKİP ────────────────────────────────────────────────────
    function saveChipOrders() {
        // Sadece Firestore'a kaydediliyor — localStorage yok
    }

    function saveChipOrder() {
        var firma = (document.getElementById('coFirma') || { value: '' }).value.trim();
        var adet = parseInt((document.getElementById('coAdet') || { value: '0' }).value) || 0;
        var tarih = (document.getElementById('coTarih') || { value: '' }).value;
        var not_ = (document.getElementById('coNot') || { value: '' }).value.trim();
        var belge = (document.getElementById('coBelge') || { value: '' }).value.trim();
        var siparisNo = (document.getElementById('coSiparisNo') || { value: '' }).value.trim();
        var tel = normalizeTel((document.getElementById('coTel') || { value: '' }).value.trim());
        if (!firma) { toast('Firma adı zorunlu', 'err'); return; }
        if (!adet) { toast('Adet girin', 'err'); return; }
        if (!tarih) { toast('Tarih seçin', 'err'); return; }

        var id = Date.now();
        var o = { id: id, firma: firma, belge: belge, siparisNo: siparisNo, tel: tel, adet: adet, tarih: tarih, not: not_, durum: 'verildi' };
        chipOrders.push(o);
        saveChipOrders();
        fbSaveOrder(o);

        // OTOMATİK REHBER (PHONEBOOK) GÜNCELLEME
        var ka = firma || belge;
        if (!phoneBook[ka]) {
            phoneBook[ka] = { kisaAd: ka, tel: tel, belge: belge, dt: new Date().toLocaleDateString('tr-TR') };
            savePB();
        } else {
            var updated = false;
            if (tel && !phoneBook[ka].tel) { phoneBook[ka].tel = tel; updated = true; }
            if (belge && !phoneBook[ka].belge) { phoneBook[ka].belge = belge; updated = true; }
            if (updated) savePB();
        }

        // İZLEME SAYFASINA ANINDA YANSIT — chipData'daki eşleşen kayıtların tel'ini güncelle
        if (tel) {
            var cleanBelge = belge.replace(/\D/g, '').replace(/^0+/, '');
            var nFirmaOrd = normalize(firma);
            var chipGuncellendi = false;
            chipData.forEach(function(cd) {
                if (cd.tel) return; // zaten numarası var
                // Belge no eşleşmesi
                var cdBelge = (cd.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                if (cleanBelge && cdBelge && cdBelge === cleanBelge) { cd.tel = tel; chipGuncellendi = true; return; }
                // Fuzzy firma eşleşmesi
                var nCd = normalize(cd.firma || '');
                if (nCd && (nFirmaOrd.indexOf(nCd) >= 0 || nCd.indexOf(nFirmaOrd) >= 0)) { cd.tel = tel; chipGuncellendi = true; }
            });
            if (chipGuncellendi) {
                lsSet('alibey_chip', { data: chipData, pb: phoneBook });
                renderChip();
            }
        }

        clearChipOrderForm();
        renderChipOrders();
        toast('Sipariş kaydedildi ve rehber kontrol edildi ✓', 'ok');
    }

    function setOrderDurum(id, durum) {
        var o = chipOrders.filter(function (x) { return x.id === id; })[0];
        if (!o) return;
        o.durum = durum;
        saveChipOrders();
        fbSaveOrder(o);
        renderChipOrders();
        toast('Güncellendi', 'ok');

        // Kargo teslim edildi → SADECE mevcut chipData'da olan firma güncellenir
        // CSV'de olmayan firma buraya eklenmez
        if (durum === 'teslim' && o.firma) {
            var normB = (o.belge || '').replace(/\D/g, '').replace(/^0+/, '');
            var existing = chipData.find(function (d) {
                var db = (d.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                return d.firma === o.firma || (normB && db === normB);
            });
            if (!existing) {
                // CSV'de yok — izlemeye ekleme, sadece uyar
                toast('⚠️ ' + o.firma + ' çip izlemede kayıtlı değil (CSV yükle)', 'err');
            } else {
                // Varsa telefonu ve adet bilgisini güncelle
                if (o.tel && !existing.tel) {
                    existing.tel = o.tel;
                    fbSaveChip(existing);
                }
                // Teslim edilen adet eklendi mi diye sor
                lsSet('alibey_chip', { data: chipData, pb: phoneBook });
                renderChip(); updateChipStats();
                toast('→ ' + o.firma + ' güncellendi (adet CSV’dan gelir)', 'ok');
            }
        }
    }


    function deleteOrder(id) {
        var _delO = chipOrders.filter(function (x) { return x.id === id; })[0];
        chipOrders = chipOrders.filter(function (x) { return x.id !== id; });
        saveChipOrders();
        if (_delO) fbDeleteOrder(_delO);
        renderChipOrders();
        toast('Silindi', 'info');
    }

    function clearChipOrderForm() {
        ['coFirma', 'coAdet', 'coNot', 'coBelge', 'coSiparisNo', 'coTel'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.value = '';
        });
        var td = document.getElementById('coTarih');
        if (td) td.value = new Date().toISOString().split('T')[0];
    }

    function renderChipOrders() {
        var tb = document.getElementById('chipOrderList');
        if (!tb) return;
        var q = ((document.getElementById('coSearch') || {}).value || '').toLowerCase();
        var fl = (document.getElementById('coFilt') || {}).value || 'all';
        var rows = (chipOrders || []).filter(function (o) {
            if (q && o.firma.toLowerCase().indexOf(q) < 0) return false;
            if (fl !== 'all' && o.durum !== fl) return false;
            return true;
        }).slice().reverse();
        if (!rows.length) {
            tb.innerHTML = '<tr><td colspan="10" class="empty" style="padding:20px"><div class="empty-ic">📦</div><div>Sipariş kaydı yok</div></td></tr>';
            coUpdateBulkBar();
            return;
        }
        tb.innerHTML = rows.map(function (o) {
            var dc = o.durum === 'teslim' ? 'b-ok' : 'b-w';
            var dt = o.durum === 'teslim' ? '✅ Teslim' : '⏳ Verildi';
            return '<tr>' +
                '<td style="width:28px"><input type="checkbox" class="co-chk" data-id="' + o.id + '" onchange="coUpdateBulkBar()"></td>' +
                '<td style="color:var(--tx);font-weight:600">' + o.firma + '</td>' +
                '<td style="font-family:var(--fm);font-size:10px;color:var(--tx3)">' + (o.belge || '—') + '</td>' +
                '<td style="font-family:var(--fm);font-size:10px;color:var(--tx3)">' + (o.siparisNo || '—') + '</td>' +
                '<td style="font-family:var(--fm);font-weight:700;color:var(--acc2)">' + o.adet.toLocaleString('tr-TR') + '</td>' +
                '<td style="color:var(--tx3)">' + fmtDate(o.tarih) + '</td>' +
                '<td style="font-family:var(--fm);font-size:10px">' + (o.tel || '—') + '</td>' +
                '<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx2)" title="' + (o.not || '') + '">' + (o.not || '—') + '</td>' +
                '<td><span class="bx ' + dc + '">' + dt + '</span></td>' +
                '<td><div style="display:flex;gap:4px">' +
                (o.tel ? '<button class="btn btn-g" style="padding:3px 7px;font-size:10px;background:var(--acc2-d);color:var(--acc2)" onclick="sendOrderCargoSms(' + o.id + ')" title="Kargo Geldi Bildir">📨 Kargo</button>' : '') +
                (o.durum !== 'teslim' ? '<button class="btn btn-g" style="padding:3px 7px;font-size:10px;background:var(--grn-d);color:var(--grn)" onclick="setOrderDurum(' + o.id + ',\'teslim\')">✅</button>' : '') +
                '<button class="btn btn-g" style="padding:3px 7px;font-size:10px;color:var(--red)" onclick="deleteOrder(' + o.id + ')">🗑</button>' +
                '</div></td>' +
                '</tr>';
        }).join('');
        coUpdateBulkBar();
    }

    function coGetSelected() {
        return Array.from(document.querySelectorAll('.co-chk:checked')).map(function (c) { return Number(c.dataset.id); });
    }
    function coUpdateBulkBar() {
        var sel = coGetSelected();
        var bar = document.getElementById('coBulkBar');
        var cnt = document.getElementById('coSelCount');
        if (bar) bar.style.display = sel.length > 0 ? 'flex' : 'none';
        if (cnt) cnt.textContent = sel.length + ' seçili';
        var allChk = document.getElementById('coChkAll');
        if (allChk) {
            var all = document.querySelectorAll('.co-chk');
            allChk.checked = all.length > 0 && sel.length === all.length;
            allChk.indeterminate = sel.length > 0 && sel.length < all.length;
        }
    }
    function coToggleAll(checked) {
        document.querySelectorAll('.co-chk').forEach(function (c) { c.checked = checked; });
        coUpdateBulkBar();
    }
    function coClearSel() {
        document.querySelectorAll('.co-chk').forEach(function (c) { c.checked = false; });
        coUpdateBulkBar();
    }
    function coBulkDelete() {
        var ids = coGetSelected();
        if (!ids.length) return;
        if (!confirm(ids.length + ' kaydı silmek istediğinize emin misiniz?')) return;
        ids.forEach(function (id) {
            var o = chipOrders.find(function (x) { return x.id === id; });
            if (o) { fbDeleteOrder(o); }
            chipOrders = chipOrders.filter(function (x) { return x.id !== id; });
        });
        renderChipOrders();
        toast(ids.length + ' kayıt silindi', 'ok');
    }
    function coBulkPassive() {
        var ids = coGetSelected();
        if (!ids.length) return;
        ids.forEach(function (id) {
            var o = chipOrders.find(function (x) { return x.id === id; });
            if (o && o.durum !== 'teslim') {
                o.durum = 'teslim';
                fbSaveOrder(o);
            }
        });
        renderChipOrders();
        toast(ids.length + ' kayıt teslim edildi olarak işaretlendi', 'ok');
    }

    function sendOrderCargoSms(id) {
        var o = chipOrders.filter(function (x) { return x.id === id; })[0];
        if (!o || !o.tel) { toast('Telefon numarası yok', 'err'); return; }

        var pInfo = phoneBook[o.belge] || phoneBook[o.firma] || {};
        var checkSms = chipData.find(function (x) { return x.belge === o.belge; }) || {};
        if (checkSms.smsOff || pInfo.smsOff) {
            toast('Bu firma SMS İstemiyor (SMS Kapalı)', 'err');
            return;
        }

        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) { toast('Ayarlar > SMS API bilgilerini girin', 'err'); return; }
        // fillTpl uses {FIRMA_ADI}, {BELGE_NO}, {ADET}
        var mapped = { firma: o.firma, belge: o.belge, top: o.adet || 0, kul: 0, kal: o.adet || 0 };
        var msg = fillTpl(_tpl.smsKargo || SMS_KARGO, mapped);
        toast('Kargo mesajı gönderiliyor...', 'info');
        _doSendSms(o.tel, msg, api, function (ok, msgid) {
            if (ok) {
                addMsgLog(o.firma, o.belge, 'SMS', msg, 'kargo', msgid);
                toast('Kargo mesajı gönderildi ✓', 'ok');
                logAction('Kargo mesajı gönderdi: ' + o.firma);
                // Mark as delivered automatically if you want, or keep separate
            } else {
                toast('Mesaj gönderilemedi', 'err');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // PHONE BOOK RENDER (enhanced — shows kisa ad + CSV firma)
    // ═══════════════════════════════════════════════════════════

    var telPage = 1;
    var TEL_PER_PAGE = 50;

    function exportChipCsv() {
        var csv = "sep=;\nFirma;BelgeNo;Toplam;Kullanılan;Kalan\n";
        chipData.forEach(function (d) {
            csv += [d.firma, d.belge, d.top, d.kul, d.kal].join(';') + "\n";
        });
        var b = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        var u = URL.createObjectURL(b);
        var a = document.createElement("a");
        a.href = u;
        a.setAttribute("download", "alibey_cip_takip_" + new Date().toISOString().slice(0, 10) + ".csv");
        a.click();
    }

    function pbSelectAll(el) {
        document.querySelectorAll('.pbChk').forEach(c => c.checked = el.checked);
        pbChkChange();
    }

    function renderTelsEnhanced() {
        var tb = document.getElementById('telBody');
        var pager = document.getElementById('telPager');
        if (!tb) return;

        var q = ((document.getElementById('pbSearch') || {}).value || '').toLowerCase();
        var fil = ((document.getElementById('pbFilter') || {}).value || 'all');

        // Duplicate tel tespiti
        var telCount = {};
        Object.keys(phoneBook).forEach(function (ka) {
            var t = (phoneBook[ka].tel || '').trim();
            if (t) telCount[t] = (telCount[t] || 0) + 1;
        });

        var entries = Object.keys(phoneBook).filter(function (ka) {
            var e = phoneBook[ka];
            var tel = (e.tel || '').trim();
            var isDup = tel && telCount[tel] > 1;
            if (fil === 'tel' && !tel) return false;
            if (fil === 'notel' && tel) return false;
            if (fil === 'dup' && !isDup) return false;
            if (!q) return true;
            return ka.toLowerCase().indexOf(q) >= 0 || tel.indexOf(q) >= 0;
        }).sort(function (a, b) { return a.localeCompare(b, 'tr'); });

        if (!entries.length) {
            tb.innerHTML = '<tr><td colspan="7" class="empty" style="padding:12px">Kayıt yok</td></tr>';
            if (pager) pager.innerHTML = '';
            return;
        }

        // Sayfalama
        var totalPages = Math.ceil(entries.length / TEL_PER_PAGE);
        if (telPage > totalPages) telPage = totalPages;
        var start = (telPage - 1) * TEL_PER_PAGE;
        var pageEntries = entries.slice(start, start + TEL_PER_PAGE);

        tb.innerHTML = pageEntries.map(function (ka) {
            var e = phoneBook[ka];
            var tel = (e.tel || '').trim();
            var isDup = tel && telCount[tel] > 1;
            var safeKa = ka.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            var belgeDisp = e.belge
                ? '<span style="font-family:var(--fm);font-size:9px;color:var(--tx3)">' + e.belge + '</span>'
                : '<span style="color:var(--tx3);font-size:10px">—</span>';
            var rowBg = isDup ? 'background:rgba(251,191,36,.07);' : '';
            var dupBadge = isDup ? ' <span style="background:#f59e0b22;color:#f59e0b;border-radius:4px;padding:0 5px;font-size:9px;font-weight:700">DUP</span>' : '';
            return '<tr style="' + rowBg + '">' +
                '<td><input type="checkbox" class="pbChk" data-ka="' + safeKa + '" onchange="pbChkChange()"></td>' +
                '<td style="color:var(--tx);font-weight:600">' + ka + dupBadge + '</td>' +
                '<td>' + belgeDisp + '</td>' +
                '<td style="font-family:var(--fm);color:var(--acc2)">' + (tel ? '<a href="https://wa.me/90' + tel.replace(/\D/g, '') + '" target="_blank" style="color:var(--acc2);text-decoration:none">' + tel + '</a>' : '<span style="color:var(--tx3)">—</span>') + '</td>' +
                '<td style="font-size:10px;color:var(--tx3)">' + (e.dt || '') + '</td>' +
                '<td><div style="display:flex;gap:4px;align-items:center">' +
                '<input class="fi" type="tel" id="pbt_' + safeKa + '" placeholder="05XX..." value="' + (e.tel || '') + '" style="padding:4px 8px;font-size:11px;width:120px" onkeydown="if(event.key===\'Enter\')savePBTelBtn(\'' + safeKa + '\')">' +
                '<button class="btn btn-g" style="padding:3px 8px;font-size:10px;background:var(--grn-d);color:var(--grn)" onclick="savePBTelBtn(\'' + safeKa + '\')">✓</button>' +
                '</div></td>' +
                '<td><button class="btn btn-g" style="padding:3px 7px;font-size:10px;color:var(--red)" onclick="delPBEntry(\'' + safeKa + '\')">Sil</button></td>' +
                '</tr>';
        }).join('');

        // Pager
        if (pager) {
            if (totalPages <= 1) { pager.innerHTML = ''; return; }
            var btns = '';
            for (var i = 1; i <= totalPages; i++) {
                var active = i === telPage ? 'background:var(--acc);color:#fff;' : '';
                btns += '<button class="btn btn-o" style="padding:3px 10px;font-size:11px;min-width:32px;' + active + '" onclick="telPage=' + i + ';renderTelsEnhanced()">' + i + '</button>';
            }
            pager.innerHTML = btns;
        }
    }

    function pbChkChange() {
        var btn = document.getElementById('pbBulkDelBtn');
        if (!btn) return;
        var checked = document.querySelectorAll('.pbChk:checked').length;
        btn.style.display = checked > 0 ? '' : 'none';
        btn.textContent = '🗑 Seçilenleri Sil (' + checked + ')';
        var all = document.getElementById('pbChkAll');
        if (all) {
            var total = document.querySelectorAll('.pbChk').length;
            all.indeterminate = checked > 0 && checked < total;
            all.checked = checked === total && total > 0;
        }
    }

    function pbSelectAll(chk) {
        document.querySelectorAll('.pbChk').forEach(function (c) { c.checked = chk.checked; });
        pbChkChange();
    }

    function bulkDeletePB() {
        var keys = [];
        document.querySelectorAll('.pbChk:checked').forEach(function (c) { keys.push(c.dataset.ka); });
        if (!keys.length) return;
        showConfirm('Toplu Sil', keys.length + ' kayıt silinsin mi?', function () {
            keys.forEach(function (ka) { if (phoneBook[ka]) { delete phoneBook[ka]; } });
            savePB();
            logAction('Toplu tel silme', keys.length + ' kayıt silindi');
            toast(keys.length + ' kayıt silindi', 'ok');
            renderTelsEnhanced();
        });
    }

    function savePBTelBtn(ka) {
        var inp = document.getElementById('pbt_' + ka);
        if (!inp) return;
        updatePBTel(ka, inp.value);
        inp.style.borderColor = 'var(--grn)';
        setTimeout(function () { if (inp) inp.style.borderColor = ''; }, 1500);
    }


    var _pbTelTimer = null;
    function updatePBTel(ka, tel) {
        if (!phoneBook[ka]) return;
        var normalized = normalizeTel(tel.trim());
        phoneBook[ka].tel = normalized;
        phoneBook[ka].dt = new Date().toLocaleDateString('tr-TR');
        savePB();

        // chipData'yı güncelle (yerel, hızlı)
        chipData.forEach(function (d) {
            if (d.firma === ka || d.belge === (phoneBook[ka].belge || '')) {
                d.tel = normalized;
            }
        });
        lsSet('alibey_chip', { data: chipData, pb: phoneBook });
        updateChipStats();
        renderChip(); // çip listesini güncelle
        toast('Telefon güncellendi ✓', 'ok');
        logAction('Telefon güncelledi: ' + ka + ' → ' + normalized);

        // Firebase yazımını debounce ile yap (burst koruması)
        if (_pbTelTimer) clearTimeout(_pbTelTimer);
        _pbTelTimer = setTimeout(function () {
            var pb = phoneBook[ka];
            var saved = false;
            // chipData kaydı varsa onu güncelle
            chipData.forEach(function (d) {
                if (d.firma === ka || (pb && pb.belge && d.belge === pb.belge)) {
                    d.tel = normalized;
                    fbSaveChip(d);
                    saved = true;
                }
            });
            // chipData'da kaydı olmayan firmalar için de Firebase'e yaz
            if (!saved && pb) {
                var id = ((pb.belge || ka).replace(/[^a-zA-Z0-9_\-]/g, '_'));
                fsSet('chip_data', id, {
                    firma: ka, belge: pb.belge || '', tel: normalized,
                    top: 0, kul: 0, kal: 0, pasif: false, dt: pb.dt || ''
                });
            }
            setSyncStatus(true);
        }, 600);
    }

    function delPBEntry(ka) {
        if (!phoneBook[ka]) return;
        showConfirm('Silme Onayı', ka + ' rehberden silinecek?', function () {
            delete phoneBook[ka];
            fbDeletePB(ka); // Veritabanından koleksiyon dokümanını kaldır
            savePB(); // Yerel hafızayı güncelle
            renderTelsEnhanced();
            _fillDataLists();
            toast('Rehberden silindi', 'info');
        });
    }

    function addNewPBEntry() {
        var ka = document.getElementById('pbNewAd').value.trim();
        var tel = document.getElementById('pbNewTel').value.trim();
        if (!ka) {
            toast('Firma adı zorunlu', 'err');
            return;
        }
        phoneBook[ka] = {
            kisaAd: ka,
            tel: tel,
            belge: '',
            dt: new Date().toLocaleDateString('tr-TR')
        };
        savePB();
        document.getElementById('pbNewAd').value = '';
        document.getElementById('pbNewTel').value = '';
        renderTelsEnhanced();
        toast('Eklendi ✓', 'ok');
    }



    // ── STATE ──
    var allData = [],
        owners = [],
        selectedOwners = {},
        activeTip = 'ALL',
        filteredData = [],
        currentNav = 1;
    var chipData = [],
        phoneBook = {},
        waQueue = [],
        waIdx = 0,
        waItem = null,
        editingPBKey = null;
    var WA_DEF = 'Sayın {FIRMA_ADI}, {BELGE_NO} no’lu belgenize ait EBİS beton etiketi çip bakiyesi kritik seviyeye düşmüştür. Toplam: {TOPLAM}, Kullanılan: {KULLANILAN}, Kalan: {KALAN}. Hizmetlerde aksama yaşanmaması için en kısa sürede çip tedariki yapmanız rica olunur. Mevcut çiplerinizin yeterliliğini kontrol etmek veya bu mesajı tekrar almak istemiyorsanız +905333402577 ile iletişime geçebilirsiniz. Alibey Beton Çelik Analiz ve Kentsel Dönüşüm Laboratuvarı';
    var WA_KARGO = 'Sayın {FIRMA_ADI}, {BELGE_NO} no’lu belgenize ait {ADET} adet çip kargonuz laboratuvarımıza ulaşmış ve sisteme tanımlanmıştır. Bilgilerinize sunarız. Alibey Beton Çelik Analiz ve Kentsel Dönüşüm Laboratuvarı';
    var SMS_DEF = 'Sayın {FIRMA_ADI}, {BELGE_NO} no’lu belgenize ait EBİS beton etiketi çip bakiyesi kritik seviyeye düşmüştür. Toplam: {TOPLAM}, Kullanılan: {KULLANILAN}, Kalan: {KALAN}. Hizmetlerde aksama yaşanmaması için en kısa sürede çip tedariki yapmanız rica olunur. Mevcut çiplerinizin yeterliliğini kontrol etmek veya bu mesajı tekrar almak istemiyorsanız +905333402577 ile iletişime geçebilirsiniz. Alibey Beton Çelik Analiz ve Kentsel Dönüşüm Laboratuvarı';
    var SMS_KARGO = 'Sayın {FIRMA_ADI}, {BELGE_NO} no’lu belgenize ait {ADET} adet çip kargonuz laboratuvarımıza ulaşmış ve sisteme tanımlanmıştır. Bilgilerinize sunarız. Alibey Beton Çelik Analiz ve Kentsel Dönüşüm Laboratuvarı';



    var bfData = [];
    var prData = [];

    function lsGet(k, fb) {
        try {
            var v = localStorage.getItem(k);
            if (v === null || v === 'null' || v === 'undefined') return (fb !== undefined ? fb : null);
            return JSON.parse(v);
        } catch (e) {
            return (fb !== undefined ? fb : null);
        }
    }

    function lsSet(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch (e) { }
    }

    // ── MODULE SWITCH ──
    // ── MODULE SWITCH ──
    // Her koleksiyon için 'ilk kez yüklendi mi' takibi
    var _tabLoaded = { chip: false, fiyat: false, sf: false, settings: false, orders: false };

    function sw(mod) {
        // Rol bazlı erişim kontrolü
        var _u = lsGet('alibey_user');
        var _role = (_u || {}).role || 'personel';
        var _allowed = ROLE_MODULES[_role] || ROLE_MODULES.personel;
        if (_allowed.indexOf(mod) === -1) { toast('Bu modüle erişim yetkiniz yok', 'err'); return; }
        window.scrollTo(0, 0);
        var ebistrMod = document.getElementById('ebistr-modal');
        if (ebistrMod) ebistrMod.style.display = 'none';

        ['cari', 'chip', 'fiyat', 'maas', 'ebistr', 'settings'].forEach(function (m) {
            var el = document.getElementById('mod-' + m);
            if (el) el.style.display = m === mod ? '' : 'none';
            var ni = document.getElementById('nm-' + m);
            if (ni) {
                ni.classList.toggle('on', m === mod);
            }
        });
        var stepsLabel = document.getElementById('cariStepsLabel');
        if (stepsLabel) stepsLabel.style.display = mod === 'cari' ? '' : 'none';
        for (var i = 1; i <= 5; i++) {
            var n = document.getElementById('nav' + i);
            if (n) n.style.display = mod === 'cari' ? '' : 'none';
        }
        if (mod === 'maas') {
            swMaas('payroll');
        }
        if (mod === 'chip') {
            fixChipFirmaNames();
            updateChipStats();
            renderChip();
            updateNetgsmBalance(); // SMS Bakiyesini tazele
            chipTab('izle');
            // Lazy: siparis + SF ilk açılışta
            if (!_tabLoaded.orders) {
                _tabLoaded.orders = true;
                fbPullOrders();
            }
            if (!_tabLoaded.sf) {
                _tabLoaded.sf = true;
                setTimeout(fbPullSF, 3500);
            }
        }

        if (mod === 'fiyat') {
            renderPR();
            calcFH();
            calcKazik();
            calcIstinat();
            // Lazy: fiyat teklifleri ilk açılışta
            if (!_tabLoaded.fiyat) {
                _tabLoaded.fiyat = true;
                fbPullPR();
            }
        }

        if (mod === 'ebistr') {
            ebistrInit();
        }

        if (mod === 'settings') {
            renderLogs();
            renderMsgLog();
            loadApiSettings();
            // Lazy: loglar + şablonlar + mesaj geçmişi ilk açılışta
            if (!_tabLoaded.settings) {
                _tabLoaded.settings = true;
                // Blaze planında hızlı sıralı çekim
                fbPullMsgLog();
                setTimeout(fbPullLogs, 300);
                setTimeout(fbPullTemplates, 600);
            } else {
                // Sonraki ziyaretlerde mesaj logunu tazele
                fbPullMsgLog();
            }
        }
        closeSB();
    }

    // ── AUTH, LOGS & SETTINGS ──
    var activeUser = null;
    var activeUserName = '';

    /** Next.js portal: `lab_session` — `alibey_user` (eski giriş) yokken de Firestore sync gerekir */
    function _labSessionOk() {
        try {
            var raw = localStorage.getItem('lab_session');
            if (!raw) return false;
            var o = JSON.parse(raw);
            return !!(o && o.userId && o.ad && o.roleId);
        } catch (e) {
            return false;
        }
    }

    function checkAuth() {
        var u = lsGet('alibey_user');
        var loginScreen = document.getElementById('loginScreen');
        var userPill    = document.getElementById('userPill');
        var upName      = document.getElementById('upName');
        var upAv        = document.getElementById('upAv');
        if (u && u.id && u.name) {
            activeUser = u.id;
            activeUserName = u.name;
            if (loginScreen) loginScreen.style.display = 'none';
            if (userPill)    userPill.style.display = 'flex';
            if (upName)      upName.textContent = u.name;
            if (upAv)        upAv.textContent = u.name.charAt(0);
            updateSidebarForRole();
            fbSyncAll();
            startFbPolling();
        } else {
            if (loginScreen) loginScreen.style.display = 'flex';
            if (userPill)    userPill.style.display = 'none';
        }
    }

    // ── KULLANICI TANIMLARI ──────────────────────────────────────────
    var USERS = {
        omerkaya:    { name: 'Ömer Kaya',              role: 'admin',   pwd: 'Ok.ko7765' },
        bunyaminayik:{ name: 'Bünyamin Ayık',           role: 'mudur',   pwd: 'Alibey.1'  },
        personel:    { name: 'Laboratuvar Personeli',   role: 'personel',pwd: '123456'    }
    };
    // Rol → erişilebilir modüller
    var ROLE_MODULES = {
        admin:    ['cari','chip','fiyat','maas','ebistr','settings'],
        mudur:    ['cari','chip','fiyat','maas','ebistr','settings'],
        personel: ['chip','ebistr']
    };
    // Rol → işlem izinleri
    var ROLE_PERMS = {
        admin:    { mail:true,  sms:true  },
        mudur:    { mail:true,  sms:true  },
        personel: { mail:false, sms:false }
    };
    var LAB_NOTIFY_SUPER = { omerkaya: 1, omer: 1, bunyaminayik: 1 };
    function _labSessionChipNotifySync() {
        try {
            var raw = localStorage.getItem('lab_session');
            if (!raw) return false;
            var o = JSON.parse(raw);
            var uid = String((o && o.userId) || '').toLowerCase();
            if (LAB_NOTIFY_SUPER[uid]) return true;
        } catch (e) {}
        return false;
    }
    function _canMail() {
        if (_labSessionChipNotifySync()) return true;
        try {
            if (typeof window !== 'undefined' && window.__LAB_CAN_MAIL__ === true) return true;
        } catch (e) {}
        var u = lsGet('alibey_user'); var p = ROLE_PERMS[(u||{}).role]; return !!(p && p.mail);
    }
    function _canSms() {
        if (_labSessionChipNotifySync()) return true;
        try {
            if (typeof window !== 'undefined' && window.__LAB_CAN_SMS__ === true) return true;
        } catch (e) {}
        var u = lsGet('alibey_user'); var p = ROLE_PERMS[(u||{}).role]; return !!(p && p.sms);
    }

    var _selectedLoginUser = null;

    function loginSelectUser(id) {
        var user = USERS[id];
        if (!user) return;
        _selectedLoginUser = { id: id };
        document.querySelectorAll('.lb-user-card').forEach(function(c) { c.classList.remove('selected'); });
        document.querySelectorAll('.lb-check').forEach(function(c) { c.textContent = ''; c.classList.remove('on'); });
        var card = document.getElementById('lbu-' + id);
        var chk  = document.getElementById('lbchk-' + id);
        if (card) card.classList.add('selected');
        if (chk)  { chk.textContent = '✓'; chk.classList.add('on'); }
        setTimeout(function() { var p = document.getElementById('loginPwd'); if (p) p.focus(); }, 80);
    }

    function doLoginSelected() {
        var err = document.getElementById('lb-err');
        if (!_selectedLoginUser) {
            if (err) { err.textContent = 'Lütfen bir kullanıcı seçin'; err.classList.add('show'); }
            return;
        }
        doLogin(_selectedLoginUser.id);
    }

    function doLogin(id) {
        var user = USERS[id];
        if (!user) return;
        var pwd = document.getElementById('loginPwd').value;
        var err = document.getElementById('lb-err');
        var btn = document.getElementById('lb-submit-btn');
        if (pwd !== user.pwd) {
            if (err) { err.textContent = 'Hatalı şifre. Tekrar deneyin.'; err.classList.add('show'); }
            var inp = document.getElementById('loginPwd');
            if (inp) { inp.style.borderColor='rgba(239,68,68,.6)'; setTimeout(function(){ inp.style.borderColor=''; }, 1500); }
            if (btn) { btn.disabled = false; document.getElementById('lb-submit-txt').textContent = 'Giriş Yap'; }
            return;
        }
        if (btn) { btn.disabled = true; document.getElementById('lb-submit-txt').textContent = 'Giriş yapılıyor...'; }
        localStorage.setItem('alibey_session', 'ok');
        document.getElementById('loginPwd').value = '';
        if (err) err.classList.remove('show');
        lsSet('alibey_user', { id: id, name: user.name, role: user.role });
        setTimeout(function() {
            checkAuth();
            logAction('Sisteme giriş yaptı');
            setTimeout(function () { fbSyncAll(); startFbPolling(); }, 500);
        }, 300);
    }

    function updateSidebarForRole() {
        var u = lsGet('alibey_user');
        var role = (u || {}).role || 'personel';
        var allowed = ROLE_MODULES[role] || ROLE_MODULES.personel;
        var roleLabels = { admin:'Sistem Yöneticisi', mudur:'Laboratuvar Müdürü', personel:'Laboratuvar Personeli' };
        ['cari','chip','fiyat','maas','ebistr','settings'].forEach(function(m) {
            var ni = document.getElementById('nm-' + m);
            if (ni) ni.style.display = allowed.indexOf(m) >= 0 ? '' : 'none';
        });
        var showCari = allowed.indexOf('cari') >= 0;
        var stepsLabel = document.getElementById('cariStepsLabel');
        if (stepsLabel) stepsLabel.style.display = showCari ? '' : 'none';
        ['nav1','nav2','nav3','nav4','nav5'].forEach(function(nid) {
            var el = document.getElementById(nid); if (el) el.style.display = showCari ? '' : 'none';
        });
        var ndivs = document.querySelectorAll('.ndiv');
        ndivs.forEach(function(d) { d.style.display = showCari ? '' : 'none'; });
        var upRole = document.querySelector('.up-role');
        if (upRole) upRole.textContent = roleLabels[role] || role;
        // Personel: ilk izin verilen modüle geç
        if (role === 'personel' && document.getElementById('mod-cari') && document.getElementById('mod-cari').style.display !== 'none') {
            sw(allowed[0]);
        }
    }

    function doLogout() {
        logAction('Sistemden çıkış yaptı');
        localStorage.removeItem('alibey_user');
        localStorage.removeItem('alibey_session');
        activeUser = null;
        activeUserName = '';
        checkAuth();
    }

    function logAction(actionDesc) {
        if (!activeUser) return;
        var entry = { dt: new Date().toISOString(), u: activeUserName, a: actionDesc };
        actLogs.unshift(entry);
        if (actLogs.length > 500) actLogs = actLogs.slice(0, 500);
        fbPushLog({ dt: entry.dt, u: entry.u, action: entry.a });
        var modSettings = document.getElementById('mod-settings');
        if (modSettings && modSettings.style.display !== 'none') renderLogs();
    }

    var logsPage = 1;
    var LOGS_PER_PAGE = 100;

    function renderLogs() {
        var ll = document.getElementById('logList');
        var pg = document.getElementById('logPager');
        if (!ll) return;
        var q = (document.getElementById('logSearch') || {}).value || '';
        var fLogs = (actLogs || []).filter(function (l) {
            if (!q) return true;
            var m = (l.msg || l.action || '').toLowerCase();
            return m.indexOf(q.toLowerCase()) >= 0;
        }); // actLogs is already sorted newest-first

        var totalPages = Math.ceil(fLogs.length / LOGS_PER_PAGE);
        if (logsPage > totalPages) logsPage = totalPages || 1;
        var start = (logsPage - 1) * LOGS_PER_PAGE;
        var pLogs = fLogs.slice(start, start + LOGS_PER_PAGE);

        if (!pLogs.length) {
            ll.innerHTML = '<tr><td colspan="3" class="empty">Log bulunamadı</td></tr>';
            if (pg) pg.innerHTML = '';
        } else {
            ll.innerHTML = pLogs.map(function (l) {
                var d = new Date(l.dt || Date.now());
                var dtStr = d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                return '<tr>' +
                    '<td style="white-space:nowrap;font-size:10px;color:var(--tx3)">' + dtStr + '</td>' +
                    '<td style="font-weight:600;color:var(--acc2)">' + (l.u || 'Sistem') + '</td>' +
                    '<td style="font-size:11px">' + (l.msg || l.action || '') + '</td>' +
                    '</tr>';
            }).join('');
        }

        if (pg) {
            if (totalPages <= 1) { pg.innerHTML = ''; return; }
            var h = '<span style="font-size:11px;color:var(--tx3);align-self:center;margin-right:10px">Toplam ' + fLogs.length + ' kayıt</span>';
            for (var i = 1; i <= totalPages; i++) {
                var act = (i === logsPage) ? 'background:var(--acc);color:#fff;' : '';
                h += '<button class="btn btn-o" style="padding:2px 8px;font-size:10px;' + act + '" onclick="logsPage=' + i + ';renderLogs()">' + i + '</button>';
            }
            pg.innerHTML = h;
        }
    }

    // Temizle butonları için şifre doğrulama — native window.prompt() yerine custom modal kullan
    var CLEAR_PWD = 'Ok.ko7765';
    function askClearPassword(onOk) {
        // Custom modal — window.prompt() kullanılmıyor (notification/modal sekmesi kapanıyordu)
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--sur,#1e1e2e);border:1px solid var(--bdr,#444);border-radius:12px;padding:24px;min-width:260px;display:flex;flex-direction:column;gap:12px';
        box.innerHTML =
            '<div style="font-weight:700;color:var(--tx,#fff);font-size:13px">🔒 Şifre Gerekli</div>' +
            '<div style="font-size:11px;color:var(--tx3,#aaa)">İşlem geçmişini silmek için şifre girin:</div>' +
            '<input id="_clrPwdInp" type="password" autocomplete="off" style="padding:8px 10px;border-radius:6px;border:1px solid var(--bdr,#555);background:var(--sur2,#2a2a3e);color:var(--tx,#fff);font-size:12px;outline:none" placeholder="Şifre...">' +
            '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button id="_clrPwdCancel" style="padding:6px 14px;border-radius:6px;border:1px solid var(--bdr,#555);background:transparent;color:var(--tx2,#ccc);cursor:pointer;font-size:11px">İptal</button>' +
            '<button id="_clrPwdOk" style="padding:6px 14px;border-radius:6px;border:none;background:#6366f1;color:#fff;cursor:pointer;font-size:11px;font-weight:700">Onayla</button>' +
            '</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        var inp = box.querySelector('#_clrPwdInp');
        setTimeout(function () { inp && inp.focus(); }, 80);
        function close() { document.body.removeChild(overlay); }
        box.querySelector('#_clrPwdCancel').onclick = close;
        box.querySelector('#_clrPwdOk').onclick = function () {
            if (inp.value !== CLEAR_PWD) { inp.style.borderColor = 'var(--red,#f87171)'; inp.focus(); return; }
            close(); onOk();
        };
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') box.querySelector('#_clrPwdOk').click();
            if (e.key === 'Escape') close();
        });
    }

    function clearLogs() {
        askClearPassword(function () {
            showConfirm('Logları Temizle', 'Tüm işlem geçmişi silinsin mi?', function () {
                // Firestore'dan sil
                fsGet('logs').then(function (rows) {
                    rows.forEach(function (r, i) {
                        setTimeout(function () { fsDel('logs', r._id); }, i * 150);
                    });
                });
                actLogs = [];
                renderLogs();
                toast('Loglar temizlendi', 'info');
            });
        });
    }


    function saveApiSettings() {
        var set = {
            smsVen: document.getElementById('apiSmsVen').value,
            smsUser: document.getElementById('apiSmsUser').value,
            smsKey: document.getElementById('apiSmsKey').value,
            smsTotal: parseInt(document.getElementById('apiSmsTotal').value) || 0,
            smsBas: document.getElementById('apiSmsBas').value,
            waVen: document.getElementById('apiWaVen').value,
            waKey: document.getElementById('apiWaKey').value
        };
        lsSet('alibey_api', set);
        fbSaveApi(set);
        toast('API Bağlantı ayarları kaydedildi ve veritabanına yazıldı', 'ok');
    }

    function loadApiSettings() {
        var set = lsGet('alibey_api') || {};
        var el;
        if (set.smsVen && (el = document.getElementById('apiSmsVen'))) el.value = set.smsVen;
        if (set.smsUser && (el = document.getElementById('apiSmsUser'))) el.value = set.smsUser;
        if (set.smsKey && (el = document.getElementById('apiSmsKey'))) el.value = set.smsKey;
        if (set.smsTotal && (el = document.getElementById('apiSmsTotal'))) el.value = set.smsTotal;
        if (set.smsBas && (el = document.getElementById('apiSmsBas'))) el.value = set.smsBas;
        if (set.waVen && (el = document.getElementById('apiWaVen'))) el.value = set.waVen;
        if (set.waKey && (el = document.getElementById('apiWaKey'))) el.value = set.waKey;
    }

    // ── SIDEBAR TOGGLE ──
    var sidebarOpen = false;

    function toggleSB() {
        var sb = document.getElementById('sb');
        var ov = document.getElementById('ov');
        var mn = document.getElementById('mainArea');
        if (window.innerWidth <= 1024) {
            if (sb.classList.contains('open')) {
                sb.classList.remove('open');
                ov.classList.remove('on');
            } else {
                sb.classList.add('open');
                ov.classList.add('on');
            }
        } else {
            var isComp = sb.getAttribute('data-collapsed') === '1';
            if (isComp) {
                sb.setAttribute('data-collapsed', '0');
                sb.style.width = '';
                mn.style.marginLeft = '';
                sb.classList.remove('collapsed');
            } else {
                sb.setAttribute('data-collapsed', '1');
                sb.style.width = '64px';
                mn.style.marginLeft = '64px';
                sb.classList.add('collapsed');
            }
        }
    }

    function closeSB() {
        var sb = document.getElementById('sb');
        var ov = document.getElementById('ov');
        if (sb) sb.classList.remove('open');
        if (ov) ov.classList.remove('on');
    }

    // ── INIT UPLOADS ──
    function initUploads() {
        var uz = document.getElementById('uploadZone');
        var fi = document.getElementById('fi');
        if (uz) {
            uz.addEventListener('dragover', function (e) {
                e.preventDefault();
                uz.classList.add('drag');
            });
            uz.addEventListener('dragleave', function () {
                uz.classList.remove('drag');
            });
            uz.addEventListener('drop', function (e) {
                e.preventDefault();
                uz.classList.remove('drag');
                readFile(e.dataTransfer.files[0]);
            });
        }
        if (fi) fi.addEventListener('change', function (e) {
            readFile(e.target.files[0]);
        });
        var cuz = document.getElementById('chipUZ');
        var cfi = document.getElementById('chipFI');
        if (cuz) {
            cuz.addEventListener('dragover', function (e) {
                e.preventDefault();
                cuz.classList.add('drag');
            });
            cuz.addEventListener('dragleave', function () {
                cuz.classList.remove('drag');
            });
            cuz.addEventListener('drop', function (e) {
                e.preventDefault();
                cuz.classList.remove('drag');
                readCSV(e.dataTransfer.files[0]);
            });
        }
        if (cfi) cfi.addEventListener('change', function (e) {
            readCSV(e.target.files[0]);
        });
    }

    // ── NAV ──
    function goNav(n) {
        if (n > 1 && allData.length === 0) {
            toast('Önce dosya yükle', 'err');
            return;
        }
        if (n > 2 && Object.keys(selectedOwners).length === 0) {
            toast('Yapı sahibi seç', 'err');
            return;
        }
        if (n > 3) {
            var f = document.getElementById('dateFrom').value;
            var t = document.getElementById('dateTo').value;
            if (!f || !t) {
                toast('Tarih aralığı gir', 'err');
                return;
            }
        }
        if (n === 4) buildPricePanel();
        currentNav = n;
        for (var i = 1; i <= 5; i++) {
            var p = document.getElementById('p' + i);
            if (p) p.classList.toggle('on', i === n);
            var nv = document.getElementById('nav' + i);
            if (nv) nv.classList.toggle('on', i === n);
        }
    }

    // ── UPLOAD ──
    function readFile(file) {
        if (!file) return;
        var r = new FileReader();
        r.onload = function (e) {
            try {
                var wb = XLSX.read(e.target.result, {
                    type: 'array',
                    cellDates: true
                });
                var ws = wb.Sheets['TAKİP'] || wb.Sheets[wb.SheetNames[0]];
                var raw = XLSX.utils.sheet_to_json(ws, {
                    defval: null,
                    raw: false
                });
                allData = raw.filter(function (r) {
                    return r['YAPI SAHİBİ'] && r['YAPI SAHİBİ'].toString().trim();
                });
                if (!allData.length) {
                    toast('Veri bulunamadı', 'err');
                    return;
                }
                // localStorage'a kaydet
                try {
                    lsSet('alibey_rapor', allData);
                    lsSet('alibey_rapor_meta', {
                        name: file.name,
                        count: allData.length,
                        date: new Date().toLocaleDateString('tr-TR')
                    });
                } catch (ex) { }
                afterRaporLoad(file.name);
                goNav(2);
            } catch (err) {
                toast('Okunamadı: ' + err.message, 'err');
            }
        };
        r.readAsArrayBuffer(file);
    }

    function afterRaporLoad(fileName) {
        buildGroupData();
        var uz = document.getElementById('uploadZone');
        uz.classList.add('ok');
        uz.innerHTML = '<div class="fr"><div class="fic">✅</div><div><div class="fn2">' + (fileName || 'Kayıtlı Dosya') + '</div><div class="fm2">' + allData.length + ' kayıt · ' + owners.length + ' grup</div></div></div>';
        var nb = document.getElementById('nb2');
        if (nb) {
            nb.textContent = owners.length;
            nb.style.display = '';
        }
        renderOwners('');
        toast(allData.length + ' kayıt yüklendi', 'ok');
        // Global lookup güncellendiğini bildir
        window.raporDefterYibfBilgi = raporDefterYibfBilgi;
        // YİBF → mal sahibi haritasını JSON cache'e kaydet
        try {
            var yibfMap = {};
            allData.forEach(function(r) {
                var yibf = String(r['YİBF'] || r['YIBF'] || '').trim();
                if (yibf) {
                    yibfMap[yibf] = {
                        yapiSahibi:  (r['YAPI SAHİBİ'] || '').toString().trim(),
                        yapiDenetim: (r['DENEYİ TALEP EDEN'] || r['YAPI DENETİM'] || '').toString().trim(),
                        yapiBolumu:  (r['YAPI BÖLÜMÜ'] || '').toString().trim(),
                        blok:        (r['BLOK'] || '').toString().trim()
                    };
                }
            });
            fetch('/api/rapor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: yibfMap })
            }).catch(function() {});
            // Firestore delta merge — sadece yeni YİBF'leri ekle, mevcutları koru
            if (typeof window.fsSet === 'function' && typeof window.fsGetDoc === 'function') {
                window.fsGetDoc('sys_config', 'rapor_defteri').then(function(existing) {
                    var existingMap = (existing && existing.map && typeof existing.map === 'object') ? existing.map : {};
                    // Mevcut YİBF'leri koru, sadece eksik olanları ekle
                    var mergedMap = Object.assign({}, yibfMap, existingMap);
                    return window.fsSet('sys_config', 'rapor_defteri', {
                        rows: [],
                        map: mergedMap,
                        updatedAt: new Date().toISOString()
                    });
                }).catch(function() {
                    // Mevcut veri okunamazsa sadece yeni map'i kaydet
                    window.fsSet('sys_config', 'rapor_defteri', {
                        rows: [],
                        map: yibfMap,
                        updatedAt: new Date().toISOString()
                    }).catch(function() {});
                });
            }
        } catch(e) {}
    }

    // EBİSTR modülünden erişilebilmesi için global lookup
    function raporDefterYibfBilgi(yibfNo) {
        if (!yibfNo || !allData.length) return null;
        var no = String(yibfNo).trim();
        var row = allData.find(function(r) {
            return String(r['YİBF'] || r['YIBF'] || '').trim() === no;
        });
        if (!row) return null;
        return {
            yapiSahibi:  (row['YAPI SAHİBİ'] || '').toString().trim(),
            yapiDenetim: (row['DENEYİ TALEP EDEN'] || row['YAPI DENETİM'] || '').toString().trim(),
            yapiBolumu:  (row['YAPI BÖLÜMÜ'] || '').toString().trim(),
            blok:        (row['BLOK'] || '').toString().trim()
        };
    }
    window.raporDefterYibfBilgi = raporDefterYibfBilgi;

    function loadRapor() {
        var saved = lsGet('alibey_rapor');
        if (saved && saved.length) {
            allData = saved;
            afterRaporLoad(null);
            var meta = lsGet('alibey_rapor_meta');
            var info = document.getElementById('savedRaporInfo');
            if (info && meta) {
                info.style.display = '';
                document.getElementById('savedRaporMeta').textContent = meta.name + ' · ' + meta.count + ' kayıt · ' + meta.date;
            }
            return;
        }
        // localStorage boşsa Firestore'dan yükle (map → minimal satır listesi)
        if (typeof window.fsGetDoc !== 'function') return;
        window.fsGetDoc('sys_config', 'rapor_defteri').then(function(doc) {
            if (!doc) return;
            var fsRows = Array.isArray(doc.rows) && doc.rows.length ? doc.rows : null;
            var fsMap  = doc.map && typeof doc.map === 'object' ? doc.map : null;
            if (fsRows) {
                allData = fsRows;
            } else if (fsMap) {
                // map'ten minimal satır kur — owner listesi için yeterli
                allData = Object.keys(fsMap).map(function(yibf) {
                    var m = fsMap[yibf] || {};
                    return {
                        'YİBF': yibf,
                        'YAPI SAHİBİ':       m.yapiSahibi || '',
                        'DENEYİ TALEP EDEN': m.yapiDenetim || '',
                        'BETON':             m.betonFirmasi || '',
                        'YAPI BÖLÜMÜ':       m.yapiBolumu || '',
                        'BLOK':              m.blok || '',
                        'TİP':               m.tip || '',
                        'NMN.ALINIŞ TARİHİ': m.alinTarih || ''
                    };
                });
            }
            if (allData.length) afterRaporLoad('(Firestore önbelleği)');
        }).catch(function() {});
    }

    function clearSavedRapor() {
        try {
            localStorage.removeItem('alibey_rapor');
            localStorage.removeItem('alibey_rapor_meta');
        } catch (ex) { }
        var info = document.getElementById('savedRaporInfo');
        if (info) info.style.display = 'none';
        allData = [];
        owners = [];
        selectedOwners = {};
        var uz = document.getElementById('uploadZone');
        uz.classList.remove('ok');
        uz.innerHTML = '<span class="uz-ic">📊</span><div class="uz-ti">Rapor Defterini Sürükle veya Tıkla</div><div class="uz-su">TAKİP sayfası içeren .xlsx dosyası</div><button class="btn btn-o" onclick="event.stopPropagation();document.getElementById(\'fi\').click()">Dosya Seç</button>';
        toast('Kayıtlı rapor silindi', 'info');
    }

    // ── GRUP MODU ──
    var groupMode = 'YAPI SAHİBİ';

    function switchGroupMode(mode) {
        groupMode = mode;
        selectedOwners = {};
        // Update tab styles
        var tabs = {
            'YAPI SAHİBİ': 'gmYS',
            'BETON FİRMASI': 'gmBF',
            'YAPI DENETİM': 'gmYD'
        };
        for (var k in tabs) {
            var el = document.getElementById(tabs[k]);
            if (el) {
                el.className = k === mode ? 'btn btn-p' : 'btn btn-g';
            }
        }
        buildGroupData();
        renderOwners('');
        renderTags();
        var btn2 = document.getElementById('btn2');
        if (btn2) btn2.disabled = true;
    }

    function buildGroupData() {
        var col = groupMode;
        // Map column names
        var colKey = col;
        if (col === 'YAPI DENETİM') colKey = 'DENEYİ TALEP EDEN';
        if (col === 'BETON FİRMASI') colKey = 'BETON';
        var cnt = {};
        allData.forEach(function (r) {
            var v = (r[colKey] || r['YAPI DENETİM'] || '').toString().trim();
            if (!v) return;
            cnt[v] = (cnt[v] || 0) + 1;
        });
        owners = Object.keys(cnt).sort(function (a, b) {
            return a.localeCompare(b, 'tr');
        }).map(function (k) {
            return [k, cnt[k]];
        });
    }

    // ── OWNERS ──
    function renderOwners(q) {
        var list = document.getElementById('ownerList');
        var term = (q || '').toLowerCase();
        var filt = owners.filter(function (o) {
            return o[0].toLowerCase().indexOf(term) >= 0;
        });
        var labels = {
            'YAPI SAHİBİ': 'yapı sahibi',
            'BETON FİRMASI': 'beton firması',
            'YAPI DENETİM': 'yapı denetim'
        };
        var cnt = document.getElementById('ownerCnt');
        if (cnt) cnt.textContent = owners.length + ' ' + (labels[groupMode] || 'kayıt');
        if (!filt.length) {
            list.innerHTML = '<div class="empty">Bulunamadı</div>';
            return;
        }
        list.innerHTML = filt.map(function (o) {
            var n = o[0],
                c = o[1],
                sel = selectedOwners[n] ? ' on' : '';
            return '<div class="oi' + sel + '" onclick="toggleOwner(\'' + n.replace(/'/g, "\\'") + '\')"><span>' + n + '</span><span class="oc">' + c + '</span></div>';
        }).join('');
    }

    function filterOwners() {
        renderOwners(document.getElementById('ownerSearch').value);
    }

    function toggleOwner(n) {
        if (selectedOwners[n]) delete selectedOwners[n];
        else selectedOwners[n] = true;
        renderOwners(document.getElementById('ownerSearch').value);
        renderTags();
        var btn = document.getElementById('btn2');
        if (btn) btn.disabled = Object.keys(selectedOwners).length === 0;
    }

    function selAll() {
        owners.forEach(function (o) {
            selectedOwners[o[0]] = true;
        });
        renderOwners(document.getElementById('ownerSearch').value);
        renderTags();
        var btn = document.getElementById('btn2');
        if (btn) btn.disabled = false;
    }

    function clrAll() {
        selectedOwners = {};
        renderOwners(document.getElementById('ownerSearch').value);
        renderTags();
        var btn = document.getElementById('btn2');
        if (btn) btn.disabled = true;
    }

    function renderTags() {
        var keys = Object.keys(selectedOwners);
        document.getElementById('tags').innerHTML = keys.map(function (n) {
            return '<div class="tag" onclick="toggleOwner(\'' + n.replace(/'/g, "\\'") + '\')"><span>' + n + '</span><span>×</span></div>';
        }).join('');
    }

    // ── TARİH ──
    function setPill(from, to, el) {
        var pills = document.querySelectorAll('.pill');
        for (var i = 0; i < pills.length; i++) pills[i].classList.remove('on');
        el.classList.add('on');
        var fp = from.split('-').map(Number),
            tp = to.split('-').map(Number);
        document.getElementById('dateFrom').value = fp[0] + '-' + ('0' + fp[1]).slice(-2) + '-01';
        var ld = new Date(tp[0], tp[1], 0);
        document.getElementById('dateTo').value = tp[0] + '-' + ('0' + tp[1]).slice(-2) + '-' + ('0' + ld.getDate()).slice(-2);
    }

    // ── TİP ──
    function toggleTip(el) {
        var cards = document.querySelectorAll('.tc');
        for (var i = 0; i < cards.length; i++) cards[i].classList.remove('on');
        el.classList.add('on');
        activeTip = el.getAttribute('data-tip');
    }

    // ── FİYAT PANELİ ──
    function buildPricePanel() {
        var from = new Date(document.getElementById('dateFrom').value);
        var to = new Date(document.getElementById('dateTo').value + 'T23:59:59');
        var selOwners = Object.keys(selectedOwners);
        var filterCol2 = groupMode;
        if (groupMode === 'YAPI DENETİM') filterCol2 = 'DENEYİ TALEP EDEN';
        if (groupMode === 'BETON FİRMASI') filterCol2 = 'BETON';
        var subset = allData.filter(function (r) {
            var n = (r[filterCol2] || r['YAPI DENETİM'] || '').toString().trim();
            if (groupMode === 'YAPI SAHİBİ') n = (r['YAPI SAHİBİ'] || '').toString().trim();
            if (selOwners.indexOf(n) < 0) return false;
            var d = new Date(r['NMN.ALINIŞ TARİHİ']);
            if (isNaN(d) || d < from || d > to) return false;
            var tip = (r['TİP'] || '').toString().trim();
            if (activeTip !== 'ALL' && tip !== activeTip) return false;
            return true;
        });
        var hasBeton = subset.some(function(r){ return (r['TİP']||'').trim() === 'B'; });
        var hasCelik = subset.some(function(r){ return (r['TİP']||'').trim() === 'BÇ'; });
        var hasKarot = subset.some(function(r){ return (r['TİP']||'').trim() === 'K'; });
        
        var html = '<div style="margin-bottom:15px;font-size:12px;color:var(--tx3)">Excel verisinden tespit edilen kalemler:</div>';
        if (hasBeton) html += '<div class="pb"><div class="pb-ti">🧱 Beton Deneyleri (B)</div><div class="pr"><div class="pr-lb">Birim Fiyat</div><input class="pi" type="number" id="pBeton" placeholder="0" min="0" value="' + (window._sfPrices ? window._sfPrices.beton || '' : '') + '"><div class="pu">₺ / adet</div></div></div>';
        if (hasCelik) html += '<div class="pb"><div class="pb-ti">🔩 Çelik Deneyleri (BÇ)</div><div class="pr"><div class="pr-lb">Birim Fiyat</div><input class="pi" type="number" id="pCelikGenel" placeholder="0" min="0" value="' + (window._sfPrices ? window._sfPrices.celik || '' : '') + '"><div class="pu">₺ / adet</div></div></div>';
        if (hasKarot) html += '<div class="pb"><div class="pb-ti">⚙️ Karot Deneyleri (K)</div><div class="pr"><div class="pr-lb">Takım Fiyatı</div><input class="pi" type="number" id="pKarot" placeholder="0" min="0" value="' + (window._sfPrices ? window._sfPrices.karot || '' : '') + '"><div class="pu">₺ / takım</div></div></div>';
        
        html += '<div style="margin-top:25px;border-top:1px solid var(--bdr);padding-top:15px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
                '<div style="font-weight:700;color:var(--acc2);font-size:14px">➕ Ek Hizmetler / Giderler</div>';
        
        // Hızlı butonlar
        html += '<div style="display:flex;gap:4px">' +
                '<button class="btn btn-o" style="padding:4px 10px;font-size:11px" onclick="addCariExtraPriceRow(\'Yol Ücreti\', 0)">+ Yol</button>' +
                '<button class="btn btn-o" style="padding:4px 10px;font-size:11px" onclick="addCariExtraPriceRow(\'Mesai Ücreti\', 0)">+ Mesai</button>' +
                '<button class="btn btn-p" style="padding:4px 10px;font-size:11px" onclick="addCariExtraPriceRow(\'\', 0)">+ Diğer</button>' +
                '</div></div>' +
                '<div id="cariExtraPriceList"></div>' +
                '</div>';

        document.getElementById('priceCard').innerHTML = html;

        if (window._sfPrices) delete window._sfPrices;
    }

    function addCariExtraPriceRow(name, val) {
        var div = document.createElement('div');
        div.className = 'pb cari-extra-item-row';
        div.style.cssText = 'background:rgba(99,102,241,.03);border-style:dashed;margin-bottom:8px';
        div.innerHTML = '<div style="display:flex;gap:10px;align-items:center;width:100%">' +
            '<input class="pi cari-extra-name" type="text" placeholder="Kalem adı" value="' + (name || '') + '" style="flex:2;background:var(--sur)">' +
            '<input class="pi cari-extra-val" type="number" placeholder="Tutar" value="' + (val || '') + '" style="flex:1;background:var(--sur)">' +
            '<div class="pu" style="min-width:20px">₺</div>' +
            '<button class="btn btn-g" style="color:var(--red);padding:4px 8px" onclick="this.parentElement.parentElement.remove()">✕</button>' +
            '</div>';
        var list = document.getElementById('cariExtraPriceList');
        if (list) list.appendChild(div);
    }

    // ── FİYAT HESAPLA ──
    function calcPrice(row) {
        var tip = (row['TİP'] || '').toString().trim();
        var adet = parseFloat(row['ADET']) || 0;
        if (tip === 'B') {
            var p = parseFloat((document.getElementById('pBeton') || {}).value) || 0;
            return p * adet;
        }
        if (tip === 'BÇ') {
            var p2 = parseFloat((document.getElementById('pCelikGenel') || {}).value) || 0;
            return p2 * adet;
        }
        if (tip === 'K') {
            var p3 = parseFloat((document.getElementById('pKarot') || {}).value) || 0;
            return Math.ceil(adet / 3) * p3;
        }
        return 0;
    }

    // ── ÖNİZLE ──
    function buildPreview() {
        var from = new Date(document.getElementById('dateFrom').value);
        var to = new Date(document.getElementById('dateTo').value + 'T23:59:59');
        var selOwners = Object.keys(selectedOwners);
        var filterCol = groupMode;
        if (groupMode === 'YAPI DENETİM') filterCol = 'DENEYİ TALEP EDEN';
        if (groupMode === 'BETON FİRMASI') filterCol = 'BETON';
        filteredData = allData.filter(function (r) {
            var n = (r[filterCol] || r['YAPI DENETİM'] || '').toString().trim();
            if (groupMode === 'YAPI SAHİBİ') n = (r['YAPI SAHİBİ'] || '').toString().trim();
            if (selOwners.indexOf(n) < 0) return false;
            var d = new Date(r['NMN.ALINIŞ TARİHİ']);
            if (isNaN(d) || d < from || d > to) return false;
            var tip = (r['TİP'] || '').toString().trim();
            if (activeTip !== 'ALL' && tip !== activeTip) return false;
            return true;
        });
        if (!filteredData.length) {
            toast('Bu kriterlere uygun kayıt yok', 'err');
            return;
        }
        filteredData = filteredData.map(function (r) {
            var o = {};
            for (var k in r) o[k] = r[k];
            o._fiyat = calcPrice(r);
            return o;
        });
        var tots = { B: 0, 'BÇ': 0, K: 0, total: 0 };
        filteredData.forEach(function (r) {
            var t = (r['TİP'] || '').toString().trim();
            if (tots[t] !== undefined) tots[t]++;
            tots.total++;
        });

        // EK KALEMLERİ TOPLA
        var extras = [];
        document.querySelectorAll('.cari-extra-item-row').forEach(function(row) {
            var name = row.querySelector('.cari-extra-name').value.trim();
            var val = parseFloat(row.querySelector('.cari-extra-val').value) || 0;
            if (name && val > 0) extras.push({ name: name, val: val });
        });

        var matrah = filteredData.reduce(function (s, r) { return s + (r._fiyat || 0); }, 0);
        var extraTotal = extras.reduce(function(s, e) { return s + e.val; }, 0);
        var toplamFiyat = matrah + extraTotal;

        document.getElementById('statsRow').innerHTML =
            '<div class="st"><div class="st-ic">📋</div><div class="st-v">' + tots.total + '</div><div class="st-l">Toplam Kayıt</div></div>' +
            '<div class="st"><div class="st-ic">🧱</div><div class="st-v">' + tots.B + '</div><div class="st-l">Beton</div></div>' +
            '<div class="st"><div class="st-ic">🔩</div><div class="st-v">' + tots['BÇ'] + '</div><div class="st-l">Çelik</div></div>';
        
        var groupLabel = { 'YAPI SAHİBİ': 'yapı sahibi', 'BETON FİRMASI': 'beton firması', 'YAPI DENETİM': 'yapı denetim' };
        var prevSub = document.getElementById('prevSub');
        if (prevSub) prevSub.textContent = selOwners.length + ' ' + (groupLabel[groupMode] || 'grup') + ' · ' + filteredData.length + ' kayıt';
        
        // KDV box
        var kdvBox = document.getElementById('kdvBox');
        if (kdvBox) {
            kdvBox.style.display = '';
            document.getElementById('kdvNet').textContent = toplamFiyat.toLocaleString('tr-TR') + ' ₺';
            var kdvAmt = toplamFiyat * 0.2;
            document.getElementById('kdvAmount').textContent = kdvAmt.toLocaleString('tr-TR') + ' ₺';
            document.getElementById('kdvTotal').textContent = (toplamFiyat + kdvAmt).toLocaleString('tr-TR') + ' ₺';
        }

        var html = filteredData.map(function (r) {
            var tip = (r['TİP'] || '').toString().trim();
            var tarih = r['NMN.ALINIŞ TARİHİ'] ? new Date(r['NMN.ALINIŞ TARİHİ']).toLocaleDateString('tr-TR') : '';
            var fiyat = r._fiyat ? r._fiyat.toLocaleString('tr-TR') + ' ₺' : '—';
            return '<tr><td>' + tip + '</td><td>' + (r['KOD'] || '') + '</td><td>' + tarih + '</td>' +
                '<td>' + (r['YAPI DENETİM'] || r['DENEYİ TALEP EDEN'] || '') + '</td>' +
                '<td style="color:var(--acc2);font-weight:600">' + (r['YAPI SAHİBİ'] || '') + '</td>' +
                '<td>' + (r['YAPI BÖLÜMÜ'] || '') + '</td><td>' + (r['BLOK'] || '') + '</td>' +
                '<td>' + (r['m³'] || '') + '</td><td>' + (r['ADET'] || '') + '</td>' +
                '<td>' + (r['CİNS'] || '') + '</td><td>' + (r['SINIFI'] || '') + '</td>' +
                '<td style="color:var(--grn);font-weight:700">' + fiyat + '</td></tr>';
        }).join('');

        // Ek kalemleri tabloya ekle
        if (extras.length > 0) {
            html += '<tr style="background:rgba(99,102,241,.05);font-weight:700"><td colspan="11" style="text-align:right;color:var(--acc2)">EK HİZMETLER TOPLAMI</td><td style="color:var(--grn)">' + extraTotal.toLocaleString('tr-TR') + ' ₺</td></tr>';
            extras.forEach(function(e) {
                html += '<tr style="background:rgba(0,0,0,.02)"><td colspan="11" style="text-align:right;font-size:11px">' + e.name + '</td><td style="color:var(--tx2);font-size:11px">' + e.val.toLocaleString('tr-TR') + ' ₺</td></tr>';
            });
        }

        document.getElementById('prevBody').innerHTML = html;
        var mb = document.getElementById('mergedBtn');
        if (mb) mb.style.display = Object.keys(selectedOwners).length > 1 ? '' : 'none';
        goNav(5);
    }

    // ── EXCEL BUILD ──
    function toFileName(name) {
        var m = {
            'ğ': 'g',
            'ü': 'u',
            'ş': 's',
            'ı': 'i',
            'ö': 'o',
            'ç': 'c',
            'Ğ': 'G',
            'Ü': 'U',
            'Ş': 'S',
            'İ': 'I',
            'Ö': 'O',
            'Ç': 'C'
        };
        return name.replace(/[ğüşıöçĞÜŞİÖÇ]/g, function (c) {
            return m[c] || c;
        })
            .split(/\s+/).map(function (w) {
                return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            }).join('_')
            .replace(/[^A-Za-z0-9_\-\.]/g, '').substring(0, 60);
    }

    function buildWb(data, ownerName) {
        var wb = {
            SheetNames: [],
            Sheets: {}
        };
        var enc = XLSX.utils.encode_cell;
        var fromStr = document.getElementById('dateFrom').value;
        var toStr = document.getElementById('dateTo').value;
        var fmtDate = function (s) {
            if (!s) return '';
            var p = s.split('-');
            return p[2] + '.' + p[1] + '.' + p[0];
        };
        var headerText = ownerName.toUpperCase() + ' — ' + fmtDate(fromStr) + ' / ' + fmtDate(toStr) + ' — CARİ ÖZETİ';
        var BDR = {
            top: {
                style: 'thin',
                color: {
                    rgb: '000000'
                }
            },
            bottom: {
                style: 'thin',
                color: {
                    rgb: '000000'
                }
            },
            left: {
                style: 'thin',
                color: {
                    rgb: '000000'
                }
            },
            right: {
                style: 'thin',
                color: {
                    rgb: '000000'
                }
            }
        };
        var sBanner = {
            font: {
                name: 'Arial',
                sz: 14,
                bold: true,
                color: {
                    rgb: 'FFFFFF'
                }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            },
            fill: {
                patternType: 'solid',
                fgColor: {
                    rgb: '1A3560'
                }
            },
            border: {}
        };
        var sH = {
            font: {
                name: 'Arial',
                sz: 11,
                bold: true,
                color: {
                    rgb: 'FFFFFF'
                }
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            },
            fill: {
                patternType: 'solid',
                fgColor: {
                    rgb: '2563EB'
                }
            },
            border: BDR
        };
        var sD = {
            font: {
                name: 'Arial',
                sz: 10
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            fill: {
                patternType: 'none'
            },
            border: BDR
        };
        var sDTxt = {
            font: {
                name: 'Arial',
                sz: 10
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            numFmt: '@',
            fill: {
                patternType: 'none'
            },
            border: BDR
        };
        var sDDt = {
            font: {
                name: 'Arial',
                sz: 10
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            numFmt: 'dd\.mm\.yyyy',
            fill: {
                patternType: 'none'
            },
            border: BDR
        };
        var sDTL = {
            font: {
                name: 'Arial',
                sz: 10
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            numFmt: '"₺"#,##0.00',
            fill: {
                patternType: 'none'
            },
            border: BDR
        };
        var sT = {
            font: {
                name: 'Calibri',
                sz: 11,
                bold: true
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            numFmt: '@',
            fill: {
                patternType: 'solid',
                fgColor: {
                    rgb: 'FFFF00'
                }
            },
            border: BDR
        };
        var sTV = {
            font: {
                name: 'Calibri',
                sz: 11,
                bold: true
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            },
            numFmt: '"₺"#,##0.00',
            fill: {
                patternType: 'solid',
                fgColor: {
                    rgb: 'FFFF00'
                }
            },
            border: BDR
        };
        var ws = {};
        var maxR = 0;

        function put(r, c, v, t, s, z) {
            var ref = enc({
                r: r,
                c: c
            });
            ws[ref] = {
                v: v,
                t: t || 's',
                s: s
            };
            if (z) ws[ref].z = z;
            if (r > maxR) maxR = r;
        }
        put(0, 0, headerText, 's', sBanner);
        for (var ci = 1; ci <= 13; ci++) put(0, ci, '', 's', sBanner);
        var HDRS = ['TİP', 'YIL', 'KOD', 'NMN.ALINIŞ TARİHİ', 'DENEYİ TALEP EDEN', 'YAPI SAHİBİ', 'YİBF', 'YAPI BÖLÜMÜ', 'BLOK', 'm³', 'ADET', 'CİNS', 'SINIFI', 'FİYAT'];
        HDRS.forEach(function (h, c) {
            put(1, c, h, 's', sH);
        });
        data.forEach(function (r, idx) {
            var row = idx + 2;
            var tSrl = null;
            if (r['NMN.ALINIŞ TARİHİ']) {
                var d = new Date(r['NMN.ALINIŞ TARİHİ']);
                if (!isNaN(d)) tSrl = (d.getTime() - new Date(Date.UTC(1899, 11, 30)).getTime()) / 86400000;
            }
            put(row, 0, r['TİP'] || '', 's', sD);
            put(row, 1, r['YIL'] ? Number(r['YIL']) : 0, 'n', sD);
            put(row, 2, (r['KOD'] || '').toString(), 's', sDTxt, '@');
            if (tSrl) ws[enc({
                r: row,
                c: 3
            })] = {
                v: tSrl,
                t: 'n',
                s: sDDt,
                z: 'dd\.mm\.yyyy'
            };
            else put(row, 3, '', 's', sD);
            put(row, 4, r['YAPI DENETİM'] || r['DENEYİ TALEP EDEN'] || '', 's', sD);
            put(row, 5, r['YAPI SAHİBİ'] || '', 's', sD);
            put(row, 6, (r['YİBF'] || '').toString(), 's', sD);
            put(row, 7, r['YAPI BÖLÜMÜ'] || '', 's', sD);
            put(row, 8, (r['BLOK'] || '').toString(), 's', sDTxt, '@');
            var m3 = parseFloat(r['m³']);
            put(row, 9, isNaN(m3) ? '' : m3, isNaN(m3) ? 's' : 'n', sD);
            var adet = parseFloat(r['ADET']);
            put(row, 10, isNaN(adet) ? '' : adet, isNaN(adet) ? 's' : 'n', sD);
            put(row, 11, r['CİNS'] || '', 's', sD);
            put(row, 12, (r['SINIFI'] || '').toString(), 's', sDTxt, '@');
            var fiyat = r._fiyat || 0;
            ws[enc({
                r: row,
                c: 13
            })] = {
                v: fiyat,
                t: 'n',
                s: sDTL,
                z: '"₺"#,##0.00'
            };
            if (row > maxR) maxR = row;
        });
        var totRow = data.length + 2,
            kdvRow = data.length + 3;
        maxR = kdvRow;
        var tot = data.reduce(function (s, r) {
            return s + (r._fiyat || 0);
        }, 0);
        ws[enc({
            r: totRow,
            c: 12
        })] = {
            v: 'TOPLAM',
            t: 's',
            s: sT,
            z: '@'
        };
        ws[enc({
            r: totRow,
            c: 13
        })] = {
            v: tot,
            t: 'n',
            s: sTV,
            z: '"₺"#,##0.00'
        };
        ws[enc({
            r: kdvRow,
            c: 12
        })] = {
            v: 'KDV DAHİL',
            t: 's',
            s: sT,
            z: '@'
        };
        ws[enc({
            r: kdvRow,
            c: 13
        })] = {
            v: tot * 1.2,
            t: 'n',
            s: sTV,
            z: '"₺"#,##0.00'
        };
        ws['!ref'] = XLSX.utils.encode_range({
            s: {
                r: 0,
                c: 0
            },
            e: {
                r: kdvRow,
                c: 13
            }
        });
        ws['!cols'] = [{
            wch: 6
        }, {
            wch: 5
        }, {
            wch: 8
        }, {
            wch: 18
        }, {
            wch: 20
        }, {
            wch: 25
        }, {
            wch: 12
        }, {
            wch: 40
        }, {
            wch: 8
        }, {
            wch: 7
        }, {
            wch: 6
        }, {
            wch: 12
        }, {
            wch: 10
        }, {
            wch: 14
        }];
        ws['!rows'] = [{
            hpt: 30
        }];
        for (var ri = 0; ri < kdvRow; ri++) ws['!rows'].push({
            hpt: 15
        });
        ws['!merges'] = [{
            s: {
                r: 0,
                c: 0
            },
            e: {
                r: 0,
                c: 13
            }
        }];
        var sn = ownerName.substring(0, 31);
        wb.SheetNames.push(sn);
        wb.Sheets[sn] = ws;
        return wb;
    }

    // ── İNDİR ──
    function downloadAll() {
        var owners_arr = Object.keys(selectedOwners);
        var i = 0;
        var dlCol = groupMode;
        if (groupMode === 'YAPI DENETİM') dlCol = 'DENEYİ TALEP EDEN';
        if (groupMode === 'BETON FİRMASI') dlCol = 'BETON';

        function next() {
            if (i >= owners_arr.length) {
                toast('Tüm dosyalar indirildi! ✓', 'ok');
                logAction('Tüm cari dosyalarını indirdi');
                return;
            }
            var owner = owners_arr[i++];
            var od = (filteredData || []).filter(function (r) {
                if (groupMode === 'YAPI SAHİBİ') return (r['YAPI SAHİBİ'] || '').toString().trim() === owner;
                return (r[dlCol] || '').toString().trim() === owner;
            });
            if (od.length > 0) {
                var wb = buildWb(od, owner);
                XLSX.writeFile(wb, toFileName(owner) + '.xlsx', {
                    bookSST: false
                });
            }
            setTimeout(next, 500);
        }
        next();
    }

    function downloadMerged() {
        var wb = {
            SheetNames: [],
            Sheets: {}
        };
        var dlCol = groupMode;
        if (groupMode === 'YAPI DENETİM') dlCol = 'DENEYİ TALEP EDEN';
        if (groupMode === 'BETON FİRMASI') dlCol = 'BETON';
        Object.keys(selectedOwners).forEach(function (owner) {
            var od = (filteredData || []).filter(function (r) {
                if (groupMode === 'YAPI SAHİBİ') return (r['YAPI SAHİBİ'] || '').toString().trim() === owner;
                return (r[dlCol] || '').toString().trim() === owner;
            });
            if (!od.length) return;
            var tmp = buildWb(od, owner);
            var sn = tmp.SheetNames[0];
            wb.SheetNames.push(sn);
            wb.Sheets[sn] = tmp.Sheets[sn];
        });
        var from = document.getElementById('dateFrom').value;
        var to = document.getElementById('dateTo').value;
        XLSX.writeFile(wb, 'Cari_' + from + '_' + to + '.xlsx', {
            bookSST: false
        });
        toast('İndirildi! ✓', 'ok');
        logAction('Birleştirilmiş cari dosyası indirdi');
    }

    // ── SÖZLEŞMELİ FİRMALAR ──
    var sfData = [];
    function loadSF() { if (!sfData || !sfData.length) sfData = lsGet('alibey_sf') || []; }
    function saveSFData() { lsSet('alibey_sf', sfData); }
    function saveSF() {
        var ad = (document.getElementById('sfAd').value || '').trim();
        if (!ad) { toast('Firma adı girin', 'err'); return; }
        var idx = parseInt(document.getElementById('sfIdx').value);
        var obj = {
            ad: ad, ys: (document.getElementById('sfYS').value || '').trim(),
            beton: parseFloat(document.getElementById('sfBeton').value) || 0,
            celik: parseFloat(document.getElementById('sfCelik').value) || 0,
            karot: parseFloat(document.getElementById('sfKarot').value) || 0,
            pazar: parseFloat(document.getElementById('sfPazar').value) || 0,
            pasif: (idx >= 0 && idx < sfData.length) ? !!(sfData[idx].pasif) : false
        };
        if (idx >= 0 && idx < sfData.length) { sfData[idx] = obj; toast('Firma güncellendi', 'ok'); }
        else { sfData.push(obj); toast('Firma eklendi', 'ok'); }
        saveSFData(); fbSaveSF(obj); renderSF(); clearSF();
    }
    function clearSF() {
        document.getElementById('sfIdx').value = '-1';
        ['sfAd', 'sfYS', 'sfBeton', 'sfCelik', 'sfKarot', 'sfPazar'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
        var btn = document.getElementById('sfBtn'); if (btn) btn.textContent = '➕ Firma Ekle';
    }
    function editSF(i) {
        var f = sfData[i]; if (!f) return;
        document.getElementById('sfIdx').value = i;
        document.getElementById('sfAd').value = f.ad || ''; document.getElementById('sfYS').value = f.ys || '';
        document.getElementById('sfBeton').value = f.beton || ''; document.getElementById('sfCelik').value = f.celik || '';
        document.getElementById('sfKarot').value = f.karot || ''; document.getElementById('sfPazar').value = f.pazar || '';
        document.getElementById('sfBtn').textContent = '💾 Güncelle';
        document.getElementById('sfAd').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function deleteSF(i) {
        showConfirm('Firma Sil', sfData[i].ad + ' silinsin mi?', function () {
            var _delSF = sfData[i]; sfData.splice(i, 1); saveSFData();
            if (_delSF) fbDeleteSF(_delSF.ad);
            renderSF(); toast('Firma silindi', 'info');
        });
    }
    function useSF(i) {
        var f = sfData[i]; if (!f) return;
        if (!allData.length) { toast('Önce rapor defteri yükleyin', 'err'); return; }
        switchGroupMode('YAPI SAHİBİ'); selectedOwners = {};
        var ysList = (f.ys || '').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
        owners.forEach(function (o) {
            var name = o[0].toUpperCase();
            ysList.forEach(function (ys) { if (name.indexOf(ys) >= 0 || ys.indexOf(name) >= 0) selectedOwners[o[0]] = true; });
        });
        renderOwners(''); renderTags();
        var btn2 = document.getElementById('btn2'); if (btn2) btn2.disabled = Object.keys(selectedOwners).length === 0;
        window._sfPrices = { beton: f.beton, celik: f.celik, karot: f.karot, pazar: f.pazar };
        toast(f.ad + ' için ' + Object.keys(selectedOwners).length + ' yapı sahibi seçildi', 'ok'); goNav(2);
    }
    function renderSF() {
        loadSF(); var tb = document.getElementById('sfList'); if (!tb) return;
        if (!sfData.length) { tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--tx3);padding:18px">Henüz firma eklenmedi</td></tr>'; return; }
        tb.innerHTML = sfData.map(function (f, i) {
            var ysShort = (f.ys || '—').length > 30 ? f.ys.substring(0, 30) + '…' : (f.ys || '—');
            var pasifBadge = f.pasif ? '<span style="display:inline-block;background:var(--red-d,#3b1a1a);color:var(--red);border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700">😴 PASİF</span>'
                : '<span style="display:inline-block;background:var(--grn-d,#14291a);color:var(--grn);border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700">✅ AKTİF</span>';
            var rowStyle = f.pasif ? 'opacity:0.55' : '';
            return '<tr style="' + rowStyle + '">' +
                '<td style="width:30px"><input type="checkbox" class="sfChk" data-idx="' + i + '" onchange="sfSelChange()"></td>' +
                '<td style="font-weight:600;color:var(--acc2)">' + f.ad + '</td>' +
                '<td style="font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ysShort + '</td>' +
                '<td>' + (f.beton || 0).toLocaleString('tr-TR') + ' ₺</td>' +
                '<td>' + (f.celik || 0).toLocaleString('tr-TR') + ' ₺</td>' +
                '<td>' + (f.karot || 0).toLocaleString('tr-TR') + ' ₺</td>' +
                '<td>' + (f.pazar || 0).toLocaleString('tr-TR') + ' ₺</td>' +
                '<td>' + pasifBadge + '</td>' +
                '<td style="white-space:nowrap">' +
                '<button class="btn btn-p" style="padding:3px 8px;font-size:10px;margin-right:4px" onclick="useSF(' + i + ')">📋 Cari</button>' +
                '<button class="btn btn-o" style="padding:3px 6px;font-size:10px;margin-right:2px" onclick="editSF(' + i + ')">✏️</button>' +
                '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;color:var(--red)" onclick="deleteSF(' + i + ')">🗑</button>' +
                '</td></tr>';
        }).join('');
        sfClearSel();
    }
    function sfGetSelIndices() { var chks = document.querySelectorAll('.sfChk:checked'); return Array.prototype.map.call(chks, function (c) { return parseInt(c.getAttribute('data-idx')); }); }
    function sfSelChange() { var sel = sfGetSelIndices(); var bar = document.getElementById('sfBulkBar'), cnt = document.getElementById('sfSelCount'); if (bar) bar.style.display = sel.length > 0 ? 'flex' : 'none'; if (cnt) cnt.textContent = sel.length + ' seçili'; }
    function sfToggleAll(checked) { var chks = document.querySelectorAll('.sfChk'); Array.prototype.forEach.call(chks, function (c) { c.checked = checked; }); sfSelChange(); }
    function sfClearSel() { sfToggleAll(false); var chkAll = document.getElementById('sfChkAll'); if (chkAll) chkAll.checked = false; }
    function bulkSFPassive() { var indices = sfGetSelIndices(); if (!indices.length) return; indices.forEach(function (i) { sfData[i].pasif = true; fbSaveSF(sfData[i]); }); saveSFData(); sfClearSel(); renderSF(); toast(indices.length + ' firma pasif yapıldı', 'info'); }
    function bulkSFActive() { var indices = sfGetSelIndices(); if (!indices.length) return; indices.forEach(function (i) { sfData[i].pasif = false; fbSaveSF(sfData[i]); }); saveSFData(); sfClearSel(); renderSF(); toast(indices.length + ' firma aktif yapıldı', 'ok'); }
    function bulkSFDelete() { var indices = sfGetSelIndices(); if (!indices.length) return; showConfirm('Toplu Sil', indices.length + ' firma silinsin mi?', function () { indices.sort(function (a, b) { return b - a; }).forEach(function (i) { var f = sfData[i]; if (f) { fbDeleteSF(f.ad); } sfData.splice(i, 1); }); saveSFData(); sfClearSel(); renderSF(); toast(indices.length + ' firma silindi', 'info'); }); }

    function calcFH() {
        var alan = parseFloat((document.getElementById('fhAlan') || {}).value) || 0;
        var el = document.getElementById('fhResult'); if (!el || !alan) { if(el) el.innerHTML = ''; return; }
        var tbl = [[0, 500, 40000], [501, 1000, 45000], [1001, 1500, 52000], [1501, 2000, 60000], [2001, 2500, 68000], [2501, 3000, 91000]];
        var birim = 0;
        for (var i = 0; i < tbl.length; i++) { if (alan >= tbl[i][0] && alan <= tbl[i][1]) { birim = tbl[i][2]; break; } }
        if (alan > 3000) birim = 91000;
        var kdv = birim * 0.2;
        el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">LİSTE FİYATI</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--tx)">' + birim.toLocaleString('tr-TR') + ' ₺</div></div>' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">KDV DAHİL</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--grn)">' + (birim + kdv).toLocaleString('tr-TR') + ' ₺</div></div></div>' +
            '<button class="btn btn-p" style="margin-top:10px;width:100%" onclick="pushToTeklif(\'Peşin\',' + alan + ',' + birim + ')">📤 Teklife Aktar</button>';
    }
    function calcKazik() {
        var dok = parseFloat((document.getElementById('kDok') || {}).value) || 0, cel = parseFloat((document.getElementById('kCelik') || {}).value) || 0;
        var dokBF = parseFloat((document.getElementById('kDokBF') || {}).value) || 275, celBF = parseFloat((document.getElementById('kCelBF') || {}).value) || 4000;
        var el = document.getElementById('kResult'); if (!el || (!dok && !cel)) { if(el) el.innerHTML = ''; return; }
        var dokT = dok * 12 * dokBF, celT = cel * celBF, top = dokT + celT;
        el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">DÖKÜM</div><div style="font-family:var(--fd);font-size:14px;font-weight:700;color:var(--tx)">' + dokT.toLocaleString('tr-TR') + ' ₺</div></div>' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">ÇELİK</div><div style="font-family:var(--fd);font-size:14px;font-weight:700;color:var(--tx)">' + celT.toLocaleString('tr-TR') + ' ₺</div></div>' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">TOPLAM</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--grn)">' + top.toLocaleString('tr-TR') + ' ₺</div></div></div>' +
            '<button class="btn btn-p" style="margin-top:10px;width:100%" onclick="pushToTeklif(\'Kazık\',0,' + top + ')">📤 Teklife Aktar</button>';
    }
    function calcIstinat() {
        var dok = parseFloat((document.getElementById('iDok') || {}).value) || 0, cel = parseFloat((document.getElementById('iCelik') || {}).value) || 0;
        var dokBF = parseFloat((document.getElementById('iDokBF') || {}).value) || 275, celBF = parseFloat((document.getElementById('iCelBF') || {}).value) || 4000;
        var el = document.getElementById('iResult');
        if (!el || (!dok && !cel)) { if(el) el.innerHTML = ''; return; }
        var dokT = dok * 12 * dokBF, celT = cel * celBF, top = dokT + celT;
        el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">DÖKÜM</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--tx)">' + dokT.toLocaleString('tr-TR') + ' ₺</div></div>' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">ÇELİK</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--tx)">' + celT.toLocaleString('tr-TR') + ' ₺</div></div>' +
            '<div style="text-align:center;padding:10px;background:var(--sur2);border-radius:8px"><div style="font-size:10px;color:var(--tx3)">TOPLAM</div><div style="font-family:var(--fd);font-size:18px;font-weight:700;color:var(--grn)">' + top.toLocaleString('tr-TR') + ' ₺</div></div></div>' +
            '<button class="btn btn-p" style="margin-top:10px;width:100%" onclick="pushToTeklif(\'İstinat\',0,' + top + ')">📤 Teklife Aktar</button>';
    }

    function pushToTeklif(tip, alan, tablo) {
        var name = tip + (alan ? ' (' + alan + ' m²)' : '');
        offerItems.push({ name: name, price: Math.round(tablo), qty: 1, _type: tip });
        var totalTablo = offerItems.reduce(function(s, it){ return s + (it.price * it.qty); }, 0);
        var tabloEl = document.getElementById('prTablo');
        if (tabloEl) tabloEl.value = Math.round(totalTablo);
        renderOfferItems();
        calcIskonto();
        toast(tip + ' teklife eklendi ✓', 'ok');
    }

    var offerItems = [];
    function renderOfferItems() {
        var list = document.getElementById('offerItemsList');
        if (!list) return;
        if (!offerItems.length) { list.innerHTML = '<div style="font-size:11px;color:var(--tx3);text-align:center;padding:10px">Henüz kalem eklenmedi</div>'; return; }
        list.innerHTML = offerItems.map(function(it, idx){
            return '<div style="display:flex;align-items:center;gap:8px;background:var(--p-bg);padding:8px 12px;border-radius:8px;border:1px solid var(--bdr2)">' +
                '<span style="flex:1;font-size:12px">' + it.name + '</span>' +
                '<strong style="font-size:12px">' + it.price.toLocaleString('tr-TR') + ' ₺</strong>' +
                '<button onclick="offerItems.splice(' + idx + ',1);renderOfferItems();calcIskonto()" style="background:none;border:none;color:var(--red);cursor:pointer">✕</button></div>';
        }).join('');
    }

    // İlk viewPR tanımı kaldırıldı — tek tanım aşağıda (viewPR sadece bir kez tanımlanmalı)

    function removeKalem(idx) {
        teklifItems.splice(idx, 1);
        var toplam = teklifItems.reduce(function (s, it) {
            return s + it.tablo;
        }, 0);
        var tabloEl = document.getElementById('prTablo');
        if (tabloEl) tabloEl.value = toplam ? Math.round(toplam) : '';
        // Update tip
        var tips = {};
        teklifItems.forEach(function (it) {
            tips[it.tip] = true;
        });
        var tipKeys = Object.keys(tips);
        var tipSel = document.getElementById('prTip');
        if (tipSel && tipKeys.length) {
            var selTip = tipKeys.length === 1 ? tipKeys[0] : 'Karma';
            for (var i = 0; i < tipSel.options.length; i++) {
                if (tipSel.options[i].value === selTip) {
                    tipSel.selectedIndex = i;
                    break;
                }
            }
        }
        renderKalemler();
        calcIskonto();
    }

    function clearKalemler() {
        teklifItems = [];
        var tabloEl = document.getElementById('prTablo');
        if (tabloEl) tabloEl.value = '';
        renderKalemler();
        calcIskonto();
        toast('Kalemler temizlendi', 'info');
    }

    // ── İSKONTO TOGGLE ──
    function toggleIskTip(tip) {
        iskTip = tip;
        document.getElementById('iskBtn-pct').classList.toggle('on', tip === 'pct');
        document.getElementById('iskBtn-tl').classList.toggle('on', tip === 'tl');
        var lbl = document.getElementById('iskLabel');
        var iskInput = document.getElementById('prIsk');
        var iskTLInput = document.getElementById('prIskTL');
        if (tip === 'pct') {
            if (lbl) lbl.textContent = 'İskonto (%)';
            if (iskInput) {
                iskInput.placeholder = '0';
                iskInput.readOnly = false;
                iskInput.style.opacity = '1';
            }
            if (iskTLInput) {
                iskTLInput.readOnly = true;
                iskTLInput.style.opacity = '.6';
            }
        } else {
            if (lbl) lbl.textContent = 'İskonto (₺)';
            if (iskInput) {
                iskInput.readOnly = true;
                iskInput.style.opacity = '.6';
            }
            if (iskTLInput) {
                iskTLInput.readOnly = false;
                iskTLInput.style.opacity = '1';
                iskTLInput.placeholder = '0';
                iskTLInput.oninput = function () {
                    calcIskonto();
                };
            }
        }
        // Clear and recalculate
        if (iskInput) iskInput.value = '';
        if (iskTLInput) iskTLInput.value = '';
        calcIskonto();
    }

    function viewPR(idx) {
        var p = prData[idx];
        if (!p) return;

        var items = p.items || (p.adet ? [{name: p.adetAc||'Adet', price: parseFloat(p.adet)||0, qty:1}] : []);
        var brut = parseFloat(p.tablo) || items.reduce(function(s,it){return s+(it.price*it.qty);},0);
        var net = parseFloat(p.net) || brut;
        var iskTutar = brut - net;
        var kdv = net * 0.2;
        var total = net + kdv;
        var refID = 'P-' + (p._id || idx).toString().slice(-8).toUpperCase();

        // ── Özet Kartı ──────────────────────────────────────────────
        var set = function(id, val) { var e = document.getElementById(id); if(e) e.textContent = val; };
        set('psID',    refID);
        set('psFirma', p.mu);
        set('psTotal', total.toLocaleString('tr-TR') + ' ₺');
        var psItemsEl = document.getElementById('psItems');
        if (psItemsEl) psItemsEl.innerHTML = items.map(function(it) {
            return '<div style="display:flex;justify-content:space-between;font-size:13px;padding-bottom:8px;border-bottom:1px solid var(--bdr2)">' +
                '<span>' + it.name + ' <small>(' + it.qty + ' adet)</small></span>' +
                '<strong>' + (it.price * it.qty).toLocaleString('tr-TR') + ' ₺</strong></div>';
        }).join('');

        // ── Resmi Teklif Formu ───────────────────────────────────────
        set('pvID',            refID);
        set('pvFirma',         p.mu);
        set('pvTarihPrint',    p.tarih || new Date().toLocaleDateString('tr-TR'));
        set('pvTip',           p.tip || '—');
        set('pvAlan',          p.alan ? p.alan + ' m²' : '—');
        set('pvVade',          p.vade || 'Peşin');
        set('pvGecerlilik',    p.gecerlilik || '7 Gün');
        set('pvYetkili',       p.yetkili || 'Alibey Lab Yetkilisi');
        set('pvCikti',         new Date().toLocaleString('tr-TR') + ' (Digital)');
        set('pvAraTop',        brut.toLocaleString('tr-TR') + ' ₺');
        set('pvIskLabel',      '(' + (p.isk || '%0') + ')');
        set('pvIskVal',        (iskTutar > 0 ? iskTutar.toLocaleString('tr-TR') : '0') + ' ₺');
        set('pvMatrah',        net.toLocaleString('tr-TR') + ' ₺');
        set('pvKdvPrint',      kdv.toLocaleString('tr-TR') + ' ₺');
        set('pvTotalPrint',    total.toLocaleString('tr-TR') + ' ₺');
        var pvNotEl = document.getElementById('pvNot');
        if (pvNotEl) pvNotEl.textContent = p.not || "Sayın ilgili, yukarıda belirtilen hizmetlerin laboratuvarımız tarafından titizlikle yürütüleceğini beyan eder, teklifimizin değerlendirilmesini saygılarımızla arz ederiz.\n\n* Belirtilen fiyatlara KDV (%20) dahil değildir.\n* Teklif geçerlilik süresi içinde onaylanması rica olunur.";
        var pvItemsEl = document.getElementById('pvItemsList');
        if (pvItemsEl) pvItemsEl.innerHTML = items.map(function(it) {
            var sub = it.price * it.qty;
            return '<tr><td style="padding:10px 15px;border:1px solid #e2e8f0">' + it.name + '</td>' +
                '<td style="padding:10px 15px;text-align:center;border:1px solid #e2e8f0">' + it.qty + '</td>' +
                '<td style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0">' + it.price.toLocaleString('tr-TR') + ' ₺</td>' +
                '<td style="padding:10px 15px;text-align:right;border:1px solid #e2e8f0;font-weight:600">' + sub.toLocaleString('tr-TR') + ' ₺</td></tr>';
        }).join('');

        // Modalı aç — önce özet kart görünür
        var modal = document.getElementById('prViewModal');
        var sumCard = document.getElementById('prSummaryCard');
        var printDiv = document.getElementById('printableOffer');
        if (modal) modal.style.display = 'block';
        if (sumCard) sumCard.style.display = 'block';
        if (printDiv) printDiv.style.display = 'none';
    }

    function showOfficialProposal() {
        var sc = document.getElementById('prSummaryCard'), po = document.getElementById('printableOffer');
        if (sc) sc.style.display = 'none'; if (po) po.style.display = 'block';
    }
    function hideOfficialProposal() {
        var sc = document.getElementById('prSummaryCard'), po = document.getElementById('printableOffer');
        if (po) po.style.display = 'none'; if (sc) sc.style.display = 'block';
    }
    function closePRView() {
        var modal = document.getElementById('prViewModal');
        if (modal) modal.style.display = 'none';
    }

    // ── İSKONTO HESAPLA ──
    var offerItems = [];
    function addOfferItem(name, price, qty) {
        offerItems.push({ name: name || '', price: price || 0, qty: qty || 1 });
        renderOfferItems();
        calcIskonto();
    }
    function renderOfferItems() {
        var cont = document.getElementById('offerItemsList');
        if (!cont) return;
        cont.innerHTML = offerItems.map(function(item, idx) {
            return '<div style="display:flex;gap:6px;align-items:center;background:var(--sur);padding:6px;border-radius:6px;border:1px solid var(--bdr2)">' +
                '<input type="text" class="pi" style="flex:2;font-size:11px" placeholder="Kalem (örn: Yol)" value="'+item.name+'" oninput="offerItems['+idx+'].name=this.value">' +
                '<input type="number" class="pi" style="flex:1;font-size:11px" placeholder="Fiyat" value="'+item.price+'" oninput="offerItems['+idx+'].price=parseFloat(this.value)||0;calcIskonto()">' +
                '<input type="number" class="pi" style="width:50px;font-size:11px" placeholder="Adet" value="'+item.qty+'" oninput="offerItems['+idx+'].qty=parseFloat(this.value)||0;calcIskonto()">' +
                '<button class="btn btn-g" style="color:var(--red);padding:2px 6px" onclick="offerItems.splice('+idx+',1);renderOfferItems();calcIskonto()">✕</button>' +
                '</div>';
        }).join('');
    }

    function calcIskonto() {
        // Tablo fiyatını kalemlerden hesapla
        var tablo = offerItems.reduce(function(s, i) { return s + (i.price * i.qty); }, 0);
        var prTabloInput = document.getElementById('prTablo');
        if (prTabloInput) prTabloInput.value = tablo || '';

        var iskInput = document.getElementById('prIsk');
        var iskTLInput = document.getElementById('prIskTL');
        var netEl = document.getElementById('prNet');
        var kdvEl = document.getElementById('prKdv');
        var iskVal = parseFloat((iskInput || {}).value) || 0;
        var iskTLVal = parseFloat((iskTLInput || {}).value) || 0;
        var net = tablo;
        if (iskTip === 'pct') {
            var tlAmount = tablo * iskVal / 100;
            if (iskTLInput) iskTLInput.value = tlAmount ? Math.round(tlAmount) : '';
            net = tablo - tlAmount;
        } else {
            if (iskInput) iskInput.value = tablo > 0 ? Math.round(iskTLVal / tablo * 100) : '';
            net = tablo - iskTLVal;
        }
        if (net < 0) net = 0;
        var kdv = net * 0.2;
        if (netEl) netEl.value = net ? Math.round(net) : '';
        if (kdvEl) kdvEl.value = net ? Math.round(net + kdv) : '';
    }

    // ── TEKLİF KAYIT ──
    function loadPR() {
        // prData Firestore'dan gelir (fbPullPR). Sadece boşsa localStorage fallback.
        if (!prData || !prData.length) prData = lsGet('alibey_pr') || [];
    }

    function savePRData() {
        // Sadece Firestore'a kaydediliyor (fbSavePR) — localStorage yok
    }

    var _prEditIdx = -1; // -1 = yeni kayıt, >=0 = düzenleme modu

    function savePR() {
        var mu = (document.getElementById('prMu').value || '').trim();
        if (!mu) {
            toast('Müşteri/firma adı zorunlu', 'err');
            return;
        }
        var iskDisplay = iskTip === 'pct' ?
            '%' + ((document.getElementById('prIsk') || {}).value || '0') :
            ((document.getElementById('prIskTL') || {}).value || '0') + ' ₺';

        if (_prEditIdx >= 0) {
            var existing = prData[_prEditIdx];
            existing.mu = mu;
            existing.tip = (document.getElementById('prTip') || {}).value || '';
            existing.alan = (document.getElementById('prAlan') || {}).value || '';
            existing.tablo = (document.getElementById('prTablo') || {}).value || '';
            existing.isk = iskDisplay;
            existing.net = (document.getElementById('prNet') || {}).value || '';
            existing.kdv = (document.getElementById('prKdv') || {}).value || '';
            existing.items = JSON.parse(JSON.stringify(offerItems));
            existing.not = (document.getElementById('prNot') || {}).value || '';
            savePRData();
            fbSavePR(existing);
            renderPR();
            clearPR();
            toast('Teklif güncellendi ✅', 'ok');
            logAction('Teklif güncelledi: ' + mu);
        } else {
            var obj = {
                mu: mu,
                tip: (document.getElementById('prTip') || {}).value || '',
                alan: (document.getElementById('prAlan') || {}).value || '',
                tablo: (document.getElementById('prTablo') || {}).value || '',
                isk: iskDisplay,
                net: (document.getElementById('prNet') || {}).value || '',
                kdv: (document.getElementById('prKdv') || {}).value || '',
                items: JSON.parse(JSON.stringify(offerItems)),
                not: (document.getElementById('prNot') || {}).value || '',
                tarih: new Date().toLocaleDateString('tr-TR'),
                durum: 'beklemede'
            };
            prData.push(obj);
            savePRData();
            fbSavePR(obj);
            renderPR();
            clearPR();
            toast('Teklif kaydedildi', 'ok');
            logAction('Yeni teklif kaydetti: ' + mu + ' - ' + obj.tip);
        }
    }

    function editPR(idx) {
        var p = prData[idx];
        if (!p) return;

        // Fiyat hesaplama formu bu sayfada yoksa, veriyi localStorage'a bırak ve oraya git
        if (!document.getElementById('prMu')) {
            localStorage.setItem('_prPendingEditId', p.id || '');
            if (window.location.pathname !== '/fiyat') window.location.href = '/fiyat';
            return;
        }

        _prEditIdx = idx;
        // Formu doldur
        var set = function (id, val) { var e = document.getElementById(id); if (e) e.value = val || ''; };
        set('prMu', p.mu);
        set('prAlan', p.alan);
        set('prTablo', p.tablo);
        set('prNet', p.net);
        set('prKdv', p.kdv);
        set('prNot', p.not);
        offerItems = p.items ? JSON.parse(JSON.stringify(p.items)) : (p.adet ? [{name: p.adetAc||'Adet', price: parseFloat(p.adet)||0, qty:1}] : []);
        renderOfferItems();
        // İskonto alanı
        if (p.isk && p.isk.indexOf('%') === 0) {
            iskTip = 'pct';
            set('prIsk', p.isk.replace('%', '').trim());
        } else if (p.isk && p.isk.indexOf('₺') >= 0) {
            iskTip = 'tl';
            set('prIskTL', p.isk.replace('₺', '').trim());
        }
        // Kaydet butonunu güncelle
        var btn = document.querySelector('[onclick="savePR()"]');
        if (btn) { btn.textContent = '✏️ Güncelle'; btn.style.background = 'var(--amb)'; }
        // Sayfayı forma kaydır
        var form = document.getElementById('prMu');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Düzenleme modu: ' + p.mu, 'info');
    }

    function loadPendingPREdit() {
        var pendingId = localStorage.getItem('_prPendingEditId');
        if (!pendingId || !document.getElementById('prMu')) return;
        localStorage.removeItem('_prPendingEditId');
        // Wait for prData to be populated (Firestore pull)
        var tries = 0;
        var check = function () {
            var idx = prData.findIndex(function (p) { return p.id === pendingId; });
            if (idx >= 0) { editPR(idx); return; }
            if (++tries < 30) setTimeout(check, 300);
        };
        setTimeout(check, 400);
    }

    function clearPR() {
        _prEditIdx = -1;
        offerItems = [];
        renderOfferItems();
        calcIskonto();
        ['prMu', 'prAlan', 'prTablo', 'prIsk', 'prIskTL', 'prNet', 'prKdv', 'prNot'].forEach(function (id) {
            var e = document.getElementById(id);
            if (e) e.value = '';
        });
        // Kaydet butonunu sıfırla
        var btn = document.querySelector('[onclick="savePR()"]');
        if (btn) { btn.textContent = '💾 Kaydet'; btn.style.background = ''; }
    }

    function renderPR() {
        // prData'yı önce Firestore'dan gelen yapıdan kullan.
        // Eğer boşsa localStorage'a geri dön (offline fallback).
        if (!prData || !prData.length) {
            prData = lsGet('alibey_pr') || [];
        }
        var tb = document.getElementById('prList');
        if (!tb) return;
        if (!prData.length) {
            tb.innerHTML = '<tr><td colspan="9" class="empty" style="padding:12px">Kayıt yok</td></tr>';
            return;
        }
        var q = ((document.getElementById('prSearch') || {}).value || '').toLowerCase();
        var fl = (document.getElementById('prFilt') || {}).value || 'all';
        var rows = (prData || []).filter(function (p, i) {
            if (q && p.mu.toLowerCase().indexOf(q) < 0) return false;
            if (fl !== 'all' && p.durum !== fl) return false;
            return true;
        });
        if (!rows.length) {
            tb.innerHTML = '<tr><td colspan="9" class="empty" style="padding:12px">Sonuç yok</td></tr>';
            return;
        }
        tb.innerHTML = rows.map(function (p) {
            var idx = prData.indexOf(p);
            var dc = p.durum === 'alindi' ? 'color:var(--grn)' : p.durum === 'alinmadi' ? 'color:var(--red)' : 'color:var(--amb)';
            var dl = p.durum === 'alindi' ? 'Alındı ✅' : p.durum === 'alinmadi' ? 'Alınmadı ❌' : 'Beklemede ⏳';
            var itemsSum = (p.items || []).map(function(it){ return it.name + ' (' + it.qty + ')'; }).join(', ');
            if(!itemsSum && p.adet) itemsSum = (p.adetAc||'Adet') + ' (' + p.adet + ')';
            return '<tr style="font-size:12px">' +
                '<td style="font-weight:700;color:var(--acc2)">' + p.mu + '</td>' +
                '<td>' + p.tip + '</td><td>' + (p.alan || '—') + '</td>' +
                '<td style="font-family:var(--fm)">' + (p.net || p.tablo || '—') + '</td>' +
                '<td>' + (p.isk || '—') + '</td>' +
                '<td colspan="2" style="color:var(--tx3);font-size:11px;word-break:break-word">' + (itemsSum || '—') + '</td>' +
                '<td style="color:var(--tx3)">' + p.tarih + '</td>' +
                '<td style="' + dc + '">' + dl + '</td>' +
                '<td style="min-width:150px;word-wrap:break-word;white-space:normal;color:var(--tx3)">' + (p.not || '—') + '</td>' +
                '<td><div style="display:flex;gap:4px">' +
                '<button class="btn btn-g" style="padding:3px 7px;font-size:10px" onclick="viewPR(' + idx + ')" title="Detaylı İncele">👁️</button>' +
                '<button class="btn btn-g" style="padding:3px 7px;font-size:10px" onclick="togglePRstat(' + idx + ')">🔄</button>' +
                '<button class="btn btn-g" style="padding:3px 7px;font-size:10px;color:var(--acc)" onclick="editPR(' + idx + ')">✏️</button>' +
                '<button class="btn btn-g" style="padding:3px 7px;font-size:10px;color:var(--red)" onclick="deletePR(' + idx + ')">🗑</button>' +
                '</div></td></tr>';
        }).join('');
    }

    function togglePRstat(idx) {
        var states = ['beklemede', 'alindi', 'alinmadi'];
        var cur = states.indexOf(prData[idx].durum);
        prData[idx].durum = states[(cur + 1) % 3];
        savePRData();
        fbSavePR(prData[idx]);
        renderPR();
    }

    function deletePR(idx) {
        var _delPR = prData[idx];
        prData.splice(idx, 1);
        savePRData();
        if (_delPR) fbDeletePR(_delPR);
        renderPR();
        toast('Silindi', 'info');
    }

    // ── ÇİP TAKİP ──

    // ── YARDIMCI FONKSİYONLAR ──────────────────────────────────────────────────
    function fmtDate(s) {
        if (!s) return '';
        try {
            var d = new Date(s);
            return isNaN(d) ? s : d.toLocaleDateString('tr-TR');
        } catch (e) {
            return s;
        }
    }


    // ── PASİF FİRMA ──────────────────────────────────────────────────────────────
    function togglePassive(ka) {
        if (!phoneBook[ka]) return;
        phoneBook[ka].pasif = !phoneBook[ka].pasif;
        savePB();
        // chipData'da da güncelle
        chipData.forEach(function (d) {
            if (d.firma === ka) d.pasif = phoneBook[ka].pasif;
        });
        lsSet('alibey_chip', {
            data: chipData,
            pb: phoneBook
        });
        var _pChip = chipData.filter(function (d) { return d.firma === ka; })[0];
        if (_pChip) fbSaveChip(_pChip);
        updateChipStats();
        renderChip();
        renderTelsEnhanced();
        toast(phoneBook[ka].pasif ? ka + ' pasif yapıldı' : ka + ' aktif yapıldı', 'info');
    }

    function toggleSmsOpt(b, f) {
        var d = chipData.filter(function (x) {
            if (b && x.belge === b) return true;
            if (!b && f && x.firma === f) return true;
            return false;
        })[0];
        if (!d) return;

        var currentSmsOff = !!(d.smsOff || (phoneBook[d.firma] || {}).smsOff || (phoneBook[d.belge] || {}).smsOff);
        var newVal = !currentSmsOff;
        d.smsOff = newVal;

        // Auto status shift as requested
        d.pasif = newVal;

        var ka = d.firma || b;
        if (phoneBook[ka]) {
            phoneBook[ka].smsOff = newVal;
            phoneBook[ka].pasif = newVal;
        }
        if (b && phoneBook[b]) {
            phoneBook[b].smsOff = newVal;
            phoneBook[b].pasif = newVal;
        }

        savePB();
        lsSet('alibey_chip', { data: chipData, pb: phoneBook });
        fbSaveChip(d);
        renderChip();
        renderTelsEnhanced();
        toast(newVal ? 'SMS Bildirimleri İptal Edildi & Pasife Alındı' : 'SMS Bildirimleri Açıldı & Aktif Edildi', 'info');
        logAction('SMS İzni Güncelledi: ' + ka);
    }

    // ── DATALIST DOLDURMA ────────────────────────────────────────────────────────
    function _fillDataLists() {
        var names = Object.keys(phoneBook).sort(function (a, b) {
            return a.localeCompare(b, 'tr');
        });
        var opts = names.map(function (n) {
            return '<option value="' + n.replace(/"/g, '&quot;') + '">';
        }).join('');
        ['coFirmaList', 'regFirmaList'].forEach(function (id) {
            var dl = document.getElementById(id);
            if (dl) dl.innerHTML = opts;
        });
    }

    // ── NULL-SAFE lsGet (2-param) ─────────────────────────────────────────────────
    // Overrides any previous single-param version at the bottom of the script

    function chipTab(tab) {
        ['izle', 'yukle', 'kayit', 'sablon', 'siparis', 'mesaj'].forEach(function (t) {
            var el = document.getElementById('ctp-' + t);
            if (el) el.style.display = t === tab ? 'block' : 'none';
            var btn = document.getElementById('ct-' + t);
            if (btn) btn.classList.toggle('on', t === tab);
        });
        if (tab === 'izle' && typeof updateNetgsmBalance === 'function') updateNetgsmBalance();
        if (tab === 'kayit') { renderTelsEnhanced(); _fillDataLists(); updateNetgsmBalance(); }
        if (tab === 'sablon') loadSablon();
        if (tab === 'siparis') { clearChipOrderForm(); renderChipOrders(); _fillDataLists(); }
        if (tab === 'mesaj') { renderMsgLog(); fbPullMsgLog(); updateNetgsmBalance(); }

    }

    function readCSV(file) {
        if (!file) return;
        var r = new FileReader();
        r.onload = function (e) {
            try {
                parseCSVEnhanced(e.target.result, file.name);
            } catch (err) {
                toast('CSV okunamadı: ' + err.message, 'err');
            }
        };
        r.readAsText(file, 'utf-8');
    }

    function parseCSV(text, fname) {
        var clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        var lines = clean.split('\n').filter(function (l) {
            return l.trim();
        });
        if (lines.length < 2) {
            toast('CSV boş', 'err');
            return;
        }
        var sep = lines[0].indexOf(';') >= 0 ? ';' : ',';

        function _csvPr(l) {
            var p = [],
                c = '',
                q = false;
            for (var i = 0; i < l.length; i++) {
                var ch = l[i];
                if (ch === '"') q = !q;
                else if (ch === sep && !q) {
                    p.push(c.trim().replace(/^"|"$/g, ''));
                    c = '';
                } else c += ch;
            }
            p.push(c.trim().replace(/^"|"$/g, ''));
            return p;
        }
        var hdr = _csvPr(lines[0]).map(function (h) {
            return h.toLowerCase().replace(/\s+/g, '');
        });
        var cF = -1,
            cB = -1,
            cT = -1,
            cK = -1,
            cKl = -1;
        hdr.forEach(function (h, i) {
            if (h.indexOf('müteahhit') >= 0 && h.indexOf('firma') >= 0) cF = i;
            else if (h.indexOf('belge') >= 0) cB = i;
            else if (h.indexOf('toplam') >= 0) cT = i;
            else if (h.indexOf('kullan') >= 0) cK = i;
            else if (h.indexOf('kalan') >= 0) cKl = i;
        });
        if (cF < 0 || cB < 0 || cKl < 0) {
            toast('Kolon yapısı tanınamadı', 'err');
            return;
        }
        var nd = [];
        for (var i = 1; i < lines.length; i++) {
            var row = _csvPr(lines[i]);
            if (row.length < 3) continue;
            var firma = row[cF] || '';
            var belge = (row[cB] || '').replace(/\D/g, '');
            var top = parseInt(row[cT]) || 0,
                kul = parseInt(row[cK]) || 0,
                kal = parseInt(row[cKl]) || 0;
            if (!firma || !belge) continue;
            var pb = phoneBook[belge] || {};
            nd.push({
                firma: firma,
                belge: belge,
                top: top,
                kul: kul,
                kal: kal,
                tel: pb.tel || '',
                dt: pb.dt || ''
            });
            if (!phoneBook[belge]) phoneBook[belge] = {
                firma: firma,
                tel: '',
                dt: ''
            };
            else phoneBook[belge].firma = firma;
        }
        chipData = nd;
        lsSet('alibey_chip', {
            data: chipData,
            pb: phoneBook
        });
        updateChipStats();
        renderChip();
        var cu = document.getElementById('chipUZ');
        if (cu) {
            cu.classList.add('ok');
            cu.innerHTML = '<div class="fr"><div class="fic">✅</div><div><div class="fn2">' + fname + '</div><div class="fm2">' + nd.length + ' firma · ' + nd.filter(function (d) {
                return d.kal < 50;
            }).length + ' kritik</div></div></div>';
        }
        toast(nd.length + ' firma yüklendi', 'ok');
        chipTab('izle');
    }

    function chipProxyYukle() {
        var durum = document.getElementById('chipProxyDurum');
        var btn = document.getElementById('btnChipProxy');
        if (durum) durum.textContent = 'Bağlanıyor...';
        if (btn) btn.disabled = true;
        var candidates = ['/api/ebistr/taglar'];
        if (typeof EBISTR_PROXY === 'function') {
            var base = (EBISTR_PROXY() || '').replace(/\/+$/, '');
            if (base) candidates.push(base + '/api/ebistr/taglar');
        }

        function fetchTaglar(idx) {
            if (idx >= candidates.length) return Promise.reject(new Error('Tüm kaynaklar başarısız'));
            return fetch(candidates[idx]).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).catch(function() {
                return fetchTaglar(idx + 1);
            });
        }

        fetchTaglar(0)
            .then(function(d) {
                if (!d.ok) {
                    if (durum) durum.textContent = 'Proxy hatası: ' + (d.err || d.status || 'HTTP');
                    if (btn) btn.disabled = false;
                    toast('Proxy\'den veri gelmedi', 'err');
                    return;
                }
                if (!d.taglar || d.taglar.length === 0) {
                    if (durum) durum.textContent = 'Çip listesi henüz boş; senkron başlatıldı, 20 sn sonra otomatik yeniden denenecek.';
                    if (btn) btn.disabled = false;
                    toast('Çip verisi hazırlanıyor — kısa süre sonra tekrar deneyin', 'amb');
                    setTimeout(function () {
                        chipProxyYukle();
                    }, 20000);
                    return;
                }
                var nd = [];
                d.taglar.forEach(function(item) {
                    var firma = item.firma || '';
                    var belge = String(item.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                    if (!firma) return;

                    // PhoneBook'tan mevcut kaydı bul (belge no veya firma adı ile)
                    var kisaAd = firma;
                    var tel = '', dt = '';
                    // Belge no ile eşleştir
                    if (belge) {
                        Object.keys(phoneBook).forEach(function(ka) {
                            var pbBelge = (phoneBook[ka].belge || '').replace(/\D/g, '').replace(/^0+/, '');
                            if (pbBelge && pbBelge === belge) { kisaAd = ka; tel = phoneBook[ka].tel || ''; dt = phoneBook[ka].dt || ''; }
                        });
                    }
                    // Bulunamadıysa firma adı ile dene
                    if (!tel) {
                        var nFirma = normalize(firma);
                        Object.keys(phoneBook).forEach(function(ka) {
                            var nKa = normalize(ka);
                            if (nKa && (nFirma.indexOf(nKa) >= 0 || nKa.indexOf(nFirma) >= 0)) {
                                kisaAd = ka; tel = phoneBook[ka].tel || ''; dt = phoneBook[ka].dt || '';
                            }
                        });
                    }

                    // PhoneBook güncelle
                    if (!phoneBook[kisaAd]) phoneBook[kisaAd] = { firma: firma, tel: '', belge: belge, dt: '' };
                    else if (belge && !phoneBook[kisaAd].belge) phoneBook[kisaAd].belge = belge;

                    // Aynı belge no varsa birleştir
                    if (belge) {
                        var ex = null;
                        for (var i = 0; i < nd.length; i++) { if (nd[i].belge === belge) { ex = nd[i]; break; } }
                        if (ex) { ex.top += item.top; ex.kul += item.kul; ex.kal += item.kal; return; }
                    }

                    nd.push({ firma: kisaAd, csvFirma: firma, belge: belge, top: item.top, kul: item.kul, kal: item.kal, tel: tel, dt: dt });
                });

                // Mevcut chipData ile MERGE et — EBİSTR'de olmayan kayıtlar korunur
                var merged = chipData.slice(); // mevcut kayıtları kopyala
                var eklenen = 0;
                var guncellenenFIdx = {};
                nd.forEach(function(yeni) {
                    // Belge no ile mevcut kaydı bul
                    var mevcutIdx = -1;
                    if (yeni.belge) {
                        for (var i = 0; i < merged.length; i++) {
                            var mb = (merged[i].belge || '').replace(/\D/g, '').replace(/^0+/, '');
                            if (mb && mb === yeni.belge) { mevcutIdx = i; break; }
                        }
                    }
                    // Bulunamadıysa firma adı ile dene
                    // Fuzzy isim eşleşmesi yok: farklı EBİSTR satırları yanlışlıkla tek firmada birleşmesin.
                    // Belgesiz satırda yalnızca tam (normalize) isim eşleşmesi ile mevcut satırı güncelle.
                    if (mevcutIdx < 0 && !yeni.belge) {
                        var nY2 = normalize(yeni.firma);
                        for (var j = 0; j < merged.length; j++) {
                            var nM2 = normalize(merged[j].firma || '');
                            if (nY2 && nM2 && nY2 === nM2) { mevcutIdx = j; break; }
                        }
                    }
                    if (mevcutIdx >= 0) {
                        // Bakiyeleri güncelle
                        merged[mevcutIdx].top = yeni.top;
                        merged[mevcutIdx].kul = yeni.kul;
                        merged[mevcutIdx].kal = yeni.kal;
                        if (yeni.belge && !merged[mevcutIdx].belge) merged[mevcutIdx].belge = yeni.belge;
                        // Tel yoksa phonebook'tan veya yeni kayddan al
                        if (!merged[mevcutIdx].tel) {
                            var mevcutFirma = merged[mevcutIdx].firma || '';
                            var mevcutBelge = (merged[mevcutIdx].belge || '').replace(/\D/g, '').replace(/^0+/, '');
                            var bulunanTel = yeni.tel
                                || (phoneBook[mevcutFirma] || {}).tel
                                || (phoneBook[mevcutBelge] || {}).tel
                                || '';
                            // Hala bulunamadıysa tüm phonebook'u tara: belge veya fuzzy firma eşleşmesi
                            if (!bulunanTel) {
                                var nMerge = normalize(mevcutFirma);
                                Object.keys(phoneBook).forEach(function(pbKa) {
                                    if (bulunanTel) return;
                                    var pbEntry = phoneBook[pbKa] || {};
                                    // Belge no eşleşmesi
                                    var pbBelge = (pbEntry.belge || '').replace(/\D/g, '').replace(/^0+/, '');
                                    if (mevcutBelge && pbBelge && pbBelge === mevcutBelge) {
                                        bulunanTel = pbEntry.tel || '';
                                        return;
                                    }
                                    // Fuzzy firma eşleşmesi
                                    if (nMerge) {
                                        var nPb = normalize(pbKa);
                                        if (nPb && (nMerge.indexOf(nPb) >= 0 || nPb.indexOf(nMerge) >= 0)) {
                                            bulunanTel = pbEntry.tel || '';
                                        }
                                    }
                                });
                            }
                            if (bulunanTel) merged[mevcutIdx].tel = bulunanTel;
                        }
                        guncellenenFIdx['i' + mevcutIdx] = true;
                    } else {
                        merged.push(yeni); // yeni firma ekle
                        eklenen++;
                    }
                });
                var firmaGuncel = 0;
                for (var _gf in guncellenenFIdx) {
                    if (Object.prototype.hasOwnProperty.call(guncellenenFIdx, _gf)) firmaGuncel++;
                }
                chipData = merged;
                savePB();
                syncChipTelFromPB(); // phonebook'taki numaraları chipData'ya yansıt
                lsSet('alibey_chip', { data: chipData, pb: phoneBook });
                // EBİS senkronizasyonu sonrası Firestore'a da yaz — yoksa sayfa yenilenince eski değerler geri gelir
                fbSaveAllChip();
                updateChipStats();
                renderChip();
                var lastSync = d.lastSync ? new Date(d.lastSync).toLocaleString('tr-TR') : '';
                var toplamFirma = chipData.length;
                var durumTxt = toplamFirma + ' firma · ' + firmaGuncel + ' güncellendi';
                if (eklenen) durumTxt += ', ' + eklenen + ' yeni';
                if (lastSync) durumTxt += ' · ' + lastSync;
                if (durum) durum.textContent = durumTxt;
                if (btn) btn.disabled = false;
                toast(toplamFirma + ' firma' + (eklenen ? ' · ' + eklenen + ' yeni' : '') + ' · senkron tamam', 'ok');
                chipTab('izle');
            })
            .catch(function(e) {
                if (durum) durum.textContent = 'Proxy bağlantı hatası: ' + e.message;
                if (btn) btn.disabled = false;
                toast('Proxy bağlanamadı', 'err');
            });
    }

    function updateChipStats() {
        var c = chipData.filter(function (d) {
            return d.kal < 50 && !d.pasif && !(phoneBook[d.firma] || {}).pasif;
        }).length;
        ['cs1', 'cs2', 'cs3', 'cs4'].forEach(function (id, i) {
            var el = document.getElementById(id);
            if (!el) return;
            if (i === 0) el.textContent = chipData.length;
            else if (i === 1) el.textContent = c;
            else if (i === 2) el.textContent = chipData.reduce(function (s, d) {
                return s + d.kal;
            }, 0).toLocaleString('tr-TR');
            else el.textContent = Object.values(phoneBook).filter(function (p) {
                return p.tel;
            }).length;
        });
        var bg = document.getElementById('chipBadge');
        if (bg) {
            bg.style.display = c > 0 ? '' : 'none';
            bg.textContent = c;
        }
        var bwa = document.getElementById('btnWaAll');
        if (bwa) bwa.style.display = c > 0 ? '' : 'none';
        var bsms = document.getElementById('btnSmsAll');
        if (bsms) bsms.style.display = c > 0 ? '' : 'none';
    }

    function kClass(k) {
        return k < 50 ? 'c' : k <= 100 ? 'w' : 'ok';
    }

    function kBadge(k) {
        return k < 50 ? ['SINIR ALTINDA', 'b-c'] : k <= 100 ? ['UYARI', 'b-w'] : ['İYİ', 'b-ok'];
    }

    function renderChip() {
        var tb = document.getElementById('chipBody');
        var em = document.getElementById('chipEmpty');
        if (!tb) return;
        if (!chipData.length) {
            tb.innerHTML = '';
            if (em) em.style.display = 'block';
            return;
        }
        if (em) em.style.display = 'none';
        var q = ((document.getElementById('chipSearch') || {}).value || '').toLowerCase();
        var fl = ((document.getElementById('chipFilter') || {}).value || 'all');
        var rows = chipData.filter(function (d) {
            if (q && d.firma.toLowerCase().indexOf(q) < 0 && (d.belge || '').indexOf(q) < 0) return false;
            var pasif = d.pasif || (phoneBook[d.firma] || {}).pasif;
            if (fl === 'c' && (d.kal >= 50 || pasif)) return false;
            if (fl === 'w' && (d.kal < 50 || d.kal > 100)) return false;
            if (fl === 'ok' && d.kal <= 100) return false;
            if (fl === 'pasif' && !pasif) return false;
            var isTel = d.tel || (phoneBook[d.belge] || {}).tel || (phoneBook[d.firma] || {}).tel;
            if (fl === 'notel' && isTel) return false;
            return true;
        }).sort(function (a, b) {
            var ap = a.pasif || (phoneBook[a.firma] || {}).pasif;
            var bp = b.pasif || (phoneBook[b.firma] || {}).pasif;
            if (ap && !bp) return 1;
            if (!ap && bp) return -1;
            return a.kal - b.kal;
        });
        tb.innerHTML = rows.map(function (d) {
            var isPasif = !!(d.pasif || (phoneBook[d.firma] || {}).pasif);
            var cl = isPasif ? 'ok' : kClass(d.kal);
            var bd = isPasif ? ['PASİF', 'b-g'] : kBadge(d.kal);
            var tel = d.tel || (phoneBook[d.belge] || {}).tel || (phoneBook[d.firma] || {}).tel || '';
            var pct = d.top > 0 ? Math.round(d.kal / d.top * 100) : 0;
            var safeKa = (d.firma || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            var safeBelge = (d.belge || '').replace(/'/g, "\\'");
            var safeKey = (d.id || getChipId(d) || '').replace(/'/g, "\\'");
            // USER PHOTO FEEDBACK Correction:
            // d.belge holds the long 00 number, tel holds the phone.
            var dispBelge = d.belge;
            var dispTel = tel;
            var isSmsOff = !!(d.smsOff || (phoneBook[d.firma] || {}).smsOff || (phoneBook[d.belge] || {}).smsOff);
            return '<tr style="opacity:' + (isPasif ? '0.4' : '1') + ';transition:opacity .2s">' +
                '<td style="width:30px"><input type="checkbox" class="chipChk" data-key="' + safeKey + '" data-firma="' + safeKa + '" data-belge="' + safeBelge + '" onchange="chipSelChange()"></td>' +
                '<td style="color:var(--tx);font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis">' + d.firma + msgBadge(d.belge, d.firma) + '</td>' +
                '<td style="font-family:var(--fm);font-size:10px;color:var(--tx3)">' + dispBelge + '</td>' +
                '<td>' + d.top + '</td><td>' + d.kul + '</td>' +
                '<td><div style="display:flex;align-items:center;gap:6px">' +
                '<span class="kalan ' + cl + '">' + d.kal + '</span>' +
                '<div style="flex:1;min-width:40px">' +
                '<div class="pbar"><div class="pfill ' + cl + '" style="width:' + pct + '%"></div></div>' +
                '<div style="font-size:8px;color:var(--tx3);margin-top:1px">%' + pct + '</div>' +
                '</div>' +
                '</div></td>' +
                '<td><span class="bx ' + bd[1] + '">' + bd[0] + '</span></td>' +
                '<td>' + (dispTel ? '<span style="font-family:var(--fm);font-size:10px;color:var(--tx2);cursor:pointer;border-bottom:1px dashed var(--bdr);padding-bottom:1px" onclick="inlinePrompt(this.parentNode,\'' + safeBelge + '\',\'' + dispTel + '\',\'' + safeKa + '\')" title="Telefon Numarasını Düzenle">' + dispTel + ' ✏️</span>' :
                    '<button class="btn btn-g" style="padding:3px 7px;font-size:10px" onclick="inlinePrompt(this.parentNode,\'' + safeBelge + '\',\'\',\'' + safeKa + '\')">+ Tel</button>') + '</td>' +
                '<td><div style="display:flex;gap:3px;flex-wrap:wrap">' +
                (tel && !isPasif ? '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;background:var(--grn-d);color:var(--grn)" onclick="openWaModal(\'s\',\'' + safeBelge + '\',\'' + safeKa + '\')" title="WhatsApp">📲</button>' : '') +
                '<button class="btn btn-g" style="padding:3px 6px;font-size:10px" onclick="editChip(\'' + safeBelge + '\')" title="Düzenle">✏️</button>' +
                '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;' + (isPasif ? 'background:var(--grn-d);color:var(--grn)' : 'background:var(--amb-d);color:var(--amb)') + '" onclick="togglePassive(\'' + safeKa + '\')">' + (isPasif ? '▶ Aktif' : '⏸ Pasif') + '</button>' +
                '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;' + (isSmsOff ? 'background:var(--red-d);color:var(--red)' : 'background:var(--grn-d);color:var(--grn)') + '" onclick="toggleSmsOpt(\'' + safeBelge + '\', \'' + safeKa + '\')" title="SMS İzni">' + (isSmsOff ? '🔕 SMS İptal' : '🔔 SMS Açık') + '</button>' +
                '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;background:var(--red-d);color:var(--red)" onclick="confirmDeleteChip(\'' + (d.id || '') + '\',\'' + safeKa + '\')" title="Sil">🗑️</button>' +
                '</div></td>' +
                '</tr>';
        }).join('');
        // tümünü seç sıfırla
        var ca = document.getElementById('chipChkAll');
        if (ca) ca.checked = false;
        chipUpdateBulkBar();
    }


    function clearChipReg() {
        ['regFirma', 'regBelge', 'regTel', 'regAdet'].forEach(function (id) {
            var e = document.getElementById(id);
            if (e) e.value = '';
        });
    }


    function saveChipReg() {
        var firma = ((document.getElementById('regFirma') || {}).value || '').trim();
        var belge = ((document.getElementById('regBelge') || {}).value || '').replace(/\D/g, '').replace(/^0+/, '');
        var tel = normalizeTel(((document.getElementById('regTel') || {}).value || '').trim());
        if (!firma && !belge) { toast('Firma adı veya belge no girin', 'err'); return; }

        // PhoneBook güncelle (Rehber)
        var ka = firma || belge;

        // EĞER DÜZENLEME MODUNDAYSAK ve KEY DEĞİŞTİYSE ESKİSİNİ SİL
        if (editingPBKey && editingPBKey !== ka) {
            delete phoneBook[editingPBKey];
        }

        if (!phoneBook[ka]) phoneBook[ka] = { kisaAd: ka, tel: tel, belge: belge, dt: new Date().toLocaleDateString('tr-TR') };
        else {
            phoneBook[ka].kisaAd = ka;
            if (tel) phoneBook[ka].tel = tel;
            if (belge) phoneBook[ka].belge = belge;
            phoneBook[ka].dt = new Date().toLocaleDateString('tr-TR');
        }
        savePB();

        // chipData güncelleme
        var existing = chipData.find(function (d) { return (d.belge && d.belge === belge) || d.firma === ka || (editingPBKey && d.firma === editingPBKey); });
        if (existing) {
            existing.tel = tel;
            if (belge) existing.belge = belge;
            existing.firma = ka; // İsim değişikliğini yansıt
            lsSet('alibey_chip', { data: chipData, pb: phoneBook });
            fbSaveChip(existing);
        }

        editingPBKey = null;
        renderTelsEnhanced();
        _fillDataLists();
        clearChipReg();
        toast('Rehber güncellendi ✓', 'ok');
        logAction('Rehber kaydı güncelledi: ' + ka);

        // UI Reset
        var btn = document.querySelector('#ctp-kayit .btn-p');
        if (btn) btn.innerHTML = '💾 Kaydet';
        var cnl = document.getElementById('regCancelBtn');
        if (cnl) cnl.style.display = 'none';
    }

    function editPBEntry(ka) {
        var e = phoneBook[ka];
        if (!e) return;
        editingPBKey = ka;
        document.getElementById('regFirma').value = ka;
        document.getElementById('regBelge').value = e.belge || '';
        document.getElementById('regTel').value = e.tel || '';

        // UI Update
        var btn = document.querySelector('#ctp-kayit .btn-p');
        if (btn) btn.innerHTML = '💾 GÜNCELLE';
        var cnl = document.getElementById('regCancelBtn');
        if (cnl) cnl.style.display = 'inline-block';

        // Scroll to top
        document.querySelector('#ctp-kayit .card').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('regFirma').focus();
    }

    function cancelPBEdit() {
        editingPBKey = null;
        clearChipReg();
        var btn = document.querySelector('#ctp-kayit .btn-p');
        if (btn) btn.innerHTML = '💾 Kaydet';
        var cnl = document.getElementById('regCancelBtn');
        if (cnl) cnl.style.display = 'none';
    }

    function inlinePrompt(td, b, currentTel, ka) {
        var safeB = (b || '').replace(/'/g, "\\'");
        var safeK = (ka || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        td.innerHTML = '<div style="display:flex;gap:4px;align-items:center">' +
            '<input type="tel" id="it_' + safeB + '" value="' + currentTel + '" style="width:90px;padding:3px 6px;font-size:10px;border:1px solid var(--bdr);border-radius:4px;background:var(--sur2);color:var(--tx);outline:none" placeholder="05...">' +
            '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;background:var(--grn-d);color:var(--grn)" onclick="saveInlineTel(\'' + safeB + '\',\'' + safeK + '\')" title="Kaydet">\u2713</button>' +
            '<button class="btn btn-g" style="padding:3px 6px;font-size:10px;background:var(--red-d);color:var(--red)" onclick="renderChip()" title="\u0130ptal">\u2715</button>' +
            '</div>';
        setTimeout(function () {
            var i = document.getElementById('it_' + b);
            if (i) {
                i.focus();
                i.selectionStart = 0; i.selectionEnd = i.value.length;
                i.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveInlineTel(b, ka); else if (e.key === 'Escape') renderChip(); });
            }
        }, 10);
    }

    function saveInlineTel(b, ka) {
        var inp = document.getElementById('it_' + b);
        if (!inp) return;
        var newTel = inp.value.trim();

        // belge ile ara, yoksa firma adıyla ara
        var d = null;
        if (b) d = chipData.filter(function (x) { return x.belge === b; })[0];
        if (!d && ka) d = chipData.filter(function (x) { return x.firma === ka; })[0];
        if (!d) return;

        var normalized = normalizeTel(newTel);

        // chipData güncelle
        d.tel = normalized;

        // phoneBook güncelle
        var firma = d.firma || b;
        if (!phoneBook[firma]) phoneBook[firma] = { kisaAd: firma, tel: normalized, belge: b, dt: new Date().toLocaleDateString('tr-TR') };
        else { phoneBook[firma].tel = normalized; phoneBook[firma].dt = new Date().toLocaleDateString('tr-TR'); }

        if (b && firma !== b) {
            if (!phoneBook[b]) phoneBook[b] = { kisaAd: firma, tel: normalized, belge: b, dt: new Date().toLocaleDateString('tr-TR') };
            else phoneBook[b].tel = normalized;
        }

        savePB();
        lsSet('alibey_chip', { data: chipData, pb: phoneBook });
        fbSaveChip(d); // Firebase'e yaz

        updateChipStats();
        renderChip();
        toast('Telefon numarası güncellendi ✓', 'ok');
        logAction('Telefon ekledi/düzenledi: ' + firma);
    }

    function editChip(b) {
        var d = chipData.filter(function (x) { return x.belge === b; })[0];
        if (!d) return;
        document.getElementById('regFirma').value = d.firma;
        document.getElementById('regBelge').value = b;
        document.getElementById('regTel').value = d.tel || (phoneBook[b] || {}).tel || '';
        chipTab('kayit');
        document.getElementById('regTel').focus();
    }

    function deleteChip(b) {
        showConfirm('Firma Sil', 'Bu kayıtlı firmayı kalıcı olarak silmek istediğinize emin misiniz?', function () {
            var ad = '';
            var bStr = String(b).trim();
            chipData = chipData.filter(function (d) {
                if (String(d.belge).trim() === bStr) ad = d.firma;
                return String(d.belge).trim() !== bStr;
            });
            if (phoneBook[bStr]) delete phoneBook[bStr];
            lsSet('alibey_chip', { data: chipData, pb: phoneBook });
            updateChipStats();
            renderChip();
            toast('Firma silindi', 'info');
            logAction('Çip firması sildi: ' + ad);
        });
    }

    function renderTels() {
        var tb = document.getElementById('telBody');
        var ks = Object.keys(phoneBook);
        if (!tb) return;
        if (!ks.length) {
            tb.innerHTML = '<tr><td colspan="5" class="empty" style="padding:12px">Kayiit yok</td></tr>';
            return;
        }
        tb.innerHTML = ks.map(function (b) {
            var e = phoneBook[b];
            return '<tr><td style="color:var(--tx)">' + (e.firma || '-') + '</td><td style="font-family:var(--fm);font-size:10px;color:var(--tx3)">' + b + '</td><td style="font-family:var(--fm)">' + (e.tel || '<span style="color:var(--tx3)">—</span>') + '</td><td style="color:var(--tx3)">' + (e.dt || '-') + '</td><td><button class="btn btn-g" style="padding:2px 7px;font-size:10px;color:var(--red)" onclick="delTel(\'' + b + '\')">Sil</button></td></tr>';
        }).join('');
    }

    function delTel(b) {
        delete phoneBook[b];
        var d = chipData.filter(function (d) { return d.belge === b; })[0];
        if (d) d.tel = '';
        lsSet('alibey_chip', { data: chipData, pb: phoneBook });
        updateChipStats();
        if (typeof renderTelsEnhanced === 'function') renderTelsEnhanced();
        renderChip();
        toast('Silindi', 'info');
    }

    // WA
    function getSablon() {
        var sel = document.getElementById('waTplSel');
        if (sel && sel.value === 'kargo') return _tpl.waKargo || WA_KARGO;
        return _tpl.waDefault || WA_DEF;
    }

    function isKargoSablon() {
        var sel = document.getElementById('waTplSel');
        return sel && sel.value === 'kargo';
    }

    function updateWaPrev() {
        if (!waItem) return;
        document.getElementById('waPrev').innerHTML = fmtWA(fillTpl(getSablon(), waItem));
    }

    function fillTpl(s, d) {
        function r(str, k, v) { return str.split('{' + k + '}').join(String(v === undefined || v === null ? '' : v)); }
        var t = s;
        t = r(t, 'FIRMA_ADI', d.firma);
        t = r(t, 'BELGE_NO', d.belge);
        t = r(t, 'TOPLAM', d.top);
        t = r(t, 'KULLANILAN', d.kul);
        t = r(t, 'KALAN', d.kal);
        t = r(t, 'ADET', d.top); // {ADET} = toplam çip sayısı
        return t;
    }

    function fmtWA(t) {
        return t.split('*').map(function (s, i) {
            return i % 2 === 1 ? '<strong>' + s + '</strong>' : s;
        }).join('').split('\n').join('<br>');
    }

    function openWaModal(mode, belge, firma) {
        var mod = document.getElementById('waMod');
        var bulk = document.getElementById('waBulk');
        if (mode === 'all') {
            waQueue = chipData.filter(function (d) {
                if (d.pasif || (phoneBook[d.firma] || {}).pasif) return false;
                if (d.smsOff || (phoneBook[d.firma] || {}).smsOff || (phoneBook[d.belge] || {}).smsOff) return false;
                return d.kal < 50 && (d.tel || (phoneBook[d.belge] || {}).tel);
            });
            if (!waQueue.length) { toast('Telefon kayıtlı kritik firma yok', 'err'); return; }
            waIdx = 0;
            bulk.style.display = 'block';
            document.getElementById('waGo').style.display = 'flex';
            document.getElementById('waTitle').textContent = 'Toplu WA — ' + waQueue.length + ' firma';
            showWAItem();
        } else {
            // Belge varsa belgeden ara, yoksa firma adından ara
            var d = null;
            if (belge) {
                d = chipData.filter(function (x) { return x.belge === belge; })[0];
            }
            if (!d && firma) {
                d = chipData.filter(function (x) { return x.firma === firma; })[0];
            }
            if (!d) return;
            var tel = d.tel || (phoneBook[belge] || {}).tel || (phoneBook[d.firma] || {}).tel || '';
            if (!tel) { toast('Telefon kaydı yok', 'err'); return; }
            waItem = Object.assign({}, d, { tel: tel });
            bulk.style.display = 'none';
            document.getElementById('waGo').style.display = 'flex';
            document.getElementById('waTitle').textContent = 'WhatsApp Mesajı';
            document.getElementById('waInfo').innerHTML = waInfoHTML(waItem);
            document.getElementById('waPrev').innerHTML = fmtWA(fillTpl(getSablon(), waItem));
        }
        mod.classList.add('on');
    }

    function showWAItem() {
        if (waIdx >= waQueue.length) { closeWaMod(); toast('Tüm mesajlar ✓', 'ok'); return; }
        var d = waQueue[waIdx];
        var tel = d.tel || (phoneBook[d.belge] || {}).tel || '';
        waItem = Object.assign({}, d, { tel: tel });
        document.getElementById('waInfo').innerHTML = waInfoHTML(waItem);
        document.getElementById('waPrev').innerHTML = fmtWA(fillTpl(getSablon(), waItem));
        document.getElementById('waBulkInfo').textContent = (waIdx + 1) + '/' + waQueue.length + ' — ' + d.firma;
    }

    function waInfoHTML(d) {
        return '<div class="ir"><span class="il">Firma</span><span class="iv">' + d.firma + '</span></div><div class="ir"><span class="il">Kalan</span><span class="iv" style="color:var(--red)">' + d.kal + '/' + d.top + '</span></div><div class="ir" style="border:none"><span class="il">Tel</span><span class="iv">' + (d.tel || '—') + '</span></div>';
    }

    function openWALink() {
        if (!waItem || !waItem.tel) { toast('Tel yok', 'err'); return; }
        var api = lsGet('alibey_api') || {};
        var msg = fillTpl(getSablon(), waItem);
        if (api.waVen === 'cloud' && api.waKey) {
            toast('WhatsApp gönderiliyor (API)...', 'info');
            setTimeout(function () {
                toast('WhatsApp gönderildi!', 'ok');
                addMsgLog(waItem.firma, waItem.belge, 'WA', msg, 'bakiye');
                logAction('WhatsApp gonderdi (Cloud API): ' + waItem.firma);
            }, 600);
        } else {
            var t = waItem.tel.replace(/\D/g, '');
            var wc = t.startsWith('90') ? t : t.startsWith('0') ? '9' + t : '90' + t;
            window.open('https://wa.me/' + wc + '?text=' + encodeURIComponent(msg), '_blank');
            addMsgLog(waItem.firma, waItem.belge, 'WA', msg, 'bakiye');
            logAction('WhatsApp yonlendirildi (Web): ' + waItem.firma);
        }
    }

    function sendWaModalSms() {
        if (!waItem || !waItem.tel) { toast('Tel yok', 'err'); return; }
        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) { toast('Ayarlar > SMS API bilgilerini girin', 'err'); return; }
        var msg = fillTpl(getSablon(), waItem);
        var btn = document.getElementById('waSmsGo');
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        _doSendSms(waItem.tel, msg, api, function (ok, msgid) {
            if (btn) { btn.disabled = false; btn.innerHTML = '&#128172; SMS'; }
            if (ok) {
                addMsgLog(waItem.firma, waItem.belge, 'SMS', msg, 'bakiye', msgid);
                logAction('SMS gonderdi (modal): ' + waItem.firma);
                toast('SMS Gönderildi (' + waItem.firma + ')', 'ok');
                if (waQueue && waQueue.length > 0) { waIdx++; showWAItem(); }
            } else { toast('SMS gönderilemedi', 'err'); }
        });
    }

    function nextWA() { waIdx++; showWAItem(); }

    function closeWaMod() {
        var waM = document.getElementById('waMod');
        if (waM) waM.classList.remove('on');
        waItem = null;
        waQueue = [];
    }

    function loadSablon() {
        var waS = document.getElementById('waSablon');
        if (waS) waS.value = _tpl.waDefault || WA_DEF;
        var waK = document.getElementById('waKargoSablon');
        if (waK) waK.value = _tpl.waKargo || WA_KARGO;
        var smsK = document.getElementById('smsKargoSablon');
        if (smsK) smsK.value = _tpl.smsKargo || SMS_KARGO;
    }

    function saveSablon() {
        var waS = document.getElementById('waSablon');
        if (!waS) return;
        var t = waS.value.trim();
        if (!t) { toast('Boş olamaz', 'err'); return; }
        _tpl.waDefault = t;
        fbSaveTemplates();
        toast('Kaydedildi', 'ok');
    }

    function resetSablon() {
        var waS = document.getElementById('waSablon');
        if (!waS) return;
        waS.value = WA_DEF;
        _tpl.waDefault = '';
        fbSaveTemplates();
        toast('Sıfırlandı', 'info');
    }

    function saveKargoSablon() {
        var wa = (document.getElementById('waKargoSablon') || {}).value || '';
        var sms = (document.getElementById('smsKargoSablon') || {}).value || '';
        if (!wa || !sms) { toast('Her iki alan dolu olmalı', 'err'); return; }
        _tpl.waKargo = wa;
        _tpl.smsKargo = sms;
        fbSaveTemplates();
        toast('Kargo şablonu kaydedildi', 'ok');
    }

    function resetKargoSablon() {
        var waK = document.getElementById('waKargoSablon');
        var smsK = document.getElementById('smsKargoSablon');
        if (waK) waK.value = WA_KARGO;
        if (smsK) smsK.value = SMS_KARGO;
        _tpl.waKargo = '';
        _tpl.smsKargo = '';
        fbSaveTemplates();
        toast('Sıfırlandı', 'info');
    }

    function prevSablon() {
        var waS = document.getElementById('waSablon');
        var prevEl = document.getElementById('sablonPrev');
        var modEl = document.getElementById('sablonMod');
        if (!waS || !prevEl || !modEl) return;
        var s = waS.value;
        var demo = { firma: 'ÖRNEK İNŞAAT', belge: '0012345678901234', top: 200, kul: 165, kal: 35 };
        prevEl.innerHTML = fmtWA(fillTpl(s, demo));
        modEl.classList.add('on');
    }

    var msgLog = [];
    // msgTip: 'kargo' | 'bakiye'
    function addMsgLog(firma, belge, tur, mesaj, msgTip, msgid) {
        var d = chipData.find(function (x) { return x.belge === belge; });
        var tel = (d && d.tel) || (phoneBook[belge] || {}).tel || (phoneBook[firma] || {}).tel || '';
        var uid = Date.now() + '_' + Math.floor(Math.random() * 1000);
        var entry = {
            uid: uid,
            firma: firma, belge: belge, tur: tur,
            tarih: new Date().toISOString(), mesaj: mesaj, msgTip: msgTip || 'bakiye',
            tel: tel,
            kalAtMsg: d ? d.kal : null,
            msgid: (msgid && msgid !== 'NO_ID') ? msgid : null,
            status: tur === 'SMS' ? ((msgid && msgid !== 'ERROR') ? 'Gönderildi' : 'Hatalı') : 'Gönderildi'
        };
        msgLog.unshift(entry);
        if (msgLog.length > 500) msgLog = msgLog.slice(0, 500);

        // Firestore: Yeni kayıt ekle (fbPushMsgLog yerine doc set kullanarak uid ile yönetelim)
        if (typeof fsSet === 'function') fsSet('msg_log', uid, entry);

        renderMsgLog();
        renderChip();
    }
    function lastMsgDays(belge, firma) {
        var entry = msgLog.find(function (e) { return e.belge === belge && e.firma === firma; });
        if (!entry) return null;
        var diff = (Date.now() - new Date(entry.tarih).getTime()) / 86400000;
        return Math.floor(diff);
    }
    function toggleMsgBypass() {
        var chk = document.getElementById('msgBypassCheck');
        if (chk) { chk.checked = !chk.checked; toast(chk.checked ? 'Test Modu: Aktif' : 'Test Modu: Kapalı', 'info'); }
    }
    // Son 3 günde mesaj atılmış VE kal değişmemişse true döner → mesajı engelle
    function shouldBlockMsg(belge, firma) {
        // Test modu veya kalıcı yoksayma ayarı varsa engelleme
        var chk = document.getElementById('msgBypassCheck');
        if (chk && chk.checked) return false;
        if (localStorage.getItem('alibey_ignore_rep') === '1') return false;

        var entry = msgLog.find(function (e) { return e.belge === belge && e.firma === (firma || ''); });
        if (!entry) return false;
        var days = (Date.now() - new Date(entry.tarih).getTime()) / 86400000;
        if (days >= 3) return false; // 3 günden eskiyse engelleme
        // kal değişmişse engelleme (azalmış = çip kullanılmış → haber ver)
        var d = chipData.find(function (x) { return x.belge === belge; });
        if (!d) return false;
        if (entry.kalAtMsg === null || entry.kalAtMsg === undefined) return false;
        if (d.kal < entry.kalAtMsg) return false; // kal azalmış → gönder
        return true; // kal aynı kalmış → engelle
    }
    var msgLogPage = 1;
    var MSG_LOG_PER_PAGE = 25;

    function renderMsgLog() {
        var tbody = document.getElementById('msgLogBody');
        var empty = document.getElementById('msgLogEmpty');
        var pager = document.getElementById('msgLogPager');
        if (!tbody) return;

        var turFil = (document.getElementById('msgLogTurFil') || {}).value || 'all';
        var statFil = (document.getElementById('msgLogStatFil') || {}).value || 'all';
        var q = ((document.getElementById('msgLogSearch') || {}).value || '').toLowerCase().trim();

        var list = (msgLog || []).slice().reverse().filter(function (e) {
            if (turFil === 'kargo') return e.msgTip === 'kargo';
            if (turFil === 'bakiye') return !e.msgTip || e.msgTip === 'bakiye';
            return true;
        }).filter(function (e) {
            if (statFil === 'all') return true;
            if (statFil === 'Hatalı') return e.status === 'Hatalı' || e.status === 'Hata';
            return (e.status || '') === statFil;
        }).filter(function (e) {
            if (!q) return true;
            return (e.firma || '').toLowerCase().indexOf(q) >= 0
                || (e.tel || '').indexOf(q) >= 0
                || (e.mesaj || '').toLowerCase().indexOf(q) >= 0;
        });

        if (!list.length) {
            tbody.innerHTML = '';
            if (pager) pager.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        var totalPages = Math.ceil(list.length / MSG_LOG_PER_PAGE);
        if (msgLogPage > totalPages) msgLogPage = totalPages;
        var start = (msgLogPage - 1) * MSG_LOG_PER_PAGE;
        var pageItems = list.slice(start, start + MSG_LOG_PER_PAGE);

        tbody.innerHTML = pageItems.map(function (e) {
            var d = new Date(e.tarih);
            var tarih = d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            var kanalClr = e.tur === 'SMS' ? '#22c55e' : '#818cf8';
            var kanalBg = e.tur === 'SMS' ? '#22c55e18' : '#818cf818';
            var isKargo = e.msgTip === 'kargo';
            var tipClr = isKargo ? '#f59e0b' : '#60a5fa';
            var tipBg = isKargo ? '#f59e0b18' : '#60a5fa18';
            var tipTxt = isKargo ? '📦 Kargo' : '📊 Kalan Çip';
            var st = e.status || '';
            var stClr = '#94a3b8', stBg = '#94a3b818', stIcon = '⏳';
            if (st === 'İletildi') { stClr = '#22c55e'; stBg = '#22c55e18'; stIcon = '✅'; }
            else if (st === 'Hatalı' || st === 'Hata') { stClr = '#ef4444'; stBg = '#ef444418'; stIcon = '❌'; }

            var turCell = '<div style="display:flex;flex-direction:column;gap:3px;white-space:nowrap">'
                + '<span style="background:' + kanalBg + ';color:' + kanalClr + ';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">' + (e.tur || '?') + '</span>'
                + '<span style="background:' + tipBg + ';color:' + tipClr + ';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">' + tipTxt + '</span>'
                + '</div>';

            var statCell = '<div style="background:' + stBg + ';color:' + stClr + ';border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;gap:4px">'
                + '<span>' + stIcon + '</span><span>' + (st || 'Beklemede') + '</span>'
                + '</div>';
            var mesajTxt = (e.mesaj || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
            var telTxt = e.tel ? '<span style="font-family:var(--fm);font-size:11px;color:var(--tx2)">' + e.tel + '</span>' : '<span style="color:var(--tx3)">—</span>';
            return '<tr>'
                + '<td style="font-weight:600;min-width:100px;max-width:140px;overflow:hidden;text-overflow:ellipsis">' + (e.firma || '-') + '</td>'
                + '<td style="min-width:110px">' + telTxt + '</td>'
                + '<td style="min-width:80px">' + turCell + '</td>'
                + '<td style="min-width:100px">' + statCell + '</td>'
                + '<td style="font-size:11px;color:var(--tx3);white-space:nowrap;padding-right:12px">' + tarih + '</td>'
                + '<td style="font-size:11px;color:var(--tx2);white-space:pre-wrap;word-break:break-word;max-width:300px">' + mesajTxt + '</td>'
                + '</tr>';
        }).join('');

        // Sayfalama
        if (pager) {
            var btnStyle = 'padding:3px 10px;font-size:11px;border-radius:6px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx2);cursor:pointer';
            var activeBtnStyle = 'padding:3px 10px;font-size:11px;border-radius:6px;border:1px solid var(--acc);background:var(--acc-d);color:var(--acc2);cursor:pointer;font-weight:700';
            var html = '<span style="font-size:11px;color:var(--tx3);margin-right:4px">' + list.length + ' kayıt</span>';
            html += '<button style="' + btnStyle + '" onclick="msgLogPage=1;renderMsgLog()" ' + (msgLogPage === 1 ? 'disabled' : '') + '>«</button>';
            html += '<button style="' + btnStyle + '" onclick="msgLogPage=Math.max(1,msgLogPage-1);renderMsgLog()" ' + (msgLogPage === 1 ? 'disabled' : '') + '>‹</button>';
            var from = Math.max(1, msgLogPage - 2), to = Math.min(totalPages, from + 4);
            if (to - from < 4) from = Math.max(1, to - 4);
            for (var p = from; p <= to; p++) {
                html += '<button style="' + (p === msgLogPage ? activeBtnStyle : btnStyle) + '" onclick="msgLogPage=' + p + ';renderMsgLog()">' + p + '</button>';
            }
            html += '<button style="' + btnStyle + '" onclick="msgLogPage=Math.min(' + totalPages + ',msgLogPage+1);renderMsgLog()" ' + (msgLogPage === totalPages ? 'disabled' : '') + '>›</button>';
            html += '<button style="' + btnStyle + '" onclick="msgLogPage=' + totalPages + ';renderMsgLog()" ' + (msgLogPage === totalPages ? 'disabled' : '') + '>»</button>';
            pager.innerHTML = html;
        }
    }

    function clearMsgLog() {
        if (typeof askClearPassword !== 'function') { toast('Şifre fonksiyonu bulunamadı', 'err'); return; }
        askClearPassword(function () {
            showConfirm('Geçmişi Temizle', 'Tüm mesaj gönderme geçmişi silinsin mi? (Bu işlem 3 gün kuralını da sıfırlar)', function () {
                if (typeof fsGet === 'function') {
                    fsGet('msg_log').then(function (rows) {
                        rows.forEach(function (r, i) {
                            setTimeout(function () {
                                if (typeof fsDel === 'function') fsDel('msg_log', r.uid || r._id);
                            }, i * 150);
                        });
                    });
                }
                msgLog = [];
                renderMsgLog();
                toast('Mesaj geçmişi temizlendi', 'info');
                logAction('Mesaj geçmişini temizledi');
            });
        });
    }

    function exportMsgLogCsv() {
        var turFil = (document.getElementById('msgLogTurFil') || {}).value || 'all';
        var q = ((document.getElementById('msgLogSearch') || {}).value || '').toLowerCase().trim();
        var list = (msgLog || []).slice().reverse().filter(function (e) {
            if (turFil === 'kargo') return e.msgTip === 'kargo';
            if (turFil === 'bakiye') return !e.msgTip || e.msgTip === 'bakiye';
            return true;
        }).filter(function (e) {
            if (!q) return true;
            return (e.firma || '').toLowerCase().indexOf(q) >= 0 || (e.tel || '').indexOf(q) >= 0;
        });
        if (!list.length) { toast('İndirilecek kayıt yok', 'err'); return; }
        var rows = [['Firma', 'Numara', 'Tür', 'Tip', 'Tarih', 'Mesaj', 'Belge']];
        list.forEach(function (e) {
            var tarih = new Date(e.tarih).toLocaleString('tr-TR');
            rows.push([
                e.firma || '',
                e.tel || '',
                e.tur || '',
                e.msgTip === 'kargo' ? 'Kargo' : 'Kalan Çip',
                tarih,
                (e.mesaj || '').replace(/\n/g, ' '),
                e.belge || ''
            ]);
        });
        var csv = "sep=;\n" + rows.map(function (r) {
            return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
        }).join('\n');
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'mesaj_gecmisi_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        toast(list.length + ' kayıt CSV olarak indirildi', 'ok');
    }

    function clearMsgLog() {
        askClearPassword(function () {
            fbClearMsgLog();
            toast('Geçmiş temizlendi', 'ok');
        });
    }

    // ── TEK SMS ────────────────────────────────────────────────────────────────
    function sendApiSms(belge) {
        var d = chipData.filter(function (x) { return x.belge === belge; })[0];
        if (!d) return;
        // Blok kontrol: son 3 günde mesaj atılmış VE kal değişmemişse gönderme
        if (shouldBlockMsg(belge)) {
            toast('⚠️ Son 3 günde mesaj gönderilmiş ve adet değişmemiş — atlandı', 'err');
            return;
        }
        var tel = d.tel || (phoneBook[belge] || {}).tel || '';
        if (!tel) { toast('Telefon kaydı yok', 'err'); return; }
        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) {
            toast('Ayarlar > SMS API kullanıcı adı ve şifre girin', 'err'); return;
        }
        var kargo = isKargoSablon();
        var msg = fillTpl(getSablon(), d);
        _doSendSms(tel, msg, api, function (ok, msgid) {
            if (ok) {
                if (typeof addMsgLog === "function") {
                    addMsgLog(d.firma, d.belge, "SMS", msg, "bakiye", msgid);
                }
                toast("SMS Gönderildi (" + d.firma + ")", "ok");
                logAction("SMS gonderdi: " + d.firma);
            } else {
                toast("SMS Gönderim hatası", "err");
            }
        });
    }

    // NetGSM API çağrısı (SADECE PROXY ÜZERİNDEN - msgid yakalama destekli)
    function _doSendSms(tel, msg, api, cb) {
        var t = tel.replace(/\D/g, '');
        if (t.startsWith('90')) t = t.slice(2);
        if (t.startsWith('0')) t = t.slice(1);

        // Canlıda mıyız? (Tarayıcıdan doğrudan istek artık YASAKLANMIŞTIR - IP uyarısı almamak için)
        var useProxy = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';

        if (!useProxy) {
            // Lokal/Test ortamı için doğrudan istek denemesi (Geliştirme için)
            var url = 'https://api.netgsm.com.tr/sms/send/get/?usercode=' + encodeURIComponent(api.smsUser) + '&password=' + encodeURIComponent(api.smsKey) + '&gsmno=' + t + '&message=' + encodeURIComponent(msg) + '&msgheader=' + encodeURIComponent(api.smsBas || 'ALIBEYLAB') + '&dil=TR';
            fetch(url).then(function (r) { return r.text() }).then(function (txt) {
                var parts = txt.trim().split(' ');
                cb(parts[0] === '00' || parts[0] === '01' || parts[0] === '02', parts[1] || '');
            }).catch(function () { cb(false, '') });
            return;
        }

        // CANLI ORTAM: Sadece Proxy (NetGSM sunucusu sadece sunucu IP'sini görecek)
        var proxyUrl = netgsmProxyAbs('action=send' +
            '&usercode=' + encodeURIComponent(api.smsUser) +
            '&password=' + encodeURIComponent(api.smsKey) +
            '&gsmno=' + t +
            '&message=' + encodeURIComponent(msg) +
            '&msgheader=' + encodeURIComponent(api.smsBas || 'ALIBEYBETON') +
            '&dil=TR');

        fetch(proxyUrl)
            .then(function (r) { return r.text(); })
            .then(function (txt) {
                // v15 Format: SUCCESS|ID veya ERROR|MSG
                var parts = txt.trim().split('|');
                var status = parts[0];
                var msgid = parts[1] || '';

                console.log('NetGSM Proxy Yanıt (v15):', txt);
                if (status === 'ERROR' && (String(msgid).trim().split(/\s+/)[0] === '30' || /^ERROR\s*\|\s*30\b/i.test(txt))) netgsmLogEgressHintOnce();

                // SUCCESS olması yeterli (ID olmasa bile mesaj gitmiş olabilir)
                var ok = (status === 'SUCCESS');
                cb(ok, msgid);
            })
            .catch(function (err) {
                console.error('NetGSM Proxy Gönderim Hatası:', err);
                cb(false, '');
            });
    }

    // NetGSM Bakiye Sorgulama
    function updateNetgsmBalance() {
        var api = lsGet('alibey_api', {});
        if (!api.smsUser || !api.smsKey) return;

        var user = encodeURIComponent(api.smsUser);
        var pass = encodeURIComponent(api.smsKey);

        var proxyUrl = netgsmProxyAbs('action=balance&usercode=' + user + '&password=' + pass);
        var useProxy = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:';

        if (!useProxy) return; // Lokal bakiye XML POST tarayıcıdan yapılamaz

        var val = document.getElementById('netSmsVal');
        var balEl = document.getElementById('netSmsBal');

        fetch(proxyUrl)
            .then(function (r) { return r.text(); })
            .then(function (txt) {
                // XML Yanıtını parse et: <result><code>00</code><balance>50,00</balance></result>
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(txt, "text/xml");
                if (xmlDoc.getElementsByTagName("parsererror").length) {
                    console.warn('NetGSM: XML ayrıştırılamadı', txt.slice(0, 200));
                    if (/^ERROR\s*\|\s*30\b/i.test(String(txt).trim())) netgsmLogEgressHintOnce();
                    if (val) { val.textContent = 'Bakiye'; val.removeAttribute('title'); }
                    return;
                }

                // stip=1 veya 3 formatı için (Adet)
                var results = xmlDoc.getElementsByTagName("result");
                var adetSms = '';
                var tlSms = '';

                for (var i = 0; i < results.length; i++) {
                    var name = (results[i].getElementsByTagName("balance_name")[0] || {}).textContent || "";
                    var amount = (results[i].getElementsByTagName("amount")[0] || {}).textContent || "";
                    if (name.indexOf("Adet SMS") >= 0) adetSms = amount;
                    if (name.indexOf("Kredi") >= 0 || name.indexOf("TL") >= 0) tlSms = amount;
                }

                // Eğer eski stip=2 formatı gelirse (Doğrudan <balance>)
                var oldBal = (xmlDoc.getElementsByTagName("balance")[0] || {}).textContent;
                var oldCode = ((xmlDoc.getElementsByTagName("code")[0] || {}).textContent || "").trim();
                if (!oldCode) {
                    var mc = txt.match(/<code>\s*([^<]+?)\s*<\/code>/i);
                    if (mc) oldCode = String(mc[1] || '').trim();
                }

                if (adetSms) {
                    if (val) { val.textContent = adetSms + ' Adet'; val.removeAttribute('title'); }
                    if (balEl) balEl.style.display = 'block';
                } else if (oldCode === '00' && oldBal) {
                    if (val) { val.textContent = oldBal + ' TL'; val.removeAttribute('title'); }
                    if (balEl) balEl.style.display = 'block';
                } else if (tlSms) {
                    if (val) { val.textContent = tlSms + ' TL'; val.removeAttribute('title'); }
                    if (balEl) balEl.style.display = 'block';
                } else if (oldCode && oldCode !== '00') {
                    var netgsmErrMsg = {
                        '20': 'NetGSM 20: Mesaj metni veya uzunluk hatası (bakiye sorgusu dışı).',
                        '30': 'NetGSM 30: Kullanıcı/şifre, API kapalı veya IP kısıtı. Vercel IP’si sürekli değişir; kalıcı çözüm: (1) NetGSM’de IP kısıtını kapatın veya (2) sabit IP’li sunucuda netgsm_proxy.php çalıştırıp Vercel’e NETGSM_RELAY_URL ile o adresi verin; NetGSM whitelist’e yalnızca o sunucunun çıkış IPv4’ünü yazın. Yanıt başlığı X-Lab-Netgsm-Via: relay ise köprü devrede, direct ise hâlâ Vercel’den gidiyor demektir. Teşhis: …/api/egress-ip',
                        '40': 'NetGSM 40: Başlık (gönderen adı) tanımlı değil.',
                        '50': 'NetGSM 50: IYS kısıtı.',
                        '51': 'NetGSM 51: IYS marka bilgisi yok.',
                        '60': 'NetGSM 60: JobID bulunamadı.',
                        '70': 'NetGSM 70: Geçersiz parametre.',
                        '80': 'NetGSM 80: Gönderim limiti.',
                        '85': 'NetGSM 85: Yinelenen gönderim limiti.'
                    };
                    var human = netgsmErrMsg[oldCode] || ('NetGSM hata kodu: ' + oldCode);
                    console.warn(human);
                    if (oldCode === '30') netgsmLogEgressHintOnce();
                    if (val) {
                        val.textContent = 'NetGSM · ' + oldCode;
                        val.setAttribute('title', human);
                    }
                    if (balEl) balEl.style.display = 'block';
                } else {
                    console.warn('NetGSM: Beklenmeyen bakiye yanıtı', txt.slice(0, 300));
                    if (val) { val.textContent = 'Bakiye'; val.removeAttribute('title'); }
                }
            })
            .catch(function (err) {
                console.warn('NetGSM Bakiye hatası:', err);
            });
    }

    // --- SMS İLETİM RAPORU SENKRONİZASYONU ---
    var _syncingSms = false;
    function syncAllSmsStatuses() {
        if (_syncingSms) return;
        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) return;

        // Teşhis Logu: msgLog içindeki tüm SMS kayıtlarını kontrol et
        console.log('Mesaj Geçmişi Genel Durum (İlk 5 Kayıt):', msgLog.slice(0, 5).map(function (m) {
            return { tur: m.tur, status: m.status, id: m.msgid, tel: m.tel };
        }));

        // İletilmemiş veya durumu netleşmemiş son 30 kaydı tara
        var pending = msgLog.filter(function (m) {
            var isSms = (m.tur === 'SMS');
            var hasId = !!(m.msgid && m.msgid !== 'NO_ID');
            var notDelivered = (m.status !== 'İletildi');
            return isSms && hasId && notDelivered;
        }).slice(0, 30);

        console.log('Rapor Sorgulama Başlıyor. Bekleyen Kayıt Sayısı:', pending.length);
        if (pending.length > 0) console.log('Taranacak ID listesi:', pending.map(function (x) { return x.msgid }));
        else {
            var skipReason = msgLog.filter(function (m) { return m.tur === 'SMS' && m.status !== 'İletildi'; }).map(function (m) {
                return "ID:" + (m.msgid || 'YOK') + " Durum:" + m.status;
            });
            console.warn('Atlanan SMSler ve Nedenleri:', skipReason);
        }

        _syncingSms = true;
        toast('Durumlar sorgulanıyor (' + pending.length + ')...', 'info');
        var p = [];
        pending.forEach(function (m, i) {
            var url = netgsmProxyAbs('action=report&usercode=' + encodeURIComponent(api.smsUser) + '&password=' + encodeURIComponent(api.smsKey) + '&msgid=' + m.msgid);
            p.push(new Promise(function (res) {
                setTimeout(function () {
                    fetch(url).then(function (r) { return r.text(); }).then(function (txt) {
                        console.log('NetGSM Rapor (ID: ' + m.msgid + '):', txt);

                        var newStatus = m.status;

                        // NetGSM v2 Durum Kodları: 0=İletildi, 1=İletilmedi, 2=Kuyrukta, 11-14=Hatalı
                        var t = (txt || '').trim();
                        // Proxy normalize formatı: STATUS|<code>|...
                        var px = t.match(/^STATUS\|([0-9]{1,2}|NA)\|/);
                        var statusCode = px ? px[1] : null;
                        // Ham format fallback
                        if (!statusCode || statusCode === 'NA') {
                            var mCode = t.match(/(?:^|[^\d])(11|12|13|14|0|1|2|3|4)(?:[^\d]|$)/);
                            if (mCode) statusCode = mCode[1];
                        }
                        // v2: 0=İletildi, 2/4=Kuyrukta, 1/3/11-14=Hatalı
                        if (statusCode === '0') newStatus = 'İletildi';
                        else if (statusCode === '2' || statusCode === '4') newStatus = 'Beklemede';
                        else if (statusCode && ['1', '3', '11', '12', '13', '14'].indexOf(statusCode) >= 0) newStatus = 'Hatalı';
                        else if (t.indexOf('İletildi') >= 0 || t.indexOf('DELIV') >= 0) {
                            newStatus = 'İletildi';
                        }
                        else if (t.indexOf('Beklemede') >= 0 || t.indexOf('PEND') >= 0) {
                            newStatus = 'Beklemede';
                        }
                        else if (t.indexOf('Hata') >= 0 || t.indexOf('ERROR') >= 0 || t.indexOf('Failed') >= 0) {
                            newStatus = 'Hatalı';
                        }

                        if (newStatus !== m.status) {
                            console.log('Durum Değişti:', m.msgid, '->', newStatus);
                            m.status = newStatus;
                            if (m.uid && typeof fsSet === 'function') fsSet('msg_log', m.uid, m);
                        }
                        res();
                    }).catch(res);
                }, i * 450);
            }));
        });

        Promise.all(p).then(function () {
            _syncingSms = false;
            renderMsgLog();
            toast('Mesaj durumları güncellendi ✓', 'ok');
        });
    }

    // ── TOPLU SMS ──────────────────────────────────────────────────────────────
    var smsQueue = [], smsIdx = 0;

    function getSmsSablon() {
        var sel = document.getElementById('smsTplSel');
        if (sel && sel.value === 'kargo') return _tpl.smsKargo || SMS_KARGO;
        return _tpl.smsDefault || SMS_DEF;
    }

    function isSmsKargoSablon() {
        var sel = document.getElementById('smsTplSel');
        return sel && sel.value === 'kargo';
    }

    function updateSmsPrev() {
        if (!smsItem) return;
        document.getElementById('smsPrev').innerHTML = fillTpl(getSmsSablon(), smsItem);
    }

    function buildSmsQueue() {
        var skipDays = parseInt(document.getElementById('smsSkipDays').value) || 3;
        var skipRecent = document.getElementById('smsSkipRecent').checked;
        var maxChips = parseInt(document.getElementById('smsMaxChips').value) || 50;

        smsQueue = chipData.filter(function (d) {
            if (d.pasif || (phoneBook[d.firma] || {}).pasif) return false;
            // Balance filter
            if (d.kal >= maxChips && maxChips < 9000) return false;
            // SMS Opt-out filter
            if (d.smsOff || (phoneBook[d.firma] || {}).smsOff) return false;

            var tel = d.tel || (phoneBook[d.belge] || {}).tel || '';
            if (!tel) return false;
            if (skipRecent) {
                // Hem gün kontrolü hem de kal-değişiklik kontrolü
                if (shouldBlockMsg(d.belge, d.firma)) return false;
                var days = lastMsgDays(d.belge, d.firma);
                if (days !== null && days < skipDays) return false;
            }
            return true;
        });

        smsIdx = 0;
        var infoEl = document.getElementById('smsBulkInfo');
        var goBtn = document.getElementById('smsGo');
        var titleEl = document.getElementById('smsTitle');
        if (titleEl) titleEl.textContent = 'Toplu SMS — ' + smsQueue.length + ' firma';

        if (!smsQueue.length) {
            if (infoEl) infoEl.textContent = 'Kritere uyan firma kalmadı.';
            document.getElementById('smsPrev').innerHTML = '<span style="color:var(--red)">Gönderilecek firma yok. Lütfen filtreyi esnetin.</span>';
            if (goBtn) goBtn.style.display = 'none';
        } else {
            if (goBtn) goBtn.style.display = 'flex';
            _showSmsItem();
        }
    }

    function openSmsModal() {
        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) {
            toast('Ayarlar > SMS API kullanıcı adı ve şifre girin', 'err'); return;
        }
        document.getElementById('smsMod').classList.add('on');
        buildSmsQueue();
    }

    function _showSmsItem() {
        if (!smsQueue.length || smsIdx >= smsQueue.length) {
            if (smsIdx > 0) { closeSmsModal(); toast('Tüm SMS gönderildi ✓', 'ok'); }
            return;
        }
        var d = smsQueue[smsIdx];
        var tel = d.tel || (phoneBook[d.belge] || {}).tel || '';
        var msg = fillTpl(getSablon(), d);
        var days = lastMsgDays(d.belge);
        var daysStr = days === null ? 'İlk mesaj' : days + ' gün önce atıldı';

        document.getElementById('smsBulkInfo').textContent =
            (smsIdx + 1) + '/' + smsQueue.length + ' — ' + d.firma + ' (' + daysStr + ')';
        document.getElementById('smsInfo').innerHTML =
            '<div class="ir"><span class="il">Firma</span><span class="iv">' + d.firma + '</span></div>' +
            '<div class="ir"><span class="il">Tel</span><span class="iv">' + tel + '</span></div>' +
            '<div class="ir" style="border:none"><span class="il">Kalan</span><span class="iv" style="color:var(--red)">' + d.kal + '</span></div>';
        document.getElementById('smsPrev').textContent = msg;
    }

    function sendNextSms() {
        if (smsIdx >= smsQueue.length) return;
        var d = smsQueue[smsIdx];
        var tel = d.tel || (phoneBook[d.belge] || {}).tel || '';
        var msg = fillTpl(getSablon(), d);
        var api = lsGet('alibey_api') || {};

        document.getElementById('smsGo').disabled = true;
        document.getElementById('smsGo').textContent = 'Gönderiliyor...';

        _doSendSms(tel, msg, api, function (ok, msgid) {
            document.getElementById('smsGo').disabled = false;
            document.getElementById('smsGo').innerHTML = '💬 SMS Gönder';
            if (ok) {
                addMsgLog(d.firma, d.belge, 'SMS', msg, 'bakiye', msgid);
                logAction('Toplu SMS gonderdi: ' + d.firma);
                toast('✓ ' + d.firma, 'ok');
            } else {
                toast('Hata: ' + d.firma + ' — atlandı', 'err');
            }
            smsIdx++;
            _showSmsItem();
            if (ok && document.getElementById('smsAuto').checked) {
                setTimeout(sendNextSms, 2000); // 1.5s -> 2s for safety
            }
        });
    }

    function skipSms() {
        smsIdx++;
        _showSmsItem();
    }

    function closeSmsModal() {
        document.getElementById('smsMod').classList.remove('on');
        smsQueue = []; smsIdx = 0;
    }

    // Toast & Confirm

    // ── YEDEKLEME SİSTEMİ ────────────────────────────────────────────────────────
    function exportBackup() {
        var backup = {
            version: 2,
            date: new Date().toISOString(),
            rapor_meta: lsGet('alibey_rapor_meta'),
            chip: chipData,
            chip_orders: chipOrders,
            pb: phoneBook,
            pr: lsGet('alibey_pr') || [],
            sf: lsGet('alibey_sf') || [],
            logs: actLogs,
            api: lsGet('alibey_api') || {}
        };
        var rapor = lsGet('alibey_rapor');
        if (rapor && rapor.length) backup.rapor = rapor;

        var json = JSON.stringify(backup, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var d = new Date();
        var dateStr = d.getFullYear() + '-' +
            ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
            ('0' + d.getDate()).slice(-2);
        a.href = url;
        a.download = 'alibey_yedek_' + dateStr + '.json';
        a.click();
        URL.revokeObjectURL(url);
        toast('Yedek indirildi ✓', 'ok');
        logAction('Sistem yedeği aldı');
    }

    function importBackup(file) {
        if (!file) return;
        var r = new FileReader();
        r.onload = function (e) {
            try {
                var b = JSON.parse(e.target.result);
                if (!b.version) throw new Error('Geçersiz yedek dosyası');

                // Restore all data
                if (b.chip) { chipData = Array.isArray(b.chip) ? b.chip : (b.chip.data || []); }
                if (b.pb) { phoneBook = b.pb; lsSet('alibey_pb2', b.pb); }
                if (b.chip_orders) { chipOrders = Array.isArray(b.chip_orders) ? b.chip_orders : []; lsSet('alibey_chip_orders', chipOrders); }
                if (b.pr) { lsSet('alibey_pr', b.pr); }
                if (b.sf) { lsSet('alibey_sf', b.sf); }
                if (b.logs && Array.isArray(b.logs)) { actLogs = b.logs; }
                if (b.api) { lsSet('alibey_api', b.api); }
                if (b.rapor) { lsSet('alibey_rapor', b.rapor); }
                if (b.rapor_meta) { lsSet('alibey_rapor_meta', b.rapor_meta); }

                // Refresh UI
                initPhoneBook();
                updateChipStats();
                renderChip();
                renderPR();
                renderSF();
                loadRapor();
                if (typeof renderLogs === 'function') renderLogs();

                var dateStr = b.date ? new Date(b.date).toLocaleDateString('tr-TR') : '?';
                toast('Yedek yüklendi! (' + dateStr + ')', 'ok');
                logAction('Sistem yedeği yükledi: ' + (b.date || ''));
            } catch (err) {
                toast('Yedek okunamadı: ' + err.message, 'err');
            }
        };
        r.readAsText(file, 'utf-8');
    }

    function toast(msg, type) {
        type = type || 'ok';
        var ic = {
            ok: '✓',
            err: '✕',
            info: 'ℹ'
        };
        var t = document.getElementById('toast');
        t.innerHTML = '<span>' + (ic[type] || 'ℹ') + '</span><span>' + msg + '</span>';
        t.className = 'toast on ' + type;
        setTimeout(function () {
            t.classList.remove('on');
        }, 3200);
    }

    // ── CHİP TOPLU İŞLEM HELPERS ──────────────────────────────────────
    function chipGetSelItems() {
        var chks = document.querySelectorAll('.chipChk:checked');
        return Array.prototype.map.call(chks, function (c) {
            return { key: c.getAttribute('data-key'), firma: c.getAttribute('data-firma'), belge: c.getAttribute('data-belge') };
        });
    }
    function chipSelChange() { chipUpdateBulkBar(); }
    function chipUpdateBulkBar() {
        var sel = chipGetSelItems();
        var bar = document.getElementById('chipBulkBar');
        var cnt = document.getElementById('chipSelCount');
        if (bar) bar.style.display = sel.length > 0 ? 'flex' : 'none';
        if (cnt) cnt.textContent = sel.length + ' seçili';
    }
    function chipToggleAll(checked) {
        document.querySelectorAll('.chipChk').forEach(function (c) { c.checked = checked; });
        chipUpdateBulkBar();
    }
    function chipClearSel() {
        chipToggleAll(false);
        var ca = document.getElementById('chipChkAll');
        if (ca) ca.checked = false;
    }
    function bulkChipPassive() {
        var items = chipGetSelItems();
        if (!items.length) return;
        items.forEach(function (it) {
            var d = chipData.find(function (x) { return (x.id || getChipId(x)) === it.key || x.firma === it.firma; });
            if (d) { d.pasif = true; fbSaveChip(d); }
            if (phoneBook[it.firma]) phoneBook[it.firma].pasif = true;
        });
        lsSet('alibey_chip', { data: chipData, pb: phoneBook }); savePB();
        chipClearSel(); renderChip();
        toast(items.length + ' firma pasif yapıldı — mesaj gitmeyecek', 'info');
        logAction(items.length + ' çip firması pasif yapıldı');
    }
    function bulkChipActive() {
        var items = chipGetSelItems();
        if (!items.length) return;
        items.forEach(function (it) {
            var d = chipData.find(function (x) { return (x.id || getChipId(x)) === it.key || x.firma === it.firma; });
            if (d) { d.pasif = false; fbSaveChip(d); }
            if (phoneBook[it.firma]) phoneBook[it.firma].pasif = false;
        });
        lsSet('alibey_chip', { data: chipData, pb: phoneBook }); savePB();
        chipClearSel(); renderChip();
        toast(items.length + ' firma aktif yapıldı', 'ok');
        logAction(items.length + ' çip firması aktif yapıldı');
    }
    function bulkChipDelete() {
        var items = chipGetSelItems();
        if (!items.length) return;
        var names = items.map(function (it) { return it.firma; }).join(', ');
        showConfirm('Toplu Sil', items.length + ' firma silinsin mi?\n' + names, function () {
            items.forEach(function (it) {
                // ① Kara listeye ekle
                addDeletedFirm(it.firma, it.belge);
                // ② phoneBook'tan sil — fbSaveAllChip geri yazmasın
                if (phoneBook[it.firma]) delete phoneBook[it.firma];
                // ③ Firestore'dan sil (tüm ID varyantları)
                fsDel('chip_data', it.key);
                if (it.belge) {
                    var altId = it.belge.replace(/[^a-zA-Z0-9_-]/g, '_');
                    if (altId !== it.key) fsDel('chip_data', altId);
                    var altId2 = it.belge.replace(/\D/g, '').replace(/^0+/, '');
                    if (altId2 && altId2 !== it.key) fsDel('chip_data', altId2);
                }
                // ④ Bellekten sil
                chipData = chipData.filter(function (x) {
                    return (x.id || getChipId(x)) !== it.key && x.firma !== it.firma;
                });
            });
            savePB();
            lsSet('alibey_chip', { data: chipData, pb: phoneBook });
            chipClearSel(); renderChip(); updateChipStats();
            toast(items.length + ' firma silindi', 'info');
            logAction(items.length + ' çip firması toplu silindi');
        });
    }

    // ── SF TOPLU CARİ ─────────────────────────────────────────────────
    // Seçili tüm SF firmalarının yapı sahiplerini birleştirip cari oluştur
    function bulkUseSF() {
        var indices = sfGetSelIndices();
        if (!indices.length) { toast('En az bir firma seçin', 'err'); return; }
        var allYS = [];
        indices.forEach(function (i) {
            var ysList = (sfData[i].ys || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            ysList.forEach(function (y) { if (allYS.indexOf(y) < 0) allYS.push(y); });
        });
        var base = sfData[indices[0]];
        window._sfPrices = { beton: base.beton, celik: base.celik, karot: base.karot, pazar: base.pazar };
        selectedOwners = {};
        allYS.forEach(function (ys) {
            Object.entries(owners).forEach(function (o) {
                var name = (o[1].name || '').toLowerCase();
                var y = ys.toLowerCase();
                if (name.indexOf(y) >= 0 || y.indexOf(name) >= 0) selectedOwners[o[0]] = true;
            });
        });
        renderOwners(''); renderTags();
        var btn2 = document.getElementById('btn2');
        if (btn2) btn2.disabled = Object.keys(selectedOwners).length === 0;
        toast(Object.keys(selectedOwners).length + ' yapı sahibi seçildi (' + indices.length + ' firma)', 'ok');
        sfClearSel();
        goNav(2);
    }

    function confirmDeleteChip(id, name) {
        if (!id) { id = getChipId({ firma: name }); } // Fallback
        showConfirm('Firmayı Sil', '"' + name + '" firmasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.', function () {
            var d = chipData.find(function (x) { return x.id === id || getChipId(x) === id; });
            // ① Kara listeye ekle — polling ile geri gelmesin
            addDeletedFirm(name, d ? d.belge : '');
            // ② phoneBook'tan da sil — fbSaveAllChip yeniden yazmasın
            if (phoneBook[name]) { delete phoneBook[name]; savePB(); }
            // ③ Firestore'dan sil (belge no bazlı alternatif ID'ler de silinsin)
            fsDel('chip_data', id);
            if (d && d.belge) {
                var altId = d.belge.replace(/[^a-zA-Z0-9_-]/g, '_');
                if (altId !== id) fsDel('chip_data', altId);
                var altId2 = d.belge.replace(/\D/g, '').replace(/^0+/, '');
                if (altId2 && altId2 !== id) fsDel('chip_data', altId2);
            }
            // ④ Bellekten sil
            chipData = chipData.filter(function (x) { return x.id !== id && getChipId(x) !== id; });
            lsSet('alibey_chip', { data: chipData, pb: phoneBook });
            renderChip();
            updateChipStats();
            toast('Firma silindi', 'ok');
            logAction('Firma sildi: ' + name);
        });
    }

    function sendTestSms() {
        var api = lsGet('alibey_api') || {};
        if (!api.smsUser || !api.smsKey) {
            toast('Önce API bilgilerini kaydedin', 'err'); return;
        }
        var testTel = '05074017765';
        var testMsg = 'Alibey Beton Çelik Analiz Kentsel Dönüşüm Laboratuvarı San. Tic. Ltd. Şti. SMS testi. API bağlantısı başarılı.';
        toast('Test gönderiliyor...', 'info');
        _doSendSms(testTel, testMsg, api, function (ok, msgid) {
            // ok = true: received NetGSM 00/01/02 response
            // When using no-cors fallback, _doSendSms calls cb(true, msgid) on success
            if (ok) {
                var info = msgid ? ' (ID: ' + msgid + ')' : '';
                toast('✓ Test SMS gönderildi ' + testTel + info, 'ok');
                console.log('Test SMS Başarılı. Mesaj ID:', msgid);
            } else {
                toast('✕ Test SMS gönderilemedi — NetGSM kimlik bilgilerini kontrol edin', 'err');
            }
        });
    }

    var confirmCb = null;

    function showConfirm(title, text, cb) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        confirmCb = cb;
        document.getElementById('confirmMod').classList.add('on');
    }

    function closeConfirm() {
        document.getElementById('confirmMod').classList.remove('on');
        confirmCb = null;
    }
    var confirmYesBtn = document.getElementById('confirmYesBtn');
    if (confirmYesBtn) confirmYesBtn.onclick = function () {
        var cb = confirmCb;
        closeConfirm();
        if (cb) cb();
    };

    // INIT — Next.js app.js "afterInteractive" ile yüklendiğinde DOMContentLoaded çoktan geçmiş olur; readyState ile de çalıştır.
    function runAppBootstrap() {
        if (window.__alibeyBootstrapped) return;
        window.__alibeyBootstrapped = true;

        initPhoneBook();
        loadChipFromLocalStorage();

        var _td = document.getElementById('coTarih');
        if (_td) _td.value = new Date().toISOString().split('T')[0];
        localStorage.removeItem('alibey_sync_lock');
        updateChipStats();
        checkAuth();
        // Portal (`lab_session`) ile giriş: `alibey_user` yok → checkAuth Firestore sync başlatmaz; API/çip yine de çekilsin
        var _bootUser = lsGet('alibey_user');
        if ((!_bootUser || !_bootUser.id) && _labSessionOk()) {
            setTimeout(function () {
                fbSyncAll();
                startFbPolling();
            }, 400);
        }
        // Ana sayfa değilse (Next.js alt sayfaları: /beton, /chip vb.) sw/goNav çağırma
        var _isMainPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
        // Next.js dashboard: lab_session ile girişte alibey_user yok → sw varsayılan 'personel' + cari yasak → toast.
        // Eski index.html gövdesinde #mod-cari vardır; Next arayüzünde yoktur — yalnızca legacy shell'de mod değiştir.
        var _legacyCariShell = !!document.getElementById('mod-cari');
        if (_isMainPage && _legacyCariShell) {
            initUploads();
            loadRapor();
            sw('cari');
            goNav(1);
        }
        renderSF();
        renderPR();
        fbPullStaff();

        if (!localStorage.getItem('alibey_cleanup_test_v1')) {
            var targets = ['YAPI DENETİM A', 'YAPI DENETİM B', 'TEST FIRMA A', 'TEST FIRMA B'];
            var cleaned = chipData.filter(function (d) { return targets.indexOf(d.firma) === -1; });
            if (cleaned.length !== chipData.length) {
                chipData = cleaned;
                lsSet('alibey_chip', { data: chipData, pb: phoneBook });
                console.log('Test firms cleaned up from İzleme.');
            }
            localStorage.setItem('alibey_cleanup_test_v1', '1');
        }
    }
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', runAppBootstrap);
    } else {
        runAppBootstrap();
    }
    



