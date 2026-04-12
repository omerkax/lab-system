'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  DEFAULT_SAHA_ROLE,
  GUEST_ROLE,
  LAB_MODULE_KEYS,
  moduleAccessLevel,
  normalizeRoleModuleAccess,
  SAHA_PERSONEL_ROLE_ID,
  type LabModuleAccessLevel,
  type LabModuleKey,
  type LabRoleDoc,
  type LabSession,
  type LabUserDoc,
  LAB_SESSION_KEY,
  readLabSession,
  writeLabSession,
} from '@/lib/lab-auth';
import {
  canEditLabUser,
  canManageLabUsers,
  isLabOwnerBunyamin,
  isLabOwnerOmer,
  labDerivePasswordHashHex,
  labRandomSaltB64,
  labUserHasPortalPassword,
} from '@/lib/lab-password';

const MOD_LABEL: Record<LabModuleKey, string> = {
  dashboard: 'Dashboard',
  musteriler: 'Müşteriler',
  personel: 'Personel',
  numune: 'Numune / beton',
  araclar: 'Araçlar',
  rapor: 'Rapor defteri',
  ebistr: 'EBİSTR analiz',
  ayarlar: 'Sistem ayarları',
};

function newId(prefix: string) {
  try {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}_${Date.now()}`;
  }
}

function randomPortalPassword(len = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[a[i] % chars.length];
  return s;
}

export default function KullanicilarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<LabSession | null>(null);
  const [users, setUsers] = useState<LabUserDoc[]>([]);
  const [roles, setRoles] = useState<LabRoleDoc[]>([]);
  const [selRoleId, setSelRoleId] = useState<string | null>(null);
  const [newUserAd, setNewUserAd] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('admin');
  const [newLogin, setNewLogin] = useState('');
  const [newPass, setNewPass] = useState('');
  const [toast, setToast] = useState('');
  const [roleLabelDraft, setRoleLabelDraft] = useState('');
  const [ownerPortalUserId, setOwnerPortalUserId] = useState<string | null>(null);
  const [oLogin, setOLogin] = useState('');
  const [oPass, setOPass] = useState('');
  const [ownerPortalBusy, setOwnerPortalBusy] = useState(false);
  const [ownerAutoBusy, setOwnerAutoBusy] = useState(false);

  const rolesMap = useMemo(() => {
    const m: Record<string, LabRoleDoc> = {};
    roles.forEach((r) => {
      if (r?.id) m[r.id] = r;
    });
    if (!m.admin) m.admin = DEFAULT_ADMIN_ROLE;
    if (!m.saha_personeli) m.saha_personeli = { ...(DEFAULT_SAHA_ROLE as unknown as LabRoleDoc) };
    return m;
  }, [roles]);

  const actorUser = useMemo(
    () => (session ? users.find((u) => String(u.id) === session.userId) || null : null),
    [session, users]
  );

  const canManage = useMemo(() => {
    if (!ready) return false;
    const n = users.filter((u) => u.aktif !== false && !u._silindi).length;
    return canManageLabUsers(actorUser, n > 0);
  }, [ready, users, actorUser]);

  const load = useCallback(async () => {
    const w = window as any;
    if (typeof w.fsGet !== 'function') return false;
    const [uRows, rRows] = await Promise.all([
      w.fsGet('lab_users').catch(() => []),
      w.fsGet('lab_roles').catch(() => []),
    ]);
    setUsers(((uRows || []) as any[]).filter((x) => x && x.id && !x._silindi));
    const rlist = ((rRows || []) as any[]).filter((x) => x && x.id && !x._silindi) as LabRoleDoc[];
    setRoles(
      rlist.length
        ? rlist
        : [DEFAULT_ADMIN_ROLE, GUEST_ROLE, { ...(DEFAULT_SAHA_ROLE as unknown as LabRoleDoc) }]
    );
    setReady(true);
    return true;
  }, []);

  useEffect(() => {
    setSession(readLabSession());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) setSession(readLabSession());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      if (await load()) {
        if (t) clearInterval(t);
      }
    };
    tick();
    t = setInterval(tick, 150);
    return () => {
      if (t) clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    if (!roles.length) return;
    if (!selRoleId || !rolesMap[selRoleId]) setSelRoleId(rolesMap.admin ? 'admin' : roles[0].id);
  }, [roles, rolesMap, selRoleId]);

  const selectedRole = selRoleId ? rolesMap[selRoleId] : null;

  useEffect(() => {
    setRoleLabelDraft(selectedRole?.label ?? '');
  }, [selRoleId, selectedRole?.label]);

  const saveRole = async (patch: Partial<LabRoleDoc>) => {
    if (!canManage || !selRoleId || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest') return;
    const w = window as any;
    const prev = rolesMap[selRoleId] || { id: selRoleId };
    const next: LabRoleDoc = { ...prev, ...patch, id: selRoleId };
    await w.fsSet('lab_roles', selRoleId, next);
    setToast('Rol kaydedildi.');
    await load();
    setTimeout(() => setToast(''), 2500);
  };

  const addRole = async () => {
    if (!canManage) return;
    const w = window as any;
    const id = newId('rol');
    const doc: LabRoleDoc = {
      id,
      label: 'Yeni rol',
      all: false,
      moduleAccess: { dashboard: 'edit' },
      modules: {},
    };
    await w.fsSet('lab_roles', id, doc);
    setSelRoleId(id);
    await load();
  };

  const setModuleAccessForKey = (key: LabModuleKey, level: LabModuleAccessLevel) => {
    if (!selectedRole || selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest') return;
    const ma = { ...normalizeRoleModuleAccess(selectedRole), [key]: level };
    saveRole({ moduleAccess: ma, all: false, modules: {} });
  };

  const setAll = (all: boolean) => {
    if (!selectedRole || selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest') return;
    if (all) {
      saveRole({ all: true, modules: {}, moduleAccess: {} });
      return;
    }
    const ma: Partial<Record<LabModuleKey, LabModuleAccessLevel>> = {};
    for (const k of LAB_MODULE_KEYS) ma[k] = 'edit';
    saveRole({ all: false, modules: {}, moduleAccess: ma });
  };

  const deleteRole = async () => {
    if (!canManage || !selRoleId) return;
    if (selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest') return;
    const inUse = users.some((u) => (u.roleId || 'admin') === selRoleId && u.aktif !== false);
    if (inUse) {
      setToast('Bu role atanmış aktif kullanıcı var; önce rollerini değiştirin.');
      setTimeout(() => setToast(''), 4000);
      return;
    }
    if (!confirm('Bu rol silinsin mi?')) return;
    const w = window as any;
    const prev = rolesMap[selRoleId];
    await w.fsSet('lab_roles', selRoleId, { ...prev, id: selRoleId, _silindi: true });
    setSelRoleId('admin');
    await load();
    setToast('Rol silindi.');
    setTimeout(() => setToast(''), 2500);
  };

  const commitRoleLabel = () => {
    if (!selectedRole || selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest') return;
    if ((roleLabelDraft || '').trim() === (selectedRole.label || '').trim()) return;
    saveRole({ label: roleLabelDraft.trim() || selectedRole.id });
  };

  const saveOwnerPortal = async () => {
    if (!canManage || !ownerPortalUserId) return;
    const u = users.find((x) => x.id === ownerPortalUserId);
    if (!u) return;
    if (!actorUser || !canEditLabUser(actorUser, u)) return;
    const login = oLogin.trim().toLowerCase();
    const pass = oPass.trim();
    if (!login || !pass) {
      setToast('Ömer / Bünyamin için kullanıcı adı ve şifre zorunlu.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    if (!/^[a-z0-9._-]{3,32}$/i.test(login)) {
      setToast('Kullanıcı adı 3–32 karakter (harf, rakam, . _ -).');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const dup = users.some((x) => x.id !== u.id && (x.login || '').toLowerCase() === login);
    if (dup) {
      setToast('Bu kullanıcı adı zaten kullanılıyor.');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const w = window as any;
    setOwnerPortalBusy(true);
    try {
      const salt = labRandomSaltB64();
      const passwordHash = await labDerivePasswordHashHex(pass, salt);
      await w.fsSet('lab_users', u.id, { ...u, login, passwordSalt: salt, passwordHash });
      setOPass('');
      await load();
      setToast('Portal girişi kaydedildi. Giriş sayfasından kullanıcı adı + şifre kullanın.');
      setTimeout(() => setToast(''), 3500);
    } finally {
      setOwnerPortalBusy(false);
    }
  };

  const addUser = async () => {
    if (!canManage || !newUserAd.trim()) return;
    const w = window as any;
    const id = newId('user');
    const ad = newUserAd.trim();
    const roleId = newUserRoleId || 'admin';
    if (roleId === SAHA_PERSONEL_ROLE_ID) {
      const login = newLogin.trim().toLowerCase();
      const pass = newPass.trim();
      if (!login || !pass) {
        setToast('Saha personeli için kullanıcı adı ve şifre zorunlu.');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      if (!/^[a-z0-9._-]{3,32}$/i.test(login)) {
        setToast('Kullanıcı adı 3–32 karakter (harf, rakam, . _ -).');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      const dup = users.some((u) => (u.login || '').toLowerCase() === login);
      if (dup) {
        setToast('Bu kullanıcı adı zaten kullanılıyor.');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      const salt = labRandomSaltB64();
      const passwordHash = await labDerivePasswordHashHex(pass, salt);
      await w.fsSet('lab_users', id, {
        id,
        ad,
        roleId,
        aktif: true,
        login,
        passwordSalt: salt,
        passwordHash,
      });
      setNewLogin('');
      setNewPass('');
    } else {
      const login = newLogin.trim().toLowerCase();
      const pass = newPass.trim();
      if (!login || !pass) {
        setToast('Portal kullanıcı adı ve şifre zorunludur (şifresiz giriş kapalı).');
        setTimeout(() => setToast(''), 3500);
        return;
      }
      if (!/^[a-z0-9._-]{3,32}$/i.test(login)) {
        setToast('Kullanıcı adı 3–32 karakter (harf, rakam, . _ -).');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      const dup = users.some((u) => (u.login || '').toLowerCase() === login);
      if (dup) {
        setToast('Bu kullanıcı adı zaten kullanılıyor.');
        setTimeout(() => setToast(''), 3000);
        return;
      }
      const salt = labRandomSaltB64();
      const passwordHash = await labDerivePasswordHashHex(pass, salt);
      await w.fsSet('lab_users', id, { id, ad, roleId, aktif: true, login, passwordSalt: salt, passwordHash });
      setNewLogin('');
      setNewPass('');
    }
    setNewUserAd('');
    await load();
    setToast('Kullanıcı eklendi.');
    setTimeout(() => setToast(''), 2500);
  };

  const deleteUser = async (u: LabUserDoc) => {
    if (!canManage || !actorUser || !canEditLabUser(actorUser, u)) return;
    const admins = users.filter((x) => x.aktif !== false && (x.roleId || 'admin') === 'admin');
    if ((u.roleId || 'admin') === 'admin' && admins.length <= 1) {
      setToast('Son yönetici (admin) hesabı silinemez.');
      setTimeout(() => setToast(''), 4000);
      return;
    }
    if (!confirm(`“${u.ad || u.id}” silinsin mi? Kayıt arşivlenir (geri yükleme yok).`)) return;
    const w = window as any;
    await w.fsSet('lab_users', u.id, { ...u, _silindi: true, aktif: false });
    if (session && String(session.userId) === String(u.id)) {
      writeLabSession(null);
      setSession(null);
      router.push('/giris');
      return;
    }
    await load();
    setToast('Kullanıcı silindi.');
    setTimeout(() => setToast(''), 2500);
  };

  const assignOwnerPortalsAuto = async () => {
    if (!canManage || !actorUser) return;
    const w = window as any;
    setOwnerAutoBusy(true);
    try {
      const lines: string[] = [];
      const owners = users.filter(
        (u) =>
          (isLabOwnerOmer(u.ad) || isLabOwnerBunyamin(u.ad)) &&
          canEditLabUser(actorUser, u) &&
          !u.passwordHash
      );
      if (!owners.length) {
        setToast('Portal şifresi olmayan Ömer / Bünyamin kaydı bulunamadı (zaten tanımlı veya isim eşleşmiyor).');
        setTimeout(() => setToast(''), 4500);
        return;
      }
      const usedLogins = new Set(
        users.map((x) => (x.login || '').toLowerCase()).filter(Boolean)
      );
      for (const u of owners) {
        let login = isLabOwnerOmer(u.ad) ? 'omer' : 'bunyamin';
        const base = login;
        let n = 0;
        while (usedLogins.has(login)) {
          n += 1;
          login = `${base}${n}`;
        }
        usedLogins.add(login);
        const pass = randomPortalPassword(12);
        const salt = labRandomSaltB64();
        const passwordHash = await labDerivePasswordHashHex(pass, salt);
        await w.fsSet('lab_users', u.id, { ...u, login, passwordSalt: salt, passwordHash });
        lines.push(`${u.ad || u.id}\n  Kullanıcı adı: ${login}\n  Şifre: ${pass}`);
      }
      await load();
      window.alert(
        'Ömer / Bünyamin portal bilgileri oluşturuldu. Bu pencereyi kapatmadan önce not alın:\n\n' + lines.join('\n\n')
      );
    } finally {
      setOwnerAutoBusy(false);
    }
  };

  const toggleUserActive = async (u: LabUserDoc) => {
    if (!canManage || !actorUser || !canEditLabUser(actorUser, u)) return;
    const w = window as any;
    const yeniAktif = u.aktif === false ? true : false;
    await w.fsSet('lab_users', u.id, { ...u, aktif: yeniAktif });
    await load();
  };

  const openGirisAsUser = (u: LabUserDoc) => {
    if (!actorUser || !canManageLabUsers(actorUser, true)) return;
    if (!labUserHasPortalPassword(u)) {
      setToast('Bu hesapta portal şifresi yok. Önce kullanıcı adı + şifre tanımlayın.');
      setTimeout(() => setToast(''), 4500);
      return;
    }
    const login = (u.login || '').trim().toLowerCase();
    if (!login) {
      setToast('Portal kullanıcı adı eksik.');
      setTimeout(() => setToast(''), 3500);
      return;
    }
    router.push(`/giris?login=${encodeURIComponent(login)}`);
  };

  if (ready && !canManage) {
    return (
      <div className="page-body" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 40 }}>
        <div className="ph">
          <h1>Kullanıcılar & roller</h1>
          <p>Bu sayfayı yalnızca süper admin hesapları düzenleyebilir.</p>
        </div>
        <div className="card">
          <Link href="/giris" className="btn btn-p">
            Oturum aç / kullanıcı değiştir
          </Link>
          <Link href="/settings" className="btn btn-o" style={{ marginLeft: 10 }}>
            Ayarlara dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-body" style={{ paddingBottom: 40 }}>
      <div className="ph">
        <h1>Kullanıcılar & roller</h1>
        <p>
          Modül başına <strong>yok / görüntüle / düzenle</strong> seçin. Giriş her zaman kullanıcı adı ve şifre ile yapılır;
          başka kullanıcıya geçmek için de Giriş sayfasında şifre gerekir. Saha personeli için kullanıcı adı ve şifre zorunludur.
        </p>
      </div>

      {!ready && <div className="card">Yükleniyor…</div>}

      {ready && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,260px) 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="ch">Roller</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.values(rolesMap).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`btn ${selRoleId === r.id ? 'btn-p' : 'btn-g'}`}
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => setSelRoleId(r.id)}
                >
                  {r.label || r.id}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-o" style={{ marginTop: 12, width: '100%' }} onClick={addRole}>
              + Rol ekle
            </button>
          </div>

          <div className="card">
            {selectedRole && (
              <>
                <div className="ch">Rol: {selectedRole.id}</div>
                <div className="fld" style={{ marginBottom: 12 }}>
                  <label>Görünen ad</label>
                  <input
                    className="inp"
                    value={roleLabelDraft}
                    disabled={selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest'}
                    onChange={(e) => setRoleLabelDraft(e.target.value)}
                    onBlur={commitRoleLabel}
                  />
                </div>
                {selRoleId !== 'admin' && selRoleId !== SAHA_PERSONEL_ROLE_ID && selRoleId !== 'guest' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedRole.all === true}
                      onChange={(e) => setAll(e.target.checked)}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Tüm modüllere tam erişim (düzenle)</span>
                  </label>
                )}
                {selRoleId === 'admin' && (
                  <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>Yönetici rolü her zaman tam erişimlidir.</p>
                )}
                {selRoleId === 'guest' && (
                  <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>Misafir rolü ön tanımlıdır; buradan değiştirilemez.</p>
                )}
                {selRoleId === SAHA_PERSONEL_ROLE_ID && (
                  <p style={{ fontSize: 12, color: 'var(--amb)', marginBottom: 12 }}>
                    Saha personeli: tüm beton programı; yalnızca kendi bordro, izin, maaş özeti ve performans; zimmetli araç.
                    Başka personeli göremez.
                  </p>
                )}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 8,
                    opacity: selectedRole.all || selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest' ? 0.45 : 1,
                    pointerEvents:
                      selectedRole.all || selRoleId === 'admin' || selRoleId === SAHA_PERSONEL_ROLE_ID || selRoleId === 'guest'
                        ? 'none'
                        : 'auto',
                  }}
                >
                  {LAB_MODULE_KEYS.map((key) => {
                    const level =
                      selRoleId === 'admin' || selectedRole.all
                        ? ('edit' as const)
                        : selRoleId === SAHA_PERSONEL_ROLE_ID
                          ? selectedRole.modules?.[key] === true
                            ? ('edit' as const)
                            : ('none' as const)
                          : moduleAccessLevel(selectedRole, key);
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: '8px 10px',
                          background: 'var(--bg2)',
                          borderRadius: 8,
                          border: '1px solid var(--bdr)',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: 'var(--tx2)' }}>{MOD_LABEL[key]}</span>
                        <select
                          className="si"
                          style={{ width: '100%', fontSize: 12 }}
                          value={level}
                          disabled={
                            selRoleId === 'admin' ||
                            selRoleId === SAHA_PERSONEL_ROLE_ID ||
                            selRoleId === 'guest' ||
                            selectedRole.all === true
                          }
                          onChange={(e) => setModuleAccessForKey(key, e.target.value as LabModuleAccessLevel)}
                        >
                          <option value="none">Yok</option>
                          <option value="view">Görüntüle</option>
                          <option value="edit">Düzenle</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
                {selRoleId !== 'admin' && selRoleId !== SAHA_PERSONEL_ROLE_ID && selRoleId !== 'guest' && (
                  <button type="button" className="btn btn-o" style={{ marginTop: 14 }} onClick={() => void deleteRole()}>
                    Rolü sil
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {ready && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="ch">Kullanıcılar</div>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12, lineHeight: 1.5 }}>
            Adı <strong>Ömer Kaya</strong> veya <strong>Bünyamin</strong> ile eşleşen ve henüz portal şifresi olmayan
            kayıtlar için otomatik kullanıcı adı (<code>omer</code> / <code>bunyamin</code>) ve rastgele şifre üretilir;
            sonuç tek seferlik uyarıda gösterilir.
          </p>
          <button
            type="button"
            className="btn btn-o"
            style={{ marginBottom: 16 }}
            disabled={ownerAutoBusy || !canManage}
            onClick={() => void assignOwnerPortalsAuto()}
          >
            {ownerAutoBusy ? '…' : 'Ömer & Bünyamin için otomatik portal şifresi oluştur'}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
            <div className="fld" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label>Ad</label>
              <input className="inp" value={newUserAd} onChange={(e) => setNewUserAd(e.target.value)} placeholder="Örn: Ayşe Yılmaz" />
            </div>
            <div className="fld" style={{ flex: '0 0 160px', marginBottom: 0 }}>
              <label>Rol</label>
              <select className="si" value={newUserRoleId} onChange={(e) => setNewUserRoleId(e.target.value)}>
                {Object.values(rolesMap).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label || r.id}
                  </option>
                ))}
              </select>
            </div>
            {newUserRoleId === SAHA_PERSONEL_ROLE_ID ? (
              <>
                <div className="fld" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                  <label>Saha kullanıcı adı</label>
                  <input className="inp" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} placeholder="tekil, 3–32" />
                </div>
                <div className="fld" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                  <label>Şifre</label>
                  <input className="inp" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="fld" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                  <label>Portal kullanıcı adı</label>
                  <input className="inp" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} placeholder="3–32 karakter" />
                </div>
                <div className="fld" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                  <label>Portal şifre</label>
                  <input className="inp" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                </div>
              </>
            )}
            <button type="button" className="btn btn-p" onClick={() => void addUser()}>
              Kullanıcı ekle
            </button>
          </div>
          <div className="tw" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Rol</th>
                  <th>Saha adı</th>
                  <th>Durum</th>
                  <th style={{ width: 280 }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const canEdit = !!(actorUser && canEditLabUser(actorUser, u));
                  return (
                  <tr key={u.id}>
                    <td>{u.ad || u.id}</td>
                    <td style={{ fontFamily: 'var(--fm)', fontSize: 12 }}>{u.roleId || 'admin'}</td>
                    <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{u.login || '—'}</td>
                    <td>{u.aktif === false ? 'Pasif' : 'Aktif'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-g"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        disabled={!canManage || !labUserHasPortalPassword(u)}
                        title={!labUserHasPortalPassword(u) ? 'Önce portal şifresi tanımlayın' : undefined}
                        onClick={() => openGirisAsUser(u)}
                      >
                        Giriş sayfası (şifreyle)
                      </button>
                      <button
                        type="button"
                        className="btn btn-o"
                        style={{ padding: '4px 10px', fontSize: 11, marginLeft: 6 }}
                        disabled={!canEdit}
                        title={!canEdit ? 'Bu kaydı düzenleme yetkiniz yok' : undefined}
                        onClick={() => void toggleUserActive(u)}
                      >
                        {u.aktif === false ? 'Aktifleştir' : 'Pasifleştir'}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-o"
                          style={{ padding: '4px 10px', fontSize: 11, marginLeft: 6 }}
                          onClick={() => {
                            setOwnerPortalUserId(u.id);
                            setOLogin(u.login || '');
                            setOPass('');
                          }}
                        >
                          Şifre değiştir
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-o"
                          style={{ padding: '4px 10px', fontSize: 11, marginLeft: 6, color: 'var(--red)' }}
                          title={!canEdit ? undefined : 'Kayıt arşivlenir'}
                          onClick={() => void deleteUser(u)}
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {ownerPortalUserId && (
            <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--acc2)' }}>
              <div className="ch">
                {(() => { const u = users.find(x => x.id === ownerPortalUserId); return u ? (u.ad || u.id) : 'Kullanıcı'; })()}
                {' — '}şifre değiştir
              </div>
              <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
                Portal bilgisi Giriş sayfasındaki kullanıcı adı + şifre alanları içindir.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div className="fld" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>Kullanıcı adı</label>
                  <input className="inp" value={oLogin} onChange={(e) => setOLogin(e.target.value)} autoComplete="off" />
                </div>
                <div className="fld" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>Yeni şifre</label>
                  <input
                    className="inp"
                    type="password"
                    value={oPass}
                    onChange={(e) => setOPass(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-p"
                  disabled={ownerPortalBusy}
                  onClick={() => void saveOwnerPortal()}
                >
                  {ownerPortalBusy ? '…' : 'Kaydet'}
                </button>
                <button type="button" className="btn btn-g" onClick={() => setOwnerPortalUserId(null)}>
                  Kapat
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="alrt i" style={{ marginTop: 14 }}>
          <span className="alrt-ic">✓</span>
          {toast}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Link href="/settings" className="btn btn-o">
          ← Ayarlar
        </Link>
      </div>
    </div>
  );
}
