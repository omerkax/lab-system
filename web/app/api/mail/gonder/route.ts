import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { LAB_LEGAL_NAME } from '@/lib/lab-brand';

type SmtpBody = {
  user?: string;
  pass?: string;
  host?: string;
  port?: number;
  secure?: boolean;
};

function createTransporter(smtp: SmtpBody) {
  const user = String(smtp?.user || '').trim();
  const pass = String(smtp?.pass || '').trim();
  const hasUserSmtp = user.length > 0 && pass.length > 0;

  if (hasUserSmtp) {
    const host = String(smtp.host || '').trim();
    if (host) {
      const port = Number(smtp.port) || 587;
      const secure = smtp.secure === true || port === 465;
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    }
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return null;
  }
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: { user: 'resend', pass: resendKey },
  });
}

function defaultFrom(smtp: SmtpBody, useResend: boolean): string {
  if (useResend) {
    return `"${LAB_LEGAL_NAME}" <alibeybetonlab@alibeylabtx.omerkaya.com.tr>`;
  }
  const u = String(smtp?.user || '').trim();
  return `"${LAB_LEGAL_NAME}" <${u}>`;
}

export async function POST(req: NextRequest) {
  try {
    const { mailler, smtp } = await req.json();
    if (!smtp?.user) {
      return NextResponse.json({ ok: false, err: 'Gönderici mail adresi eksik' }, { status: 400 });
    }
    if (!mailler?.length) {
      return NextResponse.json({ ok: false, err: 'Mail listesi boş' }, { status: 400 });
    }

    const pass = String(smtp.pass || '').trim();
    const useResend = !pass;
    const transporter = createTransporter(smtp as SmtpBody);
    if (!transporter) {
      return NextResponse.json(
        {
          ok: false,
          err:
            'SMTP şifresi (uygulama şifresi) gönderin veya sunucuda RESEND_API_KEY tanımlayın',
        },
        { status: 400 }
      );
    }

    const from = defaultFrom(smtp as SmtpBody, useResend);
    let gonderilen = 0;
    const hatalar: { konu?: string; hata: string }[] = [];
    for (const m of mailler) {
      try {
        await transporter.sendMail({
          from,
          to: m.to,
          subject: m.konu,
          html: m.html,
        });
        gonderilen++;
        await new Promise(r => setTimeout(r, 100));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        hatalar.push({ konu: m.konu, hata: msg });
      }
    }

    return NextResponse.json({ ok: true, gonderilen, hatalar });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, err: msg }, { status: 500 });
  }
}
