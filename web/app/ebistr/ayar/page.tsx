'use client';
import { useEffect, useRef } from 'react';
import { ensureEbistrScript } from '@/lib/load-script-client';

const HTML = `
        <!-- SMTP -->
        <div class="card" style="margin-bottom:14px">
            <div class="ch">📧 SMTP Mail Ayarları</div>
            <div class="alrt i" style="margin-bottom:14px">
                <span class="alrt-ic">ℹ️</span>
                <span>Gmail kullanıyorsanız "Uygulama Şifresi" gerekir: Google Hesabı → Güvenlik → 2 Adımlı Doğrulama → Uygulama Şifreleri. Canlı ortamda ayarları kaydettikten sonra mutlaka <strong>Test Maili Gönder</strong> ile doğrulayın.</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                    <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Gmail / SMTP Adresi</label>
                    <input class="pi" id="ebistr-smtp-user" type="email" placeholder="lab@gmail.com" style="width:100%;box-sizing:border-box">
                </div>
                <div>
                    <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">App Password (Uygulama Şifresi)</label>
                    <input class="pi" id="ebistr-smtp-pass" type="password" placeholder="xxxx xxxx xxxx xxxx" style="width:100%;box-sizing:border-box">
                </div>
                <div>
                    <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">CC — Kopyalanacak Mail (isteğe bağlı)</label>
                    <input class="pi" id="ebistr-smtp-cc" type="email" placeholder="mudur@lab.com" style="width:100%;box-sizing:border-box">
                </div>
                <div>
                    <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Otomatik Mail Koşulu</label>
                    <select class="pi" id="ebistr-mail-kosul" style="width:100%;box-sizing:border-box">
                        <option value="uygunsuz">Sadece Uygunsuz</option>
                        <option value="uyari" selected>Uygunsuz + Sapmalı</option>
                        <option value="hepsi">Tümü</option>
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
                <button class="btn btn-p" onclick="ebistrAyarKaydet()">💾 Kaydet (Veritabanına)</button>
                <button class="btn btn-o" onclick="ebistrSmtpTest()">📧 Test Maili Gönder</button>
                <span id="ebistr-ayar-msg" style="font-size:12px;color:var(--grn)"></span>
            </div>
        </div>
        <div class="card" style="margin-bottom:14px">
            <div class="ch">🔐 EBİSTR Business oturumu</div>
            <div class="alrt i" style="margin-bottom:12px">
                <span class="alrt-ic">ℹ️</span>
                <span><strong>Girişi</strong> her zaman <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">business.ebistr.com</code> üzerinden yapın. <strong>Masaüstü Chrome + eklenti</strong> Authorization jetonunu otomatik laboratuvar sunucunuza iletir. <strong>Mobil ve diğer tarayıcılar</strong> güvenlik nedeniyle başka sitenin istek başlıklarını okuyamaz; bu yüzden ya aşağıdaki <strong>yer imi</strong> (EBİSTR sayfası açıkken) ya da <strong>manuel token</strong> gerekir — telefon “kendi kendine” token bulamaz.</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
                <button type="button" class="btn btn-p" onclick="ebistrBusinessGirisAc()">EBİSTR’de giriş aç (yeni sekme)</button>
                <button type="button" class="btn btn-o" onclick="ebistrTokenSonrasiBaglan()">Girişten sonra lab’ı bağla</button>
                <button type="button" class="btn btn-o" onclick="ebistrMobilBookmarkletKopyala()">Mobil: EBİSTR yer imi kopyala</button>
            </div>
            <div style="font-size:11px;color:var(--tx3);margin-top:12px;line-height:1.5"><strong>Yer imi kullanımı:</strong> Kopyala → tarayıcıda yeni yer imi oluştur → URL alanına yapıştır → <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">business.ebistr.com</code>’da giriş yaptıktan sonra adres çubuğundan bu yer imine dokunun (sayfa EBİSTR iken).</div>
        </div>
        <!-- PROXY -->
        <div class="card">
            <div class="ch">🔌 Proxy Bağlantısı</div>
            <div class="alrt i" style="margin-bottom:12px">
                <span class="alrt-ic">ℹ️</span>
                <span>EBİSTR API tabanı: alan boşsa otomatik olarak bu sitenin adresi (<code style="background:var(--sur2);padding:2px 6px;border-radius:4px">location.origin</code>) kullanılır; sayfa açılınca bu değer kutuya yazılır. Frontend ile API farklı domaindeyse derleme ortamında <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">NEXT_PUBLIC_LAB_BASE_URL</code> tanımlayın (örn. <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">https://sunucunuz.com</code>) — <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">netgsm_proxy.php</code> ile aynı kök olmalıdır.</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end">
                <div>
                    <label style="font-size:12px;color:var(--tx3);display:block;margin-bottom:5px">Proxy URL (otomatik doldurulur)</label>
                    <input class="pi" id="ebistr-proxy-url-inp" type="text" placeholder="Boş bırakılabilir — bu site kullanılır" style="width:100%;box-sizing:border-box">
                </div>
                <button class="btn btn-o" onclick="ebistrProxyKontrol();ebistrAyarKaydet(true)" style="padding:8px 16px;white-space:nowrap">🔄 Bağlantıyı Test Et</button>
            </div>
            <div style="font-size:11px;color:var(--tx3);margin-top:8px">Üstteki <strong>EBİSTR giriş</strong> ve <strong>Bağlan</strong> ile aynı akışı kullanın. Token sunucuda olduktan sonra telefondan yalnızca bu lab sitesini açmanız yeterli.</div>
        </div>
        <div class="card" style="margin-top:14px">
            <div class="ch">🔑 Token’ı elle sunucuya gönder (mobil / yedek)</div>
            <div class="alrt i" style="margin-bottom:12px">
                <span class="alrt-ic">ℹ️</span>
                <span>Token <strong>sunucuda</strong> saklanır; telefon yalnızca <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">/api/ebistr/numuneler</code> ile okur. Eklenti veya masaüstü yokken: Chrome’da business.ebistr.com → F12 → Network → herhangi bir API isteği → Request Headers → <code style="background:var(--sur2);padding:2px 6px;border-radius:4px">Authorization</code> değerini kopyalayın (veya eklenti menüsünden panoya kopyala). Aşağıya yapıştırıp kaydedin.</span>
            </div>
            <textarea class="pi" id="ebistr-manual-token" placeholder="Bearer eyJ... veya sadece JWT" rows="3" style="width:100%;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:12px"></textarea>
            <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-p" type="button" id="ebistr-manual-token-btn">Sunucuya kaydet</button>
                <span id="ebistr-manual-token-msg" style="font-size:12px;color:var(--tx3)"></span>
            </div>
        </div>

<div id="ebistr-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
    <div style="max-width:820px;width:100%;max-height:calc(100vh - 40px);overflow-y:auto;background:var(--sur);border-radius:20px;padding:28px;position:relative">
        <button onclick="document.getElementById('ebistr-modal').style.display='none'" style="position:absolute;top:14px;right:14px;background:rgba(15,23,42,0.7);border:1px solid var(--bdr);color:var(--tx2);font-size:16px;cursor:pointer;z-index:2;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
        <div id="ebistr-modal-icerik"></div>
    </div>
</div>

<!-- MAİL ÖNİZLEME MODALİ -->
<div id="ebistr-mail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2100;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">
    <div style="width:740px;max-width:100%;height:90vh;background:#f1f5f9;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;position:relative">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#1e3a5f;flex-shrink:0">
            <span id="ebistr-mail-modal-title" style="font-size:13px;font-weight:700;color:#fff">📧 Mail Önizleme</span>
            <button onclick="document.getElementById('ebistr-mail-modal').style.display='none'" style="background:rgba(255,255,255,.1);border:none;color:#fff;font-size:18px;cursor:pointer;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">✕</button>
        </div>
        <iframe id="ebistr-mail-frame" style="flex:1;border:none;width:100%;background:#f1f5f9"></iframe>
    </div>
</div>

`;

