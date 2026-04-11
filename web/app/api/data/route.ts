import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { ebistrNumuneRowKey } from '@/lib/ebistr-numune-key';

const DATA_DIR = path.join(process.cwd(), 'data');

async function ensureDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

// GET /api/data?type=ebistr-numuneler  → dosya listesi veya son veri
// awaitSync=1 → EBİSTR’den tam çekim beklenir (token varsa); warmSync=1 → önbellek >~40 sn ise arka planda çekim
export async function GET(req: NextRequest) {
  await ensureDir();
  const type = req.nextUrl.searchParams.get('type') || 'ebistr-numuneler';
  const latest = req.nextUrl.searchParams.get('latest') === '1';
  const awaitSync = req.nextUrl.searchParams.get('awaitSync') === '1';
  const warmSync = req.nextUrl.searchParams.get('warmSync') === '1';

  try {
    if (latest && type === 'ebistr-numuneler' && (awaitSync || warmSync)) {
      try {
        const { getStatus, performSync } = await import('@/lib/ebistr-engine');
        const s = getStatus();
        if (s.loggedIn && !s.isSyncing) {
          const lastMs = s.lastSync ? new Date(s.lastSync).getTime() : 0;
          const staleMs = lastMs ? Date.now() - lastMs : Infinity;
          if (awaitSync && staleMs > 8_000) {
            await performSync().catch((e: unknown) =>
              console.warn('[api/data] awaitSync performSync:', e instanceof Error ? e.message : e)
            );
          } else if (warmSync && staleMs > 40_000) {
            void performSync().catch(() => {});
          }
        }
      } catch {
        /* Edge / engine yok */
      }
    }

    const files = await readdir(DATA_DIR);
    const matching = files
      .filter(f => f.startsWith(type) && f.endsWith('.json'))
      .sort();

    if (latest && matching.length > 0) {
      // Birleşik kaynak: `${type}.json` varsa onu kullan (timestamp'li yedeklerden önce)
      const canonical = `${type}.json`;
      const pick = matching.includes(canonical) ? canonical : matching[matching.length - 1];
      const content = await readFile(path.join(DATA_DIR, pick), 'utf-8');
      return NextResponse.json({ ok: true, file: pick, data: JSON.parse(content) });
    }

    return NextResponse.json({ ok: true, files: matching.slice().reverse() });
  } catch {
    return NextResponse.json({ ok: false, error: 'Okunamadı' }, { status: 500 });
  }
}

// POST /api/data  body: { type, data, versioned? }
// Varsayılan: mevcut dosyayla birleştirir — yeni kayıtları ekler, eskiyi korur
// versioned:true → timestamp'li ayrı dosya (eski davranış)
// merge:false    → direkt üstüne yazar, birleştirme olmaz
export async function POST(req: NextRequest) {
  await ensureDir();
  try {
    const body = await req.json();
    const type    = body.type || 'data';
    const merge   = body.merge !== false;          // varsayılan: true
    const newData = body.data;

    // versioned mod → ayrı dosya
    if (body.versioned) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${type}_${ts}.json`;
      await writeFile(path.join(DATA_DIR, filename), JSON.stringify(newData, null, 2), 'utf-8');
      return NextResponse.json({ ok: true, file: filename, added: -1 });
    }

    const filename = `${type}.json`;
    const filepath = path.join(DATA_DIR, filename);

    // Mevcut veriyi oku
    let existing: any = null;
    try {
      existing = JSON.parse(await readFile(filepath, 'utf-8'));
    } catch {
      existing = null; // dosya yoksa sıfırdan başla
    }

    let finalData: any;
    let added = 0;

    if (merge && Array.isArray(newData) && Array.isArray(existing)) {
      // ebistr-numuneler: satır bazlı anahtar (aynı BRN’de çok numune olabilir)
      const key =
        type === 'ebistr-numuneler'
          ? ebistrNumuneRowKey
          : (item: any): string =>
              item.brnNo ||
              item.labReportNo ||
              [item.yibf || '', (item.alinisZamani || item.alinisDate || '').slice(0, 10), item.sinif || '', item.yapiBolumu || '']
                .join('|');

      const existingKeys = new Set(existing.map(key));
      const onlyNew = newData.filter((item: any) => !existingKeys.has(key(item)));
      added = onlyNew.length;
      finalData = [...existing, ...onlyNew];
    } else if (merge && newData !== null && typeof newData === 'object' && !Array.isArray(newData) &&
               existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      // Object birleştirme: deep merge
      finalData = { ...existing, ...newData };
      added = Object.keys(newData).length;
    } else {
      // Birleştirme kapalı ya da tip uyuşmuyor → direkt yaz
      finalData = newData;
      added = Array.isArray(newData) ? newData.length : 1;
    }

    await writeFile(filepath, JSON.stringify(finalData, null, 2), 'utf-8');
    const total = Array.isArray(finalData) ? finalData.length : 1;
    return NextResponse.json({ ok: true, file: filename, added, total });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

