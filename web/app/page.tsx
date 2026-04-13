'use client';
import { useEffect, useRef } from 'react';
import { readLabSession } from '@/lib/lab-auth';

const DASHBOARD_HTML = `
<div class="page-shell" style="padding:0 0 32px">

  <!-- Başlık -->
  <div style="margin-bottom:24px">
    <div style="font-size:22px;font-weight:800;color:var(--tx)">Dashboard</div>
    <div style="font-size:13px;color:var(--tx2);margin-top:6px;font-weight:600" id="dash-oturum"></div>
    <div style="font-size:12px;color:var(--tx3);margin-top:4px" id="dash-tarih">—</div>
  </div>

  <!-- Özet Kartlar -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:28px">
    <div class="card" style="padding:16px 20px;cursor:pointer" onclick="location.href='/ebistr/yaklasan'">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Bugün Kırılacak</div>
      <div style="font-size:32px;font-weight:800;color:var(--amb);font-family:var(--fd)" id="dash-bugun-kirim">—</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">numune</div>
    </div>
    <div class="card" style="padding:16px 20px;cursor:pointer" onclick="location.href='/ebistr'">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Son 7 Gün Uygunsuz</div>
      <div style="font-size:32px;font-weight:800;color:var(--red);font-family:var(--fd)" id="dash-uygunsuz">—</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">kayıt</div>
    </div>
    <div class="card" style="padding:16px 20px;cursor:pointer" onclick="location.href='/cari'">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Aktif Sözleşmeli</div>
      <div style="font-size:32px;font-weight:800;color:var(--grn);font-family:var(--fd)" id="dash-sf-cnt">—</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">firma</div>
    </div>
    <div class="card" style="padding:16px 20px;cursor:pointer" onclick="location.href='/araclar'">
      <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Aktif Araç</div>
      <div style="font-size:32px;font-weight:800;color:var(--acc);font-family:var(--fd)" id="dash-arac-cnt">—</div>
      <div style="font-size:11px;color:var(--tx3);margin-top:4px">araç</div>
    </div>
  </div>

  <!-- Uyarılar (yaklaşan izin, Pazar kırımı, …) -->
  <div style="margin-bottom:28px">
    <div class="card" style="padding:0;overflow:hidden;border-left:3px solid var(--amb)">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--tx)">Uyarılar</div>
          <div style="font-size:11px;color:var(--tx3);margin-top:2px">Planlanmış izinler · yarın / yakın gün kırımları · haftanın Pazar günü (EBİSTR verisi geldikçe yenilenir)</div>
        </div>
        <a href="/personel/izin" style="font-size:11px;color:var(--acc);text-decoration:none;font-weight:600">İzinler →</a>
      </div>
      <div id="dash-uyarilar" style="padding:14px 18px;font-size:12px;color:var(--tx3)">Yükleniyor…</div>
    </div>
  </div>

  <!-- İK & araç hatırlatmaları -->
  <div style="margin-bottom:28px">
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--tx)">İK & araç hatırlatmaları</div>
          <div style="font-size:11px;color:var(--tx3);margin-top:2px">Yaklaşan doğum günleri · muayene / sigorta</div>
        </div>
        <a href="/personel/ozluk" style="font-size:11px;color:var(--acc);text-decoration:none;font-weight:600">Özlük →</a>
      </div>
      <div id="dash-ik-hatirlatma" style="padding:14px 18px;font-size:12px;color:var(--tx3)">Yükleniyor…</div>
    </div>
  </div>

  <!-- Havuz Sıcaklıkları -->
  <div style="margin-bottom:28px">
    <div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Kür Havuzu Sıcaklıkları</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div class="card" id="dash-havuz-1" style="padding:14px 18px;cursor:pointer;border-left:3px solid var(--bdr)" onclick="location.href='/ebistr/telemetri'">
        <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Havuz 1</div>
        <div style="font-size:30px;font-weight:800;font-family:var(--fd);color:var(--tx3)" id="dash-h1-temp">—</div>
        <div style="font-size:10px;color:var(--tx3);margin-top:4px" id="dash-h1-sub">veri bekleniyor</div>
      </div>
      <div class="card" id="dash-havuz-2" style="padding:14px 18px;cursor:pointer;border-left:3px solid var(--bdr)" onclick="location.href='/ebistr/telemetri'">
        <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Havuz 2</div>
        <div style="font-size:30px;font-weight:800;font-family:var(--fd);color:var(--tx3)" id="dash-h2-temp">—</div>
        <div style="font-size:10px;color:var(--tx3);margin-top:4px" id="dash-h2-sub">veri bekleniyor</div>
      </div>
    </div>
  </div>

  <!-- İki Kolon: To-Do + Son Loglar -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;align-items:start">

    <!-- To-Do -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;font-weight:700;color:var(--tx)">Görev Listesi</div>
        <button class="btn btn-p" style="padding:4px 12px;font-size:11px" onclick="dashTodoEkle()">+ Ekle</button>
      </div>
      <div id="dash-todo-form" style="display:none;padding:12px 18px;border-bottom:1px solid var(--bdr);background:var(--sur2)">
        <input id="dash-todo-inp" type="text" placeholder="Görev yaz..." style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:13px;box-sizing:border-box;margin-bottom:8px">
        <div style="display:flex;gap:8px">
          <select id="dash-todo-onc" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur);color:var(--tx);font-size:12px">
            <option value="normal">Normal</option>
            <option value="yuksek">Yüksek Öncelik</option>
            <option value="dusuk">Düşük Öncelik</option>
          </select>
          <button class="btn btn-p" style="padding:6px 14px;font-size:12px" onclick="dashTodoKaydet()">Kaydet</button>
          <button class="btn btn-o" style="padding:6px 10px;font-size:12px" onclick="document.getElementById('dash-todo-form').style.display='none'">İptal</button>
        </div>
      </div>
      <div id="dash-todo-liste" style="max-height:340px;overflow-y:auto">
        <div style="padding:40px 20px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</div>
      </div>
    </div>

    <!-- Son Loglar -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;font-weight:700;color:var(--tx)">Son Aktiviteler</div>
        <a href="/settings" style="font-size:11px;color:var(--acc);text-decoration:none">Tümü →</a>
      </div>
      <div id="dash-log-liste" style="max-height:340px;overflow-y:auto">
        <div style="padding:40px 20px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</div>
      </div>
    </div>

  </div>

</div>
`;

