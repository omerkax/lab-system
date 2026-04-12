'use client';
import { useEffect, useRef } from 'react';
import { DEFAULT_ADMIN_ROLE, readLabSession, roleAllowsModuleEdit } from '@/lib/lab-auth';
import { isLikelyAdaParsel, numuneMatchesYibfQuery } from '@/lib/yibf-utils';
import { createRaporDefterYibfLookup } from '@/lib/rapor-defter-lookup';
import { parseRaporDateToIso } from '@/lib/rapor-date';
import { fetchRaporDefteriWithFallback } from '@/lib/rapor-defteri-remote';
import { ebistrNumuneRowKey } from '@/lib/ebistr-numune-key';
import {
  belgeHintsFromRapor,
  chipYeterlilikForNumune,
  findChipRowForMuteahhit,
  type ChipRowLite,
} from '@/lib/chip-muteahhit-match';
import {
  KAROT_ALT,
  NUMUNE_TURLERI,
  type NumuneTurKey,
  betonRowAssignedToPersonelAd,
  localDateISO,
  numuneTurOf,
  personelListesi,
} from '@/lib/numune-shared';

/** EBİSTR satırındaki açık numune adedi (yoksa 0). */
function ebistrSatirAcikAdet(n: any): number {
  const v = Number(n.toplamSayisi ?? n.numuneSayisi ?? n.adet ?? n.numuneAdedi ?? n.sampleCount);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(500, Math.round(v));
}

/**
 * Döküm satırı için "alındı" adedi: ham satır sayısı değil, fiziksel numune.
 * - API’de numuneSayisi/adet doluysa satırlar toplanır (boş satırlar 1 sayılır).
 * - Kürleme ekranı gibi: BRN kırımdan önce boş olur; sayımda BRN kullanılmaz.
 *   Gruplama: alınış günü (dökümle eşleşen gün zaten filtrede) + alınış zamanı + irsaliye + yapı elemanı + sınıf + m³ + boyut.
 * - EBİSTR’deki satır / adet toplamı ile uyum: her EBİSTR satırı ayrı sayılır (eski “çift mükerrer 8→4” yarımlama kaldırıldı).
 */
function ebistrDahilNumuneAdet(dahil: any[]): number {
  if (!dahil.length) return 0;

  const anyExplicit = dahil.some((n: any) => ebistrSatirAcikAdet(n) > 0);
  if (anyExplicit) {
    return dahil.reduce((s: number, n: any) => s + (ebistrSatirAcikAdet(n) || 1), 0);
  }

  const grupAnahtar = (n: any) => {
    const gun = numuneAlinisGunFromRaw(n.takeDate ?? n.alinisZamani ?? n.alinisDate ?? n.tarih) || '';
    return [
      gun,
      String(n.takeDate ?? '').trim(),
      String(n.irsaliye ?? '').trim(),
      String(n.yapiElem ?? n.yapiBolumu ?? '').trim(),
      String(n.betonSinifi ?? '').trim(),
      String(n.m3 ?? ''),
      String(n.numuneBoyutu ?? ''),
    ].join('\x1e');
  };

  type GrupMeta = { c: number };
  const grupMeta = new Map<string, GrupMeta>();
  for (const n of dahil) {
    const k = grupAnahtar(n);
    let m = grupMeta.get(k);
    if (!m) {
      m = { c: 0 };
      grupMeta.set(k, m);
    }
    m.c += 1;
  }

  let total = 0;
  for (const { c } of grupMeta.values()) {
    total += c;
  }
  return total;
}

const DURUMLAR = [
  { key: 'bekliyor',     label: 'Bekliyor',      emoji: '⏳', color: 'var(--tx3)' },
  { key: 'pompa_yolda',  label: 'Pompa Yolda',   emoji: '🚚', color: 'var(--amb)' },
  { key: 'pompa_geldi',  label: 'Pompa Geldi',   emoji: '✅', color: 'var(--acc2)' },
  { key: 'mikser_geldi', label: 'Mikser Geldi',  emoji: '🚛', color: '#a78bfa' },
  { key: 'tamamlandi',   label: 'Tamamlandı',    emoji: '🏁', color: 'var(--grn)' },
  { key: 'iptal',        label: 'İptal',         emoji: '⛔', color: 'var(--tx3)' },
];

const DURUM_AKIS = DURUMLAR.filter(d => d.key !== 'iptal');

/** Tablo sayfalama — EBİSTR hücre başına maliyet yüksek, satır sayısını sınırla */
const BETON_LIST_PAGE_SIZE = 25;

function filterByTur(data: any[], tab: string): any[] {
  if (!tab || tab === 'tumu') return data;
  return data.filter(d => numuneTurOf(d) === tab);
}

const HTML = `
<div class="ph" style="margin-bottom:16px">
  <h1>🧪 Numune Programı</h1>
  <p>Beton, karot, çelik ve diğer numuneler — takvim, EBİSTR eşlemesi (beton) ve personel</p>
  <p style="font-size:12px;color:var(--tx3);margin-top:10px;line-height:1.45">
    <a href="/beton/ozet" style="color:var(--acc2);font-weight:600;text-decoration:none">📊 Detaylı özet ve istatistikler</a>
    <span style="opacity:.75"> — tarih aralığı, günlük / personel / tür kırılımı</span>
  </p>
</div>

<div class="numune-tur-tabs" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center">
  <button type="button" class="ebistr-fbtn numune-tur-tab on" data-tur="tumu" onclick="betonTurSekme('tumu')">📑 Tümü <span class="numune-tab-cnt" style="margin-left:4px;opacity:.75;font-weight:800;font-variant-numeric:tabular-nums">0</span></button>
  <button type="button" class="ebistr-fbtn numune-tur-tab" data-tur="beton" onclick="betonTurSekme('beton')">🏗️ Beton <span class="numune-tab-cnt" style="margin-left:4px;opacity:.75;font-weight:800;font-variant-numeric:tabular-nums">0</span></button>
  <button type="button" class="ebistr-fbtn numune-tur-tab" data-tur="karot" onclick="betonTurSekme('karot')">🧱 Karot <span class="numune-tab-cnt" style="margin-left:4px;opacity:.75;font-weight:800;font-variant-numeric:tabular-nums">0</span></button>
  <button type="button" class="ebistr-fbtn numune-tur-tab" data-tur="celik" onclick="betonTurSekme('celik')">🔩 Çelik <span class="numune-tab-cnt" style="margin-left:4px;opacity:.75;font-weight:800;font-variant-numeric:tabular-nums">0</span></button>
  <button type="button" class="ebistr-fbtn numune-tur-tab" data-tur="diger" onclick="betonTurSekme('diger')">📋 Diğer <span class="numune-tab-cnt" style="margin-left:4px;opacity:.75;font-weight:800;font-variant-numeric:tabular-nums">0</span></button>
</div>

<!-- Form -->
<div class="card beton-form-card" id="beton-form-card" style="margin-bottom:16px">
  <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:14px" id="beton-form-baslik">Yeni kayıt</div>
  <input type="hidden" id="beton-edit-id">
  <div class="beton-form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:flex-end">
    <div class="fld">
      <label>Numune türü</label>
      <select id="beton-numune-tur" onchange="betonNumuneTurFormChange()">
        <option value="beton">🏗️ Beton</option>
        <option value="karot">🧱 Karot</option>
        <option value="celik">🔩 Çelik</option>
        <option value="diger">📋 Diğer</option>
      </select>
    </div>
    <div class="fld" id="beton-karot-alt-wrap" style="display:none">
      <label>Karot alt tür</label>
      <select id="beton-karot-alt">
        <option value="genel">Genel</option>
        <option value="kentsel">Kentsel dönüşüm</option>
        <option value="performans">Performans</option>
      </select>
    </div>
    <div class="fld">
      <label>Ne alındı? <span style="opacity:.55;font-weight:500">(opsiyonel)</span></label>
      <input id="beton-numune-etiket" placeholder="Örn. 28g basınç, çekme, kaynak...">
    </div>
    <div class="fld">
      <label>YİBF No</label>
      <input id="beton-yibf" placeholder="YİBF numarası" oninput="betonYibfOtoFill(this.value)">
    </div>
    <div class="fld"><label>Yapı Sahibi</label><input id="beton-sahip" placeholder="Otomatik dolar..."></div>
    <div class="fld"><label>Yapı Denetim</label><input id="beton-yd" placeholder="Otomatik dolar..."></div>
    <div class="fld"><label>Plan tarihi</label><input type="date" id="beton-tarih"></div>
    <div class="fld"><label>Saat <span style="opacity:.55;font-weight:500">(opsiyonel)</span></label><input type="time" id="beton-saat" placeholder="—"></div>
    <div class="fld"><label>Yapı Bölümü</label><input id="beton-bolum" placeholder="Temel, Kolon, Döşeme..."></div>
    <div class="fld"><label>Blok</label><input id="beton-blok" placeholder="A, B, 1..."></div>
    <div id="beton-only-fields" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;grid-column:1/-1;align-items:flex-end">
      <div class="fld"><label>Beton firması</label><input id="beton-firma" placeholder="Otomatik veya girin..."></div>
      <div class="fld"><label>m³</label><input type="number" id="beton-m3" placeholder="0" min="0" step="0.5"></div>
      <div class="fld"><label>Planlanan numune adedi</label><input type="number" id="beton-adet" placeholder="0" min="0"></div>
    </div>
    <div class="fld" style="grid-column:1/-1">
      <label>Görevli personel <span style="opacity:.55;font-weight:500">(birden fazla ekleyebilirsiniz)</span></label>
      <div id="beton-personel-wrap" class="beton-personel-wrap"></div>
      <button type="button" class="btn btn-o" style="margin-top:8px;font-size:11px;padding:6px 12px" onclick="betonPersonelSatiriEkle()">+ Kişi ekle</button>
    </div>
    <div class="fld"><label>Not</label><input id="beton-not" placeholder="Ek bilgi..."></div>
    <div class="beton-form-actions" style="display:flex;gap:8px;align-items:flex-end;padding-bottom:10px">
      <button class="btn btn-p" onclick="betonKaydet()" style="flex:1;height:42px">Kaydet</button>
      <button class="btn btn-o" onclick="betonFormTemizle()" style="height:42px">Temizle</button>
    </div>
  </div>
</div>

<!-- Filtreler -->
<div class="beton-toolbar">
  <button class="ebistr-fbtn on" id="bf-hepsi" title="Bugünden geriye 7 gün" onclick="betonFiltre('hepsi')">📋 Son 7 gün</button>
  <button class="ebistr-fbtn"    id="bf-bugun"   onclick="betonFiltre('bugun')">🎯 Bugün</button>
  <button class="ebistr-fbtn"    id="bf-yarin"   onclick="betonFiltre('yarin')">📆 Yarın</button>
  <button class="ebistr-fbtn"    id="bf-hafta"   onclick="betonFiltre('hafta')">📅 Bu Hafta</button>
  <input type="date" id="bf-tarih" class="ebistr-adv-input" style="padding:5px 10px;font-size:12px;border-radius:8px" onchange="if(this.value)betonFiltre(this.value)">
  <div style="flex:1"></div>
  <span id="beton-cnt" class="beton-cnt" style="font-size:11px;color:var(--tx3)"></span>
</div>

<!-- Liste + sayfalama -->
<div id="beton-liste-wrap">
  <div id="beton-liste" style="display:flex;flex-direction:column;gap:0">
    <div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">Yükleniyor...</div>
  </div>
  <div id="beton-pager" class="beton-pager" style="display:none;margin-top:14px;padding:12px 14px;border:1px solid var(--bdr);border-radius:12px;background:var(--sur2);align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"></div>
</div>
`;

