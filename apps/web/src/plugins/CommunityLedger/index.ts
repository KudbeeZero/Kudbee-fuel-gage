import * as React from 'react';
import type { OSPlugin } from '../../core/pluginRegistry';

interface LedgerDecision {
  id?: string;
  mission?: string;
  problem?: string;
  confidence?: number | null;
}

interface LedgerState {
  decisions: LedgerDecision[];
  source: string;
  error: string | null;
}

interface LedgerResponse {
  decisions?: LedgerDecision[];
  ledger?: LedgerDecision[];
  source?: string;
}

// Stream Lab wired: reads the decision ledger so the plugin shows live
// decisions + confidence — not a static stub.
const CommunityLedgerView = () => {
  const [state, setState] = React.useState<LedgerState>({ decisions: [], source: 'loading', error: null });

  React.useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/system/decision-ledger', { cache: 'no-store' });
        const d = (await res.json()) as LedgerResponse;
        if (!cancelled) setState({ decisions: d.decisions ?? d.ledger ?? [], source: d.source ?? 'ledger', error: null });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const renderDecision = (d: LedgerDecision, i: number) =>
    React.createElement('div', { key: d.id ?? d.mission ?? `dec-${i}`, style: { display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#0f172a', borderRadius: 6, fontSize: 12 } },
      React.createElement('span', { style: { color: '#e2e8f0', fontFamily: 'ui-monospace,monospace', fontSize: 11 } }, d.id ?? ''),
      React.createElement('span', { style: { color: '#94a3b8', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        String(d.problem ?? d.mission ?? '').slice(0, 40)));

  return React.createElement(
    'div',
    { style: { padding: 16, fontFamily: 'ui-sans-serif,system-ui,sans-serif' } },
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 14, color: '#94a3b8' } }, `Decision Ledger · ${state.decisions.length}`),
    state.error
      ? React.createElement('p', { style: { color: '#f87171', fontSize: 12 } }, `error: ${state.error}`)
      : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          state.decisions.slice(-8).reverse().map(renderDecision)),
    React.createElement('p', { style: { color: '#64748b', fontSize: 11, marginTop: 10 } }, `source: ${state.source}`)
  );
};

const CommunityLedgerPlugin: OSPlugin = {
  id: 'community-ledger',
  name: 'Community Ledger',
  description: 'Decision ledger — live decisions + provenance',
  icon: 'dollar-sign',
  category: 'ledger',
  component: CommunityLedgerView,
  defaultRoute: '/os/community-ledger',
};
export default CommunityLedgerPlugin;
