import { filterRaporStorageRows, mergeRaporMaps } from '@/lib/rapor-defter-lookup';

const FS_COLLECTION = 'sys_config';
const FS_DOC_ID = 'rapor_defteri';

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
    if (!doc || !Array.isArray(doc.rows) || !doc.rows.length) return null;
    return {
      rows: doc.rows,
      map: doc.map && typeof doc.map === 'object' ? (doc.map as Record<string, unknown>) : {},
    };
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
    await win.fsSet(FS_COLLECTION, FS_DOC_ID, {
      rows,
      map,
      updatedAt: new Date().toISOString(),
    });
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
    if (fs?.rows?.length) {
      raw = fs.rows;
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
