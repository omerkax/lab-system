'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  DEFAULT_ADMIN_ROLE,
  GUEST_ROLE,
  LAB_SESSION_KEY,
  labUserCanChipNotify,
  moduleAccessLevel,
  readLabSession,
  type LabRoleDoc,
} from '@/lib/lab-auth';

/** app.js personel kayıtları için: window.__LAB_PERSONEL_ACCESS__ = 'none' | 'view' | 'edit' */
export default function PersonelAccessBridge() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const w = window as any;
      if (typeof w.fsGet !== 'function') {
        setTimeout(run, 120);
        return;
      }
      const session = readLabSession();
      if (!session) {
        if (!cancelled) {
          w.__LAB_PERSONEL_ACCESS__ = 'none';
          delete w.__LAB_PERSONEL_SELF_ID__;
          w.__LAB_CAN_MAIL__ = false;
          w.__LAB_CAN_SMS__ = false;
        }
        return;
      }
      const users: any[] = (await w.fsGet('lab_users').catch(() => [])) || [];
      const rRows: any[] = (await w.fsGet('lab_roles').catch(() => [])) || [];
      const rm: Record<string, LabRoleDoc> = {};
      rRows.forEach((r: any) => {
        if (r?.id && !r._silindi) rm[r.id] = r as LabRoleDoc;
      });
      if (!rm.admin) rm.admin = DEFAULT_ADMIN_ROLE;
      const u = users.find((x: any) => String(x.id) === session.userId);
      const role = u ? rm[u.roleId || 'admin'] || DEFAULT_ADMIN_ROLE : GUEST_ROLE;
      let level = moduleAccessLevel(role, 'personel');
      /** hr_personnel ile bağlı giriş: başkalarının bordrosu/özlüğü yok; düzenleme yok */
      const selfPid = String(u?.personelId || session.personelId || '').trim();
      if (selfPid) {
        if (!cancelled) w.__LAB_PERSONEL_SELF_ID__ = selfPid;
        if (level === 'edit') level = 'view';
      } else if (!cancelled) {
        delete w.__LAB_PERSONEL_SELF_ID__;
      }
      if (!cancelled) {
        w.__LAB_PERSONEL_ACCESS__ = level;
        const canNotify = labUserCanChipNotify(u, role, session.userId);
        w.__LAB_CAN_MAIL__ = canNotify;
        w.__LAB_CAN_SMS__ = canNotify;
      }
    };
    void run();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAB_SESSION_KEY) void run();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname]);

  return null;
}
