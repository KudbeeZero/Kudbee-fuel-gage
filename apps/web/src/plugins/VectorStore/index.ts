import * as React from 'react';
import type { OSPlugin } from '../../core/pluginRegistry';

// Stream Lab wired: reads the knowledge-graph store via the bridge so the
// plugin shows live node/edge/orphan counts — not a static stub.
const VectorStoreView = () => {
  const [state, setState] = React.useState<any>({ nodes: 0, edges: 0, source: 'loading', error: null });
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/system/knowledge-graph', { cache: 'no-store' });
        const d = await res.json();
        if (!cancelled) setState({ nodes: d.nodes ?? d.nodeCount ?? 0, edges: d.edges ?? d.edgeCount ?? 0, source: 'graph', error: null });
      } catch (e) {
        if (!cancelled) setState((s: any) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return React.createElement(
    'div',
    { style: { padding: 16, fontFamily: 'ui-sans-serif,system-ui,sans-serif' } },
    React.createElement('h3', { style: { margin: '0 0 12px', fontSize: 14, color: '#94a3b8' } }, 'Knowledge Graph'),
    state.error
      ? React.createElement('p', { style: { color: '#f87171', fontSize: 12 } }, `error: ${state.error}`)
      : React.createElement(
          'div',
          { style: { display: 'flex', gap: 24, marginTop: 8 } },
          React.createElement('div', null, React.createElement('div', { style: { fontSize: 26, fontWeight: 800, color: '#60a5fa' } }, String(state.nodes)),
            React.createElement('div', { style: { fontSize: 11, color: '#64748b' } }, 'nodes')),
          React.createElement('div', null, React.createElement('div', { style: { fontSize: 26, fontWeight: 800, color: '#a78bfa' } }, String(state.edges)),
            React.createElement('div', { style: { fontSize: 11, color: '#64748b' } }, 'edges')))
    ),
    React.createElement('p', { style: { color: '#64748b', fontSize: 11, marginTop: 12 } }, `source: ${state.source}`)
  );
};

const VectorStorePlugin: OSPlugin = {
  id: 'vector-store',
  name: 'Vector Store',
  description: 'pgvector knowledge graph — live node/edge state',
  icon: 'database',
  category: 'memory',
  component: () => VectorStoreView,
  defaultRoute: '/os/vector-store',
};
export default VectorStorePlugin;
