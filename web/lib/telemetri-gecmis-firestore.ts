/**
 * Havuz sıcaklık geçmişi — tarayıcı localStorage yerine Firestore (sys_config).
 * Tüm lab oturumları aynı geçmişi görür; Vercel /tmp sorunu yok.
 */

const FS_COLLECTION = 'sys_config';
const FS_DOC_ID = 'telemetri_gecmis';
/** Eski sürüm; bir kez okunup Firestore’a taşınır ve silinir */
const LEGACY_LS_KEY = 'ebistr-tel-gecmis-v1';

export type TelGecmisPoolKey = '1' | '2';
export type TelGecmisSatir = { sicaklik: number; zaman: string };

export const TEL_GECMIS_MAX_PER_POOL = 200;

export function emptyTelGecmis(): Record<TelGecmisPoolKey, TelGecmisSatir[]> {
  return { '1': [], '2': [] };
}

function sanitizePool(arr: unknown[]): TelGecmisSatir[] {
  return arr
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => ({
      zaman: String(r.zaman ?? ''),
      sicaklik: Number(r.sicaklik),
    }))
    .filter((r) => r.zaman && Number.isFinite(r.sicaklik));
}

function docPools(doc: Record<string, unknown> | null): Record<TelGecmisPoolKey, TelGecmisSatir[]> {
  if (!doc) return emptyTelGecmis();
  const p1 = doc.pool1 ?? doc['1'];
  const p2 = doc.pool2 ?? doc['2'];
  return {
    '1': Array.isArray(p1) ? sanitizePool(p1) : [],
    '2': Array.isArray(p2) ? sanitizePool(p2) : [],
  };
}

export async function loadTelemetriGecmisFromFirestore(w: Window): Promise<Record<TelGecmisPoolKey, TelGecmisSatir[]>> {
  const win = w as unknown as {
    fsGetDocQuiet?: (c: string, id: string) => Promise<Record<string, unknown> | null>;
    fsGetDoc?: (c: string, id: string) => Promise<Record<string, unknown> | null>;
  };
  const getDoc = typeof win.fsGetDocQuiet === 'function' ? win.fsGetDocQuiet : win.fsGetDoc;
  if (typeof getDoc !== 'function') return emptyTelGecmis();
  try {
    const doc = await getDoc(FS_COLLECTION, FS_DOC_ID);
    return docPools(doc);
  } catch {
    return emptyTelGecmis();
  }
}

export async function persistTelemetriGecmisToFirestore(
  w: Window,
  data: Record<TelGecmisPoolKey, TelGecmisSatir[]>
): Promise<boolean> {
  const win = w as unknown as { fsSet?: (c: string, id: string, o: Record<string, unknown>) => Promise<unknown> };
  if (typeof win.fsSet !== 'function') return false;
  try {
    await win.fsSet(FS_COLLECTION, FS_DOC_ID, {
      pool1: (data['1'] || []).slice(0, TEL_GECMIS_MAX_PER_POOL),
      pool2: (data['2'] || []).slice(0, TEL_GECMIS_MAX_PER_POOL),
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('[telemetri-gecmis] Firestore yazılamadı:', e);
    return false;
  }
}

/** Firestore boşsa eski localStorage geçmişini taşır (tek sefer). */
export async function loadTelemetriGecmisWithMigration(w: Window): Promise<Record<TelGecmisPoolKey, TelGecmisSatir[]>> {
  let data = await loadTelemetriGecmisFromFirestore(w);
  if (data['1'].length || data['2'].length) return data;

  if (typeof localStorage === 'undefined') return data;
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return data;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const merged: Record<TelGecmisPoolKey, TelGecmisSatir[]> = {
      '1': Array.isArray(o['1']) ? sanitizePool(o['1'] as unknown[]) : [],
      '2': Array.isArray(o['2']) ? sanitizePool(o['2'] as unknown[]) : [],
    };
    if (merged['1'].length || merged['2'].length) {
      await persistTelemetriGecmisToFirestore(w, merged);
      localStorage.removeItem(LEGACY_LS_KEY);
      return merged;
    }
  } catch {
    /* ignore */
  }
  return data;
}

export function mergePoolReadings(
  all: Record<TelGecmisPoolKey, TelGecmisSatir[]>,
  no: TelGecmisPoolKey,
  apiRows: TelGecmisSatir[]
): Record<TelGecmisPoolKey, TelGecmisSatir[]> {
  const map = new Map<string, TelGecmisSatir>();
  for (const r of all[no]) {
    if (r.zaman) map.set(r.zaman, r);
  }
  for (const r of apiRows) {
    if (r.zaman && Number.isFinite(r.sicaklik)) map.set(r.zaman, r);
  }
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.zaman).getTime() - new Date(a.zaman).getTime()
  );
  return { ...all, [no]: merged.slice(0, TEL_GECMIS_MAX_PER_POOL) };
}

export async function clearTelemetriGecmisFirestore(w: Window): Promise<boolean> {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
  return persistTelemetriGecmisToFirestore(w, emptyTelGecmis());
}
