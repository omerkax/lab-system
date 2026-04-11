'use client';
import { useEffect, useRef, useState } from 'react';

const SINIR = { alt: 18, ust: 22 };
const POLL_MS = 60_000;

interface HavuzAlarm {
  id: string;
  ad: string;
  sicaklik: number;
  sinir: 'alt' | 'ust';
  zaman: string;
}

function havuzNoFromItem(item: any): '1' | '2' | null {
  const name: string = item?.department?.name ?? '';
  if (/-1\b/.test(name) || name.endsWith('-1')) return '1';
  if (/-2\b/.test(name) || name.endsWith('-2')) return '2';
  // fallback: device barcode veya id sırası
  return null;
}

function processTemperatures(items: any[]): { no: '1' | '2'; sicaklik: number; batarya: number | null; zaman: string }[] {
  const byHavuz: Record<string, any[]> = {};
  for (const item of items) {
    const sName = (item?.sensor?.name || '').toLowerCase();
    const sDesc = (item?.sensor?.description || '').toLowerCase();
    if (!sName.includes('temperature') && !sDesc.includes('sıcaklık')) continue;
    const no = havuzNoFromItem(item);
    if (!no) continue;
    if (!byHavuz[no]) byHavuz[no] = [];
    byHavuz[no].push(item);
  }
  return (['1', '2'] as const).map(no => {
    const readings = (byHavuz[no] || []).sort(
      (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const latest = readings[0];
    return {
      no,
      sicaklik: latest ? Number(latest.value) : NaN,
      batarya: latest?.deviceBatteryLevelValue != null ? Number(latest.deviceBatteryLevelValue) : null,
      zaman: latest?.timestamp ?? '',
    };
  }).filter(h => !isNaN(h.sicaklik));
}

export default function TelemetriPoller() {
  const [popup, setPopup] = useState<HavuzAlarm[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const prevAlarmIds = useRef<Set<string>>(new Set());

  const poll = async () => {
    try {
      const res = await fetch('/api/telemetri');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.ok) return;

      const havuzlar = processTemperatures(json.telemetry ?? []);
      const alarmlar: HavuzAlarm[] = havuzlar
        .filter(h => h.sicaklik < SINIR.alt || h.sicaklik > SINIR.ust)
        .map(h => ({
          id: `havuz${h.no}`,
          ad: `Havuz ${h.no}`,
          sicaklik: h.sicaklik,
          sinir: h.sicaklik < SINIR.alt ? 'alt' : 'ust',
          zaman: h.zaman,
        }));

      // Global alarm state güncelle (TelemetriAlarmBanner için)
      const w = window as any;
      w._telemetriAlarmlar = alarmlar.map(a => ({
        id: a.id,
        nokta: `${a.ad} Sıcaklığı`,
        deger: a.sicaklik,
        sinir: a.sinir,
        sinirDeger: a.sinir === 'alt' ? SINIR.alt : SINIR.ust,
        birim: '°C',
        zaman: a.zaman,
      }));
      // Dashboard sıcaklık kartlarını güncelle
      w._havuzSicakliklar = havuzlar;
      window.dispatchEvent(new Event('telemetri-alarm'));
      window.dispatchEvent(new CustomEvent('havuz-sicaklik-update', { detail: havuzlar }));

      // Yeni alarm çıktıysa popup göster
      const prevIds = prevAlarmIds.current;
      const yeniAlarmlar = alarmlar.filter(a => !prevIds.has(a.id));
      prevAlarmIds.current = new Set(alarmlar.map(a => a.id));

      if (yeniAlarmlar.length > 0) {
        setPopup(alarmlar);
        setDismissed(false);
      } else if (alarmlar.length === 0) {
        setPopup([]);
      }
    } catch {}
  };

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, []);

  if (!popup.length || dismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '70px',
      right: '22px',
      zIndex: 9990,
      maxWidth: '340px',
      width: 'calc(100vw - 44px)',
    }}>
      <div style={{
        background: 'var(--sur)',
        border: '1.5px solid rgba(239,68,68,.55)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(239,68,68,.15)',
        animation: 'tel-popup-in .3s cubic-bezier(.34,1.56,.64,1)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(90deg,rgba(239,68,68,.18) 0%,rgba(239,68,68,.06) 100%)',
          borderBottom: '1px solid rgba(239,68,68,.25)',
          padding: '11px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#ef4444', display: 'inline-block',
              animation: 'tel-pulse 1.2s ease-out infinite', flexShrink: 0,
            }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              🌡️ Kür Havuzu Alarm
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 6px', borderRadius: '4px' }}
          >✕</button>
        </div>

        {/* Alarm detayları */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {popup.map(a => (
            <div key={a.id} style={{
              background: 'rgba(239,68,68,.07)',
              border: '1px solid rgba(239,68,68,.2)',
              borderRadius: '10px',
              padding: '11px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>{a.ad}</div>
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '3px' }}>
                  {a.sinir === 'alt' ? '↓ Düşük sıcaklık' : '↑ Yüksek sıcaklık'}
                  <span style={{ marginLeft: '6px', color: 'rgba(252,165,165,.7)' }}>
                    Sınır: {a.sinir === 'alt' ? SINIR.alt : SINIR.ust}°C
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--fm)', color: '#ef4444', lineHeight: 1, flexShrink: 0 }}>
                {a.sicaklik.toFixed(1)}<span style={{ fontSize: '14px', fontWeight: 400 }}>°C</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--bdr)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--tx3)' }}>Hedef aralık: {SINIR.alt}–{SINIR.ust}°C</span>
          <a href="/ebistr/telemetri" style={{ fontSize: '11px', color: 'var(--acc2)', fontWeight: 600, textDecoration: 'none' }}>
            Telemetri →
          </a>
        </div>
      </div>

      <style>{`
        @keyframes tel-popup-in {
          from { opacity:0; transform:translateY(14px) scale(.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes tel-pulse {
          0%   { box-shadow:0 0 0 0 rgba(239,68,68,.7); }
          70%  { box-shadow:0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow:0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