function DashboardInner() {
  const init = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Kabuk sadece mount sonrası yazılır: SSR/clientserver HTML farkı hydration uyarısı vermesin.
  useEffect(() => {
    const el = shellRef.current;
    if (el) el.innerHTML = DASHBOARD_HTML;

    const check = () => {
      const w = window as any;
      if (typeof w.fsGet === 'function') {
        if (!init.current) {
          init.current = true;
          dashInit();
        }
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }, []);

  return (
    <div
      ref={shellRef}
      style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 }}
      suppressHydrationWarning
    >
      {/* İlk karede boş kalmayı önler (mobil / yavaş JS); useEffect innerHTML bunu değiştirir */}
      <div
        data-dash-fallback="1"
        style={{
          padding: 'min(56px, 10vh) 20px',
          textAlign: 'center',
          color: 'var(--tx3)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--tx)', marginBottom: 8 }}>Dashboard yükleniyor…</div>
        <div>Ekran uzun süre boş kalırsa sayfayı yenileyin veya giriş yapın.</div>
        <a href="/giris" style={{ display: 'inline-block', marginTop: 16, color: 'var(--acc)', fontWeight: 600 }}>
          Giriş sayfası →
        </a>
      </div>
    </div>
  );
}

const DASH_EBISTR_STATS_KEY = 'lab_dash_ebistr_stats';
const BETON_PREFETCH_STORAGE_KEY = 'lab_beton_programi_v1';

/** Takvim haftası içindeki en yakın Pazar (bugün Pazar ise bugün), YYYY-MM-DD yerel */
function nextSundayYmdLocal(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay();
  const add = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + add);
  return d.toLocaleDateString('en-CA');
}

