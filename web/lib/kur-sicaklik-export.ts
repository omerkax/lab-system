import fs from 'fs';
import path from 'path';

export type KurTelReading = { havuz: '1' | '2'; zaman: string; sicaklik: number };

const F058_DOCX_RE = /^F058.*\.docx$/i;
const F058_DOC_RE = /^F058.*\.doc$/i;

/** Resmi formun beklenen .docx adı (kök dizinde) */
export const F058_OFFICIAL_DOCX_NAME = 'F058 KÜR TANKI-HAVUZU SU SICAKLIĞI TAKİP FORMU.docx';

/**
 * cari-3 proje kökü — yalnızca burada F058 şablonu aranır (web/ içi yok sayılır).
 * next dev cwd genelde web/ olduğundan bir üst dizin kök kabul edilir.
 */
export function getCariRepoRoot(): string {
  const cwd = path.resolve(process.cwd());
  const webPkg = path.join(cwd, 'package.json');
  const parentWebPkg = path.join(cwd, 'web', 'package.json');
  if (fs.existsSync(webPkg) && path.basename(cwd) === 'web') {
    return path.resolve(cwd, '..');
  }
  if (fs.existsSync(parentWebPkg)) {
    return cwd;
  }
  const up = path.resolve(cwd, '..');
  if (fs.existsSync(path.join(up, 'web', 'package.json'))) {
    return up;
  }
  return cwd;
}

function normName(s: string): string {
  return s.normalize('NFC').toLowerCase();
}

function scoreF058DocxBasename(name: string): number {
  const n = normName(name);
  if (n === normName(F058_OFFICIAL_DOCX_NAME)) return 100;
  if (/\s-\s*2\.docx$/i.test(name) || n.endsWith(' - 2.docx')) return 95;
  if (n.includes(' - 2.docx')) return 95;
  if (n.includes('takip') && (n.includes('kur') || n.includes('kür'))) return 50;
  if (n.includes('takip') || n.includes('tank') || n.includes('kur')) return 40;
  return 10;
}

/** Aday listesi: yalnızca dosya adları, sıralı */
export function listF058DocxBasenamesInRoot(repoRoot: string): string[] {
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) return [];
  let files: string[];
  try {
    files = fs.readdirSync(repoRoot);
  } catch {
    return [];
  }
  return files.filter((f) => F058_DOCX_RE.test(f)).sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Birden fazla F058*.docx varsa “ - 2” varyantı / resmi ad öne alınır */
export function pickPreferredF058Docx(docxBasenames: string[]): string | null {
  if (docxBasenames.length === 0) return null;
  if (docxBasenames.length === 1) return docxBasenames[0];
  const ranked = [...docxBasenames].sort((a, b) => {
    const s = scoreF058DocxBasename(b) - scoreF058DocxBasename(a);
    if (s !== 0) return s;
    return b.length - a.length;
  });
  return ranked[0];
}

/** Yalnızca proje kök dizininde (cari-3) — web/ altında aranmaz */
export function resolveF058Template(): {
  docxPath: string | null;
  docPath: string | null;
  repoRoot: string;
  docxCandidates: string[];
} {
  const repoRoot = getCariRepoRoot();
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    return { docxPath: null, docPath: null, repoRoot, docxCandidates: [] };
  }
  let files: string[];
  try {
    files = fs.readdirSync(repoRoot);
  } catch {
    return { docxPath: null, docPath: null, repoRoot, docxCandidates: [] };
  }
  const docxCandidates = listF058DocxBasenamesInRoot(repoRoot);
  const docxName = pickPreferredF058Docx(docxCandidates);
  const docName = files.find((f) => F058_DOC_RE.test(f) && !/\.docx$/i.test(f)) || null;
  return {
    docxPath: docxName ? path.join(repoRoot, docxName) : null,
    docPath: docName ? path.join(repoRoot, docName) : null,
    repoRoot,
    docxCandidates,
  };
}

export function f058TemplateErrorTr(res: ReturnType<typeof resolveF058Template>): string {
  if (res.docPath && !res.docxPath) {
    return (
      'Kök dizinde yalnızca .doc dosyası var; sistem bunu programatik dolduramaz. ' +
      'Word’de aynı dosyayı açıp “Farklı Kaydet → Word Belgesi (.docx)” ile kaydedin (düzen aynı kalır). ' +
      'Dosya adı F058 ile başlamalı. Sonra şablona yer tutucuları ekleyin; ayrıntı: web/data/f058-yer-tutucular.txt'
    );
  }
  return (
    'F058 ile başlayan .docx şablonu proje kökünde bulunamadı (cari-3 klasörü; web/ altı aranmaz). ' +
    `Beklenen örnek ad: ${F058_OFFICIAL_DOCX_NAME} — Word’den .docx kaydedip bu dizine koyun. ` +
    'Yer tutucular: web/data/f058-yer-tutucular.txt'
  );
}

