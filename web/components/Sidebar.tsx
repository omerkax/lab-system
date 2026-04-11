'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  DEFAULT_SAHA_ROLE,
  NO_SESSION_ROLE,
  type LabModuleKey,
  type LabRoleDoc,
  type LabSession,
  type LabUserDoc,
  LAB_SESSION_KEY,
  readLabSession,
  roleAllowsModule,
  roleIsSahaReadOnly,
  useSahaRestrictedNav,
  writeLabSession,
} from '@/lib/lab-auth';
import { canManageLabUsers } from '@/lib/lab-password';

type NavItem = {
  href?: string;
  label: string;
  icon?: React.ReactNode;
  children?: { href: string; label: string }[];
  section?: string;
  /** Erişim kontrolü — yoksa herkese açık */
  module?: LabModuleKey;
};

const IC = {
  dash: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>,
  cari: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>,
  musteriler: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>,
  sozlesme: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/></svg>,
  chip: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 7H7v6h6V7z"/><path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd"/></svg>,
  fiyat: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.56 9.56 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472c.08-.185.167-.36.264-.521z" clipRule="evenodd"/></svg>,
  maas: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg>,
  rapor: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>,
  beton: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z"/></svg>,
  ebistr: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd"/></svg>,
  araclar: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H11a1 1 0 001-1v-1h2.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-5a1 1 0 00-.293-.707l-3-3A1 1 0 0016 4H3zm11 5V5.5l2.5 2.5H14a1 1 0 01-1-1z"/></svg>,
  settings: <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
};

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: IC.dash, section: 'Genel', module: 'dashboard' },
  {
    label: 'Müşteriler',
    icon: IC.musteriler,
    section: 'Müşteriler',
    module: 'musteriler',
    children: [
      { href: '/cari', label: 'Cari' },
      { href: '/fiyat', label: 'Fiyat Hesaplama' },
      { href: '/fiyat/gecmis', label: 'Teklif Geçmişi' },
      { href: '/sozlesme', label: 'Sözleşme' },
    ],
  },
  {
    label: 'Personel',
    icon: IC.maas,
    module: 'personel',
    children: [
      { href: '/personel', label: 'Dashboard' },
      { href: '/personel/bordro', label: 'Aylık Bordro' },
      { href: '/personel/liste', label: 'Personel Listesi' },
      { href: '/personel/ozluk', label: 'Özlük & İK' },
      { href: '/personel/ozet', label: 'Maaş Özeti' },
      { href: '/personel/izin', label: 'Yıllık İzin' },
      { href: '/personel/performans', label: 'Performans' },
    ],
  },
  {
    label: 'Numune',
    icon: IC.beton,
    section: 'Saha',
    module: 'numune',
    children: [
      { href: '/beton', label: 'Program' },
      { href: '/beton/ozet', label: 'Özet & istatistik' },
    ],
  },
  { href: '/araclar', label: 'Araçlar', icon: IC.araclar, module: 'araclar' },
  { href: '/rapor', label: 'Rapor Defteri', icon: IC.rapor, module: 'rapor' },
  {
    label: 'EBİSTR Analiz',
    icon: IC.ebistr,
    section: 'Analiz',
    module: 'ebistr',
    children: [
      { href: '/ebistr', label: 'Analiz Tablosu' },
      { href: '/ebistr/yaklasan', label: 'Yaklaşan Kırımlar' },
      { href: '/ebistr/yd', label: 'Yapı Denetim' },
      { href: '/ebistr/kurleme', label: 'Kürleme Takibi' },
      { href: '/chip', label: 'Çip Takip' },
      { href: '/ebistr/telemetri', label: 'Telemetri' },
      { href: '/ebistr/ayar', label: 'Ayarlar' },
    ],
  },
  {
    label: 'Sistem',
    icon: IC.settings,
    section: 'Sistem',
    module: 'ayarlar',
    children: [
      { href: '/settings', label: 'Ayarlar & API' },
      { href: '/settings/kullanicilar', label: 'Kullanıcılar & roller' },
    ],
  },
];

