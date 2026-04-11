'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  moduleAccessLevel,
  readLabSession,
  type LabRoleDoc,
} from '@/lib/lab-auth';

type Staff = {
  id: string;
  ad?: string;
  dogumTarihi?: string;
  kanGrubu?: string;
  cepTel?: string;
  yakinAd?: string;
  yakinTel?: string;
};

export default function OzlukTools() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [keepId, setKeepId] = useState('');
  const [dropId, setDropId] = useState('');
  const [selId, setSelId] = useState('');
  const [form, setForm] = useState<Staff>({ id: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const loadStaff = useCallback(async () => {
    const w = window as any;
    if (typeof w.fsGet !== 'function') return;
    const rows: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
    setStaff(rows.filter((r) => r && r.id && !r._silindi).map((r) => ({ ...r })));
  }, []);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setTimeout(run, 150);
        return;
      }
      const session = readLabSession();
      if (!session) {
        if (!cancel) setCanEdit(false);
        return;
      }
      const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const rm: Record<string, LabRoleDoc> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r as LabRoleDoc;
      });
      const u = users.find((x: any) => String(x.id) === session.userId);
      if (!u) {
        if (!cancel) setCanEdit(false);
        return;
      }
      const role = rm[u.roleId || 'admin'] || DEFAULT_ADMIN_ROLE;
      const ed = moduleAccessLevel(role, 'personel') === 'edit';
      if (!cancel) setCanEdit(ed);
      if (ed) await loadStaff();
    };
    void run();
    return () => {
      cancel = true;
    };
  }, [loadStaff]);

  useEffect(() => {
    const s = staff.find((x) => x.id === selId);
    if (s) {
      setForm({
        id: s.id,
        ad: s.ad,
        dogumTarihi: s.dogumTarihi || '',
        kanGrubu: s.kanGrubu || '',
        cepTel: s.cepTel || '',
        yakinAd: s.yakinAd || '',
        yakinTel: s.yakinTel || '',
      });
    } else {
      setForm({ id: '' });
    }
  }, [selId, staff]);

  const saveOzluk = async () => {
    if (!canEdit || !form.id) return;
    setBusy(true);
    setMsg('');
    try {
      const w = window as any;
      const prev = staff.find((x) => x.id === form.id) || {};
      await w.fsSet('hr_personnel', form.id, {
        ...prev,
        id: form.id,
        dogumTarihi: form.dogumTarihi || '',
        kanGrubu: form.kanGrubu || '',
        cepTel: form.cepTel || '',
        yakinAd: form.yakinAd || '',
        yakinTel: form.yakinTel || '',
      });
      if (w.fbPullStaff) await w.fbPullStaff();
      await loadStaff();
      setMsg('Özlük bilgileri kaydedildi.');
    } catch {
      setMsg('Kayıt başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const mergePersonel = async () => {
    if (!canEdit || !keepId || !dropId || keepId === dropId) {
      setMsg('Kalacak ve silinecek personeli seçin.');
      return;
    }
    if (!confirm('Silinen personelin bordro satırları kalana taşınır. Emin misiniz?')) return;
    setBusy(true);
    setMsg('');
    try {
      const w = window as any;
      if (typeof w.labMergePersonnelRecords !== 'function') {
        setMsg('Birleştirme henüz yüklenmedi; sayfayı yenileyin.');
        return;
      }
      await w.labMergePersonnelRecords(keepId, dropId);
      if (w.fbPullStaff) await w.fbPullStaff();
      await loadStaff();
      setDropId('');
      setSelId(keepId);
      setMsg('Kayıtlar birleştirildi.');
    } catch (e: any) {
      setMsg(e?.message || 'Birleştirme başarısız.');
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="ch">Özlük düzenleme (yönetici)</div>
      <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
        Maaş / TC / IBAN için personel listesini kullanın. Burada yalnızca özlük alanları.
      </p>
      <div className="fld" style={{ marginBottom: 12 }}>
        <label>Personel</label>
        <select className="si" value={selId} onChange={(e) => setSelId(e.target.value)} style={{ width: '100%' }}>
          <option value="">Seçin…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.ad || s.id}
            </option>
          ))}
        </select>
      </div>
      {selId && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div className="fld">
            <label>Doğum</label>
            <input
              className="inp"
              type="date"
              value={form.dogumTarihi || ''}
              onChange={(e) => setForm((f) => ({ ...f, dogumTarihi: e.target.value }))}
            />
          </div>
          <div className="fld">
            <label>Kan grubu</label>
            <input
              className="inp"
              value={form.kanGrubu || ''}
              onChange={(e) => setForm((f) => ({ ...f, kanGrubu: e.target.value }))}
            />
          </div>
          <div className="fld">
            <label>Cep</label>
            <input
              className="inp"
              value={form.cepTel || ''}
              onChange={(e) => setForm((f) => ({ ...f, cepTel: e.target.value }))}
            />
          </div>
          <div className="fld">
            <label>Yakın</label>
            <input
              className="inp"
              value={form.yakinAd || ''}
              onChange={(e) => setForm((f) => ({ ...f, yakinAd: e.target.value }))}
            />
          </div>
          <div className="fld">
            <label>Yakın tel</label>
            <input
              className="inp"
              value={form.yakinTel || ''}
              onChange={(e) => setForm((f) => ({ ...f, yakinTel: e.target.value }))}
            />
          </div>
        </div>
      )}
      {selId && (
        <button type="button" className="btn btn-p" disabled={busy} onClick={() => void saveOzluk()}>
          {busy ? '…' : 'Özlüğü kaydet'}
        </button>
      )}

      <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--bdr)' }}>
        <div className="ch" style={{ marginBottom: 8 }}>
          Yinelenen kayıt birleştirme
        </div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 10 }}>
          Kalacak kayıt korunur; silinen kaydın bordro satırları kalana aktarılır, saha kullanıcı bağlantıları güncellenir.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div className="fld" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Kalacak</label>
            <select className="si" value={keepId} onChange={(e) => setKeepId(e.target.value)} style={{ width: '100%' }}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad || s.id}
                </option>
              ))}
            </select>
          </div>
          <div className="fld" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Silinecek</label>
            <select className="si" value={dropId} onChange={(e) => setDropId(e.target.value)} style={{ width: '100%' }}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad || s.id}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-o" disabled={busy} onClick={() => void mergePersonel()}>
            Birleştir
          </button>
        </div>
      </div>

      {msg && (
        <div className="alrt i" style={{ marginTop: 12 }}>
          <span className="alrt-ic">ℹ</span>
          {msg}
        </div>
      )}
    </div>
  );
}