async function resolveBetonReadonlyFlags(): Promise<void> {
  const w = window as any;
  w.__BETON_READONLY_MODE = false;
  w.__BETON_SELF_FILTER = false;
  w.__BETON_LINKED_PERSONEL_AD = '';
  const s = readLabSession();
  if (!s?.userId || typeof w.fsGet !== 'function') return;
  try {
    const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
    const roles: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
    const rm: Record<string, any> = {};
    roles.forEach((r: any) => {
      if (r?.id) rm[r.id] = r;
    });
    const u = users.find((x: any) => String(x.id) === s.userId);
    const role = u ? rm[u.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : null;
    const pid = String(s.personelId || u?.personelId || '').trim();
    if (pid) {
      const staff: any[] = (await w.fsGet('hr_personnel').catch(() => [])) || [];
      const me = staff.find((x: any) => String(x.id) === String(pid));
      w.__BETON_SELF_FILTER = true;
      if (me?.ad) w.__BETON_LINKED_PERSONEL_AD = String(me.ad).trim();
      w.__BETON_READONLY_MODE = true;
    } else {
      w.__BETON_READONLY_MODE = s.readOnly === true || !roleAllowsModuleEdit(role, 'numune');
    }
  } catch {
    w.__BETON_READONLY_MODE = false;
    w.__BETON_SELF_FILTER = false;
    w.__BETON_LINKED_PERSONEL_AD = '';
  }
}

export default function BetonPage() {
  const init = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shellRef.current;
    if (el && !el.querySelector('#beton-liste')) {
      el.innerHTML = HTML;
    }
    const boot = async () => {
      await resolveBetonReadonlyFlags();
      const check = () => {
        if (typeof (window as any).fsGet === 'function') {
          if (!init.current) {
            init.current = true;
            betonPageInit();
          }
        } else setTimeout(check, 100);
      };
      check();
    };
    void boot();
  }, []);

  return <div ref={shellRef} className="beton-page" suppressHydrationWarning />;
}

/** Ertele modalı body'de — fixed overlay üst katmanda kalsın (iç içe stacking bug'ı olmasın) */
function ensureBetonErteleModal(w: any) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('beton-ertele-mbg')) return;
  const mbg = document.createElement('div');
  mbg.id = 'beton-ertele-mbg';
  mbg.className = 'mbg';
  mbg.setAttribute('aria-hidden', 'true');
  mbg.innerHTML = `
    <div class="modal" style="max-width:400px" role="dialog" aria-labelledby="beton-ertele-title">
      <div class="ch" id="beton-ertele-title">Kaydı ertele</div>
      <p style="font-size:12px;color:var(--tx3);margin:0 0 10px;line-height:1.45">Hangi güne erteleneceğini seçin. Kayıt o tarihe taşınır; saat ve diğer bilgiler aynı kalır.</p>
      <label for="beton-ertele-input" style="display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--tx3);margin-bottom:6px;font-weight:700">Yeni tarih</label>
      <input type="date" id="beton-ertele-input" class="pi" style="width:100%;margin-bottom:16px">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-o" id="beton-ertele-btn-vaz">Vazgeç</button>
        <button type="button" class="btn btn-p" id="beton-ertele-btn-kay">Tarihe taşı</button>
      </div>
    </div>`;
  document.body.appendChild(mbg);
  const modal = mbg.querySelector('.modal');
  mbg.addEventListener('click', (e: Event) => {
    if (e.target === mbg) w.betonErteleKapat();
  });
  modal?.addEventListener('click', (e: Event) => e.stopPropagation());
  document.getElementById('beton-ertele-btn-vaz')?.addEventListener('click', () => w.betonErteleKapat());
  document.getElementById('beton-ertele-btn-kay')?.addEventListener('click', () => w.betonErteleKaydet());
}

function ensureBetonPersonelModal(w: any) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('beton-per-mbg')) return;
  const mbg = document.createElement('div');
  mbg.id = 'beton-per-mbg';
  mbg.className = 'mbg';
  mbg.setAttribute('aria-hidden', 'true');
  mbg.innerHTML = `
    <div class="modal" style="max-width:440px" role="dialog" aria-labelledby="beton-per-title">
      <div class="ch" id="beton-per-title">Görevli personel</div>
      <p style="font-size:12px;color:var(--tx3);margin:0 0 12px;line-height:1.45">Aynı numune kaydında birden fazla kişi seçebilirsiniz.</p>
      <div id="beton-per-modal-wrap" class="beton-personel-wrap"></div>
      <button type="button" class="btn btn-o" style="margin-top:10px;font-size:11px;padding:6px 12px" onclick="betonPersonelModalSatiriEkle()">+ Kişi ekle</button>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button type="button" class="btn btn-o" onclick="betonPersonelModalKapat()">Vazgeç</button>
        <button type="button" class="btn btn-p" onclick="betonPersonelModalKaydet()">Kaydet</button>
      </div>
    </div>`;
  document.body.appendChild(mbg);
  const modal = mbg.querySelector('.modal');
  mbg.addEventListener('click', (e: Event) => {
    if (e.target === mbg) w.betonPersonelModalKapat();
  });
  modal?.addEventListener('click', (e: Event) => e.stopPropagation());
}

