/** Sunucunun dış ağa çıkarken kullandığı IPv4 (NetGSM / ipify ile aynı çıkış yolu). */
export async function getOutboundIpv4(): Promise<{ ip: string; source: string } | null> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { ip?: string };
    const ip = String(j.ip || '').trim();
    if (!ip) throw new Error('empty');
    return { ip, source: 'api.ipify.org' };
  } catch {
    /* fallthrough */
  }
  try {
    const r = await fetch('https://ifconfig.me/ip', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const ip = (await r.text()).trim();
    if (!ip) throw new Error('empty');
    return { ip, source: 'ifconfig.me' };
  } catch {
    return null;
  }
}
