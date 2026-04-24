'use client';

export default function GlobalModals() {
  return (
    <>
      {/* WhatsApp Modal */}
      <div className="mbg" id="waMod">
        <div className="modal">
          <div className="mhd">
            <div className="mti" id="waTitle">WhatsApp</div>
            <button className="mcl" onClick={() => (window as any).closeWaMod?.()}>✕</button>
          </div>
          <div id="waInfo"></div>
          <div style={{ margin: '5px 0', padding: '8px', background: 'var(--bg2)', borderRadius: '6px', fontSize: '11px' }}>
            <label style={{ color: 'var(--tx3)', display: 'block', marginBottom: '4px' }}>Mesaj Şablonu:</label>
            <select id="waTplSel" onChange={() => (window as any).updateWaPrev?.()}
              style={{ width: '100%', padding: '4px', border: '1px solid var(--bdr)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--tx)', fontSize: '12px' }}>
              <option value="warn">Bakiye Uyarısı</option>
            </select>
          </div>
          <div className="wa-prev" id="waPrev"></div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button className="wa-btn" id="waGo" onClick={() => (window as any).openWALink?.()} style={{ flex: 1 }}>
              <span style={{ fontSize: '18px' }}>📲</span>WhatsApp
            </button>
            <button className="wa-btn" id="waSmsGo" onClick={() => (window as any).sendWaModalSms?.()}
              style={{ flex: 1, background: 'var(--grn-d)', color: 'var(--grn)', border: '1px solid var(--grn)' }}>💬 SMS</button>
          </div>
          <div id="waBulk" style={{ display: 'none' }}>
            <div style={{ fontSize: '11px', color: 'var(--tx3)', textAlign: 'center', marginBottom: '7px' }} id="waBulkInfo"></div>
            <button className="wa-all" onClick={() => (window as any).nextWA?.()}>Sıradakine →</button>
          </div>
        </div>
      </div>

      {/* SMS Modal */}
      <div className="mbg" id="smsMod">
        <div className="modal">
          <div className="mhd">
            <div className="mti" id="smsTitle">Toplu SMS</div>
            <button className="mcl" onClick={() => (window as any).closeSmsModal?.()}>✕</button>
          </div>
          <div id="smsInfo" style={{ marginBottom: '8px' }}></div>
          <div className="wa-prev" id="smsPrev" style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}></div>
          <div
            style={{ margin: '10px 0', padding: '10px', background: 'var(--bg2)', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <span>Kalan Çip &lt; </span>
              <select id="smsMaxChips" onChange={() => (window as any).buildSmsQueue?.()}
                style={{ flex: 1, padding: '2px 4px', border: '1px solid var(--bdr)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--tx)', fontSize: '12px' }}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50" defaultValue="50">50 (Kritik)</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="9999">Tümü</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" id="smsSkipRecent" onChange={() => (window as any).buildSmsQueue?.()} defaultChecked />
              <span>Son <input type="number" id="smsSkipDays" defaultValue="3" min="1" max="30" onInput={() => (window as any).buildSmsQueue?.()}
                style={{ width: '44px', padding: '2px 4px', border: '1px solid var(--bdr)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--tx)', fontSize: '12px' }} />
                gün içinde mesaj atılanları atla</span>
            </label>
            <label style={{ color: 'var(--tx3)', display: 'block', marginTop: '4px', fontSize: '11px' }}>Mesaj Şablonu:</label>
            <select id="smsTplSel" onChange={() => (window as any).updateSmsPrev?.()}
              style={{ width: '100%', padding: '4px', border: '1px solid var(--bdr)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--tx)', fontSize: '12px' }}>
              <option value="warn">Bakiye Uyarısı</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '2px' }}>
              <input type="checkbox" id="smsAuto" defaultChecked />
              <span style={{ color: 'var(--grn)', fontWeight: 600 }}>Otomatik Gönder (Sırayla)</span>
            </label>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--tx3)', textAlign: 'center', margin: '6px 0' }} id="smsBulkInfo"></div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button className="wa-btn" id="smsGo" onClick={() => (window as any).sendNextSms?.()}
              style={{ background: 'var(--grn-d)', color: 'var(--grn)', border: '1px solid var(--grn)' }}>💬 SMS Gönder</button>
            <button className="wa-btn" onClick={() => (window as any).skipSms?.()}
              style={{ background: 'var(--bg2)', color: 'var(--tx3)', border: '1px solid var(--bdr)', flex: 0.4 }}>Atla →</button>
          </div>
          <div style={{ height: '8px' }}></div>
        </div>
      </div>

      {/* Sablon preview */}
      <div className="mbg" id="sablonMod">
        <div className="modal">
          <div className="mhd">
            <div className="mti">Şablon Önizleme</div>
            <button className="mcl" onClick={() => document.getElementById('sablonMod')?.classList.remove('on')}>✕</button>
          </div>
          <div className="wa-prev" id="sablonPrev"></div>
        </div>
      </div>

      {/* Confirm Modal */}
      <div className="mbg" id="confirmMod">
        <div className="modal" style={{ maxWidth: '300px', textAlign: 'center' }}>
          <div className="mhd">
            <div className="mti" id="confirmTitle">Onay</div>
            <button className="mcl" onClick={() => (window as any).closeConfirm?.()}>✕</button>
          </div>
          <div style={{ padding: '20px 10px', fontSize: '14px', color: 'var(--tx2)', whiteSpace: 'pre-wrap' }} id="confirmText">
            Emin misiniz?
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button className="btn btn-o" style={{ flex: 1 }} onClick={() => (window as any).closeConfirm?.()}>İptal</button>
            <button className="btn btn-p" style={{ flex: 1, background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }} id="confirmYesBtn">Evet</button>
          </div>
        </div>
      </div>
    </>
  );
}
