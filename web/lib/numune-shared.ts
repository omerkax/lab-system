/** Numune programı — tür alanları (Firestore `beton_programi` ile uyumlu). */

export type NumuneTurKey = 'beton' | 'karot' | 'celik' | 'diger';

export const NUMUNE_TURLERI: { key: NumuneTurKey; label: string; emoji: string }[] = [
  { key: 'beton', label: 'Beton', emoji: '🏗️' },
  { key: 'karot', label: 'Karot', emoji: '🧱' },
  { key: 'celik', label: 'Çelik', emoji: '🔩' },
  { key: 'diger', label: 'Diğer', emoji: '📋' },
];

export const KAROT_ALT: { key: string; label: string }[] = [
  { key: 'genel', label: 'Genel' },
  { key: 'kentsel', label: 'Kentsel dönüşüm' },
  { key: 'performans', label: 'Performans' },
];

export function numuneTurOf(d: any): NumuneTurKey {
  const t = String(d?.numuneTur ?? '').trim().toLowerCase();
  if (t === 'karot' || t === 'celik' || t === 'diger') return t;
  return 'beton';
}

export function localDateISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Başlangıç–bitiş (yyyy-mm-dd) dahil; boş bitiş = sınırsız üst. */
export function filterDocsByDateRange(docs: any[], bas: string, bit: string): any[] {
  return docs.filter(d => {
    const t = d.tarih || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    if (bas && t < bas) return false;
    if (bit && t > bit) return false;
    return true;
  });
}

/** `personeller[]` öncelikli; yoksa tekil `personel` metni (eski kayıtlar). */
export function personelListesi(d: any): string[] {
  const arr = d?.personeller;
  if (Array.isArray(arr) && arr.length) {
    const out = arr.map((x: unknown) => String(x).trim()).filter(Boolean);
    if (out.length) return [...new Set(out)];
  }
  const one = String(d?.personel ?? '').trim();
  return one ? [one] : [];
}

/** Firestore’da geriye dönük uyumluluk: ilk isim. */
export function personelBirincil(d: any): string {
  return personelListesi(d)[0] || '';
}

/** Görünüm / arama / CSV için tek metin */
export function personelKayitMetni(d: any): string {
  return personelListesi(d).join(', ');
}

/** Personel adı eşlemesi (büyük/küçük harf, fazla boşluk) */
export function normPersonelAd(x: string): string {
  return String(x || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** beton_programi satırı bu personele atanmış mı? */
export function betonRowAssignedToPersonelAd(d: any, personelAdTrimmed: string): boolean {
  const adNorm = normPersonelAd(personelAdTrimmed);
  if (!adNorm) return false;
  const people = personelListesi(d);
  if (people.some(p => normPersonelAd(p) === adNorm)) return true;
  return normPersonelAd(String(d.personel || '')) === adNorm;
}
