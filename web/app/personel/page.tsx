'use client';
import ModulePage from '@/components/ModulePage';
import { readLabSession } from '@/lib/lab-auth';

async function resolveLinkedPersonelId(w: any): Promise<string | null> {
  const s = readLabSession();
  let pid = String(s?.personelId || '').trim();
  if (pid) return pid;
  if (s?.userId && typeof w.fsGet === 'function') {
    const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
    const me = users.find((x: any) => String(x.id) === String(s.userId));
    if (me?.personelId) return String(me.personelId).trim();
  }
  return null;
}

const HTML = `
<div class="page-shell">
<div class="ph" style="padding:0 0 8px">
  <div style="font-size:22px;font-weight:800;color:var(--tx)">Personel Dashboard</div>
  <div style="font-size:12px;color:var(--tx3);margin-top:4px" id="per-tarih">—</div>
</div>

<!-- Özet Kartlar -->
<div class="hero-grid">
  <div class="card" style="padding:16px 20px;border-left:3px solid var(--grn);cursor:pointer" onclick="location.href='/personel/bordro'">
    <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Aktif Personel</div>
    <div style="font-size:32px;font-weight:800;color:var(--grn);font-family:var(--fd)" id="per-aktif-cnt">—</div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">çalışan</div>
  </div>
  <div class="card" style="padding:16px 20px;border-left:3px solid var(--acc);cursor:pointer" onclick="location.href='/personel/bordro'">
    <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Bu Ay Toplam</div>
    <div style="font-size:28px;font-weight:800;color:var(--acc);font-family:var(--fd)" id="per-bu-ay-tutar">—</div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">maaş ödemesi</div>
  </div>
  <div class="card" style="padding:16px 20px;border-left:3px solid var(--amb);cursor:pointer" onclick="location.href='/personel/izin'">
    <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">İzindeki Personel</div>
    <div style="font-size:32px;font-weight:800;color:var(--amb);font-family:var(--fd)" id="per-izin-cnt">—</div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">bu ay</div>
  </div>
  <div class="card" style="padding:16px 20px;border-left:3px solid var(--acc2);cursor:pointer" onclick="location.href='/personel/ozet'">
    <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Karotçu Sayısı</div>
    <div style="font-size:32px;font-weight:800;color:var(--acc2);font-family:var(--fd)" id="per-karot-cnt">—</div>
    <div style="font-size:11px;color:var(--tx3);margin-top:4px">uzman</div>
  </div>
</div>

<!-- Hızlı Erişim -->
<div class="quick-grid">
  <a href="/personel/bordro" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--acc)22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📊</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Aylık Bordro</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">Maaş hesaplama ve kayıt</div></div>
    </div>
  </a>
  <a href="/personel/liste" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--grn)22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">👥</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Personel Listesi</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">Çalışan bilgileri ve IBAN</div></div>
    </div>
  </a>
  <a href="/personel/ozet" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--amb)22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📈</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Maaş Özeti</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">Analitik ve raporlama</div></div>
    </div>
  </a>
  <a href="/personel/izin" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer">
      <div style="width:44px;height:44px;border-radius:12px;background:#8e7bff22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏖️</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Yıllık İzin</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">İzin takip ve planlama</div></div>
    </div>
  </a>
  <a href="/personel/performans" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer;border-left:3px solid var(--acc)">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--acc-d);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📊</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Performans</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">Numune alma takibi ve istatistik</div></div>
    </div>
  </a>
  <a href="/personel/numune-program" style="text-decoration:none">
    <div class="card" style="padding:20px;display:flex;align-items:center;gap:16px;cursor:pointer;border-left:3px solid var(--grn)">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--grn)22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎯</div>
      <div><div style="font-size:14px;font-weight:700;color:var(--tx)">Bugünkü numunelerim</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">Günlük atanmış görevler (kart)</div></div>
    </div>
  </a>
</div>

<!-- Personel Listesi Özeti -->
<div class="card" style="padding:0;overflow:hidden">
  <div class="soft-divider" style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:14px;font-weight:700;color:var(--tx)">Personel</div>
    <a href="/personel/liste" style="font-size:11px;color:var(--acc);text-decoration:none">Tümü →</a>
  </div>
  <div id="per-staff-liste">
    <div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</div>
  </div>
</div>
</div>
`;