function havuzNoFromName(name: string): '1' | '2' | null {
  if (/-1\b/.test(name) || name.endsWith('-1')) return '1';
  if (/-2\b/.test(name) || name.endsWith('-2')) return '2';
  return null;
}

export function readingsFromTelemetryItems(items: unknown[]): KurTelReading[] {
  const out: KurTelReading[] = [];
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    const o = item as Record<string, unknown>;
    const sObj = (o.sensor || {}) as Record<string, string>;
    const sensorName = (sObj.name || '').toLowerCase();
    const sensorDesc = (sObj.description || '').toLowerCase();
    const isTemp =
      sensorName.includes('temperature') || sensorDesc.includes('sıcaklık') || sensorDesc.includes('sicaklik');
    if (!isTemp) continue;
    const deptName = String((o.department as { name?: string })?.name ?? '');
    let no = havuzNoFromName(deptName);
    const gatewayId = (o.gateway as { id?: number })?.id;
    if (!no && gatewayId === 1416859) {
      if (deptName.includes('-1')) no = '1';
      else if (deptName.includes('-2')) no = '2';
      else no = '1';
    }
    if (!no) continue;
    const ts = String((o as { timestamp?: string }).timestamp || '');
    const v = Number((o as { value?: unknown }).value);
    if (!ts || Number.isNaN(v)) continue;
    out.push({ havuz: no, zaman: ts, sicaklik: v });
  }
  return out;
}

function dedupeReadings(rows: KurTelReading[]): KurTelReading[] {
  const m = new Map<string, KurTelReading>();
  for (const r of rows) {
    m.set(`${r.havuz}|${r.zaman}`, r);
  }
  return Array.from(m.values());
}

export function mergeTelemetryReadings(cacheItems: unknown[], client: KurTelReading[]): KurTelReading[] {
  return dedupeReadings([...readingsFromTelemetryItems(cacheItems), ...client]);
}

function parseSlotStartHHmm(s: string | undefined): { h: number; m: number } {
  const t = (s ?? '08:00').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { h: 8, m: 0 };
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return { h: 8, m: 0 };
  return { h, m: min };
}

export function generateExportSlots(
  dateFrom: string,
  dateTo: string,
  intervalHours: number,
  jitter: boolean,
  slotBaslangicSaati?: string
): Date[] {
  const startDay = new Date(dateFrom + 'T00:00:00');
  const endDay = new Date(dateTo + 'T23:59:59.999');
  if (Number.isNaN(startDay.getTime()) || Number.isNaN(endDay.getTime()) || startDay > endDay) {
    return [];
  }
  const h = Math.max(0.25, Math.min(168, Number(intervalHours) || 1));
  const intervalMs = h * 3600 * 1000;

  const { h: sh, m: sm } = parseSlotStartHHmm(slotBaslangicSaati);
  let cur = new Date(
    `${dateFrom}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`
  );
  if (Number.isNaN(cur.getTime())) return [];
  if (jitter) cur.setMinutes(cur.getMinutes() + Math.floor(Math.random() * 28));

  const out: Date[] = [];
  while (cur.getTime() <= endDay.getTime()) {
    if (cur.getTime() >= startDay.getTime()) out.push(new Date(cur));
    cur = new Date(cur.getTime() + intervalMs);
    if (jitter) cur.setMinutes(cur.getMinutes() + Math.floor(Math.random() * 47) - 23);
  }
  return out;
}

function nearestSicaklik(
  slot: Date,
  havuz: '1' | '2',
  readings: KurTelReading[],
  windowMs: number
): string {
  const t = slot.getTime();
  let best: { d: number; v: number } | null = null;
  for (const r of readings) {
    if (r.havuz !== havuz) continue;
    const rt = new Date(r.zaman).getTime();
    if (Number.isNaN(rt)) continue;
    const d = Math.abs(rt - t);
    if (d <= windowMs && (!best || d < best.d)) best = { d, v: r.sicaklik };
  }
  if (!best) return '—';
  return best.v.toFixed(1).replace('.', ',');
}

function fmtTrDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTrTime(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formTarihiTrFromYmd(ymd: string | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const d = new Date(ymd + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return fmtTrDate(d);
}

function formSaatiTrFromHHmm(hhmm: string | undefined): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return '';
  const [hs, ms] = hhmm.trim().split(':');
  const h = parseInt(hs, 10);
  const m = parseInt(ms, 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return '';
  return fmtTrTime(new Date(2000, 0, 1, h, m));
}

export type HavuzExportMode = 'both' | '1' | '2';

function havuzNoMetni(mode: HavuzExportMode): string {
  if (mode === '1') return '1';
  if (mode === '2') return '2';
  return '1 ve 2';
}

/** docxtemplater’a verilecek nesne — şablondaki {etiket} adlarıyla birebir */
export function buildF058DocxtemplaterData(opts: {
  dateFrom: string;
  dateTo: string;
  intervalHours: number;
  jitter: boolean;
  readings: KurTelReading[];
  havuzMode?: HavuzExportMode;
  kontrolEden?: string;
  slotBaslangicSaati?: string;
  formTarihi?: string;
  formSaati?: string;
}): Record<string, unknown> {
  const {
    dateFrom,
    dateTo,
    intervalHours,
    jitter,
    readings,
    havuzMode = 'both',
    kontrolEden = '',
    slotBaslangicSaati,
    formTarihi,
    formSaati,
  } = opts;
  const slots = generateExportSlots(dateFrom, dateTo, intervalHours, jitter, slotBaslangicSaati);
  const h = Math.max(0.25, Math.min(168, Number(intervalHours) || 1));
  const windowMs = Math.max(h * 0.55 * 3600 * 1000, 40 * 60 * 1000);

  const d0 = new Date(dateFrom + 'T12:00:00');
  const d1 = new Date(dateTo + 'T12:00:00');

  const aralikEtiket =
    h < 1
      ? `${Math.round(h * 60)} dakika`
      : h === 1
        ? '1 saat'
        : `${h} saat`;
  const jitterEtiket = jitter ? ' (satır zamanları ± dakika kaydırıldı)' : '';

  const satirlar = slots.map((slot) => {
    const h1v = nearestSicaklik(slot, '1', readings, windowMs);
    const h2v = nearestSicaklik(slot, '2', readings, windowMs);
    return {
      tarih: fmtTrDate(slot),
      saat: fmtTrTime(slot),
      h1: havuzMode === '2' ? '—' : h1v,
      h2: havuzMode === '1' ? '—' : h2v,
    };
  });

  const formTr = formTarihiTrFromYmd(formTarihi);
  const havuzEtiket = havuzNoMetni(havuzMode);

  return {
    tarihAraligi: `${fmtTrDate(d0)} — ${fmtTrDate(d1)}`,
    olcumAraligi: `${aralikEtiket}${jitterEtiket}`,
    olusturulma: new Date().toLocaleString('tr-TR'),
    kontrolEden: kontrolEden.trim(),
    havuzNo: havuzEtiket,
    /** Word’de sık yazılan alt çizgili etiket */
    havuz_no: havuzEtiket,
    /** Üst “TARİH : …” satırı — şablonda genelde {tarih}; döngü içindeki satır tarihiyle karışmaz */
    tarih: formTr || fmtTrDate(d0),
    formTarihi: formTr,
    formSaati: formSaatiTrFromHHmm(formSaati),
    satirlar,
  };
}

/**
 * Word, {etiket} ifadesini birden fazla <w:r> içine böldüğünde docxtemplater tanımaz.
 * { + havuz_no + } gibi parçaları tek <w:t> içinde birleştirir.
 */
export function mergeSplitBracePlaceholders(xml: string): string {
  let cur = xml;
  let prev = '';
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(
      /<w:r(\s[^>]*)?>((?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t([^>]*)>\{<\/w:t><\/w:r>(?:<w:proofErr[^>]*\/?>)*<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>([A-Za-z0-9_]+)<\/w:t><\/w:r>(?:<w:proofErr[^>]*\/?>)*<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>\}<\/w:t><\/w:r>/g,
      (_m, rAttrs: string, rPr: string, tOpen: string, ident: string) =>
        `<w:r${rAttrs}>${rPr}<w:t${tOpen}>{${ident}}</w:t></w:r>`
    );
  }
  return cur;
}

function injectTextIntoF058TcCell(tcXml: string, text: string): string {
  const next = tcXml.replace(
    /<w:p\b([^>]*)>(<w:pPr>[\s\S]*?<\/w:pPr>)(\s*)<\/w:p>/,
    (_full, pAttrs: string, pPr: string, space: string) => {
      const rPr =
        '<w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:cs="Tahoma"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
      const body = text ? `<w:r>${rPr}<w:t>${text}</w:t></w:r>` : '';
      return `<w:p${pAttrs}>${pPr}${space}${body}</w:p>`;
    }
  );
  return next;
}

/** F058 tablosu: başlık satırı + tek veri satırı (docxtemplater satirlar döngüsü). */
function buildF058LoopRowFromSample(sampleDataRowXml: string): string {
  const cells = sampleDataRowXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  if (cells.length < 5) return sampleDataRowXml;
  const tags = ['{#satirlar}{tarih}', '{saat}', '{h1} / {h2}{/satirlar}', '', ''];
  const newCells = cells.map((tc, i) => injectTextIntoF058TcCell(tc, tags[i] ?? ''));
  const trOpen = sampleDataRowXml.match(/^<w:tr\b[^>]*>/)?.[0] ?? '<w:tr>';
  return trOpen + newCells.join('') + '</w:tr>';
}

/**
 * Şablonda {#satirlar} yoksa: ilk tabloda yalnızca başlık + tek döngü satırı bırakır (yüzlerce boş satır docxtemplater’ı kilitler).
 * Zaten döngü varsa dokunmaz.
 */
export function slimF058TableInjectLoopRow(documentXml: string): string {
  if (documentXml.includes('{#satirlar}')) return documentXml;
  const tblRe = /<w:tbl>([\s\S]*?)<\/w:tbl>/;
  const tblMatch = documentXml.match(tblRe);
  if (!tblMatch) return documentXml;
  const inner = tblMatch[1];
  const firstTrIdx = inner.indexOf('<w:tr');
  if (firstTrIdx < 0) return documentXml;
  const prefix = inner.slice(0, firstTrIdx);
  const fromTr = inner.slice(firstTrIdx);
  const rows = [...fromTr.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (rows.length < 2) return documentXml;
  const loopRow = buildF058LoopRowFromSample(rows[1]);
  const newInner = prefix + rows[0] + loopRow;
  return documentXml.replace(tblMatch[0], `<w:tbl>${newInner}</w:tbl>`);
}

type PizZipLike = {
  files: Record<string, { dir?: boolean }>;
  file(path: string): { asText(): string } | null;
  file(path: string, data: string): void;
};

export function prepareF058DocxZipForRender(zip: PizZipLike): void {
  const names = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  for (const f of names) {
    if (f !== 'word/document.xml' && !/^word\/header\d+\.xml$/i.test(f) && !/^word\/footer\d+\.xml$/i.test(f)) {
      continue;
    }
    const entry = zip.file(f);
    if (!entry) continue;
    let xml = entry.asText();
    xml = mergeSplitBracePlaceholders(xml);
    if (f === 'word/document.xml') xml = slimF058TableInjectLoopRow(xml);
    zip.file(f, xml);
  }
}

const OLE_DOC_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * .docx uzantılı ama içi hâlâ eski Word binary (.doc) olan dosyalar sık görülür (yeniden adlandırma veya hatalı dönüştürme).
 * Geçerli OOXML’de ZIP içinde word/document.xml bulunur.
 */
export function docxBufferIssueTr(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE_DOC_MAGIC)) {
    return (
      'Dosya uzantısı .docx olsa bile içerik eski Word (.doc) formatındadır; yalnızca yeniden adlandırılmış olabilir. ' +
      'Microsoft Word ile açın → Dosya → Farklı Kaydet → “Word Belgesi (*.docx)” seçip kaydedin (dönüştürme böyle yapılır).'
    );
  }
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return 'Dosya geçerli bir Word .docx (ZIP) arşivi gibi görünmüyor.';
  }
  try {
    const PizZip = require('pizzip');
    const zip = new PizZip(buf);
    const files = zip.files as Record<string, { dir?: boolean }>;
    if (files['word/document.xml']) return null;
    const hasWord = Object.keys(files).some((k) => k.startsWith('word/'));
    if (!hasWord) {
      return (
        'Bu dosyada word/document.xml yok; OOXML formu eksik (çoğunlukla .doc’nun .docx diye kaydedilmesi veya bozuk dönüştürme). ' +
        'Word’de formu açıp tekrar “Word Belgesi (.docx)” olarak farklı kaydedin; ardından yer tutucuları ekleyin.'
      );
    }
    return 'word/document.xml bulunamadı; .docx paketi beklenen yapıda değil.';
  } catch {
    return 'Dosya ZIP olarak açılamadı; bozuk veya tam olmayan .docx olabilir.';
  }
}

export async function renderF058DocxWithDocxtemplater(
  templatePath: string,
  data: Record<string, unknown>
): Promise<Buffer> {
  const PizZip = require('pizzip');
  const Docxtemplater = require('docxtemplater');
  const buf = await fs.promises.readFile(templatePath);
  const issue = docxBufferIssueTr(buf);
  if (issue) throw new Error(issue);
  const zip = new PizZip(buf);
  prepareF058DocxZipForRender(zip as PizZipLike);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });
  doc.render(data);
  return Buffer.from(doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
