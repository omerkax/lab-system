import { NextResponse } from 'next/server';
import { getOutboundIpv4 } from '@/lib/server-egress-ip';

export const dynamic = 'force-dynamic';

/**
 * Bu isteği işleyen sunucunun dışarıya (ör. api.netgsm.com.tr) çıkarken kullandığı IP.
 * NetGSM panelinde “IP kısıtı” varsa burada dönen adresi tanımlayın — tarayıcı “what is my ip” değil.
 */
export async function GET() {
  const eg = await getOutboundIpv4();
  if (!eg) {
    return NextResponse.json({ ok: false, err: 'Dış IP servislerine ulaşılamadı' }, { status: 502 });
  }
  const { ip, source } = eg;
  return NextResponse.json({
    ok: true,
    ip,
    source,
    netgsmKod30: {
      tr:
        'Kod 30 yalnızca IP değil: (1) portal giriş şifresi değil — Abonelik > Alt Kullanıcı ile oluşturulan API kullanıcı adı/şifre, (2) Abonelik > API İşlemleri > API erişimi açık, (3) IP doğruysa geçici olarak IP kısıtını kapatıp deneyin; 00 olursa liste/ biçim sorunu.',
    },
    netgsm: {
      tr:
        'NetGSM → API İşlemleri bölümünde IP kısıtı varsa bu IPv4’ü ekleyin. İstek /api/netgsm üzerinden sunucuda yapılır.',
      en:
        'If NetGSM restricts by IP, allow this IPv4. Requests use the server egress IP.',
    },
    not: {
      tr:
        'Vercel’de çıkış IP’si zamanla değişebilir; NetGSM hâlâ 30 veriyorsa destek ile sabit aralık sorun.',
    },
  });
}
