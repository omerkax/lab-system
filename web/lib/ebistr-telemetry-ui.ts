/**
 * EBİSTR telemetryData satırlarını havuz kartlarına ayırırken kullanılan sezgisel filtre.
 * API’de sensör adı İngilizce/Türkçe karışık veya kısaltılmış olabilir.
 */

function havuzNoFromDeptName(name: string): '1' | '2' | null {
  const n = String(name ?? '');
  if (/-1\b/.test(n) || /-1$/i.test(n)) return '1';
  if (/-2\b/.test(n) || /-2$/i.test(n)) return '2';
  return null;
}

export function telemetryRowIsLikelyPoolTemp(item: any): boolean {
  const sObj = item?.sensor || {};
  const sensorName = String(sObj.name ?? '');
  const sensorDesc = String(sObj.description ?? '');
  const code = String((sObj as { code?: string }).code ?? (sObj as { sensorCode?: string }).sensorCode ?? '');
  const deptName = String(item?.department?.name ?? '');
  const hayEn = `${sensorName} ${sensorDesc} ${code} ${deptName}`.toLowerCase();
  let hayTr = hayEn;
  try {
    hayTr = `${sensorName} ${sensorDesc} ${code} ${deptName}`.toLocaleLowerCase('tr-TR');
  } catch {
    /* ignore */
  }
  const hay = `${hayEn} ${hayTr}`;
  if (/humidity|moisture|\bnem\b|batarya|battery|pressure|basınç|basinc/i.test(hay)) {
    return false;
  }

  const keyword =
    hay.includes('temperature') ||
    hay.includes('therm') ||
    hay.includes('temp') ||
    hay.includes('sıcaklık') ||
    hay.includes('sicaklik') ||
    hay.includes('ısı') ||
    hay.includes('isi') ||
    hay.includes('°c') ||
    hay.includes('derece');

  const ts = item?.timestamp;
  const v = item?.value;
  const valNum = Number(v);
  const hasReading =
    ts != null && v != null && String(v).trim() !== '' && Number.isFinite(valNum);

  const no = havuzNoFromDeptName(deptName);
  const gatewayId = item?.gateway?.id;

  if (keyword && (no != null || gatewayId === 1416859)) return true;
  if (hasReading && no != null) return true;
  if (hasReading && gatewayId === 1416859) return true;
  return false;
}
