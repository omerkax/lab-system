'use client';
import { useEffect, useRef, useState } from 'react';

interface ModulePageProps {
  html: string;
  onInit: () => void;
}

export default function ModulePage({ html, onInit }: ModulePageProps) {
  const initialized = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (initialized.current) return;
    let attempts = 0;
    const maxAttempts = 150; // ~15s (app.js afterInteractive bazen app-core’dan sonra)
    const check = () => {
      const w = window as any;
      // lsGet app-core’da; çip/modül init’leri app.js’teki fonksiyonlara bağlı — app.js parse edilmeden onInit çalışmasın
      if (typeof w.lsGet === 'function' && typeof w.fbPullChip === 'function') {
        initialized.current = true;
        try {
          onInit();
        } catch (e) {
          console.error('Module init error:', e);
        }
      } else if (attempts++ < maxAttempts) {
        setTimeout(check, 100);
      }
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, onInit]);

  if (!mounted) {
    return <div suppressHydrationWarning />;
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
}
