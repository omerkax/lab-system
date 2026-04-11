import { NextResponse } from 'next/server';
import { getStatus, getCache, syncTelemetriOnly } from '@/lib/ebistr-engine';

// /api/telemetri → local engine'den durum döner (Railway gerekmez)
export async function GET() {
  try {
    const status = getStatus();
    const cache = getCache();
    const now = Date.now();
    const lastSyncMs = cache.lastTelemetrySync ? new Date(cache.lastTelemetrySync).getTime() : 0;
    const stale = !lastSyncMs || Number.isNaN(lastSyncMs) || (now - lastSyncMs) > 55_000;
    // Cache boşsa veya 55 sn'den eskiyse arka planda telemetri sync tetikle
    if (status.loggedIn && (!cache.telemetry?.length || stale)) {
      syncTelemetriOnly().catch(console.error);
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
