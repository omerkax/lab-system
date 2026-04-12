import { NextRequest, NextResponse } from 'next/server';

/**
 * NetGSM sunucu tarafı köprü — eski netgsm_proxy.php ile uyumlu (GET + text/plain).
 * Vercel’de PHP olmadığı için bakiye / gönder / rapor buradan çalışır.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const plain = { ...cors, 'Content-Type': 'text/plain; charset=utf-8' };

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
    return new NextResponse('ERROR|PARAMS_MISSING', { status: 400, headers: plain });
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
    const res = await fetch(url, { redirect: 'follow' });
    const raw = (await res.text()).trim();
    const parts = raw.split(/\s+/, 2);
    const code = parts[0];
    if (code === '00' || code === '01' || code === '02') {
      const id = parts[1] != null ? parts[1].trim() : 'NO_ID';
      return new NextResponse(`SUCCESS|${id}`, { headers: plain });
    }
    return new NextResponse(`ERROR|${raw}`, { headers: plain });
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
    const res = await fetch(url, { redirect: 'follow' });
    const txt = (await res.text()).trim();
    let statusCode: string | null = null;
    const m = txt.match(/(?:^|[^\d])(11|12|13|14|0|1|2|3|4)(?:[^\d]|$)/);
    if (m) statusCode = m[1];
    if (statusCode === null || statusCode === '') statusCode = 'NA';
    return new NextResponse(`STATUS|${statusCode}|${txt}`, { headers: plain });
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
  });
  const text = (await res.text()).trim();
  return new NextResponse(text, { headers: plain });
}
