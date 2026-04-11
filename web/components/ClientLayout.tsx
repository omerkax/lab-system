'use client';
import { useState } from 'react';
import LabRouteGuard from './LabRouteGuard';
import PersonelAccessBridge from './PersonelAccessBridge';
import Sidebar from './Sidebar';
import TelemetriAlarmBanner from './TelemetriAlarmBanner';
import TelemetriPoller from './TelemetriPoller';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);

  return (
    <div className="app-wrap">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobOpen={mobOpen}
        setMobOpen={setMobOpen}
      />
      {mobOpen && (
        <div className="overlay on" onClick={() => setMobOpen(false)} />
      )}
      <main className={`main${collapsed ? ' sb-collapsed' : ''}`}>
        <PersonelAccessBridge />
        <LabRouteGuard>
        <TelemetriAlarmBanner />
        <div className="mob-head" suppressHydrationWarning>
          <button
            className="mob-menu-btn"
            suppressHydrationWarning
            onClick={() => setMobOpen(true)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd"/>
            </svg>
          </button>
          <span className="mob-title" suppressHydrationWarning>Alibey Lab</span>
        </div>
        {children}
        </LabRouteGuard>
      </main>
      <TelemetriPoller />
    </div>
  );
}
