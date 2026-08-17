import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TerminalSquare,
  LayoutDashboard,
  Sparkles,
  Boxes,
  Monitor,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { StudioRouter } from './layouts/StudioRouter';
import { PanelErrorBoundary } from './components/PanelErrorBoundary';
import { apiGet, apiPost } from './lib/apiClient';
import { SystemPower } from './components/SystemPower';
import { BottomNav } from './components/thinkbox/BottomNav';
import { LoginView } from './components/LoginView';

const OverviewPage = lazy(() => import('./pages/overview').then((m) => ({ default: m.OverviewPage })));
const WorkspacePage = lazy(() => import('./pages/workspace').then((m) => ({ default: m.WorkspacePage })));
const ThinkboxPage = lazy(() => import('./pages/thinkbox').then((m) => ({ default: m.ThinkboxPage })));
const OllamaChat = lazy(() => import('./pages/OllamaChat').then((m) => ({ default: m.OllamaChat })));

interface LiveStats {
  pgHealthy: boolean;
  redisHealthy: boolean;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-slate-500 font-mono text-xs animate-pulse">Loading...</div>
    </div>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [liveStats, setLiveStats] = useState<LiveStats>({ pgHealthy: false, redisHealthy: false });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [session, setSession] = useState<null | { authenticated: boolean; role?: string }>(null);

  // Phase 5Q — SPA session gate: the backend remains authoritative; this is UX.
  useEffect(() => {
    apiGet<{ authenticated: boolean; role?: string }>('/api/session')
      .then((s) => setSession(s))
      .catch(() => setSession({ authenticated: false }));
  }, []);

  const handleLogout = async () => {
    try { await apiPost('/api/logout', {}); } catch { /* ignore */ }
    setSession({ authenticated: false });
  };

  if (session === null) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 font-sans flex items-center justify-center"><div className="text-slate-500 font-mono text-xs animate-pulse">Loading…</div></div>;
  }
  if (!session.authenticated) {
    return <LoginView onAuthenticate={() => apiGet<{ authenticated: boolean }>('/api/session').then(setSession).catch(() => setSession({ authenticated: false }))} />;
  }

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pollHealth = useCallback(async () => {
    try {
      const data = await apiGet<any>('/health');
      const deps = data?.dependencies || {};
      setLiveStats({
        pgHealthy: deps?.ingestion_db === 'healthy',
        redisHealthy: deps?.redis === 'healthy',
      });
    } catch {
      setLiveStats({ pgHealthy: false, redisHealthy: false });
    }
  }, []);

  useEffect(() => {
    void pollHealth();
    const id = setInterval(pollHealth, 10_000);
    return () => clearInterval(id);
  }, [pollHealth]);

  const tabs = [
    { icon: LayoutDashboard, label: 'OVERVIEW' },
    { icon: Sparkles, label: 'WORKSPACE' },
    { icon: Boxes, label: 'THINKBOX' },
    { icon: TerminalSquare, label: 'TERMINAL' },
    { icon: Monitor, label: 'STUDIO' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto relative">
        {/* Status bar */}
        <div className="sticky top-0 z-40">
          <SystemPower />
        </div>

        {/* Top nav — desktop only */}
        <div className="sticky top-12 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800/60 px-2 py-2 hidden md:block">
          <div className="max-w-7xl mx-auto">
            <div className="flex gap-1 md:gap-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.label;
                return (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTab(tab.label)}
                    className={`flex-1 min-w-0 px-1 md:px-3 py-2 rounded-lg text-[10px] md:text-xs font-mono font-semibold border transition-all active:scale-95 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]'
                        : 'border-slate-800/60 bg-slate-900/30 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1 md:gap-2">
                      <tab.icon className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-4 md:py-6">
          <Suspense fallback={<RouteFallback />}>
            {activeTab === 'OVERVIEW' && (
              <PanelErrorBoundary panel={activeTab}>
                <OverviewPage onNavigate={setActiveTab} />
              </PanelErrorBoundary>
            )}
            {activeTab === 'WORKSPACE' && (
              <PanelErrorBoundary panel={activeTab}>
                <WorkspacePage />
              </PanelErrorBoundary>
            )}
            {activeTab === 'THINKBOX' && (
              <PanelErrorBoundary panel={activeTab}>
                <ThinkboxPage />
              </PanelErrorBoundary>
            )}
            {activeTab === 'TERMINAL' && (
              <PanelErrorBoundary panel={activeTab}>
                <OllamaChat />
              </PanelErrorBoundary>
            )}
            {activeTab === 'STUDIO' && (
              <PanelErrorBoundary panel={activeTab}>
                <StudioRouter />
              </PanelErrorBoundary>
            )}
          </Suspense>
        </div>
      </main>

      {/* Status footer — hidden on mobile (space for BottomNav) */}
      {!isMobile && (
        <footer className="border-t border-slate-800/60 bg-slate-900/50 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-[9px] md:text-[10px] font-mono text-slate-600">
            <div className="flex items-center gap-3">
              <span className={liveStats.pgHealthy ? 'text-emerald-500' : 'text-rose-500'}>
                PG: {liveStats.pgHealthy ? 'OK' : 'DOWN'}
              </span>
              <span className={liveStats.redisHealthy ? 'text-emerald-500' : 'text-rose-500'}>
                RD: {liveStats.redisHealthy ? 'OK' : 'DOWN'}
              </span>
            </div>
            <span>KUDBEE v1.0 — THINK Protocol</span>
            <button
              onClick={handleLogout}
              className="px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
            >
              Logout
            </button>
          </div>
        </footer>
      )}

      {/* Bottom navigation — mobile only */}
      {isMobile && (
        <BottomNav
          active={activeTab as any}
          onChange={(tab) => setActiveTab(tab)}
        />
      )}
    </div>
  );
}

export default App;
