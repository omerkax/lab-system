// ── Firebase / Firestore REST helpers ────────────────────────────────
var FB_CONFIG = {
    apiKey: "AIzaSyALnq6b88THk8VpRhBDLGUkR26hplFtnng",
    authDomain: "alibey-lab.firebaseapp.com",
    projectId: "alibey-lab"
};

var DB_URL = "https://firestore.googleapis.com/v1/projects/" + FB_CONFIG.projectId + "/databases/(default)/documents";
var DB_KEY = FB_CONFIG.apiKey;

function fsUrl(collection, docId) {
    return DB_URL + "/" + collection + (docId ? "/" + docId : "");
}
function fsHeaders() {
    return { "Content-Type": "application/json" };
}

/** 401/403: genelde API anahtarı referrer kısıtı veya Firestore kuralları — sessiz boş dizi kullanıcıyı yanıltıyor */
function _fsNotifyAccessDenied(r, verb, collection) {
    var st = r && r.status;
    if (st !== 401 && st !== 403 && st !== 400) return;
    if (typeof window !== 'undefined' && window.__fsAccessDeniedNotified) return;
    if (typeof window !== 'undefined') window.__fsAccessDeniedNotified = true;
    try {
        r.clone().text().then(function (t) {
            console.error('[Firestore ' + verb + ' ' + (collection || '') + '] HTTP ' + st, t && t.slice ? t.slice(0, 500) : t);
        });
    } catch (e) {}
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    var ref = origin ? origin + '/*' : 'https://SIZIN-ALAN-ADINIZ/*';
    var msg = 'Firestore reddetti (HTTP ' + st + '). Google Cloud Console → APIs & Services → Credentials → tarayıcı API anahtarınız → Application restrictions: HTTP referrer’a ekleyin: ' + ref + ' — Firebase → Firestore → Rules: okuma/yazma izni (REST ile API anahtarı kullanılıyor; kimlik doğrulamasız kurallar gerekir).';
    if (typeof toast === 'function') {
        setTimeout(function () { toast(msg, 'err'); }, 200);
    } else if (typeof window !== 'undefined' && window.console) {
        console.error(msg);
    }
}
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
    if (doc.name) obj._id = doc.name.split('/').pop();
    return obj;
}

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
        setTimeout(_fsFlush, 50);
    });
}

function fsGetDoc(collection, docId, cb) {
    var url = fsUrl(collection, docId) + '?key=' + DB_KEY;
    return _fsEnqueue(function () {
        return fetch(url, { headers: fsHeaders() })
            .then(function (r) {
                if (r.status === 404) return null;
                if (!r.ok) {
                    _fsNotifyAccessDenied(r, 'GET doc', collection + '/' + docId);
                    console.warn('fsGetDoc hata ' + r.status);
                    return null;
                }
                return r.json();
            })
            .then(function (data) {
                var result = (data && data.fields) ? fsDoc2obj(data) : null;
                if (cb) cb(result);
                return result;
            })
            .catch(function (err) { console.error('fsGetDoc network hata:', err); if (cb) cb(null); return null; });
    });
}

