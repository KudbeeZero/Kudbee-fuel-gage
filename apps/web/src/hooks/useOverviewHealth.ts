import { useCallback, useMemo } from 'react';
import { useGovernanceHealth } from './useGovernanceHealth';
import { useOsSnapshot } from '../components/OsStreamProvider';
import { useSystemDiagnostics } from './useSystemDiagnostics';

export type OverviewState = 'healthy' | 'degraded' | 'offline' | 'unknown';
export type IncidentSeverity = 'critical' | 'warning' | 'info';

export interface HealthSignal {
  id: string;
  label: string;
  state: OverviewState;
  detail: string;
  latencyMs: number | null;
  freshnessLabel: string;
  durabilityLabel: string;
  sourceLabel: string;
  actionLabel: string;
  actionTab: string;
}

export interface OverviewIncident {
  id: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  sourceLabel: string;
  observedLabel: string;
  actionLabel: string;
  actionTab: string;
}

export interface OverviewHealth {
  overallState: OverviewState;
  overallLabel: string;
  freshnessLabel: string;
  durabilityLabel: string;
  signals: HealthSignal[];
  incidents: OverviewIncident[];
  pendingApprovals: number;
  alerts: number;
  observedAt: string | null;
}

function normalizeState(value: string | undefined, fallback: OverviewState): OverviewState {
  const normalized = value?.toLowerCase();
  if (normalized === 'healthy' || normalized === 'ok' || normalized === 'online') return 'healthy';
  if (normalized === 'degraded' || normalized === 'warning') return 'degraded';
  if (normalized === 'offline' || normalized === 'down' || normalized === 'error') return 'offline';
  return fallback;
}

