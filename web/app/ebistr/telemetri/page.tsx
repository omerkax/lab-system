'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { ensureEbistrScript } from '@/lib/load-script-client';
import type { TelemetriAlarm } from '@/components/TelemetriAlarmBanner';
import type { KurTelReading } from '@/lib/kur-sicaklik-export';
import { telemetryRowIsLikelyPoolTemp } from '@/lib/ebistr-telemetry-ui';
import {
  clearTelemetriGecmisFirestore,
  emptyTelGecmis,
  loadTelemetriGecmisWithMigration,
  mergePoolReadings,
  persistTelemetriGecmisToFirestore,
  TEL_GECMIS_MAX_PER_POOL,
  type TelGecmisSatir,
} from '@/lib/telemetri-gecmis-firestore';

const SINIR = { alt: 18, ust: 22 };
const POLL_MS = 60_000;
/** Geçmiş Firestore’da (sys_config/telemetri_gecmis); EBİSTR anlık ölçümleri ile birleştirilir */
const TEL_GECMIS_TABLO_SATIR = 30;
const F058_KONTROL_STORAGE_KEY = 'f058-kontrol-edenler-v1';

function loadF058KontrolList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(F058_KONTROL_STORAGE_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as unknown;
    if (!Array.isArray(a)) return [];
    return a
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  } catch {
    return [];
  }
}

function saveF058KontrolList(names: string[]) {
  try {
    localStorage.setItem(F058_KONTROL_STORAGE_KEY, JSON.stringify(names.slice(0, 40)));
  } catch {
    /* quota */
  }
}

interface HavuzOkuma {
  id: string;
  ad: string;
  sicaklik: number | null;
  batarya: number | null;
  zaman: string | null;
  durum: 'normal' | 'alarm' | 'bekleniyor';
  gecmis: { sicaklik: number; zaman: string }[];
}

function formatZaman(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (mins < 2) return saat + ' (az önce)';
    if (mins < 60) return saat + ' (' + mins + ' dk önce)';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return saat + ' (' + hrs + ' sa önce)';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' + saat;
  } catch {
    return '—';
  }
}