function tomorrowYmdLocal(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

/** breakDate günü `ymd` (YYYY-MM-DD) olan satırlar */
function dashCollectNumuneByBreakYmdFrom(nums: any[] | null | undefined, ymd: string): any[] {
  if (!nums?.length) return [];
  return nums.filter((x: any) => String(x.breakDate || '').trim().slice(0, 10) === ymd);
}

/** Ham numune listesinde aynı BRN/rapor tekrarını uyarı metninde tek say */
function dashUniqueNumuneRowsForUyari(list: any[]): any[] {
  const m = new Map<string, any>();
  let anon = 0;
  for (const x of list) {
    let k = String(x.brnNo || x.labReportNo || '').trim();
    if (!k) k = String(x.labNo || '').trim();
    if (!k) k = `__r${anon++}`;
    if (!m.has(k)) m.set(k, x);
  }
  return Array.from(m.values());
}

/** Sunucu önbelleğinden (Next API) yakın kırım tarihleri — dashboard’da ls/proxy olmasa da Uyarılar dolsun */
async function dashFetchNumunelerForUyarilar(): Promise<any[]> {
  if (typeof window === 'undefined') return [];
  const origin = window.location?.origin || '';
  if (!origin) return [];
  const bas = new Date();
  bas.setHours(12, 0, 0, 0);
  const bit = new Date(bas);
  bit.setDate(bit.getDate() + 14);
  const basS = bas.toLocaleDateString('en-CA');
  const bitS = bit.toLocaleDateString('en-CA');
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${origin}/api/ebistr/numuneler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basTarih: basS, bitTarih: bitS }),
      });
      const d = await r.json();
      if (d?.ok && Array.isArray(d.numuneler)) return d.numuneler;
      if (r.status === 202 && d?.err) await new Promise((res) => setTimeout(res, 2500));
      else break;
    } catch {
      break;
    }
  }
  return [];
}

function dashNumuneUyarisiHtml(baslik: string, ymd: string, list: any[], esc: (s: string) => string): string | null {
  if (!list.length) return null;
  const tr = ymd.split('-').reverse().join('.');
  const parts = list
    .slice(0, 3)
    .map(
      (n: any) =>
        esc(String(n.brnNo || n.labReportNo || n.yibf || '—')) +
        (n.betonSinifi ? ` (${esc(String(n.betonSinifi))})` : '')
    )
    .join(', ');
  const more = list.length > 3 ? ` <span style="color:var(--tx3)">+${list.length - 3}</span>` : '';
  return (
    `🧪 <strong>${baslik} (${esc(tr)})</strong> kırılacak <strong>${list.length}</strong> numune — ${parts}${more} · ` +
    `<a href="/ebistr/yaklasan" style="color:var(--acc);font-weight:600;text-decoration:none">Yaklaşan kırımlar →</a>`
  );
}

