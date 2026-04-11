/**
 * EBİSTR’de aynı BRN altında birden fazla fiziksel numune olur.
 * Eski birleştirme sadece brnNo/labReportNo kullandığı için öğleden sonra eklenen
 * örnekler "zaten var" sanılıp diske hiç eklenmiyordu.
 */
export function ebistrNumuneRowKey(item: any): string {
  const cg = item.curingGun ?? item.curingTime?.id ?? '';
  const take = String(item.takeDate ?? item.alinisZamani ?? item.alinisDate ?? '').trim();
  return [
    String(item.brnNo ?? '').trim(),
    String(item.labReportNo ?? item.labNo ?? '').trim(),
    take,
    String(item.takeTime ?? '').trim(),
    String(cg),
    String(item.yibf ?? '').trim(),
    String(item.irsaliye ?? '').trim(),
    String(item.breakDate ?? '').trim(),
    String(item.worksiteOutDate ?? '').trim(),
    String(item.cureDate ?? '').trim(),
    String(item.fc ?? '').trim(),
    String(item.state ?? '').trim(),
  ].join('\x1e');
}