/** Saha personeli — tüm beton programı + yalnızca kendi bordro / izin / maaş / performans */
const SAHA_NAV: NavItem[] = [
  { href: '/beton', label: 'Numune programı', icon: IC.beton, section: 'Saha' },
  { href: '/beton/ozet', label: 'Özet & istatistik', icon: IC.beton },
  {
    label: 'Personel',
    icon: IC.maas,
    children: [
      { href: '/personel/bordro', label: 'Bordrom' },
      { href: '/personel/izin', label: 'İzinlerim' },
      { href: '/personel/numune-program', label: 'Bugünkü numunelerim' },
      { href: '/personel/performans', label: 'Performansım' },
      { href: '/personel/ozet', label: 'Maaş özeti' },
    ],
  },
  { href: '/araclar', label: 'Zimmetli aracım', icon: IC.araclar },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobOpen: boolean;
  setMobOpen: (v: boolean) => void;
}

function initialOpenGroups(pathname: string): string[] {
  const o = ['EBİSTR Analiz'];
  if (pathname.startsWith('/personel')) o.push('Personel');
  if (pathname.startsWith('/fiyat') || pathname.startsWith('/cari') || pathname.startsWith('/sozlesme')) {
    o.push('Müşteriler');
  }
  if (pathname.startsWith('/beton')) o.push('Numune');
  if (pathname.startsWith('/settings')) o.push('Sistem');
  return o;
}

function navAllowed(item: NavItem, allow: (m: LabModuleKey) => boolean): boolean {
  if (!item.module) return true;
  return allow(item.module);
}

