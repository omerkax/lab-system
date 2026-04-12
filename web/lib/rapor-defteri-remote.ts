import { filterRaporStorageRows, mergeRaporMaps } from '@/lib/rapor-defter-lookup';
import { normalizeYibfLookupKey } from '@/lib/yibf-utils';

const FS_COLLECTION = 'sys_config';
const FS_DOC_ID = 'rapor_defteri';

/** Firestore dokümanı ~1MB sınırı; tam satırlar büyükse yalnızca map yazılır. */
export const RAPOR_FIRESTORE_ROWS_JSON_MAX = 650_000;

/** Kalıcı map’ten (YİBF → bilgi) minimal rapor satırları — GET /api/rapor boşken yedek. */
export function synthesizeRaporRowsFromPersistedMap(map: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const seenNorm = new Set<string>();
  for (const [mapKey, val] of Object.entries(map)) {
    if (!val || typeof val !== 'object') continue;
    const m = val as Record<string, unknown>;
    const yibf = String(m.yibf ?? mapKey ?? '')
      .trim()
      .replace(/^0+/, '');
    if (!yibf) continue;
    const norm = normalizeYibfLookupKey(yibf);
    if (!norm || seenNorm.has(norm)) continue;
    seenNorm.add(norm);
    out.push({
      yibf,
      sahip: String(m.yapiSahibi ?? m.sahip ?? ''),
      yd: String(m.yapiDenetim ?? m.yd ?? ''),
      talepEden: String(m.talepEden ?? ''),
      bolum: String(m.yapiBolumu ?? m.bolum ?? ''),
      blok: String(m.blok ?? ''),
      beton: String(m.betonFirmasi ?? m.beton ?? ''),
      adres: String(m.adres ?? ''),
      pafta: String(m.pafta ?? ''),
      ada: String(m.ada ?? ''),
      parsel: String(m.parsel ?? ''),
      ruhsatNo: String(m.ruhsatNo ?? ''),
      idare: String(m.idare ?? ''),
      muteahhit: String(m.muteahhit ?? m.contractor ?? ''),
      tip: String(m.tip ?? ''),
      yil: String(m.yil ?? ''),
      kod: String(m.kod ?? ''),
      alinTarih: String(m.alinTarih ?? ''),
      labTarih: String(m.labTarih ?? ''),
      fiyat: String(m.fiyat ?? ''),
      sinif: String(m.sinif ?? ''),
      cins: String(m.cins ?? ''),
      lab: String(m.lab ?? ''),
    });
  }
  return out;
}

export async function loadRaporDefteriFromFirestore(w: Window): Promise<{
  rows: unknown[];
  map: Record<string, unknown>;
} | null> {
  const win = w as unknown as {
    fsGetDocQuiet?: (c: string, id: string) => Promise<Record<string, unknown> | null>;
    fsGetDoc?: (c: string, id: string) => Promise<Record<string, unknown> | null>;
  };
  const getDoc = typeof win.fsGetDocQuiet === 'function' ? win.fsGetDocQuiet : win.fsGetDoc;
  if (typeof getDoc !== 'function') return null;
  try {
    const doc = await getDoc(FS_COLLECTION, FS_DOC_ID);
    if (!doc) return null;
    let rows = Array.isArray(doc.rows) ? [...doc.rows] : [];
    const map = doc.map && typeof doc.map === 'object' ? (doc.map as Record<string, unknown>) : {};
    if (!rows.length && Object.keys(map).length) {
      rows = synthesizeRaporRowsFromPersistedMap(map) as unknown[];
    }
    if (!rows.length && !Object.keys(map).length) return null;
    return { rows, map };
  } catch {
    return null;
  }
}

export async function persistRaporDefteriToFirestore(
  w: Window,
  rows: unknown[],
  map: Record<string, unknown>
): Promise<boolean> {
  const win = w as unknown as { fsSet?: (c: string, id: string, o: Record<string, unknown>) => Promise<unknown> };
  if (typeof win.fsSet !== 'function') return false;
  try {
    let rowsToStore: unknown[] = rows;
    let rowsOmitted = false;
    try {
      const s = JSON.stringify(rows);
      if (s.length > RAPOR_FIRESTORE_ROWS_JSON_MAX) {
        rowsToStore = [];
        rowsOmitted = true;
      }
    } catch {
      rowsToStore = [];
      rowsOmitted = true;
    }
    const payload: Record<string, unknown> = {
      map,
      updatedAt: new Date().toISOString(),
      rows: rowsToStore,
    };
    if (rowsOmitted) payload.rowsOmitted = true;
    await win.fsSet(FS_COLLECTION, FS_DOC_ID, payload);
    return true;
  } catch (e) {
    console.warn('[rapor-defteri] Firestore kayıt:', e);
    return false;
  }
}

/** GET /api/rapor boşsa (ör. Vercel’de başka instance) Firestore’dan doldurur. */
export async function fetchRaporDefteriWithFallback(w: Window): Promise<{
  rows: unknown[];
  map: ReturnType<typeof mergeRaporMaps>;
}> {
  let raw: unknown[] = [];
  let sourceMap: Record<string, unknown> = {};
  try {
    const res = await fetch('/api/rapor');
    const json = (await res.json()) as { rows?: unknown[]; map?: unknown; data?: unknown };
    raw = Array.isArray(json.rows) ? json.rows : [];
    const fromJson =
      (json.map && typeof json.map === 'object' ? json.map : null) ||
      (json.data && typeof json.data === 'object' ? json.data : null);
    sourceMap = (fromJson || {}) as Record<string, unknown>;
  } catch {
    /* API yok / ağ */
  }

  if (!raw.length) {
    const fs = await loadRaporDefteriFromFirestore(w);
    if (fs) {
      raw = fs.rows || [];
      sourceMap = fs.map || {};
    }
  }

  const rows = filterRaporStorageRows(raw);
  const map = mergeRaporMaps(sourceMap, rows);
  return { rows, map };
}

/** Yerel API + herkesin görebileceği ortak Firestore kopyası. */
export async function syncRaporDefteriRemote(
  w: Window,
  rows: unknown[],
  map: Record<string, unknown>
): Promise<{ cloudOk: boolean }> {
  await fetch('/api/rapor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, map }),
  });
  const cloudOk = await persistRaporDefteriToFirestore(w, rows, map);
  return { cloudOk };
}
