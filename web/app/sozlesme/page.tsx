'use client';
import { useEffect, useRef, useState } from 'react';

interface Sozlesme {
  id: string;
  yibf: string;
  muteahhit: string;
  ilce: string;
  mahalle: string;
  pafta: string;
  ada: string;
  parsel: string;
  m2: string;
  tarih: string;
  kup: string;
  celik: string;
  olusturma: string;
  aktif?: boolean;
}

const EMPTY: Omit<Sozlesme, 'id' | 'olusturma'> = {
  yibf: '', muteahhit: '', ilce: '', mahalle: '',
  pafta: '', ada: '', parsel: '', m2: '',
  tarih: new Date().toISOString().slice(0, 10),
  kup: '', celik: '', aktif: true,
};

export default function SozlesmePage() {
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [rows, setRows] = useState<Sozlesme[]>([]);
  const [durum, setDurum] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hazir, setHazir] = useState(false);
  const init = useRef(false);

  // Wait for Firestore functions to be available
  useEffect(() => {
    if (init.current) return;
    const check = () => {
      const w = window as any;
      if (typeof w.fsGet === 'function') {
        init.current = true;
        setHazir(true);
        yukle(w);
      } else {
        setTimeout(check, 150);
      }
    };
    check();
  }, []);

  const yukle = async (w: any) => {
    try {
      const docs: any[] = await w.fsGet('sozlesmeler') || [];
      const aktif = docs.filter((d: any) => !d._silindi);
      setRows(aktif.sort((a: any, b: any) => (b.olusturma || '').localeCompare(a.olusturma || '')));
    } catch {
      setDurum('Yüklenemedi.');
    }
  };

  const set = (k: keyof typeof EMPTY, v: any) => setForm(f => ({ ...f, [k]: v }));

  const yibfAutoFill = (yibf: string) => {
    set('yibf', yibf);
    const w = window as any;
    if (w.raporDefterYibfBilgi) {
      const info = w.raporDefterYibfBilgi(yibf.trim());
      if (info) {
        setForm(f => ({
          ...f, yibf,
          muteahhit: f.muteahhit || info.muteahhit || '',
          pafta: f.pafta || info.pafta || '',
          ada: f.ada || info.ada || '',
          parsel: f.parsel || info.parsel || '',
        }));
      }
    }
  };

  const kaydet = async () => {
    if (!form.yibf || !form.muteahhit) {
      setDurum('YİBF ve Müteahhit zorunlu.'); return;
    }
    setYukleniyor(true);
    const w = window as any;
    const id = editId || `soz-${Date.now()}`;
    const data: Sozlesme = { ...form, id, olusturma: new Date().toISOString(), aktif: true };
    try {
      await w.fsSet('sozlesmeler', id, data);
      w.logAction && w.logAction('sozlesme', `Sözleşme kaydedildi: ${data.yibf}`);
      setDurum('Kaydedildi.');
      await yukle(w);
      if (!editId) setForm({ ...EMPTY });
      setEditId(null);
    } catch (e: any) {
      setDurum('Hata: ' + (e.message || 'bilinmeyen'));
    }
    setYukleniyor(false);
  };

  const sil = async (id: string) => {
    if (!confirm('Bu sözleşmeyi silmek istiyor musunuz?')) return;
    const w = window as any;
    await w.fsSet('sozlesmeler', id, { _silindi: true, id });
    w.logAction && w.logAction('sozlesme', `Sözleşme silindi: ${id}`);
    setRows(r => r.filter(x => x.id !== id));
  };

  const wordIndir = async (data: Partial<Sozlesme>) => {
    setDurum('Word hazırlanıyor...');
    const res = await fetch('/api/sozlesme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setDurum('Hata: ' + (err.error || res.statusText));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sozlesme-${data.yibf || 'taslak'}.docx`;
    a.click(); URL.revokeObjectURL(url);
    setDurum('İndirildi.');
  };

  const duzenle = (r: Sozlesme) => {
    setEditId(r.id);
    setForm({ yibf: r.yibf, muteahhit: r.muteahhit, ilce: r.ilce, mahalle: r.mahalle,
      pafta: r.pafta, ada: r.ada, parsel: r.parsel, m2: r.m2,
      tarih: r.tarih, kup: r.kup, celik: r.celik });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fi = (label: string, key: keyof typeof EMPTY, type = 'text', ph = '') => (
    <div className="fld" key={key}>
      <label>{label}</label>
      <input
        type={type}
        value={form[key] as string}
        placeholder={ph}
        onChange={e => key === 'yibf' ? yibfAutoFill(e.target.value) : set(key, e.target.value)}
      />
    </div>
  );

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.3px' }}>📄 Sözleşmeler</div>
        <div style={{ fontSize: '13px', color: 'var(--tx3)', marginTop: '3px' }}>Laboratuvar hizmet sözleşmeleri · Firestore</div>
      </div>

      {/* Form */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)', marginBottom: '14px' }}>
          {editId ? '✏️ Sözleşme Düzenle' : '+ Yeni Sözleşme'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px', alignItems: 'flex-end' }}>
          {fi('YİBF No', 'yibf', 'text', 'YİBF numarası')}
          {fi('Müteahhit / Yapı Sahibi', 'muteahhit', 'text', 'Firma / kişi adı')}
          {fi('İlçe', 'ilce')}
          {fi('Mahalle', 'mahalle')}
          {fi('Pafta', 'pafta')}
          {fi('Ada', 'ada')}
          {fi('Parsel', 'parsel')}
          {fi('Alan (m²)', 'm2', 'text', '0')}
          {fi('Sözleşme Tarihi', 'tarih', 'date')}
          {fi('Küp Fiyatı (TL)', 'kup', 'text', 'TL')}
          {fi('Çelik Fiyatı (TL)', 'celik', 'text', 'TL')}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingBottom: '10px' }}>
            <button className="btn btn-p" onClick={kaydet} disabled={yukleniyor || !hazir} style={{ flex: 1, height: '42px' }}>
              {yukleniyor ? '...' : '💾 Kaydet'}
            </button>
            <button className="btn btn-o" onClick={() => wordIndir(form)} style={{ height: '42px', whiteSpace: 'nowrap' }}>
              📄 Word
            </button>
            {editId && (
              <button className="btn btn-g" onClick={() => { setEditId(null); setForm({ ...EMPTY }); }} style={{ height: '42px' }}>İptal</button>
            )}
          </div>
        </div>
        {durum && (
          <div style={{ fontSize: '12px', color: durum.includes('Hata') ? 'var(--red)' : 'var(--grn)', marginTop: '8px' }}>{durum}</div>
        )}
      </div>

      {/* List */}
      <div style={{ background: 'var(--sur)', border: '1px solid var(--bdr)', borderRadius: '16px' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx)' }}>Sözleşmeler</span>
          <span style={{ fontSize: '11px', color: 'var(--tx3)', background: 'var(--sur2)', border: '1px solid var(--bdr)', borderRadius: '20px', padding: '2px 10px' }}>{rows.length} kayıt</span>
        </div>
        {!hazir ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '12px' }}>Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '12px' }}>Henüz sözleşme yok. Yukarıdan ekleyin.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--sur2)' }}>
                  {['YİBF', 'Müteahhit', 'İlçe / Mahalle', 'Pafta / Ada / Parsel', 'Alan', 'Tarih', 'Küp', 'Çelik', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--tx3)', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bdr)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--bdr)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--fm)', color: 'var(--acc2)', fontWeight: 600 }}>{r.yibf || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.muteahhit || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{[r.ilce, r.mahalle].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--fm)', fontSize: '11px' }}>{[r.pafta, r.ada, r.parsel].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.m2 ? r.m2 + ' m²' : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.tarih ? r.tarih.slice(0, 10).split('-').reverse().join('.') : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.kup ? r.kup + ' TL' : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{r.celik ? r.celik + ' TL' : '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => duzenle(r)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--bdr)', background: 'var(--sur2)', color: 'var(--tx2)', cursor: 'pointer', marginRight: '6px' }}>Düzenle</button>
                      <button onClick={() => wordIndir(r)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--bdr)', background: 'var(--acc-d)', color: 'var(--acc2)', cursor: 'pointer', marginRight: '6px' }}>📄 Word</button>
                      <button onClick={() => sil(r.id)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--red-d)', background: 'var(--red-d)', color: 'var(--red)', cursor: 'pointer' }}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