export default function Page() {
  const shellRef = useRef<HTMLDivElement>(null);
  const init = useRef(false);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    el.innerHTML = HTML;

    const btn = el.querySelector('#ebistr-manual-token-btn');
    const ta = el.querySelector('#ebistr-manual-token') as HTMLTextAreaElement | null;
    const msgEl = el.querySelector('#ebistr-manual-token-msg');
    const sendManualToken = async () => {
      const raw = (ta?.value || '').trim();
      if (!raw) {
        if (msgEl) msgEl.textContent = 'Token boş.';
        return;
      }
      const token = raw.replace(/^Bearer\s+/i, '').trim();
      const envBase = typeof window !== 'undefined' ? String((window as unknown as { __LAB_BASE_URL__?: string }).__LAB_BASE_URL__ || '').trim() : '';
      const base = envBase ? envBase.replace(/\/+$/, '') : window.location.origin.replace(/\/+$/, '');
      if (msgEl) msgEl.textContent = 'Gönderiliyor…';
      try {
        const r = await fetch(`${base}/api/ebistr/setToken`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const d = (await r.json()) as { ok?: boolean; err?: string };
        if (d.ok) {
          if (msgEl) msgEl.textContent = 'Kaydedildi; arka planda senkron başladı.';
          if (ta) ta.value = '';
        } else if (msgEl) msgEl.textContent = d.err || 'Hata';
      } catch {
        if (msgEl) msgEl.textContent = 'Bağlantı hatası';
      }
    };
    btn?.addEventListener('click', sendManualToken);

    void ensureEbistrScript('/ebistr.js?v=20260411-proxy-origin').then(() => {
      const w = window as Window & { ebistrAyarYukle?: () => void };
      const tick = () => {
        if (typeof w.ebistrAyarYukle === 'function') {
          init.current = true;
          w.ebistrAyarYukle();
        } else setTimeout(tick, 80);
      };
      tick();
    });

    return () => btn?.removeEventListener('click', sendManualToken);
  }, []);

  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }}
    />
  );
}
