// EBİSTR Token Yakalayıcı v7 — Sessiz Mod
const PROXY_URL_KEY = 'proxyUrl';
const TOKEN_KEY = 'ebistrToken';
const DEFAULT_PROXY = 'https://lab-system-production-fd87.up.railway.app';

let lastSentToken = '';

// ── İSTEKLERİ İZLE ────────────────────────────────────────────────
chrome.webRequest.onBeforeSendHeaders.addListener(
    function (details) {
        const headers = details.requestHeaders || [];
        const authHeader = headers.find(h => h.name.toLowerCase() === 'authorization');
        if (!authHeader || !authHeader.value) return;
        const token = authHeader.value.replace(/^Bearer\s+/i, '').trim();
        if (token === lastSentToken) return;
        chrome.storage.local.get([PROXY_URL_KEY], function (r) {
            tokenYakalandi(token, r[PROXY_URL_KEY] || DEFAULT_PROXY);
        });
    },
    { urls: ['https://*.ebistr.com/*'] },
    ['requestHeaders', 'extraHeaders']
);

// ── TOKEN YAKALANDI (Sadece Proxy'ye Gönder) ─────────────────────
function tokenYakalandi(token, proxyUrl) {
    fetch(proxyUrl + '/api/ebistr/setToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    })
    .then(r => r.json())
    .then(d => {
        if (!d.ok) return;
        lastSentToken = token;
        chrome.storage.local.set({ [TOKEN_KEY]: token, tokenZaman: new Date().toISOString() });
        console.log('Token Proxy\'ye iletildi. Sistem arka planda güncelleniyor.');

        chrome.notifications.create('token-ok', {
            type: 'basic', iconUrl: 'icon48.png',
            title: 'Alibey EBİSTR',
            message: 'Token güncellendi. Sistem hazır.'
        });
        setTimeout(() => chrome.notifications.clear('token-ok'), 2000);
    })
    .catch(err => console.warn('Proxy bağlantı hatası:', err.message));
}

// ── OTURUM TAZELEME ──────────────────────────────────────────────
chrome.alarms.create('tokenYenile', { periodInMinutes: 25 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'tokenYenile') {
        chrome.tabs.query({ url: 'https://business.ebistr.com/*' }, function (tabs) {
            if (!tabs || tabs.length === 0) return;
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: function () {
                        fetch('/api/announcement/findAllCurrentDate', { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
                    }
                }).catch(() => {});
            });
        });
    }
});

// ── POPUP MESAJLARI ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'syncToken') {
        chrome.storage.local.get([TOKEN_KEY, PROXY_URL_KEY], function(r) {
            if (r[TOKEN_KEY]) {
                tokenYakalandi(r[TOKEN_KEY], r[PROXY_URL_KEY] || DEFAULT_PROXY);
                sendResponse({ ok: true });
            } else { sendResponse({ ok: false }); }
        });
    }

    // csvIndir: Artık gerekli değil — proxy cache tüm verileri tutuyor.
    // ERP'den /api/ebistr/numuneler endpoint'i JSON döndürüyor.
    if (msg.action === 'csvIndir') {
        sendResponse({ ok: false, mesaj: 'CSV indirme kaldırıldı. Proxy cache kullanın.' });
    }

    return true;
});