async function betonPageInit() {
  const w = window as any;

  // Default today's date
  const todayInp = document.getElementById('beton-tarih') as HTMLInputElement;
  if (todayInp && !todayInp.value) todayInp.value = new Date().toISOString().slice(0, 10);

  // onclick handler'ları await'lerden ÖNCE (awaitSync uzun sürerken tıklanabiliyor)
  const doAutoFill = (yibf: string) => {
    const trimmed = yibf.trim();
    if (!trimmed) return;
    const set = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el && !el.value && val) el.value = val;
    };
    if (w.raporDefterYibfBilgi) {
      const info = w.raporDefterYibfBilgi(trimmed);
      if (info) {
        set('beton-sahip', info.yapiSahibi || '');
        set('beton-yd', info.yapiDenetim || '');
        if (info.betonFirmasi) set('beton-firma', info.betonFirmasi);
        // Yapı bölümü döküme özel girilir; rapordan doldurulmaz
        if (info.blok) set('beton-blok', info.blok);
      }
    }
    const numuneler: any[] = betonEbistrNumuneListesi(w);
    const ilgiliNumune = numuneler.find((n: any) => numuneMatchesYibfQuery(n, trimmed));
    if (ilgiliNumune) {
      if (ilgiliNumune.betonFirmasi) set('beton-firma', ilgiliNumune.betonFirmasi);
      set('beton-sahip', ilgiliNumune.yapiSahibi || '');
      set('beton-yd', ilgiliNumune.yapiDenetim || '');
    }
  };

  w.betonYibfOtoFill = (yibf: string) => {
    if (!yibf || yibf.length < 3) return;
    if (!w.raporDefterYibfBilgi && !w._betonRaporLoaded) {
      fetchRaporDefteriWithFallback(window)
        .then(({ rows, map }) => {
          w._raporRows = rows;
          w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
          w._betonRaporLoaded = true;
          doAutoFill(yibf);
        })
        .catch(() => {
          w._betonRaporLoaded = true;
          doAutoFill(yibf);
        });
      return;
    }
    doAutoFill(yibf);
  };

  w.betonKaydet = async () => {
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value?.trim() || '';
    const yibf = g('beton-yibf');
    const tarih = g('beton-tarih');
    const editId = g('beton-edit-id');
    if (!tarih) {
      w.toast && w.toast('Plan tarihi zorunlu!', 'error');
      return;
    }
    const numuneTurRaw = (document.getElementById('beton-numune-tur') as HTMLSelectElement)?.value || 'beton';
    const numuneTur: NumuneTurKey =
      numuneTurRaw === 'karot' || numuneTurRaw === 'celik' || numuneTurRaw === 'diger' ? numuneTurRaw : 'beton';
    const karotAltSel = (document.getElementById('beton-karot-alt') as HTMLSelectElement)?.value || 'genel';
    const karotAlt = numuneTur === 'karot' ? karotAltSel : '';
    const id = editId || `beton-${Date.now()}`;
    const m3 = parseFloat(g('beton-m3')) || 0;
    const adet = parseInt(g('beton-adet')) || 0;
    const personelWrap = document.getElementById('beton-personel-wrap');
    const personeller = collectPersonellerFromWrap(personelWrap);
    const personel = personeller[0] || '';
    const data: Record<string, unknown> = {
      id,
      numuneTur,
      karotAlt,
      numuneEtiket: g('beton-numune-etiket'),
      yibf,
      yapiSahibi: g('beton-sahip'),
      yapiDenetim: g('beton-yd'),
      betonFirmasi: g('beton-firma'),
      tarih,
      saat: g('beton-saat'),
      bolum: g('beton-bolum'),
      blok: g('beton-blok'),
      m3,
      adet,
      personeller,
      personel,
      not: g('beton-not'),
      durum: 'bekliyor',
      statusLog: [{ durum: 'bekliyor', zaman: new Date().toISOString() }],
      olusturma: new Date().toISOString(),
    };
    if (editId) {
      const existing = (w._betonData || []).find((x: any) => x.id === editId);
      if (existing) {
        data.durum = existing.durum;
        data.statusLog = existing.statusLog;
        if (existing.olusturma) data.olusturma = existing.olusturma;
      }
    }
    await w.fsSet('beton_programi', id, data as any);
    const turLbl = NUMUNE_TURLERI.find(x => x.key === numuneTur)?.label || numuneTur;
    w.logAction && w.logAction('beton', `Numune kaydı (${turLbl}): ${yibf || 'YİBF yok'} ${tarih}`);
    w.toast && w.toast('Kaydedildi', 'success');
    w.betonFormTemizle();
    await betonListeYukle();
  };

  w.betonFormTemizle = () => {
    ['beton-edit-id', 'beton-yibf', 'beton-sahip', 'beton-yd', 'beton-firma', 'beton-bolum', 'beton-blok', 'beton-not', 'beton-m3', 'beton-adet', 'beton-numune-etiket'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) el.value = '';
    });
    const nt = document.getElementById('beton-numune-tur') as HTMLSelectElement;
    if (nt) nt.value = 'beton';
    const ka = document.getElementById('beton-karot-alt') as HTMLSelectElement;
    if (ka) ka.value = 'genel';
    w.betonNumuneTurFormChange?.();
    const tarih = document.getElementById('beton-tarih') as HTMLInputElement;
    if (tarih) tarih.value = new Date().toISOString().slice(0, 10);
    const saat = document.getElementById('beton-saat') as HTMLInputElement;
    if (saat) saat.value = '';
    betonPersonelWrapReset();
    const baslik = document.getElementById('beton-form-baslik');
    if (baslik) baslik.textContent = 'Yeni kayıt';
  };

  w.betonFiltre = (f: string) => {
    w._betonFiltre = f;
    w._betonListePage = 0;
    ['hepsi', 'bugun', 'yarin', 'hafta'].forEach(k => {
      const btn = document.getElementById('bf-' + k);
      if (btn) btn.className = 'ebistr-fbtn' + (k === f ? ' on' : '');
    });
    renderBetonListe(w._betonData || []);
  };
  w._betonFiltre = 'hepsi';
  w._betonListePage = 0;
  w.betonSayfaGit = (idx: number) => {
    w._betonListePage = Math.max(0, idx);
    renderBetonListe(w._betonData || []);
  };
  w._numuneTurTab = 'tumu';
  w.betonTurSekme = (k: string) => {
    w._numuneTurTab = k || 'tumu';
    w._betonListePage = 0;
    document.querySelectorAll('.numune-tur-tab').forEach(btn => {
      const b = btn as HTMLElement;
      b.classList.toggle('on', b.dataset.tur === w._numuneTurTab);
    });
    renderBetonListe(w._betonData || []);
  };
  w.betonNumuneTurFormChange = () => {
    const sel = document.getElementById('beton-numune-tur') as HTMLSelectElement;
    const tur = sel?.value || 'beton';
    const karWrap = document.getElementById('beton-karot-alt-wrap');
    if (karWrap) karWrap.style.display = tur === 'karot' ? '' : 'none';
    const bo = document.getElementById('beton-only-fields');
    if (bo) bo.style.display = tur === 'beton' ? 'grid' : 'none';
  };

  w._betonErteleId = null as string | null;
  w.betonErteleAc = (id: string) => {
    ensureBetonErteleModal(w);
    w._betonErteleId = id;
    const row = (w._betonData || []).find((x: any) => x.id === id);
    const mbg = document.getElementById('beton-ertele-mbg');
    const inp = document.getElementById('beton-ertele-input') as HTMLInputElement | null;
    const yarin = new Date();
    yarin.setDate(yarin.getDate() + 1);
    const yarinStr = yarin.toISOString().slice(0, 10);
    if (inp) {
      inp.value = (row?.tarih && /^\d{4}-\d{2}-\d{2}$/.test(row.tarih) ? row.tarih : '') || yarinStr;
    }
    mbg?.classList.add('on');
    mbg?.setAttribute('aria-hidden', 'false');
    setTimeout(() => inp?.focus(), 50);
  };
  w.betonErteleKapat = () => {
    w._betonErteleId = null;
    const mbg = document.getElementById('beton-ertele-mbg');
    mbg?.classList.remove('on');
    mbg?.setAttribute('aria-hidden', 'true');
  };
  w.betonErteleKaydet = async () => {
    const id = w._betonErteleId;
    const inp = document.getElementById('beton-ertele-input') as HTMLInputElement | null;
    const nt = inp?.value?.trim();
    if (!id || !nt) {
      w.toast && w.toast('Tarih seçin', 'error');
      return;
    }
    const data = (w._betonData || []).find((x: any) => x.id === id);
    if (!data) return;
    const onceki = data.tarih || '';
    if (onceki === nt) {
      w.betonErteleKapat();
      return;
    }
    const log = [
      ...(data.statusLog || []),
      { durum: data.durum, zaman: new Date().toISOString(), not: `Ertelendi: ${onceki || '—'} → ${nt}` },
    ];
    await w.fsSet('beton_programi', id, { ...data, tarih: nt, statusLog: log });
    w.toast && w.toast('Yeni tarihe taşındı', 'success');
    w.betonErteleKapat();
    await betonListeYukle();
  };
  w.betonIptal = async (id: string) => {
    if (!confirm('Bu kaydı iptal etmek istiyor musunuz?')) return;
    const data = (w._betonData || []).find((x: any) => x.id === id);
    if (!data) return;
    const log = [...(data.statusLog || []), { durum: 'iptal', zaman: new Date().toISOString() }];
    await w.fsSet('beton_programi', id, { ...data, durum: 'iptal', statusLog: log });
    w.toast && w.toast('İptal edildi', 'success');
    await betonListeYukle();
  };
  w.betonIptalGeri = async (id: string) => {
    const data = (w._betonData || []).find((x: any) => x.id === id);
    if (!data || data.durum !== 'iptal') return;
    const log = [...(data.statusLog || []), { durum: 'bekliyor', zaman: new Date().toISOString(), not: 'İptal geri alındı' }];
    await w.fsSet('beton_programi', id, { ...data, durum: 'bekliyor', statusLog: log });
    w.toast && w.toast('İptal kaldırıldı', 'success');
    await betonListeYukle();
  };

  w._betonPerModalId = null as string | null;
  ensureBetonPersonelModal(w);
  w.betonPersonelSatiriEkle = () => {
    const wrap = document.getElementById('beton-personel-wrap');
    if (wrap) betonPersonelSatirEkleForm(wrap, '');
  };
  w.betonPersonelModalSatiriEkle = () => {
    const wrap = document.getElementById('beton-per-modal-wrap');
    if (wrap) betonPersonelSatirEkleForm(wrap, '');
  };
  w.betonPersonelModalAc = (dokumId: string) => {
    ensureBetonPersonelModal(w);
    w._betonPerModalId = dokumId;
    const row = (w._betonData || []).find((x: any) => x.id === dokumId);
    const wrap = document.getElementById('beton-per-modal-wrap');
    if (!wrap || !row) return;
    wrap.innerHTML = '';
    const plist = personelListesi(row);
    if (!plist.length) betonPersonelSatirEkleForm(wrap, '');
    else plist.forEach((n: string) => betonPersonelSatirEkleForm(wrap, n));
    const mbg = document.getElementById('beton-per-mbg');
    mbg?.classList.add('on');
    mbg?.setAttribute('aria-hidden', 'false');
  };
  w.betonPersonelModalKapat = () => {
    w._betonPerModalId = null;
    const mbg = document.getElementById('beton-per-mbg');
    mbg?.classList.remove('on');
    mbg?.setAttribute('aria-hidden', 'true');
  };
  w.betonPersonelModalKaydet = async () => {
    const id = w._betonPerModalId;
    const wrap = document.getElementById('beton-per-modal-wrap');
    if (!id || !wrap) return;
    const row = (w._betonData || []).find((x: any) => x.id === id);
    if (!row) return;
    const personeller = collectPersonellerFromWrap(wrap);
    const personel = personeller[0] || '';
    await w.fsSet('beton_programi', id, { ...row, personeller, personel });
    row.personeller = personeller;
    row.personel = personel;
    w.toast && w.toast('Personel güncellendi', 'success');
    w.betonPersonelModalKapat();
    renderBetonListe(w._betonData || []);
  };

  ensureBetonErteleModal(w);

  const [programDocs, staffRaw] = await Promise.all([
    w.fsGet('beton_programi').catch(() => []) as Promise<any[]>,
    w.fsGet('hr_personnel').catch(() => []) as Promise<any[]>,
  ]);
  w._betonData = (programDocs || []).filter((d: any) => !d._silindi);
  w._betonStaff = (staffRaw || []).filter((s: any) => s.aktif !== false);
  betonPersonelWrapReset();
  renderBetonListe(w._betonData);

  fetchRaporDefteriWithFallback(window)
    .then(({ rows, map }) => {
      w._raporRows = rows;
      w.raporDefterYibfBilgi = createRaporDefterYibfLookup(rows, map);
      renderBetonListe(w._betonData || []);
    })
    .catch(() => {});

  refreshBetonEbistrNumuneler(w)
    .then(() => renderBetonListe(w._betonData || []))
    .catch(() => {});

  if (!w._betonDocListeners) {
    w._betonDocListeners = true;
    document.addEventListener('ebistr:refreshed', () => {
      refreshBetonEbistrNumuneler(w)
        .then(() => renderBetonListe(w._betonData || []))
        .catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshBetonEbistrNumuneler(w)
          .then(() => renderBetonListe(w._betonData || []))
          .catch(() => {});
        startBetonEbistrPoll(w);
      } else {
        stopBetonEbistrPoll(w);
      }
    });
  }
  if (document.visibilityState === 'visible') startBetonEbistrPoll(w);

  w.betonDuzenle = (id: string) => {
    const data = (w._betonData || []).find((x: any) => x.id === id);
    if (!data) return;
    const set = (elId: string, val: string) => {
      const el = document.getElementById(elId) as HTMLInputElement;
      if (el) el.value = val || '';
    };
    const nt = document.getElementById('beton-numune-tur') as HTMLSelectElement;
    if (nt) {
      const t = numuneTurOf(data);
      nt.value = t;
    }
    const ka = document.getElementById('beton-karot-alt') as HTMLSelectElement;
    if (ka) {
      const k = String(data.karotAlt || 'genel').toLowerCase();
      ka.value = ['genel', 'kentsel', 'performans'].includes(k) ? k : 'genel';
    }
    set('beton-numune-etiket', data.numuneEtiket ? String(data.numuneEtiket) : '');
    w.betonNumuneTurFormChange?.();
    set('beton-edit-id', data.id);
    set('beton-yibf', data.yibf || '');
    set('beton-sahip', data.yapiSahibi || '');
    set('beton-yd', data.yapiDenetim || '');
    set('beton-tarih', data.tarih || '');
    set('beton-saat', data.saat || '');
    set('beton-firma', data.betonFirmasi || '');
    set('beton-bolum', data.bolum || '');
    set('beton-blok', data.blok || '');
    set('beton-m3', data.m3 ? String(data.m3) : '');
    set('beton-adet', data.adet ? String(data.adet) : '');
    set('beton-not', data.not || '');
    betonPersonelWrapDoldur(personelListesi(data));
    const baslik = document.getElementById('beton-form-baslik');
    if (baslik) baslik.textContent = 'Kayıt düzenle';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  w.betonSil = async (id: string) => {
    if (!confirm('Bu kaydı silmek istiyor musunuz?')) return;
    await w.fsSet('beton_programi', id, { _silindi: true });
    await betonListeYukle();
  };

  w.betonDurumGuncelle = async (id: string, yeniDurum: string) => {
    const data = (w._betonData || []).find((x: any) => x.id === id);
    if (!data) return;
    const log = [...(data.statusLog || []), { durum: yeniDurum, zaman: new Date().toISOString() }];
    await w.fsSet('beton_programi', id, { ...data, durum: yeniDurum, statusLog: log });
    w.toast && w.toast(DURUMLAR_MAP[yeniDurum] + ' olarak güncellendi', 'success');
    await betonListeYukle();
  };

  if (w.__BETON_READONLY_MODE) {
    const deny = () => {
      w.toast && w.toast('Salt okunur hesap', 'err');
    };
    const noop = async () => deny();
    w.betonKaydet = noop;
    w.betonSil = noop;
    w.betonIptal = noop;
    w.betonIptalGeri = noop;
    w.betonDuzenle = () => deny();
    w.betonDurumGuncelle = async () => deny();
    w.betonErteleAc = () => deny();
    w.betonErteleKaydet = noop;
    w.betonPersonelSatiriEkle = () => deny();
    w.betonPersonelModalSatiriEkle = () => deny();
    w.betonPersonelModalAc = () => deny();
    w.betonPersonelModalKaydet = noop;
    const formCard = document.getElementById('beton-form-card');
    if (formCard) formCard.style.display = 'none';
    const toolbar = document.querySelector('.beton-toolbar') as HTMLElement | null;
    if (toolbar) toolbar.style.display = 'none';
    w._betonFiltre = 'bugun';
  }

  w.betonNumuneTurFormChange();
}

