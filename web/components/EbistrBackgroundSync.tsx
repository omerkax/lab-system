'use client';

/**
 * EBİSTR arka plan senkronu (istemci):
 * - Lab oturumu varken girişten kısa süre sonra bir kez sync-now (soğuk sunucu + token hydrate sonrası veri)
 * - Sekme görünürken periyodik sync-now (sunucu motorundaki ~5 dk ile uyumlu; ağır yük için 5 dk)
 * - Sekme arka planda iken interval durur (pil / gereksiz istek)
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { readLabSession } from '@/lib/lab-auth';

const FIRST_SYNC_DELAY_MS = 2000;
const SYNC_INTERVAL_VISIBLE_MS = 5 * 60 * 1000;

function isGirisPath(p: string) {
  return p === '/giris' || p.startsWith('/giris/');
}

function pingSyncNow() {
  void fetch('/api/ebistr/sync-now', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
}

export default function EbistrBackgroundSync() {
  const pathname = usePathname();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearIntervalSafe = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const startVisibleInterval = () => {
      clearIntervalSafe();
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      intervalRef.current = setInterval(() => {
        if (!readLabSession()) return;
        if (isGirisPath(pathname)) return;
        pingSyncNow();
      }, SYNC_INTERVAL_VISIBLE_MS);
    };

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        clearIntervalSafe();
        return;
      }
      if (!readLabSession() || isGirisPath(pathname)) return;
      pingSyncNow();
      startVisibleInterval();
    };

    if (firstTimerRef.current) clearTimeout(firstTimerRef.current);
    firstTimerRef.current = null;

    if (!readLabSession() || isGirisPath(pathname)) {
      clearIntervalSafe();
      return () => {
        clearIntervalSafe();
      };
    }

    firstTimerRef.current = setTimeout(() => {
      firstTimerRef.current = null;
      if (!readLabSession() || isGirisPath(pathname)) return;
      pingSyncNow();
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        startVisibleInterval();
      }
    }, FIRST_SYNC_DELAY_MS);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
      if (document.visibilityState === 'visible') {
        startVisibleInterval();
      }
    }

    return () => {
      if (firstTimerRef.current) clearTimeout(firstTimerRef.current);
      firstTimerRef.current = null;
      clearIntervalSafe();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [pathname]);

  return null;
}
