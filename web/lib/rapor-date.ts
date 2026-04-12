/**
 * Rapor defteri tarihleri: Türkiye defterinde gün-ay-yıl (DD/MM/YYYY veya DD.MM.YYYY).
 * `new Date("…")` ile ayrıştırma yapılmaz (çoğu ortamda MM/DD/YYYY sanılır).
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[T\sZz]|$)/;
const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s|$|[TtZz])/;

/** Excel 1900 tarih serisi → YYYY-MM-DD (kesir gün yok sayılır); makul yıl aralığında değilse null. */
function excelSerialToIso(serial: number): string | null {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const whole = Math.floor(serial + 1e-9);
  if (whole < 2 || whole > 6000000) return null;
  const utcDays = whole - 25569;
  const d = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  const y = parseInt(iso.slice(0, 4), 10);
  if (y < 1900 || y > 2100) return null;
  return iso;
}

/**
 * Ham hücre → depolama için YYYY-MM-DD.
 * Öncelik: ISO önek, Date (yerel takvim günü), Excel serisi, sonra DD/MM/YYYY metni.
 */
export function parseRaporDateToIso(input: unknown): string {
  if (input == null || input === '') return '';
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const y = input.getFullYear();
    const m = input.getMonth() + 1;
    const d = input.getDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const fromExcel = excelSerialToIso(input);
    if (fromExcel) return fromExcel;
    if (input > 1e12) {
      const d = new Date(input);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return '';
  }
  const t = String(input).trim();
  if (!t) return '';
  const isoM = t.match(ISO_DAY);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  const ymdSlash = t.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s|$|[TtZz])/);
  if (ymdSlash) return `${ymdSlash[1]}-${ymdSlash[2]}-${ymdSlash[3]}`;
  const m = t.match(DMY);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

/** Hücre değeri (Date / seri / metin) → tabloda GG.AA.YYYY veya boş. */
export function formatRaporDateCell(v: unknown): string {
  const iso = parseRaporDateToIso(v);
  return iso ? formatRaporDateForUi(iso) : '';
}

/** Tabloda GG.AA.YYYY; zaten ISO ise çevirir; ayrıştıramazsa kısaltılmış metni döner. */
export function formatRaporDateForUi(s: string): string {
  if (!s) return '';
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.slice(0, 10))) {
    const p = t.slice(0, 10).split('-');
    return `${p[2]}.${p[1]}.${p[0]}`;
  }
  const iso = parseRaporDateToIso(t);
  if (iso) {
    const p = iso.split('-');
    return `${p[2]}.${p[1]}.${p[0]}`;
  }
  return t.length > 24 ? t.slice(0, 24) + '…' : t;
}
