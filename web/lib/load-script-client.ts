/**
 * next/script yerine dinamik yükleme — React 19 “script in component” uyarısından kaçınmak için.
 */

export function loadScriptOnce(src: string, id: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Script yüklenemedi: ${src}`));
    document.body.appendChild(s);
  });
}

/** EBİSTR modülü — tek kez; farklı sayfalar aynı id ile paylaşır */
export function ensureEbistrScript(src: string): Promise<void> {
  return loadScriptOnce(src, 'lab-ebistr-js');
}

export async function loadScriptChain(srcs: readonly string[], idPrefix: string): Promise<void> {
  for (let i = 0; i < srcs.length; i++) {
    await loadScriptOnce(srcs[i]!, `${idPrefix}-${i}`);
  }
}
