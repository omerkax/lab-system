/**
 * Numune satırı (YİBF → rapor müteahhiti) ile çip takip (firma / belge) kayıtlarını eşler.
 * EBİS’teki isim yazımı ile rapor defteri arasında fark olabileceği için normalize + kısmi eşleşme kullanılır.
 */

export type ChipRowLite = {
  firma?: string;
  belge?: string;
  top?: number;
  kul?: number;
  kal?: number;
  pasif?: boolean;
};

export function normalizeCompanyKeyTr(s: string): string {
  return String(s ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9ğüşöçı]/gi, '');
}

function digitsCore(s: string): string {
  const d = String(s ?? '').replace(/\D/g, '');
  const s0 = d.replace(/^0+/, '');
  return s0 || (d ? '0' : '');
}

/** Rapor satırından müteahhit + belge ipuçları (çip belge no ile ikincil eşleşme) */
export function belgeHintsFromRapor(rd: Record<string, string> | null | undefined): string[] {
  if (!rd) return [];
  const keys = ['ruhsatNo', 'kod', 'idare'] as const;
  const out: string[] = [];
  for (const k of keys) {
    const v = digitsCore(String(rd[k] ?? ''));
    if (v.length >= 4) out.push(v);
  }
  return out;
}

export function findChipRowForMuteahhit(
  chips: ChipRowLite[],
  muteahhit: string,
  belgeHints: string[]
): ChipRowLite | null {
  const list = (chips || []).filter(c => !c.pasif);
  const nk = normalizeCompanyKeyTr(muteahhit);

  if (nk.length >= 3) {
    for (const c of list) {
      const ck = normalizeCompanyKeyTr(String(c.firma ?? ''));
      if (!ck) continue;
      if (ck === nk) return c;
    }
    for (const c of list) {
      const ck = normalizeCompanyKeyTr(String(c.firma ?? ''));
      if (!ck) continue;
      if (nk.length >= 5 && ck.includes(nk)) return c;
      if (ck.length >= 5 && nk.includes(ck)) return c;
    }
    for (const c of list) {
      const ck = normalizeCompanyKeyTr(String(c.firma ?? ''));
      if (ck.length >= 6 && nk.length >= 6) {
        const preN = nk.slice(0, Math.min(10, nk.length));
        const preC = ck.slice(0, Math.min(10, ck.length));
        if (preN.length >= 6 && (ck.includes(preN) || nk.includes(preC))) return c;
      }
    }
  }

  const hints = belgeHints.filter(Boolean);
  if (hints.length) {
    for (const c of list) {
      const bd = digitsCore(String(c.belge ?? c.firma ?? ''));
      if (bd.length >= 4 && hints.includes(bd)) return c;
    }
  }

  return null;
}

export type ChipYeterlilik = {
  durum:
    | 'yok_veri'
    | 'yok_rapor'
    | 'yok_muteahhit'
    | 'yok_cip'
    | 'pln_yok'
    | 'yeterli'
    | 'eksik'
    | 'bilinmiyor';
  kal: number | null;
  gerekli: number;
  eslesenFirma: string | null;
};

export function chipYeterlilikForNumune(opts: {
  planliAdet: number;
  chip: ChipRowLite | null;
  /** Rapor defteri satırı var mı (YİBF eşlemesi) */
  raporVar: boolean;
  /** Müteahhit adı veya belge ipucu ile eşleşme mümkün mü */
  eslemeKaynagiVar: boolean;
  chipListesiBos: boolean;
}): ChipYeterlilik {
  const gerekli = Math.max(0, opts.planliAdet);
  if (opts.chipListesiBos) {
    return { durum: 'yok_veri', kal: null, gerekli, eslesenFirma: null };
  }
  if (!opts.raporVar) {
    return { durum: 'yok_rapor', kal: null, gerekli, eslesenFirma: null };
  }
  if (!opts.eslemeKaynagiVar) {
    return { durum: 'yok_muteahhit', kal: null, gerekli, eslesenFirma: null };
  }
  if (!opts.chip) {
    return { durum: 'yok_cip', kal: null, gerekli, eslesenFirma: null };
  }
  const kalRaw = opts.chip.kal;
  const kal = typeof kalRaw === 'number' && !Number.isNaN(kalRaw) ? kalRaw : null;
  const firma = String(opts.chip.firma ?? '').trim() || null;
  if (gerekli <= 0) {
    if (kal === null) return { durum: 'bilinmiyor', kal: null, gerekli: 0, eslesenFirma: firma };
    return { durum: 'pln_yok', kal, gerekli: 0, eslesenFirma: firma };
  }
  if (kal === null) {
    return { durum: 'bilinmiyor', kal: null, gerekli, eslesenFirma: firma };
  }
  if (kal >= gerekli) {
    return { durum: 'yeterli', kal, gerekli, eslesenFirma: firma };
  }
  return { durum: 'eksik', kal, gerekli, eslesenFirma: firma };
}