async function dashUyarilar() {
  const w = window as any;
  const box = document.getElementById('dash-uyarilar');
  if (!box) return;
  const esc = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');

  const lines: { urgent: boolean; html: string }[] = [];
  const tipAd: Record<string, string> = {
    yillik: 'Yıllık izin',
    mazeret: 'Mazeret',
    ucretsiz: 'Ücretsiz izin',
    rapor: 'Rapor',
    diger: 'Diğer',
  };

  try {
    if (typeof w.fsGet === 'function') {
      const izinler: any[] = (await w.fsGet('yillik_izin').catch(() => [])) || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + 14);

      for (const d of izinler) {
        if (!d || d._silindi) continue;
        if (d.yapildi === true) continue;
        const bas = String(d.bas || '').trim();
        const bit = String(d.bit || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bas)) continue;
        const basD = new Date(`${bas}T12:00:00`);
        const tipL = tipAd[d.tip] || d.tip || 'İzin';
        const pn = esc(String(d.personel || '—'));

        if (basD.getTime() < today.getTime()) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(bit)) {
            const bitD = new Date(`${bit}T12:00:00`);
            if (bitD.getTime() >= today.getTime()) {
              lines.push({
                urgent: true,
                html: `🏖️ <strong>${pn}</strong> — devam eden ${esc(tipL)} (${esc(bas.split('-').reverse().join('.'))} – ${esc(bit.split('-').reverse().join('.'))})`,
              });
            }
          }
          continue;
        }
        if (basD.getTime() > horizon.getTime()) continue;
        const days = Math.round((basD.getTime() - today.getTime()) / 86400000);
        const urgent = days <= 3;
        lines.push({
          urgent,
          html: `🏖️ <strong>${pn}</strong> — ${esc(tipL)} ${days === 0 ? '<strong>bugün</strong> başlıyor' : `<strong>${days}</strong> gün sonra başlıyor`} (${esc(bas.split('-').reverse().join('.'))})`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  let numRows: any[] | null = null;
  if (Array.isArray(w.ebistrAnalizler) && w.ebistrAnalizler.length) {
    numRows = w.ebistrAnalizler;
  } else {
    numRows = await dashFetchNumunelerForUyarilar();
  }

  const yarinYmd = tomorrowYmdLocal();
  const sunYmd = nextSundayYmdLocal();
  const yarinList = dashUniqueNumuneRowsForUyari(dashCollectNumuneByBreakYmdFrom(numRows, yarinYmd));
  const yBaslik = yarinYmd === sunYmd ? 'Yarın (Pazar)' : 'Yarın';
  const yHtml = dashNumuneUyarisiHtml(yBaslik, yarinYmd, yarinList, esc);
  if (yHtml) lines.push({ urgent: true, html: yHtml });

  if (sunYmd !== yarinYmd) {
    const sunList = dashUniqueNumuneRowsForUyari(dashCollectNumuneByBreakYmdFrom(numRows, sunYmd));
    const sHtml = dashNumuneUyarisiHtml('Bu hafta Pazar', sunYmd, sunList, esc);
    if (sHtml) lines.push({ urgent: true, html: sHtml });
  }

  lines.sort((a, b) => {
    if (a.urgent === b.urgent) return 0;
    return a.urgent ? -1 : 1;
  });

  if (!lines.length) {
    box.innerHTML =
      '<span style="color:var(--tx3)">Şu an öncelikli uyarı yok. 14 gün içinde başlayacak <em>planlı</em> izin veya yarın / Pazar kırım tarihli numune bulunmadı (EBİSTR verisi geldikçe güncellenir).</span>';
    return;
  }

  box.innerHTML =
    '<ul style="margin:0;padding-left:18px;line-height:1.7;color:var(--tx)">' +
    lines.map(l => `<li style="margin-bottom:6px">${l.html}</li>`).join('') +
    '</ul>';
}

async function dashIkHatirlatma() {
  const w = window as any;
  const box = document.getElementById('dash-ik-hatirlatma');
  if (!box || typeof w.fsGet !== 'function') return;

  const esc = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');

  function daysUntilBirthday(iso: string): number | null {
    const t = iso.trim();
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const [, mo, d] = t.split('-').map((x) => parseInt(x, 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), mo - 1, d);
    if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, mo - 1, d);
    return Math.round((next.getTime() - today.getTime()) / 86400000);
  }

  function daysUntilDeadline(sonIso: string): number | null {
    const t = sonIso.trim();
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const [y, mo, d] = t.split('-').map(Number);
    const end = new Date(y, mo - 1, d);
    end.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  }

  try {
    const [personel, araclar] = await Promise.all([
      w.fsGet('hr_personnel').catch(() => []),
      w.fsGet('araclar').catch(() => []),
    ]);

    const lines: { urgent: boolean; html: string }[] = [];

    (personel || [])
      .filter((p: any) => p && !p._silindi && p.dogumTarihi)
      .forEach((p: any) => {
        const days = daysUntilBirthday(String(p.dogumTarihi));
        if (days == null || days > 21) return;
        const nm = esc(p.ad || p.id);
        if (days === 0) lines.push({ urgent: true, html: `🎂 <strong>${nm}</strong> — bugün doğum günü` });
        else if (days <= 7) lines.push({ urgent: true, html: `🎂 <strong>${nm}</strong> — ${days} gün sonra` });
        else lines.push({ urgent: false, html: `🎂 <strong>${nm}</strong> — ${days} gün sonra` });
      });

    (araclar || [])
      .filter((a: any) => a && a.aktif !== false)
      .forEach((a: any) => {
        const pl = esc(a.plaka || a.id || '');
        const checks: [string, string, string][] = [
          ['Muayene', 'muayene', '🔧'],
          ['Sigorta', 'sigorta', '🛡️'],
        ];
        for (const [label, key, emoji] of checks) {
          const iso = a[key];
          if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) continue;
          const dd = daysUntilDeadline(String(iso).trim());
          if (dd == null) continue;
          if (dd < 0) {
            lines.push({
              urgent: true,
              html: `${emoji} <strong>${pl}</strong> — ${label} süresi <span style="color:var(--red)">doldu</span> (${esc(String(iso))})`,
            });
          } else if (dd <= 30) {
            lines.push({
              urgent: dd <= 14,
              html: `${emoji} <strong>${pl}</strong> — ${label} ${dd === 0 ? 'bugün bitiyor' : `${dd} gün sonra`} (${esc(String(iso))})`,
            });
          }
        }
      });

    lines.sort((a, b) => {
      if (a.urgent === b.urgent) return 0;
      return a.urgent ? -1 : 1;
    });

    if (!lines.length) {
      box.innerHTML = '<span style="color:var(--tx3)">Yaklaşan İK / araç tarihi yok.</span>';
      return;
    }

    const max = 12;
    const more = lines.length - max;
    box.innerHTML =
      '<ul style="margin:0;padding-left:18px;line-height:1.65;color:var(--tx)">' +
      lines
        .slice(0, max)
        .map((l) => `<li style="margin-bottom:4px">${l.html}</li>`)
        .join('') +
      (more > 0
        ? `<li style="color:var(--tx3);list-style:none;margin-left:-18px;margin-top:8px">+${more} kayıt daha…</li>`
        : '') +
      '</ul>';
  } catch {
    box.textContent = 'Hatırlatmalar yüklenemedi.';
  }
}

