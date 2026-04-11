'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  DEFAULT_SAHA_ROLE,
  GUEST_ROLE,
  SAHA_PERSONEL_ROLE_ID,
  type LabUserDoc,
  readLabSession,
  roleIsSahaReadOnly,
  writeLabSession,
} from '@/lib/lab-auth';
import {
  labDerivePasswordHashHex,
  labRandomSaltB64,
  labUserHasPortalPassword,
  labVerifyPassword,
} from '@/lib/lab-password';

function newId(prefix: string) {
  try {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}_${Date.now()}`;
  }
}

function randomBootstrapPassword(len = 12): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let p = '';
  for (let i = 0; i < len; i++) p += chars[a[i] % chars.length];
  return p;
}

export default function GirisPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<LabUserDoc[]>([]);
  const [dataLayerError, setDataLayerError] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [portalLogin, setPortalLogin] = useState('');
  const [portalPass, setPortalPass] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const loginPrefilled = useRef(false);

  const load = useCallback(async () => {
    const w = window as any;
    if (typeof w.fsGet !== 'function') return false;
    const rows: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
    setUsers(rows.filter((x) => x && x.id && !x._silindi));
    setReady(true);
    setDataLayerError(null);
    return true;
  }, []);

  /** Mobil / yavaş ağ: fsGet hiç gelmez veya Firestore asılırsa sonsuz bekleme yerine zaman aşımı + açıklama */
  useEffect(() => {
    let cancelled = false;
    const maxTotalMs = 22000;
    const fetchTimeoutMs = 14000;
    const pollMs = 200;
    const t0 = Date.now();

    (async () => {
      while (!cancelled && Date.now() - t0 < maxTotalMs) {
        const w = window as any;
        if (typeof w.fsGet === 'function') {
          try {
            const rows: any[] = (await Promise.race([
              w.fsGet('lab_users').catch(() => []),
              new Promise<never>((_, rej) =>
                setTimeout(() => rej(new Error('firestore-timeout')), fetchTimeoutMs)
              ),
            ])) || [];
            if (cancelled) return;
            setUsers(rows.filter((x) => x && x.id && !x._silindi));
            setDataLayerError(null);
            setReady(true);
            return;
          } catch {
            if (cancelled) return;
            setUsers([]);
            setDataLayerError(
              'Firestore’a erişilemedi veya yanıt çok geç geldi. Mobil veri / Wi‑Fi, reklam engelleyici ve Firebase Console → Authentication → Settings → **Authorized domains** (bu siteyi açtığınız adres: örn. `192.168.1.218` veya tam origin) kontrol edin. EBİSTR “proxy”si ayrıdır; önce bu bağlantı gerekir.'
            );
            setReady(true);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      if (cancelled) return;
      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setDataLayerError(
          'Firebase / Firestore modülü yüklenmedi (app.js). Tarayıcıda script engeli yok mu? Adresi `http://192.168…` ile açıyorsanız Firebase’de bu hostu yetkilendirin; mümkünse aynı ağda `localhost` veya HTTPS üzerinden deneyin.'
        );
      } else {
        setDataLayerError(
          'Bağlantı zaman aşımı. Sayfayı yenileyin; sorun sürerse masaüstü tarayıcıda aynı adresi açıp konsoldaki kırmızı hataları kontrol edin.'
        );
      }
      setUsers([]);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loginPrefilled.current) return;
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const l = (q.get('login') || '').trim();
    if (l) {
      setPortalLogin(l.toLowerCase());
      loginPrefilled.current = true;
    }
  }, []);

  useEffect(() => {
    const s = readLabSession();
    if (!s) return;
    if (users.length === 0) return;
    const ok = users.some((u) => String(u.id) === s.userId && u.aktif !== false);
    if (ok) router.replace('/');
  }, [users, router]);

  const seedDefaults = async () => {
    if (dataLayerError) {
      setMsg('Önce Firestore bağlantısı gerekir.');
      return;
    }
    const w = window as any;
    if (typeof w.fsSet !== 'function') return;
    setSeeding(true);
    setMsg('');
    try {
      await w.fsSet('lab_roles', 'admin', { ...DEFAULT_ADMIN_ROLE });
      await w.fsSet('lab_roles', 'guest', { ...GUEST_ROLE });
      await w.fsSet('lab_roles', 'saha_personeli', { ...(DEFAULT_SAHA_ROLE as unknown as Record<string, unknown>) });
      const uid = newId('user');
      const bootstrapPass = randomBootstrapPassword(12);
      const salt = labRandomSaltB64();
      const passwordHash = await labDerivePasswordHashHex(bootstrapPass, salt);
      await w.fsSet('lab_users', uid, {
        id: uid,
        ad: 'Yönetici',
        roleId: 'admin',
        aktif: true,
        login: 'yonetici',
        passwordSalt: salt,
        passwordHash,
      });
      await load();
      setMsg(
        `Varsayılan roller ve yönetici oluşturuldu. İlk giriş — kullanıcı adı: yonetici, şifre: ${bootstrapPass} (not alın; Kullanıcılar’dan değiştirin).`
      );
    } catch (e) {
      setMsg('Kayıt hatası. Bağlantıyı kontrol edin.');
      console.error(e);
    } finally {
      setSeeding(false);
    }
  };

  const girisKartLegacy = (u: LabUserDoc) => {
    const role = u.roleId || 'admin';
    writeLabSession({
      userId: String(u.id),
      ad: String(u.ad || u.id),
      roleId: String(role),
      personelId: u.personelId ? String(u.personelId) : undefined,
      readOnly: undefined,
    });
    router.push('/');
  };

  const girisPortal = async () => {
    if (dataLayerError) {
      setMsg('Firestore bağlı değil; giriş yapılamaz.');
      return;
    }
    const login = portalLogin.trim().toLowerCase();
    const pass = portalPass;
    if (!login || !pass) {
      setMsg('Kullanıcı adı ve şifre girin.');
      return;
    }
    setPortalBusy(true);
    setMsg('');
    try {
      const u = users.find((x) => (x.login || '').toLowerCase() === login && x.aktif !== false);
      if (!u || !u.passwordSalt || !u.passwordHash) {
        setMsg('Geçersiz kullanıcı adı veya şifre.');
        return;
      }
      const ok = await labVerifyPassword(pass, u.passwordSalt, u.passwordHash);
      if (!ok) {
        setMsg('Geçersiz kullanıcı adı veya şifre.');
        return;
      }
      const w = window as any;
      const roles: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const rm: Record<string, any> = {};
      roles.forEach((r) => {
        if (r?.id) rm[r.id] = r;
      });
      let rd: any = rm[u.roleId || ''] || null;
      if (!rd && u.roleId === SAHA_PERSONEL_ROLE_ID) rd = { ...DEFAULT_SAHA_ROLE };
      const ro = roleIsSahaReadOnly(rd);
      writeLabSession({
        userId: String(u.id),
        ad: String(u.ad || u.id),
        roleId: String(u.roleId || 'saha_personeli'),
        personelId: u.personelId ? String(u.personelId) : undefined,
        readOnly: ro ? true : undefined,
      });
      router.push('/');
    } finally {
      setPortalBusy(false);
    }
  };

  const aktif = users.filter((u) => u.aktif !== false);
  const anyPortal = aktif.some(labUserHasPortalPassword);
  const legacyKart = aktif.length > 0 && !anyPortal;
  const eksikPortal = anyPortal && aktif.some((u) => !labUserHasPortalPassword(u));

  return (
    <div className="page-body" style={{ maxWidth: 520, margin: '0 auto', paddingTop: 48, minHeight: '40vh' }}>
      <noscript>
        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
          Bu uygulama için JavaScript gerekir. Tarayıcıda JavaScript’i açın.
        </div>
      </noscript>
      {ready && dataLayerError && (
        <div
          className="card"
          style={{ marginBottom: 16, borderLeft: '3px solid var(--red)', textAlign: 'left' }}
        >
          <div className="ch" style={{ color: 'var(--red)' }}>
            Veri katmanı (Firebase / Firestore)
          </div>
          <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55, margin: '0 0 12px' }}>{dataLayerError}</p>
          <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5, margin: 0 }}>
            <strong>Not:</strong> EBİSTR tarafı Next.js içindeki <code style={{ background: 'var(--sur2)', padding: '2px 6px', borderRadius: 4 }}>/api/ebistr</code> ile çalışır; ayrı <code style={{ background: 'var(--sur2)', padding: '2px 6px', borderRadius: 4 }}>node ebistr-proxy.js</code> çalıştırmanız gerekmez. Önce bu giriş ekranının Firestore ile bağlanması şarttır.
          </p>
          <button
            type="button"
            className="btn btn-p"
            style={{ marginTop: 14 }}
            onClick={() => window.location.reload()}
          >
            Sayfayı yenile
          </button>
        </div>
      )}
      <div className="ph" style={{ textAlign: 'center', paddingBottom: 8 }}>
        <h1>Giriş</h1>
        <p>
          {anyPortal
            ? 'Oturum açmak için kullanıcı adı ve şifre gerekir. Kullanıcı değiştirmek de aynı şekilde şifreyle yapılır.'
            : 'Henüz hiçbir hesapta portal şifresi yok; aşağıdaki geçici şifresiz seçenekle girip Kullanıcılar’dan her hesaba şifre tanımlayın.'}
        </p>
      </div>

      {!ready && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--tx2)', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--tx)' }}>Veri katmanı yükleniyor…</div>
          <div style={{ fontSize: 13, color: 'var(--tx3)' }}>
            Firebase / Firestore (app.js) hazır olana kadar bekleniyor — en fazla ~20 sn sonra durum netleşir.
            Telefondan <code style={{ background: 'var(--sur2)', padding: '2px 6px', borderRadius: 4 }}>192.168…</code> ile açıyorsanız Firebase Console’da bu adresi yetkilendirmeniz gerekir.
          </div>
        </div>
      )}

      {ready && aktif.length === 0 && (
        <div className="card">
          <div className="ch">İlk kurulum</div>
          <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 14 }}>
            Varsayılan roller (yönetici, misafir, <strong>saha personeli</strong>) ve bir yönetici kullanıcı oluşturulur.
            Personel eklerken saha girişi tanımlayabilirsiniz.
          </p>
          <button
            type="button"
            className="btn btn-p"
            disabled={seeding || !!dataLayerError}
            onClick={seedDefaults}
          >
            {seeding ? 'Oluşturuluyor…' : 'Varsayılanları oluştur'}
          </button>
        </div>
      )}

      {ready && aktif.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="ch">Oturum aç</div>
            <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
              Yönetici ve saha personeli aynı formdan giriş yapar (personel hesapları personel kaydında tanımlanır).
            </p>
            <div className="fld" style={{ marginBottom: 10 }}>
              <label>Kullanıcı adı</label>
              <input
                className="inp"
                autoComplete="username"
                value={portalLogin}
                disabled={!!dataLayerError}
                onChange={(e) => setPortalLogin(e.target.value)}
                placeholder="örn: ahmet.yilmaz"
              />
            </div>
            <div className="fld" style={{ marginBottom: 12 }}>
              <label>Şifre</label>
              <input
                className="inp"
                type="password"
                autoComplete="current-password"
                value={portalPass}
                disabled={!!dataLayerError}
                onChange={(e) => setPortalPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && girisPortal()}
              />
            </div>
            <button
              type="button"
              className="btn btn-p"
              disabled={portalBusy || !!dataLayerError}
              onClick={() => void girisPortal()}
            >
              {portalBusy ? '…' : 'Giriş yap'}
            </button>
            {eksikPortal && (
              <p style={{ fontSize: 11, color: 'var(--amb)', marginTop: 12, lineHeight: 1.45 }}>
                Bazı hesaplarda portal tanımlı değil; giriş yapamıyorlarsa yönetici Kullanıcılar ekranından kullanıcı adı + şifre atamalıdır.
              </p>
            )}
          </div>

          {legacyKart && (
            <div className="card">
              <div className="ch">Geçici: şifresiz giriş</div>
              <p style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12, lineHeight: 1.45 }}>
                Veritabanında henüz portal şifresi yok. Güvenlik için giriş yaptıktan sonra Kullanıcılar’dan tüm hesaplara şifre tanımlayın;
                en az bir hesapta şifre oluşunca bu seçenek kalkar.
              </p>
              <div className="upm-chip-grid" style={{ maxHeight: 'none' }}>
                {aktif.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="upm-chip v-stack"
                    disabled={!!dataLayerError}
                    onClick={() => girisKartLegacy(u)}
                  >
                    <span className="upm-chip-txt" style={{ fontWeight: 700 }}>
                      {u.ad || u.id}
                    </span>
                    <span className="upm-chip-role">{u.roleId || 'admin'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {msg && (
        <div className="alrt i" style={{ marginTop: 14 }}>
          <span className="alrt-ic">ℹ</span>
          <span>{msg}</span>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Link href="/" className="btn btn-g">
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
