'use client';

import { useEffect, useRef } from 'react';
import { readLabSession } from '@/lib/lab-auth';
import {
  NUMUNE_TURLERI,
  betonRowAssignedToPersonelAd,
  localDateISO,
  numuneTurOf,
  personelKayitMetni,
} from '@/lib/numune-shared';

const DURUM_META: Record<string, { label: string; emoji: string }> = {
  bekliyor: { label: 'Bekliyor', emoji: '⏳' },
  pompa_yolda: { label: 'Pompa yolda', emoji: '🚚' },
  pompa_geldi: { label: 'Pompa geldi', emoji: '✅' },
  mikser_geldi: { label: 'Mikser geldi', emoji: '🚛' },
  tamamlandi: { label: 'Tamamlandı', emoji: '🏁' },
  iptal: { label: 'İptal', emoji: '⛔' },
};

async function resolveLinkedPersonelAd(w: any): Promise<{ ad: string; pid: string } | null> {
  const s = readLabSession();
  let pid = String(s?.personelId || '').trim();
  if (!pid && s?.userId && typeof w.fsGet === 'function') {
    const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
    const me = users.find((x: any) => String(x.id) === String(s.userId));
    if (me?.personelId) pid = String(me.personelId).trim();
  }
  if (!pid || typeof w.fsGet !== 'function') return null;
  const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
  const row = staff.find((x: any) => String(x.id) === String(pid));
  const ad = String(row?.ad || '').trim();
  if (!ad) return { ad: '', pid };
  return { ad, pid };
}

