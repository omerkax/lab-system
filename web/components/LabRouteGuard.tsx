'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  DEFAULT_ADMIN_ROLE,
  GUEST_ROLE,
  type LabRoleDoc,
  type LabUserDoc,
  LAB_SESSION_KEY,
  readLabSession,
  roleIsSahaReadOnly,
} from '@/lib/lab-auth';

const SAHA_EXACT = [
  '/giris',
  '/personel/performans',
  '/personel/numune-program',
  '/personel/ozet',
  '/personel/bordro',
  '/personel/izin',
  '/araclar',
];

function isPublicPath(pathname: string): boolean {
  return pathname === '/giris' || pathname.startsWith('/giris/');
}

function pathAllowedForSaha(pathname: string): boolean {
  if (isPublicPath(pathname)) return true;
  if (pathname === '/beton' || pathname.startsWith('/beton/')) return true;
  return SAHA_EXACT.some(p => pathname === p);
}

/** Oturum yokken boş ekran yerine — mobilde yönlendirme gecikse bile tıklanabilir giriş */
function LabAuthGate() {
  return (
    <div
      className="lab-auth-gate"
      style={{
        minHeight: '55vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 14,
        color: 'var(--tx2)',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--tx)' }}>Alibey Lab</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Oturum açmanız gerekiyor</div>
      <p style={{ fontSize: 13, color: 'var(--tx3)', maxWidth: 320, lineHeight: 1.55, margin: 0 }}>
        Giriş sayfasına yönlendiriliyorsunuz. Sayfa açılmazsa aşağıdaki düğmeye dokunun.
      </p>
      <Link
        href="/giris"
        className="btn btn-p"
        style={{ marginTop: 6, padding: '12px 22px', fontSize: 15, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}
      >
        Giriş sayfasına git
      </Link>
    </div>
  );
}

export default function LabRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastRedirect = useRef('');
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const run = async () => {
      const session = readLabSession();
      if (!session) {
        if (!isPublicPath(pathname)) {
          if (lastRedirect.current !== '/giris') {
            lastRedirect.current = '/giris';
            router.replace('/giris');
          }
        } else {
          lastRedirect.current = '';
        }
        return;
      }

      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setTimeout(run, 120);
        return;
      }
      const users: LabUserDoc[] = ((await w.fsGet('lab_users').catch(() => [])) || []).filter(
        (x: any) => x && x.id && !x._silindi
      );
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const rm: Record<string, LabRoleDoc> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r as LabRoleDoc;
      });
      if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
      const u = users.find(x => String(x.id) === session.userId);
      const role = u ? rm[u.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : GUEST_ROLE;
      const saha = session.readOnly === true || roleIsSahaReadOnly(role);
      if (saha && !pathAllowedForSaha(pathname)) {
        const t = '/beton';
        if (lastRedirect.current !== t) {
          lastRedirect.current = t;
          router.replace(t);
        }
      } else if (!saha) {
        lastRedirect.current = '';
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) run();
    };
    window.addEventListener('storage', onStorage);
    run();
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [mounted, pathname, router]);

  /* İlk SSR + hidrasyon karesi: her zaman children (dashboard’da görünür yedek metin var). */
  if (!mounted) {
    return <>{children}</>;
  }
  if (!isPublicPath(pathname) && !readLabSession()) {
    return <LabAuthGate />;
  }
  return <>{children}</>;
}