export default function Sidebar({ collapsed, setCollapsed, mobOpen, setMobOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<string[]>(() => initialOpenGroups(pathname));
  const [session, setSession] = useState<LabSession | null>(null);
  const [users, setUsers] = useState<LabUserDoc[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, LabRoleDoc>>({});
  const [authReady, setAuthReady] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  /** Dar modda fareyle üzerine gelince tam menü (ana içerik genişliği değişmez) */
  const [hoverPeek, setHoverPeek] = useState(false);
  const narrowNav = collapsed && !hoverPeek;

  useEffect(() => {
    if (!userMenu) return;
    const close = (e: MouseEvent) => {
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [userMenu]);

  /** Aynı sekmede /giris → ana sayfa: storage eventi gelmez; her rota değişiminde oturumu yenile */
  useEffect(() => {
    const sync = () => setSession(readLabSession());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setTimeout(load, 120);
        return;
      }
      Promise.all([
        w.fsGet('lab_users').catch(() => []),
        w.fsGet('lab_roles').catch(() => []),
      ]).then(([uRows, rRows]: [any[], any[]]) => {
        if (cancelled) return;
        setUsers((uRows || []).filter((x: any) => x && x.id && !x._silindi));
        const rm: Record<string, LabRoleDoc> = {};
        (rRows || []).forEach((r: any) => {
          if (r?.id && !r._silindi) rm[r.id] = r as LabRoleDoc;
        });
        if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
        if (!rm.saha_personeli) rm.saha_personeli = { ...(DEFAULT_SAHA_ROLE as unknown as LabRoleDoc) };
        setRolesMap(rm);
        setAuthReady(true);
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionUserDoc = useMemo(
    () => (session ? users.find(u => String(u.id) === session.userId) : undefined),
    [session, users]
  );

  /** Firestore lab_users + lab_roles — oturumdaki roleId’ye değil güncel kullanıcı kaydına göre */
  const effectiveRole = useMemo((): LabRoleDoc => {
    if (!session) return NO_SESSION_ROLE;
    if (!authReady) return NO_SESSION_ROLE;

    const u = sessionUserDoc;
    if (u && u.aktif === false) return NO_SESSION_ROLE;

    const roleId = u ? (u.roleId || 'admin') : (session.roleId || 'admin');
    const fromMap = rolesMap[roleId];
    if (fromMap) return fromMap;

    return {
      id: roleId,
      label: roleId,
      modules: {},
      moduleAccess: {},
    } as LabRoleDoc;
  }, [authReady, session, sessionUserDoc, rolesMap]);

  const allowModule = useCallback(
    (m: LabModuleKey) => {
      const n = users.filter(u => u.aktif !== false).length;
      if (sessionUserDoc && canManageLabUsers(sessionUserDoc, n > 0) && m === 'ayarlar') return true;
      return roleAllowsModule(effectiveRole, m);
    },
    [effectiveRole, sessionUserDoc, users]
  );

  const filteredNav = useMemo(() => {
    if (useSahaRestrictedNav(effectiveRole, session)) return SAHA_NAV;
    return NAV.filter(item => navAllowed(item, allowModule));
  }, [effectiveRole, allowModule, session]);

  const logout = async () => {
    const w = window as any;
    try {
      if (typeof w.labFlushPendingPayroll === 'function') await w.labFlushPendingPayroll();
    } catch {
      /* ignore */
    }
    try {
      if (typeof w.labSoftMergeBeforeLogout === 'function') await w.labSoftMergeBeforeLogout();
    } catch {
      /* ignore */
    }
    writeLabSession(null);
    setSession(null);
    setUserMenu(false);
    router.push('/giris');
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0])
      .join('')
      .toUpperCase() || '?';

  const toggleGroup = (label: string) => {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  // Top-level items: prefix match; sub-items (children): exact match only
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
  const isActiveExact = (href: string) => pathname === href;

  return (
    <nav
      className={`sidebar${narrowNav ? ' collapsed' : ''}${mobOpen ? ' mob-open' : ''}${collapsed && hoverPeek ? ' peek-hover' : ''}`}
      onMouseEnter={() => {
        if (collapsed && !mobOpen) setHoverPeek(true);
      }}
      onMouseLeave={() => setHoverPeek(false)}
    >
      <div className="sb-brand">
        <div className="sb-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="" width={28} height={28} />
        </div>
        {!narrowNav && (
          <div className="sb-brand-text">
            <div className="sb-name">Alibey Lab</div>
            <div className="sb-subtitle">ERP v2</div>
          </div>
        )}
        <button
          className="sb-toggle"
          onClick={() => { setCollapsed(!collapsed); setMobOpen(false); }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      <div className="nav-body">
        {filteredNav.map((item) => {
          const sectionLabel = !narrowNav && item.section ? (
            <div key={`sec-${item.section}`} className="nl">{item.section}</div>
          ) : null;

          if (item.children) {
            const groupOpen = openGroups.includes(item.label);
            const groupActive = item.children.some(c => isActiveExact(c.href));
            return (
              <div key={item.label}>
                {sectionLabel}
                <div
                  className={`ni${groupActive ? ' on' : ''}`}
                  onClick={() => toggleGroup(item.label)}
                >
                  <span className="ni-ic">{item.icon}</span>
                  {!narrowNav && <span>{item.label}</span>}
                  {!narrowNav && (
                    <span className={`ni-chevron${groupOpen ? ' open' : ''}`}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </span>
                  )}
                </div>
                {!narrowNav && (
                  <div className={`ni-group${groupOpen ? ' open' : ''}`}>
                    {item.children.map(child => (
                      <Link key={child.href} href={child.href}>
                        <div className={`ni ni-sub${isActiveExact(child.href) ? ' on' : ''}`}>
                          {/* suppressHydrationWarning: SSR/cache ile istemci metin farkı (ör. emoji kaldırma) uyarısını önler */}
                          <span suppressHydrationWarning>{child.label}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={item.href}>
              {sectionLabel}
              <Link href={item.href!}>
                <div className={`ni${isActive(item.href!) ? ' on' : ''}`}>
                  <span className="ni-ic">{item.icon}</span>
                  {!narrowNav && <span>{item.label}</span>}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="user-pill-wrap" ref={userMenuRef}>
        <button
          type="button"
          className="user-pill"
          onClick={() => setUserMenu(v => !v)}
          aria-expanded={userMenu}
          aria-haspopup="true"
        >
          <div className="up-av">{session ? initials(session.ad) : '?'}</div>
          {!narrowNav && (
            <div className="up-info">
              <div className="up-name">{session?.ad || 'Oturum yok'}</div>
              <div className="up-role">{effectiveRole.label || effectiveRole.id || '—'}</div>
            </div>
          )}
          {!narrowNav && (
            <span className="up-chev" aria-hidden>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </button>
        {userMenu && (
          <div className="user-pill-menu" role="menu">
            <div className="upm-actions">
              <Link href="/giris" className="upm-action" role="menuitem" onClick={() => setUserMenu(false)}>
                Kullanıcı değiştir
              </Link>
              <button type="button" className="upm-action upm-action-out" role="menuitem" onClick={logout}>
                Çıkış yap
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