function turBadge(d: any): string {
  const k = numuneTurOf(d);
  const m = NUMUNE_TURLERI.find(x => x.key === k);
  const sub =
    k === 'karot' && String(d.karotAlt || '').toLowerCase() === 'kentsel'
      ? ' · kentsel'
      : k === 'karot' && String(d.karotAlt || '').toLowerCase() === 'performans'
        ? ' · performans'
        : '';
  return `${m?.emoji || '📋'} ${m?.label || k}${sub}`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isOlusturmaBugun(d: any, today: string): boolean {
  const o = String(d?.olusturma || '').slice(0, 10);
  return o === today;
}

export default function PersonelNumuneProgramPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = shellRef.current;
    if (!el || ran.current) return;

    const boot = async () => {
      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setTimeout(boot, 120);
        return;
      }
      const today = localDateISO();
      let linked: { ad: string; pid: string } | null;
      try {
        linked = await resolveLinkedPersonelAd(w);
      } catch {
        el.innerHTML =
          '<div style="padding:24px;color:var(--tx3);font-size:13px">Veri yüklenemedi. Sayfayı yenileyin.</div>';
        ran.current = true;
        return;
      }
      ran.current = true;

      if (!linked) {
        el.innerHTML = `
          <div style="padding:24px;max-width:520px">
            <div style="font-size:20px;font-weight:800;color:var(--tx)">Numune programım</div>
            <p style="font-size:13px;color:var(--tx3);margin-top:10px;line-height:1.5">
              Bu sayfa yalnızca personele bağlı hesaplar içindir. Girişinizde personel eşlemesi yoksa yöneticinizden <code style="font-size:11px">lab_users.personelId</code> atanmasını isteyin.
            </p>
          </div>`;
        return;
      }

      if (!linked.ad) {
        el.innerHTML = `
          <div style="padding:24px;max-width:520px">
            <div style="font-size:20px;font-weight:800;color:var(--tx)">Numune programım</div>
            <p style="font-size:13px;color:var(--tx3);margin-top:10px;line-height:1.5">
              Personel kaydınız bulunamadı. <code style="font-size:11px">hr_personnel</code> ile eşleşme kontrol edilmeli.
            </p>
          </div>`;
        return;
      }

      const docs: any[] = (await w.fsGet('beton_programi').catch(() => [])) || [];
      const mine = docs
        .filter((d: any) => !d._silindi && String(d.tarih || '').slice(0, 10) === today)
        .filter((d: any) => betonRowAssignedToPersonelAd(d, linked.ad));

      mine.sort((a, b) => {
        const ca = a.durum === 'tamamlandi' ? 1 : 0;
        const cb = b.durum === 'tamamlandi' ? 1 : 0;
        if (ca !== cb) return ca - cb;
        const ya = isOlusturmaBugun(a, today) ? 0 : 1;
        const yb = isOlusturmaBugun(b, today) ? 0 : 1;
        if (ya !== yb) return ya - yb;
        return `${a.saat || '99:99'}`.localeCompare(`${b.saat || '99:99'}`);
      });

      const tarihLbl = new Date(today + 'T12:00:00').toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const cards = mine.map(d => {
        const done = d.durum === 'tamamlandi';
        const iptal = d.durum === 'iptal';
        const yeni = isOlusturmaBugun(d, today) && !done && !iptal;
        const dm = DURUM_META[d.durum || 'bekliyor'] || { label: d.durum || '—', emoji: '•' };
        const pasifStyle = done || iptal ? 'opacity:.58;filter:saturate(.65)' : '';
        const border = done ? 'var(--grn)' : iptal ? 'var(--tx3)' : yeni ? 'var(--acc)' : 'var(--bdr)';

        const rows: { k: string; v: string }[] = [
          { k: 'Tür', v: turBadge(d) },
          { k: 'Ne alındı', v: d.numuneEtiket ? String(d.numuneEtiket) : '—' },
          { k: 'YİBF', v: d.yibf ? String(d.yibf) : '—' },
          { k: 'Yapı sahibi', v: d.yapiSahibi ? String(d.yapiSahibi) : '—' },
          { k: 'Yapı denetim', v: d.yapiDenetim ? String(d.yapiDenetim) : '—' },
          { k: 'Beton firması', v: d.betonFirmasi ? String(d.betonFirmasi) : '—' },
          { k: 'Tarih', v: d.tarih ? String(d.tarih) : '—' },
          { k: 'Saat', v: d.saat ? String(d.saat).slice(0, 5) : '—' },
          { k: 'Bölüm / blok', v: [d.bolum, d.blok].filter(Boolean).join(' / ') || '—' },
          { k: 'm³', v: d.m3 != null && d.m3 !== '' ? String(d.m3) : '—' },
          { k: 'Plan adet', v: d.adet != null && d.adet !== '' ? String(d.adet) : '—' },
          { k: 'Görevli', v: personelKayitMetni(d) || '—' },
          { k: 'Not', v: d.not ? String(d.not) : '—' },
        ];

        const body = rows
          .map(
            r =>
              `<div style="display:grid;grid-template-columns:7.5rem 1fr;gap:6px 10px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--bdr)">
                <div style="color:var(--tx3);font-weight:600">${esc(r.k)}</div>
                <div style="color:var(--tx);line-height:1.4;word-break:break-word">${esc(r.v)}</div>
              </div>`
          )
          .join('');

        return `
          <div class="card" style="padding:0;overflow:hidden;border:1px solid var(--bdr);border-left:4px solid ${border};${pasifStyle}">
            <div style="padding:14px 16px;border-bottom:1px solid var(--bdr);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;background:var(--sur2)">
              <div>
                <div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em">Durum</div>
                <div style="font-size:15px;font-weight:800;color:var(--tx);margin-top:4px">${dm.emoji} ${esc(dm.label)}</div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                ${yeni ? `<span style="font-size:10px;font-weight:800;padding:4px 8px;border-radius:8px;background:var(--acc);color:#fff">Yeni atanan</span>` : ''}
                ${done ? `<span style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:8px;background:var(--sur);color:var(--tx3);border:1px solid var(--bdr)">Tamamlandı</span>` : ''}
              </div>
            </div>
            <div style="padding:12px 16px 16px">${body}</div>
          </div>`;
      });

      el.innerHTML = `
        <div style="padding:0 24px 32px;max-width:900px;margin:0 auto">
          <div style="margin-bottom:18px">
            <div style="font-size:22px;font-weight:800;color:var(--tx);letter-spacing:-.3px">Bugünkü numune görevlerim</div>
            <div style="font-size:13px;color:var(--tx3);margin-top:4px">${esc(tarihLbl)} · ${esc(linked.ad)}</div>
            <p style="font-size:12px;color:var(--tx2);margin-top:10px;line-height:1.45">
              Gün içinde size atanmış görevler. Tamamlananlar soluk görünür. <a href="/beton" style="color:var(--acc2);font-weight:600;text-decoration:none">Numune programı</a> sayfasında tüm liste salt okunurdur.
            </p>
          </div>
          ${
            cards.length
              ? `<div style="display:flex;flex-direction:column;gap:14px">${cards.join('')}</div>`
              : `<div class="card" style="padding:28px;text-align:center;color:var(--tx3);font-size:13px">Bugün size atanmış numune kaydı yok.</div>`
          }
        </div>`;
    };

    void boot();
  }, []);

  return <div ref={shellRef} suppressHydrationWarning />;
}