function formatFreshness(timestamp: string | null, connected: boolean): string {
  if (!timestamp) return connected ? 'Live now' : 'Unavailable';

  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (ageSeconds < 10) return 'Live now';
  if (ageSeconds < 60) return `Updated ${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `Updated ${Math.floor(ageSeconds / 60)}m ago`;
  return 'Stale';
}

function formatObservedAt(timestamp: string | null): string {
  if (!timestamp) return 'No observation recorded';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Observation time unavailable' : date.toLocaleTimeString();
}

export function useOverviewHealth() {
  const diagnosticsState = useSystemDiagnostics();
  const governanceState = useGovernanceHealth(15000);
  const { snapshot, connected, error: streamError } = useOsSnapshot();

  const overview = useMemo<OverviewHealth>(() => {
    const diagnostics = diagnosticsState.diagnostics;
    const diagnosticsTimestamp = diagnostics?.timestamp || null;
    const streamTimestamp = snapshot.ts || null;
    const observedAt = diagnosticsTimestamp || streamTimestamp;
    const diagnosticsAvailable = diagnostics !== null;
    const hasStreamSignal = connected || Boolean(streamTimestamp);
    const postgresState = diagnosticsAvailable
      ? normalizeState(diagnostics.services.postgres.status, 'unknown')
      : hasStreamSignal
        ? (snapshot.services.postgres.ok ? 'healthy' : 'degraded')
        : 'unknown';
    const redisState = diagnosticsAvailable
      ? normalizeState(diagnostics.services.redis.status, 'unknown')
      : hasStreamSignal
        ? (snapshot.services.redis.ok ? 'healthy' : 'degraded')
        : 'unknown';
    const streamState: OverviewState = connected ? 'healthy' : streamTimestamp ? 'degraded' : 'unknown';
    const governanceStateValue: OverviewState = governanceState.health.governanceActive
      ? 'healthy'
      : governanceState.loading
        ? 'unknown'
        : 'degraded';
    const diagnosticsFreshness = formatFreshness(diagnosticsTimestamp, diagnosticsAvailable);
    const streamFreshness = formatFreshness(streamTimestamp, connected);
    const governanceFreshness = formatFreshness(governanceState.health.timestamp || null, governanceState.health.governanceActive);

    const signals: HealthSignal[] = [
      {
        id: 'postgres',
        label: 'Postgres',
        state: postgresState,
        detail: diagnostics?.services.postgres.status || (hasStreamSignal ? 'Stream probe' : 'Waiting for probe'),
        latencyMs: diagnostics?.services.postgres.latencyMs ?? snapshot.services.postgres.latencyMs,
        freshnessLabel: diagnosticsFreshness,
        durabilityLabel: 'Current probe',
        sourceLabel: 'System diagnostics',
        actionLabel: 'Inspect observability',
        actionTab: 'OBSERVABILITY',
      },
      {
        id: 'redis',
        label: 'Redis',
        state: redisState,
        detail: diagnostics?.services.redis.status || (hasStreamSignal ? 'Stream probe' : 'Waiting for probe'),
        latencyMs: diagnostics?.services.redis.latencyMs ?? snapshot.services.redis.latencyMs,
        freshnessLabel: diagnosticsFreshness,
        durabilityLabel: 'Current probe',
        sourceLabel: 'System diagnostics',
        actionLabel: 'Inspect observability',
        actionTab: 'OBSERVABILITY',
      },
      {
        id: 'os-stream',
        label: 'OS stream',
        state: streamState,
        detail: connected ? 'Snapshot events arriving' : streamError || 'Waiting for snapshot events',
        latencyMs: null,
        freshnessLabel: streamFreshness,
        durabilityLabel: 'Live, non-durable',
        sourceLabel: 'SSE snapshot stream',
        actionLabel: 'Open control tower',
        actionTab: 'CONTROL TOWER',
      },
      {
        id: 'governance',
        label: 'Governance',
        state: governanceStateValue,
        detail: governanceState.health.governanceActive
          ? `${governanceState.health.proposedCount} proposal${governanceState.health.proposedCount === 1 ? '' : 's'} pending`
          : governanceState.health.hermes.status,
        latencyMs: null,
        freshnessLabel: governanceFreshness,
        durabilityLabel: 'Current poll',
        sourceLabel: 'Governance health poll',
        actionLabel: 'Review governance',
        actionTab: 'GOVERNANCE',
      },
    ];

    const incidents: OverviewIncident[] = [];
    if (postgresState === 'offline' || postgresState === 'degraded') {
      incidents.push({
        id: 'postgres-health',
        severity: postgresState === 'offline' ? 'critical' : 'warning',
        title: `Postgres is ${postgresState}`,
        detail: 'The system report does not show a healthy database connection. Inspect diagnostics before relying on new telemetry.',
        sourceLabel: 'System diagnostics',
        observedLabel: formatObservedAt(diagnosticsTimestamp),
        actionLabel: 'Inspect diagnostics',
        actionTab: 'OBSERVABILITY',
      });
    }
    if (redisState === 'offline' || redisState === 'degraded') {
      incidents.push({
        id: 'redis-health',
        severity: redisState === 'offline' ? 'critical' : 'warning',
        title: `Redis is ${redisState}`,
        detail: 'Queue and cache-backed actions may be delayed or unavailable. Confirm the runtime path before retrying work.',
        sourceLabel: 'System diagnostics',
        observedLabel: formatObservedAt(diagnosticsTimestamp),
        actionLabel: 'Inspect diagnostics',
        actionTab: 'OBSERVABILITY',
      });
    }
    if (!connected && streamTimestamp) {
      incidents.push({
        id: 'stream-disconnected',
        severity: 'warning',
        title: 'Live OS stream disconnected',
        detail: 'The last snapshot remains visible, but it is not a current health signal. Reconnect before treating the overview as live.',
        sourceLabel: 'SSE snapshot stream',
        observedLabel: formatObservedAt(streamTimestamp),
        actionLabel: 'Open control tower',
        actionTab: 'CONTROL TOWER',
      });
    }
    if (governanceState.health.proposedCount > 0) {
      incidents.push({
        id: 'governance-review',
        severity: 'info',
        title: `${governanceState.health.proposedCount} governance review${governanceState.health.proposedCount === 1 ? '' : 's'} pending`,
        detail: 'A human decision is available. Review the proposal before continuing work that depends on it.',
        sourceLabel: 'Governance health poll',
        observedLabel: formatObservedAt(governanceState.health.timestamp || null),
        actionLabel: 'Review proposal',
        actionTab: 'GOVERNANCE',
      });
    }
    if (snapshot.alerts > 0) {
      incidents.push({
        id: 'active-alerts',
        severity: 'warning',
        title: `${snapshot.alerts} active alert${snapshot.alerts === 1 ? '' : 's'}`,
        detail: 'The OS snapshot reports unresolved alerts. Open the alert feed to inspect the current evidence.',
        sourceLabel: 'OS snapshot stream',
        observedLabel: formatObservedAt(streamTimestamp),
        actionLabel: 'Open alerts',
        actionTab: 'ALERTS',
      });
    }
    if (!diagnosticsAvailable && !hasStreamSignal && !diagnosticsState.loading) {
      incidents.push({
        id: 'no-health-source',
        severity: 'warning',
        title: 'No current health source',
        detail: 'The overview has no diagnostics response or live snapshot. Treat all status as unknown until a health check succeeds.',
        sourceLabel: 'Overview aggregation',
        observedLabel: 'No observation recorded',
        actionLabel: 'Inspect diagnostics',
        actionTab: 'OBSERVABILITY',
      });
    }

    const hasOffline = signals.some((signal) => signal.state === 'offline');
    const hasDegraded = signals.some((signal) => signal.state === 'degraded') || incidents.some((incident) => incident.severity === 'warning');
    const hasUnknown = signals.some((signal) => signal.state === 'unknown');
    const overallState: OverviewState = hasOffline
      ? 'offline'
      : hasDegraded
        ? 'degraded'
        : hasUnknown
          ? 'unknown'
          : 'healthy';

    return {
      overallState,
      overallLabel: overallState === 'healthy' ? 'Ready' : overallState === 'degraded' ? 'Needs attention' : overallState === 'offline' ? 'Offline' : 'Waiting for signal',
      freshnessLabel: diagnosticsAvailable ? diagnosticsFreshness : streamFreshness,
      durabilityLabel: diagnosticsAvailable ? 'Current server probes' : hasStreamSignal ? 'Stream-only' : 'No signal',
      signals,
      incidents,
      pendingApprovals: governanceState.health.proposedCount,
      alerts: snapshot.alerts,
      observedAt,
    };
  }, [connected, diagnosticsState.diagnostics, diagnosticsState.loading, governanceState.health, governanceState.loading, snapshot, streamError]);

  const refresh = useCallback(async () => {
    await Promise.all([diagnosticsState.refresh(), governanceState.refresh()]);
  }, [diagnosticsState.refresh, governanceState.refresh]);

  return {
    overview,
    loading: diagnosticsState.loading || governanceState.loading,
    error: diagnosticsState.error || streamError,
    refreshing: diagnosticsState.running,
    refresh,
  };
}
