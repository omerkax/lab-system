import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getStatus, getCache, syncTelemetriOnly } from '@/lib/ebistr-engine';

function scheduleTelemetriSync(work: Promise<void>) {
  try {
    waitUntil(work);
  } catch {
    work.catch(console.error);
  }
}

// /api/telemetri → local engine'den durum döner (Railway gerekmez)
export async function GET() {
  try {
    const status = getStatus();
    const cache = getCache();
    const now = Date.now();
    const lastSyncMs = cache.lastTelemetrySync ? new Date(cache.lastTelemetrySync).getTime() : 0;
    const stale = !lastSyncMs || Number.isNaN(lastSyncMs) || (now - lastSyncMs) > 55_000;
    const empty = !cache.telemetry?.length;
    // Vercel: yanıt dönmeden önce arka plan kesilir; waitUntil + ilk dolgu için await
    if (status.loggedIn && (empty || stale)) {
      const work = syncTelemetriOnly();
      if (empty) await work;
      else scheduleTelemetriSync(work);
    }
    return NextResponse.json({
      ok: true,
      ...status,
      telemetry: cache.telemetry || [],
      alarms: cache.alarms || [],
      lastTelemetrySync: cache.lastTelemetrySync,
      lastAlarmSync: cache.lastAlarmSync
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
