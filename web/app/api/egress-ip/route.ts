import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Bu isteği işleyen sunucunun dışarıya (ör. api.netgsm.com.tr) çıkarken kullandığı IP.
 * NetGSM panelinde “IP kısıtı” varsa burada dönen adresi tanımlayın — tarayıcı “what is my ip” değil.
 */
export async function GET() {
  const tryIpify = async (): Promise<{ ip: string; source: string }> => {
    const r = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`ipify ${r.status}`);
    const j = (await r.json()) as { ip?: string };
    const ip = String(j.ip || '').trim();
    if (!ip) throw new Error('ipify boş');
    return { ip, source: 'api.ipify.org' };
  };

  const tryIfconfig = async (): Promise<{ ip: string; source: string }> => {
    const r = await fetch('https://ifconfig.me/ip', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`ifconfig.me ${r.status}`);
    const ip = (await r.text()).trim();
    if (!ip) throw new Error('ifconfig.me boş');
    return { ip, source: 'ifconfig.me' };
  };

  let lastErr = '';
  for (const fn of [tryIpify, tryIfconfig]) {
    try {
      const { ip, source } = await fn();
      return NextResponse.json({
        ok: true,
        ip,
        source,
        netgsm: {
          tr:
            'NetGSM → Ayarlar / Güvenlik bölümünde IP kısıtı varsa bu IP’yi ekleyin. İstek lab sitenizden /api/netgsm üzerinden sunucuda yapıldığı için NetGSM’in gördüğü adres budur (bilgisayarınızın değil).',
          en:
            'If NetGSM restricts by IP, allow this address. SMS requests from your lab use the server egress IP, not your home/office browser IP.',
        },
        not: {
          tr:
            'Vercel’de IP bazen değişebilir; kısıt hâlâ patlıyorsa NetGSM’den “sabit çıkış” veya IP aralığı sorun. Enterprise / özel çıkış seçenekleri için Vercel dokümantasyonuna bakın.',
        },
      });
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(
    { ok: false, err: lastErr || 'Dış IP servislerine ulaşılamadı' },
    { status: 502 }
  );
}
