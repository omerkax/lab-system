// EBİSTR Token Yakalayıcı — birden fazla lab adresine setToken (canlı + eski Vercel)
const PROXY_URL_KEY = 'proxyUrl';
const TOKEN_KEY = 'ebistrToken';

/** Kayıtlı proxy boş / eski kalırsa kullanılacak canlı lab kökü */
const DEFAULT_PROXY = 'https://alibeyerp.omerkaya.com.tr';

/** Sırayla denenecek yedekler (kayıtlı URL yanlış veya soğuk örnek sonrası) */
const LAB_FALLBACK_BASES = [
    'https://alibeyerp.omerkaya.com.tr',
    'https://lab-system-six.vercel.app',
];

let lastSentToken = '';
let lastSentAt = 0;

function normalizeBase(u) {
    if (!u || typeof u !== 'string') return '';
    return u.trim().replace(/\/+$/, '');
}

function collectLabBases(primary) {
    const out = [];
    const add = (u) => {
        const b = normalizeBase(u);
        if (!b || out.includes(b)) return;
        out.push(b);
    };
    add(primary);
    if (!normalizeBase(primary)) add(DEFAULT_PROXY);
    LAB_FALLBACK_BASES.forEach(add);
    return out;
}

function postSetToken(base, token) {
    return fetch(base + '/api/ebistr/setToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    }).then((r) => r.json());
}

/** İlk başarılı lab kökünü döndürür (yoksa null) */
function pushTokenToLabs(token, proxyUrl, force) {
    if (!token || typeof token !== 'string') return Promise.resolve(null);
    const now = Date.now();
    if (!force && token === lastSentToken && now - lastSentAt < 8000) {
        return Promise.resolve('__cached__');
    }

    const bases = collectLabBases(proxyUrl || DEFAULT_PROXY);
    let p = Promise.resolve(null);

    bases.forEach((base) => {
        p = p.then((won) => {
            if (won && won !== '__pending_fail__') return won;
            return postSetToken(base, token)
                .then((d) => {
                    if (d && d.ok) return base;
                    return '__pending_fail__';
                })
                .catch(() => '__pending_fail__');
        });
    });

    return p.then((won) => {
        if (won === '__cached__') return '__cached__';
        if (!won || won === '__pending_fail__') return null;
        lastSentToken = token;
        lastSentAt = Date.now();
        chrome.storage.local.set({
            [TOKEN_KEY]: token,
            tokenZaman: new Date().toISOString(),
            [PROXY_URL_KEY]: won,
        });
        chrome.notifications.create('token-ok', {
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Alibey EBİSTR',
            message: 'Token güncellendi. Sistem hazır.',
        });
        setTimeout(() => chrome.notifications.clear('token-ok'), 2000);
        return won;
    });
}

function tokenYakalandi(token, proxyUrl, opts) {
    const force = opts && opts.force;
    pushTokenToLabs(token, proxyUrl || DEFAULT_PROXY, force).then((won) => {
        if (won === null) {
            console.warn('[Alibey EBİSTR] setToken tüm lab adreslerinde başarısız.');
        }
    });
}

// ── İSTEKLERİ İZLE ────────────────────────────────────────────────
chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
        const headers = details.requestHeaders || [];
        const authHeader = headers.find((h) => h.name.toLowerCase() === 'authorization');
        if (!authHeader || !authHeader.value) return;
        const token = authHeader.value.replace(/^Bearer\s+/i, '').trim();
        chrome.storage.local.get([PROXY_URL_KEY], function (r) {
            tokenYakalandi(token, r[PROXY_URL_KEY] || DEFAULT_PROXY, {});
        });
    },
    { urls: ['https://*.ebistr.com/*'] },
    ['requestHeaders', 'extraHeaders']
);

// ── OTURUM TAZELEME + depodaki JWT’yi lab’a yeniden gönder ────────
chrome.alarms.create('tokenYenile', { periodInMinutes: 25 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name !== 'tokenYenile') return;
    chrome.tabs.query({ url: 'https://business.ebistr.com/*' }, function (tabs) {
        if (tabs && tabs.length) {
            tabs.forEach((tab) => {
                chrome.scripting
                    .executeScript({
                        target: { tabId: tab.id },
                        func: function () {
                            fetch('/api/announcement/findAllCurrentDate', { headers: { 'Content-Type': 'application/json' } }).catch(
                                function () {}
                            );
                        },
                    })
                    .catch(function () {});
            });
        }
    });
    chrome.storage.local.get([TOKEN_KEY, PROXY_URL_KEY], function (r) {
        if (r[TOKEN_KEY]) tokenYakalandi(r[TOKEN_KEY], r[PROXY_URL_KEY] || DEFAULT_PROXY, { force: true });
    });
});

// ── POPUP / content script ─────────────────────────────────────────
// return true yalnızca sendResponse’un async çağrılacağı durumda; aksi halde Chrome “message channel closed” uyarısı verir
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'syncToken') {
        const force = !!(msg && msg.force);
        chrome.storage.local.get([TOKEN_KEY, PROXY_URL_KEY], function (r) {
            if (!r[TOKEN_KEY]) {
                sendResponse({ ok: false });
                return;
            }
            pushTokenToLabs(r[TOKEN_KEY], r[PROXY_URL_KEY] || DEFAULT_PROXY, force)
                .then(function (won) {
                    sendResponse({ ok: won === '__cached__' || !!won });
                })
                .catch(function () {
                    sendResponse({ ok: false });
                });
        });
        return true;
    }

    if (msg.action === 'csvIndir') {
        sendResponse({ ok: false, mesaj: 'CSV indirme kaldırıldı. Proxy cache kullanın.' });
        return false;
    }

    return false;
});
