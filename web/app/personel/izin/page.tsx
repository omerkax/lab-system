'use client';
import { useEffect, useRef } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  readLabSession,
  roleAllowsModuleEdit,
  roleIsSahaReadOnly,
} from '@/lib/lab-auth';

const HTML = `
<div class="ph" style="margin-bottom:20px">
  <h1>🏖️ Yıllık İzin Takibi</h1>
  <p>Personel izin kayıtları ve kullanım özeti</p>
</div>

<!-- Yeni İzin Ekle -->
<div class="card" id="izin-form-card" style="margin-bottom:16px">
  <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:14px" id="izin-form-baslik">İzin Kaydı Ekle</div>
  <input type="hidden" id="izin-edit-id" value="">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:flex-end">
    <div class="fld"><label>Personel</label>
      <select id="izin-personel" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)">
        <option value="">Yükleniyor...</option>
      </select>
    </div>
    <div class="fld"><label>İzin Tipi</label>
      <select id="izin-tip" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)">
        <option value="yillik">Yıllık İzin</option>
        <option value="mazeret">Mazeret İzni</option>
        <option value="ucretsiz">Ücretsiz İzin</option>
        <option value="rapor">Hastalık Raporu</option>
        <option value="diger">Diğer</option>
      </select>
    </div>
    <div class="fld"><label>Başlangıç</label><input type="date" id="izin-bas" onchange="izinGunHesapla()"></div>
    <div class="fld"><label>Bitiş</label><input type="date" id="izin-bit" onchange="izinGunHesapla()"></div>
    <div class="fld"><label>Gün</label><input type="number" id="izin-gun" placeholder="Otomatik" min="1" readonly style="background:var(--sur2)"></div>
    <div class="fld"><label>Not</label><input type="text" id="izin-not" placeholder="Açıklama..."></div>
    <div class="fld"><label>Durum</label>
      <select id="izin-yapildi" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--sur);color:var(--tx)">
        <option value="hayir">Planlandı (henüz yapılmadı)</option>
        <option value="evet">Yapıldı / tamamlandı</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:12px">
      <button class="btn btn-p" onclick="izinKaydetPage()" style="flex:1;height:42px">Kaydet</button>
      <button class="btn btn-o" onclick="izinFormTemizlePage()" style="height:42px">Temizle</button>
    </div>
  </div>
</div>

<!-- Özet kartlar -->
<div id="izin-ozet" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px"></div>

<!-- Filtreler -->
<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
  <select id="izin-f-personel" onchange="izinListeYuklePage()" style="padding:7px 12px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:12px">
    <option value="">Tüm Personel</option>
  </select>
  <select id="izin-f-tip" onchange="izinListeYuklePage()" style="padding:7px 12px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:12px">
    <option value="">Tüm Tipler</option>
    <option value="yillik">Yıllık</option>
    <option value="mazeret">Mazeret</option>
    <option value="ucretsiz">Ücretsiz</option>
    <option value="rapor">Rapor</option>
  </select>
  <input type="number" id="izin-f-yil" placeholder="Yıl" value="" style="width:80px;padding:7px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:12px">
  <button class="btn btn-o" style="padding:6px 14px;font-size:12px" onclick="izinListeYuklePage()">🔍 Filtrele</button>
</div>

<!-- Liste -->
<div class="card" style="padding:0">
  <div class="tw">
    <table>
      <thead>
        <tr>
          <th>Personel</th>
          <th>Tip</th>
          <th>Başlangıç</th>
          <th>Bitiş</th>
          <th style="text-align:center">Gün</th>
          <th>Not</th>
          <th style="text-align:center">Durum</th>
          <th style="text-align:center">İşlem</th>
        </tr>
      </thead>
      <tbody id="izin-liste">
        <tr><td colspan="8" style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</td></tr>
      </tbody>
    </table>
  </div>
</div>
`;

