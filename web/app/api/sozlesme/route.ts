import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';

const DATA_DIR = path.join(process.cwd(), 'data');
const SOZLESME_FILE = path.join(DATA_DIR, 'sozlesmeler.json');
const TEMPLATE_PATH = path.join(process.cwd(), 'data', 'sozlesme-taslak.docx');
// Fallback: check multiple locations for the template
const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), 'data', 'sozlesme-taslak.docx'),
  '/Users/omerkaya/Desktop/alibey-v2/sozlesme-taslak.docx',
];

async function ensureDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

// GET → list all contracts
export async function GET() {
  await ensureDir();
  if (!existsSync(SOZLESME_FILE)) {
    return NextResponse.json({ ok: true, rows: [] });
  }
  const content = await readFile(SOZLESME_FILE, 'utf-8');
  return NextResponse.json({ ok: true, rows: JSON.parse(content) });
}

// POST { action: 'save', data: {...} } → save contract summary
// POST { action: 'generate', data: {...} } → generate filled Word doc
export async function POST(req: NextRequest) {
  await ensureDir();
  try {
    const body = await req.json();
    const { action, data } = body;

    if (action === 'save') {
      let rows: any[] = [];
      if (existsSync(SOZLESME_FILE)) {
        rows = JSON.parse(await readFile(SOZLESME_FILE, 'utf-8'));
      }
      const id = data.id || `soz-${Date.now()}`;
      const existing = rows.findIndex((r: any) => r.id === id);
      const record = { ...data, id, olusturma: data.olusturma || new Date().toISOString() };
      if (existing >= 0) rows[existing] = record;
      else rows.unshift(record);
      await writeFile(SOZLESME_FILE, JSON.stringify(rows, null, 2), 'utf-8');
      return NextResponse.json({ ok: true, id });
    }

    if (action === 'generate') {
      // Find template
      let templatePath: string | null = null;
      for (const c of TEMPLATE_CANDIDATES) {
        if (existsSync(c)) { templatePath = c; break; }
      }
      if (!templatePath) {
        return NextResponse.json({ ok: false, error: 'Sözleşme şablonu bulunamadı. data/sozlesme-taslak.docx dosyasını kopyalayın.' }, { status: 404 });
      }

      const PizZip = require('pizzip');
      const Docxtemplater = require('docxtemplater');

      const buf = await readFile(templatePath);
      const zip = new PizZip(buf);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
      });

      doc.render(data);

      const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

      return new NextResponse(out, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="sozlesme-${data.yibf || 'taslak'}.docx"`,
        },
      });
    }

    return NextResponse.json({ ok: false, error: 'Geçersiz action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
