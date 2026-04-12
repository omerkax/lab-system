/** Boş depolama: canlı lab (background ile aynı kök) */
const DEFAULT_PROXY = 'https://alibeyerp.omerkaya.com.tr';


document.addEventListener('DOMContentLoaded', function () {
    yukle();

    document.getElementById('btnProxyKaydet').addEventListener('click', proxyKaydet);
    document.getElementById('btnCsvIndir').addEventListener('click', csvIndir);
    document.getElementById('btnKapat').addEventListener('click', function () { window.close(); });
    
    // Tarih değişimlerini kaydet
    const tBas = document.getElementById('tarBas');
    const tBit = document.getElementById('tarBit');
    const saveDates = () => {
        chrome.storage.local.set({ tarBas: tBas.value, tarBit: tBit.value });
    };
    tBas.addEventListener('change', saveDates);
    tBit.addEventListener('change', saveDates);

    document.getElementById('btnSyncToken').addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'syncToken', force: true }, function(r) {
            if (r && r.ok) {
                alert('Giriş anahtarı Proxy\'ye gönderildi.');
                proxyKontrol(document.getElementById('proxyUrl').value || DEFAULT_PROXY);
            } else {
                alert('Hata: Eklenti hafızasında kayıtlı bir giriş bulunamadı. Lütfen EBİSTR sayfasını yenileyin.');
            }
        });
    });

    document.getElementById('btnCopyToken').addEventListener('click', function () {
        chrome.storage.local.get(['ebistrToken'], function (r) {
            var t = r.ebistrToken;
            if (!t) {
                alert('Kayıtlı token yok. Önce business.ebistr.com sayfasında oturum açıp sayfayı yenileyin.');
                return;
            }
            function ok() { alert('Panoya kopyalandı. Telefonda Laboratuvar → EBİSTR Ayar → Token alanına yapıştırıp Sunucuya kaydedin.'); }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t).then(ok).catch(function () { fallbackCopy(t, ok); });
            } else {
                fallbackCopy(t, ok);
            }
        });
    });
});

function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        done();
    } catch (e) {
        alert('Kopyalanamadı. Token uzun; eklenti depolamasından manuel alın.');
    }
    document.body.removeChild(ta);
}

function yukle() {
    chrome.storage.local.get(['proxyUrl', 'ebistrToken', 'tokenZaman', 'tarBas', 'tarBit'], function (r) {
        document.getElementById('proxyUrl').value = r.proxyUrl || DEFAULT_PROXY;
        if (r.ebistrToken) {
            document.getElementById('tokTxt').textContent = r.ebistrToken.substring(0, 14) + '...';
        }
        if (r.tokenZaman) {
            var d = new Date(r.tokenZaman);
            document.getElementById('tokZaman').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        
        // Tarihleri yükle veya varsayılan ata
        const bugun = new Date().toISOString().split('T')[0];
        const birHaftaOnce = new Date();
        birHaftaOnce.setDate(birHaftaOnce.getDate() - 7);
        const baslangic = birHaftaOnce.toISOString().split('T')[0];

        document.getElementById('tarBas').value = r.tarBas || baslangic;
        document.getElementById('tarBit').value = r.tarBit || bugun;

        proxyKontrol(r.proxyUrl || DEFAULT_PROXY);
    });
}

function proxyKontrol(url) {
    fetch(url + '/api/ebistr/status')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            document.getElementById('dot').className = 'dot ' + (d.loggedIn ? 'ok' : 'warn');
            document.getElementById('statusTxt').textContent = d.loggedIn
                ? 'Proxy bağlı — Token aktif'
                : 'Proxy bağlı — Giriş bekleniyor';
        })
        .catch(function () {
            document.getElementById('dot').className = 'dot err';
            document.getElementById('statusTxt').textContent = 'Proxy çalışmıyor!';
        });
}

function proxyKaydet() {
    var url = document.getElementById('proxyUrl').value.trim();
    chrome.storage.local.set({ proxyUrl: url }, function () { proxyKontrol(url); });
}

function csvIndir() {
    var bas = document.getElementById('tarBas').value;
    var bit = document.getElementById('tarBit').value;
    if (!bas || !bit) return alert('Başlangıç ve bitiş tarihlerini seçin!');

    var msg = document.getElementById('csvMsg');
    msg.innerHTML = '<div class="msg ok">⏳ CSV indiriliyor... (' + bas + ' / ' + bit + ')</div>';

    chrome.runtime.sendMessage({ action: 'csvIndir', basTarih: bas, bitTarih: bit }, function () {
        setTimeout(function () { msg.innerHTML = ''; }, 4000);
    });
}