const DURUMLAR_MAP: Record<string, string> = {
  bekliyor: '⏳ Bekliyor',
  pompa_yolda: '🚚 Pompa Yolda',
  pompa_geldi: '✅ Pompa Geldi',
  mikser_geldi: '🚛 Mikser Geldi',
  tamamlandi: '🏁 Tamamlandı',
  iptal: '⛔ İptal',
};
const DURUM_COLORS: Record<string, string> = {
  bekliyor: 'var(--tx3)',
  pompa_yolda: 'var(--amb)',
  pompa_geldi: 'var(--acc2)',
  mikser_geldi: '#a78bfa',
  tamamlandi: 'var(--grn)',
  iptal: 'var(--tx3)',
};

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStaffOptionsForSelect(selected: string): string {
  const w = window as any;
  const staff: any[] = w._betonStaff || [];
  const options = staff
    .map((s: any) => {
      const name = String(s.ad || s.id);
      const val = name.replace(/"/g, '&quot;');
      return `<option value="${val}"${name === selected ? ' selected' : ''}>${escHtml(name)}</option>`;
    })
    .join('');
  return `<option value="">— Seçin —</option>${options}`;
}

function collectPersonellerFromWrap(wrap: HTMLElement | null): string[] {
  if (!wrap) return [];
  const out: string[] = [];
  wrap.querySelectorAll<HTMLSelectElement>('.beton-per-row-select').forEach(sel => {
    const v = sel.value?.trim();
    if (v) out.push(v);
  });
  return [...new Set(out)];
}

function betonPersonelSatirEkleForm(wrap: HTMLElement, selected: string) {
  const row = document.createElement('div');
  row.className = 'beton-per-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap';
  row.innerHTML = `<select class="beton-per-row-select pi" style="flex:1;min-width:160px;max-width:100%;font-size:12px;padding:6px 8px;border-radius:8px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx)">${buildStaffOptionsForSelect(selected)}</select>
    <button type="button" class="btn btn-o beton-per-row-remove" style="padding:4px 10px;font-size:10px;flex-shrink:0" aria-label="Satırı kaldır">✕</button>`;
  row.querySelector('.beton-per-row-remove')?.addEventListener('click', () => {
    const n = wrap.querySelectorAll('.beton-per-row').length;
    if (n <= 1) {
      const sel = row.querySelector('.beton-per-row-select') as HTMLSelectElement;
      if (sel) sel.value = '';
      return;
    }
    row.remove();
  });
  wrap.appendChild(row);
}

function betonPersonelWrapReset() {
  const wrap = document.getElementById('beton-personel-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  betonPersonelSatirEkleForm(wrap, '');
}

function betonPersonelWrapDoldur(isimler: string[]) {
  const wrap = document.getElementById('beton-personel-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = isimler.length ? isimler : [''];
  list.forEach(name => betonPersonelSatirEkleForm(wrap, name));
}

const TUR_STIL: Record<NumuneTurKey, { bg: string; fg: string }> = {
  beton: { bg: 'rgba(59,130,246,.18)', fg: 'var(--acc2)' },
  karot: { bg: 'rgba(167,139,250,.18)', fg: '#a78bfa' },
  celik: { bg: 'rgba(52,211,153,.14)', fg: 'var(--grn)' },
  diger: { bg: 'rgba(148,163,184,.15)', fg: 'var(--tx2)' },
};

function numuneTurBadgeHtml(d: any): string {
  const t = numuneTurOf(d);
  const st = TUR_STIL[t];
  const meta = NUMUNE_TURLERI.find(x => x.key === t)!;
  let sub = '';
  if (t === 'karot') {
    const ka = String(d.karotAlt || 'genel').toLowerCase();
    const kl = KAROT_ALT.find(x => x.key === ka);
    if (kl && ka !== 'genel') {
      sub = `<div style="font-size:9px;color:var(--tx3);margin-top:2px;font-weight:600">${escHtml(kl.label)}</div>`;
    }
  }
  return `<div style="text-align:left"><span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:${st.bg};color:${st.fg}">${meta.emoji} ${meta.label}</span>${sub}</div>`;
}

function numuneDetayCellHtml(d: any): string {
  const et = String(d?.numuneEtiket ?? '').trim();
  if (et) return `<span style="font-size:11px;line-height:1.35">${escHtml(et)}</span>`;
  return '<span style="color:var(--tx3)">—</span>';
}

/** Tarih (+ istenirse self) filtresi uygulanmış satırlar üzerinden sekme sayıları */
function updateNumuneTabCountsForRows(dateOnly: any[]) {
  (['tumu', 'beton', 'karot', 'celik', 'diger'] as const).forEach(k => {
    const n = k === 'tumu' ? dateOnly.length : dateOnly.filter(d => numuneTurOf(d) === k).length;
    document.querySelectorAll(`.numune-tur-tab[data-tur="${k}"] .numune-tab-cnt`).forEach(span => {
      (span as HTMLElement).textContent = String(n);
    });
  });
}

/** Şantiye çıkış / kür: yapıldıysa yeşil ✓, yoksa kırmızı ✕ — ayrıntı title'da */
function betonKurlemeDurumHucre(deger: string, baslik: string): string {
  const raw = String(deger ?? '').trim();
  const tamam = !!raw && raw !== '—';
  if (tamam) {
    const title = escHtml(`${baslik}: ${raw}`);
    return `<span class="beton-kur-durum beton-kur-durum--ok" title="${title}" aria-label="${title}"><span class="beton-kur-durum__icon" aria-hidden="true">✓</span></span>`;
  }
  const title = escHtml(`${baslik}: yapılmadı`);
  return `<span class="beton-kur-durum beton-kur-durum--no" title="${title}" aria-label="${title}"><span class="beton-kur-durum__icon" aria-hidden="true">✕</span></span>`;
}

function fmtTrGunAy(iso: string): string {
  if (!iso || !String(iso).trim()) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function stateStrNumune(n: any): string {
  const s = n?.state;
  if (s == null || s === '') return '';
  if (typeof s === 'string') return s.trim();
  if (typeof s === 'object') return String(s.name || s.code || s.title || s.value || '').trim();
  return String(s);
}

/** Kürleme sayfasındaki mantıkla uyumlu: şantiye çıkışı / kür (aynı gün + YİBF eşleşen numunelerden) */
function kurlemeHucreleriForDokum(numuneler: any[], yibfQuery: string, dokumGun: string): { cikis: string; kur: string } {
  if (!String(yibfQuery || '').trim() || !dokumGun || !/^\d{4}-\d{2}-\d{2}$/.test(dokumGun)) {
    return { cikis: '—', kur: '—' };
  }
  const rows = numuneler.filter(
    (n: any) => numuneMatchesYibfQuery(n, yibfQuery) && numuneMatchesDokumGun(n, dokumGun)
  );
  if (!rows.length) return { cikis: '—', kur: '—' };
  let cikis = '';
  let kur = '';
  for (const n of rows) {
    const wo = n.worksiteOutDate;
    if (!cikis && wo) cikis = fmtTrGunAy(wo);
    const cd = n.cureDate;
    const st = stateStrNumune(n).toLowerCase();
    if (!kur && cd) kur = fmtTrGunAy(cd);
    else if (!kur && (st.includes('cure') || /kür|kur|havuz/i.test(st))) kur = 'Havuzda';
  }
  return { cikis: cikis || '—', kur: kur || '—' };
}

const BETON_SESSION_CACHE_KEY = 'lab_beton_programi_v1';
const BETON_CACHE_MAX_AGE_MS = 8 * 60 * 1000;

async function betonListeYukle() {
  const w = window as any;
  let paintedFromCache = false;
  try {
    const raw = sessionStorage.getItem(BETON_SESSION_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { ts?: number; rows?: any[] };
      if (
        parsed &&
        Array.isArray(parsed.rows) &&
        typeof parsed.ts === 'number' &&
        Date.now() - parsed.ts < BETON_CACHE_MAX_AGE_MS
      ) {
        w._betonData = parsed.rows.filter((d: any) => d && !d._silindi);
        renderBetonListe(w._betonData);
        paintedFromCache = true;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const docs: any[] = (await w.fsGet('beton_programi')) || [];
    w._betonData = docs.filter((d: any) => !d._silindi);
    renderBetonListe(w._betonData);
    try {
      sessionStorage.setItem(
        BETON_SESSION_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), rows: w._betonData })
      );
    } catch {
      /* quota */
    }
  } catch {
    if (!paintedFromCache) {
      const el = document.getElementById('beton-liste');
      if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red);font-size:12px">Yüklenemedi.</div>';
    }
  }
}

/** Alınış günü YYYY-MM-DD — DD/MM/YYYY (defter) ile uyumlu; `new Date(string)` kullanılmaz. */
function numuneAlinisGunFromRaw(raw: unknown): string | null {
  const iso = parseRaporDateToIso(raw);
  return iso || null;
}

/** Bu YİBF + alınış alanlarından biri döküm gününe denk geliyor mu */
function numuneMatchesDokumGun(n: any, gun: string): boolean {
  for (const f of [n.takeDate, n.alinisZamani, n.alinisDate, n.tarih]) {
    const y = numuneAlinisGunFromRaw(f);
    if (y === gun) return true;
  }
  return false;
}

function filterByDate(data: any[], filtre: string): any[] {
  const now = new Date();
  const today = localDateISO(now);
  const tomorrow = localDateISO(new Date(now.getTime() + 86400000));
  const weekEnd = localDateISO(new Date(now.getTime() + 7 * 86400000));
  if (filtre === 'hepsi') {
    const start = localDateISO(new Date(now.getTime() - 6 * 86400000));
    return data.filter(d => {
      const t = d.tarih || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
      return t >= start && t <= today;
    });
  }
  if (filtre === 'bugun') return data.filter(d => d.tarih === today);
  if (filtre === 'yarin') return data.filter(d => d.tarih === tomorrow);
  if (filtre === 'hafta')
    return data.filter(d => (d.tarih || '') >= today && (d.tarih || '') <= weekEnd);
  if (filtre?.match(/^\d{4}-\d{2}-\d{2}$/)) return data.filter(d => d.tarih === filtre);
  return data;
}

/**
 * Stabil kimlik: brnNo + labReportNo + curingGun
 * state/breakDate/cureDate değişse de aynı fiziksel ölçümü temsil eder.
 * Sunucu dosyası (file) her zaman daha güncel kabul edilir;
 * bellekteki (mem) eski versiyonlar dosyadakiyle çakışıyorsa atlanır.
 */
function stableNumuneKey(n: any): string {
  return [
    String(n.brnNo ?? '').trim(),
    String(n.labReportNo ?? n.labNo ?? '').trim(),
    String(n.curingGun ?? ''),
    String(n.takeDate ?? '').slice(0, 10),
  ].join('\x1e');
}

/** Sunucu JSON'u taban: tüm satırlar korunur; bellekte olup dosyada olmayanlar eklenir */
function birlesikEbistrNumuneListesi(file: any[], mem: any[]): any[] {
  const f = Array.isArray(file) ? file : [];
  const m = Array.isArray(mem) ? mem : [];
  if (!f.length) return m.slice();
  // Stabil key ile dosyadakileri işaretle — state değişse de aynı numune tekrar eklenmez
  const stableIds = new Set(f.map(stableNumuneKey));
  const fullIds   = new Set(f.map((n: any) => ebistrNumuneRowKey(n)));
  const out = f.slice();
  for (const n of m) {
    if (stableIds.has(stableNumuneKey(n))) continue; // dosyada zaten var (farklı state olabilir)
    if (fullIds.has(ebistrNumuneRowKey(n))) continue;
    fullIds.add(ebistrNumuneRowKey(n));
    stableIds.add(stableNumuneKey(n));
    out.push(n);
  }
  return out;
}

/** Sekme görünürken ~anlık sayılacak kadar sık; arka planda istek kesilir */
const BETON_EBISTR_POLL_MS = 10_000;

function stopBetonEbistrPoll(w: any) {
  if (w._betonEbistrPollTimer) {
    clearInterval(w._betonEbistrPollTimer);
    w._betonEbistrPollTimer = null;
  }
}

function startBetonEbistrPoll(w: any) {
  stopBetonEbistrPoll(w);
  w._betonEbistrPollTimer = setInterval(() => {
    refreshBetonEbistrNumuneler(w)
      .then(() => renderBetonListe(w._betonData || []))
      .catch(() => {});
  }, BETON_EBISTR_POLL_MS);
}

async function refreshBetonEbistrNumuneler(w: any): Promise<void> {
  if (w._betonEbistrRefreshPromise) return w._betonEbistrRefreshPromise;
  w._betonEbistrRefreshPromise = (async () => {
    const mem = Array.isArray(w.ebistrNumuneler) ? w.ebistrNumuneler : [];
    let file: any[] = [];
    try {
      const syncQs =
        w._betonEbistrUsedAwaitSync
          ? '&warmSync=1'
          : (() => {
              w._betonEbistrUsedAwaitSync = true;
              return '&awaitSync=1';
            })();
      const res = await fetch(`/api/data?type=ebistr-numuneler&latest=1&_=${Date.now()}${syncQs}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.data) && json.data.length) file = json.data;
    } catch {}
    w._betonEbistrNumuneler = birlesikEbistrNumuneListesi(file, mem);
  })().finally(() => {
    w._betonEbistrRefreshPromise = null;
  });
  return w._betonEbistrRefreshPromise;
}

/** Önce sunucu+bellek birleşimi; yoksa yalnız bellek (EBİSTR sayfası açıksa) */
function betonEbistrNumuneListesi(w: any): any[] {
  if (w._betonEbistrNumuneler?.length) return w._betonEbistrNumuneler;
  if (w.ebistrNumuneler?.length) return w.ebistrNumuneler;
  return [];
}

function brnGrupAnahtari(n: any): string {
  const b = String(n.brnNo ?? '').trim();
  if (b) return `brn:${b}`;
  const lab = String(n.labReportNo ?? n.labNo ?? '').trim();
  if (lab) return `lab:${lab}`;
  // BRN/lab yoksa irsaliye numarası + alınış günü bazında grupla
  const irs = String(n.irsaliye ?? '').trim();
  const gun = String(n.takeDate ?? '').slice(0, 10);
  if (irs && gun) return `irs:${irs}:${gun}`;
  return '';
}

/** Numune adedi: YİBF + (isteğe bağlı) döküm günü; satır sayısı yerine fiziksel adet. */
function hamNumuneSayBrnGenislet(
  numuneler: any[],
  yibfStr: string,
  gun: string | null
): { adet: number; dahil: any[]; toplamYibf: number } {
  const dahil = numuneler.filter(
    (n: any) =>
      numuneMatchesYibfQuery(n, yibfStr) &&
      (!gun || numuneMatchesDokumGun(n, gun))
  );
  const tumYibf = numuneler.filter((n: any) => numuneMatchesYibfQuery(n, yibfStr));
  const toplamYibf = ebistrDahilNumuneAdet(tumYibf);
  return { adet: ebistrDahilNumuneAdet(dahil), dahil, toplamYibf };
}

function getEbistrNumuneStats(
  yibf: string,
  dokumTarih?: string
): { adet: number; sonZaman: string | null; toplamYibf: number } {
  const w = window as any;
  const yibfStr = String(yibf).trim();
  if (!yibfStr) return { adet: 0, sonZaman: null, toplamYibf: 0 };

  const gun =
    dokumTarih && /^\d{4}-\d{2}-\d{2}$/.test(dokumTarih) ? dokumTarih : localDateISO();

  const numuneler: any[] = betonEbistrNumuneListesi(w);
  if (!numuneler.length) return { adet: 0, sonZaman: null, toplamYibf: 0 };

  const { adet, dahil, toplamYibf } = hamNumuneSayBrnGenislet(numuneler, yibfStr, gun);

  let sonZaman: string | null = null;
  dahil.forEach((n: any) => {
    const t = n.takeDate || n.alinisZamani || n.alinisDate || n.tarih || '';
    if (t && (!sonZaman || t > sonZaman)) sonZaman = t;
  });

  return { adet, sonZaman, toplamYibf };
}

/** Çip takip — localStorage (app.js ile aynı kaynak) */
function betonChipListesiFromLs(): ChipRowLite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('alibey_chip');
    if (!raw) return [];
    const o = JSON.parse(raw) as { data?: unknown };
    return Array.isArray(o?.data) ? (o.data as ChipRowLite[]) : [];
  } catch {
    return [];
  }
}

const CHIP_HUCRE_TITLE =
  'Rapor defterindeki müteahhit (veya ruhsat/kod no) ile çip listesindeki firma/belge eşlemesi otomatiktir; yazım farkında liste güncelleyin.';

function chipHucreForBetonRow(
  d: Record<string, unknown>,
  rd: Record<string, string> | null,
  chips: ChipRowLite[]
): string {
  const yibf = String(d?.yibf ?? '').trim();
  if (!yibf) {
    return '<span style="font-size:10px;color:var(--tx3)">—</span>';
  }
  const muteahhit = String(rd?.muteahhit ?? rd?.contractor ?? '').trim();
  const hints = belgeHintsFromRapor(rd);
  const chip = findChipRowForMuteahhit(chips, muteahhit, hints);
  const planli = parseInt(String(d.adet ?? ''), 10) || 0;
  const st = chipYeterlilikForNumune({
    planliAdet: planli,
    chip,
    raporVar: !!rd,
    eslemeKaynagiVar: !!(muteahhit || hints.length),
    chipListesiBos: chips.length === 0,
  });

  const sub = (html: string, color: string) =>
    `<div style="font-weight:700;color:${color};line-height:1.25">${html}</div>`;
  const hint = (t: string) => `<div style="font-size:9px;color:var(--tx3);margin-top:2px;line-height:1.2">${t}</div>`;

  let inner: string;
  switch (st.durum) {
    case 'yok_veri':
      inner = sub('Veri yok', 'var(--tx3)') + hint('Çip listesi boş');
      break;
    case 'yok_rapor':
      inner = sub('Rapor yok', 'var(--amb)') + hint('YİBF rapor defterinde yok');
      break;
    case 'yok_muteahhit':
      inner = sub('Eşleşme yok', 'var(--amb)') + hint('Raporda müteahhit / belge no yok');
      break;
    case 'yok_cip':
      inner = sub('Çip yok', 'var(--amb)') + hint('Listede bu müteahhit yok');
      break;
    case 'pln_yok':
      inner =
        st.kal !== null
          ? sub(`Kalan ${st.kal}`, 'var(--tx2)') + hint('Planlı adet girilmemiş')
          : sub('—', 'var(--tx3)') + hint('Kalan bilinmiyor');
      break;
    case 'yeterli':
      inner =
        sub('✓ Yeterli', 'var(--grn)') +
        hint(`Kalan ${st.kal} ≥ ${st.gerekli} pln` + (st.eslesenFirma ? ` · ${escHtml(st.eslesenFirma)}` : ''));
      break;
    case 'eksik':
      inner =
        sub('⚠ Eksik', 'var(--red)') +
        hint(`Kalan ${st.kal} &lt; ${st.gerekli} pln` + (st.eslesenFirma ? ` · ${escHtml(st.eslesenFirma)}` : ''));
      break;
    default:
      inner = sub('?', 'var(--tx3)') + hint('Kalan çip okunamadı');
  }

  const titleAttr = escHtml(
    `${CHIP_HUCRE_TITLE} | Durum: ${st.durum}` + (st.eslesenFirma ? ` | ${st.eslesenFirma}` : '')
  );
  return `<div class="beton-no-strike" title="${titleAttr}">${inner}</div>`;
}

function formatRelativeTime(isoStr: string | null): string {
  if (!isoStr) return '';
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'az önce';
    if (mins < 60) return `${mins} dk önce`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} sa önce`;
    return `${Math.floor(hrs / 24)} gün önce`;
  } catch { return ''; }
}

function personelTabloHucre(d: any, iptal: boolean): string {
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const ro = !!w.__BETON_READONLY_MODE;
  const list = personelListesi(d);
  const chips =
    list.length > 0
      ? list
          .map(
            n =>
              `<span style="display:inline-block;font-size:9px;font-weight:600;padding:2px 6px;margin:0 4px 4px 0;border-radius:6px;background:var(--sur2);color:var(--tx2);max-width:10rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle" title="${escHtml(n)}">${escHtml(n)}</span>`
          )
          .join('')
      : '<span style="font-size:10px;color:var(--tx3)">Atanmamış</span>';
  const btn = ro
    ? ''
    : `<button type="button" class="btn btn-o" style="padding:3px 8px;font-size:10px" onclick="betonPersonelModalAc('${d.id}')" ${iptal ? 'disabled' : ''}>Personel</button>`;
  return `<div class="beton-no-strike">
    <div style="display:flex;flex-wrap:wrap;align-items:center;margin-bottom:6px;line-height:1.25">${chips}</div>
    ${btn}
  </div>`;
}

function renderBetonPager(totalRows: number, pageIdx: number) {
  const el = document.getElementById('beton-pager');
  if (!el) return;
  if (totalRows === 0 || totalRows <= BETON_LIST_PAGE_SIZE) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const pages = Math.ceil(totalRows / BETON_LIST_PAGE_SIZE);
  const p = Math.min(Math.max(0, pageIdx), pages - 1);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'space-between';
  el.style.flexWrap = 'wrap';
  el.innerHTML = `
    <span style="font-size:11px;color:var(--tx3)">Sayfa <strong style="color:var(--tx)">${p + 1}</strong> / ${pages}</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-o" style="font-size:11px;padding:6px 12px" ${p <= 0 ? 'disabled' : ''} onclick="betonSayfaGit(${p - 1})">← Önceki</button>
      <button type="button" class="btn btn-o" style="font-size:11px;padding:6px 12px" ${p >= pages - 1 ? 'disabled' : ''} onclick="betonSayfaGit(${p + 1})">Sonraki →</button>
    </div>
  `;
}

function renderBetonListe(allData: any[]) {
  const w = window as any;
  const container = document.getElementById('beton-liste');
  if (!container) return;

  const filtre = w.__BETON_READONLY_MODE ? 'bugun' : w._betonFiltre || 'hepsi';
  const turTab = w._numuneTurTab || 'tumu';

  let dateSorted = filterByDate(allData, filtre).sort((a, b) => {
    const da = `${a.tarih || ''}${a.saat || ''}`;
    const db = `${b.tarih || ''}${b.saat || ''}`;
    return db.localeCompare(da);
  });
  if (w.__BETON_SELF_FILTER) {
    const ad = String(w.__BETON_LINKED_PERSONEL_AD || '').trim();
    if (ad) dateSorted = dateSorted.filter((d: any) => betonRowAssignedToPersonelAd(d, ad));
    else dateSorted = [];
  }
  updateNumuneTabCountsForRows(dateSorted);
  const data = filterByTur(dateSorted, turTab);
  const totalRows = data.length;
  const pages = Math.max(1, Math.ceil(totalRows / BETON_LIST_PAGE_SIZE) || 1);
  let pageIdx = w._betonListePage || 0;
  if (pageIdx >= pages) pageIdx = pages - 1;
  if (pageIdx < 0) pageIdx = 0;
  w._betonListePage = pageIdx;
  const pageSlice = data.slice(pageIdx * BETON_LIST_PAGE_SIZE, pageIdx * BETON_LIST_PAGE_SIZE + BETON_LIST_PAGE_SIZE);

  const cnt = document.getElementById('beton-cnt');
  if (cnt) {
    const tabLbl =
      turTab === 'tumu'
        ? ''
        : ` · ${NUMUNE_TURLERI.find(x => x.key === turTab)?.label || turTab} sekmesi`;
    if (totalRows) {
      const from = pageIdx * BETON_LIST_PAGE_SIZE + 1;
      const to = pageIdx * BETON_LIST_PAGE_SIZE + pageSlice.length;
      cnt.textContent = `${totalRows} kayıt · görünen ${from}–${to}${tabLbl}`;
    } else {
      cnt.textContent = `0 kayıt${tabLbl}`;
    }
  }

  renderBetonPager(totalRows, pageIdx);

  if (!pageSlice.length) {
    const selfNoAd = w.__BETON_SELF_FILTER && !String(w.__BETON_LINKED_PERSONEL_AD || '').trim();
    const msg = selfNoAd
      ? 'Hesabınız personele bağlı ancak personel adı bulunamadı. Yöneticinizden hr_personnel eşlemesini kontrol ettirin.'
      : `Bu aralıkta${turTab !== 'tumu' ? ' bu türde' : ''} kayıt yok.`;
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--tx3);font-size:12px">${msg}</div>`;
    return;
  }

  // Group by date (yalnızca bu sayfa)
  const byDate: Record<string, any[]> = {};
  pageSlice.forEach(d => {
    const k = d.tarih || '—';
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(d);
  });

  const today = localDateISO();

  container.innerHTML = Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([tarih, items]) => {
    const dateLabel = tarih !== '—'
      ? (() => {
          const [y,m,d] = tarih.split('-');
          const dobj = new Date(tarih + 'T12:00:00');
          const gun = dobj.toLocaleDateString('tr-TR', { weekday: 'long' });
          return `${d}.${m}.${y} ${gun}`;
        })()
      : 'Tarih Belirtilmemiş';
    const isToday = tarih === today;

    const sorted = [...items].sort((a, b) => {
      const ai = a.durum === 'iptal' ? 1 : 0;
      const bi = b.durum === 'iptal' ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return `${a.saat || '99:99'}`.localeCompare(`${b.saat || '99:99'}`);
    });

    const numListe = betonEbistrNumuneListesi(w);
    const chipsListe = betonChipListesiFromLs();

    const satirlar = sorted.map(d => {
      const durum = d.durum || 'bekliyor';
      const durumColor = DURUM_COLORS[durum] || 'var(--tx3)';
      const iptal = durum === 'iptal';
      const isBeton = numuneTurOf(d) === 'beton';
      const stats = isBeton ? getEbistrNumuneStats(d.yibf || '', d.tarih) : { adet: 0, sonZaman: null, toplamYibf: 0 };
      const planliAdet = parseInt(String(d.adet), 10) || 0;
      const alinanAdet = stats.adet;
      const { cikis, kur } = isBeton
        ? kurlemeHucreleriForDokum(numListe, String(d.yibf || ''), String(d.tarih || ''))
        : { cikis: '—', kur: '—' };

      let numOz = '—';
      if (isBeton) {
        if (d.yibf) {
          if (planliAdet > 0) {
            const col = alinanAdet >= planliAdet ? 'var(--grn)' : alinanAdet > 0 ? 'var(--amb)' : 'var(--tx3)';
            numOz = `<span style="font-weight:700;color:${col}">${alinanAdet}/${planliAdet}</span>`;
            if (stats.sonZaman) {
              numOz += `<div style="font-size:10px;color:var(--tx3);margin-top:2px">${formatRelativeTime(stats.sonZaman)}</div>`;
            }
          } else {
            numOz =
              alinanAdet > 0
                ? `<span style="color:var(--tx2)">${alinanAdet} alındı</span>`
                : '<span style="color:var(--tx3)">—</span>';
          }
        } else if (planliAdet || d.m3) {
          const p: string[] = [];
          if (planliAdet) p.push(`${planliAdet} pln`);
          if (d.m3 != null && d.m3 !== '') p.push(`${d.m3} m³`);
          numOz = p.join(' · ') || '—';
        }
      } else {
        const p: string[] = [];
        if (planliAdet) p.push(`<span style="font-weight:700;color:var(--tx2)">${planliAdet}</span> pln`);
        if (d.m3 != null && d.m3 !== '') p.push(`${escHtml(String(d.m3))} m³`);
        numOz = p.length ? p.join(' · ') : '<span style="color:var(--tx3)">—</span>';
      }

      const yibfHuc = d.yibf
        ? `<div class="beton-no-strike" title="${isLikelyAdaParsel(String(d.yibf)) ? 'Ada/parsel gibi görünüyor' : 'YİBF'}"><span style="font-family:var(--fm);font-size:12px;font-weight:700;color:var(--acc2)">${escHtml(String(d.yibf))}</span></div>`
        : '—';

      const rd =
        d.yibf && typeof w.raporDefterYibfBilgi === 'function'
          ? w.raporDefterYibfBilgi(String(d.yibf))
          : null;

      const chipHucre = chipHucreForBetonRow(d as Record<string, unknown>, rd, chipsListe);

      const sahipDis = d.yapiSahibi || rd?.yapiSahibi || '';
      const sahipHuc = sahipDis
        ? `<div style="font-size:13px;font-weight:600;color:var(--tx);line-height:1.35;max-width:14rem">${escHtml(String(sahipDis))}</div>`
        : '<span style="color:var(--tx3)">—</span>';

      const ydBet =
        [d.yapiDenetim || rd?.yapiDenetim, d.betonFirmasi || rd?.betonFirmasi]
          .filter(Boolean)
          .map(x => escHtml(String(x)))
          .join('<div style="height:3px"></div>') || '—';

      const bolumHuc = d.bolum
        ? `<span style="font-size:11px;line-height:1.35">${escHtml(String(d.bolum))}</span>`
        : '<span style="color:var(--tx3)">—</span>';

      const blokDis = d.blok || rd?.blok || '';
      const blokHuc = blokDis
        ? `<span style="font-size:11px">${escHtml(String(blokDis))}</span>`
        : '<span style="color:var(--tx3)">—</span>';

      const ada = String(rd?.ada ?? '').trim();
      const parsel = String(rd?.parsel ?? '').trim();
      const adaParselHuc =
        ada || parsel
          ? `<span style="font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap">${escHtml(ada || '—')}<span style="color:var(--tx3);margin:0 4px">/</span>${escHtml(parsel || '—')}</span>`
          : '<span style="color:var(--tx3)">—</span>';

      const m3h = d.m3 != null && d.m3 !== '' ? escHtml(String(d.m3)) : '—';

      const ro = !!(w.__BETON_READONLY_MODE);
      const durumOpts = DURUM_AKIS.map(
        x =>
          `<option value="${x.key}"${durum === x.key ? ' selected' : ''}>${x.emoji} ${x.label}</option>`
      ).join('');
      const durumMeta = DURUMLAR.find(x => x.key === durum);
      const durumSabit = durumMeta ? `${durumMeta.emoji} ${durumMeta.label}` : escHtml(String(durum));
      const durumHucre = iptal
        ? `<span style="font-size:11px;font-weight:700;color:var(--tx3)">⛔ İptal</span>`
        : ro
          ? `<span style="font-size:11px;font-weight:700;color:${durumColor}">${durumSabit}</span>`
          : `<select onchange="betonDurumGuncelle('${d.id}',this.value)" style="font-size:11px;padding:4px 6px;max-width:138px;border-radius:6px;border:1px solid var(--bdr);background:var(--sur2);color:var(--tx)">${durumOpts}</select>`;

      const notKisa = d.not
        ? `<div style="font-size:10px;color:var(--tx3);margin-top:3px;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(d.not)}">${escHtml(d.not)}</div>`
        : '';

      const aksiyon = ro
        ? ''
        : iptal
          ? `<div class="beton-action-btns"><button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px" onclick="betonIptalGeri('${d.id}')">Geri al</button>
           <button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px" onclick="betonDuzenle('${d.id}')">Düzenle</button></div>`
          : `<div class="beton-action-btns"><button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px" onclick="betonErteleAc('${d.id}')" title="Başka güne taşı">Ertele</button>
           <button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px;color:var(--red);border-color:rgba(251,113,133,.35)" onclick="betonIptal('${d.id}')">İptal</button>
           <button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px" onclick="betonDuzenle('${d.id}')">Düzenle</button>
           <button type="button" class="btn btn-o" style="padding:4px 8px;font-size:10px;color:var(--red)" onclick="betonSil('${d.id}')">Sil</button></div>`;

      return `<tr class="${iptal ? 'beton-row-iptal' : ''}" style="--beton-stripe:${iptal ? 'transparent' : durumColor};border-left:3px solid ${iptal ? 'transparent' : durumColor}">
        <td data-lbl="Saat" style="font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--tx3)">${d.saat ? escHtml(String(d.saat)) : '—'}</td>
        <td data-lbl="Tür" style="min-width:5.5rem;max-width:7rem">${numuneTurBadgeHtml(d)}</td>
        <td data-lbl="Ne alındı" style="max-width:9rem">${numuneDetayCellHtml(d)}</td>
        <td data-lbl="YİBF">${yibfHuc}${notKisa}</td>
        <td data-lbl="Yapı sahibi">${sahipHuc}</td>
        <td data-lbl="YD / beton" style="font-size:11px;line-height:1.35;max-width:10rem">${ydBet}</td>
        <td data-lbl="Yapı bölümü" style="font-size:11px;max-width:7rem">${bolumHuc}</td>
        <td data-lbl="Blok" style="font-size:11px;max-width:5rem">${blokHuc}</td>
        <td data-lbl="Ada / parsel" style="font-size:11px;max-width:6.5rem">${adaParselHuc}</td>
        <td data-lbl="m³" style="font-variant-numeric:tabular-nums;text-align:right">${m3h}</td>
        <td data-lbl="Numune" style="font-size:11px;min-width:4.5rem">${numOz}</td>
        <td data-lbl="Çip" style="max-width:7.5rem;vertical-align:top">${chipHucre}</td>
        <td data-lbl="Şantiye çıkış" class="beton-no-strike">${isBeton ? betonKurlemeDurumHucre(cikis, 'Şantiye çıkış') : '<span style="color:var(--tx3);font-size:11px">—</span>'}</td>
        <td data-lbl="Kür" class="beton-no-strike">${isBeton ? betonKurlemeDurumHucre(kur, 'Kür') : '<span style="color:var(--tx3);font-size:11px">—</span>'}</td>
        <td data-lbl="Durum">${durumHucre}</td>
        <td data-lbl="Personel" class="beton-no-strike">${personelTabloHucre(d, iptal)}</td>
        <td data-lbl="İşlem" class="beton-no-strike beton-td-actions" style="white-space:nowrap;text-align:right">${aksiyon}</td>
      </tr>`;
    }).join('');

    const tablo = `
      <div class="beton-scroll">
        <table class="beton-tbl beton-tbl--cards">
          <thead>
            <tr>
              <th>Saat</th>
              <th>Tür</th>
              <th>Ne alındı</th>
              <th>YİBF</th>
              <th>Yapı sahibi</th>
              <th>YD / beton</th>
              <th>Yapı bölümü</th>
              <th>Blok</th>
              <th>Ada / parsel</th>
              <th style="text-align:right">m³</th>
              <th>Numune</th>
              <th title="${escHtml(CHIP_HUCRE_TITLE)}">Çip</th>
              <th>Şantiye çıkış</th>
              <th>Kür</th>
              <th>Durum</th>
              <th>Personel</th>
              <th style="text-align:right">İşlem</th>
            </tr>
          </thead>
          <tbody>${satirlar}</tbody>
        </table>
      </div>`;

    return `
      <div class="beton-day-block" style="margin-bottom:20px">
        <div class="beton-day-head" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:0 2px">
          <div style="font-size:13px;font-weight:700;color:${isToday ? 'var(--amb)' : 'var(--tx2)'}">${isToday ? '🎯 ' : ''}${dateLabel}</div>
          <div style="flex:1;height:1px;background:var(--bdr)"></div>
          <div style="font-size:11px;color:var(--tx3)">${items.length} kayıt</div>
        </div>
        ${tablo}
      </div>`;
  })
    .join('');
}
