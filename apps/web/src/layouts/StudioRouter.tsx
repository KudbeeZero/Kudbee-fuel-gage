import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { StudioLayout, type StudioTabId } from './StudioLayout';
import { Loader2 } from 'lucide-react';
import { DeepLinkContext } from '../contexts/DeepLinkContext';

const GovernancePanel = lazy(() => import('../components/studio/GovernancePanel').then((m) => ({ default: m.GovernancePanel })));
const ThinkTokensPanel = lazy(() => import('../components/studio/ThinkTokensPanel').then((m) => ({ default: m.ThinkTokensPanel })));
const TelemetryPanel = lazy(() => import('../components/studio/TelemetryPanel').then((m) => ({ default: m.TelemetryPanel })));
const FirewallPanel = lazy(() => import('../components/studio/FirewallPanel').then((m) => ({ default: m.FirewallPanel })));

const TAB_ID_TO_PATH: Record<StudioTabId, string> = {
  governance: '/tower/governance',
  tokens: '/tower/tokens',
  telemetry: '/tower/telemetry',
  firewall: '/tower/firewall'
};

const PATH_TO_TAB_ID: Record<string, StudioTabId> = {
  '/tower/governance': 'governance',
  '/tower/tokens': 'tokens',
  '/tower/telemetry': 'telemetry',
  '/tower/firewall': 'firewall'
};

function PanelFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      <span className="ml-3 font-mono text-xs text-slate-400">Loading panel…</span>
    </div>
  );
}

function StudioShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentPath = location.pathname;
  const activeTab: StudioTabId = PATH_TO_TAB_ID[currentPath] ?? 'telemetry';

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && TAB_ID_TO_PATH[tabParam as StudioTabId] && PATH_TO_TAB_ID[currentPath] !== tabParam) {
      navigate(TAB_ID_TO_PATH[tabParam as StudioTabId] + location.search, { replace: true });
    }
  }, [searchParams, currentPath, navigate, location.search]);

  const handleTabChange = (tab: StudioTabId) => {
    navigate(TAB_ID_TO_PATH[tab] + location.search);
  };

  const deepLinkLogId = searchParams.get('logId') ?? undefined;

  return (
    <DeepLinkContext.Provider value={{ logId: deepLinkLogId, tab: activeTab }}>
    <StudioLayout activeTab={activeTab} onTabChange={handleTabChange}>
      <Suspense fallback={<PanelFallback />}>
        <Routes>
          <Route path="/" element={<GovernancePanel />} />
          <Route path="/governance" element={<GovernancePanel />} />
          <Route path="/tokens" element={<ThinkTokensPanel />} />
          <Route path="/telemetry" element={<TelemetryPanel />} />
          <Route path="/firewall" element={<FirewallPanel />} />
        </Routes>
      </Suspense>
    </StudioLayout>
    </DeepLinkContext.Provider>
  );
}

export function StudioRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<StudioShell />} />
      </Routes>
    </BrowserRouter>
  );
}
