This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Bu uygulama Git deposunda **`web/`** klasörünün içinde. Vercel projesinde **Settings → Build & Deployment → Root Directory** alanını **`web`** yapın; aksi halde kökteki `package.json` (proxy vb.) kaynak alınır ve Next.js bulunamaz.

Ardından [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) ile ortam değişkenlerini ekleyebilirsiniz.

**EBİSTR (Vercel):** `/var/task` salt okunur olduğu için önbellek, token ve **`/api/data`** ile **`/api/rapor`** / **`/api/sozlesme`** (JSON yazımları) aynı **`/tmp/alibey-ebistr-data`** kökünü kullanır. Kalıcı paylaşımlı depo için ileride harici DB önerilir. İsteğe bağlı **`EBISTR_DATA_DIR`**: yazma dizinini kendin belirle.

**`EBISTR_SERVER_TOKEN`:** Production’da EBİSTR JWT’sini Vercel env’e koy — `loadToken()` her process başında okur; soğuk başlangıçta dosya yoksa bile senkron çalışır.

**NetGSM (SMS):** Ayarlar / Çip tarafı **`/api/netgsm`** üzerinden çalışır (PHP `netgsm_proxy.php` yerine). Eski cPanel kurulumunda `.php` dosyası kullanılabilir.

İlk numune çekimi uzun sürer; API bazen **202** döner. Sunucu `@vercel/functions` **`waitUntil`** ile senkronu yanıttan sonra tamamlar; istemci **202** için birkaç kez yeniden dener. Hobby planda **maxDuration** üst sınırı düşük olabilir — büyük veri için Pro veya `EBISTR_SERVER_TOKEN` önerilir.
