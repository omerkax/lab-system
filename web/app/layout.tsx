import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "Alibey Lab ERP",
  description: "Alibey Beton Çeliği Laboratuvar Yönetim Sistemi",
  icons: {
    icon: "/brand-logo.png",
    apple: "/brand-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const labBase = (
    process.env.NEXT_PUBLIC_LAB_BASE_URL ||
    process.env.NEXT_PUBLIC_EBISTR_PROXY_URL ||
    ""
  ).trim();

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
        <script src="/app-core.js?v=20260410-1" defer />
        <script src="/app.js?v=20260412-netgsm-api" defer />
      </head>
      <body>
        <ClientLayout>{children}</ClientLayout>
        <div id="toast" className="toast"></div>
      </body>
    </html>
  );
}
