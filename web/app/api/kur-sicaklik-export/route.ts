import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getCache } from '@/lib/ebistr-engine';
import {
  buildF058DocxtemplaterData,
  docxBufferIssueTr,
  f058TemplateErrorTr,
  mergeTelemetryReadings,
  renderF058DocxWithDocxtemplater,
  resolveF058Template,
  generateExportSlots,
  type KurTelReading,
} from '@/lib/kur-sicaklik-export';

function parseReadings(body: unknown): KurTelReading[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { readings?: unknown }).readings)) {
    return [];
  }
  const out: KurTelReading[] = [];
  for (const r of (body as { readings: unknown[] }).readings) {
    if (!r || typeof r !== 'object') continue;
    const o = r as { havuz?: string; zaman?: string; sicaklik?: unknown };
    const havuz = o.havuz === '2' ? '2' : o.havuz === '1' ? '1' : null;
    const zaman = String(o.zaman || '').trim();
    const sicaklik = Number(o.sicaklik);
    if (!havuz || !zaman || Number.isNaN(sicaklik)) continue;
    out.push({ havuz, zaman, sicaklik });
  }
  return out;
}

/** Şablon durumu + yer tutucu özeti (Telemetri sayfası) */
export async function GET() {
  const tpl = resolveF058Template();
  let docxIssue: string | null = null;
  if (tpl.docxPath) {
    try {
      docxIssue = docxBufferIssueTr(fs.readFileSync(tpl.docxPath));
    } catch {
      docxIssue = 'Şablon dosyası okunamadı.';
    }
  }
  const hasValidDocx = !!tpl.docxPath && !docxIssue;
  return NextResponse.json({
    ok: true,
    repoRoot: tpl.repoRoot,
    hasDocx: hasValidDocx,
    hasDocOnly: !!tpl.docPath && !tpl.docxPath,
    docxPath: tpl.docxPath,
    docxFileName: tpl.docxPath ? path.basename(tpl.docxPath) : null,
    docxCandidates: tpl.docxCandidates,
    docFileName: tpl.docPath ? path.basename(tpl.docPath) : null,
    errorHint: !tpl.docxPath ? f058TemplateErrorTr(tpl) : docxIssue,
    yerTutucuDosyasi: 'web/data/f058-yer-tutucular.txt',
  });
}

export async function POST(req: NextRequest) {
  try {
    const tpl = resolveF058Template();
    if (!tpl.docxCandidates.length) {
      return NextResponse.json({ ok: false, error: f058TemplateErrorTr(tpl) }, { status: 400 });
    }

    const body = await req.json();
    let chosen = typeof body.templateFileName === 'string' ? path.basename(body.templateFileName.trim()) : '';
    if (!chosen || !tpl.docxCandidates.includes(chosen)) {
      chosen = tpl.docxPath ? path.basename(tpl.docxPath) : tpl.docxCandidates[0];
    }
    const docxPath = path.join(tpl.repoRoot, chosen);
    if (!fs.existsSync(docxPath)) {
      return NextResponse.json({ ok: false, error: 'Seçilen şablon dosyası bulunamadı.' }, { status: 400 });
    }
    try {
      const bad = docxBufferIssueTr(fs.readFileSync(docxPath));
      if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });
    } catch {
      return NextResponse.json({ ok: false, error: 'Şablon dosyası okunamadı.' }, { status: 400 });
    }

    const dateFrom = String(body.dateFrom || '').trim().slice(0, 10);
    const dateTo = String(body.dateTo || '').trim().slice(0, 10);
    const intervalHours = Number(body.intervalHours);
    const jitter = !!body.jitter;
    const clientReadings = parseReadings(body);
    const kontrolEden = String(body.kontrolEden ?? '').trim().slice(0, 200);
    let havuzMode: 'both' | '1' | '2' = 'both';
    if (body.havuzMode === '1') havuzMode = '1';
    else if (body.havuzMode === '2') havuzMode = '2';
    const rawSlot = String(body.slotBaslangicSaati ?? '').trim();
    const slotM = rawSlot.match(/^(\d{1,2}:\d{2})/);
    const slotBaslangicSaati = slotM ? slotM[1] : '';
    const formTarihi = String(body.formTarihi ?? '').trim().slice(0, 10);
    const rawFormSaat = String(body.formSaati ?? '').trim();
    const formSaatM = rawFormSaat.match(/^(\d{1,2}:\d{2})/);
    const formSaati = formSaatM ? formSaatM[1] : '';
    if (formTarihi && !/^\d{4}-\d{2}-\d{2}$/.test(formTarihi)) {
      return NextResponse.json({ ok: false, error: 'Form tarihi YYYY-AA-GG olmalı veya boş bırakın.' }, { status: 400 });
    }
    if (rawFormSaat && !formSaatM) {
      return NextResponse.json({ ok: false, error: 'Form saati SS:DD olmalı veya boş bırakın.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ ok: false, error: 'Başlangıç ve bitiş tarihi YYYY-AA-GG olmalı.' }, { status: 400 });
    }
    if (dateFrom > dateTo) {
      return NextResponse.json({ ok: false, error: 'Başlangıç tarihi bitişten sonra olamaz.' }, { status: 400 });
    }
    if (!Number.isFinite(intervalHours) || intervalHours < 0.25 || intervalHours > 168) {
      return NextResponse.json(
        { ok: false, error: 'Aralık 0,25 ile 168 saat arasında olmalı.' },
        { status: 400 }
      );
    }

    const slots = generateExportSlots(dateFrom, dateTo, intervalHours, jitter, slotBaslangicSaati || undefined);
    if (slots.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Bu aralık ve aralık süresiyle satır üretilemedi; tarihleri kontrol edin.' },
        { status: 400 }
      );
    }

    const cache = getCache();
    const readings = mergeTelemetryReadings(cache.telemetry || [], clientReadings);

    const data = buildF058DocxtemplaterData({
      dateFrom,
      dateTo,
      intervalHours,
      jitter,
      readings,
      havuzMode,
      kontrolEden,
      slotBaslangicSaati: slotBaslangicSaati || undefined,
      formTarihi: formTarihi || undefined,
      formSaati: formSaati || undefined,
    });

    let buf: Buffer;
    try {
      buf = await renderF058DocxWithDocxtemplater(docxPath, data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          ok: false,
          error:
            'Şablon doldurulamadı. Word’de yer tutucuların tam olduğundan emin olun: web/data/f058-yer-tutucular.txt — ' +
            msg,
        },
        { status: 400 }
      );
    }

    const templateBase = chosen;
    const stem = templateBase.replace(/\.docx$/i, '');
    const fname = `${stem} doldurulmus ${dateFrom} ${dateTo}.docx`;
    const asciiFallback = fname.replace(/[^\x20-\x7E.()-]/g, '_');
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
