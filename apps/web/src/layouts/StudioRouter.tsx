import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { StudioLayout, type StudioTabId } from './StudioLayout';
import { WorkspaceRecoveryBoundary } from '../components/WorkspaceRecoveryBoundary';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary';
import { Loader2 } from 'lucide-react';

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
  const currentPath = location.pathname;
  const activeTab: StudioTabId = PATH_TO_TAB_ID[currentPath] ?? 'telemetry';

  const handleTabChange = (tab: StudioTabId) => {
    navigate(TAB_ID_TO_PATH[tab]);
  };

  return (
    <WorkspaceRecoveryBoundary panel="Studio Layout">
      <StudioLayout activeTab={activeTab} onTabChange={handleTabChange}>
        <Suspense fallback={<PanelFallback />}>
          <Routes>
            <Route path="/" element={<PanelErrorBoundary panel="GovernancePanel"><GovernancePanel /></PanelErrorBoundary>} />
            <Route path="/governance" element={<PanelErrorBoundary panel="GovernancePanel"><GovernancePanel /></PanelErrorBoundary>} />
            <Route path="/tokens" element={<PanelErrorBoundary panel="ThinkTokensPanel"><ThinkTokensPanel /></PanelErrorBoundary>} />
            <Route path="/telemetry" element={<PanelErrorBoundary panel="TelemetryPanel"><TelemetryPanel /></PanelErrorBoundary>} />
            <Route path="/firewall" element={<PanelErrorBoundary panel="FirewallPanel"><FirewallPanel /></PanelErrorBoundary>} />
          </Routes>
        </Suspense>
      </StudioLayout>
    </WorkspaceRecoveryBoundary>
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
