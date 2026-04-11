/**
 * Next.js Instrumentation — sunucu başlarken bir kez çalışır.
 * EBİSTR sync engine burada başlatılıyor.
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Sadece Node.js runtime'da çalış (Edge runtime'da değil)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initEbistrEngine } = await import('./lib/ebistr-engine');
    initEbistrEngine();
  }
}