function dashPersistEbistrStats(bugunKirim: number, uygunsuz7: number) {
  try {
    sessionStorage.setItem(
      DASH_EBISTR_STATS_KEY,
      JSON.stringify({ ts: Date.now(), bugunKirim, uygunsuz7 })
    );
  } catch {
    /* quota */
  }
}

function dashInit() {
  const w = window as any;

  // Oturum + tarih
  const elOturum = document.getElementById('dash-oturum');
  const sess = readLabSession();
  if (elOturum) {
    elOturum.textContent = sess?.ad ? `Giriş: ${sess.ad}` : '';
  }
  const el = document.getElementById('dash-tarih');
  if (el) el.textContent = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Önceki oturumdan EBİSTR özetini göster (kartlar hemen dolsun)
  try {
    const raw = sessionStorage.getItem(DASH_EBISTR_STATS_KEY);
    if (raw) {
      const j = JSON.parse(raw) as { bugunKirim?: number; uygunsuz7?: number };
      const elB = document.getElementById('dash-bugun-kirim');
      const elU = document.getElementById('dash-uygunsuz');
      if (elB && typeof j.bugunKirim === 'number') elB.textContent = String(j.bugunKirim);
      if (elU && typeof j.uygunsuz7 === 'number') elU.textContent = String(j.uygunsuz7);
    }
  } catch {
    /* ignore */
  }

  // Bugün kırılacak + son 7 gün uygunsuz — analiz dizisi veya localStorage’daki ham numuneler
  const updateEbistrStats = (analizler: any[]) => {
    const today = new Date().toISOString().slice(0, 10);
    const bugun = analizler.filter((a: any) => (a.breakDate || '').startsWith(today));
    const elB = document.getElementById('dash-bugun-kirim');
    if (elB) elB.textContent = String(bugun.length);

    const cut = new Date();
    cut.setDate(cut.getDate() - 7);
    const minBreakDate = cut.toISOString().slice(0, 10);
    const uyg = analizler.filter(
      (a: any) => a.durum === 'UYGUNSUZ' && String(a.breakDate || '') >= minBreakDate
    );
    const elU = document.getElementById('dash-uygunsuz');
    if (elU) elU.textContent = String(uyg.length);
    dashPersistEbistrStats(bugun.length, uyg.length);
  };

  const applyEbistrFromLsNumuneler = (nums: any[]) => {
    const today = new Date().toISOString().slice(0, 10);
    const bugun = nums.filter((n: any) => String(n.breakDate || '').startsWith(today));
    const elB = document.getElementById('dash-bugun-kirim');
    if (elB) elB.textContent = String(bugun.length);
    let uyg = 0;
    let hasUyg = false;
    try {
      const prev = sessionStorage.getItem(DASH_EBISTR_STATS_KEY);
      if (prev) {
        const j = JSON.parse(prev) as { uygunsuz7?: number };
        if (typeof j.uygunsuz7 === 'number') {
          uyg = j.uygunsuz7;
          hasUyg = true;
        }
      }
    } catch {
      /* ignore */
    }
    const elU = document.getElementById('dash-uygunsuz');
    if (elU) {
      if (hasUyg) elU.textContent = String(uyg);
      else if (elU.textContent === '—' || elU.textContent === '') elU.textContent = '?';
    }
    try {
      const o: { ts: number; bugunKirim: number; uygunsuz7?: number } = {
        ts: Date.now(),
        bugunKirim: bugun.length,
      };
      if (hasUyg) o.uygunsuz7 = uyg;
      sessionStorage.setItem(DASH_EBISTR_STATS_KEY, JSON.stringify(o));
    } catch {
      /* quota */
    }
    void dashUyarilar();
  };

  if (w.ebistrAnalizler && w.ebistrAnalizler.length > 0) {
    updateEbistrStats(w.ebistrAnalizler);
    void dashUyarilar();
  } else {
    void (async () => {
      const nums = await dashFetchNumunelerForUyarilar();
      if (nums.length) applyEbistrFromLsNumuneler(nums);
      else void dashUyarilar();
    })();
  }

  const pollAnaliz = (tries = 0) => {
    if (w.ebistrAnalizler?.length > 0) {
      updateEbistrStats(w.ebistrAnalizler);
      void dashUyarilar();
      return;
    }
    if (tries < 40) setTimeout(() => pollAnaliz(tries + 1), 500);
  };
  pollAnaliz();

  document.addEventListener(
    'ebistr:refreshed',
    () => {
      if (w.ebistrAnalizler?.length > 0) updateEbistrStats(w.ebistrAnalizler);
      void dashUyarilar();
    },
    { passive: true }
  );

  void dashIkHatirlatma();
  void dashUyarilar();

  // Sözleşme sayısı — Firestore'dan
  if (w.fsGet) {
    w.fsGet('sozlesmeler').then((docs: any[]) => {
      const sfEl = document.getElementById('dash-sf-cnt');
      if (sfEl) sfEl.textContent = String((docs || []).filter((d: any) => !d._silindi).length);
    }).catch(() => {
      // fallback: JSON API
      fetch('/api/sozlesme').then(r => r.json()).then((json: any) => {
        const sfEl = document.getElementById('dash-sf-cnt');
        if (sfEl) sfEl.textContent = String((json.rows || []).length);
      }).catch(() => {});
    });
  }

  // Araç sayısı
  if (w.fsGet) {
    w.fsGet('araclar').then((docs: any[]) => {
      const el = document.getElementById('dash-arac-cnt');
      if (el) el.textContent = String((docs || []).filter((d: any) => d.aktif !== false).length);
    }).catch(() => {});
  }

  // Beton programı — session önbelleği (Numune sayfası ilk boyamada kullanır)
  if (w.fsGet) {
    w.fsGet('beton_programi')
      .then((docs: any[]) => {
        const rows = (docs || []).filter((d: any) => d && !d._silindi);
        try {
          sessionStorage.setItem(
            BETON_PREFETCH_STORAGE_KEY,
            JSON.stringify({ ts: Date.now(), rows })
          );
        } catch {
          /* quota */
        }
      })
      .catch(() => {});
  }

  // Havuz sıcaklıkları
  const renderHavuz = (no: '1' | '2', sicaklik: number, zaman: string) => {
    const sinirAlt = 18, sinirUst = 22;
    const alarm = sicaklik < sinirAlt || sicaklik > sinirUst;
    const color = alarm ? 'var(--red)' : 'var(--grn)';
    const borderColor = alarm ? 'var(--red)' : 'var(--grn)';
    const card = document.getElementById(`dash-havuz-${no}`);
    const tempEl = document.getElementById(`dash-h${no}-temp`);
    const subEl = document.getElementById(`dash-h${no}-sub`);
    if (card) card.style.borderLeftColor = borderColor;
    if (tempEl) { tempEl.textContent = sicaklik.toFixed(1) + '°C'; tempEl.style.color = color; }
    if (subEl) {
      const t = zaman ? new Date(zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
      subEl.textContent = alarm
        ? (sicaklik < sinirAlt ? '↓ Düşük sıcaklık' : '↑ Yüksek sıcaklık')
        : `Normal · ${t}`;
      subEl.style.color = alarm ? 'var(--red)' : 'var(--tx3)';
    }
  };

  const loadHavuz = () => {
    const cached = (w as any)._havuzSicakliklar;
    if (cached?.length) {
      cached.forEach((h: any) => renderHavuz(h.no, h.sicaklik, h.zaman));
      return;
    }
    fetch('/api/telemetri').then((r: Response) => r.json()).then((json: any) => {
      if (!json.ok) return;
      const items: any[] = json.telemetry ?? [];
      const byHavuz: Record<string, any[]> = {};
      for (const item of items) {
        const sName = (item?.sensor?.name || '').toLowerCase();
        const sDesc = (item?.sensor?.description || '').toLowerCase();
        if (!sName.includes('temperature') && !sDesc.includes('sıcaklık')) continue;
        const name: string = item?.department?.name ?? '';
        const no = (/-1\b/.test(name) || name.endsWith('-1')) ? '1' : (/-2\b/.test(name) || name.endsWith('-2')) ? '2' : null;
        if (!no) continue;
        if (!byHavuz[no]) byHavuz[no] = [];
        byHavuz[no].push(item);
      }
      (['1', '2'] as const).forEach(no => {
        const readings = (byHavuz[no] || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const latest = readings[0];
        if (!latest) return;
        renderHavuz(no, Number(latest.value), latest.timestamp);
      });
    }).catch(() => {});
  };

  loadHavuz();
  // TelemetriPoller'dan gelen güncellemeleri dinle
  window.addEventListener('havuz-sicaklik-update', ((e: CustomEvent) => {
    (e.detail || []).forEach((h: any) => renderHavuz(h.no, h.sicaklik, h.zaman));
  }) as EventListener);

  // To-Do yükle
  dashTodoYukle();

  // Log yükle
  dashLogYukle();

  // Global fonksiyonlar
  w.dashTodoEkle = () => {
    const form = document.getElementById('dash-todo-form');
    if (form) { form.style.display = form.style.display === 'none' ? 'block' : 'none'; }
    const inp = document.getElementById('dash-todo-inp') as HTMLInputElement;
    if (inp) inp.focus();
  };

  w.dashTodoKaydet = async () => {
    const inp = document.getElementById('dash-todo-inp') as HTMLInputElement | null;
    const onc = document.getElementById('dash-todo-onc') as HTMLSelectElement | null;
    const text = inp?.value?.trim();
    if (!text || !inp) return;
    const todo = { id: Date.now(), text, oncelik: onc?.value || 'normal', tamamlandi: false, tarih: new Date().toISOString() };
    const mevcut = await dashTodoGetir();
    mevcut.unshift(todo);
    await w.fsSet('todos', 'liste', { items: mevcut });
    const inpAfter = document.getElementById('dash-todo-inp') as HTMLInputElement | null;
    if (inpAfter) inpAfter.value = '';
    const form = document.getElementById('dash-todo-form');
    if (form) form.style.display = 'none';
    dashTodoRender(mevcut);
    w.logAction && w.logAction('dashboard', 'Görev eklendi: ' + text);
  };

  w.dashTodoToggle = async (id: number) => {
    const mevcut = await dashTodoGetir();
    const t = mevcut.find((x: any) => x.id === id);
    if (t) t.tamamlandi = !t.tamamlandi;
    await w.fsSet('todos', 'liste', { items: mevcut });
    dashTodoRender(mevcut);
  };

  w.dashTodoSil = async (id: number) => {
    const mevcut = await dashTodoGetir();
    const yeni = mevcut.filter((x: any) => x.id !== id);
    await w.fsSet('todos', 'liste', { items: yeni });
    dashTodoRender(yeni);
  };
}

async function dashTodoGetir(): Promise<any[]> {
  const w = window as any;
  try {
    const doc = await w.fsGetDoc('todos', 'liste');
    return doc?.items || [];
  } catch { return []; }
}

async function dashTodoYukle() {
  const items = await dashTodoGetir();
  dashTodoRender(items);
}

function dashTodoRender(items: any[]) {
  const el = document.getElementById('dash-todo-liste');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--tx3);font-size:12px">Görev yok. + Ekle ile başlayın.</div>';
    return;
  }
  const oncelikRenk: Record<string, string> = { yuksek: 'var(--red)', normal: 'var(--acc)', dusuk: 'var(--tx3)' };
  el.innerHTML = items.map((t: any) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--bdr);${t.tamamlandi ? 'opacity:.5' : ''}">
      <input type="checkbox" ${t.tamamlandi ? 'checked' : ''} onchange="dashTodoToggle(${t.id})" style="cursor:pointer;width:16px;height:16px;accent-color:var(--grn)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--tx);${t.tamamlandi ? 'text-decoration:line-through' : ''}">${t.text}</div>
        <div style="font-size:10px;color:${oncelikRenk[t.oncelik]||'var(--tx3)'};margin-top:2px;text-transform:uppercase;font-weight:700">${t.oncelik}</div>
      </div>
      <button onclick="dashTodoSil(${t.id})" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px" title="Sil">✕</button>
    </div>
  `).join('');
}

async function dashLogYukle() {
  const el = document.getElementById('dash-log-liste');
  if (!el) return;
  try {
    const w = window as any;
    const docs = await w.fsGet('logs');
    const pickTs = (x: any) => String(x?.zaman || x?.dt || x?.timestamp || '');
    const sorted = (docs || []).sort((a: any, b: any) => pickTs(b).localeCompare(pickTs(a))).slice(0, 20);
    if (!sorted.length) {
      el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--tx3);font-size:12px">Henüz log yok.</div>';
      return;
    }
    el.innerHTML = sorted.map((l: any) => {
      const rawTs = l.zaman || l.dt || '';
      const zaman = rawTs ? new Date(rawTs).toLocaleString('tr-TR') : '—';
      const msg = l.aksiyon || l.action || l.mesaj || '—';
      const modul = l.modul || '';
      return `
        <div style="padding:10px 16px;border-bottom:1px solid var(--bdr)">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="font-size:12px;color:var(--tx);flex:1">${msg}</div>
            <div style="font-size:10px;color:var(--tx3);white-space:nowrap">${zaman}</div>
          </div>
          ${modul ? `<div style="font-size:10px;color:var(--acc);margin-top:2px;font-weight:600">${modul}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch {
    if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px">Loglar yüklenemedi.</div>';
  }
}

export default function DashboardPage() {
  return <DashboardInner />;
}
