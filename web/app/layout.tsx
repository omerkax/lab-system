import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "Alibey Lab ERP",
  description: "Alibey Beton Çeliği Laboratuvar Yönetim Sistemi",
  /** app/icon.png (marka) — sekme / PWA apple ikonları */
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
};

function resolveLabBaseUrl(envBase: string, requestOrigin: string): string {
  const e = envBase.trim();
  const d = requestOrigin.trim();
  if (!e && d) return d;
  if (!e) return "";
  if (!d) return e;
  try {
    const envHost = new URL(e).hostname.toLowerCase();
    const reqHost = new URL(d).hostname.toLowerCase();
    // Özel domaine geçildiğinde Vercel’de unutulmuş *.vercel.app env → yanlış hosta istek (yavaş / boş veri)
    if (/\.vercel\.app$/i.test(envHost) && !/\.vercel\.app$/i.test(reqHost)) return d;
  } catch {
    /* ignore */
  }
  return e;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const xfHost = h.get("x-forwarded-host");
  const host = (xfHost?.split(",")[0]?.trim() || h.get("host") || "").trim();
  const xfProto = h.get("x-forwarded-proto");
  const proto = (xfProto?.split(",")[0]?.trim() || "https").trim();
  const requestOrigin = host ? `${proto}://${host}` : "";

  const envBase = (
    process.env.NEXT_PUBLIC_LAB_BASE_URL ||
    process.env.NEXT_PUBLIC_EBISTR_PROXY_URL ||
    ""
  ).trim();

  const labBase = resolveLabBaseUrl(envBase, requestOrigin);

  return (
    <html lang="tr">
      <head>
        <link rel="stylesheet" href="/app.css?v=20260411-sidebar-logo" />
        <script
          id="lab-base-url"
          dangerouslySetInnerHTML={{
            __html: `window.__LAB_BASE_URL__=${JSON.stringify(labBase)};`,
          }}
        />
        <script src="/xlsx.js?v=20260410-1" defer />
        <script src="/app-core.js?v=20260415-fsgetdoc-quiet" defer />
        <script src="/app.js?v=20260415-fsgetdoc-quiet" defer />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
        <div id="toast" className="toast"></div>
      </body>
    </html>
  );
}
