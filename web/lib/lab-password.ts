/**
 * Saha personeli şifreleri (PBKDF2-SHA256, istemci) + sahip kullanıcı kuralları.
 */

export const SAHA_PERSONEL_ROLE_ID = 'saha_personeli';

export function normalizePersonAd(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c');
}

/** Ömer Kaya — tam yönetici (Bünyamin bu kaydı düzenleyemez) */
export function isLabOwnerOmer(ad?: string | null): boolean {
  const n = normalizePersonAd(ad || '');
  return n === 'omer kaya' || (n.startsWith('omer ') && n.includes('kaya'));
}

export function isLabOwnerBunyamin(ad?: string | null): boolean {
  const n = normalizePersonAd(ad || '');
  return n.includes('bunyamin');
}

const _SUPER_IDS = ['omerkaya', 'omer', 'bunyaminayik'] as const;

function _actorIsSuperAdmin(actor: { ad?: string | null; superAdmin?: boolean; id?: string; login?: string } | null): boolean {
  if (!actor) return false;
  if (actor.superAdmin === true) return true;
  const uid = String(actor.id || '').toLowerCase().trim();
  const login = String(actor.login || '').toLowerCase().trim();
  if (_SUPER_IDS.some((s) => s === uid || s === login)) return true;
  return isLabOwnerOmer(actor.ad) || isLabOwnerBunyamin(actor.ad);
}

export function canManageLabUsers(
  actor: { ad?: string | null; superAdmin?: boolean; id?: string; login?: string } | null,
  hasRegisteredUsers: boolean
): boolean {
  if (!hasRegisteredUsers) return true;
  return _actorIsSuperAdmin(actor);
}

export function canEditLabUser(
  actor: { ad?: string | null; superAdmin?: boolean; id?: string; login?: string } | null,
  target: { ad?: string | null; superAdmin?: boolean; id?: string }
): boolean {
  if (!_actorIsSuperAdmin(actor)) return false;
  // Süper admin başka bir süper admini silemez/değiştiremez (Ömer hariç)
  if (isLabOwnerOmer(actor!.ad) || actor!.superAdmin === true) return true;
  if (isLabOwnerBunyamin(actor!.ad)) {
    if (isLabOwnerOmer(target.ad) || target.superAdmin === true) return false;
    return true;
  }
  return true;
}

export function userRequiresPortalPassword(u: { login?: string | null; passwordHash?: string | null }): boolean {
  return !!(u.login && String(u.login).trim() && u.passwordHash);
}

/** Portal ile giriş için salt + hash kaydı var mı? */
export function labUserHasPortalPassword(u: {
  passwordSalt?: string | null;
  passwordHash?: string | null;
} | null | undefined): boolean {
  return !!(u && String(u.passwordSalt || '').trim() && String(u.passwordHash || '').trim());
}

function saltBytesFromB64(saltB64: string): Uint8Array {
  const bin = atob(saltB64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function labRandomSaltB64(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}

export async function labDerivePasswordHashHex(password: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytesFromB64(saltB64) as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function labVerifyPassword(password: string, saltB64: string, hashHex: string): Promise<boolean> {
  const h = await labDerivePasswordHashHex(password, saltB64);
  return h === hashHex;
}

export const DEFAULT_SAHA_ROLE = {
  id: SAHA_PERSONEL_ROLE_ID,
  label: 'Saha personeli',
  readOnly: true,
  // Saha rolü: yalnızca görüntüleme. Kişisel bordro/izin/performans kısıtları sayfa içinde uygulanır.
  moduleAccess: {
    dashboard: 'view',
    personel: 'view',
    numune: 'view',
    araclar: 'view',
    musteriler: 'none',
    rapor: 'none',
    ebistr: 'none',
    ayarlar: 'none',
  },
  modules: {},
} as const;
