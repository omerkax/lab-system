import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { mergeRaporMaps } from '@/lib/rapor-defter-lookup';
import { getEbistrDataDir } from '@/lib/ebistr-engine';

function raporPaths() {
  const DATA_DIR = getEbistrDataDir();
  return { DATA_DIR, RAPOR_FILE: path.join(DATA_DIR, 'rapor-defteri.json') };
}

async function ensureDir() {
  const { DATA_DIR } = raporPaths();
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

// GET → rapor defteri JSON (YİBF lookup + full rows)
export async function GET() {
  await ensureDir();
  const { RAPOR_FILE } = raporPaths();
  if (!existsSync(RAPOR_FILE)) {
    return NextResponse.json({ ok: true, rows: [], map: {}, data: {} });
  }
  const content = await readFile(RAPOR_FILE, 'utf-8');
  const stored = JSON.parse(content);

  // Support both old format (flat map) and new format ({ rows, map })
  if (Array.isArray(stored.rows)) {
    const rows = stored.rows;
    const persisted = stored.map && typeof stored.map === 'object' ? stored.map : {};
    const map = mergeRaporMaps(persisted as Record<string, unknown>, rows);
    return NextResponse.json({ ok: true, rows, map, data: map });
  }
  // Old format: stored is the flat yibf map
  return NextResponse.json({ ok: true, rows: [], map: stored, data: stored });
}

// POST { rows: [...], map: { [yibf]: {...} } }
// Also accepts legacy { data: { [yibf]: {...} } } for backward compat
export async function POST(req: NextRequest) {
  await ensureDir();
  const { RAPOR_FILE } = raporPaths();
  try {
    const body = await req.json();
    let toStore: any;
    if (body.rows !== undefined) {
      toStore = { rows: body.rows, map: body.map || body.data || {} };
    } else {
      // Legacy: just the map
      toStore = { rows: [], map: body.data || {} };
    }
    await writeFile(RAPOR_FILE, JSON.stringify(toStore, null, 2), 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