/** İsteğe bağlı doküman: yoksa 404 yerine runQuery → 200 (konsol / ağ sekmesi kirlenmez) */
function fsGetDocQuiet(collection, docId, cb) {
    if (!docId) return fsGetDoc(collection, docId, cb);
    var refPath = 'projects/' + FB_CONFIG.projectId + '/databases/(default)/documents/' + collection + '/' + docId;
    var runUrl = 'https://firestore.googleapis.com/v1/projects/' + FB_CONFIG.projectId + '/databases/(default)/documents:runQuery?key=' + DB_KEY;
    return _fsEnqueue(function () {
        return fetch(runUrl, {
            method: 'POST',
            headers: fsHeaders(),
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: collection }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: '__name__' },
                            op: 'EQUAL',
                            value: { referenceValue: refPath }
                        }
                    },
                    limit: 1
                }
            })
        })
            .then(function (r) {
                if (!r.ok) {
                    _fsNotifyAccessDenied(r, 'runQuery', collection + '/' + docId);
                    console.warn('fsGetDocQuiet hata ' + r.status);
                    return null;
                }
                return r.json();
            })
            .then(function (rows) {
                var result = null;
                if (Array.isArray(rows) && rows[0] && rows[0].document && rows[0].document.fields) {
                    result = fsDoc2obj(rows[0].document);
                }
                if (cb) cb(result);
                return result;
            })
            .catch(function (err) { console.error('fsGetDocQuiet network hata:', err); if (cb) cb(null); return null; });
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
                    if (_attempt >= 3) return Promise.resolve(accumulated);
                    var delay = 4000 + 2000 * _attempt;
                    return new Promise(function (resolve) {
                        setTimeout(function () { fsGet(collection, pageToken, accumulated, _attempt + 1).then(resolve); }, delay);
                    });
                }
                if (!r.ok) {
                    _fsNotifyAccessDenied(r, 'GET list', collection);
                    console.warn('fsGet hata ' + r.status);
                    return Promise.resolve(accumulated);
                }
                return r.json().then(function (data) {
                    if (!data) return accumulated;
                    if (data.documents && data.documents.length) accumulated = accumulated.concat(data.documents.map(fsDoc2obj));
                    if (data.nextPageToken && typeof data.nextPageToken === 'string') return fsGet(collection, data.nextPageToken, accumulated, 0);
                    return accumulated;
                });
            })
            .catch(function (e) { console.error('fsGet hata:', e); return accumulated; });
    });
}

function fsSet(collection, docId, obj) {
    var fields = obj2fsFields(obj);
    var url = fsUrl(collection, docId) + "?key=" + DB_KEY;
    return fetch(url, {
        method: "PATCH",
        headers: fsHeaders(),
        body: JSON.stringify({ fields: fields })
    }).then(function (r) {
        if (!r.ok) {
            _fsNotifyAccessDenied(r, 'PATCH', collection + '/' + docId);
            console.warn('fsSet hata ' + r.status);
        }
    }).catch(function (e) { console.error('fsSet hata:', e); });
}

function fsDel(collection, docId) {
    return fetch(fsUrl(collection, docId) + "?key=" + DB_KEY, {
        method: "DELETE", headers: fsHeaders()
    }).then(function (r) {
        if (!r.ok) {
            _fsNotifyAccessDenied(r, 'DELETE', collection + '/' + docId);
            console.warn('fsDel hata ' + r.status);
        }
    }).catch(function (e) { console.error('fsDel hata:', e); });
}

// ── LocalStorage helpers ───────────────────────────────────────────
function lsGet(k, fb) {
    try {
        var v = localStorage.getItem(k);
        if (v === null || v === 'null' || v === 'undefined') return (fb !== undefined ? fb : null);
        return JSON.parse(v);
    } catch (e) { return (fb !== undefined ? fb : null); }
}
function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}

// ── logAction — Firestore'a log kaydı ────────────────────────────
function logAction(modul, action) {
    // app.js yüklendiyse oradaki versiyon çalışır — bu sadece fallback
    var entry = {
        id: 'log-' + Date.now(),
        zaman: new Date().toISOString(),
        modul: modul || 'sistem',
        aksiyon: action || '',
    };
    console.log('[log]', entry.modul, entry.aksiyon);
    if (typeof fsSet === 'function') {
        fsSet('logs', entry.id, entry).catch(function() {});
    }
}

// ── Toast bildirimi ────────────────────────────────────────────────
function toast(msg, type) {
    type = type || 'ok';
    var ic = { ok: '✓', err: '✕', info: 'ℹ' };
    var t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.innerHTML = '<span>' + (ic[type] || 'ℹ') + '</span><span style="margin-left:8px">' + msg + '</span>';
    t.className = 'toast on ' + type;
    setTimeout(function () { t.classList.remove('on'); }, 3200);
}

// ── setSyncStatus ──────────────────────────────────────────────────
function setSyncStatus(ok) {
    var el = document.getElementById('syncDot');
    if (!el) return;
    el.style.background = ok ? '#22C55E' : '#F87171';
}
function setSyncBusy() {
    var el = document.getElementById('syncDot');
    if (!el) return;
    el.style.background = '#F59E0B';
}
