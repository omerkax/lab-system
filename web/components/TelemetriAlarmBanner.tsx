'use client';
import { useEffect, useState } from 'react';

export interface TelemetriAlarm {
  id: string;
  nokta: string;       // e.g. "Havuz 1 Sıcaklığı"
  deger: number;       // current value
  sinir: 'alt' | 'ust'; // which limit was crossed
  sinirDeger: number;  // the limit value
  birim: string;       // e.g. "°C", "pH"
  zaman: string;       // ISO timestamp when alarm triggered
}

export default function TelemetriAlarmBanner() {
  const [alarmlar, setAlarmlar] = useState<TelemetriAlarm[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const kontrol = () => {
      const w = window as any;
      const aktif: TelemetriAlarm[] = w._telemetriAlarmlar || [];
      setAlarmlar([...aktif]);
    };
    kontrol();
    // Poll every 10 seconds
    const iv = setInterval(() => { kontrol(); setTick(t => t + 1); }, 10000);
    // Also listen for custom event from telemetri page
    const handler = () => kontrol();
    window.addEventListener('telemetri-alarm', handler);
    return () => { clearInterval(iv); window.removeEventListener('telemetri-alarm', handler); };
  }, []);

  if (!alarmlar.length) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #450a0a 0%, #7f1d1d 40%, #450a0a 100%)',
      borderBottom: '2px solid rgba(239,68,68,.6)',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap',
      position: 'sticky',
      top: 0,
      zIndex: 500,
      minHeight: '40px',
    }}>
      {/* Pulse dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 0 0 rgba(239,68,68,.7)',
          animation: 'pulseRing 1.2s ease-out infinite',
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: '10px', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.12em', whiteSpace: 'nowrap' }}>
          🚨 TELEMETRİ ALARMI
        </span>
      </div>

      {/* Alarm chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
        {alarmlar.map(a => {
          const timeAgo = Math.floor((Date.now() - new Date(a.zaman).getTime()) / 60000);
          return (
            <span key={a.id} style={{
              background: 'rgba(0,0,0,.4)',
              border: '1px solid rgba(248,113,113,.4)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              color: '#fca5a5',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span style={{ color: '#fbbf24' }}>{a.sinir === 'alt' ? '↓' : '↑'}</span>
              <span style={{ color: '#fff' }}>{a.nokta}</span>
              <span style={{ background: 'rgba(239,68,68,.3)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--fm)', fontSize: '12px' }}>
                {a.deger} {a.birim}
              </span>
              <span style={{ color: 'rgba(252,165,165,.7)', fontSize: '10px' }}>
                sınır: {a.sinirDeger} · {timeAgo < 1 ? 'az önce' : `${timeAgo}dk önce`}
              </span>
            </span>
          );
        })}
      </div>

      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,.7); }
          70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
