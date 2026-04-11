/**
 * Kısa "sayı/sayı" veya "sayı-sayı" — çoğunlukla ada/parsel; YİBF kayıt no olarak kullanılmamalı.
 * EBİSTR'de boş YİBF iken yapiKodu bu formatta gelince yanlışlıkla YİBF sanılıyordu.
 */
export function isLikelyAdaParsel(s: string): boolean {
  const t = String(s ?? '').trim();
  if (!t || t.length > 24) return false;
  return /^\d{1,6}\s*[/\\-]\s*\d{1,6}$/.test(t);
}

/** EBİSTR numunelerini gruplamak için anahtar (rapor paneli, içe aktarma). */
export function pickEbistrYibfGroupKey(n: Record<string, unknown>): string {
  const sy = String(n.yibf ?? n.yibfNo ?? '').trim();
  if (sy && !isLikelyAdaParsel(sy)) return sy;
  const yk = String(n.yapiKodu ?? '').trim();
  if (yk && !isLikelyAdaParsel(yk)) return yk;
  const brn = String(n.brnNo ?? n.labReportNo ?? '').trim();
  if (brn) return `__BRN__${brn}`;
  return '__YIBFSIZ__';
}

/** İçe aktarılan rapor satırında kaydedilecek YİBF (sentetik grup anahtarlarını ve ada/parseli ayıkla). */
export function resolveYibfForImportRow(groupKey: string, n: Record<string, unknown>): string {
  if (groupKey === '__YIBFSIZ__' || groupKey.startsWith('__BRN__')) {
    const sy = String(n.yibf ?? n.yibfNo ?? '').trim();
    if (sy && !isLikelyAdaParsel(sy)) return sy;
    return '';
  }
  if (isLikelyAdaParsel(groupKey)) {
    const sy = String(n.yibf ?? n.yibfNo ?? '').trim();
    if (sy && !isLikelyAdaParsel(sy)) return sy;
    return '';
  }
  return groupKey;
}

/** Boşluk / baştaki sıfır farklarını yok say (YİBF çoğunlukla sayısal). Rapor defteri lookup ile paylaşılır. */
export function normalizeYibfLookupKey(s: string): string {
  let t = String(s ?? '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i');
  if (/^\d+$/.test(t)) {
    const stripped = t.replace(/^0+/, '');
    return stripped || '0';
  }
  return t.toLowerCase();
}

/** Beton/rapor tarafında numune–YİBF eşlemesi (ada/parsel girilmişse yapiKodu ile gevşek eşleşme yapma). */
export function numuneMatchesYibfQuery(n: Record<string, unknown>, yibfQuery: string): boolean {
  const q = String(yibfQuery ?? '').trim();
  if (!q) return false;
  const qc = normalizeYibfLookupKey(q);
  if (!qc) return false;

  const same = (v: unknown) => {
    const t = String(v ?? '').trim();
    return !!t && normalizeYibfLookupKey(t) === qc;
  };

  if (same(n.yibf) || same(n.yibfNo)) return true;
  if (isLikelyAdaParsel(q)) return false;
  if (same(n.yapiKodu)) return true;
  // Metin içindeki tüm rakamlar = YİBF no (ör. "YİBF 2475930")
  if (/^\d+$/.test(qc) && qc.length >= 4) {
    const normDig = (v: unknown) => {
      const d = String(v ?? '').replace(/\D/g, '');
      const s = d.replace(/^0+/, '');
      return s || (d ? '0' : '');
    };
    const dq = normDig(n.yibf);
    const dn = normDig(n.yibfNo);
    const dk = normDig(n.yapiKodu);
    if (dq === qc || dn === qc) return true;
    if (!isLikelyAdaParsel(q) && dk === qc) return true;
  }
  return false;
}
