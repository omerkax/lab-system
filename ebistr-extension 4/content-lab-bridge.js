// Laboratuvar sitesi her yüklendiğinde depodaki JWT’yi sunucuya yeniden iletir
// (Vercel soğuk örnek, eski proxy URL veya extension yeniden başlama sonrası).
try {
  chrome.runtime.sendMessage({ action: 'syncToken', force: true });
} catch (e) {}