export default function IzinPage() {
  const init = useRef(false);

  useEffect(() => {
    if (init.current) return;
    const check = () => {
      if (typeof (window as any).fsGet === 'function') {
        init.current = true;
        izinPageInit();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }, []);

  return (
    <>
      <div style={{ padding: '0 24px 24px' }} dangerouslySetInnerHTML={{ __html: HTML }} />
    </>
  );
}

type IzinFieldEl = HTMLInputElement | HTMLSelectElement;

function izinGet(id: string): string {
  const el = document.getElementById(id) as IzinFieldEl | null;
  return el?.value ?? '';
}

function izinSet(id: string, v: string) {
  const el = document.getElementById(id) as IzinFieldEl | null;
  if (el) el.value = v;
}

async function izinPageInit() {
  const w = window as any;

  const sess = readLabSession();
  let lockAd: string | null = null;
  let izinViewOnly = false;
  let hideIzinData = false;

  if (sess?.userId && typeof w.fsGet === 'function') {
    try {
      const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const meU = users.find((x: any) => String(x.id) === String(sess.userId));
      const rm: Record<string, any> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r;
      });
      if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
      const role = meU ? rm[meU.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : null;
      const pid = String(sess.personelId || meU?.personelId || '').trim();
      const staffPre: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
      if (pid) {
        const me = staffPre.find((x: any) => String(x.id) === String(pid));
        if (me?.ad) lockAd = String(me.ad).trim();
      }
      const sahaRestricted = roleIsSahaReadOnly(role) || sess.readOnly === true;
      if (sahaRestricted && !lockAd) hideIzinData = true;
      izinViewOnly =
        sahaRestricted ||
        !roleAllowsModuleEdit(role, 'personel') ||
        !!String(sess.personelId || meU?.personelId || '').trim();
    } catch {
      /* ignore */
    }
  }

  w.__IZIN_LOCK_AD__ = lockAd;
  w.__IZIN_VIEW_ONLY__ = izinViewOnly;
  w.__IZIN_HIDE_DATA__ = hideIzinData;

  const formCard = document.getElementById('izin-form-card');
  if (formCard && izinViewOnly) formCard.style.display = 'none';

  // Personel listesini Firestore'dan çek
  const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
  const aktif = staff.filter((s: any) => s.aktif !== false);

  const doldur = (selId: string, includeAll = false) => {
    const sel = document.getElementById(selId) as HTMLSelectElement;
    if (!sel) return;
    if (lockAd && (selId === 'izin-personel' || selId === 'izin-f-personel')) {
      sel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = lockAd;
      opt.textContent = lockAd;
      sel.appendChild(opt);
      sel.value = lockAd;
      sel.disabled = true;
      return;
    }
    const cur = sel.value;
    sel.innerHTML = includeAll ? '<option value="">Tüm Personel</option>' : '<option value="">Seçin...</option>';
    aktif.forEach((s: any) => {
      const opt = document.createElement('option');
      opt.value = s.ad || s.id;
      opt.textContent = s.ad || s.id;
      sel.appendChild(opt);
    });
    sel.value = cur;
  };

  doldur('izin-personel');
  doldur('izin-f-personel', true);

  // Yıl default
  const yilInp = document.getElementById('izin-f-yil') as HTMLInputElement;
  if (yilInp && !yilInp.value) yilInp.value = String(new Date().getFullYear());

  w.izinGunHesapla = () => {
    const bas = izinGet('izin-bas');
    const bit = izinGet('izin-bit');
    if (bas && bit) {
      const diff = Math.round((new Date(bit).getTime() - new Date(bas).getTime()) / 86400000) + 1;
      izinSet('izin-gun', String(Math.max(1, diff)));
    }
  };

  w.izinKaydetPage = async () => {
    if (w.__IZIN_VIEW_ONLY__) {
      w.toast && w.toast('İzin kaydı ekleyemez veya değiştiremezsiniz (salt okunur).', 'error');
      return;
    }
    const personel = izinGet('izin-personel');
    const tip = izinGet('izin-tip');
    const bas = izinGet('izin-bas');
    const bit = izinGet('izin-bit');
    const gun = izinGet('izin-gun');
    const not = izinGet('izin-not');
    const yapildi = izinGet('izin-yapildi') === 'evet';
    const editId = izinGet('izin-edit-id');
    if (w.__IZIN_LOCK_AD__ && personel !== w.__IZIN_LOCK_AD__) {
      w.toast && w.toast('Yalnızca kendi izin kayıtlarınızı düzenleyebilirsiniz.', 'error');
      return;
    }
    if (!personel || !bas || !bit) { w.toast && w.toast('Personel, başlangıç ve bitiş tarihi zorunlu!', 'error'); return; }
    const id = editId || `${personel.replace(/\s/g,'-')}-${bas}-${Date.now()}`;
    await w.fsSet('yillik_izin', id, {
      id,
      personel,
      tip,
      bas,
      bit,
      gun: Number(gun) || 1,
      not,
      yapildi,
      tarih: new Date().toISOString(),
    });
    w.logAction && w.logAction('personel', `İzin kaydedildi: ${personel} ${bas}`);
    w.toast && w.toast('Kaydedildi', 'success');
    w.izinFormTemizlePage();
    izinListeYuklePage();
  };

  w.izinFormTemizlePage = () => {
    izinSet('izin-edit-id', '');
    izinSet('izin-personel', '');
    izinSet('izin-bas', '');
    izinSet('izin-bit', '');
    izinSet('izin-gun', '');
    izinSet('izin-not', '');
    izinSet('izin-yapildi', 'hayir');
    const baslik = document.getElementById('izin-form-baslik');
    if (baslik) baslik.textContent = 'İzin Kaydı Ekle';
  };

  w.izinDuzenlePage = (id: string) => {
    if (w.__IZIN_VIEW_ONLY__) return;
    const data = w._izinPageData?.find((x: any) => x.id === id);
    if (!data) return;
    if (w.__IZIN_LOCK_AD__ && data.personel !== w.__IZIN_LOCK_AD__) return;
    izinSet('izin-edit-id', data.id);
    izinSet('izin-personel', data.personel || '');
    izinSet('izin-tip', data.tip || 'yillik');
    izinSet('izin-bas', data.bas || '');
    izinSet('izin-bit', data.bit || '');
    izinSet('izin-gun', String(data.gun || ''));
    izinSet('izin-not', data.not || '');
    izinSet('izin-yapildi', data.yapildi === true ? 'evet' : 'hayir');
    const baslik = document.getElementById('izin-form-baslik');
    if (baslik) baslik.textContent = 'İzin Kaydını Düzenle';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  w.izinSilPage = async (id: string) => {
    if (w.__IZIN_VIEW_ONLY__) return;
    const row = w._izinPageData?.find((x: any) => x.id === id);
    if (w.__IZIN_LOCK_AD__ && row && row.personel !== w.__IZIN_LOCK_AD__) return;
    if (!confirm('Bu izin kaydını silmek istiyor musunuz?')) return;
    await w.fsSet('yillik_izin', id, { _silindi: true });
    izinListeYuklePage();
  };

  w.izinListeYuklePage = izinListeYuklePage;

  izinListeYuklePage();
}

async function izinListeYuklePage() {
  const w = window as any;
  const tbody = document.getElementById('izin-liste');
  if (!tbody) return;

  try {
    if (w.__IZIN_HIDE_DATA__) {
      const ozetEl0 = document.getElementById('izin-ozet');
      if (ozetEl0) ozetEl0.innerHTML = '';
      tbody.innerHTML =
        '<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Hesabınız personele bağlı değil; izin kayıtları listelenmez. Yöneticinizden <code style="font-size:11px">lab_users.personelId</code> eşlemesi isteyin.</td></tr>';
      return;
    }

    const docs: any[] = (await w.fsGet('yillik_izin')) || [];
    const aktif = docs.filter((d: any) => !d._silindi);
    w._izinPageData = aktif;

    let fP = (document.getElementById('izin-f-personel') as HTMLSelectElement)?.value || '';
    const fT = (document.getElementById('izin-f-tip') as HTMLSelectElement)?.value || '';
    const fY = (document.getElementById('izin-f-yil') as HTMLInputElement)?.value || '';
    if (w.__IZIN_LOCK_AD__) fP = w.__IZIN_LOCK_AD__;

    const filtered = aktif.filter((d: any) => {
      if (fP && d.personel !== fP) return false;
      if (fT && d.tip !== fT) return false;
      if (fY && !d.bas?.startsWith(fY)) return false;
      return true;
    }).sort((a: any, b: any) => b.bas.localeCompare(a.bas));

    // Özet
    const year = fY || new Date().getFullYear().toString();
    const ozet: Record<string, number> = {};
    aktif.forEach((d: any) => {
      if (w.__IZIN_LOCK_AD__ && d.personel !== w.__IZIN_LOCK_AD__) return;
      if (d.tip === 'yillik' && d.bas?.startsWith(year)) {
        ozet[d.personel] = (ozet[d.personel] || 0) + (d.gun || 0);
      }
    });
    const ozetEl = document.getElementById('izin-ozet');
    if (ozetEl) {
      ozetEl.innerHTML = Object.entries(ozet).length
        ? Object.entries(ozet).sort((a, b) => b[1] - a[1]).map(([p, g]) => `
          <div class="card" style="padding:14px 16px;border-left:3px solid var(--acc)">
            <div style="font-size:11px;color:var(--tx3);margin-bottom:4px">${p}</div>
            <div style="font-size:20px;font-weight:700;color:var(--acc)">${g} <span style="font-size:12px;font-weight:400">gün</span></div>
            <div style="font-size:10px;color:var(--tx3)">${year} yıllık izin</div>
          </div>`).join('')
        : '';
    }

    const tipAd: Record<string, string> = { yillik: 'Yıllık', mazeret: 'Mazeret', ucretsiz: 'Ücretsiz', rapor: 'Rapor', diger: 'Diğer' };
    const lockA = w.__IZIN_LOCK_AD__;
    const canRowAct = (d: any) => !w.__IZIN_VIEW_ONLY__ && (!lockA || d.personel === lockA);
    tbody.innerHTML = filtered.length
      ? filtered.map((d: any) => `
        <tr>
          <td style="font-size:12px;font-weight:600">${d.personel || '—'}</td>
          <td><span style="padding:2px 10px;border-radius:12px;font-size:11px;background:var(--acc)22;color:var(--acc);font-weight:600">${tipAd[d.tip] || d.tip}</span></td>
          <td style="font-size:12px">${d.bas ? d.bas.split('-').reverse().join('.') : '—'}</td>
          <td style="font-size:12px">${d.bit ? d.bit.split('-').reverse().join('.') : '—'}</td>
          <td style="text-align:center;font-weight:700;color:var(--acc)">${d.gun || '—'}</td>
          <td style="font-size:11px;color:var(--tx3)">${d.not || ''}</td>
          <td style="text-align:center;font-size:11px">${d.yapildi === true ? '<span style="color:var(--grn);font-weight:700">Yapıldı</span>' : '<span style="color:var(--amb);font-weight:600">Planlandı</span>'}</td>
          <td style="text-align:center">
            ${canRowAct(d) ? `<button onclick="izinDuzenlePage('${d.id}')" style="background:var(--sur2);border:1px solid var(--bdr);color:var(--tx2);font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;margin-right:4px">Düzenle</button>
            <button onclick="izinSilPage('${d.id}')" style="background:none;border:1px solid var(--bdr);color:var(--red);font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer">Sil</button>` : '—'}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">İzin kaydı bulunamadı.</td></tr>';
  } catch {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--red);font-size:12px">Yüklenemedi.</td></tr>';
  }
}
