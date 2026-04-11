import { isLikelyAdaParsel, normalizeYibfLookupKey, numuneMatchesYibfQuery } from '@/lib/yibf-utils';

/** Rapor defteri satırından istemci / EBİSTR’in kullandığı ortak nesne (tüm anlamlı alanlar). */
export function raporRowToYibfBilgi(r: Record<string, unknown>) {
  const muteahhit = String(r.muteahhit ?? '').trim();
  return {
    yapiSahibi: String(r.sahip ?? '').trim(),
    yapiDenetim: String(r.yd ?? '').trim(),
    yapiBolumu: String(r.bolum ?? '').trim(),
    blok: String(r.blok ?? '').trim(),
    muteahhit,
    contractor: muteahhit,
    adres: String(r.adres ?? '').trim(),
    pafta: String(r.pafta ?? '').trim(),
    ada: String(r.ada ?? '').trim(),
    parsel: String(r.parsel ?? '').trim(),
    ruhsatNo: String(r.ruhsatNo ?? '').trim(),
    idare: String(r.idare ?? '').trim(),
    betonFirmasi: String(r.beton ?? '').trim(),
    talepEden: String(r.talepEden ?? '').trim(),
    sinif: String(r.sinif ?? '').trim(),
    cins: String(r.cins ?? '').trim(),
    lab: String(r.lab ?? '').trim(),
    tip: String(r.tip ?? '').trim(),
    yil: String(r.yil ?? '').trim(),
    kod: String(r.kod ?? '').trim(),
    alinTarih: String(r.alinTarih ?? '').trim(),
    labTarih: String(r.labTarih ?? '').trim(),
    fiyat: String(r.fiyat ?? '').trim(),
    gun7: String(r.gun7 ?? '').trim(),
    gun28: String(r.gun28 ?? '').trim(),
    m3: String(r.m3 ?? '').trim(),
    adet: String(r.adet ?? '').trim(),
  };
}

/**
 * Dosyada aynı YİBF tekrarlanırsa son satır baskındır (mevcut Excel → map davranışıyla uyumlu).
 * Ayrıca normalize edilmiş ve rakam anahtarları eklenir (baştaki 0 / yazım farkı).
 */
export function buildYibfMapFromRaporRows(rows: unknown[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  if (!Array.isArray(rows)) return map;

  const byNorm = new Map<string, Record<string, string>>();

  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const y = String(row?.yibf ?? '').trim();
    if (!y) continue;
    const info = raporRowToYibfBilgi(row);
    const flat: Record<string, string> = Object.fromEntries(
      Object.entries(info).map(([k, v]) => [k, String(v ?? '')])
    );
    map[y] = flat;
    byNorm.set(normalizeYibfLookupKey(y), flat);
    const dig = y.replace(/\D/g, '').replace(/^0+/, '') || '';
    if (dig.length >= 4 && !isLikelyAdaParsel(y)) map[dig] = flat;
  }

  for (const [norm, info] of byNorm) {
    if (norm && !map[norm]) map[norm] = info;
  }

  return map;
}

export function findLatestRaporRowForYibf(rows: unknown[], yibfQuery: string): Record<string, unknown> | null {
  const q = String(yibfQuery ?? '').trim();
  if (!q || !rows?.length) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] as Record<string, unknown>;
    const y = String(r?.yibf ?? '').trim();
    if (!y) continue;
    if (numuneMatchesYibfQuery({ yibf: y, yibfNo: y, yapiKodu: '' }, q)) return r;
  }
  return null;
}

/** Kalıcı map + satırlar: önce satırlardan üretilen anahtarlar, sonra kalıcı map ile üstüne yazılmaz — satırlar öncelikli. */
export function mergeRaporMaps(persisted: Record<string, unknown> | null | undefined, rows: unknown[]) {
  const fromRows = buildYibfMapFromRaporRows(rows);
  const base = persisted && typeof persisted === 'object' ? { ...persisted } : {};
  return { ...base, ...fromRows } as Record<string, Record<string, string>>;
}

export function createRaporDefterYibfLookup(
  rows: unknown[],
  persistedMap: Record<string, unknown> | null | undefined
): (yibf: string) => Record<string, string> | null {
  const map = mergeRaporMaps(persistedMap, rows);
  return (query: string) => {
    const t = String(query ?? '').trim();
    if (!t) return null;
    const hit =
      map[t] ||
      map[normalizeYibfLookupKey(t)] ||
      (() => {
        const dig = t.replace(/\D/g, '').replace(/^0+/, '') || '';
        return dig.length >= 4 ? map[dig] : undefined;
      })();
    if (hit) return hit;
    const row = findLatestRaporRowForYibf(rows, t);
    return row ? (Object.fromEntries(Object.entries(raporRowToYibfBilgi(row)).map(([k, v]) => [k, String(v)])) as Record<string, string>) : null;
  };
}
