/**
 * Oturum ve rol tabanlı modül erişimi (istemci).
 * Kullanıcılar / roller Firestore: lab_users, lab_roles
 */

import { SAHA_PERSONEL_ROLE_ID } from '@/lib/lab-password';

export { DEFAULT_SAHA_ROLE, SAHA_PERSONEL_ROLE_ID } from '@/lib/lab-password';

/** Modül erişim seviyesi — Firestore lab_roles */
export type LabModuleAccessLevel = 'none' | 'view' | 'edit';

export type LabSession = {
  userId: string;
  ad: string;
  roleId: string;
  /** hr_personnel id — saha personeli */
  personelId?: string;
  readOnly?: boolean;
};

export const LAB_SESSION_KEY = 'lab_session';

/** Sidebar / erişim grupları — NAV item ile eşleşir */
export const LAB_MODULE_KEYS = [
  'dashboard',
  'musteriler',
  'personel',
  'numune',
  'araclar',
  'rapor',
  'ebistr',
  'ayarlar',
] as const;

export type LabModuleKey = (typeof LAB_MODULE_KEYS)[number];

export type LabRoleDoc = {
  id: string;
  label?: string;
  /** true = tüm modüller */
  all?: boolean;
  /** @deprecated — moduleAccess kullanın; yoksa moduleAccessLevel içinde türetilir */
  modules?: Partial<Record<LabModuleKey, boolean>>;
  /** Modül bazında görüntüle / düzenle (öncelikli) */
  moduleAccess?: Partial<Record<LabModuleKey, LabModuleAccessLevel>>;
  _silindi?: boolean;
  /** Sadece görüntüleme — düzenleme yok */
  readOnly?: boolean;
};

export type LabUserDoc = {
  id: string;
  ad?: string;
  roleId?: string;
  aktif?: boolean;
  _silindi?: boolean;
  /** Saha girişi — küçük harf önerilir */
  login?: string;
  passwordSalt?: string;
  passwordHash?: string;
  /** Bağlı personel kaydı (hr_personnel id) */
  personelId?: string;
  /** Firestore’da işaretlenirse tüm modüller + çip mail/SMS (admin ile aynı çizgi) */
  superAdmin?: boolean;
};

/** `lab_users.id` veya `login` — tam yetki (çip e-posta/SMS dahil) */
export const LAB_SUPERUSER_IDS = ['omerkaya', 'omer', 'bunyaminayik'] as const;

export function labUserIsSuperAdmin(
  user: LabUserDoc | null | undefined,
  role: LabRoleDoc | null | undefined,
  sessionUserId?: string | null
): boolean {
  if (user?.superAdmin === true) return true;
  if (role && (role.id === 'admin' || role.all === true)) return true;
  const uid = String(user?.id || sessionUserId || '').toLowerCase().trim();
  const login = String(user?.login || '').toLowerCase().trim();
  for (const s of LAB_SUPERUSER_IDS) {
    if (s === uid || s === login) return true;
  }
  return false;
}

/** EBİSTR/çip e-posta ve SMS — süper admin veya EBİSTR düzenleme */
export function labUserCanChipNotify(
  user: LabUserDoc | null | undefined,
  role: LabRoleDoc | null | undefined,
  sessionUserId?: string | null
): boolean {
  if (labUserIsSuperAdmin(user, role, sessionUserId)) return true;
  return moduleAccessLevel(role, 'ebistr') === 'edit';
}

export function readLabSession(): LabSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAB_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && o.userId && o.ad && o.roleId) return o as LabSession;
    return null;
  } catch {
    return null;
  }
}

export function writeLabSession(s: LabSession | null) {
  if (typeof window === 'undefined') return;
  if (!s) localStorage.removeItem(LAB_SESSION_KEY);
  else localStorage.setItem(LAB_SESSION_KEY, JSON.stringify(s));
}

/** Firestore’dan gelen rolü tek tipe indirger (eski modules → moduleAccess) */
export function normalizeRoleModuleAccess(role: LabRoleDoc | null | undefined): Partial<Record<LabModuleKey, LabModuleAccessLevel>> {
  if (!role) return {};
  if (role.moduleAccess && Object.keys(role.moduleAccess).length > 0) {
    return { ...role.moduleAccess };
  }
  const out: Partial<Record<LabModuleKey, LabModuleAccessLevel>> = {};
  const legacy = role.modules || {};
  for (const k of LAB_MODULE_KEYS) {
    if (legacy[k] === true) out[k] = 'edit';
    else if (legacy[k] === false) out[k] = 'none';
  }
  return out;
}

export function moduleAccessLevel(
  role: LabRoleDoc | null | undefined,
  mod: LabModuleKey
): LabModuleAccessLevel {
  if (!role) return 'edit';
  if (role.id === 'admin' || role.all === true) return 'edit';
  /** Saha personeli: numune programına yalnızca erişim (düzenleme yok); diğer modüller legacy modules ile */
  if (role.id === SAHA_PERSONEL_ROLE_ID) {
    if (mod === 'numune') return 'view';
    const ma = normalizeRoleModuleAccess(role);
    const explicit = ma[mod];
    if (explicit === 'view' || explicit === 'edit' || explicit === 'none') return explicit;
    const m = role.modules || {};
    return m[mod] === true ? 'edit' : 'none';
  }
  const ma = normalizeRoleModuleAccess(role);
  const v = ma[mod];
  if (v === 'none' || v === 'view' || v === 'edit') return v;
  return 'none';
}

export function roleAllowsModule(role: LabRoleDoc | null | undefined, mod: LabModuleKey): boolean {
  return moduleAccessLevel(role, mod) !== 'none';
}

export function roleAllowsModuleEdit(role: LabRoleDoc | null | undefined, mod: LabModuleKey): boolean {
  return moduleAccessLevel(role, mod) === 'edit';
}

export function roleIsSahaReadOnly(role: LabRoleDoc | null | undefined): boolean {
  if (!role) return false;
  if (role.id === SAHA_PERSONEL_ROLE_ID) return true;
  return role.readOnly === true;
}

/** Oturum saha kısıtlı mı? (kenar çubuğu, salt okunur ekranlar) */
export function isSahaRestrictedSession(
  role: LabRoleDoc | null | undefined,
  session: { readOnly?: boolean } | null | undefined
): boolean {
  if (session?.readOnly === true) return true;
  return roleIsSahaReadOnly(role);
}

/** Kenar çubuğu: saha menüsü — oturum readOnly veya rol salt okunur */
export function useSahaRestrictedNav(
  role: LabRoleDoc | null | undefined,
  session: { readOnly?: boolean } | null
): boolean {
  return isSahaRestrictedSession(role, session);
}

/**
 * Oturum yokken kenar çubuğu — modül yok (dashboard / rapor tıklanamaz).
 * Sayfa erişimi LabRouteGuard ile /giris’e yönlendirilir.
 */
export const NO_SESSION_ROLE: LabRoleDoc = {
  id: 'no_session',
  label: 'Oturum yok',
  modules: {},
};

/** Misafir rolü (Firestore); oturum açılmış kullanıcıya atanır — modül yoksa kapalı */
export const GUEST_ROLE: LabRoleDoc = {
  id: 'guest',
  label: 'Misafir',
  modules: { dashboard: true, rapor: true },
};

export const DEFAULT_ADMIN_ROLE: LabRoleDoc = {
  id: 'admin',
  label: 'Yönetici',
  all: true,
};