function formatTarihSaat(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function havuzNoFromName(name: string): '1' | '2' | null {
  if (/-1\b/.test(name) || /\-1$/.test(name)) return '1';
  if (/-2\b/.test(name) || /\-2$/.test(name)) return '2';
  return null;
}

export async function clearTelGecmisStorage() {
  if (typeof window === 'undefined') return;
  await clearTelemetriGecmisFirestore(window);
}

async function processItems(
  items: any[],
  setHavuzlar: React.Dispatch<React.SetStateAction<HavuzOkuma[]>>
) {
  const w = window as any;

  // Group temperature readings by havuz index
  const byHavuz: Record<'1' | '2', any[]> = { '1': [], '2': [] };

  for (const item of items) {
    if (!telemetryRowIsLikelyPoolTemp(item)) continue;

    const deptName: string = item?.department?.name ?? '';
    const gatewayId: number = item?.gateway?.id;
    
    let no = havuzNoFromName(deptName);
    
    // Fallback identification for specific known gateway
    if (!no && gatewayId === 1416859) {
      // If we can't tell from department, let's look at the department name more closely or alternating
      if (deptName.indexOf('-1') !== -1) no = '1';
      else if (deptName.indexOf('-2') !== -1) no = '2';
      else no = '1'; // Default to 1
    }

    if (no) byHavuz[no].push(item);
  }

  let mergedStore = emptyTelGecmis();
  try {
    mergedStore = await loadTelemetriGecmisWithMigration(window);
  } catch (e) {
    console.warn('[telemetri] geçmiş yükleme:', e);
  }

  for (const no of ['1', '2'] as const) {
    const readings = byHavuz[no].sort(
      (a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const apiGecmis: TelGecmisSatir[] = readings
      .map((r: any) => ({ sicaklik: Number(r.value), zaman: String(r.timestamp || '') }))
      .filter((r) => r.zaman && !Number.isNaN(r.sicaklik));
    mergedStore = mergePoolReadings(mergedStore, no, apiGecmis);
  }

  try {
    await persistTelemetriGecmisToFirestore(window, mergedStore);
  } catch (e) {
    console.warn('[telemetri] geçmiş kayıt:', e);
  }

  const yeniHavuzlar: HavuzOkuma[] = (['1', '2'] as const).map((no) => {
    const readings = byHavuz[no].sort(
      (a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const latest = readings[0] ?? null;
    const sicaklik: number | null = latest ? Number(latest.value) : null;
    const batarya: number | null =
      latest?.deviceBatteryLevelValue != null
        ? Number(latest.deviceBatteryLevelValue)
        : null;
    const zaman: string | null = latest?.timestamp ?? null;
    const durum: HavuzOkuma['durum'] =
      sicaklik === null
        ? 'bekleniyor'
        : sicaklik < SINIR.alt || sicaklik > SINIR.ust
        ? 'alarm'
        : 'normal';

    const gecmis = mergedStore[no].slice(0, TEL_GECMIS_TABLO_SATIR);

    return {
      id: `havuz${no}`,
      ad: `Havuz ${no}`,
      sicaklik,
      batarya,
      zaman,
      durum,
      gecmis,
    };
  });

  setHavuzlar(yeniHavuzlar);

  // Alarm logic — update window._telemetriAlarmlar and dispatch event
  const mevcut: TelemetriAlarm[] = w._telemetriAlarmlar ?? [];

  const yeniAlarmlar: TelemetriAlarm[] = yeniHavuzlar
    .filter((h) => h.durum === 'alarm' && h.sicaklik !== null)
    .map((h) => ({
      id: h.id,
      nokta: `${h.ad} Sıcaklığı`,
      deger: h.sicaklik as number,
      sinir: (h.sicaklik as number) < SINIR.alt ? 'alt' : 'ust',
      sinirDeger: (h.sicaklik as number) < SINIR.alt ? SINIR.alt : SINIR.ust,
      birim: '°C',
      zaman: h.zaman ?? new Date().toISOString(),
    }));

  const normalIds = new Set(
    yeniHavuzlar.filter((h) => h.durum === 'normal').map((h) => h.id)
  );
  const devamEdenler = mevcut.filter((a) => !normalIds.has(a.id));
  const yeniIds = new Set(yeniAlarmlar.map((a) => a.id));
  const birlesik = [
    ...devamEdenler.filter((a) => !yeniIds.has(a.id)),
    ...yeniAlarmlar,
  ];
  w._telemetriAlarmlar = birlesik;
  window.dispatchEvent(new Event('telemetri-alarm'));
}

export default function TelemetriPage() {
  const [havuzlar, setHavuzlar] = useState<HavuzOkuma[]>([
    { id: 'havuz1', ad: 'Havuz 1', sicaklik: null, batarya: null, zaman: null, durum: 'bekleniyor', gecmis: [] },
    { id: 'havuz2', ad: 'Havuz 2', sicaklik: null, batarya: null, zaman: null, durum: 'bekleniyor', gecmis: [] },
  ]);
  const [sonGuncelleme, setSonGuncelleme] = useState<string>('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [telemetryUyari, setTelemetryUyari] = useState<string | null>(null);
  const [proxyDurum, setProxyDurum] = useState<'kontrol' | 'ok' | 'hata'>('kontrol');
  const [expBas, setExpBas] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [expBit, setExpBit] = useState(() => new Date().toISOString().slice(0, 10));
  const [expSaat, setExpSaat] = useState('1');
  const [expJitter, setExpJitter] = useState(true);
  const [expYukleniyor, setExpYukleniyor] = useState(false);
  const [expHata, setExpHata] = useState<string | null>(null);
  const [expTemplateFile, setExpTemplateFile] = useState('');
  const [expKontrolEden, setExpKontrolEden] = useState('');
  const [expKontrolListesi, setExpKontrolListesi] = useState<string[]>([]);
  const [expHavuzMod, setExpHavuzMod] = useState<'both' | '1' | '2'>('both');
  const [expSlotBaslangic, setExpSlotBaslangic] = useState('08:00');
  const [expFormTarih, setExpFormTarih] = useState('');
  const [expFormSaat, setExpFormSaat] = useState('');
  const [f058Tpl, setF058Tpl] = useState<{
    hasDocx: boolean;
    hasDocOnly: boolean;
    docxFileName: string | null;
    docxCandidates: string[];
    errorHint: string | null;
    repoRoot: string | null;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initDone = useRef(false);

  useEffect(() => {
    void ensureEbistrScript('/ebistr.js?v=20260413-ebistr-extension-v11');
  }, []);

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    try {
      const res = await fetch('/api/telemetri');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Bilinmeyen hata');
      const loggedIn = !!json.loggedIn;
      const items: any[] = json.telemetry ?? [];
      await processItems(items, setHavuzlar);
      setSonGuncelleme(new Date().toISOString());
      setHata(null);
      if (!loggedIn) {
        setTelemetryUyari(
          'Bu sunucu örneğinde EBİSTR JWT yok; telemetri çekilmez. Vercel’de EBISTR_SERVER_TOKEN veya lab üzerinden /api/ebistr/setToken ile token gönderin.'
        );
      } else if (!items.length) {
        setTelemetryUyari(
          'Sunucu telemetri listesi boş döndü. Tam senkron birkaç dakika sürebilir; yine boşsa EBİSTR’de ölçüm veya yetki farkı olabilir.'
        );
      } else {
        setTelemetryUyari(null);
      }
      setProxyDurum('ok');
    } catch (e: any) {
      setTelemetryUyari(null);
      setHata(e.message ?? 'Bağlantı hatası');
      setProxyDurum('hata');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    veriCek();
    pollRef.current = setInterval(veriCek, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [veriCek]);

  useEffect(() => {
    setExpKontrolListesi(loadF058KontrolList());
  }, []);

  useEffect(() => {
    fetch('/api/kur-sicaklik-export')
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          hasDocx?: boolean;
          hasDocOnly?: boolean;
          docxFileName?: string | null;
          docxCandidates?: string[];
          errorHint?: string | null;
          repoRoot?: string;
        }) => {
          if (j.ok) {
            const cands = Array.isArray(j.docxCandidates) ? j.docxCandidates : [];
            setF058Tpl({
              hasDocx: !!j.hasDocx,
              hasDocOnly: !!j.hasDocOnly,
              docxFileName: j.docxFileName ?? null,
              docxCandidates: cands,
              errorHint: j.errorHint ?? null,
              repoRoot: j.repoRoot ?? null,
            });
            const def = j.docxFileName && cands.includes(j.docxFileName) ? j.docxFileName : cands[0] ?? '';
            if (def) setExpTemplateFile(def);
          }
        }
      )
      .catch(() => setF058Tpl(null));
  }, []);

  const proxyBadgeColor =
    proxyDurum === 'ok'
      ? 'var(--grn)'
      : proxyDurum === 'hata'
      ? 'var(--red)'
      : 'var(--amb)';
  const proxyBadgeBg =
    proxyDurum === 'ok'
      ? 'var(--grn-d)'
      : proxyDurum === 'hata'
      ? 'rgba(239,68,68,.12)'
      : 'rgba(251,191,36,.1)';
  const proxyLabel =
    proxyDurum === 'ok'
      ? telemetryUyari
        ? 'Sunucu yanıtı alındı · telemetri eksik'
        : 'EBİSTR Sync bağlı'
      : proxyDurum === 'hata'
      ? 'EBİSTR Sync bağlanamıyor'
      : 'Kontrol ediliyor...';

  const kurFormuWordIndir = async () => {
    if (!f058Tpl?.hasDocx) {
      const msg = f058Tpl?.errorHint || 'Önce kök dizine F058 .docx şablonunu ekleyin.';
      setExpHata(msg);
      (window as { toast?: (m: string, t?: string) => void }).toast?.(msg, 'error');
      return;
    }
    setExpHata(null);
    setExpYukleniyor(true);
    try {
      const readings: KurTelReading[] = [];
      for (const h of havuzlar) {
        const no: '1' | '2' = h.id === 'havuz2' ? '2' : '1';
        for (const g of h.gecmis) {
          if (g.zaman && Number.isFinite(g.sicaklik)) {
            readings.push({ havuz: no, zaman: g.zaman, sicaklik: g.sicaklik });
          }
        }
        if (h.zaman && h.sicaklik != null && Number.isFinite(h.sicaklik)) {
          readings.push({ havuz: no, zaman: h.zaman, sicaklik: h.sicaklik });
        }
      }
      const intervalHours = parseFloat(expSaat);
      if (!Number.isFinite(intervalHours)) throw new Error('Geçerli bir aralık seçin.');
      const payload: Record<string, unknown> = {
        templateFileName: expTemplateFile || undefined,
        dateFrom: expBas,
        dateTo: expBit,
        intervalHours,
        jitter: expJitter,
        readings,
        kontrolEden: expKontrolEden.trim(),
        havuzMode: expHavuzMod,
        slotBaslangicSaati: expSlotBaslangic || undefined,
      };
      if (expFormTarih.trim()) payload.formTarihi = expFormTarih.trim().slice(0, 10);
      if (expFormSaat.trim()) payload.formSaati = expFormSaat.trim().slice(0, 5);

      const res = await fetch('/api/kur-sicaklik-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      const cd = res.headers.get('Content-Disposition');
      let downloadName = `F058-doldurulmus-${expBas}_${expBit}.docx`;
      const star = cd?.match(/filename\*=UTF-8''([^;]+)/i);
      if (star) {
        try {
          downloadName = decodeURIComponent(star[1].trim());
        } catch {
          /* ignore */
        }
      } else {
        const quoted = cd?.match(/filename="([^"]+)"/i);
        if (quoted) downloadName = quoted[1];
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      (window as { toast?: (m: string, t?: string) => void }).toast?.('Word dosyası indirildi', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'İndirilemedi';
      setExpHata(msg);
      (window as { toast?: (m: string, t?: string) => void }).toast?.(msg, 'error');
    } finally {
      setExpYukleniyor(false);
    }
  };

  return (
    <>
      <div style={{ padding: '0 24px 40px' }}>
        {/* Page header */}
        <div className="ph" style={{ marginBottom: '16px' }}>
          <h1>Telemetri İzleme</h1>
          <p>Kür havuzu sıcaklıkları — anlık alarm takibi (18–22°C)</p>
        </div>

        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {/* Proxy badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: proxyBadgeBg,
            border: `1px solid ${proxyBadgeColor}44`,
            borderRadius: '8px', padding: '5px 12px', fontSize: '12px',
            color: proxyBadgeColor, fontWeight: 600,
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: proxyBadgeColor, display: 'inline-block', flexShrink: 0 }} />
            {proxyLabel}
          </div>

          {/* Son guncelleme */}
          {sonGuncelleme && (
            <span style={{ fontSize: '12px', color: 'var(--tx3)' }}>
              Son Güncelleme: {formatTarihSaat(sonGuncelleme)}
            </span>
          )}

          {/* Error */}
          {hata && (
            <span style={{ fontSize: '11px', color: 'var(--red)', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', padding: '4px 12px', borderRadius: '7px' }}>
              {hata}
            </span>
          )}
          {telemetryUyari && !hata && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--amb)',
                background: 'rgba(251,191,36,.1)',
                border: '1px solid rgba(251,191,36,.35)',
                padding: '4px 12px',
                borderRadius: '7px',
                maxWidth: '520px',
                lineHeight: 1.45,
              }}
            >
              {telemetryUyari}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Refresh button */}
          <button
            className="btn btn-o"
            style={{ fontSize: '12px', height: '34px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={veriCek}
            disabled={yukleniyor}
          >
            {yukleniyor ? '...' : '↻'} Şimdi Güncelle
          </button>
          <button
            type="button"
            className="btn btn-g"
            style={{ fontSize: '11px', height: '34px' }}
            title="Firestore’daki ortak sıcaklık geçmişini siler"
            onClick={() => {
              void clearTelGecmisStorage().then(() => veriCek());
            }}
          >
            Geçmişi sıfırla
          </button>
        </div>

        {/* F058 Word export */}
        <div
          style={{
            background: 'var(--sur)',
            border: '1px solid var(--bdr)',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
            F058 — Kür tankı / havuzu su sıcaklığı (resmi Word şablonu)
          </div>
          {f058Tpl?.hasDocx ? (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--grn)',
                marginBottom: '10px',
                padding: '8px 10px',
                background: 'var(--grn-d)',
                borderRadius: '8px',
                border: '1px solid rgba(34,197,94,.25)',
              }}
            >
              Şablon (yalnızca proje kökü):{' '}
              <strong style={{ color: 'var(--tx)' }}>{f058Tpl.docxFileName}</strong>
              {f058Tpl.repoRoot ? (
                <>
                  {' '}
                  <span style={{ color: 'var(--tx3)', fontWeight: 400 }}>
                    — klasör: {f058Tpl.repoRoot}
                  </span>
                </>
              ) : null}
              <div style={{ marginTop: '6px', fontWeight: 500 }}>
                İndirilen dosya, bu .docx dosyasının üzerine veri yazılmasıyla oluşur; ayrı bir “sistem şablonu” yoktur.
              </div>
            </div>
          ) : f058Tpl ? (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--tx2)',
                marginBottom: '10px',
                padding: '10px 12px',
                background: 'rgba(251,191,36,.08)',
                borderRadius: '8px',
                border: '1px solid rgba(251,191,36,.35)',
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: 'var(--amb)' }}>Şablon eksik veya yalnızca .doc</strong>
              <div style={{ marginTop: '6px' }}>{f058Tpl.errorHint}</div>
              <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--tx3)' }}>
                Yer tutucu listesi: depodaki <code style={{ fontSize: '10px' }}>web/data/f058-yer-tutucular.txt</code>
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: '11px', color: 'var(--tx3)', marginBottom: '14px', lineHeight: 1.5 }}>
            Tarih aralığı ve ölçüm sıklığını seçin; sıcaklıklar sunucu telemetrisi + bu sayfadaki geçmiş ile en yakın
            okumaya göre yazılır. Zaman satırları isteğe bağlı olarak birkaç dakika kaydırılır (doğal saatler).
            Şablonda <code style={{ fontSize: '10px' }}>{'{kontrolEden}'}</code>,{' '}
            <code style={{ fontSize: '10px' }}>{'{havuzNo}'}</code>,{' '}
            <code style={{ fontSize: '10px' }}>{'{formTarihi}'}</code>,{' '}
            <code style={{ fontSize: '10px' }}>{'{formSaati}'}</code> yer tutucularını kullanabilirsiniz (imza dışı
            alanlar).
          </div>
          {f058Tpl?.hasDocx && f058Tpl.docxCandidates.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '220px', flex: '1 1 200px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Word şablonu
                </label>
                <select
                  value={expTemplateFile}
                  onChange={(e) => setExpTemplateFile(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--bdr)',
                    background: 'var(--sur2)',
                    color: 'var(--tx)',
                    fontSize: '12px',
                  }}
                >
                  {f058Tpl.docxCandidates.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 260px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Kontrol eden
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    list="f058-kontrol-datalist"
                    value={expKontrolEden}
                    onChange={(e) => setExpKontrolEden(e.target.value)}
                    placeholder="Ad soyad"
                    style={{
                      flex: '1 1 160px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--bdr)',
                      background: 'var(--sur2)',
                      color: 'var(--tx)',
                      fontSize: '12px',
                    }}
                  />
                  <datalist id="f058-kontrol-datalist">
                    {expKontrolListesi.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className="btn btn-o"
                    style={{ fontSize: '11px', height: '32px', whiteSpace: 'nowrap' }}
                    disabled={!expKontrolEden.trim()}
                    onClick={() => {
                      const v = expKontrolEden.trim();
                      if (!v) return;
                      const next = [v, ...expKontrolListesi.filter((x) => x !== v)].slice(0, 40);
                      setExpKontrolListesi(next);
                      saveF058KontrolList(next);
                    }}
                  >
                    Listeye kaydet
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {f058Tpl?.hasDocx ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Tabloda doldurulacak havuz
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--tx2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="f058-havuz"
                      checked={expHavuzMod === 'both'}
                      onChange={() => setExpHavuzMod('both')}
                    />
                    Her iki sütun (H1 + H2)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="f058-havuz"
                      checked={expHavuzMod === '1'}
                      onChange={() => setExpHavuzMod('1')}
                    />
                    Yalnız havuz 1
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="f058-havuz"
                      checked={expHavuzMod === '2'}
                      onChange={() => setExpHavuzMod('2')}
                    />
                    Yalnız havuz 2
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  İlk satır başlangıç saati
                </label>
                <input
                  type="time"
                  value={expSlotBaslangic}
                  onChange={(e) => setExpSlotBaslangic(e.target.value || '08:00')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--bdr)',
                    background: 'var(--sur2)',
                    color: 'var(--tx)',
                    fontSize: '12px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Form tarihi (opsiyonel)
                </label>
                <input
                  type="date"
                  value={expFormTarih}
                  onChange={(e) => setExpFormTarih(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--bdr)',
                    background: 'var(--sur2)',
                    color: 'var(--tx)',
                    fontSize: '12px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Form saati (opsiyonel)
                </label>
                <input
                  type="time"
                  value={expFormSaat}
                  onChange={(e) => setExpFormSaat(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--bdr)',
                    background: 'var(--sur2)',
                    color: 'var(--tx)',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                Başlangıç
              </label>
              <input
                type="date"
                value={expBas}
                onChange={(e) => setExpBas(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--bdr)',
                  background: 'var(--sur2)',
                  color: 'var(--tx)',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                Bitiş
              </label>
              <input
                type="date"
                value={expBit}
                onChange={(e) => setExpBit(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--bdr)',
                  background: 'var(--sur2)',
                  color: 'var(--tx)',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                Kaç saatte bir satır
              </label>
              <select
                value={expSaat}
                onChange={(e) => setExpSaat(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--bdr)',
                  background: 'var(--sur2)',
                  color: 'var(--tx)',
                  fontSize: '12px',
                  minWidth: '140px',
                }}
              >
                <option value="0.5">30 dakika</option>
                <option value="1">1 saat</option>
                <option value="1.5">1,5 saat</option>
                <option value="2">2 saat</option>
                <option value="3">3 saat</option>
                <option value="4">4 saat</option>
                <option value="6">6 saat</option>
                <option value="8">8 saat</option>
                <option value="12">12 saat</option>
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--tx2)',
                cursor: 'pointer',
                userSelect: 'none',
                paddingBottom: '2px',
              }}
            >
              <input
                type="checkbox"
                checked={expJitter}
                onChange={(e) => setExpJitter(e.target.checked)}
                style={{ accentColor: 'var(--acc)' }}
              />
              Dakikaları doğal dağıt (±23 dk)
            </label>
            <div style={{ flex: 1, minWidth: '8px' }} />
            <button
              type="button"
              className="btn btn-p"
              style={{ fontSize: '12px', height: '36px', padding: '0 18px' }}
              disabled={expYukleniyor || !f058Tpl?.hasDocx}
              onClick={kurFormuWordIndir}
            >
              {expYukleniyor ? 'Hazırlanıyor…' : 'Resmi şablonu doldur (.docx)'}
            </button>
          </div>
          {expHata && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--red)' }}>{expHata}</div>
          )}
        </div>

        {/* Proxy connection error notice */}
        {proxyDurum === 'hata' && (
          <div style={{
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
            borderRadius: '12px', padding: '16px 20px', marginBottom: '20px',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '13px', marginBottom: '6px' }}>
              EBİSTR veri servisi yanıt vermiyor
            </div>
            <div style={{ fontSize: '12px', color: 'var(--tx3)', lineHeight: 1.7 }}>
              Kür havuzu verisi alınamadı. Sunucu çalışıyor olsa da geçici bir sorun olabilir.<br />
              <strong style={{ color: 'var(--tx2)' }}>Yapılacaklar:</strong> Sayfayı yenileyin; sorun devam ederse EBİSTR oturumunu kontrol edin ve token yenileyin.
            </div>
          </div>
        )}

        {/* Havuz cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {havuzlar.map((h) => {
            const isAlarm = h.durum === 'alarm';
            const isBekleniyor = h.durum === 'bekleniyor';
            const cardBorderLeft = isAlarm ? '3px solid var(--red)' : isBekleniyor ? '3px solid var(--tx3)' : '3px solid var(--grn)';
            const tempColor = isAlarm ? 'var(--red)' : isBekleniyor ? 'var(--tx3)' : 'var(--grn)';
            const badgeBg = isAlarm ? 'rgba(239,68,68,.12)' : isBekleniyor ? 'var(--sur2)' : 'var(--grn-d)';
            const badgeColor = isAlarm ? 'var(--red)' : isBekleniyor ? 'var(--tx3)' : 'var(--grn)';
            const badgeText = isAlarm ? 'ALARM' : isBekleniyor ? 'Bekleniyor' : 'Normal';

            return (
              <div key={h.id} style={{
                background: 'var(--sur)',
                border: `1px solid ${isAlarm ? 'rgba(239,68,68,.35)' : 'var(--bdr)'}`,
                borderLeft: cardBorderLeft,
                borderRadius: '14px',
                padding: '22px 22px 20px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Alarm shimmer top bar */}
                {isAlarm && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                    background: 'linear-gradient(90deg, transparent, var(--red), transparent)',
                    animation: 'tel-shimmer 2s infinite',
                  }} />
                )}

                {/* Card title row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {h.ad}
                  </div>
                  {/* Status badge */}
                  <div style={{
                    background: badgeBg,
                    color: badgeColor,
                    borderRadius: '6px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: `1px solid ${badgeColor}44`,
                  }}>
                    {badgeText}
                  </div>
                </div>

                {/* Temperature big display */}
                <div style={{ fontSize: '56px', fontWeight: 800, fontFamily: 'var(--fm)', color: tempColor, lineHeight: 1, marginBottom: '4px', letterSpacing: '-2px' }}>
                  {h.sicaklik !== null ? h.sicaklik.toFixed(1) : '—'}
                  <span style={{ fontSize: '20px', fontWeight: 400, color: 'var(--tx3)', marginLeft: '4px' }}>°C</span>
                </div>

                {/* Range indicator */}
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginBottom: '14px' }}>
                  Hedef aralık: {SINIR.alt}°C — {SINIR.ust}°C
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {h.batarya !== null && (
                    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                      <span style={{ color: h.batarya < 20 ? 'var(--red)' : h.batarya < 50 ? 'var(--amb)' : 'var(--grn)', fontWeight: 700 }}>
                        {h.batarya.toFixed(0)}%
                      </span>
                      {' '}batarya
                    </div>
                  )}
                  {h.zaman && (
                    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                      Son okuma: <span style={{ color: 'var(--tx2)' }}>{formatZaman(h.zaman)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: '12px', color: 'var(--tx3)', marginBottom: '12px', lineHeight: 1.5 }}>
          EBİSTR genelde <strong style={{ color: 'var(--tx2)' }}>anlık tek ölçüm</strong> döndürür; üstteki büyük rakam bunun içindir.
          Aşağıdaki liste, her yenilemede gelen farklı zaman damgalarını <strong style={{ color: 'var(--tx2)' }}>lab ortamında (Firestore)</strong> birleştirir; havuz başına en fazla {TEL_GECMIS_MAX_PER_POOL} kayıt saklanır.
        </p>

        {/* History section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {havuzlar.map((h) => (
            <div key={`${h.id}-gecmis`} style={{
              background: 'var(--sur)',
              border: '1px solid var(--bdr)',
              borderRadius: '12px',
              padding: '16px 18px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '12px' }}>
                {h.ad} — Son okumalar ({h.gecmis.length})
              </div>

              {h.gecmis.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--tx3)', textAlign: 'center', padding: '12px 0' }}>Veri yok</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', color: 'var(--tx3)', fontWeight: 600, paddingBottom: '6px', borderBottom: '1px solid var(--bdr)', paddingRight: '12px' }}>Saat</th>
                      <th style={{ textAlign: 'right', color: 'var(--tx3)', fontWeight: 600, paddingBottom: '6px', borderBottom: '1px solid var(--bdr)' }}>Sıcaklık</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.gecmis.map((g, i) => {
                      const isOut = g.sicaklik < SINIR.alt || g.sicaklik > SINIR.ust;
                      return (
                        <tr key={i}>
                          <td style={{ padding: '5px 12px 5px 0', color: 'var(--tx3)', borderBottom: '1px solid var(--bdr)22' }}>
                            {formatZaman(g.zaman)}
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right', color: isOut ? 'var(--red)' : 'var(--grn)', fontWeight: 700, borderBottom: '1px solid var(--bdr)22' }}>
                            {g.sicaklik.toFixed(1)}°C
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tel-shimmer {
          0%   { opacity: 0.4; }
          50%  { opacity: 1;   }
          100% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
