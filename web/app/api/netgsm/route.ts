import { NextRequest, NextResponse } from 'next/server';
import { getOutboundIpv4 } from '@/lib/server-egress-ip';

/**
 * NetGSM sunucu tarafı köprü — eski netgsm_proxy.php ile uyumlu (GET + text/plain).
 * Vercel’de PHP olmadığı için bakiye / gönder / rapor buradan çalışır.
 *
 * Sabit IP (NetGSM whitelist): Vercel çıkış IP’si değişebilir. `NETGSM_RELAY_URL` tanımlıysa
 * istek NetGSM yerine bu adrese aynı query ile gider (ör. `https://sunucunuz/netgsm_proxy.php`).
 * NetGSM panelinde yalnızca köprü sunucusunun IP’sini tanımlayın.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  /** Bakiye yanıtında X-Lab-Egress-Ipv4 okunabilsin (kod 30 teşhisi) */
  'Access-Control-Expose-Headers': 'X-Lab-Egress-Ipv4, X-Lab-Netgsm-Via',
};

const plain = { ...cors, 'Content-Type': 'text/plain; charset=utf-8' };

function withVia(headers: Record<string, string>, via: 'relay' | 'direct'): Record<string, string> {
  return { ...headers, 'X-Lab-Netgsm-Via': via };
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = sp.get('action') || 'balance';
  const user = (sp.get('usercode') || '').trim();
  const pass = (sp.get('password') || '').trim();
  if (!user || !pass) {
    return new NextResponse('ERROR|PARAMS_MISSING', { status: 400, headers: withVia({ ...plain }, 'direct') });
  }

  const relayBase = (process.env.NETGSM_RELAY_URL || '').trim();
  if (relayBase) {
    const search = req.nextUrl.search || '';
    const target =
      relayBase.includes('?') && search.startsWith('?')
        ? `${relayBase}&${search.slice(1)}`
        : `${relayBase}${search}`;
    try {
      const res = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: { Accept: 'text/plain, application/xml, */*' },
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      const h = withVia({ ...plain }, 'relay');
      if (!res.ok) {
        return new NextResponse(`ERROR|RELAY_HTTP_${res.status}`, { status: 200, headers: h });
      }
      return new NextResponse(text, { headers: h });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return new NextResponse(`ERROR|RELAY:${msg.slice(0, 120)}`, { status: 200, headers: withVia({ ...plain }, 'relay') });
    }
  }

  if (action === 'send') {
    const gsmno = sp.get('gsmno') ?? '';
    const message = sp.get('message') ?? '';
    const msgheader = sp.get('msgheader') ?? '';
    const url =
      'https://api.netgsm.com.tr/sms/send/get/?usercode=' +
      encodeURIComponent(user) +
      '&password=' +
      encodeURIComponent(pass) +
      '&gsmno=' +
      encodeURIComponent(gsmno) +
      '&message=' +
      encodeURIComponent(message) +
      '&msgheader=' +
      encodeURIComponent(msgheader) +
      '&dil=TR';
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const raw = (await res.text()).trim();
    const parts = raw.split(/\s+/, 2);
    const code = parts[0];
    if (code === '00' || code === '01' || code === '02') {
      const id = parts[1] != null ? parts[1].trim() : 'NO_ID';
      return new NextResponse(`SUCCESS|${id}`, { headers: withVia({ ...plain }, 'direct') });
    }
    const sendHeaders = withVia({ ...plain }, 'direct');
    if (code === '30' || raw.includes(' 30 ') || /^30\b/.test(raw)) {
      const eg = await getOutboundIpv4();
      if (eg?.ip) sendHeaders['X-Lab-Egress-Ipv4'] = eg.ip;
    }
    return new NextResponse(`ERROR|${raw}`, { headers: sendHeaders });
  }

  if (action === 'report') {
    const bulkid = sp.get('msgid') ?? '';
    const url =
      'https://api.netgsm.com.tr/sms/report?usercode=' +
      encodeURIComponent(user) +
      '&password=' +
      encodeURIComponent(pass) +
      '&bulkid=' +
      encodeURIComponent(bulkid) +
      '&type=0&status=100&version=2';
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const txt = (await res.text()).trim();
    let statusCode: string | null = null;
    const m = txt.match(/(?:^|[^\d])(11|12|13|14|0|1|2|3|4)(?:[^\d]|$)/);
    if (m) statusCode = m[1];
    if (statusCode === null || statusCode === '') statusCode = 'NA';
    return new NextResponse(`STATUS|${statusCode}|${txt}`, { headers: withVia({ ...plain }, 'direct') });
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><mainbody><header><usercode>' +
    xmlEscape(user) +
    '</usercode><password>' +
    xmlEscape(pass) +
    '</password><stip>1</stip><view>1</view></header></mainbody>';
  const res = await fetch('https://api.netgsm.com.tr/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
    body: xml,
    redirect: 'follow',
    cache: 'no-store',
  });
  const text = (await res.text()).trim();
  const balanceHeaders = withVia({ ...plain }, 'direct');
  if (/<code>\s*30\s*<\/code>/i.test(text) || /<code>30<\/code>/i.test(text)) {
    const eg = await getOutboundIpv4();
    if (eg?.ip) balanceHeaders['X-Lab-Egress-Ipv4'] = eg.ip;
  }
  return new NextResponse(text, { headers: balanceHeaders });
}