export default function PersonelPage() {
  return (
    <ModulePage
      html={HTML}
      onInit={async () => {
        const w = window as any;

        const el = document.getElementById('per-tarih');
        if (el) el.textContent = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Personel listesini çek
        const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
        const selfPid = await resolveLinkedPersonelId(w);
        let aktif = staff.filter((s: any) => s.aktif !== false);
        const selfStaff = selfPid ? aktif.find((s: any) => String(s.id) === String(selfPid)) : null;
        if (selfPid) {
          aktif = selfStaff ? [selfStaff] : [];
        }

        const cntEl = document.getElementById('per-aktif-cnt');
        if (cntEl) cntEl.textContent = String(aktif.length);

        const karotCnt = aktif.filter((s: any) => s.isKarot).length;
        const kaEl = document.getElementById('per-karot-cnt');
        if (kaEl) kaEl.textContent = String(karotCnt);

        // Bu ay bordro toplamı
        const ay = new Date().toISOString().slice(0, 7);
        const bordroData: any[] = (await w.fsGet('hr_payroll').catch(() => [])) || [];
        let buAyBordro = bordroData.filter((b: any) => (b.yilAy || '') === ay);
        if (selfPid) {
          buAyBordro = buAyBordro.filter((b: any) => String(b.personnelId) === String(selfPid));
        }
        const toplamTutar = buAyBordro.reduce((s: number, b: any) => s + (parseFloat(b.payNet || b.toplam) || 0), 0);
        const tutarEl = document.getElementById('per-bu-ay-tutar');
        if (tutarEl) tutarEl.textContent = toplamTutar > 0 ? toplamTutar.toLocaleString('tr-TR') + ' ₺' : '—';

        // Bu ay izinli (personel adı izin kaydında metin olarak tutulur)
        const izinler: any[] = (await w.fsGet('yillik_izin').catch(() => [])) || [];
        const today = new Date().toISOString().slice(0, 10);
        let izinAktif = izinler.filter((i: any) => !i._silindi && i.bas <= today && i.bit >= today);
        if (selfPid) {
          if (selfStaff?.ad) {
            const ad = String(selfStaff.ad).trim();
            izinAktif = izinAktif.filter((i: any) => String(i.personel || '').trim() === ad);
          } else {
            izinAktif = [];
          }
        }
        const buAyIzin = izinAktif.length;
        const izinEl = document.getElementById('per-izin-cnt');
        if (izinEl) izinEl.textContent = String(buAyIzin);

        // Personel liste özeti
        const listeEl = document.getElementById('per-staff-liste');
        if (listeEl) {
          if (!aktif.length) {
            const msg = selfPid && !selfStaff
              ? 'Hesabınız bir personele bağlı görünüyor ancak kayıt bulunamadı. Yöneticinizden personel eşlemesini kontrol ettirin.'
              : 'Personel eklenmedi. <a href="/personel/liste" style="color:var(--acc)">Personel Listesi</a> sayfasından ekleyin.';
            listeEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">' + msg + '</div>';
          } else {
            listeEl.innerHTML = aktif.slice(0, 8).map((s: any) => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--bdr)">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--acc)22;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--acc);flex-shrink:0">${(s.ad||'?')[0]}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--tx)">${s.ad || '—'}</div>
                  <div style="font-size:11px;color:var(--tx3)">${s.gorev || s.meslek || '—'}</div>
                </div>
                <div style="text-align:right;font-size:12px;color:var(--grn);font-weight:600">${s.net ? Number(s.net).toLocaleString('tr-TR') + ' ₺' : '—'}</div>
              </div>
            `).join('') + (aktif.length > 8 ? `<div style="padding:10px 16px;text-align:center;font-size:11px;color:var(--tx3)">+${aktif.length - 8} daha...</div>` : '');
          }
        }
      }}
    />
  );
}
