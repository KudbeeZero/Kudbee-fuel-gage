import * as React from 'react';
import { useLiveState } from '../../core/useLiveState';
import type { OSPlugin } from '../../core/pluginRegistry';

// Stream Lab wired: polls the agent-bridge endpoint so the plugin reflects
// live system state (agents, updatedAt, source) — not a static stub.
const LiveTelemetryView = () => {
  const state = useLiveState();
  return React.createElement(
    'div',
    { style: { padding: 16, fontFamily: 'ui-sans-serif,system-ui,sans-serif' } },
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 14, color: '#94a3b8' } },
      `Agent Fleet · ${state.agents.length} online`),
    state.error
      ? React.createElement('p', { style: { color: '#f87171', fontSize: 12 } }, `bridge error: ${state.error}`)
      : null,
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      state.agents.slice(0, 12).map((a: any) =>
        React.createElement('div', { key: a.id, style: { display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#0f172a', borderRadius: 6, fontSize: 12 } },
          React.createElement('span', { style: { color: '#e2e8f0' } }, a.id),
          React.createElement('span', { style: { color: '#34d399' } }, a.category ?? 'agent')))
    ),
    React.createElement('p', { style: { color: '#64748b', fontSize: 11, marginTop: 10 } },
      `source: ${state.source} · ${state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '—'}`)
  );
};

const LiveTelemetryPlugin: OSPlugin = {
  id: 'live-telemetry',
  name: 'Live Telemetry',
  description: 'Real-time agent fleet + telemetry (Stream Lab bridge)',
  icon: 'activity',
  category: 'telemetry',
  component: () => LiveTelemetryView,
  defaultRoute: '/os/live-telemetry',
};
export default LiveTelemetryPlugin;
